# Private daily records

The owner and manager can open **Daily records** in `/manage.html` and move between dates. Staff access is absent from the guest website; existing invitations and direct staff login remain available.

The daily view reads the authoritative database rather than calculating from the latest 100 browser records. It uses the property's timezone, currently Africa/Lagos, and midnight-to-midnight timestamp boundaries.

| Area | Calculation |
| --- | --- |
| Rooms | One record per physical room. Reservations occupy `[check_in, check_out)` nights. Current confirmed/checked-in reservations and completed stays for past nights are reserved; unexpired initialized/pending checkout holds are separate. Other active, published rooms are available regardless of housekeeping condition. |
| Room charges | The reservation's saved nightly rate for the selected occupied night. A multi-night payment is not added to this amount again. |
| Receipts | Gross verified receipts on their verification date, in the property currency. A later refunded status does not erase the original gross receipt. Other-currency payments are flagged and excluded from this currency total. |
| Food | Finalized order lines on the order's finalized date, using the saved line prices. Charges to a guest room remain food sales and are not automatically treated as cash collected. |
| Stock | Opening = all movements before the selected local day. Closing = opening + received − food use − waste + other changes. Closing therefore carries into the following day's opening. Quantities remain separate by item and unit. |

This is a live ledger of current source records, not a locked historical night audit. Later reservation/status edits can change historical views. Current room and menu identities are used. Checkout holds reflect their present validity. Open-order and unverified-payment counts reflect current status for records created by the selected day or during it, respectively.

There are currently no stock items, menu items, food orders or verified payments recorded. Empty states are shown; this release does not invent stock or sales. Separate operational entry screens, physical count variances, cash reconciliation, bank settlements/refunds and manager-signed day closing remain follow-on work. Existing server operations already support stock adjustments, recipes and order finalization with stock deductions.

The aggregate RPC checks the active owner/manager property role before returning any data. It exposes no guest details or checkout references, and grants no direct table access. Its security-definer scope is needed only to include private checkout-hold metadata. Existing RLS and role permissions remain in place.

# Price changes

New public pages and availability searches load the database rate. Returning to a visible room page refreshes catalogue data; price edits in another tab of the same browser also announce a refresh. Home, collection and room details re-render updated rates. Booking results refresh when their displayed rates change, preserving guest-detail input fields.

Checkout submits the displayed nightly rate as an expectation. A service-only RPC takes a shared lock on the category and compares the expectation with its current database rate before allocating a room. A mismatch returns `PRICE_CHANGED`, creates no new guest or hold, and returns the guest to the updated quote. The database remains the price authority. Existing reservations and already-created payment holds retain their recorded amounts.

The owner subsequently requested prices starting at NGN 400,000. The existing category ratio is retained: Standard 400,000; Deluxe 800,000; Special 1,200,000; Presidential 1,600,000 per night. Rate publication is an explicit scoped data operation, separate from the schema migration.

Production publication follows the owner's no-test instruction. No automated suite, trial booking, payment, email or signed-in role exercise is performed for this release.
