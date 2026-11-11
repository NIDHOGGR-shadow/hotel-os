import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');
const sql=file('supabase/migrations/20261111015000_initial_owner_claim.sql');
const js=file('manage.js');

test('First-owner claim never contains credentials or a built-in owner email',()=>{
  assert.doesNotMatch(sql,/@gmail|sb_secret_|sb_publishable_/i);
  assert.doesNotMatch(js,/samuelirenikase|sb_secret_|SUPABASE_SECRET_KEY/);
  assert.match(sql,/revoke all on schema hotel_private from public,anon,authenticated/);
  assert.match(sql,/revoke all on table hotel_private\.owner_invites from public,anon,authenticated/);
});
test('First-owner claim requires signed-in, verified, approved identity and no existing owner',()=>{
  assert.match(sql,/v_user uuid := auth\.uid\(\)/);
  assert.match(sql,/v_confirmed is null/);
  assert.match(sql,/v_email is distinct from v_invitation\.email/);
  assert.match(sql,/where property_id = p_property and claimed_by is null/);
  assert.match(sql,/m\.role='owner'/);
  assert.match(sql,/for update/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/grant execute on function public\.hotel_claim_initial_owner\(uuid\) to authenticated/);
  assert.match(sql,/revoke all on function public\.hotel_claim_initial_owner\(uuid\) from public,anon/);
});
test('First-owner claim is one-time and written to the staff audit log',()=>{
  assert.match(sql,/on conflict\(property_id,user_id\) do nothing/);
  assert.match(sql,/set claimed_by=v_user, claimed_at=now\(\)/);
  assert.match(sql,/staff\.initial_owner_claimed/);
});
test('Login claims only an approved invitation and still performs membership authorization',()=>{
  assert.doesNotThrow(()=>new Script(js));
  const claim=js.indexOf("'/rest/v1/rpc/hotel_claim_initial_owner'");
  const authorize=js.indexOf("operations('staff_memberships')");
  assert.ok(claim>=0&&authorize>claim);
  assert.match(js,/\['owner','manager'\]\.includes\(mine\.role\)/);
  assert.match(js,/apikey:config\.anonKey,Authorization:'Bearer '\+token/);
});
