import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePaystackStatus} from '../server/paystack-status.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

function res(){
 let code=200,body;
 return {setHeader(){},status(value){code=value;return this},json(value){body=value;return this},get(){return {code,body}}};
}
const validEnv={PAYSTACK_SECRET_KEY:'sk_live_fake'};
const req={method:'GET',query:{reference:'hotel-abc.123'}};
function verified(status='success',domain='live'){
 return async()=>Response.json({status:true,data:{reference:'hotel-abc.123',status,domain}});
}
test('Callback file can display a transaction status without announcing a booking confirmation',()=>{
 const html=readFileSync(resolve('payment-callback.html'),'utf8');
 assert.match(html,/api\/payment-status\?reference=/);
 assert.match(html,/not yet confirmed/);
 assert.doesNotMatch(html,/PAYSTACK_SECRET_KEY/);
});
test('Valid transaction reads Paystack with server-side key but never confirms a booking',async()=>{
 const result=res(),calls=[];
 await handlePaystackStatus(req,result,validEnv,async (url,options)=>{
  calls.push({url,options});return verified()();
 });
 assert.equal(result.get().code,200);
 assert.deepEqual(result.get().body,{paymentStatus:'verified',bookingConfirmed:false});
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers.Authorization,'Bearer sk_live_fake');
});
test('A pending or failed transaction is not marked paid',async()=>{
 for(const status of ['pending','failed']){
  const result=res();
  await handlePaystackStatus(req,result,validEnv,verified(status));
  assert.equal(result.get().body.paymentStatus,status);
  assert.equal(result.get().body.bookingConfirmed,false);
 }
});
test('Invalid references, other methods and absent keys fail closed',async()=>{
 for(const [request,env,code] of [
   [{...req,query:{reference:'../../bad'}},validEnv,422],
   [{...req,method:'POST'},validEnv,405],
   [req,{},503]
 ]){
  const result=res();await handlePaystackStatus(request,result,env,verified());
  assert.equal(result.get().code,code);
 }
});
test('Live key rejects a test transaction',async()=>{
 const result=res();await handlePaystackStatus(req,result,validEnv,verified('success','test'));
 assert.equal(result.get().code,503);
});
