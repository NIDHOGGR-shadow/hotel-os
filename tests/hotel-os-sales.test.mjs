import test from 'node:test';
import assert from 'node:assert/strict';
import {handleHotelOsLead} from '../api/hotel-os-leads.js';

function response(){
 return {statusCode:0,headers:{},data:null,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(obj){this.data=obj;return this;}
 };
}
const env={
 HOTEL_OS_LEADS_ENABLED:'true',
 SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_test_value',
 TURNSTILE_SECRET_KEY:'private_test_turnstile_secret',
 TURNSTILE_SITE_KEY:'0x4AAAAexampleSiteKey',
 HOTEL_OS_META_PIXEL_ID:'1122334455667788',
 B2B_AD_TRACKING_ENABLED:'true'
};
const headers={
 origin:'https://hotel-os-livid.vercel.app',
 host:'hotel-os-livid.vercel.app',
 'content-type':'application/json'
};
const body={
 hotelName:'Example Independent Hotel',contactName:'Test Contact',
 email:'manager@example.com',phone:'+234 803 123 4567',
 city:'Ikeja',roomCount:'30',message:'Please show the booking flow.',
 consentToContact:true,consentToAttribution:true,
 campaign:{source:'facebook',medium:'paid_social',name:'hotel_os_lagos',id:'1234567890'},
 turnstileToken:'test-valid-long-token',
 website:''
};
test('does not enable hotel owner lead form without required safeguards',async()=>{
 const res=response();await handleHotelOsLead({method:'GET',headers:{}},res,{...env,TURNSTILE_SECRET_KEY:undefined});
 assert.equal(res.statusCode,200);assert.equal(res.data.ready,false);assert.equal(res.data.siteKey,null);
});
test('requires same origin and Turnstile before writing any lead',async()=>{
 const res=response();await handleHotelOsLead({method:'POST',headers:{...headers,origin:'https://fraud.example'},body},res,env,
  async()=>{throw Error('Unexpected network call');});
 assert.equal(res.statusCode,403);
});
test('rejects missing contact consent',async()=>{
 const res=response();await handleHotelOsLead({method:'POST',headers,body:{...body,consentToContact:false}},res,env,
  async()=>{throw Error('Unexpected network call');});
 assert.equal(res.statusCode,422);
});
test('persists a verified hotel-owner enquiry and returns only its reference',async()=>{
 const res=response();let stored=null,checks=0;
 const fakeFetch=async (url,options)=>{
  checks++;
  if(String(url).includes('/siteverify')){
   assert.match(String(options.body),'response=test-valid-long-token');
   return {ok:true,json:async()=>({success:true})};
  }
  assert.match(String(url),/\/rest\/v1\/hotel_os_sales_leads/);
  assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);
  assert.equal('Authorization' in options.headers,false);
  stored=JSON.parse(options.body);
  return {ok:true,json:async()=>[{id:'11111111-1111-4111-8111-111111111111'}]};
 };
 await handleHotelOsLead({method:'POST',headers,body},res,env,fakeFetch);
 assert.equal(checks,2);assert.equal(res.statusCode,201);
 assert.deepEqual(res.data,{received:true,reference:'11111111-1111-4111-8111-111111111111'});
 assert.equal(stored.hotel_name,body.hotelName);
 assert.equal(stored.campaign_id,'1234567890');
 assert.equal(stored.utm_source,'facebook');
});
test('drops attribution when visitor has not opted in',async()=>{
 const res=response();let stored;
 await handleHotelOsLead({method:'POST',headers,body:{...body,consentToAttribution:false}},res,env,
 async(url,options)=>{
  if(String(url).includes('/siteverify'))return {ok:true,json:async()=>({success:true})};
  stored=JSON.parse(options.body);return {ok:true,json:async()=>[{id:'11111111-1111-4111-8111-111111111111'}]};
 });
 assert.equal(res.statusCode,201);
 assert.equal(stored.campaign_id,null);assert.equal(stored.utm_source,null);
});
test('fails closed without recording a lead when bot verification fails',async()=>{
 const res=response();let calls=0;
 await handleHotelOsLead({method:'POST',headers,body},res,env,async()=>{
  calls++;return {ok:true,json:async()=>({success:false})};
 });
 assert.equal(calls,1);assert.equal(res.statusCode,422);
});
