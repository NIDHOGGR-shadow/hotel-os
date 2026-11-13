import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateAction,ApiError} from '../server/api-core.ts';

const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const photoUi=file('catalog-galleries.js');
const media=file('hotel-media.js');
const admin=file('manage.js');
const html=file('manage.html');
const roomDetail=file('room-details.js');
const publicCatalog=file('server/public-catalog.js');
const migration=file('supabase/migrations/20261113010000_catalog_photo_galleries.sql');
const property='11111111-1111-4111-8111-111111111111';
const entity='22222222-2222-4222-8222-222222222222';
const photo='33333333-3333-4333-8333-333333333333';
const path=property+'/room-types/'+entity+'/'+photo+'.jpg';
const input={p_property:property,p_kind:'room-types',p_entity:entity,p_action:'add',p_path:path,p_caption:'Bedroom'};
test('catalog photo mutations are mapped to one allowlisted role-protected RPC',()=>{
  const action=validateAction('gallery_photo',input);
  assert.equal(action.fn,'hotel_manage_catalog_photo');
  assert.equal(action.params.p_caption,'Bedroom');
  assert.throws(()=>validateAction('gallery_photo',{...input,p_action:'pay_refund'}),ApiError);
  assert.throws(()=>validateAction('gallery_photo',{...input,p_kind:'staff-membership'}),ApiError);
  assert.throws(()=>validateAction('gallery_photo',{...input,p_caption:'x'.repeat(121)}),ApiError);
  assert.throws(()=>validateAction('gallery_photo',{...input,p_path:'https://example.com/fake.svg'}),ApiError);
});
test('catalog photos are read through the caller JWT and property scope',()=>{
  assert.match(file('server/api-core.ts'),/'catalog_photos'/);
  assert.match(admin,/operations\('catalog_photos'\)/);
  assert.match(admin,/limit:resourceOrAction==='catalog_photos'\?'1000':'100'/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/FOR SELECT TO authenticated/);
  assert.match(migration,/REVOKE ALL ON public.catalog_photos FROM PUBLIC,anon,authenticated/);
});
test('storage upload RLS uses the uploaded object path, not the room or menu name',()=>{
  assert.match(migration,/split_part\(storage\.objects\.name,'\/',1\)::uuid/);
  assert.match(migration,/rt\.property_id=split_part\(storage\.objects\.name/);
  assert.match(migration,/mi\.property_id=split_part\(storage\.objects\.name/);
  assert.match(migration,/FOR DELETE TO authenticated/);
  assert.match(migration,/public\.has_staff_role/);
});
test('at most seven photos can be attached with role checks and an audit event',()=>{
  assert.match(migration,/v_count>=7/);
  assert.match(migration,/FOR UPDATE/);
  assert.match(migration,/catalog\.photo_added/);
  assert.match(migration,/catalog\.photo_'\\|\\|p_action/);
  assert.doesNotMatch(migration,/DELETE FROM public\.room_types|DELETE FROM public\.reservations/);
});
test('gallery admin can preview, add, caption, cover, reorder and remove images',()=>{
  assert.doesNotThrow(()=>new vm.Script(photoUi));
  for(const text of ['Make cover','Save label','Remove','Upload selected photos','move_up','move_down','confirm(']){
    assert.ok(photoUi.includes(text),text);
  }
  assert.match(media,/p_action:'add'/);
  assert.match(media,/method:'DELETE'/);
  assert.match(media,/await eraseStorage\(path\)/);
  assert.match(media,/Only an owner or manager/);
});
test('gallery and room booking status are visually distinct and do not invent availability',()=>{
  assert.match(admin,/operations\('daily_reconciliation'/);
  assert.match(admin,/Payment hold/);
  assert.match(admin,/roomBookingsToday/);
  assert.match(html,/id="roomBookingDay"/);
  assert.match(file('manage.css'),/booking-held/);
  assert.match(file('manage.css'),/housekeeping-maintenance/);
});
test('rooms and dishes support multiple uploaded files while keeping cover and descriptions',()=>{
  assert.match(html,/<input name="image" type="file" multiple/);
  assert.match(html,/catalog-galleries\.js/);
  assert.match(file('catalog-admin.js'),/menu-description-preview/);
  assert.match(file('catalog-admin.js'),/HotelGalleries/);
  assert.match(admin,/HotelGalleries/);
  assert.doesNotThrow(()=>new vm.Script(file('catalog-admin.js')));
  assert.doesNotThrow(()=>new vm.Script(admin));
});
test('public catalog includes only path-validated gallery URLs with captions',()=>{
  assert.match(publicCatalog,/function catalogImageUrl/);
  assert.match(publicCatalog,/galleryFor\('room-types'/);
  assert.match(publicCatalog,/galleryFor\('menu-items'/);
  assert.match(roomDetail,/uploaded\.length\?uploaded/);
  assert.match(roomDetail,/lightboxCaption/);
  assert.doesNotThrow(()=>new vm.Script(roomDetail));
});
test('daily overview is compact while preserving reconciliation detail panels',()=>{
  for(const name of ['dailyRooms','dailyFood','dailyStock'])assert.match(html,new RegExp('id="'+name+'"'));
  assert.match(html,/class="daily-accordion"/);
  assert.match(file('manage.css'),/\.daily-accordion/);
});
