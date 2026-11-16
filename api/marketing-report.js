import {timingSafeEqual} from 'node:crypto';

// Read-only analytics, deliberately separate from guest booking and payments.
// Never expose provider credentials, booking records or personally identifying information.
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const MONEY = /^[A-Z]{3}$/;
function response(res, status, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}
function authorized(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string' || expected.length < 32) return false;
  const given = Buffer.from(value, 'utf8');
  const correct = Buffer.from(expected, 'utf8');
  return given.length === correct.length && timingSafeEqual(given, correct);
}
function amount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function supabaseConfig(env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key || !UUID.test(env.HOTEL_PROPERTY_ID || '')) return null;
  return {url, key, property:env.HOTEL_PROPERTY_ID};
}
async function getRows(config, table, params, request) {
  const url = new URL(config.url + '/rest/v1/' + table);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const result = await request(url, {
    headers: {apikey:config.key,...(config.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer ' + config.key}),Accept:'application/json'},
    signal: AbortSignal.timeout(12000)
  });
  if (!result.ok) throw new Error('Booking reporting source unavailable');
  const rows = await result.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected reporting response');
  if (rows.length > 1000) throw new Error('Reporting export limit exceeded; paginate before trusting totals');
  return rows;
}
async function bookingReport(config, since, request) {
  const transactions = await getRows(config, 'payment_transactions', {
    select:'provider_reference,amount_minor,currency',
    property_id:'eq.' + config.property,provider:'eq.paystack',status:'eq.verified',
    verified_at:'gte.' + since,limit:'1001'
  },request);
  if (!transactions.length) return {status:'connected',confirmedBookings:0,revenueByCurrency:[],attributionStatus:'connected',attributedCampaigns:[]};
  const liveCharges = await getRows(config,'paystack_verified_charges',{
    select:'reference',environment:'eq.live',paid_at:'gte.' + since,limit:'1001'
  },request);
  const live = new Set(liveCharges.map(row=>row.reference));
  const byCurrency = new Map();
  const seen = new Set();
  const matched = [];
  let count=0;
  for (const row of transactions) {
    if (!live.has(row.provider_reference) || seen.has(row.provider_reference)) continue;
    const currency = row.currency;
    if (!MONEY.test(currency || '') || !Number.isSafeInteger(Number(row.amount_minor)) || Number(row.amount_minor) <= 0) continue;
    seen.add(row.provider_reference);
    matched.push(row);
    count++;
    byCurrency.set(currency,(byCurrency.get(currency)||0)+Number(row.amount_minor));
  }
  let attributionStatus='unavailable',attributedCampaigns=[];
  try {
    const records=await getRows(config,'hotel_booking_attribution',{
      select:'reference,source,campaign_id',
      property_id:'eq.'+config.property,created_at:'gte.'+since,limit:'1001'
    },request);
    const references=new Map(records.map(r=>[r.reference,r]));
    const revenue=new Map();
    for(const row of matched){
      const info=references.get(row.provider_reference);
      if(!info || !/^(facebook|instagram|meta|fb|ig)$/i.test(info.source||'') ||
          !/^\d{5,30}$/.test(info.campaign_id||''))continue;
      const key=info.campaign_id+'|'+row.currency;
      const entry=revenue.get(key)||{campaignId:info.campaign_id,currency:row.currency,amountMinor:0,bookings:0};
      entry.amountMinor+=Number(row.amount_minor);
      entry.bookings++;
      revenue.set(key,entry);
    }
    attributedCampaigns=[...revenue.values()];
    attributionStatus='connected';
  } catch {/* Maintain accurate total booking revenue even when attribution is unavailable. */}
  return {status:'connected',confirmedBookings:count,revenueByCurrency:[...byCurrency].map(([currency,amountMinor])=>({currency,amountMinor})),attributionStatus,attributedCampaigns};
}
async function metaReport(env, sinceDate, untilDate, request) {
  const accountId = (env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
  const token = env.META_ADS_ACCESS_TOKEN;
  if (!/^\d{5,30}$/.test(accountId) || !token) return {status:'not_connected',campaigns:[],impressions:null,linkClicks:null,spend:null,currency:null};
  const url = new URL('https://graph.facebook.com/v27.0/act_' + accountId + '/insights');
  url.searchParams.set('level','campaign');
  url.searchParams.set('fields','campaign_id,campaign_name,spend,impressions,inline_link_clicks');
  url.searchParams.set('time_range',JSON.stringify({since:sinceDate,until:untilDate}));
  url.searchParams.set('limit','250');
  try {
    const result = await request(url, {
      headers:{Authorization:'Bearer ' + token,Accept:'application/json'},
      signal:AbortSignal.timeout(12000)
    });
    if (!result.ok) throw new Error('Meta permission or reporting error');
    const data=await result.json();
    if (!Array.isArray(data.data) || data.paging?.next) throw new Error('Meta Insights pagination required; incomplete report blocked');
    const campaigns=data.data.map(row=>({
      id:String(row.campaign_id||''),name:String(row.campaign_name||'Unnamed campaign').slice(0,180),
      impressions:Math.max(0,Math.trunc(amount(row.impressions))),
      linkClicks:Math.max(0,Math.trunc(amount(row.inline_link_clicks))),
      spend:amount(row.spend)
    }));
    const currency=MONEY.test(env.META_AD_ACCOUNT_CURRENCY || '')?env.META_AD_ACCOUNT_CURRENCY:null;
    return {status:'connected',currency,campaigns,
      impressions:campaigns.reduce((sum,c)=>sum+c.impressions,0),
      linkClicks:campaigns.reduce((sum,c)=>sum+c.linkClicks,0),
      spend:campaigns.reduce((sum,c)=>sum+c.spend,0)};
  } catch {
    return {status:'unavailable',currency:null,campaigns:[],impressions:null,linkClicks:null,spend:null};
  }
}
async function ownerSalesReport(config,since,now,request){
  // Explicitly separate the owner's client-sales ledger from a hotel's guest bookings.
  // Only fetch status/amounts, never owners' or guests' personal information.
  const leads=await getRows(config,'hotel_os_sales_leads',{
    select:'id,status,utm_source,campaign_id',created_at:'gte.'+since,limit:'1001'
  },request);
  const contracts=await getRows(config,'hotel_os_sales_contracts',{
    select:'status,recurring_monthly_minor,currency,starts_on,ends_on,signed_at',
    limit:'1001'
  },request);
  const byCampaign=new Map();
  for(const lead of leads){
    if(!/^(facebook|instagram|meta|fb|ig)$/i.test(lead.utm_source||'') ||
       !/^\d{5,30}$/.test(lead.campaign_id||''))continue;
    const prev=byCampaign.get(lead.campaign_id)||{campaignId:lead.campaign_id,leads:0,qualifiedLeads:0};
    prev.leads++;
    if(['qualified','demo','proposal','won'].includes(lead.status))prev.qualifiedLeads++;
    byCampaign.set(lead.campaign_id,prev);
  }
  const currentDate=new Date(now).toISOString().slice(0,10);
  const totals=new Map();let active=0;
  for(const c of contracts){
    if(c.status!=='active'||!c.signed_at||c.starts_on>currentDate||
       (c.ends_on&&c.ends_on<currentDate)||!MONEY.test(c.currency||'')||
       !Number.isSafeInteger(Number(c.recurring_monthly_minor))||Number(c.recurring_monthly_minor)<0)continue;
    active++;
    totals.set(c.currency,(totals.get(c.currency)||0)+Number(c.recurring_monthly_minor));
  }
  const mrrByCurrency=[...totals].map(([currency,amountMinor])=>({currency,amountMinor}));
  const arrByCurrency=mrrByCurrency.map(r=>({currency:r.currency,amountMinor:r.amountMinor*12}));
  return {status:'connected',leadsInPeriod:leads.length,
    contactedLeads:leads.filter(r=>['contacted','qualified','demo','proposal','won'].includes(r.status)).length,
    qualifiedLeads:leads.filter(r=>['qualified','demo','proposal','won'].includes(r.status)).length,
    demos:leads.filter(r=>r.status==='demo').length,
    wonLeads:leads.filter(r=>r.status==='won').length,
    activeSignedContracts:active,mrrByCurrency,arrByCurrency,byCampaign:[...byCampaign.values()],
    revenueCollected:null,collectionsStatus:'not_connected'};
}
export async function handleMarketingReport(req,res,env=process.env,request=fetch,now=Date.now()) {
  if (req.method!=='GET') {res.setHeader('Allow','GET');return response(res,405,{error:'Method not allowed'});}
  if (!env.MARKETING_REPORT_TOKEN || env.MARKETING_REPORT_TOKEN.length<32)
    return response(res,503,{error:'Reporting access has not been configured'});
  if (!authorized(req.headers?.['x-marketing-report-token'],env.MARKETING_REPORT_TOKEN))
    return response(res,401,{error:'Unauthorized'});
  const period=Number(req.query?.days||30);
  if (![7,30,90].includes(period)) return response(res,400,{error:'Choose 7, 30 or 90 days'});
  const until=new Date(now).toISOString().slice(0,10);
  const since=new Date(now-period*86400000).toISOString();
  const meta = await metaReport(env,since.slice(0,10),until,request);
  const hotelOsAds = await metaReport({
    META_AD_ACCOUNT_ID:env.HOTEL_OS_META_AD_ACCOUNT_ID,
    META_ADS_ACCESS_TOKEN:env.HOTEL_OS_META_ADS_ACCESS_TOKEN,
    META_AD_ACCOUNT_CURRENCY:env.HOTEL_OS_META_AD_ACCOUNT_CURRENCY
  },since.slice(0,10),until,request);
  let bookings={status:'not_connected',confirmedBookings:null,revenueByCurrency:[]};
  const db=supabaseConfig(env);
  if (db) {
    try {bookings=await bookingReport(db,since,request);}
    catch {bookings={status:'unavailable',confirmedBookings:null,revenueByCurrency:[]};}
  }
  let sales={status:'not_connected',leadsInPeriod:null,qualifiedLeads:null,activeSignedContracts:null,
    mrrByCurrency:[],arrByCurrency:[],revenueCollected:null,collectionsStatus:'not_connected'};
  if(db){
    try{sales=await ownerSalesReport(db,since,now,request);}
    catch{sales={...sales,status:'unavailable'};}
  }
  return response(res,200,{
    periodDays:period,asOf:new Date(now).toISOString(),meta,hotelOsAds,bookings,
    hotelOsSales:sales,
    hotelOsRecurring:{status:sales.status,mrr:null,arr:null,
      mrrByCurrency:sales.mrrByCurrency,arrByCurrency:sales.arrByCurrency,
      revenueCollected:null,collectionsStatus:sales.collectionsStatus},
    attribution:{status:bookings.attributionStatus||'not_connected',method:'consented_utm_campaign_id',campaigns:bookings.attributedCampaigns||[],note:'Consented last-touch UTM association is directional; it is not proof an ad caused a booking.'}
  });
}
export default function handler(req,res) {return handleMarketingReport(req,res);}
