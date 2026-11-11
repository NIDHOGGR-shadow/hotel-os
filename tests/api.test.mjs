import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOperations,validateAction,resources,actions} from '../server/api-core.ts';

const user='11111111-1111-4111-8111-111111111111';
const property='22222222-2222-4222-8222-222222222222';
const roomType='33333333-3333-4333-8333-333333333333';
const guest='44444444-4444-4444-8444-444444444444';
const key='55555555-5555-4555-8555-555555555555';
const env={SUPABASE_URL:'https://hotel-os.supabase.co',SUPABASE_ANON_KEY:'public-anon-key'};
const headers={authorization:'Bearer valid-jwt'};
function response(){
 let status=200;const hs={};let body;
 return {status(n){status=n;return this;},setHeader(k,v){hs[k]=v;return this;},
   json(v){body=v;},result(){return {status,headers:hs,body};}};
}
function remote(calls=[],value=[]){
 return async (url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:user});
  return Response.json(value);
 };
}
async function run(req,fetcher=remote(),config=env){
 const res=response();await handleOperations({headers,...req},res,config,fetcher);
 return res.result();
}
test('Mutation actions are explicitly mapped and syntactically safe',()=>{
 assert.equal(Object.keys(actions).length,18);
 for(const [name,a] of Object.entries(actions)){
  assert.match(name,/^[a-z_]+$/);
  assert.match(a.fn,/^[a-z_]+$/);
  assert.ok(a.fields.length>0);
 }
});
test('Arbitrary tables and database SQL are inaccessible',async()=>{
 const calls=[];const res=await run({method:'GET',query:{resource:'auth.users',property_id:property}},remote(calls));
 assert.equal(res.status,404);assert.equal(calls.length,1);
 assert.equal(resources.has('auth.users'),false);
 assert.throws(()=>validateAction('run_sql',{sql:'delete from reservations'}),/Unknown action/);
});
test('Missing bearer token cannot reach the database',async()=>{
 const calls=[];const res=response();
 await handleOperations({method:'GET',headers:{},query:{resource:'properties'}},res,env,remote(calls));
 assert.equal(res.result().status,401);assert.equal(calls.length,0);
});
test('Supabase Auth must validate the token',async()=>{
 const calls=[];
 const denied=async (url,options)=>{calls.push({url,options});return Response.json({message:'invalid'},{status:401});};
 const res=await run({method:'GET',query:{resource:'properties'}},denied);
 assert.equal(res.status,401);assert.equal(calls.length,1);
});
test('Properties list uses the caller JWT, never a service role',async()=>{
 const calls=[];const res=await run({method:'GET',query:{resource:'properties'}},remote(calls));
 assert.equal(res.status,200);assert.deepEqual(res.body,{data:[]});
 assert.match(calls[1].url,/\/rest\/v1\/properties\?/);
 assert.equal(calls[1].options.headers.Authorization,'Bearer valid-jwt');
 assert.equal(calls[1].options.headers.apikey,env.SUPABASE_ANON_KEY);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('Every property-scoped read includes a property filter and bounded limit',async()=>{
 const calls=[];
 const res=await run({method:'GET',query:{resource:'rooms',property_id:property,limit:'10'}},remote(calls));
 assert.equal(res.status,200);
 const uri=new URL(calls[1].url);
 assert.equal(uri.searchParams.get('property_id'),'eq.'+property);
 assert.equal(uri.searchParams.get('limit'),'10');
 for(const limit of ['101','0','hello']){
  const denied=await run({method:'GET',query:{resource:'rooms',property_id:property,limit}},remote());
  assert.equal(denied.status,422);
 }
});
test('Invalid property scope is rejected before querying records',async()=>{
 for(const property_id of [undefined,'not-a-uuid']){
  const result=await run({method:'GET',query:{resource:'guests',property_id}},remote());
  assert.equal(result.status,422);
 }
});
test('Reservation maps to a vetted SQL RPC and preserves request idempotency key',async()=>{
 const calls=[];
 const data={p_property:property,p_guest:guest,p_room_type:roomType,p_check_in:'2026-12-01',
  p_check_out:'2026-12-04',p_request_key:key};
 const res=await run({method:'POST',query:{action:'create_reservation'},body:data},remote(calls,'reservation-id'));
 assert.equal(res.status,200);assert.equal(res.body.data,'reservation-id');
 assert.equal(calls[1].url,env.SUPABASE_URL+'/rest/v1/rpc/create_room_reservation');
 assert.deepEqual(JSON.parse(calls[1].options.body),data);
});
test('Unexpected and missing mutation fields are rejected',()=>{
 const base={p_property:property,p_guest:guest,p_room_type:roomType,
  p_check_in:'2026-12-01',p_check_out:'2026-12-03',p_request_key:key};
 assert.throws(()=>validateAction('create_reservation',{...base,admin:true}),/Unrecognized field/);
 assert.throws(()=>validateAction('create_reservation',{...base,p_guest:undefined}),/Missing p_guest/);
});
test('Invalid calendar dates and reversed stays cannot be booked',()=>{
 const base={p_property:property,p_guest:guest,p_room_type:roomType,p_request_key:key};
 assert.throws(()=>validateAction('create_reservation',{...base,p_check_in:'2026-02-30',p_check_out:'2026-03-03'}),/Invalid date/);
 assert.throws(()=>validateAction('create_reservation',{...base,p_check_in:'2026-12-04',p_check_out:'2026-12-01'}),/Departure/);
});
test('Money and quantity values are validated before reaching the backend',()=>{
 for(const amount of [-1,NaN,Infinity,2.4,Number.MAX_SAFE_INTEGER+2])
  assert.throws(()=>validateAction('set_room_rate',{p_property:property,p_room_type:roomType,p_rate_minor:amount}),/Invalid amount/);
 for(const delta of [0,NaN,Infinity,1.0001])
  assert.throws(()=>validateAction('stock_adjustment',{p_property:property,p_item:roomType,p_delta:delta,p_reason:'receipt',p_request_key:key}),/Invalid quantity/);
});
test('Guest staff operations cannot request owner role',()=>{
 assert.throws(()=>validateAction('add_staff',{p_property:property,p_user:guest,p_role:'owner'}),/Invalid role/);
 assert.throws(()=>validateAction('stock_adjustment',{p_property:property,p_item:roomType,p_delta:2,p_reason:'sale',p_request_key:key}),/Invalid reason/);
});
test('Unconfigured database explicitly fails closed',async()=>{
 const res=await run({method:'GET',query:{resource:'properties'}},remote(),{});
 assert.equal(res.status,503);
});
test('Database overlap errors map to 409 without exposing SQL internals',async()=>{
 const fetcher=async url=>String(url).includes('/auth/')?Response.json({id:user}):
 Response.json({code:'23P01',message:'internal relation detail'},{status:409});
 const data={p_property:property,p_guest:guest,p_room_type:roomType,
  p_check_in:'2026-12-01',p_check_out:'2026-12-03',p_request_key:key};
 const res=await run({method:'POST',query:{action:'create_reservation'},body:data},fetcher);
 assert.equal(res.status,409);assert.match(res.body.error,/conflicting/);
 assert.ok(!JSON.stringify(res.body).includes('internal relation'));
});
test('Unsupported mutation HTTP methods are rejected immediately',async()=>{
 const calls=[];const res=await run({method:'DELETE'},remote(calls));
 assert.equal(res.status,405);assert.equal(calls.length,0);
});
