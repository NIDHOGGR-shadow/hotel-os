import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {handleStaffLogin,handleAdminReconciliation} from '../server/staff-reconciliation.js';
import {handlePaystackStatus} from '../server/paystack-status.js';
import {handleTestPurchaseCheckout} from '../server/test-purchase.js';

const property='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000011';
const ref='hotel-00000000-0000-4000-8000-000000000020';
const second='hotel-00000000-0000-4000-8000-000000000021';
const token='eyJhbGciOiJIUzI1NiJ9.test.jwt-auth-example-xxxxxxxxxx';
const env={
 SUPABASE_URL:'https://hotel.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_abcdefgh01234567890abcdefgh',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_abcdef01234567890abcdefgh',
 HOTEL_PROPERTY_ID:property
};
const res=()=>{
 let code=200,body;
 return {setHeader(){},status(n){code=n;return this},json(b){body=b;return this},value(){return {code,body}}}
};
const reqLogin={method:'POST',body:{email:'owner@example.com',password:'test-password-12'}};
function mock(role='owner',charges=true,more=false){
 const calls=[];
 return {
  calls,
  async request(url,options){
    const text=String(url);
    calls.push({url:text,headers:options.headers,method:options.method});
    if(text.includes('/auth/v1/token?'))return Response.json({user:{id:user},access_token:token,expires_in:3600});
    if(text.includes('/auth/v1/user'))return Response.json({id:user});
    if(text.includes('/staff_memberships?'))return Response.json(role?[{role}]:[]);
    if(text.includes('/hotel_checkout_sessions?')){
      return Response.json([
        {reference:ref,amount_minor:100000,currency:'NGN',status:'verified',
         reservation_id:'00000000-0000-4000-8000-000000000090',created_at:'2030-01-01T10:00:00Z'},
        ...(more?[{reference:second,amount_minor:200000,currency:'NGN',status:'initialized',reservation_id:null,created_at:'2030-01-02T10:00:00Z'}]:[])
      ]);
    }
    if(text.includes('/paystack_verified_charges?')){
      return Response.json(charges?[
       {reference:ref,amount_minor:100000,currency:'NGN',environment:'test',paid_at:'2030-01-01T10:10:00Z'},
       ...(more?[{reference:second,amount_minor:200000,currency:'NGN',environment:'test',paid_at:'2030-01-02T10:10:00Z'}]:[])
      ]:[]);
    }
    throw new Error('Unexpected upstream '+text);
  }
 };
}
test('A staff member must authenticate before accessing the finance report',async()=>{
 const response=res(),backend=mock();
 await handleAdminReconciliation({method:'GET',headers:{}},response,env,backend.request.bind(backend));
 assert.equal(response.value().code,403);
 assert.equal(backend.calls.length,0);
});
test('Staff sign-in returns a session only for an active owner, manager or accountant',async()=>{
 const allowed=mock('owner'),response=res();
 await handleStaffLogin(reqLogin,response,env,allowed.request.bind(allowed));
 assert.equal(response.value().code,200);
 assert.equal(response.value().body.accessToken,token);
 assert.equal(response.value().body.role,'owner');
 assert.ok(allowed.calls.some(c=>c.url.includes('/staff_memberships?')));
 assert.ok(allowed.calls.filter(c=>c.url.includes('/staff_memberships?')).every(c=>c.headers.Authorization===undefined));
 const denied=mock('front_desk'),deny=res();
 await handleStaffLogin(reqLogin,deny,env,denied.request.bind(denied));
 assert.equal(deny.value().code,403);
 assert.equal(deny.value().body.accessToken,undefined);
});
test('Server reconciles matching charges and flags paid but unconfirmed bookings',async()=>{
 const backend=mock('manager',true,true),response=res();
 await handleAdminReconciliation({method:'GET',headers:{authorization:'Bearer '+token}},response,env,backend.request.bind(backend));
 assert.equal(response.value().code,200);
 const data=response.value().body;
 assert.equal(data.summary.checkoutCount,2);
 assert.equal(data.summary.reconciledCount,1);
 assert.equal(data.summary.reconciledMinor,100000);
 assert.equal(data.summary.attentionCount,1);
 assert.deepEqual(data.records.map(r=>r.reconciliation),['reconciled','paid_needs_review']);
 assert.equal(data.records[0].paymentEnvironment,'test');
 assert.ok(backend.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.headers.apikey===env.SUPABASE_SECRET_KEY && c.headers.Authorization===undefined));
});
test('Missing verified charge cannot be counted in revenue',async()=>{
 const backend=mock('accountant',false),response=res();
 await handleAdminReconciliation({method:'GET',headers:{authorization:'Bearer '+token}},response,env,backend.request.bind(backend));
 assert.equal(response.value().code,200);
 assert.equal(response.value().body.summary.reconciledMinor,0);
 assert.equal(response.value().body.records[0].reconciliation,'missing_charge_record');
});
test('Finance is unavailable without server-side publishable AND secret keys',async()=>{
 for(const extra of [{SUPABASE_SECRET_KEY:undefined},{SUPABASE_PUBLISHABLE_KEY:undefined},{HOTEL_PROPERTY_ID:'bad'}]){
   const response=res(),backend=mock();
   await handleAdminReconciliation({method:'GET',headers:{authorization:'Bearer '+token}},response,{...env,...extra},backend.request.bind(backend));
   assert.equal(response.value().code,503);assert.equal(backend.calls.length,0);
 }
});
test('Paystack sandbox products are fixed on the server for all four demo prices',async()=>{
 const options={standard:100000,deluxe:200000,special:300000,presidential:400000};
 for(const [sku,amount] of Object.entries(options)){
   const response=res(),calls=[];
   await handleTestPurchaseCheckout({method:'POST',body:{name:'Test Guest',email:'guest@example.com',sku,amountMinor:1}},
    response,{PAYSTACK_SECRET_KEY:'sk_test_abc',HOTEL_TEST_PURCHASE_ENABLED:'true'},
    async(url,opts)=>{
      calls.push(JSON.parse(opts.body));
      return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/valid123',reference:calls.at(-1).reference}});
    });
   assert.equal(response.value().code,200);
   assert.equal(response.value().body.amountMinor,amount);
   assert.equal(calls[0].amount,String(amount));
   assert.equal(calls[0].metadata.demo_sku,sku);
 }
});
test('Verified demo payment receipts support exact catalogue amounts but reject mismatches',async()=>{
 const demonstration='hoteldemo-00000000-0000-4000-8000-000000000015';
 async function status(amount,sku){
   const r=res();
   await handlePaystackStatus({method:'GET',query:{reference:demonstration}},r,
    {PAYSTACK_SECRET_KEY:'sk_test_abc',SUPABASE_URL:env.SUPABASE_URL,SUPABASE_SECRET_KEY:env.SUPABASE_SECRET_KEY},
    async url=>{
     if(String(url).includes('api.paystack.co'))return Response.json({status:true,data:{
      reference:demonstration,status:'success',domain:'test',amount,currency:'NGN',metadata:{hotel_os_demo:true,demo_sku:sku},paid_at:'2030-01-01T10:00:00Z'
     }});
     return Response.json([{amount_minor:amount,currency:'NGN',environment:'test'}]);
    });
   return r.value().body;
 }
 const valid=await status(200000,'deluxe');
 assert.equal(valid.receipt.amountMinor,200000);
 assert.equal(valid.demoPurchase,true);
 assert.equal(valid.receipt.itemLabel,'Deluxe Room demo');
 const wrong=await status(300000,'deluxe');
 assert.equal(wrong.receipt,undefined);
 assert.equal(wrong.demoPurchase,undefined);
});
test('Receipt interface and staff portal are present and browser JS syntax is valid',()=>{
 for(const file of ['guest-receipts.js','receipts.js','site-shell.js','admin-reconciliation.js']){
  execFileSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname]);
 }
 const callback=readFileSync(new URL('../payment-callback.html',import.meta.url),'utf8');
 const guest=readFileSync(new URL('../receipts.html',import.meta.url),'utf8');
 const finance=readFileSync(new URL('../admin-reconciliation.html',import.meta.url),'utf8');
 assert.match(callback,/guest-receipts\.js/);
 assert.match(callback,/saveVerified/);
 assert.match(callback,/Download receipt/);
 assert.match(guest,/Your receipts, all in one place/);
 assert.match(finance,/id="exceptionsTab"/);
 assert.match(finance,/id="exportCsv"/);
 assert.match(finance,/staffLogin/);
});
