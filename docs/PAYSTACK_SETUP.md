# Paystack webhook setup for Hotel OS

## What this adds

Hotel OS receives Paystack's payment notifications at `/api/paystack-webhook`.
The route:
- Accepts only POST and verifies the ORIGINAL, unmodified request body.
- Validates the new `Paystack-Signature` signing-secret header (with timestamp) where configured, or the legacy `x-paystack-signature` using `PAYSTACK_SECRET_KEY`.
- For `charge.success`, calls Paystack's Verify Transaction API on the server.
- Records the verified reference, amount and currency in Supabase with an idempotent unique reference.
- Returns 503 when payment verification/storage is unavailable, so Paystack can retry.

The endpoint records **payments only**. It does not yet create real room reservations, reconcile folios, or initialize customer checkout. Those require a persistent booking and pricing service. Do not activate real customer payments until that connection is implemented and tested.

## Setup in the actual Vercel project

1. Apply `supabase/migrations/20261111012000_paystack_webhook.sql` to the Hotel OS Supabase database.
2. In Vercel > Project > Settings > Environment Variables, configure:
   - `PAYSTACK_SECRET_KEY` = your Paystack **test** secret key (`sk_test_...`) for initial testing.
   - `PAYSTACK_WEBHOOK_SECRET` = your Paystack webhook signing secret (`whsec_...`), if generated under Developers > API configuration. The endpoint also supports Paystack's legacy signature when needed.
   - `SUPABASE_URL` = Hotel OS Supabase project HTTPS URL.
   - `SUPABASE_SERVICE_ROLE_KEY` = service role secret from this Supabase project. **Server-only**, never exposed to the browser or committed to Git.
3. Redeploy Vercel so the serverless function loads the variables.
4. In Paystack **Test Mode**, go to Settings > API Keys & Webhooks (or Developers > API configuration in the new Dashboard) and paste:
   `https://hotel-os-livid.vercel.app/api/paystack-webhook`
5. Save. In Paystack > Developers > Webhooks, check signed test event delivery and retries. Use Test Mode first.
6. Switch to live keys/webhook settings only after checkout initialization, authoritative booking state, secure payment-to-booking linkage, and end-to-end testing exist.

## Important

The secret key belongs only in Vercel's server-side environment variables, not in `index.html` or any JavaScript loaded by guests. The callback URL (browser redirect) is **different** from the webhook URL (server-to-server POST). Paystack calls the webhook even when the guest closes their browser.

Official docs:
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/verify-payments/
