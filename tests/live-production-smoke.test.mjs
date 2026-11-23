import test from 'node:test';
import assert from 'node:assert/strict';

// Read-only, real HTTP smoke check performed by hosted CI.
// Does not start a room hold or payment.
test('deployed production Hotel OS serves live availability for real future dates', {
 skip:process.env.GITHUB_ACTIONS!=='true',
 timeout:20000
},async()=>{
 const dateAt=(offset)=>{
  const day=new Date(Date.now()+offset*86400000);
  return day.toISOString().slice(0,10);
 };
 const checkIn=dateAt(3),checkOut=dateAt(4);
 const base='https://hotel-os-livid.vercel.app';
 const params=new URLSearchParams({checkIn,checkOut,guests:'2'});
 const response=await fetch(base+'/api/public-availability?'+params,{
   method:'GET',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(14000)
 });
 const value=await response.json();
 assert.equal(response.status,200,'Production availability HTTP '+response.status+': '+(value?.error||'No public details'));
 assert.ok(Array.isArray(value?.rooms),'The public API should return room rows');
 assert.ok(value.rooms.length>=1,'There should be at least one configured room type');
 const seen=new Set();
 for(const room of value.rooms){
  assert.match(room.id,/^[a-f0-9-]{36}$/);
  assert.ok(!seen.has(room.id),'Room types should be unique');
  seen.add(room.id);
  assert.ok(typeof room.name==='string' && room.name.trim().length>0);
  assert.ok(Number.isSafeInteger(room.availableRooms)&&room.availableRooms>=0);
  assert.ok(Number.isSafeInteger(room.nightlyRateMinor)&&room.nightlyRateMinor>0);
  assert.ok(Number.isInteger(room.capacity)&&room.capacity>0);
 }
 console.log('Live production availability smoke PASSED; room types:',value.rooms.length,
  'for a future 1-night stay; no booking or payment was created.');
});


test('deployed production exposes safe checkout readiness but no payment credentials', {
 skip:process.env.GITHUB_ACTIONS!=='true',
 timeout:20000
},async()=>{
 const base='https://hotel-os-livid.vercel.app';
 const [realCheckout,sandbox,finance]=await Promise.all([
   fetch(base+'/api/paystack-checkout',{cache:'no-store',signal:AbortSignal.timeout(14000)}),
   fetch(base+'/api/test-purchase-checkout',{cache:'no-store',signal:AbortSignal.timeout(14000)}),
   fetch(base+'/api/admin-reconciliation',{cache:'no-store',signal:AbortSignal.timeout(14000)})
 ]);
 assert.equal(realCheckout.status,200,'Real checkout readiness must be a safe read-only GET');
 const real=await realCheckout.json();
 assert.equal(typeof real.checkoutAvailable,'boolean');
 assert.equal(typeof real.message,'string');
 assert.equal(sandbox.status,200,'Sandbox readiness must be a safe read-only GET');
 const testInfo=await sandbox.json();
 assert.equal(typeof testInfo.enabled,'boolean');
 assert.equal(testInfo.mode,'test');
 assert.deepEqual(testInfo.products.map(p=>p.amountMinor),[100000,200000,300000,400000]);
 // Staff finance reports must never be public, even if a payment is on file.
 assert.equal(finance.status,403,'An unauthenticated visitor must not see finance records');
 const financeResponse=await finance.json();
 assert.ok(!('records' in financeResponse));
 assert.ok(!('accessToken' in financeResponse));
 const responses=JSON.stringify({real,testInfo,financeResponse});
 assert.doesNotMatch(responses,/(?:sk_test_|sk_live_|sb_secret_|SUPABASE_SECRET_KEY|PAYSTACK_SECRET_KEY)/);
 console.log('Live readiness and unauthenticated finance access controls PASSED; no payments created.');
});
