import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {actions,resources} from '../server/api-core.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema=readFileSync(resolve(root,'supabase/migrations/20261111010000_schema.sql'),'utf8');
const procedures=readFileSync(resolve(root,'supabase/migrations/20261111011000_operations.sql'),'utf8');
test('Every allowed mutation is implemented as an explicit role-protected RPC',()=>{
 for(const {fn} of Object.values(actions)){
  assert.ok(procedures.includes('create function public.'+fn+'('),'Missing function '+fn);
  assert.ok(procedures.includes('grant execute on function public.'+fn+'('),'Missing grant '+fn);
 }
 assert.equal(Object.keys(actions).length,18);
});
test('Every domain table enables property-scoped RLS',()=>{
 const names=[...schema.matchAll(/create table public\.([a-z_]+)\s*\(/g)].map(m=>m[1]);
 assert.equal(names.length,24);
 for(const name of names){
  assert.ok(schema.includes('alter table public.'+name+' enable row level security;'),'Missing RLS '+name);
  assert.ok(schema.includes(' on public.'+name+' for select to authenticated'),'Missing read policy '+name);
  assert.ok(resources.has(name),'Unexpected table '+name);
 }
});
test('Structural constraints protect bookings and cross-property relationships',()=>{
 assert.match(schema,/constraint no_overlapping_room_stays exclude using gist/);
 assert.match(schema,/daterange\(check_in,check_out,'\[\)'\) with &&/);
 assert.match(schema,/foreign key\(property_id,room_id\) references public\.rooms\(property_id,id\)/);
 assert.match(schema,/create unique index one_stock_sale_per_order_item/);
 assert.match(schema,/security_invoker=true/);
 assert.match(procedures,/pg_advisory_xact_lock/);
 assert.match(procedures,/guest_id,room_type_id,room_id/);
});
test('The browser cannot write records or claim payment success',()=>{
 assert.doesNotMatch(schema,/grant (?:insert|update|delete|all) on public\./i);
 assert.doesNotMatch(procedures,/grant execute on function public\.[^;]+ to anon;/i);
 assert.ok(!Object.values(actions).some(a=>/mark_paid|verify_payment|execute_sql/.test(a.fn)));
});
