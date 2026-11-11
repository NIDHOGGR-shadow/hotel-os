import test from 'node:test';
import assert from 'node:assert/strict';
import {handleExpireHolds} from '../server/hold-expiration.js';

const secret='s'.repeat(40);
const env={
  CRON_SECRET:secret,
  SUPABASE_URL:'https://hotel-example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'service-role-example-xxxxxxxxxxxxxxxxxxxx',
  HOTEL_PROPERTY_ID:'00000000-0000-4000-8000-000000000001'
};
function response(){
  let status=200,body;
  return {setHeader(){},status(n){status=n;return this},json(v){body=v;return this},result(){return {status,body}}};
}
const good={method:'GET',headers:{authorization:'Bearer '+secret}};
test('Endpoint rejects unsafe calls before invoking Supabase',async()=>{
  for(const [req,configuration,expected] of [
    [{...good,method:'POST'},env,405],
    [good,{...env,CRON_SECRET:undefined},503],
    [{...good,headers:{authorization:'Bearer wrong'}},env,401],
    [{...good,headers:{}},env,401],
    [good,{...env,HOTEL_PROPERTY_ID:undefined},503]
  ]){
    const res=response();
    await handleExpireHolds(req,res,configuration,()=>{throw Error('Must not fetch')});
    assert.equal(res.result().status,expected);
  }
});
test('Authenticated cron call expires only pending holds in one scoped hotel property',async()=>{
  const calls=[];
  const res=response();
  await handleExpireHolds(good,res,env,async(url,options)=>{
    calls.push({url,options});
    return Response.json(3);
  });
  assert.deepEqual(res.result(),{status:200,body:{expiredUnpaidHolds:3}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://hotel-example.supabase.co/rest/v1/rpc/hotel_expire_checkout_holds');
  assert.deepEqual(JSON.parse(calls[0].options.body),{p_property:env.HOTEL_PROPERTY_ID,p_batch:250});
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
});
test('Malformed or failing upstream responses do not claim that holds were released',async()=>{
  for(const mock of [async()=>Response.json('bad'),async()=>new Response('{}',{status:500})]){
    const res=response();
    await handleExpireHolds(good,res,env,mock);
    assert.equal(res.result().status,503);
  }
});
