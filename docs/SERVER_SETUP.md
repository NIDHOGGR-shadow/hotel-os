# Hotel OS server setup

The guest-facing index.html is currently an independent interactive interface, not a production-connected dashboard. Server development must be validated before accepting real booking or payment information.

## Backend technology
- TypeScript (Node.js 22) for API.
- Supabase Auth for identity and PostgreSQL for data.
- PostgreSQL row-level security and role-checked stored procedures for integrity.
- Vercel for static frontend and /api serverless functions once explicitly connected.
- No service-role key in browser or API routes; use a Supabase anon/publishable key with the authenticated staff user's bearer token.

## Steps before live use
1. Create a **dedicated** Hotel OS Supabase project. Do not use another project's database.
2. Apply reviewed SQL migration in supabase/migrations, then test the database constraints and role policies in staging.
3. Set SUPABASE_URL and SUPABASE_ANON_KEY on the backend; no real credentials in git.
4. Add authenticated staff UI backed by the API; do not synchronise fictional browser data into production.
5. Complete payment verification, order/stock and housekeeping integration tests, backup-and-restore, privacy controls, and actual end-to-end tests.

API: GET /api/operations?resource=properties, or GET /api/operations?resource=rooms&property_id=<UUID>; POST /api/operations?action=create_reservation with a JSON body of explicitly validated parameters. Every request requires a Supabase Auth bearer token, and RLS/RPC checks privileges in the database.

## Verification
npm test
npm run typecheck

Do not promise live bookings, actual payments or real stock updates until database migration, staff login and staging integration all pass.
