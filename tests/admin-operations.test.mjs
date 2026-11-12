import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAction,ApiError} from '../server/api-core.ts';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const P='11111111-1111-4111-8111-111111111111';
const R='22222222-2222-4222-8222-222222222222';
const A='33333333-3333-4333-8333-333333333333';
const IMAGE=P+'/room-types/'+R+'/'+A+'.jpg';

test('administration keeps guest booking and staff login sections',()=>{
  const html=file('manage.html');
  for(const id of ['loginSection','dashboardSection','reservationList','reservationSearch','reservationStatusFilter','newTypeForm','newMenuForm']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/hotel-media\.js/);
  assert.match(html,/name="image" type="file"/);
});

test('rejected credentials are explained without exposing server errors or email existence',()=>{
  const code=file('manage.js');
  assert.match(code,/Incorrect email or password/);
  assert.match(code,/invalid[_ ]/);
  assert.match(code,/aria-invalid/);
});

test('staff can close only with valid, explicit actions and a reason',()=>{
  const params={p_property:P,p_reservation:R,p_status:'no_show',p_note:'Guest confirmed non-arrival by telephone.'};
  const op=validateAction('close_reservation',params);
  assert.equal(op.fn,'hotel_close_reservation');
  assert.equal(op.params.p_status,'no_show');
  assert.throws(()=>validateAction('close_reservation',{...params,p_status:'checked_in'}),ApiError);
  assert.throws(()=>validateAction('close_reservation',{...params,p_note:'no'}),ApiError);
  assert.throws(()=>validateAction('close_reservation',{...params,p_override_payment:true}),ApiError);
});

test('check-in and check-out retain existing server-side authorization path',()=>{
  const op=validateAction('change_reservation',{p_property:P,p_reservation:R,p_status:'checked_out'});
  assert.equal(op.fn,'change_reservation_status');
});

test('catalog image paths are explicitly validated and cannot be arbitrary URLs',()=>{
  const input={p_property:P,p_kind:'room-types',p_entity:R,p_path:IMAGE};
  const op=validateAction('set_catalog_image',input);
  assert.equal(op.fn,'hotel_set_catalog_image');
  assert.equal(op.params.p_path,IMAGE);
  assert.throws(()=>validateAction('set_catalog_image',{...input,p_path:'https://evil.example/x.svg'}),ApiError);
  assert.throws(()=>validateAction('set_catalog_image',{...input,p_kind:'staff'}),ApiError);
  assert.throws(()=>validateAction('set_catalog_image',{...input,p_path:IMAGE+'.html'}),ApiError);
});

test('media uploader verifies bytes, size, type and staff JWT',()=>{
  const code=file('hotel-media.js');
  assert.match(code,/file\.slice\(0,12\)\.arrayBuffer\(\)/);
  assert.match(code,/file\.size>5\*1024\*1024/);
  assert.match(code,/Authorization:'Bearer '\+token/);
  assert.match(code,/withToken\(\)/);
  assert.match(code,/x-upsert':'false/);
  assert.doesNotMatch(code,/service.role|SUPABASE_SERVICE_ROLE/i);
});

test('guest photos come only from scoped stored paths',()=>{
  const code=file('server/public-catalog.js');
  assert.match(code,/function catalogImageUrl/);
  assert.match(code,/path\.startsWith\(prefix\)/);
  assert.match(code,/imageUrl:catalogImageUrl/);
  assert.match(file('catalog.js'),/room\.imageUrl\|\|guest\.roomPhoto/);
  assert.match(file('public-menu.js'),/item\.imageUrl/);
});

test('database migration permits only property-authorized staff and audits closures',()=>{
  const sql=file('supabase/migrations/20261112214500_catalog_media_reservation_actions.sql');
  assert.match(sql,/public\.has_staff_role\(\(split_part\(name,'\/',1\)\)::uuid/);
  assert.match(sql,/CREATE POLICY "Hotel media: authorized staff uploads"/);
  assert.match(sql,/TO authenticated/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hotel_close_reservation/);
  assert.match(sql,/reservation\.closed/);
  assert.match(sql,/refund_automatic',false/);
  assert.doesNotMatch(sql,/DELETE FROM public\.reservations/i);
});
