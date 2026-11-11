import {supabaseUrl,supabaseServerKey,supabaseAdminHeaders} from './supabase-keys.js';
import {createHmac, timingSafeEqual} from 'node:crypto';

const MAX_BODY_BYTES = 128 * 1024;
const REFERENCE = /^[A-Za-z0-9.=-]{1,120}$/;

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
function matchesHmac(secret, content, signature) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(content).digest();
  const actual = Buffer.from(signature, 'hex');
  return timingSafeEqual(expected, actual);
}

export function validatePaystackSignature(rawBody, headers, env, now = Date.now()) {
  const modern = headers['paystack-signature'];
  const legacy = headers['x-paystack-signature'];
  if (env.PAYSTACK_WEBHOOK_SECRET && typeof modern === 'string') {
    const parts = modern.split(',').map(x => x.trim());
    const t = parts.find(x => /^t=\d+$/.test(x));
    if (!t) return false;
    const timestamp = Number(t.slice(2));
    if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
    const signatures = parts.filter(x => /^v1=whk_[A-Za-z0-9_-]+:[a-f0-9]{128}$/.test(x));
    const signed = Buffer.concat([Buffer.from(String(timestamp) + '.'), rawBody]);
    return signatures.some(x => matchesHmac(env.PAYSTACK_WEBHOOK_SECRET, signed, x.slice(x.indexOf(':') + 1)));
  }
  // Paystack's legacy signature remains supported until the signing-secret migration is complete.
  return !!env.PAYSTACK_SECRET_KEY && matchesHmac(env.PAYSTACK_SECRET_KEY, rawBody, legacy);
}

async function rawBodyOf(req) {
  const chunks = [];
  let count = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    count += data.length;
    if (count > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(data);
  }
  return Buffer.concat(chunks);
}

function respond(res, code, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(payload);
}

function configuredSupabase(env) {
  const base = supabaseUrl(env);
  return base && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) &&
    typeof supabaseServerKey(env) === 'string' && supabaseServerKey(env).length > 20
    ? base : null;
}

export async function handlePaystackWebhook(req, res, env = process.env, request = fetch, now = Date.now()) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, {error: 'Method not allowed'});
  }
  if (!env.PAYSTACK_SECRET_KEY && !env.PAYSTACK_WEBHOOK_SECRET)
    return respond(res, 503, {error: 'Paystack webhook not configured'});
  let rawBody;
  try {rawBody = await rawBodyOf(req);}
  catch {return respond(res, 413, {error: 'Webhook payload too large'});}
  const headers = {
    'paystack-signature': header(req, 'paystack-signature'),
    'x-paystack-signature': header(req, 'x-paystack-signature')
  };
  if (!validatePaystackSignature(rawBody, headers, env, now))
    return respond(res, 401, {error: 'Invalid webhook signature'});
  let event;
  try {event = JSON.parse(rawBody.toString('utf8'));}
  catch {return respond(res, 400, {error: 'Invalid webhook JSON'});}
  if (!event || typeof event !== 'object' || typeof event.event !== 'string')
    return respond(res, 400, {error: 'Invalid webhook event'});
  if (event.event !== 'charge.success') return respond(res, 200, {received: true, processed: false});
  const payment = event.data;
  if (!payment || typeof payment.reference !== 'string' || !REFERENCE.test(payment.reference))
    return respond(res, 422, {error: 'Invalid payment reference'});
  if (!env.PAYSTACK_SECRET_KEY)
    return respond(res, 503, {error: 'Paystack verification not configured'});
  const base = configuredSupabase(env);
  if (!base) return respond(res, 503, {error: 'Payment record storage not configured'});
  try {
    const verify = await request('https://api.paystack.co/transaction/verify/' + encodeURIComponent(payment.reference), {
      headers: {Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, Accept: 'application/json'},
      signal: AbortSignal.timeout(10000)
    });
    if (!verify.ok) return respond(res, 503, {error: 'Payment verification temporarily unavailable'});
    const result = await verify.json();
    const confirmed = result?.data;
    if (result?.status !== true || confirmed?.status !== 'success' ||
        confirmed?.reference !== payment.reference ||
        !Number.isSafeInteger(confirmed.amount) || confirmed.amount <= 0 ||
        !/^[A-Z]{3}$/.test(confirmed.currency || '') ||
        (payment.amount !== undefined && Number(payment.amount) !== confirmed.amount) ||
        (payment.currency !== undefined && payment.currency !== confirmed.currency))
      return respond(res, 422, {error: 'Payment details did not match Paystack verification'});
    const row = {
      reference: confirmed.reference,
      paystack_transaction_id: String(confirmed.id),
      amount_minor: confirmed.amount,
      currency: confirmed.currency,
      environment: confirmed.domain === 'live' ? 'live' : 'test',
      paid_at: confirmed.paid_at || null
    };
    // The database table has a primary key on reference. A replay can never produce another row.
    const stored = await request(base + '/rest/v1/paystack_verified_charges?on_conflict=reference', {
      method: 'POST',
      headers: {
        ...supabaseAdminHeaders(supabaseServerKey(env)),
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10000)
    });
    if (!stored.ok) return respond(res, 503, {error: 'Payment record could not be saved'});
    // Only our own hotel-UUID payment references are eligible for a room booking.
    // Other Paystack charges still get recorded, but cannot create a hotel reservation.
    let bookingStatus = 'not_a_hotel_checkout';
    if (/^hotel-[a-f0-9-]{36}$/.test(confirmed.reference)) {
      if (confirmed.domain && confirmed.domain !== (env.PAYSTACK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'))
        return respond(res, 422, {error: 'Payment mode mismatch'});
      const completed = await request(base + '/rest/v1/rpc/hotel_complete_checkout', {
        method: 'POST',
        headers: {
          ...supabaseAdminHeaders(supabaseServerKey(env)),
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          p_reference: confirmed.reference,
          p_amount_minor: confirmed.amount,
          p_currency: confirmed.currency
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!completed.ok) return respond(res, 503, {error: 'Booking reconciliation temporarily unavailable'});
      bookingStatus = await completed.json();
    }
    return respond(res, 200, {received: true, recorded: true, bookingStatus});
  } catch {
    return respond(res, 503, {error: 'Unable to process webhook'});
  }
}
