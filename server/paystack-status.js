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
    let bookingConfirmed=false;
    let receipt=null;
    let demoPurchase=false;
    // A Paystack success does not imply a room booking. Ask the hotel's actual
    // reservation record only for references created by Hotel OS.
    if (state === 'verified' && /^hotel-[a-f0-9-]{36}$/.test(ref)) {
      const base=env.SUPABASE_URL?.replace(/[/]$/, '');
      const service=env.SUPABASE_SERVICE_ROLE_KEY;
      if (base && base.startsWith('https://') && base.endsWith('.supabase.co') && base.split('/').length===3 && service?.length>20) {
        const check=await request(base+'/rest/v1/hotel_checkout_sessions?reference=eq.'+encodeURIComponent(ref)+'&select=status,amount_minor,currency&limit=1', {
          headers:{apikey:service,Authorization:'Bearer '+service,Accept:'application/json'},
          signal:AbortSignal.timeout(10000)
        });
        if (check.ok) {
          const rows=await check.json();
          const session=Array.isArray(rows)&&rows.length===1?rows[0]:null;
          const correctAmount=Number.isSafeInteger(transaction.amount)&&transaction.amount>0 &&
            session?.amount_minor===transaction.amount && session?.currency==='NGN' && transaction.currency==='NGN';
          if(correctAmount){
            bookingConfirmed=session.status==='verified';
            receipt={reference:ref,amountMinor:transaction.amount,currency:'NGN',paidAt:typeof transaction.paid_at==='string'&&transaction.paid_at.length<64?transaction.paid_at:null};
          }
        }
      }
    }
    // Sandbox receipts never claim a real hotel room. The webhook must first
    // have verified and recorded the exact test amount in the local ledger.
    if (state === 'verified' && /^hoteldemo-[a-f0-9-]{36}$/.test(ref) &&
        key.startsWith('sk_test_') && transaction.domain === 'test' &&
        transaction.amount === 100000 && transaction.currency === 'NGN' &&
        transaction.metadata?.hotel_os_demo === true) {
      demoPurchase=true;
      const base=env.SUPABASE_URL?.replace(/[/]$/, '');
      const service=env.SUPABASE_SERVICE_ROLE_KEY;
      if (base && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && service?.length>20) {
        const check=await request(base+'/rest/v1/paystack_verified_charges?reference=eq.'+encodeURIComponent(ref)+'&select=amount_minor,currency,environment&limit=1', {
          headers:{apikey:service,Authorization:'Bearer '+service,Accept:'application/json'},
          signal:AbortSignal.timeout(10000)
        });
        if(check.ok) {
          const rows=await check.json();
          if(Array.isArray(rows) && rows.length===1 &&
             rows[0].amount_minor===100000 && rows[0].currency==='NGN' &&
             rows[0].environment==='test') {
            receipt={reference:ref,amountMinor:100000,currency:'NGN',
              paidAt:typeof transaction.paid_at==='string'&&transaction.paid_at.length<64?transaction.paid_at:null};
          }
        }
      }
    }
    return reply(res, 200, demoPurchase ? {paymentStatus: state, bookingConfirmed: false, demoPurchase, ...(receipt ? {receipt} : {})} : receipt ? {paymentStatus: state, bookingConfirmed, receipt} : {paymentStatus: state, bookingConfirmed});
  } catch {
    return reply(res, 503, {error: 'Unable to verify payment right now'});
  }
}
