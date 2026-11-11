const REF = /^[A-Za-z0-9.=-]{1,120}$/;

function reply(res, code, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(body);
}

/**
 * Read-only payment verification for the customer callback page.
 * Never change a reservation or record a payment based on this GET endpoint:
 * that must occur through the authenticated, idempotent server-side booking flow.
 */
export async function handlePaystackStatus(req, res, env = process.env, request = fetch) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return reply(res, 405, {error: 'Method not allowed'});
  }
  const ref = req.query?.reference;
  if (typeof ref !== 'string' || !REF.test(ref)) {
    return reply(res, 422, {error: 'Invalid payment reference'});
  }
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) {
    return reply(res, 503, {error: 'Payment verification is not configured'});
  }
  try {
    const upstream = await request('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), {
      method: 'GET',
      headers: {Authorization: 'Bearer ' + key, Accept: 'application/json'},
      signal: AbortSignal.timeout(10000)
    });
    if (upstream.status === 404) {
      return reply(res, 200, {paymentStatus: 'pending', bookingConfirmed: false});
    }
    if (!upstream.ok) {
      return reply(res, 503, {error: 'Unable to verify payment right now'});
    }
    const result = await upstream.json();
    const transaction = result?.data;
    if (result?.status !== true || transaction?.reference !== ref) {
      return reply(res, 503, {error: 'Unexpected payment verification response'});
    }
    if (transaction.domain && transaction.domain !== (key.startsWith('sk_live_') ? 'live' : 'test')) {
      return reply(res, 503, {error: 'Payment environment does not match'});
    }
    const state = transaction.status === 'success' ? 'verified'
      : ['failed', 'abandoned', 'reversed'].includes(transaction.status) ? 'failed'
      : 'pending';
    // Even after a verified payment, the reservation is NOT automatically confirmed.
    return reply(res, 200, {paymentStatus: state, bookingConfirmed: false});
  } catch {
    return reply(res, 503, {error: 'Unable to verify payment right now'});
  }
}
