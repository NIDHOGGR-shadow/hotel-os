import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext,Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=path=>readFileSync(resolve(root,path),'utf8');
const rooms=file('rooms.html'),detail=file('room.html');
const source=file('room-catalog.js'),renderer=file('room-details.js');

test('Room collection goes to individual room detail pages before checkout',()=>{
  for(const slug of ['classic','deluxe','suite'])
    assert.ok(rooms.includes('/room.html?type='+slug));
  assert.match(detail,/id="roomStayForm"/);
  assert.match(detail,/id="roomRate"/);
  assert.match(detail,/action="\/book\.html"/);
  assert.match(detail,/name="checkIn"/);
  assert.match(detail,/name="checkOut"/);
  assert.match(detail,/id="roomLightbox"/);
});
test('Room descriptions and proposed photography have no hard-coded real prices',()=>{
  assert.doesNotThrow(()=>new Script(source));
  assert.doesNotThrow(()=>new Script(renderer));
  const scope={window:{}};runInNewContext(source,scope);
  const items=scope.window.HotelRoomCatalog;
  assert.deepEqual(Object.keys(items).sort(),['classic','deluxe','suite']);
  for(const room of Object.values(items)){
    assert.ok(room.photo.startsWith('https://'));
    assert.ok(room.gallery.length>=2);
    assert.ok(room.possibilities.length>=2);
    assert.equal(room.price,undefined);
  }
});
test('Room detail route accepts verified database room IDs and passes them to booking only if matched',()=>{
  assert.match(renderer,/get\('id'\)/);
  assert.match(renderer,/\/api\/public-catalog/);
  assert.match(renderer,/rows\.find\(r=>r\.id===id\)/);
  assert.match(renderer,/name='roomTypeId'/);
  assert.match(renderer,/Number\.isSafeInteger\(rate\)/);
  assert.match(renderer,/lightboxClose/);
});
