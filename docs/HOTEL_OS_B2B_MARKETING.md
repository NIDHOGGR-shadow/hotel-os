# Hotel OS B2B advertising and subscription funnel

**Purpose:** Sell Hotel OS website/booking implementation and maintenance to independent hotel owners. This is distinct from selling a hotel room to a guest. Do not combine these revenue streams, audience pixels or conversion events.

## What is implemented in this branch

- `/hotel-os-for-hotels.html`: owner-facing destination for Meta or Google ads; no fabricated customer claims.
- `/hotel-os-sales.js`: visitor-controlled optional GA4/Meta tags, booking-demo CTA click tracking, and a CAPTCHA-protected lead submission.
- `/api/hotel-os-leads`: server-validated contact requests with explicit contact consent, Cloudflare Turnstile verification, same-origin enforcement and a private Supabase write.
- `hotel_os_sales_leads`: actual submitted requests with statuses `new`, `contacted`, `qualified`, `demo`, `proposal`, `won`, `lost`; advertising source recorded **only after separate attribution consent**.
- `hotel_os_sales_contracts`: separately recorded signed recurring contracts; only active signed agreements within their contract dates contribute to *contracted MRR/ARR*.
- `/api/marketing-report`: separate B2B Meta Insights and lead statistics alongside the existing hotel's guest-booking reporting.
- `/marketing-dashboard.html`: distinct B2B campaign clicks, spend, submitted and qualified leads, cost per stored lead, and contracted MRR/ARR. No ad purchases or Meta writes are performed.

**Not implemented or claimed:** collected Hotel OS subscription revenue; a verified invoice/payment/billing ledger; client invoicing; automatic Meta campaign creation; a connected Meta ad account; bot-proof volume without infrastructure protection; tenant CRM permissions. Ads and revenue remain unconfigured until the required services are connected.

## Deployment sequence

1. Review and apply the private Supabase schema migration: `supabase/migrations/20261116124000_hotel_os_b2b_sales.sql` to the **dedicated Hotel OS project**, not the Honor ERP database. Ensure both tables have RLS enabled and no anon/authenticated privileges. The owner pipeline is private and distinct from room reservations.
2. Add **server-only** Vercel variables:
   - `HOTEL_OS_LEADS_ENABLED=false` initially. Set `true` only after storage, verification, domain and abuse testing.
   - `TURNSTILE_SECRET_KEY` from Cloudflare Turnstile.
   - `TURNSTILE_SITE_KEY` public website sitekey, configured for the correct Vercel/custom domain.
   - Existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
   - Existing `MARKETING_REPORT_TOKEN` (minimum 32 characters) to read the private marketing dashboard.
3. Optional B2B analytics IDs, **different from hotel-guest pixels**:
   - `HOTEL_OS_GA4_MEASUREMENT_ID` (e.g. G-XXXXXXXX)
   - `HOTEL_OS_META_PIXEL_ID` (numeric dataset/Pixel ID)
   - `B2B_AD_TRACKING_ENABLED=true` after consent/legal testing
4. Optional B2B Meta Insights read-only integration:
   - `HOTEL_OS_META_AD_ACCOUNT_ID` (e.g. act_123...)
   - `HOTEL_OS_META_ADS_ACCESS_TOKEN` with appropriate `ads_read` and authorized ad-account access
   - `HOTEL_OS_META_AD_ACCOUNT_CURRENCY` (e.g. NGN)
5. Redeploy to Vercel after setting variables and review the **preview** before activating the public enquiry route. Keep hotel guest payment enablement unchanged.
6. Submit a real authorized test request from `/hotel-os-for-hotels.html`, solve Turnstile, confirm `201`, and verify exactly one new record in `hotel_os_sales_leads`. Test the same form with attribution checkbox off: all UTM fields must be null.
7. Confirm incorrect CAPTCHA fails (422), missing contact consent fails (422), cross-origin request fails (403), unconfigured lead service returns (503), and public users cannot query leads or contracts directly.
8. Enter signed contracts only after a **real client agreement**. If none exist, show no active signed contracts, not fabricated ARR. Make no claim of payments until the billing provider confirms actual collections.
9. Compare Meta Insights link clicks and spend to Meta Ads Manager; lead counts are successful, verified server submissions, not ad clicks. Check attribution UTM campaign IDs resolve numerically and correspond to the actual campaign. Validate the dashboard for 7/30/90 days, and test all credential-failure states.
10. Do not turn on any live ad campaign or budget without reviewing targeting, creative, destination, costs and permissions.

## First proposed Meta ad (DRAFT ONLY)

**Objective:** Leads / conversion to verified hotel-owner demo request, once the form and Pixel are live. Otherwise use a traffic-only test rather than claiming measured sales conversions.

**Audience to validate:** independent hotel owners, general managers and operational decision-makers around Lagos, Nigeria; property sizes initially >=15 rooms. Select geographic and professional targeting only where offered by Meta, without claims about audience sizes.

**Primary text:**
> Still relying on calls and WhatsApp for most room enquiries? Your hotel deserves a website guests can recognize, with room information and a clearer path to direct reservations. Hotel OS is being built for independent hotels, with booking and operational workflows configured around each property. Let's discuss what would work for yours.

**Headline:** Your hotel's own booking website

**Description:** Request a short walkthrough of Hotel OS.

**CTA:** Learn More / Sign Up (depending on Meta campaign objective)

**Landing URL:**
`https://hotel-os-livid.vercel.app/hotel-os-for-hotels.html?utm_source=facebook&utm_medium=paid_social&utm_campaign=hotel_os_owners_lagos&utm_id={{campaign.id}}`

The double-brace tokens are Meta's dynamic campaign URL parameters, not literal campaign IDs. Verify substitution before counting attributed leads.

## Metrics and accounting

| Metric | Source | Meaning |
|---|---|---|
| Impressions / link clicks / spend | Meta Insights API | Ad delivery, billed spend and reported link clicks (not verified leads) |
| Demo CTA clicks | Consent-gated GA4 / B2B Meta Pixel | Intent signal, not stored contact |
| Verified demo requests | `hotel_os_sales_leads` | Passed the server and anti-spam checks, persisted once |
| Qualified leads | CRM lead status | Reviewed and marked qualified; not equal to form submissions |
| Cost per enquiry | Meta spend / consent-attributed saved enquiries | Directional CPL, not customer acquisition cost |
| Contracted MRR | Active signed in-date recurring agreements | Monthly committed value by currency, before actual collection |
| Contracted ARR | Contracted MRR x 12 | Annualized *run rate*, not lifetime billings |
| Collected revenue | Not connected | Never use a handwritten invoice, contract or hotel booking as payment proof |

Do not combine NGN with USD, don't claim a conversion for unconsented campaigns and don't count unsigned proposed deals in MRR.

## References

- Meta Insights API: https://developers.facebook.com/docs/marketing-api/insights/
- Meta system-user permissions: https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/
- Meta Events Manager: https://business.facebook.com/events_manager2
- Cloudflare Turnstile server-side token verification: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Hotel OS guest marketing implementation: `docs/MARKETING_SETUP.md`
