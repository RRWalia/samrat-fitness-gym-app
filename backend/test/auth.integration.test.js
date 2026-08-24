const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.auth-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'integration-test-secret-with-more-than-thirty-two-characters';
process.env.BCRYPT_ROUNDS = '10';

const { app } = require('../server');
const { db } = require('../src/config/database');

function request(baseUrl, route, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(async response => ({ status: response.status, data: await response.json() }));
}

function login(baseUrl, username, password, rememberMe = false) {
  return request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password, rememberMe }
  });
}

test('JWT authentication, revocation, and role boundaries', async t => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let ownerToken;
  let frontDeskToken;
  let trainerToken;

  await t.test('customer APIs reject anonymous requests', async () => {
    const response = await request(baseUrl, '/api/members');
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'AUTH_REQUIRED');

    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'OK');
  });

  await t.test('passwords are bcrypt hashes and login returns a bounded JWT session', async () => {
    const storedOwner = db.prepare("SELECT * FROM Users WHERE username = 'owner'").get();
    assert.match(storedOwner.password_hash, /^\$2[aby]\$/);
    assert.notEqual(storedOwner.password_hash, 'Owner@2026!Gym');

    const failed = await login(baseUrl, 'owner', 'wrong-password');
    assert.equal(failed.status, 401);
    assert.equal(failed.data.error, 'Invalid username or password.');

    const response = await login(baseUrl, 'owner', 'Owner@2026!Gym');
    assert.equal(response.status, 200);
    assert.equal(response.data.success, true);
    assert.equal(response.data.user.role, 'owner');
    assert.equal(response.data.token.split('.').length, 3);
    assert.equal('password_hash' in response.data.user, false);
    ownerToken = response.data.token;

    const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM AuthSessions WHERE revoked_at IS NULL').get().count;
    assert.equal(sessionCount, 1);
  });

  await t.test('owner can access financial dashboards and credential metadata without hashes', async () => {
    const dashboard = await request(baseUrl, '/api/dashboard/stats', { token: ownerToken });
    assert.equal(dashboard.status, 200);
    assert.equal(typeof dashboard.data.summary.renewalRevenueThisMonth, 'number');

    const users = await request(baseUrl, '/api/users', { token: ownerToken });
    assert.equal(users.status, 200);
    assert.ok(users.data.data.length >= 4);
    assert.equal('password_hash' in users.data.data[0], false);
  });

  await t.test('manager receives the same full operational access tier', async () => {
    const managerLogin = await login(baseUrl, 'manager', 'Manager@2026!');
    assert.equal(managerLogin.status, 200);
    assert.equal(managerLogin.data.user.role, 'manager');

    const dashboard = await request(baseUrl, '/api/dashboard/stats', { token: managerLogin.data.token });
    const settings = await request(baseUrl, '/api/dashboard/settings', { token: managerLogin.data.token });
    assert.equal(dashboard.status, 200);
    assert.equal(settings.status, 200);
  });

  await t.test('owner can create a bcrypt-protected staff account and deactivation revokes it', async () => {
    const created = await request(baseUrl, '/api/users', {
      token: ownerToken,
      method: 'POST',
      body: {
        username: 'desk.integration',
        fullName: 'Integration Desk',
        password: 'Integration@2026!',
        role: 'front_desk'
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.role, 'front_desk');

    const stored = db.prepare('SELECT password_hash FROM Users WHERE id = ?').get(created.data.data.id);
    assert.match(stored.password_hash, /^\$2[aby]\$/);

    const staffLogin = await login(baseUrl, 'desk.integration', 'Integration@2026!');
    assert.equal(staffLogin.status, 200);

    const disabled = await request(baseUrl, `/api/users/${created.data.data.id}`, {
      token: ownerToken,
      method: 'PATCH',
      body: { active: false }
    });
    assert.equal(disabled.status, 200);

    const revoked = await request(baseUrl, '/api/members', { token: staffLogin.data.token });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.data.code, 'INVALID_SESSION');
  });

  await t.test('front desk is limited to redacted lookup and attendance operations', async () => {
    const loginResponse = await login(baseUrl, 'frontdesk', 'Desk@2026!Gym');
    assert.equal(loginResponse.status, 200);
    frontDeskToken = loginResponse.data.token;

    const members = await request(baseUrl, '/api/members', { token: frontDeskToken });
    assert.equal(members.status, 200);
    assert.equal(members.data.accessScope, 'assisted_lookup');
    assert.ok(members.data.data.length > 0);
    assert.equal('email' in members.data.data[0], false);
    assert.equal('base_price' in members.data.data[0], false);

    const lookup = await request(baseUrl, `/api/members/${members.data.data[0].id}`, { token: frontDeskToken });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.data.accessScope, 'assisted_lookup');
    assert.equal('email' in lookup.data.data, false);
    assert.equal('notifications' in lookup.data.data, false);
    assert.equal('base_price' in (lookup.data.data.activeMembership || {}), false);

    const financials = await request(baseUrl, '/api/dashboard/stats', { token: frontDeskToken });
    assert.equal(financials.status, 403);
    assert.equal(financials.data.code, 'FORBIDDEN');

    const staffUsers = await request(baseUrl, '/api/users', { token: frontDeskToken });
    assert.equal(staffUsers.status, 403);

    const qr = await request(baseUrl, '/api/attendance/qr-session', { token: frontDeskToken });
    assert.equal(qr.status, 200);
    const checkIn = await request(baseUrl, '/api/attendance/check-in', {
      token: frontDeskToken,
      method: 'POST',
      body: {
        member_id: members.data.data[0].id,
        source: 'Assisted',
        correction_reason: 'Integration test assisted lookup'
      }
    });
    assert.equal(checkIn.status, 200);
  });

  await t.test('trainer sees only assigned PT clients and no order amount', async () => {
    const loginResponse = await login(baseUrl, 'trainer.aryan', 'Trainer@2026!');
    assert.equal(loginResponse.status, 200);
    trainerToken = loginResponse.data.token;

    const orders = await request(baseUrl, '/api/addons/active-orders', { token: trainerToken });
    assert.equal(orders.status, 200);
    assert.equal(orders.data.accessScope, 'assigned_pt_clients');
    assert.ok(orders.data.data.length > 0);
    assert.ok(orders.data.data.every(order => order.type === 'PT'));
    assert.ok(orders.data.data.every(order => !('amount' in order)));

    const clients = await request(baseUrl, '/api/members', { token: trainerToken });
    assert.equal(clients.status, 200);
    assert.equal(clients.data.accessScope, 'assigned_pt_clients');
    assert.ok(clients.data.data.every(member => Number(member.assigned_trainer_id) === 101));

    const assignedProfile = await request(baseUrl, `/api/members/${clients.data.data[0].id}`, { token: trainerToken });
    assert.equal(assignedProfile.status, 200);
    assert.equal(assignedProfile.data.accessScope, 'assigned_pt_client');
    assert.ok(assignedProfile.data.data.ptOrders.every(order => !('amount' in order) && !('price' in order)));

    const unrelatedMember = db.prepare('SELECT id FROM Members WHERE assigned_trainer_id IS NULL ORDER BY id LIMIT 1').get();
    const unrelatedProfile = await request(baseUrl, `/api/members/${unrelatedMember.id}`, { token: trainerToken });
    assert.equal(unrelatedProfile.status, 403);

    const forbiddenDashboard = await request(baseUrl, '/api/dashboard/stats', { token: trainerToken });
    assert.equal(forbiddenDashboard.status, 403);
  });

  await t.test('password changes revoke every existing session', async () => {
    const changed = await request(baseUrl, '/api/auth/change-password', {
      token: trainerToken,
      method: 'POST',
      body: {
        currentPassword: 'Trainer@2026!',
        newPassword: 'TrainerNext@2026!'
      }
    });
    assert.equal(changed.status, 200);

    const oldSession = await request(baseUrl, '/api/addons/active-orders', { token: trainerToken });
    assert.equal(oldSession.status, 401);

    const oldPassword = await login(baseUrl, 'trainer.aryan', 'Trainer@2026!');
    assert.equal(oldPassword.status, 401);
    const newPassword = await login(baseUrl, 'trainer.aryan', 'TrainerNext@2026!');
    assert.equal(newPassword.status, 200);
  });

  await t.test('logout revokes the JWT immediately', async () => {
    const logout = await request(baseUrl, '/api/auth/logout', { token: frontDeskToken, method: 'POST' });
    assert.equal(logout.status, 200);

    const afterLogout = await request(baseUrl, '/api/members', { token: frontDeskToken });
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.data.code, 'INVALID_SESSION');
  });

  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbFile}${suffix}`); } catch { /* already removed */ }
  }
});
