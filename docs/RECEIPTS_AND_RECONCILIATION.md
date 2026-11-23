# Hotel OS — verified receipts and reconciliation

## Guest receipts
Paystack redirect is never proof of payment. Payment status is verified by the server against Paystack and Hotel OS checkout records. Only returned verified receipt details are eligible to be copied into device localStorage.
Visit /receipts.html to see locally stored copies, recheck status using the live payment endpoint, or download a printable HTML receipt. Local copies can be erased or altered and cannot substitute for the server's authoritative payment record.
An unconfirmed booking is always shown as pending, even after a verified charge.

## Authorized hotel finance
Visit /admin-reconciliation.html. An active, invited Supabase Auth user with a matching staff_memberships entry and owner, manager or accountant role may sign in.
API access is property scoped. The server checks authenticated Supabase user identity and membership for each request, then matches checkout sessions with verified Paystack charge records. It distinguishes settled-in-ledger, paid-needs-review, amount mismatch, missing charge record, pending, failed and expired. Only matched, confirmed payments contribute to reconciled totals.
The finance view offers All transactions / Needs attention tabs, refresh, CSV export and print. It is NOT a bank settlement statement. Sandbox purchases have no property association and are deliberately excluded from property finance reports.

## Four fixed sandbox amounts
Standard ₦1,000; Deluxe ₦2,000; Special ₦3,000; Presidential ₦4,000.
These are simulated Paystack test products with server-validated SKU and fixed price; not real accommodation reservations.
Requires PAYSTACK_SECRET_KEY sk_test_..., HOTEL_TEST_PURCHASE_ENABLED=true and configured signed webhook/verified charge storage. Never enable this route with a live Paystack key.
The actual property room inventory and prices in Supabase remain untouched. For real hotel sales the property, images, prices and refund terms must be independently verified.

## Remaining acceptance tests
1. Compare Android browser availability response with the live Supabase room counts for matching dates.
2. Test all four Paystack sandbox purchases against an isolated staging database and signed webhook.
3. Test receipt localStorage persistence, downloads, printing, and invalid payment refusal on Android.
4. Sign in as real authorized staff and verify access, reconciliation, and CSV.
5. Configure and verify email delivery separately; a durable retryable outbox is required before promising guaranteed confirmations.