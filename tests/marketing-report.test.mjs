import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMarketingReport} from '../api/marketing-report.js';

const token='a-very-long-independent-report-access-token-0123456789';
const now=Date.parse('2026-11-16T12:00:00.000Z');
const request = (headers={}, days='30') => ({method:'GET',headers,query:{days}});
function res(){
  return {code:0,headers:{},data:null,
    setHeader(k,v){this.headers[k]=v;},
    status(n){this.code=n;return this;},
    json(v){this.data=v;return this;}
  };
}
test('denies a missing report token without leaking data',async()=>{
  const out=res();
  await handleMarketingReport(request(),out,{},async()=>{throw Error('must not fetch');},now);
  assert.equal(out.code,503);
  assert.match(out.data.error,/not been configured/);
});
test('denies unauthorized users before making provider requests',async()=>{
  const out=res();
  await handleMarketingReport(request({'x-marketing-report-token':'wrong'}),out,
    {MARKETING_REPORT_TOKEN:token},async()=>{throw Error('must not fetch');},now);
  assert.equal(out.code,401);
});
test('rejects invalid reporting periods',async()=>{
  const out=res();
  await handleMarketingReport(request({'x-marketing-report-token':token},'999'),out,
    {MARKETING_REPORT_TOKEN:token},async()=>{throw Error('must not fetch');},now);
  assert.equal(out.code,400);
});
test('returns explicit unconnected states rather than invented zero revenue',async()=>{
  const out=res();
  await handleMarketingReport(request({'x-marketing-report-token':token}),out,
    {MARKETING_REPORT_TOKEN:token},async()=>{throw Error('must not fetch');},now);
  assert.equal(out.code,200);
  assert.equal(out.data.meta.status,'not_connected');
  assert.equal(out.data.bookings.status,'not_connected');
  assert.equal(out.data.hotelOsRecurring.arr,null);
});
test('reports Meta Insights clicks/spend without converting clicks to sales',async()=>{
  const out=res(),env={MARKETING_REPORT_TOKEN:token,META_AD_ACCOUNT_ID:'act_1234567890',
    META_ADS_ACCESS_TOKEN:'private',META_AD_ACCOUNT_CURRENCY:'NGN'};
  const fakeFetch=async (url,opts)=>{
    assert.equal(new URL(url).host,'graph.facebook.com');
    assert.match(opts.headers.Authorization,/^Bearer /);
    return {ok:true,json:async()=>({data:[
      {campaign_id:'1',campaign_name:'Test A',impressions:'100',inline_link_clicks:'4',spend:'120.50'},
      {campaign_id:'2',campaign_name:'Test B',impressions:'50',inline_link_clicks:'2',spend:'10.50'}
    ]})};
  };
  await handleMarketingReport(request({'x-marketing-report-token':token}),out,env,fakeFetch,now);
  assert.equal(out.code,200);
  assert.equal(out.data.meta.linkClicks,6);
  assert.equal(out.data.meta.impressions,150);
  assert.equal(out.data.meta.spend,131);
  assert.equal(out.data.attribution.status,'not_connected');
});
test('counts only live verified Paystack payments, never test charges or duplicates',async()=>{
  const out=res(),env={
    MARKETING_REPORT_TOKEN:token,
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SECRET_KEY:'server-private-key',
    HOTEL_PROPERTY_ID:'11111111-1111-4111-8111-111111111111'
  };
  const fakeFetch=async url=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/payment_transactions'))return {ok:true,json:async()=>[
      {provider_reference:'live-1',amount_minor:300000,currency:'NGN'},
      {provider_reference:'test-2',amount_minor:100000,currency:'NGN'},
      {provider_reference:'live-1',amount_minor:300000,currency:'NGN'}
    ]};
    if(path.endsWith('/paystack_verified_charges'))return {ok:true,json:async()=>[
      {reference:'live-1'}
    ]};
    throw Error('unexpected route');
  };
  await handleMarketingReport(request({'x-marketing-report-token':token}),out,env,fakeFetch,now);
  assert.equal(out.code,200);
  assert.equal(out.data.bookings.status,'connected');
  assert.equal(out.data.bookings.confirmedBookings,1);
  assert.deepEqual(out.data.bookings.revenueByCurrency,[{currency:'NGN',amountMinor:300000}]);
});
test('fails safely rather than reporting partial Meta totals',async()=>{
  const out=res();
  await handleMarketingReport(request({'x-marketing-report-token':token}),out,{
    MARKETING_REPORT_TOKEN:token,META_AD_ACCOUNT_ID:'1234567890',META_ADS_ACCESS_TOKEN:'x'
  },async()=>({ok:true,json:async()=>({data:[],paging:{next:'https://page2.example'}})}),now);
  assert.equal(out.code,200);
  assert.equal(out.data.meta.status,'unavailable');
  assert.equal(out.data.meta.linkClicks,null);
});

test('matches Meta campaign revenue only with live payments and consented campaign IDs',async()=>{
  const out=res(),env={
    MARKETING_REPORT_TOKEN:token,
    META_AD_ACCOUNT_ID:'act_123456789',
    META_ADS_ACCESS_TOKEN:'meta-secret',
    META_AD_ACCOUNT_CURRENCY:'NGN',
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SECRET_KEY:'sb_secret_test',
    HOTEL_PROPERTY_ID:'11111111-1111-4111-8111-111111111111'
  };
  const fakeFetch=async (url,opts)=>{
    const u=new URL(url);
    if(u.host==='graph.facebook.com')return {ok:true,json:async()=>({data:[
      {campaign_id:'1122334455667788',campaign_name:'Lagos hotel rooms',spend:'150.00',impressions:'250',inline_link_clicks:'10'}
    ]})};
    assert.ok(opts.headers.apikey);
    assert.equal('Authorization' in opts.headers,false);
    if(u.pathname.endsWith('/payment_transactions'))return {ok:true,json:async()=>[
      {provider_reference:'live-1',amount_minor:300000,currency:'NGN'},
      {provider_reference:'live-2',amount_minor:400000,currency:'NGN'}
    ]};
    if(u.pathname.endsWith('/paystack_verified_charges'))return {ok:true,json:async()=>[
      {reference:'live-1'},{reference:'live-2'}
    ]};
    if(u.pathname.endsWith('/hotel_booking_attribution'))return {ok:true,json:async()=>[
      {reference:'live-1',source:'facebook',campaign_id:'1122334455667788'},
      {reference:'live-2',source:'google',campaign_id:'1122334455667788'}
    ]};
    throw Error('Unexpected request');
  };
  await handleMarketingReport(request({'x-marketing-report-token':token}),out,env,fakeFetch,now);
  assert.equal(out.code,200);
  assert.equal(out.data.bookings.confirmedBookings,2);
  assert.equal(out.data.attribution.status,'connected');
  assert.deepEqual(out.data.attribution.campaigns,
    [{campaignId:'1122334455667788',currency:'NGN',amountMinor:300000,bookings:1}]);
});

test('calculates Hotel OS contracted MRR and ARR only from signed active agreements',async()=>{
 const out=res(),env={
  MARKETING_REPORT_TOKEN:token,
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_test',
  HOTEL_PROPERTY_ID:'11111111-1111-4111-8111-111111111111'
 };
 const fakeFetch=async url=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/payment_transactions'))return {ok:true,json:async()=>[]};
  if(path.endsWith('/hotel_os_sales_leads'))return {ok:true,json:async()=>[
   {id:'lead-a',status:'qualified'},{id:'lead-b',status:'new'},{id:'lead-c',status:'demo'}
  ]};
  if(path.endsWith('/hotel_os_sales_contracts'))return {ok:true,json:async()=>[
   {status:'active',currency:'NGN',recurring_monthly_minor:5000000,starts_on:'2026-11-01',ends_on:null,signed_at:'2026-10-20T00:00:00Z'},
   {status:'proposed',currency:'NGN',recurring_monthly_minor:9999999,starts_on:'2026-11-01',ends_on:null,signed_at:null},
   {status:'active',currency:'NGN',recurring_monthly_minor:3000000,starts_on:'2026-01-01',ends_on:'2026-09-01',signed_at:'2026-01-01T00:00:00Z'}
  ]};
  throw Error('Unexpected route '+path);
 };
 await handleMarketingReport(request({'x-marketing-report-token':token}),out,env,fakeFetch,now);
 assert.equal(out.code,200);
 assert.equal(out.data.hotelOsSales.leadsInPeriod,3);
 assert.equal(out.data.hotelOsSales.qualifiedLeads,2);
 assert.equal(out.data.hotelOsSales.activeSignedContracts,1);
 assert.deepEqual(out.data.hotelOsRecurring.mrrByCurrency,[{currency:'NGN',amountMinor:5000000}]);
 assert.deepEqual(out.data.hotelOsRecurring.arrByCurrency,[{currency:'NGN',amountMinor:60000000}]);
 assert.equal(out.data.hotelOsRecurring.revenueCollected,null);
});
