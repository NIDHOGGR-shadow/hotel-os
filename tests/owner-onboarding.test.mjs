import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');
const markup=file('manage.html');
const client=file('manage.js');
const styles=file('manage.css');

test('HOTEL staff access is invite-only; open registration is not rendered',()=>{
  assert.match(markup,/id="loginSection"/);
  assert.doesNotMatch(markup,/signupSection|signupForm|Create your staff account|showSignupButton/);
  assert.doesNotMatch(client,/\/auth\/v1\/signup|showSignup|signupForm|signupStatus/);
  assert.doesNotMatch(file('index.html'),/signupForm|signupPassword|staff signup/i);
  assert.match(markup,/Staff access is invitation-only/);
  assert.match(styles,/\.admin-body \[hidden\]\{display:none!important\}/);
});
test('Seven-character password minimum is available only through invitation recovery',()=>{
  assert.doesNotThrow(()=>new Script(client));
  assert.match(markup,/id="setPasswordSection"[^>]+hidden/);
  assert.match(markup,/id="newPassword"[^>]+minlength="7"/);
  assert.match(markup,/id="confirmPassword"[^>]+minlength="7"/);
  assert.match(client,/fragment\.get\('type'\)==='invite'/);
  assert.match(client,/password\.length<7/);
  assert.match(client,/config\.supabaseUrl\+'\/auth\/v1\/user'/);
  assert.match(client,/method:'PUT'/);
  assert.doesNotMatch(client,/localStorage\.setItem\([^)]*password/i);
});
test('Only HOTEL owner gets staff invite interface and API caller session',()=>{
  assert.match(markup,/id="staffAccessTab" hidden/);
  assert.match(markup,/id="inviteStaffForm"/);
  assert.match(client,/if\(currentRole!=='owner'\)return/);
  assert.match(client,/const staffTab=maybeEl\('staffAccessTab'\)/);
  assert.match(client,/if\(staffTab\)staffTab\.hidden=role!=='owner'/);
  assert.match(client,/\/api\/staff-invite/);
  assert.match(client,/Authorization:'Bearer '\+token/);
  assert.match(client,/hotel_claim_staff_invite/);
});
test('Staff non-managers are sent to a role-scoped workspace, not the rate editor',()=>{
  assert.match(client,/role==='owner'\|\|role==='manager'/);
  assert.match(client,/loggedIn\('staff'\)/);
  assert.match(client,/STAFF_VIEWS/);
  assert.match(client,/operations\('set_room_rate'/);
});
