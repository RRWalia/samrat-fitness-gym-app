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
const { seedDatabase } = require('../src/config/seed');

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

  await t.test('existing legacy staff IDs migrate to the requested identities', () => {
    db.prepare("UPDATE Users SET username = 'owner', full_name = 'Samrat Gym Owner' WHERE username = 'ashish'").run();
    db.prepare("UPDATE Users SET username = 'manager', full_name = 'Gym Manager' WHERE username = 'parmar'").run();
    db.prepare("UPDATE Users SET username = 'trainer.aryan', full_name = 'Coach Aryan' WHERE username = 'sona.walia'").run();
    db.prepare("UPDATE AddOns SET title = replace(title, 'Sona Walia', 'Coach Aryan') WHERE title LIKE '%Sona Walia%'").run();

    seedDatabase();

    const identities = db.prepare("SELECT username, full_name, role FROM Users ORDER BY role").all();
    assert.ok(identities.some(user => user.username === 'ashish' && user.full_name === 'Ashish' && user.role === 'owner'));
    assert.ok(identities.some(user => user.username === 'parmar' && user.full_name === 'Parmar' && user.role === 'manager'));
    assert.ok(identities.some(user => user.username === 'sona.walia' && user.full_name === 'Sona Walia' && user.role === 'trainer'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Users WHERE username IN ('owner', 'manager', 'trainer.aryan')").get().count, 0);
    assert.match(db.prepare("SELECT title FROM AddOns WHERE type = 'PT' AND trainer_id = 101").get().title, /Sona Walia/);
  });

  await t.test('passwords are bcrypt hashes and login returns a bounded JWT session', async () => {
    const storedOwner = db.prepare("SELECT * FROM Users WHERE username = 'ashish'").get();
    assert.match(storedOwner.password_hash, /^\$2[aby]\$/);
    assert.notEqual(storedOwner.password_hash, 'Samrat@Fitness2026!');

    const failed = await login(baseUrl, 'Ashish', 'wrong-password');
    assert.equal(failed.status, 401);
    assert.equal(failed.data.error, 'Invalid username or password.');

    const response = await login(baseUrl, 'Ashish', 'Samrat@Fitness2026!');
    assert.equal(response.status, 200);
    assert.equal(response.data.success, true);
    assert.equal(response.data.user.role, 'owner');
    assert.equal(response.data.user.username, 'ashish');
    assert.equal(response.data.user.fullName, 'Ashish');
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
    const managerLogin = await login(baseUrl, 'Parmar', 'Manager@2026!');
    assert.equal(managerLogin.status, 200);
    assert.equal(managerLogin.data.user.role, 'manager');
    assert.equal(managerLogin.data.user.username, 'parmar');
    assert.equal(managerLogin.data.user.fullName, 'Parmar');

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

  await t.test('login works with a registered mobile number and forgot-password identifies accounts', async () => {
    db.prepare('UPDATE Users SET phone = ? WHERE username = ?').run('+919825011223', 'ashish');

    const phoneLogin = await login(baseUrl, '98250 11223', 'Samrat@Fitness2026!');
    assert.equal(phoneLogin.status, 200);
    assert.equal(phoneLogin.data.user.username, 'ashish');

    const plusLogin = await login(baseUrl, '+919825011223', 'Samrat@Fitness2026!');
    assert.equal(plusLogin.status, 200);
    assert.equal(plusLogin.data.user.username, 'ashish');

    const forgot = await request(baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { identifier: '+91 98250 11223' }
    });
    assert.equal(forgot.status, 200);
    assert.equal(forgot.data.found, true);
    assert.equal(forgot.data.account.username, 'ashish');
    assert.equal(forgot.data.account.hasRecoveryMobile, true);
    assert.match(forgot.data.account.phoneMasked, /1223$/);
    assert.ok(!('password_hash' in (forgot.data.account || {})));

    const forgotByUsername = await request(baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'Ashish' }
    });
    assert.equal(forgotByUsername.status, 200);
    assert.equal(forgotByUsername.data.found, true);

    const missing = await request(baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'nobody.here' }
    });
    assert.equal(missing.status, 200);
    assert.equal(missing.data.found, false);
  });

  await t.test('staff accounts can register mobile numbers with duplicate protection', async () => {
    const created = await request(baseUrl, '/api/users', {
      token: ownerToken,
      method: 'POST',
      body: {
        username: 'desk.mobile',
        fullName: 'Mobile Desk',
        password: 'Integration@2026!',
        role: 'front_desk',
        phone: '98980 44556'
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.phone, '+919898044556');

    const mobileLogin = await login(baseUrl, '+919898044556', 'Integration@2026!');
    assert.equal(mobileLogin.status, 200);
    assert.equal(mobileLogin.data.user.username, 'desk.mobile');

    const duplicate = await request(baseUrl, '/api/users', {
      token: ownerToken,
      method: 'POST',
      body: {
        username: 'desk.mobile2',
        fullName: 'Duplicate Desk',
        password: 'Integration@2026!',
        role: 'front_desk',
        phone: '9898044556'
      }
    });
    assert.equal(duplicate.status, 409);

    const cleared = await request(baseUrl, `/api/users/${created.data.data.id}`, {
      token: ownerToken,
      method: 'PATCH',
      body: { phone: '' }
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.data.phone, null);
  });

  await t.test('front desk is limited to redacted lookup and attendance operations', async () => {
    const loginResponse = await login(baseUrl, 'frontdesk', 'FrontDesk@2026!');
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
    const loginResponse = await login(baseUrl, 'sona.walia', 'Trainer@2026!');
    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.data.user.username, 'sona.walia');
    assert.equal(loginResponse.data.user.fullName, 'Sona Walia');
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

    const oldPassword = await login(baseUrl, 'sona.walia', 'Trainer@2026!');
    assert.equal(oldPassword.status, 401);
    const newPassword = await login(baseUrl, 'sona.walia', 'TrainerNext@2026!');
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
