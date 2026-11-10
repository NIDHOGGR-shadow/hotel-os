# Target production architecture (planned, not yet implemented)

## Applications
- Public website: room browsing, booking request, restaurant enquiries and guest services.
- Staff/owner dashboard: reservations calendar, room allocation, prices, restaurant POS, stock, housekeeping, guest communications, billing, reporting and staff roles.
- Both experiences will use the same authenticated service/API and authoritative records.

## Recommended initial implementation
- Next.js and TypeScript frontend with responsive, accessible components.
- Modular TypeScript backend/business layer, initially one deployment or a small companion service.
- Supabase PostgreSQL with property-scoped tables and row-level security where applicable.
- Worker/queue for scheduled notifications, email delivery and idempotent retries.
- Payment gateway via an adapter; validate webhook signatures and verify transactions on the server.

## Primary domain records
`properties`, `staff_users`, `staff_roles`, `room_types`, `rooms`, `room_rates`, `guests`, `reservations`, `stays`, `folios`, `folio_entries`, `payment_transactions`, `restaurant_tables`, `menu_items`, `recipes`, `restaurant_orders`, `order_lines`, `stock_items`, `stock_movements`, `suppliers`, `purchase_orders`, `housekeeping_tasks`, `guest_requests`, `notification_jobs`, `audit_events`.

Every property-scoped record must have a property identifier. Historical transaction prices must remain unchanged when rates are edited. Track stock via movements, rather than silently replacing quantity. Use database transactions and idempotency keys for dependent operations.

## Critical invariants
1. No overlapping active bookings for the same physical room and dates; enforce this in PostgreSQL.
2. No guest payment is marked successful based only on a browser redirect.
3. Every adjustment to stock, payment, reservation status and staff permission is auditable.
4. Restaurant charges post to the verified in-house guest folio once, or remain direct sales.
5. Staff access is least-privilege and property-limited. Guests cannot view other guest records.
6. Showcase-only records never synchronise automatically to production.
