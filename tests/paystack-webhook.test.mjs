import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handlePaystackWebhook,validatePaystackSignature} from '../server/paystack-webhook.js';

const env={PAYSTACK_SECRET_KEY:'sk_test_fake',PAYSTACK_WEBHOOK_SECRET:'whsec_example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-test-only-key-xxxxxxxxxxxxxxxx'};
const now=1784380000000;
const event={event:'charge.success',data:{reference:'hotel-123',amount:20000,currency:'NGN'}};
const raw=Buffer.from(JSON.stringify(event));
function modern(body=raw,secret=env.PAYSTACK_WEBHOOK_SECRET,at=now) {
 const t=Math.floor(at/1000);
 const sig=createHmac('sha512',secret).update(String(t)+'.').update(body).digest('hex');
 return 't='+t+',v1=whk_test:'+sig;
}
function legacy(body=raw){return createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(body).digest('hex');}
function request(headers={},body=raw,method='POST'){
 return {method,headers,async *[Symbol.asyncIterator](){yield body;}};
}
function response(){
 let code=200,body;
 return {setHeader(){},status(n){code=n;return this;},json(v){body=v;},result(){return {code,body};}};
}
function mockFetch(calls,stored=true) {
 return async (url,options)=>{
   calls.push({url:String(url),options});
   if(String(url).includes('/transaction/verify/'))return Response.json({
     status:true,data:{id:112233,status:'success',reference:'hotel-123',amount:20000,currency:'NGN',domain:'test',paid_at:'2026-11-11T09:00:00Z'}
   });
   return new Response('',{status:stored?201:503});
 };
}
test('Modern signature requires valid timestamp, signature, and secret',()=>{
 assert.equal(validatePaystackSignature(raw,{'paystack-signature':modern()},env,now),true);
 assert.equal(validatePaystackSignature(raw,{'paystack-signature':modern(raw,'wrong')},env,now),false);
 assert.equal(validatePaystackSignature(raw,{'paystack-signature':modern(raw,env.PAYSTACK_WEBHOOK_SECRET,now-3600000)},env,now),false);
 assert.equal(validatePaystackSignature(Buffer.from('altered'),{'paystack-signature':modern()},env,now),false);
});
test('Legacy HMAC is supported and unsigned requests rejected',()=>{
 assert.equal(validatePaystackSignature(raw,{'x-paystack-signature':legacy()},env,now),true);
 assert.equal(validatePaystackSignature(raw,{},env,now),false);
});
test('A signed success is independently verified and stored once by reference',async()=>{
 const calls=[],res=response();
 await handlePaystackWebhook(request({'paystack-signature':modern()}),res,env,mockFetch(calls),now);
 assert.equal(res.result().code,200);assert.equal(calls.length,2);
 assert.match(calls[0].url,/paystack.co\/transaction\/verify\/hotel-123/);
 assert.match(calls[1].url,/on_conflict=reference/);
 assert.equal(calls[1].options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
 assert.equal(JSON.parse(calls[1].options.body).amount_minor,20000);
});
test('Unauthenticated and unsupported webhook requests cannot trigger verification',async()=>{
 const calls=[],res=response();
 await handlePaystackWebhook(request({},raw),res,env,mockFetch(calls),now);
 assert.equal(res.result().code,401);assert.equal(calls.length,0);
 const denied=response();
 await handlePaystackWebhook(request({},raw,'GET'),denied,env,mockFetch(calls),now);
 assert.equal(denied.result().code,405);
});
test('Unconfigured storage fails without acknowledging payment as processed',async()=>{
 const res=response();
 await handlePaystackWebhook(request({'paystack-signature':modern()}),res,{...env,SUPABASE_SERVICE_ROLE_KEY:undefined},mockFetch([]),now);
 assert.equal(res.result().code,503);
});
test('Failed storage returns retriable response',async()=>{
 const res=response();
 await handlePaystackWebhook(request({'paystack-signature':modern()}),res,env,mockFetch([],false),now);
 assert.equal(res.result().code,503);
});
test('Other signed events are accepted without writing payment records',async()=>{
 const body=Buffer.from(JSON.stringify({event:'ping'}));
 const sig=modern(body);
 const calls=[],res=response();
 await handlePaystackWebhook(request({'paystack-signature':sig},body),res,env,mockFetch(calls),now);
 assert.equal(res.result().code,200);assert.equal(calls.length,0);
});
