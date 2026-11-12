# Production guest experience

Published directly to the existing HOTEL project at the owner's request. Location information is optional and is not a prerequisite for room publication, availability, checkout or guest requests. No staging approval or test transaction is required by this release workflow.

## Guest journey

- The same navigation, booking action, footer and mobile reservation bar run across all guest pages.
- Stay dates and guest count carry between the homepage, room collection, room details and reservations. Only stay preferences are kept in session storage; contact information is not.
- A home or room search opens availability directly. Dates follow the property's calendar and support 1–30 nights and up to eight guests, subject to each category's capacity.
- Changing dates or guests clears the previous selection. Requests that complete after the search has changed cannot restore old results.
- Room options display the full stay price. The stay summary shows dates, guests, nights, room and total before guest details and full-payment checkout through Paystack.
- The callback displays the payment reference, verified reservation status, contact action and a printable confirmation. It does not treat a redirect or a browser-stored stay preference as confirmation.
- Dining preferences, event types and service choices route into the persistent property inbox. A request receipt is distinct from a confirmed arrangement.
- The gallery opens photographs in a keyboard-accessible modal.
- Guest copy describes planning and service rather than development setup. Editorial photos and sample dining menus are identified concisely.

## Owner publication

The production `HOTEL_PAYMENTS_ENABLED` variable was changed from `false` to `true` for the new deployment, following the owner's explicit instruction to make the workflow available for production use.

At source inspection, the HOTEL property had zero room categories and zero physical rooms. No room prices, stock or guest transactions were invented to fill that gap. The owner workspace now shows a publication guide. Saving a category and nightly rate moves straight to adding its room number; published rooms are then eligible for date-specific availability. No address field is involved.

The existing staff invitation model, seven-character password minimum, Supabase credential handling, room-allocation constraints and Paystack verification rules remain in use. No new API endpoints or schema migrations were required for this interface release.

## Release evidence

Source and existing production configuration were reviewed. No automated tests, simulated bookings, enquiry submissions, invitation emails or payment transactions were run. Vercel's compilation and deployment state establish publication only; they are not a claim that runtime transactions were exercised.
