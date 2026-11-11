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

test('Staff onboarding is separate from public guest booking and defaults hidden',()=>{
  assert.match(markup,/<section id="signupSection" class="login-layout" hidden>/);
  assert.match(markup,/id="loginSection"/);
  assert.match(markup,/id="signupForm"/);
  assert.match(markup,/id="signupStatus"/);
  assert.match(markup,/type="password"[^>]*minlength="12"/);
  assert.match(styles,/\.admin-body \[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(file('index.html'),/signupForm|signupPassword|staff signup/i);
});
test('Self-registration calls Supabase Auth only and grants no staff membership',()=>{
  assert.doesNotThrow(()=>new Script(client));
  assert.match(client,/config\.supabaseUrl\+'\/auth\/v1\/signup\?'/);
  assert.match(client,/headers:\{apikey:config\.anonKey,'Content-Type':'application\/json'\}/);
  assert.match(client,/new URLSearchParams\(\{redirect_to:redirect\}\)/);
  const signup=client.slice(client.indexOf("el('signupForm').addEventListener"),client.indexOf("el('loginForm').addEventListener"));
  assert.ok(signup);
  assert.doesNotMatch(signup,/\/api\/operations|add_staff|staff_memberships|service_role|SUPABASE_SECRET_KEY/);
  assert.match(signup,/The HOTEL owner must assign your staff role/);
});
test('Authenticated management still requires owner or manager role',()=>{
  assert.match(client,/operations\('staff_memberships'\)/);
  assert.match(client,/!\['owner','manager'\]\.includes\(mine\.role\)/);
  assert.match(client,/operations\('set_room_rate'/);
  assert.match(client,/operations\('create_room_type'/);
  assert.match(client,/operations\('create_room'/);
});
