import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const home=read('index.html');

test('Homepage is premium, mobile-aware, and does not serve the old 800 KB fake booking application',()=>{
  assert.ok(Buffer.byteLength(home)<40000,'Homepage should be compact');
  assert.match(home,/class="home-hero"/);
  assert.match(home,/id="homeBooking"/);
  assert.match(home,/id="homeRooms"/);
  assert.match(home,/id="siteMenu" hidden/);
  assert.match(home,/src="\/home-experience\.js"/);
  assert.match(home,/src="\/hotel\.js"/);
  for(const fragment of ['roomInventory','publicView','appView','confirmReservation(']){
    assert.ok(!home.includes(fragment),'Legacy demo must not remain on guest homepage: '+fragment);
  }
});
test('Hotel navigation links to dedicated guest experiences, not an oversized single-page application',()=>{
  for(const page of ['rooms.html','dining.html','experiences.html','events.html','services.html','gallery.html','contact.html','book.html']){
    assert.ok(home.includes('/'+page),'Guest page link missing: '+page);
    assert.ok(existsSync(resolve(root,page)),'Missing page file: '+page);
  }
  assert.ok(existsSync(resolve(root,'room.html')));
  assert.ok(existsSync(resolve(root,'dining-venue.html')));
  assert.match(home,/class="skip-link"/);
});
test('Guest experience avoids raw technical setup errors and fabricated checkout confirmations',()=>{
  for(const page of ['index.html','rooms.html','room.html','book.html']){
    const content=read(page);
    assert.doesNotMatch(content,/Hotel availability is not connected to a property yet/);
    assert.doesNotMatch(content,/Payment not integrated yet/);
    assert.doesNotMatch(content,/INTERACTIVE CONCEPT/);
    assert.doesNotMatch(content,/Payment successful!/);
  }
  const js=read('booking.js');
  assert.match(js,/\/api\/public-availability/);
  assert.match(js,/\/api\/paystack-checkout/);
  assert.match(js,/room\.html\?id=/);
  assert.doesNotMatch(js,/localStorage/);
});
test('All new client-side modules parse without syntax errors',()=>{
  for(const file of ['home-experience.js','catalog.js','room-catalog.js','room-details.js','booking.js','dining-catalog.js','dining-venue.js']){
    assert.doesNotThrow(()=>new Script(read(file)),file);
  }
});
test('Room and dining pages load responsive design system',()=>{
  for(const page of ['index.html','rooms.html','room.html','book.html','dining.html','dining-venue.html']){
    assert.match(read(page),/href="\/experience\.css"/);
  }
});
