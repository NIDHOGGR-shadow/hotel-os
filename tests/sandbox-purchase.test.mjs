import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {handleTestPurchaseCheckout} from '../server/test-purchase.js';
import {handlePaystackStatus} from '../server/paystack-status.js';
import {handlePaystackWebhook} from '../server/paystack-webhook.js';
import {sendBookingReceipt} from '../server/booking-email.js';

const demoRef='hoteldemo-00000000-0000-4000-8000-000000000015';
const sandbox={PAYSTACK_SECRET_KEY:'sk_test_abcdef',HOTEL_TEST_PURCHASE_ENABLED:'true',HOTEL_PUBLIC_BASE_URL:'https://hotel-os-livid.vercel.app'};
const stored={...sandbox,SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-secret-xxxxxxxxxxxxxxxx'};
function res(){
 let code=200,body;
 return {setHeader(){},status(n){code=n;return this},json(v){body=v;return this},get(){return {code,body}}};
}
test('Sandbox checkout has an authoritative ₦1,000 amount, not a client-supplied amount',async()=>{
 const result=res(),calls=[];
 await handleTestPurchaseCheckout({method:'POST',body:{name:'Test Guest',email:'guest@example.com',amountMinor:1}},result,sandbox,async(url,opts)=>{
   calls.push({url:String(url),opts});
   const body=JSON.parse(opts.body);
   return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/sandbox123',reference:body.reference}});
 });
 assert.equal(result.get().code,200);
 assert.equal(result.get().body.amountMinor,100000);
 assert.equal(result.get().body.mode,'test');
 assert.equal(calls.length,1);
 const payload=JSON.parse(calls[0].opts.body);
 assert.equal(payload.amount,'100000');
 assert.equal(payload.currency,'NGN');
 assert.match(payload.reference,/^hoteldemo-[a-f0-9-]{36}$/);
 assert.equal(payload.metadata.hotel_os_demo,true);
 assert.equal(payload.callback_url,'https://hotel-os-livid.vercel.app/payment-callback.html');
});
test('Live keys, disabled test mode and malformed identities cannot start checkout',async()=>{
 for(const extra of [{PAYSTACK_SECRET_KEY:'sk_live_fake'},{HOTEL_TEST_PURCHASE_ENABLED:'false'},
                      {HOTEL_PUBLIC_BASE_URL:'http://unsafe.example'}]){
   const calls=[],result=res();
   await handleTestPurchaseCheckout({method:'POST',body:{name:'Test Guest',email:'guest@example.com'}},
     result,{...sandbox,...extra},async()=>{calls.push(1);return Response.json({})});
   assert.equal(result.get().code,503);
   assert.equal(calls.length,0);
 }
 const result=res();
 await handleTestPurchaseCheckout({method:'POST',body:{name:'A',email:'bad'}},result,sandbox,async()=>{throw Error('No checkout');});
 assert.equal(result.get().code,422);
});
async function verifiedDemo(row,transaction={}) {
 const result=res(),calls=[];
 await handlePaystackStatus({method:'GET',query:{reference:demoRef}},result,stored,async(url)=>{
   calls.push(String(url));
   if(String(url).includes('transaction/verify/'))return Response.json({status:true,data:{
      reference:demoRef,status:'success',domain:'test',amount:100000,currency:'NGN',paid_at:'2030-11-23T10:00:00Z',
      metadata:{hotel_os_demo:true},...transaction
   }});
   if(String(url).includes('paystack_verified_charges?'))return Response.json(row===null?[]:[row]);
   throw Error('Unknown URL');
 });
 return {...result.get(),calls};
}
test('Test receipt shows only after webhook ledger has recorded a matching charge',async()=>{
 const match=await verifiedDemo({amount_minor:100000,currency:'NGN',environment:'test'});
 assert.equal(match.code,200);
 assert.equal(match.body.demoPurchase,true);
 assert.equal(match.body.bookingConfirmed,false);
 assert.equal(match.body.receipt.amountMinor,100000);
 for(const row of [{amount_minor:1,currency:'NGN',environment:'test'},null]){
   const mismatch=await verifiedDemo(row);
   assert.equal(mismatch.body.demoPurchase,true);
   assert.equal(mismatch.body.receipt,undefined);
 }
});
test('An unmarked or live-mode transaction cannot masquerade as a sandbox purchase',async()=>{
 for(const txn of [{metadata:{}},{domain:'live'},{amount:200000}]){
   const result=await verifiedDemo({amount_minor:100000,currency:'NGN',environment:'test'},txn);
   assert.equal(result.body.demoPurchase,undefined);
   assert.equal(result.body.receipt,undefined);
 }
});
test('Email receipt is opt-in, warmly worded and idempotent for provider retries',async()=>{
 const base={reference:demoRef,amountMinor:100000,to:'guest@example.com',isDemo:true};
 let called=0;
 assert.equal(await sendBookingReceipt(base,{},async()=>{called++;throw Error('Not called')}),'not_configured');
 assert.equal(called,0);
 const calls=[];
 const status=await sendBookingReceipt(base,
   {RESEND_API_KEY:'re_test123',HOTEL_BOOKING_EMAIL_FROM:'Hotel <hello@example.com>'},async()=>{throw Error('Invalid sender');});
 assert.equal(status,'invalid_details');
 const ok=await sendBookingReceipt(base,{RESEND_API_KEY:'re_test123',HOTEL_BOOKING_EMAIL_FROM:'hello@example.com'},async(url,opts)=>{
   calls.push({url:String(url),opts});
   return Response.json({id:'e-123'});
 });
 assert.equal(ok,'accepted');assert.equal(calls.length,1);
 assert.equal(calls[0].opts.headers['Idempotency-Key'],'hotel-receipt/'+demoRef);
 const payload=JSON.parse(calls[0].opts.body);
 assert.equal(payload.to[0],'guest@example.com');
 assert.match(payload.subject,/test payment receipt/);
 assert.match(payload.text,/No real money was collected/);
 assert.match(payload.text,/₦1,000/);
 assert.match(payload.html,/No real money was collected/);
});
test('Signed demo webhook can record an exact test payment and send only a sandbox email',async()=>{
 const ref=demoRef,now=1784890000000;
 const secret='whsec_example',paystackKey='sk_test_fake';
 const event={event:'charge.success',data:{reference:ref,amount:100000,currency:'NGN'}};
 const raw=Buffer.from(JSON.stringify(event)),stamp=Math.floor(now/1000);
 const signature=createHmac('sha512',secret).update(String(stamp)+'.').update(raw).digest('hex');
 const headers={'paystack-signature':'t='+stamp+',v1=whk_test:'+signature};
 const req={method:'POST',headers,async *[Symbol.asyncIterator](){yield raw;}};
 const response=res(),calls=[];
 await handlePaystackWebhook(req,response,{...stored,
    PAYSTACK_SECRET_KEY:paystackKey,PAYSTACK_WEBHOOK_SECRET:secret,
    RESEND_API_KEY:'re_test123',HOTEL_BOOKING_EMAIL_FROM:'hello@example.com'},
    async(url,opts)=>{
      calls.push(String(url));
      if(String(url).includes('transaction/verify/'))return Response.json({status:true,data:{
        id:1111,reference:ref,status:'success',domain:'test',amount:100000,currency:'NGN',
        customer:{email:'guest@example.com'},metadata:{hotel_os_demo:true},paid_at:'2030-11-23T09:00:00Z'
      }});
      if(String(url).includes('paystack_verified_charges'))return new Response(null,{status:201});
      if(String(url).includes('api.resend.com/emails'))return Response.json({id:'e-123'});
      throw Error('Unexpected URL '+url);
    },now);
 assert.equal(response.get().code,200);
 assert.equal(response.get().body.emailStatus,'accepted');
 assert.equal(response.get().body.bookingStatus,'not_a_hotel_checkout');
 assert.equal(calls.length,3);
});
test('Sandbox experience is visibly labelled and never claims a real booking',()=>{
 const page=readFileSync(new URL('../test-purchase.html',import.meta.url),'utf8');
 const callback=readFileSync(new URL('../payment-callback.html',import.meta.url),'utf8');
 assert.match(page,/Sandbox/);
 assert.match(page,/No real money/);
 assert.match(page,/₦1,000/);
 assert.match(callback,/data\.demoPurchase===true/);
 assert.match(callback,/No money was collected and no hotel room was reserved/);
});
