import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {Script, runInNewContext} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(resolve(root,'index.html'),'utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
const script=match?.[1] ?? '';
const inventoryMatch=script.match(/^const roomInventory=(.*);$/m);
const confirmMatch=script.match(/^function confirmReservation\(id\)\{.*\}$/m);
const occupancyMatch=script.match(/^const occupancy=\(\)=>.*?;/m);

test('Showcase JavaScript parses',()=>{
  assert.ok(script,'Expected a single inline application script');
  assert.doesNotThrow(()=>new Script(script));
});

test('Guest site routes are multi-page and staff sample access is hidden',()=>{
  for(const id of ['publicView','appView','roomGrid','appContent','modal','toast']){
    assert.ok(html.includes('id="'+id+'"'),'Missing element: '+id);
  }
  for(const page of ['rooms.html','dining.html','experiences.html','events.html','services.html','gallery.html','contact.html','book.html']){
    assert.ok(html.includes('/'+page),'Guest page link is missing: '+page);
  }
  assert.match(html,/id="navStaff" style="display:none"/);
  assert.doesNotMatch(html,/INTERACTIVE CONCEPT/);
  assert.doesNotMatch(html,/No real payments or bookings/);
});


test('Physical room inventory has 18 unique rooms in three categories',()=>{
  assert.ok(inventoryMatch,'Room inventory missing');
  const inventory=runInNewContext('('+inventoryMatch[1]+')');
  assert.deepEqual(Object.keys(inventory).sort(),['classic','deluxe','suite']);
  const all=Object.values(inventory).flat();
  assert.equal(all.length,18);
  assert.equal(new Set(all).size,18);
});

const inventory={classic:['101','102','103','104','106','107'],
  deluxe:['105','109','110','111','112','113'],
  suite:['108','114','115','116','117','118']};
const req=(type='classic',start='2026-11-12',end='2026-11-14')=>({
  id:'new',type,room:'Unassigned',start,end,status:'Pending'
});
const confirmed=(room,id='old',start='2026-11-10',end='2026-11-17')=>({
  id,room,start,end,status:'Confirmed'
});
function runConfirmation(reservations){
  assert.ok(confirmMatch,'Confirmation handler missing');
  const state={reservations};
  const notices=[];
  let renders=0;
  const confirm=runInNewContext(confirmMatch[0]+'; confirmReservation',{
    state,roomInventory:inventory,toast:(message)=>notices.push(message),
    renderApp:()=>{renders++;}
  });
  confirm('new');
  return {reservation:state.reservations[0],renders,notices};
}
test('Confirmation allocates a free room in the requested category',()=>{
  const {reservation,renders}=runConfirmation([req('deluxe'),confirmed('105')]);
  assert.equal(reservation.room,'109');
  assert.equal(reservation.status,'Confirmed');
  assert.equal(renders,1);
});

test('Confirmation never double-books overlapping dates',()=>{
  const reservations=[req(),...inventory.classic.map((room,i)=>confirmed(room,'old'+i))];
  const {reservation,renders,notices}=runConfirmation(reservations);
  assert.equal(reservation.room,'Unassigned');
  assert.equal(reservation.status,'Pending');
  assert.equal(renders,0);
  assert.match(notices.join(' '),/No available room/);
});

test('Same-day checkout and a cancelled booking do not block a new stay',()=>{
  const adjacent=runConfirmation([req(),confirmed('101','prior','2026-11-10','2026-11-12')]);
  assert.equal(adjacent.reservation.room,'101');
  const cancelled=confirmed('101');
  cancelled.status='Cancelled';
  const free=runConfirmation([req(),cancelled]);
  assert.equal(free.reservation.room,'101');
});

test('Occupied room metric uses current confirmed stays, not a fixed sample count',()=>{
  assert.ok(occupancyMatch,'Occupancy calculation missing');
  const now='2026-11-12';
  const state={reservations:[
    confirmed('101','current','2026-11-11','2026-11-14'),
    confirmed('105','future','2026-11-13','2026-11-15'),
    {...confirmed('108','cancelled','2026-11-11','2026-11-14'),status:'Cancelled'}
  ]};
  const actual=runInNewContext(occupancyMatch[0]+'; occupancy()',{
    state,daysLater:()=>now
  });
  assert.equal(actual,1);
});
