import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handlePaystackStatus} from '../server/paystack-status.js';

const reference = 'hotel-00000000-0000-4000-8000-000000000010';
const env = {
  PAYSTACK_SECRET_KEY: 'sk_test_fake',
  SUPABASE_URL: 'https://sample.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-secret-xxxxxxxxxxxxxxxxxxxxxxxx'
};
function response() {
  let code = 200, body;
  return {setHeader(){},status(n){code=n;return this;},json(data){body=data;return this;},get(){return {code,body};}};
}
function payment(override = {}) {
  return {status:true,data:{reference,status:'success',domain:'test',amount:100000,currency:'NGN',paid_at:'2030-10-01T10:00:00Z',...override}};
}
async function verifyPayment({session={status:'verified',amount_minor:100000,currency:'NGN'},transaction={}}={}) {
  const result=response(),calls=[];
  const request=async (url) => {
    calls.push(String(url));
    if(String(url).includes('api.paystack.co/')) return Response.json(payment(transaction));
    if(String(url).includes('/hotel_checkout_sessions?')) return Response.json(session===null?[]:[session]);
    throw Error('Unexpected URL');
  };
  await handlePaystackStatus({method:'GET',query:{reference}},result,env,request);
  return {...result.get(),calls};
}
test('A server-matched verified hotel payment returns an accurate NGN receipt',async()=>{
  const result=await verifyPayment();
  assert.equal(result.code,200);
  assert.equal(result.body.paymentStatus,'verified');
  assert.equal(result.body.bookingConfirmed,true);
  assert.deepEqual(result.body.receipt,{reference,amountMinor:100000,currency:'NGN',paidAt:'2030-10-01T10:00:00Z'});
  assert.equal(result.calls.length,2);
});
test('Paystack success cannot claim a room when database still processes the booking',async()=>{
  const result=await verifyPayment({session:{status:'initialized',amount_minor:100000,currency:'NGN'}});
  assert.equal(result.body.paymentStatus,'verified');
  assert.equal(result.body.bookingConfirmed,false);
  assert.equal(result.body.receipt.amountMinor,100000);
});
test('A mismatched or unknown database amount never produces a receipt',async()=>{
  for(const session of [{status:'verified',amount_minor:1,currency:'NGN'},
                       {status:'verified',amount_minor:100000,currency:'USD'},null]) {
    const result=await verifyPayment({session});
    assert.equal(result.body.bookingConfirmed,false);
    assert.equal(result.body.receipt,undefined);
  }
});
test('No verified receipt is shown for incomplete payments or reference mismatch',async()=>{
  for(const transaction of [{status:'failed'}, {reference:'hotel-00000000-0000-4000-8000-000000000099'}]) {
    const result=await verifyPayment({transaction});
    assert.equal(result.body.receipt,undefined);
    assert.notEqual(result.body.bookingConfirmed,true);
  }
});
test('Guest shell and callback expose responsive navigation and print only on verified receipt',()=>{
  const css=readFileSync(new URL('../site-shell.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../site-shell.js',import.meta.url),'utf8');
  const callback=readFileSync(new URL('../payment-callback.html',import.meta.url),'utf8');
  const booking=readFileSync(new URL('../book.html',import.meta.url),'utf8');
  const marketing=readFileSync(new URL('../marketing.js',import.meta.url),'utf8');
  assert.match(css,/max-width:820px/);
  assert.match(css,/hotel-bottom-nav/);
  assert.match(js,/hotel-mobile-drawer/);
  assert.match(js,/aria-expanded/);
  assert.match(js,/localStorage\.setItem/);
  assert.match(marketing,/site-shell\.js/);
  assert.match(booking,/booking-steps/);
  assert.match(callback,/data\.paymentStatus==='verified'/);
  assert.match(callback,/displayReceipt\(data\.receipt,confirmed\)/);
  assert.match(callback,/window\.print\(\)/);
  assert.doesNotMatch(callback,/PAYSTACK_SECRET_KEY/);
});
