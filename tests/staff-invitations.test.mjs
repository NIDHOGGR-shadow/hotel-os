import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleStaffInvite} from '../server/staff-invitations.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');
const secret='sb_secret_SERVER_ONLY_TEST_KEY', publishable='sb_publishable_TEST_PUBLIC';
const property='11111111-1111-4111-8111-111111111111';
const env={
 SUPABASE_URL:'https://example-project.supabase.co',SUPABASE_SECRET_KEY:secret,
 SUPABASE_PUBLISHABLE_KEY:publishable,HOTEL_PROPERTY_ID:property,
 HOTEL_PUBLIC_URL:'https://hotel-os-livid.vercel.app'
};
const req={method:'POST',headers:{authorization:'Bearer owner-jwt'},body:{email:'Staff@Example.Com',role:'front_desk'}};
function response(){
 let status=200,body;
 return {setHeader(){},status(n){status=n;return this},json(value){body=value;return this},result(){return {status,body}}};
}
test('Staff invites require authenticated owner session, config, and non-owner role',async()=>{
 for(const [request,configuration,expected] of [
  [{...req,method:'GET'},env,405],[{...req,headers:{}},env,401],
  [req,{...env,SUPABASE_SECRET_KEY:undefined},503],
  [req,{...env,HOTEL_PROPERTY_ID:undefined},503],
  [{...req,body:{email:'x@x.com',role:'owner'}},env,422],
  [{...req,body:{email:'invalid',role:'front_desk'}},env,422]
 ]){
  const res=response();
  await handleStaffInvite(request,res,configuration,()=>{throw Error('Unexpected network call')});
  assert.equal(res.result().status,expected);
 }
});
test('Owner JWT authorization occurs before privileged email invite; service key remains server only',async()=>{
 const calls=[],res=response();
 await handleStaffInvite(req,res,env,async(url,options)=>{calls.push({url,options});return Response.json({ok:true});});
 assert.equal(res.result().status,200);
 assert.deepEqual([res.result().body.invitationSaved,res.result().body.emailSent],[true,true]);
 assert.equal(calls.length,3);
 assert.match(calls[0].url,/\/auth\/v1\/user$/);
 assert.match(calls[1].url,/\/rpc\/hotel_invite_staff$/);
 assert.match(calls[2].url,/\/auth\/v1\/invite\?redirect_to=/);
 assert.deepEqual(JSON.parse(calls[1].options.body),{
  p_property:property,p_email:'staff@example.com',p_role:'front_desk'
 });
 assert.equal(calls[1].options.headers.Authorization,'Bearer owner-jwt');
 assert.equal(calls[2].options.headers.apikey,secret);
 assert.equal(calls[2].options.headers.Authorization,undefined);
 assert.doesNotMatch(JSON.stringify(res.result()),/sb_secret_/);
});
test('Rejected owner RPC cannot send admin email',async()=>{
 const res=response(),calls=[];
 await handleStaffInvite(req,res,env,async(url)=>{
  calls.push(url);
  return url.includes('hotel_invite_staff')?Response.json({}, {status:403}):Response.json({id:'user'});
 });
 assert.equal(res.result().status,403);
 assert.equal(calls.length,2);
});
test('Email service failure is disclosed; never falsely states the invite was sent',async()=>{
 const res=response();
 await handleStaffInvite(req,res,env,async(url)=>url.includes('/auth/v1/invite')?
  Response.json({}, {status:429}):Response.json({ok:true}));
 assert.equal(res.result().status,503);
 assert.equal(res.result().body.invitationSaved,true);
 assert.equal(res.result().body.emailSent,false);
});
test('Staff invitations are privately stored and claim only a matching confirmed account',()=>{
 const sql=file('supabase/migrations/20261111016000_staff_invites.sql');
 assert.match(sql,/public\.has_staff_role\(p_property,array\['owner'\]\)/);
 assert.match(sql,/v_confirmed is null/);
 assert.match(sql,/i\.email=v_email/);
 assert.match(sql,/i\.expires_at>now\(\)/);
 assert.match(sql,/m\.user_id=v_user/);
 assert.match(sql,/on conflict\(property_id,user_id\) do nothing/);
 assert.match(sql,/revoke all on table hotel_private\.staff_invites from public,anon,authenticated/);
 assert.match(sql,/staff\.invitation_accepted/);
 assert.doesNotMatch(sql,/@gmail/);
});
