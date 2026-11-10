# From frontend showcase to production

The current `index.html` illustrates the product flows, but does not yet persist real hotel operations.

1. **Foundation** — Product name, app/repository structure, separated environments, staff invites and authentication, roles and property access, database migrations, audit logs and observability.
2. **Reservations & rooms** — Room types, rate plans, inventory, availability, exclusion of overlapping reservations, calendar, holds, confirmations, check-in/out, reassignment and historical pricing.
3. **Guests, billing & payments** — Guest profiles, folio ledger, deposits, charges, verified payments, refunds, reconciliation and booking confirmations. Never collect raw card details on our own servers.
4. **Restaurant & room service** — Menus, table management, kitchen workflow, room orders, fulfilment, guest folio charges, cancellations and reversals.
5. **Stock & purchasing** — Recipe consumption, receipts, stock-movement ledger, supplier management, purchase orders, waste, alerts and variance audit.
6. **Housekeeping & messaging** — Room readiness, maintenance, guest requests, pre-arrival notices, staff communication, delivery failures and retries.
7. **Owner reporting** — Daily close, occupancy, room revenue, dining sales, verified cash collected, outstanding receivables, shortages and exports.
8. **Production acceptance** — Security and role tests, concurrent booking tests, payment/stock idempotency, backup and restore, accessibility, monitoring, responsive end-to-end tests and operating procedures.

A feature is complete only after the interface, server validation, persistent data, permissions, edge cases, tests and auditability are verified. Deploy showcase/staging before enabling genuine property transactions.
