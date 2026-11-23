import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAdminConfig,supabaseAdminHeaders} from '../server/supabase-admin.js';
import {handlePublicAvailability,handlePaystackCheckout} from '../server/public-booking.js';

const property='00000000-0000-4000-8000-000000000001';
const room='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://hotel.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_abcdefghijklmnopqrstuvwxyz123456',
 HOTEL_PROPERTY_ID:property,HOTEL_PAYMENTS_ENABLED:'true',PAYSTACK_SECRET_KEY:'sk_test_abcdef'};

function response(){let code=200,body;return {setHeader(){},status(v){code=v;return this},json(v){body=v;return this},get(){return {code,body}}}}
test('Modern Supabase secret keys work without legacy service_role env',()=>{
 const admin=supabaseAdminConfig(env);
 assert.equal(admin?.modern,true);
 const headers=supabaseAdminHeaders(admin);
 assert.equal(headers.apikey,env.SUPABASE_SECRET_KEY);
 assert.equal(headers.Authorization,undefined,'sb_secret keys are not JWT bearer tokens');
});
test('Legacy service-role key keeps authorization bearer, publishable keys are rejected',()=>{
 const legacy={SUPABASE_URL:'https://hotel.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'eyJ-legacy-admin-test-key-xxxxxxxxx'};
 const result=supabaseAdminHeaders(supabaseAdminConfig(legacy));
 assert.equal(result.Authorization,'Bearer '+legacy.SUPABASE_SERVICE_ROLE_KEY);
 assert.equal(supabaseAdminConfig({...env,SUPABASE_SECRET_KEY:'sb_publishable_xyzabcdefghijklmnopqrstuvwxyz'}),null);
});
test('Live room availability uses Supabase secret key correctly and displays all room types',async()=>{
 const res=response(),calls=[];
 await handlePublicAvailability({method:'GET',query:{checkIn:'2030-11-25',checkOut:'2030-11-26',guests:'2'}},res,env,
  async(url,options)=>{
    calls.push({url:String(url),headers:options.headers});
    return Response.json([{id:room,name:'Standard Room',capacity:2,nightly_rate_minor:100000,available_rooms:5}]);
  },Date.parse('2030-11-22T10:00:00Z'));
 assert.equal(res.get().code,200);
 assert.equal(res.get().body.rooms[0].availableRooms,5);
 assert.equal(res.get().body.rooms[0].nightlyRateMinor,100000);
 assert.equal(calls.length,1);
 assert.equal(calls[0].headers.Authorization,undefined);
 assert.equal(calls[0].headers.apikey,env.SUPABASE_SECRET_KEY);
});
test('Checkout creates a server-priced hold with new secret key and passes its exact amount to Paystack',async()=>{
 const req={method:'POST',body:{
   checkIn:'2030-11-25',checkOut:'2030-11-26',guests:2,roomTypeId:room,
   guestName:'Example Guest',guestEmail:'example@example.com',guestPhone:''
 }};
 const calls=[],res=response();
 await handlePaystackCheckout(req,res,env,async(url,options)=>{
   calls.push({url:String(url),options});
   if(String(url).endsWith('/hotel_create_checkout')){
      assert.equal(options.headers.Authorization,undefined);
      assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);
      return Response.json([{reference:JSON.parse(options.body).p_reference,amount_minor:100000,currency:'NGN'}]);
   }
   if(String(url).includes('paystack.co/transaction/initialize')){
      assert.equal(JSON.parse(options.body).amount,'100000');
      return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test123',reference:JSON.parse(options.body).reference}});
   }
   if(String(url).includes('hotel_checkout_sessions?')){
      assert.equal(options.headers.Authorization,undefined);
      return new Response(null,{status:204});
   }
   throw new Error('Unexpected upstream URL');
 },Date.parse('2030-11-22T10:00:00Z'));
 assert.equal(res.get().code,200);
 assert.equal(calls.length,3);
});
test('A missing privileged server key never exposes inventory or creates payment checkout',async()=>{
 const bad={...env,SUPABASE_SECRET_KEY:undefined};
 const res=response(),calls=[];
 await handlePublicAvailability({method:'GET',query:{checkIn:'2030-11-25',checkOut:'2030-11-26',guests:2}},res,bad,async()=>{
   calls.push(1);throw Error('Unexpected request');
 },Date.parse('2030-11-22T10:00:00Z'));
 assert.equal(res.get().code,503);
 assert.equal(calls.length,0);
});
