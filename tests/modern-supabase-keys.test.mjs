import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseUrl,supabaseServerKey,supabasePublishableKey,supabaseAdminHeaders} from '../server/supabase-keys.js';
import {handlePublicCatalog} from '../server/public-catalog.js';
import {handlePublicAvailability} from '../server/public-booking.js';
import {handleOperations} from '../server/api-core.ts';

const publishable='sb_publishable_TEST_PLACEHOLDER';
const secret='sb_secret_TEST_PLACEHOLDER_SERVICE_ONLY';
const property='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const room='33333333-3333-4333-8333-333333333333';
const config={
  SUPABASE_URL:'https://hotel-sandbox.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:publishable,
  SUPABASE_SECRET_KEY:secret,
  HOTEL_PROPERTY_ID:property
};
function makeResponse(){
  let status=200,body;
  return {setHeader(){},status(n){status=n;return this},json(x){body=x;return this},result(){return {status,body}}};
}
test('New opaque Supabase secrets go ONLY in apikey, never Authorization Bearer',()=>{
  const h=supabaseAdminHeaders(secret);
  assert.equal(h.apikey,secret);
  assert.equal(h.Authorization,undefined);
  assert.equal(h.Accept,'application/json');
  assert.deepEqual(supabaseAdminHeaders('legacy.jwt.value'),{
    apikey:'legacy.jwt.value',Accept:'application/json',Authorization:'Bearer legacy.jwt.value'
  });
});
test('Modern Vercel env names resolve and legacy variables remain supported',()=>{
  assert.equal(supabaseUrl(config),'https://hotel-sandbox.supabase.co');
  assert.equal(supabaseServerKey(config),secret);
  assert.equal(supabasePublishableKey(config),publishable);
  assert.equal(supabasePublishableKey({NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishable}),publishable);
  assert.equal(supabaseServerKey({SUPABASE_SERVICE_ROLE_KEY:'legacy-service'}),'legacy-service');
});
test('Public room catalog with a secret key makes an apikey-only request',async()=>{
  const calls=[],res=makeResponse();
  await handlePublicCatalog({method:'GET'},res,config,async(url,options)=>{
    calls.push({url,options});
    return Response.json([{id:room,name:'Deluxe',capacity:2,nightly_rate_minor:12500000}]);
  });
  assert.equal(res.result().status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers.apikey,secret);
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.doesNotMatch(JSON.stringify(res.result()),/sb_secret_/);
});
test('Availability uses apikey only for privileged RPC',async()=>{
  const calls=[],res=makeResponse();
  await handlePublicAvailability({
    method:'GET',query:{checkIn:'2026-11-13',checkOut:'2026-11-14',guests:'2'}
  },res,config,async(url,options)=>{
    calls.push({url,options});
    return Response.json([]);
  },Date.UTC(2026,10,11));
  assert.equal(res.result().status,200);
  assert.match(calls[0].url,/hotel_public_availability/);
  assert.equal(calls[0].options.headers.apikey,secret);
  assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('Authenticated staff API uses publishable apikey and the user JWT independently',async()=>{
  const calls=[],res=makeResponse();
  await handleOperations({
    method:'GET',headers:{authorization:'Bearer real-user-jwt'},
    query:{resource:'room_types',property_id:property}
  },res,config,async(url,options)=>{
    calls.push({url,options});
    return String(url).endsWith('/auth/v1/user')?Response.json({id:user}):Response.json([]);
  });
  assert.equal(res.result().status,200);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.options.headers.apikey,publishable);
    assert.equal(call.options.headers.Authorization,'Bearer real-user-jwt');
  }
  assert.equal(JSON.stringify(res.result()).includes(secret),false);
});
