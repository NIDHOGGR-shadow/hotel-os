import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script,runInNewContext} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=path=>readFileSync(resolve(root,path),'utf8');
const dining=file('dining.html');
const venuePage=file('dining-venue.html');
const catalogSource=file('dining-catalog.js');
const renderer=file('dining-venue.js');

test('Dining landing links two venue detail journeys and no longer exposes a dead enquiry form',()=>{
  assert.match(dining,/dining-venue\.html\?venue=the-kitchen/);
  assert.match(dining,/dining-venue\.html\?venue=signature-dining/);
  assert.doesNotMatch(dining,/data-enquiry-form/);
});
test('Reusable venue page loads its own catalog and accessible destination links',()=>{
  assert.match(venuePage,/dining-catalog\.js/);
  assert.match(venuePage,/dining-venue\.js/);
  assert.match(venuePage,/id="venueMenu"/);
  assert.match(venuePage,/aria-label="Illustrative dining gallery"/);
});
test('Restaurant configuration is safe, valid JS and openly illustrative',()=>{
  assert.doesNotThrow(()=>new Script(catalogSource));
  assert.doesNotThrow(()=>new Script(renderer));
  const context={window:{}};
  runInNewContext(catalogSource,context);
  const venues=context.window.HotelDiningCatalog;
  assert.deepEqual(Object.keys(venues).sort(),['signature-dining','the-kitchen']);
  for(const venue of Object.values(venues)){
    assert.ok(venue.hero.startsWith('https://'));
    assert.ok(venue.gallery.length>=2);
    assert.ok(venue.gallery.every(photo=>photo.source.startsWith('https://')));
    assert.ok(venue.menus.length>=1);
    assert.ok(venue.menus.every(section=>section.items.length>=1));
    assert.match(venue.note,/concept|illustrative|design/i);
  }
});
