import test from 'node:test';import assert from 'node:assert/strict';
import {handleFood,handleFoodReceipt,foodReady,matchesFood} from '../server/food-purchases.js';
import {handleReceiptVerification} from '../server/receipt-verification.js';
const property='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_abcdefgh0123456789abcdefgh',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_abcdefgh0123456789abcdefgh',HOTEL_PROPERTY_ID:property,HOTEL_PAYMENTS_ENABLED:'true',PAYSTACK_SECRET_KEY:'sk_live_fake'};
function res(){let status,body;return {setHeader(){},status(v){status=v;return this},json(v){body=v;return this},get(){return {status,body}}}}
const payload={itemId:id,quantity:1,quotedAmount:30000,deliveryKind:'room',deliveryLabel:'101',email:'test@example.invalid'};
test('only a live Paystack key enables real food checkout',()=>{assert.equal(foodReady(env),true);assert.equal(foodReady({...env,PAYSTACK_SECRET_KEY:'sk_test_fake'}),false)});
test('checkout uses server price, persists order before sending amount to Paystack',async()=>{const out=res();let saved;await handleFood({method:'POST',body:payload},out,env,async(url,opts)=>{if(url.includes('/menu_items?'))return Response.json([{id,name:'Sweets',price_minor:30000}]);if(url.endsWith('/hotel_food_purchases')){saved=JSON.parse(opts.body);return new Response(null,{status:204})}const body=JSON.parse(opts.body);assert.equal(body.amount,'30000');assert.equal(body.reference,saved.reference);assert.equal(saved.unit_minor,30000);assert.equal(saved.delivery_label,'101');return Response.json({status:true,data:{reference:body.reference,authorization_url:'https://checkout.paystack.com/abc123'}})});assert.equal(out.get().status,200)});
test('rejects price changes before creating order or charge',async()=>{const out=res();let calls=0;await handleFood({method:'POST',body:{...payload,quotedAmount:1}},out,env,async()=>{calls++;return Response.json([{id,name:'Sweets',price_minor:30000}])});assert.equal(out.get().status,409);assert.equal(calls,1)});
test('only exact live charge matches food receipt',()=>{const row={reference:'food-'+id,amount_minor:30000},tx={reference:row.reference,amount:30000,currency:'NGN',status:'success',domain:'live'};assert.ok(matchesFood(row,tx));assert.ok(!matchesFood(row,{...tx,amount:1}));assert.ok(!matchesFood(row,{...tx,domain:'test'}));assert.ok(!matchesFood(row,{...tx,status:'reversed'}))});
test('receipt verification and redemption require an authorized staff session',async()=>{for(const method of ['GET','POST']){const out=res();await handleReceiptVerification({method,query:{reference:'food-'+id},body:{reference:'food-'+id},headers:{}},out,env,async()=>{throw Error('no network allowed')});assert.equal(out.get().status,403)}});
test('QR dependency produces a genuine local PNG without external services',async()=>{const {default:qr}=await import('qrcode');assert.match(await qr.toDataURL('food-'+id),/^data:image\/png;base64,/)});


test('provider rejection reports safe failure stage without logging provider or customer data',async()=>{
 const out=res(),logs=[],original=console.error;console.error=(...args)=>logs.push(args);
 try{
  await handleFood({method:'POST',body:payload},out,env,async(url)=>{
   if(url.includes('/menu_items?'))return Response.json([{id,name:'Sweets',price_minor:30000}]);
   if(url.endsWith('/hotel_food_purchases'))return new Response(null,{status:204});
   return Response.json({status:false,message:'private provider details '+payload.email},{status:403});
  });
 }finally{console.error=original}
 assert.equal(out.get().status,503);
 assert.equal(logs.length,1);
 assert.equal(logs[0][0],'food_checkout_failed');
 assert.deepEqual(JSON.parse(logs[0][1]),{stage:'provider_response',providerStatus:403,providerResult:'rejected',timeout:false});
 assert.doesNotMatch(JSON.stringify(logs),/private provider details|test@example|sk_live_/);
});

test('missing provider reference is pending, but authentication and merchant errors are not',async()=>{
 const ref='food-'+id;
 const original=console.error;console.error=()=>{};
 try{
  for(const [status,message,expected] of [[400,'Transaction reference not found',200],[401,'Invalid key',503],[403,'Integration has been deactivated',503]]){
   const out=res();
   await handleFoodReceipt({method:'GET',query:{reference:ref}},out,env,async(url)=>{
    if(url.includes('/rest/v1/'))return Response.json([{reference:ref,amount_minor:30000}]);
    return Response.json({status:false,message},{status});
   });
   assert.equal(out.get().status,expected);
   if(expected===200)assert.equal(out.get().body.paymentStatus,'pending');
  }
 }finally{console.error=original}
});

test('production-style empty 201 order insert reaches Paystack with authoritative price',async()=>{
 const out=res();let reference,initialized=false;
 await handleFood({method:'POST',body:payload},out,env,async(url,opts)=>{
  if(url.includes('/menu_items?'))return Response.json([{id,name:'Sweets',price_minor:30000}]);
  if(url.endsWith('/hotel_food_purchases')){
   assert.equal(opts.headers.Prefer,'return=minimal');
   reference=JSON.parse(opts.body).reference;
   return new Response(null,{status:201});
  }
  assert.equal(url,'https://api.paystack.co/transaction/initialize');
  const body=JSON.parse(opts.body);assert.equal(body.amount,'30000');assert.equal(body.reference,reference);
  initialized=true;
  return Response.json({status:true,data:{reference,authorization_url:'https://checkout.paystack.com/abc123'}});
 });
 assert.equal(initialized,true);assert.equal(out.get().status,200);
 assert.equal(out.get().body.authorizationUrl,'https://checkout.paystack.com/abc123');
});
test('verified food receipt tolerates empty 201 ledger insert and 204 order update',async()=>{
 const out=res(),ref='food-'+id,row={reference:ref,amount_minor:30000,item_name:'Sweets',quantity:1};
 let saved=false,updated=false;
 await handleFoodReceipt({method:'GET',query:{reference:ref}},out,env,async(url,opts={})=>{
  if(url.includes('api.paystack.co'))return Response.json({status:true,data:{id:123,reference:ref,domain:'live',currency:'NGN',status:'success',amount:30000,paid_at:'2026-11-27T10:00:00Z'}});
  if(url.includes('paystack_verified_charges')&&opts.method==='POST'){saved=true;return new Response(null,{status:201})}
  if(url.includes('paystack_verified_charges'))return Response.json([{environment:'live',currency:'NGN',amount_minor:30000}]);
  if(opts.method==='PATCH'){updated=true;return new Response(null,{status:204})}
  return Response.json([row]);
 });
 assert.equal(saved,true);assert.equal(updated,true);assert.equal(out.get().status,200);assert.equal(out.get().body.paymentStatus,'verified');
});
