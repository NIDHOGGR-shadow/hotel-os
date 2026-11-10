# Showcase, staging and production data

## Showcase
Use fictional guest names, rooms, orders, prices, restaurant stock and payments to illustrate workflows. Local actions are not genuine bookings or financial transactions. Label this environment clearly.

## Staging
Use synthetic test accounts, data fixtures and payment sandbox keys. Tests and resets must never affect production.

## Production
Do not automatically preload fictional bookings, guests, stock or transactions. Accept real data only through authenticated, validated operations or an explicitly approved import. Secrets must not be committed to GitHub. Enforce privacy, tenant boundaries, retention, backups and restores, audit logs and least-privilege permissions. Spreadsheets and CSV exports are **not** a substitute for a restorable database backup.
