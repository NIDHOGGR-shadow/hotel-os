import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const manage = readFileSync(new URL('../manage.js', import.meta.url), 'utf8');
const daily = readFileSync(new URL('../daily-records.js', import.meta.url), 'utf8');
const start = manage.indexOf('const STAFF_SECTION_IDS=');
const end = manage.indexOf('function simpleStaffItem(', start);
assert.ok(start !== -1 && end > start, 'staff view code exists');
const viewCode = manage.slice(start, end);

function setup(visible, { throwOnDailyClear = false } = {}) {
  const sections = Object.fromEntries(visible.map(id => [id, { hidden: true }]));
  const context = {
    el: id => sections[id] ?? null,
    window: {
      HotelDailyRecords: { clear() { if (throwOnDailyClear) throw Error('stale dashboard'); } },
      HotelCatalogAdmin: { clear() {} }
    },
    console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(viewCode, context);
  return {
    sections,
    show(view) {
      context.requestedView = view;
      return vm.runInContext('loggedIn(requestedView)', context);
    },
  };
}

test('login view survives missing unrelated sections', () => {
  const page = setup(['loginSection', 'dashboardSection']);
  assert.doesNotThrow(() => page.show('login'));
  assert.equal(page.sections.loginSection.hidden, false);
  assert.equal(page.sections.dashboardSection.hidden, true);
});

test('a missing requested dashboard produces an actionable error', () => {
  const page = setup(['loginSection']);
  assert.throws(() => page.show('admin'), /missing a required section.*Refresh/);
  assert.equal(page.sections.loginSection.hidden, true);
});

test('workspace cleanup failure never prevents showing staff login', () => {
  const page = setup(['loginSection', 'dashboardSection'], { throwOnDailyClear: true });
  assert.doesNotThrow(() => page.show('login'));
  assert.equal(page.sections.loginSection.hidden, false);
});

test('clear password only after entering the verified dashboard', () => {
  const loginHandler = manage.slice(manage.indexOf("el('loginForm').addEventListener"), manage.indexOf('async function signOut()'));
  assert.match(loginHandler, /await enterDashboard\(\);\s*el\('loginPassword'\)\.value='';/);
});

test('daily records initialize only when their output target exists', () => {
  assert.match(daily, /if\(!form\|\|!input\|\|!target\)return;/);
});
