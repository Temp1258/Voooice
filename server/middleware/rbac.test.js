#!/usr/bin/env node
// Smoke test for RBAC module — run with: node middleware/rbac.test.js

const { getUserRole, requireRole, requirePermission, ROLE_PERMISSIONS, PLAN_ROLE_MAP } = require('./rbac');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

console.log('--- getUserRole ---');
assert(getUserRole({ plan: 'free' }) === 'user', 'free -> user');
assert(getUserRole({ plan: 'creator' }) === 'creator', 'creator -> creator');
assert(getUserRole({ plan: 'pro' }) === 'creator', 'pro -> creator');
assert(getUserRole({ plan: 'voicebank' }) === 'creator', 'voicebank -> creator');
assert(getUserRole({ plan: 'studio' }) === 'admin', 'studio -> admin');
assert(getUserRole({ plan: 'enterprise' }) === 'admin', 'enterprise -> admin');
assert(getUserRole({ plan: 'unknown_plan' }) === 'user', 'unknown plan -> user');
assert(getUserRole(null) === 'user', 'null user -> user');
assert(getUserRole({}) === 'user', 'missing plan -> user');

console.log('\n--- Permission checks ---');
assert(ROLE_PERMISSIONS.user.includes('voiceprint:read_own'), 'user can read own voiceprints');
assert(!ROLE_PERMISSIONS.user.includes('marketplace:publish'), 'user cannot publish');
assert(ROLE_PERMISSIONS.creator.includes('marketplace:publish'), 'creator can publish');
assert(!ROLE_PERMISSIONS.creator.includes('users:manage'), 'creator cannot manage users');
assert(ROLE_PERMISSIONS.admin.includes('users:manage'), 'admin can manage users');
assert(ROLE_PERMISSIONS.admin.includes('quota:bypass'), 'admin can bypass quotas');

console.log('\n--- requireRole middleware ---');
// Simulate express req/res/next
function mockReqRes(user) {
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const req = { user };
  const res = {
    status(code) { statusCode = code; return res; },
    json(obj) { body = obj; },
  };
  const next = () => { nextCalled = true; };
  return { req, res, next, getStatus: () => statusCode, getBody: () => body, didNext: () => nextCalled };
}

const t1 = mockReqRes({ plan: 'free' });
requireRole('user')(t1.req, t1.res, t1.next);
assert(t1.didNext(), 'user role passes requireRole("user")');

const t2 = mockReqRes({ plan: 'free' });
requireRole('admin')(t2.req, t2.res, t2.next);
assert(!t2.didNext() && t2.getStatus() === 403, 'user role blocked by requireRole("admin")');

const t3 = mockReqRes({ plan: 'enterprise' });
requireRole('creator')(t3.req, t3.res, t3.next);
assert(t3.didNext(), 'admin role passes requireRole("creator") (hierarchy)');

const t4 = mockReqRes(null);
requireRole('user')(t4.req, t4.res, t4.next);
assert(!t4.didNext() && t4.getStatus() === 401, 'no user returns 401');

console.log('\n--- requirePermission middleware ---');
const t5 = mockReqRes({ plan: 'creator' });
requirePermission('marketplace:publish')(t5.req, t5.res, t5.next);
assert(t5.didNext(), 'creator passes requirePermission("marketplace:publish")');

const t6 = mockReqRes({ plan: 'free' });
requirePermission('marketplace:publish')(t6.req, t6.res, t6.next);
assert(!t6.didNext() && t6.getStatus() === 403, 'user blocked by requirePermission("marketplace:publish")');

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
