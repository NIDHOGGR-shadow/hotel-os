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
