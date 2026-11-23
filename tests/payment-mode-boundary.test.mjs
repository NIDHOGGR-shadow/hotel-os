import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handlePaystackCheckout} from '../server/public-booking.js';
import {handlePaystackWebhook} from '../server/paystack-webhook.js';
import {handlePaystackStatus} from '../server/paystack-status.js';
import {readFileSync} from 'node:fs';

const reference='hotel-00000000-0000-4000-8000-000000000025';
const property='00000000-0000-4000-8000-000000000001';
const room='00000000-0000-4000-8000-000000000002';
const now=Date.parse('2030-11-12T12:00:00Z');
const base={
  VERCEL_ENV:'production',PAYSTACK_SECRET_KEY:'sk_test_faketestkey',
  PAYSTACK_WEBHOOK_SECRET:'whsec_testonly',
  HOTEL_PAYMENTS_ENABLED:'true',
  SUPABASE_URL:'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'test-service-role-key-xxxxxxxxxxxx',
  HOTEL_PROPERTY_ID:property
};
const input={
  checkIn:'2030-11-13',checkOut:'2030-11-15',guests:2,roomTypeId:room,
  guestName:'Demo Guest',guestEmail:'demo@example.invalid',guestPhone:''
};
function response(){let code=200,body;return{
  setHeader(){},status(v){code=v;return this},json(v){body=v;return this},get(){return {code,body}}
};}
test('Production refuses Paystack test key before creating a room hold',async()=>{
 const res=response(),calls=[];
 await handlePaystackCheckout({method:'POST',body:input},res,base,async()=>{calls.push(1);throw Error('provider must not be called')},now);
 assert.equal(res.get().code,503);
 assert.match(res.get().body.error,/live payment processing/);
 assert.equal(calls.length,0);
});
test('Preview checkout still permits test-mode development with isolated data',async()=>{
 const res=response(),calls=[];
 await handlePaystackCheckout({method:'POST',body:input},res,{...base,VERCEL_ENV:'preview'},
  async(url,options)=>{
   calls.push(String(url));
   if(String(url).endsWith('/hotel_create_checkout'))
    return Response.json([{reference:JSON.parse(options.body).p_reference,amount_minor:150000,currency:'NGN'}]);
   if(String(url).includes('/transaction/initialize')){
    const reference=JSON.parse(options.body).reference;
    return Response.json({status:true,data:{reference,authorization_url:'https://checkout.paystack.com/abc123'}});
   }
   if(String(url).includes('/hotel_checkout_sessions?'))return new Response(null,{status:204});
   throw Error('Unexpected URL');
 },now);
 assert.equal(res.get().code,200);
 assert.equal(calls.length,3);
});
test('Production webhook may record test charge for audit but cannot confirm real booking',async()=>{
 const event={event:'charge.success',data:{reference,amount:150000,currency:'NGN'}};
 const payload=Buffer.from(JSON.stringify(event));
 const timestamp=Math.floor(now/1000);
 const signature=createHmac('sha512',base.PAYSTACK_WEBHOOK_SECRET)
  .update(String(timestamp)+'.').update(payload).digest('hex');
 const req={
  method:'POST',
  headers:{'paystack-signature':'t='+timestamp+',v1=whk_test:'+signature},
  async *[Symbol.asyncIterator](){yield payload;}
 };
 const res=response(),calls=[];
 await handlePaystackWebhook(req,res,base,async(url,options)=>{
  calls.push(String(url));
  if(String(url).includes('/transaction/verify/'))return Response.json({status:true,data:{
   id:100,reference,status:'success',domain:'test',currency:'NGN',amount:150000,
   paid_at:'2030-11-12T12:00:00Z',customer:{email:'demo@example.invalid'}
  }});
  if(String(url).includes('/paystack_verified_charges?'))return new Response(null,{status:201});
  throw Error('Production must not call hotel_complete_checkout or mail provider');
 },now);
 assert.equal(res.get().code,200);
 assert.equal(res.get().body.bookingStatus,'sandbox_only_no_booking');
 assert.equal(res.get().body.emailStatus,'not_applicable');
 assert.equal(calls.length,2);
});
test('Production callback cannot show a real hotel receipt for test money',async()=>{
 const res=response(),calls=[];
 await handlePaystackStatus({method:'GET',query:{reference}},res,base,async url=>{
  calls.push(String(url));
  assert.match(String(url),/transaction\/verify/);
  return Response.json({status:true,data:{
   reference,status:'success',domain:'test',amount:150000,currency:'NGN'
  }});
 });
 assert.equal(res.get().code,200);
 assert.deepEqual(res.get().body,{paymentStatus:'sandbox_only',bookingConfirmed:false});
 assert.equal(calls.length,1);
 assert.match(readFileSync(new URL('../payment-callback.html',import.meta.url),'utf8'),/sandbox_only/);
});
