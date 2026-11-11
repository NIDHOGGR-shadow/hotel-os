# Hotel OS: 30 real hotel websites for product and design benchmarking
Reviewed for structure, guest flows, service menus and visual direction. Links are to hotel operators, not stock-image sources. Do **not** copy logos, brand identities, unique text or hotel photographs.

## 10 flagship references
| Hotel | Official link | Main pattern to learn |
|---|---|---|
| Eko Hotels & Suites (Lagos) | https://www.ekohotels.com/ | Multiple accommodation blocks, restaurant choices, meetings, events and conference centres |
| The Wheatbaker (Lagos) | https://thewheatbakerlagos.com/ | Art-led storytelling, restrained premium design, rooms, dining and spa |
| The Delborough Lagos | https://www.thedelborough.com/ | Premium visual identity, dedicated room and rooftop dining experiences |
| Lagos Continental Hotel | https://www.thelagoscontinental.com/ | Larger room/suite catalog and booking-oriented property navigation |
| Lagos Marriott Hotel Ikeja | https://www.marriott.com/en-us/hotels/loslg-lagos-marriott-hotel-ikeja/overview/ | Distinct restaurants, table booking links, meeting facilities and room service |
| Aman Tokyo | https://www.aman.com/hotels/aman-tokyo | Calm editorial photography, suite details and seamless availability entry |
| Raffles Singapore | https://www.raffles.com/singapore/ | Separate fine dining venues, heritage, concierge, suite descriptions |
| One&Only Cape Town | https://www.oneandonlyresorts.com/cape-town | Experiences, wellness, offers, F&B and guest itineraries |
| Four Seasons Hotel George V, Paris | https://www.fourseasons.com/paris/ | Fine dining, in-room dining, multi-venue event design |
| Mandarin Oriental, Bangkok | https://www.mandarinoriental.com/en/bangkok/chao-phraya-river | Detailed room filters, per-room amenities, booking calls to action |

## 20 practical and complementary references
| Hotel | Official link | Pattern to learn |
|---|---|---|
| The George Lagos | https://thegeorgelagos.com/ | Boutique luxury and meeting/events navigation |
| The Art Hotel Lagos | https://arthotelng.com/ | Art-forward luxury presentation and restaurant positioning |
| White Orchid Hotel, Lagos | https://whiteorchidhotellagos.com/ | Boutique property tied to a larger dining and entertainment venue |
| Hotel Medallion, Lekki | https://www.hotelmedallion.com/ | Room categories, live availability, laundry, event hall, concierge |
| Radisson Blu Anchorage Lagos | https://www.radissonhotels.com/en-us/hotels/radisson-blu-lagos-anchorage | Rates, room selection, guest reviews and hotel information |
| The Lilygate Lagos | https://lilygatelagos.com/ | Rooms, 24-hour room service, dining, gym and banquets |
| Nordic Hotel Lagos | https://nordichotelsnigeria.com/nordic-hotel-lagos/ | Distinctive boutique look, city guides, corporate offers |
| Four Points by Sheraton Lagos | https://www.marriott.com/en-us/hotels/losfp-four-points-lagos/overview/ | Clear rooms/dining/experiences/events structure |
| The Federal Palace Lagos | https://www.federalpalace.com/ | Room variants with availability and occupancy details |
| Hotel Bon Voyage, Lagos | https://www.hotelbonvoyageng.com/ | Boutique room cards, simple gallery and booking journey |
| Legend Hotel Lagos Airport | https://www.hilton.com/en/hotels/loslhqq-legend-hotel-lagos-airport/ | Airport arrival use cases, dining, events, digital key |
| Pearlwort Hotel & Suites | https://pearlworthotels.org/ | Straightforward nightly-rate room comparisons |
| The Envoy Abuja | https://theenvoyabuja.ng/ | Business/diplomatic positioning, transport, event services |
| Citiheight Hotel, Ikeja | https://citiheighthotel.com/ | Practical hotel service presentation and payment messaging |
| Transcorp Hilton Abuja | https://www.transcorphotels.com/transcorp-hilton-abuja-2/ | Multi-restaurant, large property and conference scheduling |
| Sheraton Lagos Hotel | https://www.marriott.com/en-us/hotels/lossi-sheraton-lagos-hotel/overview/ | Business/family visitor needs and event facility navigation |
| Protea Hotel Ikeja Select | https://www.marriott.com/en-us/hotels/lospr-protea-hotel-ikeja-select/overview/ | 100+ room hotel; practical laundry, availability and meeting services |
| Lagos Oriental Hotel | https://www.lagosoriental.com/ | Specific themed restaurants, VIP dining and room amenity details |
| The London EDITION | https://www.editionhotels.com/london/ | Dramatic interiors and concise modern luxury storytelling |
| 25hours Hotel Dubai One Central | https://25hours-hotels.com/dubai/one-central/ | Events, experiences, offers, quirky editorial direction |

## Architectural lessons for Hotel OS
1. Guests need a fast route to **real availability**; do not display browser-session reservations as a live room inventory.
2. Full payment only, calculated on the server in NGN minor units from authorized nightly rates. Never use the amount from the browser.
3. A pending reservation blocks overlap until payment is verified or the hold expires. Paystack webhook signature and provider verification precede confirmation.
4. Rooms, dining, events, housekeeping, laundry, transport, activities, promotions and deliveries should be **property-configurable modules**. Do not claim that a specific hotel offers an unconfigured service.
5. Distinct public routes: Home, Rooms, Book, Dining, Experiences, Events, Services, Gallery, Offers, About, Contact.
6. Separate protected staff workspace; no sample dashboards or 'demo' banners on the public website.
7. Use licensed generic photos only as **illustrative** assets until real property photos and room data are supplied. Never display competitors' photographs as this hotel's images.
8. Prioritize mobile performance and clear status messages for empty availability, expired payment, declined payment, webhook delay and booking confirmed.

## Reference starting point
The spoken 'Ikutele' reference very likely means Eko Hotels & Suites: its site lists Eko Hotel, Eko Suites, Eko Signature and Eko Gardens, as well as multiple dining venues and a convention centre.

## Next implementation dependencies
The GitHub code provides public page routes and server handlers, but **a dedicated Hotel OS Supabase database and verified Vercel environment are still required**. Do not accept live customer money until migration application, real room inventory, payment-to-booking reconciliation and production E2E tests pass.
