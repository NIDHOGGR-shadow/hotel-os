import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sql=readFileSync(resolve(root,'supabase/migrations/20261111014000_booking_integrity.sql'),'utf8');
function body(name) {
  const start=sql.indexOf('create or replace function public.'+name+'(');
  assert.ok(start>=0,'Missing updated SQL function '+name);
  const end=sql.indexOf('$$;',start);
  assert.ok(end>start,'Incomplete SQL function '+name);
  return sql.slice(start,end+3);
}

test('Expiration is bounded, serializes against payment verification, and releases only unpaid rooms',()=>{
  const f=body('hotel_expire_checkout_holds');
  assert.match(f,/s\.status in \('pending','initialized'\)/);
  assert.match(f,/s\.expires_at<=now\(\)/);
  assert.match(f,/for update of s skip locked/);
  assert.match(f,/r\.status='payment_pending'/);
  assert.match(f,/set status='cancelled'/);
  assert.match(f,/set status='expired'/);
  assert.match(sql,/revoke all on function public\.hotel_expire_checkout_holds\(uuid,integer\) from public,anon,authenticated/);
});
test('Guest availability and checkout both clear expired unpaid holds',()=>{
  for(const name of ['hotel_public_availability','hotel_create_checkout'])
    assert.match(body(name),/perform public\.hotel_expire_checkout_holds\(p_property,/);
});
test('Staff allocation respects unpaid online holds, room readiness, and row locks',()=>{
  const f=body('create_room_reservation');
  assert.match(f,/status in \('payment_pending','confirmed','checked_in'\)/);
  assert.match(f,/r\.condition='ready'/);
  assert.match(f,/for update of r skip locked/);
  assert.match(f,/perform public\.hotel_expire_checkout_holds\(p_property,/);
});
test('Webhook reconciliation posts both accommodation charge and payment once',()=>{
  const f=body('hotel_complete_checkout');
  assert.match(f,/'room_charge',v_session\.amount_minor,'Accommodation',v_session\.reservation_id/);
  assert.match(f,/'payment',p_amount_minor,'Paystack room payment',v_transaction/);
  assert.match(f,/on conflict do nothing/g);
  assert.match(f,/v_session\.amount_minor<>p_amount_minor/);
});
test('Late payments are held for manual reconciliation without blocking the room',()=>{
  const f=body('hotel_complete_checkout');
  assert.match(f,/now\(\)>v_session\.expires_at/);
  assert.match(f,/set status='manual_review'/);
  assert.match(f,/where id=v_session\.reservation_id and status='payment_pending'/);
});
