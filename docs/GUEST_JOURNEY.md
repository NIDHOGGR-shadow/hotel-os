# HOTEL guest journey

## Availability

Every published physical room is available for eligible dates and party sizes unless an overlapping reservation occupies it. Dirty, cleaning and maintenance conditions remain housekeeping records and do not close future booking dates under the owner's current rule. Arrival still requires a ready room.

| Step | Guest or operator action | Result |
| --- | --- | --- |
| Discover | Browse rooms and room photos | No reservation or hold is created. |
| Choose dates | Select check-in, check-out and guest count | Published rooms are counted against overlapping stays. |
| Select room | Choose a room category | Dates, guests, nights and the stay total carry into guest details. |
| Start checkout | Submit guest details | The server calculates the total and temporarily reserves one physical room. |
| Pay | Complete Paystack checkout | Verified payment confirms the reserved stay; a redirect cannot confirm it. |
| Abandon checkout | Leave payment incomplete | The temporary hold expires and the room returns to availability. |
| Cancel or finish | A stay is cancelled, checked out or marked no-show | It no longer occupies those booking dates. |
| Arrive | Staff check in the guest | Room readiness is handled by housekeeping at arrival. |

Dates use half-open stay ranges: a guest leaving on the 23rd does not prevent another guest arriving on the 23rd. Confirmed, checked-in and active payment-pending stays occupy their date ranges. Expired unpaid holds are released. Existing row locks and overlap constraints prevent double booking.

Dining, event and service forms create staff requests. Their receipt is not an instant venue or service confirmation. Assigned staff manage those requests through the protected inbox.

## Interface

Rooms of the same category share one card and one nightly rate. The room collection shows the number of published physical rooms in each category; this is inventory, not date-specific availability. Booking search shows the available count for each category and the combined total across categories for the selected dates. Selecting a category reserves one physical room only when checkout starts. Photos stay consistent between the collection, details and booking results.

The owner-requested production catalogue has 14 numbered rooms: five Standard at NGN 1,000/night (101–105), four Deluxe at NGN 2,000/night (201–204), three Special at NGN 3,000/night (301–303), and two Presidential at NGN 4,000/night (401–402). Each currently supports two guests per room. These counts are the initial configuration chosen for the requested expansion; the owner can maintain individual room numbers and category rates in the workspace. The original room/category IDs remain in place, and existing reservations retain their saved prices.

The guest website has no staff sign-in or registration links. Assigned staff use the separate /manage.html address shared by the owner; accounts remain invitation-only.

Room details focus on photos, capacity, price, dates and the reservation action. Repeated photography notices, price-calculation explanations and duplicated booking bars are removed. Shared spacing, form sizing, keyboard focus, touch targets and modest press feedback apply across guest pages. Reduced-motion settings are respected.

The layout uses a single column on phones, two date columns where space allows, and stacked date fields on the narrowest screens. The desktop booking panel stays beside the room photos; the mobile panel follows the primary photo. No location field gates publication or checkout.
