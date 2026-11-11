import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext,Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=path=>readFileSync(resolve(root,path),'utf8');
const rooms=file('rooms.html');
const detail=file('room.html');
const source=file('room-catalog.js');
const renderer=file('room-details.js');

test('Room cards offer individual detail pages, not fabricated immediate checkout',()=>{
  for(const type of ['classic','deluxe','suite'])
    assert.ok(rooms.includes('/room.html?type='+type));
  assert.match(detail,/href="\/book\.html"/);
  assert.match(detail,/Actual bookable rooms, confirmed amenities, dates and rates/);
});
test('Room details render from valid illustrative content, never from sample rates',()=>{
  assert.doesNotThrow(()=>new Script(source));
  assert.doesNotThrow(()=>new Script(renderer));
  const scope={window:{}};runInNewContext(source,scope);
  const data=scope.window.HotelRoomCatalog;
  assert.deepEqual(Object.keys(data).sort(),['classic','deluxe','suite']);
  for(const room of Object.values(data)){
    assert.ok(room.photo.startsWith('https://'));
    assert.ok(room.gallery.length>=2);
    assert.ok(room.possibilities.length>=2);
    assert.match(room.size,/example/i);
    assert.equal(room.price,undefined);
  }
});
