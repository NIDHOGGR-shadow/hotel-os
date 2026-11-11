# Hotel OS live payment and reservation deployment checklist

**Current state:** A guest-facing booking page and server-side Paystack checkout initializer are in the repository. Real checkout is intentionally unavailable until authoritative room inventory and a dedicated Supabase hotel property are configured. Paystack live keys alone do not make online bookings safe to accept.

## URLs for the existing Vercel domain

- Guest website: https://hotel-os-livid.vercel.app/
- Full-price booking page: https://hotel-os-livid.vercel.app/book.html
- Live webhook URL: https://hotel-os-livid.vercel.app/api/paystack-webhook
- Live browser callback URL: https://hotel-os-livid.vercel.app/payment-callback.html

## Prerequisites in order

1. Create a **dedicated Hotel OS Supabase project** (never reuse the Honor ERP database or another project's production data).
2. Apply the reviewed migrations, in filename order:
   - `20261111010000_schema.sql`
   - `20261111011000_operations.sql`
   - `20261111012000_paystack_webhook.sql`
   - `20261111013000_public_booking.sql`
3. Create a real `properties` record with currency `NGN`. Use its UUID as the Vercel `HOTEL_PROPERTY_ID`.
4. Create the actual `room_types` and physical `rooms` in Supabase; approve the rates in **kobo**, set only genuinely bookable rooms `active=true`, `condition=ready`. Do not copy browser-only example data to production.
5. In **Vercel → hotel-os → Settings → Environment Variables**, configure server-only:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HOTEL_PROPERTY_ID`
   - `PAYSTACK_SECRET_KEY` = the key for your desired Paystack mode
   - `PAYSTACK_WEBHOOK_SECRET` = your Paystack signing secret (if using the new signature header)
   - `HOTEL_PAYMENTS_ENABLED` = `false` until the reviews and integration checks below pass
   Never expose keys beginning with `sk_` or the Supabase service-role key in the public HTML.
6. Confirm Paystack's webhook URL and callback URL above, then redeploy **after** setting the values.
7. Use signed webhook requests and authorised test transactions to verify: room hold prevents two simultaneous bookings; total charged equals server-approved rate; failed/abandoned payments aren't confirmed; successful Paystack verification atomically updates the reservation, folio and payment record; duplicate webhook delivery records only one payment; late payment after hold expiry goes to manual review.
8. Confirm response handling, logs, rate limiting/bot protection and a refund/reconciliation procedure. Once all checks pass, set `HOTEL_PAYMENTS_ENABLED=true` and redeploy.

## Full payment only

The new guest booking page doesn't offer deposits. It doesn't trust prices calculated in the browser; the server retrieves the room rate from the actual hotel database and submits the complete amount to Paystack.

## Distinction between payment and booking

`charge.success` webhooks are signed, verified against Paystack's transaction API, recorded once and matched to a hotel-UUID checkout session. The `hotel_complete_checkout` SQL procedure confirms the reservation only when the reference, amount and currency match. A browser return alone cannot confirm a stay.

If a payment succeeds after the original room hold expires, it is recorded for manual review rather than confirming an unavailable room. Operators must resolve or refund it promptly.

## Limits and things not yet done

- No connected hotel property or real room data has been verified through this conversation.
- The migration files have been committed to GitHub; pushing them does **not** apply them to Supabase.
- The Vercel team's settings were not accessible to this connection, so values and deployment behaviour were not independently confirmed.
- The public enquiry forms for tables, events and contact do not send messages yet; they explicitly report that the service is not connected.
- Restaurant delivery, table booking, housekeeping and guest service operations still require authoritative staff APIs and data.
- Do not accept real reservations until the above deployment checks succeed.
