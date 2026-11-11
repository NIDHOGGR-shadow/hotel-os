# HOTEL booking integrity hardening — release gate

This change is **a proposed code branch**. It does not apply database migrations or enable live checkout.
Never test this with real customer money.

## What changes

- New migration `20261111014000_booking_integrity.sql` builds a session-first, row-locked expiration procedure.
- Availability searches, staff allocations and online checkout release expired **unpaid** checkout holds before selecting rooms.
- Staff-created bookings now respect online `payment_pending` reservations and require a ready, row-locked physical room.
- Verified Paystack room payments now post two separate, deduplicated folio entries: accommodation `room_charge` and `payment`.
- Late verified payment results in `manual_review` and releases any still-pending room. Operators must resolve payment or refund; do not auto-confirm a room after expiration.
- Any legacy homepage room-booking pathway redirects to `/book.html`, which uses authoritative APIs rather than a browser-only example inventory.

## Before merging or applying to any database

1. Review the SQL diff, particularly permissions on `hotel_expire_checkout_holds`.
2. Run `npm test` and `npm run typecheck`; check browser flow and mobile navigation on a preview deployment.
3. Verify the existing four migrations are installed in a **dedicated** HOTEL Supabase project; back up before applying migration 140.
4. Do not apply to a shared application database. Confirm actual `HOTEL_PROPERTY_ID`, available room types, physical rooms and NGN rates belong to the intended hotel.
5. Apply migration 140 only after 130 and verify functions compile. Use disposable database test reservations first.
6. Simulate: two concurrent checkouts for one room; staff vs online checkout; hold expiration; successful webhook once and repeated; checkout after expiration; late successful payment; database rollback.
7. Verify the folio for an online booking contains exactly one accommodation charge and one equal verified payment. Check historically verified records separately because this migration does not automatically backfill them.
8. Never enable `HOTEL_PAYMENTS_ENABLED=true` until checks pass, using **Paystack test credentials** in a separated test environment before live release.

## Expiration without website traffic

The migration fixes availability and allocation even if scheduled cleanup is not configured: the next availability check or allocation clears expired holds.

For guaranteed cleanup while nobody visits the website, set up a protected scheduler (Supabase pg_cron or a supported Vercel cron plan) to invoke `hotel_expire_checkout_holds` every 5 minutes. **Do not expose an unauthenticated cron endpoint.** The scheduled task must operate with a service role held only server-side.

Avoid enabling a high-frequency Vercel cron until the project's commercial plan, scheduling limits, and secrets are verified.

## Operational follow-ups

- Reconcile payment attempts where Paystack succeeded but the callback/webhook failed.
- Define a documented manual-review refund workflow for late payments.
- Add monitoring for checkout sessions in `manual_review`, `pending` older than the hold limit, webhook failures, and folio mismatches.
- Review whether a 60-minute payment hold should later be reduced; don't shorten it before comparing Paystack completion behaviour.
