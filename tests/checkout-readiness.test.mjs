import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {handlePaystackCheckout} from '../server/public-booking.js';

const property='00000000-0000-4000-8000-000000000001';
const base={
 SUPABASE_URL:'https://demo.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_abcdefgh0123456789abcdefgh',
 HOTEL_PROPERTY_ID:property,
 HOTEL_PAYMENTS_ENABLED:'true',
 PAYSTACK_SECRET_KEY:'sk_test_samplevalidkey',
 VERCEL_ENV:'preview'
};
function response(){
 let code=200,body,allow=null;
 return {setHeader(k,v){if(k==='Allow')allow=v;},status(n){code=n;return this;},
 json(v){body=v;return this},value(){return {code,body,allow}}};
}
async function readiness(env){
 const calls=[],res=response();
 await handlePaystackCheckout({method:'GET'},res,env,async()=>{
  calls.push(1);throw Error('GET must never contact a provider');
 });
 assert.equal(calls.length,0);
 assert.equal(res.value().code,200);
 assert.equal(typeof res.value().body.checkoutAvailable,'boolean');
 assert.equal(typeof res.value().body.message,'string');
 assert.doesNotMatch(JSON.stringify(res.value().body),/sk_(test|live)_|sb_secret_|service_role|PAYSTACK_/);
 return res.value().body.checkoutAvailable;
}
test('Read-only guest checkout readiness requires configured backend and explicit flags',async()=>{
 assert.equal(await readiness(base),true,'Preview test checkout can be developed without live money');
 assert.equal(await readiness({...base,HOTEL_PAYMENTS_ENABLED:'false'}),false);
 assert.equal(await readiness({...base,SUPABASE_SECRET_KEY:undefined}),false);
 assert.equal(await readiness({...base,HOTEL_PROPERTY_ID:undefined}),false);
 assert.equal(await readiness({...base,PAYSTACK_SECRET_KEY:undefined}),false);
});
test('A genuine production property requires both live Paystack and human verification',async()=>{
 assert.equal(await readiness({...base,VERCEL_ENV:'production'}),false,'Test keys must fail');
 assert.equal(await readiness({...base,VERCEL_ENV:'production',PAYSTACK_SECRET_KEY:'sk_live_samplevalidkey'}),false,
  'Unverified generic properties must not accept money');
 assert.equal(await readiness({...base,VERCEL_ENV:'production',PAYSTACK_SECRET_KEY:'sk_live_samplevalidkey',
   HOTEL_REAL_PROPERTY_VERIFIED:'true'}),true);
});
test('Production refuses an unverified property without creating a room hold',async()=>{
 const res=response(),calls=[];
 await handlePaystackCheckout({method:'POST',body:{}},res,{
  ...base,VERCEL_ENV:'production',PAYSTACK_SECRET_KEY:'sk_live_samplevalidkey'
 },async()=>{calls.push(1);throw Error('No backend call');});
 assert.equal(res.value().code,503);
 assert.equal(calls.length,0);
 assert.match(res.value().body.error,/not ready/i);
});
test('No unsupported methods and no fallback to secret disclosure',async()=>{
 const res=response();
 await handlePaystackCheckout({method:'PATCH'},res,base,async()=>{throw Error('No network');});
 assert.equal(res.value().code,405);
 assert.equal(res.value().allow,'GET, POST');
});
test('Guest booking page exposes the payment state before requesting contact details',()=>{
 const html=readFileSync(new URL('../book.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../booking.js',import.meta.url),'utf8');
 assert.match(html,/id="checkoutReadinessStatus"/);
 assert.match(html,/id="guestContactFields" hidden/);
 assert.match(html,/id="checkoutAlternative"/);
 assert.match(html,/id="payButton" type="submit" disabled/);
 assert.match(js,/fetch\('\/api\/paystack-checkout',\{method:'GET'/);
 assert.match(js,/guestFields\.hidden=!checkoutReady/);
 assert.match(js,/payButton\.disabled=!checkoutReady/);
 assert.match(js,/form\.elements\.namedItem\('checkIn'\)/);
 assert.doesNotMatch(js,/localStorage\.setItem/);
 execFileSync(process.execPath,['--check',new URL('../booking.js',import.meta.url).pathname]);
});
