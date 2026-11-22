# Hotel OS

Hotel OS is an all-in-one hospitality platform under development, combining a guest website, room reservations, front desk, restaurant and room service, stock control, housekeeping, payments, guest communications, staff permissions and management reporting.

## Current server boundary (implemented, not a production release)

The code in `server/public-booking.js` provides a server-only public room availability API and a Paystack checkout adapter gated by configured Supabase property credentials and payment enablement. Availability data is accepted only if every returned room type has a unique valid UUID, a bounded name and capacity, an integer NGN minor-unit nightly rate, and a nonnegative integer available-room count. Malformed or duplicate inventories fail closed with HTTP 503 instead of presenting invented availability or pricing. These are runtime checks with synthetic API regression tests, **not** proof that real hotel inventory is connected or concurrency-safe.

## Current implementation

**`index.html` is an interactive, responsive frontend showcase**, designed to illustrate the intended operational workflows. It contains synthetic room, guest, order, payment and inventory records for demonstration purposes. It is not yet a production-connected property management system: there is no authenticated staff backend, persistent bookings database or live payment processing. Do not enter real guest or payment data.

The project is intended to become a production system, not remain a static showcase. See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) and [data policy](docs/DATA_POLICY.md).

## Preview the current frontend

Open `index.html` in a browser, or deploy the root of this repository to a static host. On Vercel, import the repository, select **Other** as the framework preset, leave build command unset, and use the repository root as output. Static hosting does not enable genuine bookings or payments.

Explore the guest experience, send a local demonstration enquiry, then choose **Staff demo** to see how reservations, restaurant orders, stock and management views interact.

## Product principles

- One application and connected source of truth for owners and authorised staff, with role-specific screens.
- Every property can enable or disable relevant modules.
- PostgreSQL as the future authoritative record store; optional Sheets import/export only.
- Property-scoped records from the beginning to support later branches.
- Auditable room prices, reservations, staff changes, payments and stock movements.
- Secure, database-enforced booking protections and verified gateway payment events.
- Separate `showcase`, `staging` and `production` datasets. Fictional showcase data is **never** treated as real hotel records.

## Development

Current stage: **production planning and frontend prototype**. Subsequent commits will add the authenticated app, database migrations, backend services, API validation and tests. No real hotel operations should run until their end-to-end workflows have passed acceptance tests.

## Security

Never commit `.env` files, credentials, guest records or payment information. Keep test keys in the hosting provider's secure environment and use a separately configured database per environment.
