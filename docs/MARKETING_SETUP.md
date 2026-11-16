# Hotel OS marketing / advertising analytics

**Status:** opt-in instrumentation and a read-only report are implemented in the feature branch. There is **no automatic ad purchase**, and ad-to-booking attribution or Hotel OS subscription accounting is **not** implemented. Do not label unrelated bookings as Meta-attributed revenue.

## How the components fit

- `/marketing-dashboard.html`: an operator-only dashboard prompt. It sends an access token as a request header; it is never embedded in the HTML, local storage, a query string, or checked into Git.
- `/api/marketing-report`: fetches per-campaign aggregated metrics using the read-only Meta Ads Insights API (`ads_read`). Separately totals verified Paystack payment transactions for the **configured hotel property** and only when matched to live provider charges. If a source is unconfigured or fails, display `—`, not zero.
- `/api/marketing-config`: exposes only public Meta Pixel and GA4 measurement IDs. No access tokens.
- `/marketing.js`: zero optional tags until an explicit visitor choice. Provides reject, analytics-only and accept analytics-plus-ads selections; allows changes with a persistent privacy-choices button. Collects page views, booking-link clicks, availability searches and checkout attempts. A checkout attempt **is not** a purchase; only verified booking completion may generate `Schedule`.
- Existing guest enquiries can still be unconnected. Never count form submissions as actual leads until the server confirms delivery.

## Environment variables (Vercel > hotel-os > Settings > Environment Variables)

**Server-only secrets:** `MARKETING_REPORT_TOKEN` (unique, random, at least 32 characters), `META_ADS_ACCESS_TOKEN` (read-only app/system-user token with `ads_read`). Restrict the report token to operators and rotate on exposure. Never use `NEXT_PUBLIC_` for secrets.

**Non-secret configuration:** `META_AD_ACCOUNT_ID` (`act_123...` or digits), `META_AD_ACCOUNT_CURRENCY` (the account currency's three-letter ISO code), `META_PIXEL_ID` (digits), `GA4_MEASUREMENT_ID` (e.g. G-XXXXXXXX), and the existing `HOTEL_PROPERTY_ID`. Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` enable booking totals. All secret keys remain server-only.

**Not connected until configured:** the current repository does not contain your Meta advertising account, permissions, Pixel ID or GA4 measurement ID. Configure these in Vercel and redeploy. Until then, the dashboard correctly shows unconfigured status and the visitor tracking script does not open a consent prompt.

## Meta Business setup

1. Open https://business.facebook.com/ and create or select your Business portfolio, Facebook Page, Instagram connection (optional), and advertising account. Configure verified billing in Meta itself.
2. In https://business.facebook.com/events_manager2 create or select the correct property's Meta dataset/Pixel. Obtain its numeric Pixel ID. Configure `META_PIXEL_ID`.
3. Create a Meta developer app and an authorized system-user/ad-account token suitable for **reading Insights**. Grant the necessary business/ad-account access and `ads_read` permission. `ads_management` is only necessary for later ad creation/management; this code does not request it.
4. Configure the server token and ad account ID in Vercel; redeploy; use https://hotel-os-livid.vercel.app/marketing-dashboard.html with the separate private `MARKETING_REPORT_TOKEN` to view data.
5. To **create the first real ad**, use Meta Ads Manager manually. This feature branch does not authorize spending. Specify the objective, audience, geographic targeting, daily/lifetime budget, duration, creative, review destination and a UTM-tagged URL before publishing.

Official references:
- https://developers.facebook.com/docs/marketing-api/insights/
- https://developers.facebook.com/documentation/ads-commerce/marketing-api
- https://developers.facebook.com/docs/facebook-business-extension/fbe/guides/pixel-events
- https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
- https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf

## Revenue / ARR definitions and guardrails

- **Meta link clicks**: clicks reported by Meta, not necessarily unique users or successful website loads. The dashboard does not synthesize clicks from pageviews.
- **Booking revenue**: full amounts from the configured property's verified `payment_transactions` paired to `paystack_verified_charges` in the `live` environment, shown in each recorded currency. These are **gross booking payments**, not hotel profit or ad-attributed revenue.
- **ROAS**: ad-attributed gross revenue divided by ad spend. **Not calculated** until a checked campaign/UTM attribution pipeline connects a customer booking reference to a verified transaction and consistent currency.
- **Hotel OS MRR**: active recurring subscription/maintenance fees from **your own paying hotel clients**, net of discounts/cancellations, once your invoicing/billing system is connected.
- **Hotel OS ARR**: Hotel OS MRR × 12; **not** twelve times guest booking revenue. The dashboard reports this source as *not connected*, not invented.
- **Conversion rates, CAC and LTV**: do not claim these without verified lead/deal records, customer identity matching, and relevant costs.
- **Multiple hotels:** do not reuse one Meta Pixel, ad account, property ID or token across independent hotel clients. Each connected property must have its own approved mapping, isolation and consent rules before multitenant deployment.

## Verification before relying on report

- Run `npm test` and `npm run typecheck`.
- Test unauthorized report requests (401) and absent server token (503).
- Verify the Meta report aggregates actual `inline_link_clicks` and spend in the **real** ad account currency. Compare a known 7-day window with Meta Ads Manager. Handles inaccessible/paginated Insights as unavailable rather than presenting partial totals.
- Verify Supabase transactions marked `verified` are matched to Paystack's **live** charges and correctly scoped to `HOTEL_PROPERTY_ID`; synthetic/test transactions must never appear as live revenue.
- Verify new visitors see no Meta/Google requests before consent; reject means zero nonessential tracking, analytics-only means GA4 but no Meta Pixel; changing preferences must be possible. Existing previously loaded tags cannot be unloaded mid-page: reload after revocation and use consent revocation settings in vendor accounts as applicable.
- Verify booking pages and existing guest workflows are unchanged when analytics is unconfigured.
- Verify public links do not expose tokens, private reservation records, email addresses or guest names.
- Add a campaign-to-checkout server-verified attribution pipeline and recurring billing source **before** showing accurate per-campaign revenue/ROAS or ARR.

## Important product distinction

Advertising a hotel's rooms (B2C) is not the same as advertising **Hotel OS to hotel owners** (B2B). This report currently measures the configured **hotel property's guest booking revenue**. A separate Hotel OS sales landing page, CRM for demos/deals and subscription-billing integration are required for your own business ARR. Do **not** direct hotel-owner sales ads to the guest-facing Hotel OS showcase and call room bookings Hotel OS sales.
