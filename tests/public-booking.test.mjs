import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicAvailability,handlePaystackCheckout} from '../server/public-booking.js';
const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-xxxxxxxx',HOTEL_PROPERTY_ID:'00000000-0000-4000-8000-000000000001',PAYSTACK_SECRET_KEY:'sk_test_abcdef',HOTEL_PAYMENTS_ENABLED:'true'};
const roomId='00000000-0000-4000-8000-000000000002';
const data={checkIn:'2030-11-13',checkOut:'2030-11-15',guests:2,roomTypeId:roomId,guestName:'Guest Example',guestEmail:'guest@example.com',guestPhone:''};
function response(){let code=200,body;return {setHeader(){},status(n){code=n;return this},json(v){body=v;return this},get(){return {code,body}}};}
test('Live checkout is disabled unless the hotel is deliberately enabled',async()=>{
 for(const extra of [{HOTEL_PAYMENTS_ENABLED:'false'},{HOTEL_PROPERTY_ID:undefined},{PAYSTACK_SECRET_KEY:undefined}]){
  const res=response(),calls=[];
  await handlePaystackCheckout({method:'POST',body:data},res,{...env,...extra},async(...args)=>{calls.push(args);throw Error('Should not call upstream')});
  assert.equal(res.get().code,503);
  assert.equal(calls.length,0);
 }
});
test('Checkout validates stay dates and rejects client supplied fake room types',async()=>{
 const res=response();
 await handlePaystackCheckout({method:'POST',body:{...data,roomTypeId:'classic'}},res,env);
 assert.equal(res.get().code,422);
});
test('Authoritative room quote controls full Paystack amount and return URL',async()=>{
 const res=response(),calls=[],now=Date.parse('2030-11-12T12:00:00Z');
 const mock=async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('hotel_create_checkout')){
   const sent=JSON.parse(options.body);
   return Response.json([{reference:sent.p_reference,amount_minor:7800000,currency:'NGN'}]);
  }
  if(String(url).includes('api.paystack.co/transaction/initialize')){
   const sent=JSON.parse(options.body);
   return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/checkout123',reference:sent.reference}});
  }
  if(String(url).includes('hotel_checkout_sessions?reference='))return new Response(null,{status:204});
  throw Error('Unexpected URL '+url);
 };
 await handlePaystackCheckout({method:'POST',body:{...data,amountMinor:1,currency:'USD'}},res,env,mock,now);
 assert.equal(res.get().code,200);
 assert.match(res.get().body.authorizationUrl,/^https:\/\/checkout\.paystack\.com\//);
 assert.equal(calls.length,3);
 const paystackPayload=JSON.parse(calls[1].options.body);
 assert.equal(paystackPayload.amount,'7800000');
 assert.equal(paystackPayload.currency,'NGN');
 assert.equal(paystackPayload.callback_url,'https://hotel-os-livid.vercel.app/payment-callback.html');
 assert.equal(paystackPayload.reference,JSON.parse(calls[0].options.body).p_reference);
 assert.equal(calls[1].options.headers.Authorization,'Bearer sk_test_abcdef');
});
test('Availability returns actual room categories from the database',async()=>{
 const res=response();let called=0;
 await handlePublicAvailability({method:'GET',query:{checkIn:data.checkIn,checkOut:data.checkOut,guests:'2'}},res,env,async (url,options)=>{
  called++;assert.match(String(url),/hotel_public_availability/);return Response.json([{id:roomId,name:'Deluxe',capacity:2,nightly_rate_minor:4500000,available_rooms:2}]);
 },Date.parse('2030-11-12T12:00:00Z'));
 assert.equal(res.get().code,200);assert.equal(called,1);
 assert.deepEqual(res.get().body.rooms,[{id:roomId,name:'Deluxe',capacity:2,nightlyRateMinor:4500000,availableRooms:2}]);
});
test('Invalid dates and unavailable hotel configuration never start a charge',async()=>{
 const res=response();
 await handlePublicAvailability({method:'GET',query:{checkIn:'2030-11-15',checkOut:'2030-11-14',guests:'2'}},res,env,fetch,Date.parse('2030-11-12T12:00:00Z'));
 assert.equal(res.get().code,422);
});
