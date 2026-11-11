# Guest enquiries — production release

This change connects the contact, dining, event and service forms to a persistent property inbox. A successful receipt means the request was recorded for review. It does not confirm a table, event venue, charge, service or room reservation.

## Guest and staff journeys

- Guests enter contact information and their request. Dining/event enquiries additionally capture their preferred date and party size; dining includes time.
- The website receives an `HREQ-…` reference only after the database transaction succeeds.
- Network retries with the same form details reuse a request key, avoiding duplicate records. The form retains details after an error.
- Owners and managers have a Guest requests tab. Front desk, restaurant and housekeeping receive a role-filtered inbox in their staff workspace.
- Staff can move a request through New, In progress, Resolved and Cancelled, with an internal note. These changes are audited. Stale updates are rejected rather than overwriting another employee's changes.
- Staff must contact the guest to confirm arrangements. This release does not send enquiry acknowledgement or status-change emails.

## Database and authorization

Apply `supabase/migrations/20261111224426_guest_enquiries.sql` after the existing staff invitation migration.

`guest_enquiries` represents pre-arrival/contact enquiries and sits alongside the existing in-stay `guest_requests`; no existing requests, reservations or payment records are migrated or deleted.

| Role | Permitted enquiries |
|---|---|
| Owner, manager, front desk | All requests for their property |
| Restaurant | Dining requests and in-room dining enquiries |
| Housekeeping | Housekeeping and laundry enquiries |
| Inventory, accountant, unsigned users | No guest enquiry access |

RLS protects reads. A restricted authenticated RPC authorizes each status/note update using current database membership. The public intake RPC is executable only by the server's service role. Public callers cannot choose the property, status, staff note or handler.

The server enforces bounded input, JSON requests, same-origin browser submissions and a honeypot. Database rate counters cap new submissions at 40/hour per client IP hash and 5/hour per email hash. Raw client IPs are not stored in these counters. Each opaque client/email hash has one counter row, reused when its hour changes. Requests remain in the property inbox.

## Production configuration

The API uses the existing `SUPABASE_URL`, server key, `HOTEL_PROPERTY_ID` and `HOTEL_PUBLIC_URL`. It adds one Vercel API function and no paid dependency. It uses the same Supabase key helper as existing server endpoints.

The owner separately configured Gmail SMTP in Supabase Auth, with sender `samuelirenikase@gmail.com`, sender name HOTEL, host `smtp.gmail.com` and port 587. The saved password remains private. These Auth settings serve account invitations and do not make this guest-enquiry API an email sender.

## Review and validation status

The changes were reviewed as source and the database migration was applied to the existing HOTEL project. The release is deployed directly to production at the owner's direction. No unit, integration, browser, live-form, booking, email or payment tests are run for this release. A successful build or deployment does not establish end-to-end application behaviour or email deliverability.

The inbox shows the latest 100 permitted enquiries. Instant table/venue allocation, guest self-service enquiry tracking, automated enquiry notifications and replacement of illustrative restaurant content remain outside this batch. Existing booking and payment handlers are unchanged.
