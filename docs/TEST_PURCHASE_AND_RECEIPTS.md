
# Hotel OS — ₦1,000 sandbox purchase and receipts

This is a **test-mode demonstration**, not a real room reservation or real-money product. It is separate from the production booking flow and does not alter any real room rates.

## Required staging configuration

Deploy to a **separate staging environment** and set the following as server-only secrets:

- PAYSTACK_SECRET_KEY — a Paystack **test-mode** secret, never a live-mode key.
- HOTEL_TEST_PURCHASE_ENABLED=true — explicitly enables the sandbox purchase page. Leave disabled in production.
- HOTEL_PUBLIC_BASE_URL — the exact trusted HTTPS staging origin. The server constructs a fixed payment callback.
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — a separately isolated **staging** Supabase database supporting the paystack_verified_charges table.
- Configure a signed Paystack webhook pointing at /api/paystack-webhook in the staging deployment.

Open /test-purchase.html, enter a sandbox name and email, and use Paystack's official test payment method. The price is fixed on the server to **100000 kobo = ₦1,000**.

After payment, /payment-callback.html verifies directly with Paystack. It displays a printable test receipt only when the signed webhook has also recorded the matching verified charge in the payment ledger. No room is reserved.

## Optional warm email

Configure RESEND_API_KEY and HOTEL_BOOKING_EMAIL_FROM as server-only environment variables. The sender address must use a verified domain. The signed webhook attempts an email only after confirming a genuine Hotel OS reservation or an explicitly marked, verified ₦1,000 test purchase. Test emails clearly say no real money or reservation is involved.

The email provider's idempotency key reduces duplicate emails for retries within its retention period (currently 24 hours). **This is not an exactly-once durable email outbox.** Provider acceptance does not prove inbox delivery. A persistent retry queue and delivery-status monitoring are required before production.

## Acceptance checklist

1. Disabled test mode and live Paystack keys must refuse sandbox checkout.
2. Checkout must always charge 100000 kobo in NGN regardless of browser input.
3. The signed test webhook must save the matching transaction exactly once.
4. Verify the callback does not show a receipt before matching Paystack + ledger evidence.
5. Confirm successful sandbox receipts say no room has been booked.
6. Test failures, incomplete webhooks and webhook retries.
7. If email is configured, check an actual test inbox for the warm message; never claim delivery without that evidence.
8. Run npm test, npm run typecheck and a real mobile/desktop browser walkthrough on staging.

The existing Hotel OS room rates and production inventory remain unchanged.
