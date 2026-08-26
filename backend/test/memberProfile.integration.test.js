const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.member-profile-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'member-profile-test-secret-with-more-than-thirty-two-characters';

const GOOGLE_CLIENT_ID = 'member-profile-test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

const { OAuth2Client } = require('google-auth-library');
const KEY_ID = 'member-profile-test-key';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
OAuth2Client.prototype.getFederatedSignonCertsAsync = async function certStub() {
  return { certs: { [KEY_ID]: publicKey } };
};

const { app } = require('../server');
const { db } = require('../src/config/database');

function mintIdToken(email, sub = `sub-${email}`) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub,
      email,
      email_verified: true,
      name: email.split('@')[0],
      iat: now - 10,
      exp: now + 3600
    },
    privateKey,
    { algorithm: 'RS256', header: { alg: 'RS256', typ: 'JWT', kid: KEY_ID } }
  );
}

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

function login(baseUrl, email) {
  return request(baseUrl, '/api/auth/google', { method: 'POST', body: { credential: mintIdToken(email) } });
}

test('Member 360° profile endpoint, role boundaries, and payload shape', async t => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ownerEmail = db.prepare("SELECT email FROM Users WHERE role = 'owner'").get().email;
  const frontDeskEmail = db.prepare("SELECT email FROM Users WHERE role = 'front_desk'").get().email;
  const trainerEmail = db.prepare("SELECT email FROM Users WHERE role = 'trainer'").get().email;

  const ownerToken = (await login(baseUrl, ownerEmail)).data.token;
  const frontDeskToken = (await login(baseUrl, frontDeskEmail)).data.token;
  const trainerToken = (await login(baseUrl, trainerEmail)).data.token;

  assert.ok(ownerToken && frontDeskToken && trainerToken);

  const firstMember = db.prepare('SELECT id FROM Members ORDER BY id ASC LIMIT 1').get();
  const memberId = firstMember.id;

  // Find a member NOT assigned to trainer 101 for negative test
  const unassignedMember = db.prepare(`
    SELECT m.id FROM Members m
    WHERE m.assigned_trainer_id IS NULL OR m.assigned_trainer_id != 101
    LIMIT 1
  `).get();

  await t.test('owner can fetch full 360 profile with all sections', async () => {
    const res = await request(baseUrl, `/api/members/${memberId}/profile`, { token: ownerToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.accessScope, 'full');

    const data = res.data.data;
    assert.ok(data.member);
    assert.ok(data.membership);
    assert.ok(typeof data.membership.daysLeft === 'number' || data.membership.daysLeft === null);
    assert.ok(data.streak);
    assert.ok(data.attendance);
    assert.ok(Array.isArray(data.attendance.heatmap));
    assert.equal(data.attendance.heatmap.length, 112);
    assert.ok(data.attendance.total >= 0);
    assert.ok(data.payments);
    assert.ok(Array.isArray(data.payments.timeline));
    assert.ok(data.churnRisk);
    assert.ok(typeof data.churnRisk.score === 'number');
    assert.ok(['low', 'medium', 'high'].includes(data.churnRisk.level));
    assert.ok(Array.isArray(data.churnRisk.factors));
    // Payment amounts should be present for full access
    if (data.payments.timeline.length > 0) {
      assert.ok('amount' in data.payments.timeline[0]);
    }
    // Email should be visible for full access
    assert.ok(data.member.email);
  });

  await t.test('front desk sees redacted profile without email and without full payments', async () => {
    const res = await request(baseUrl, `/api/members/${memberId}/profile`, { token: frontDeskToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.accessScope, 'assisted_lookup');
    const data = res.data.data;
    assert.ok(data.member);
    assert.equal('email' in data.member, false);
    assert.ok(data.attendance);
    assert.ok(data.churnRisk);
    // Front desk should NOT see payments.timeline with amounts? Our implementation hides payments entirely for front desk.
    assert.equal(data.payments, undefined);
  });

  await t.test('trainer can access assigned member but not unassigned', async () => {
    const assignedRes = await request(baseUrl, `/api/members/${memberId}/profile`, { token: trainerToken });
    // First member is assigned to trainer 101 per seed
    assert.equal(assignedRes.status, 200);
    assert.equal(assignedRes.data.accessScope, 'assigned_pt_client');
    assert.ok(assignedRes.data.data.member);

    if (unassignedMember) {
      const forbiddenRes = await request(baseUrl, `/api/members/${unassignedMember.id}/profile`, { token: trainerToken });
      assert.equal(forbiddenRes.status, 403);
      assert.equal(forbiddenRes.data.code, 'FORBIDDEN');
    }
  });

  await t.test('churn risk factors are explainable and score capped at 100', async () => {
    // Pick a member with high risk (seeded Risk-25)
    const riskyMember = db.prepare("SELECT id FROM Members WHERE risk_state LIKE 'Risk-%' ORDER BY id DESC LIMIT 1").get();
    if (riskyMember) {
      const res = await request(baseUrl, `/api/members/${riskyMember.id}/profile`, { token: ownerToken });
      assert.equal(res.status, 200);
      const risk = res.data.data.churnRisk;
      assert.ok(risk.score >= 0 && risk.score <= 100);
      assert.ok(risk.factors.length > 0);
      // Each factor should have points and label
      for (const f of risk.factors) {
        assert.ok(typeof f.points === 'number');
        assert.ok(typeof f.label === 'string' && f.label.length > 0);
        assert.ok(['low', 'medium', 'high', 'critical'].includes(f.severity));
      }
      // Score should be sum of factors capped at 100 (allow small diff due to capping)
      const sum = risk.factors.reduce((s, f) => s + f.points, 0);
      assert.ok(risk.score <= sum || risk.score === 100);
    }
  });

  await t.test('heatmap contains valid daily counts and dates', async () => {
    const res = await request(baseUrl, `/api/members/${memberId}/profile`, { token: ownerToken });
    const heatmap = res.data.data.attendance.heatmap;
    assert.ok(heatmap.length === 112);
    for (const day of heatmap.slice(0, 5)) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(day.date));
      assert.ok(typeof day.count === 'number' && day.count >= 0);
      assert.ok(typeof day.dayOfWeek === 'number');
    }
  });

  await t.test('invalid member id returns 404 or 400', async () => {
    const notFound = await request(baseUrl, '/api/members/999999/profile', { token: ownerToken });
    assert.equal(notFound.status, 404);

    const badId = await request(baseUrl, '/api/members/abc/profile', { token: ownerToken });
    assert.ok([400, 404].includes(badId.status));
  });

  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbFile}${suffix}`); } catch {}
  }
});
