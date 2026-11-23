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
