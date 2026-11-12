# HOTEL production booking and payment configuration

The owner has authorized direct production use without a test or staging phase. The current release enables `HOTEL_PAYMENTS_ENABLED=true` in the existing Vercel project's production environment. Location details can be supplied later and do not gate checkout.

## Public routes

- Website: https://hotel-os-livid.vercel.app/
- Reservations: https://hotel-os-livid.vercel.app/book.html
- Paystack webhook: https://hotel-os-livid.vercel.app/api/paystack-webhook
- Payment return: https://hotel-os-livid.vercel.app/payment-callback.html
- Owner and invited staff: https://hotel-os-livid.vercel.app/manage.html

## Configuration

The deployment uses the dedicated HOTEL Supabase project and its existing property. Supabase migrations through guest enquiries are already applied. Vercel stores `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `HOTEL_PROPERTY_ID`, `HOTEL_PUBLIC_URL`, `HOTEL_PAYMENTS_ENABLED` and the Paystack credentials. Server secrets must stay out of public HTML and JavaScript.

Room categories, nightly rates and physical room numbers are entered through the owner workspace. Category rates are stored in NGN minor units, and only published rooms are offered for the selected stay. An empty catalogue needs owner-supplied inventory and prices; a location is not required. Do not invent physical inventory or set prices on the owner's behalf without supplied values.

## Full payment and confirmation

The browser displays the stay total, while the server calculates the amount from the saved category rate. Paystack receives the full payment amount. The signed webhook and verified transaction determine payment status and record the reservation. A browser redirect alone cannot confirm a room.

The checkout procedure holds a room and prevents overlapping reservations. Abandoned holds expire. Payments completed after an expired hold are recorded for manual reconciliation rather than allocating an unavailable room. The operator handles changes, cancellations and any required refunds.

The callback retains the reference and distinguishes processing, failed payment and confirmed reservation. Guests can copy the reference, contact reservations and save or print a confirmed receipt.

No test bookings or payment transactions were performed for the production guest-experience release. The release does not claim verified end-to-end payment execution.
