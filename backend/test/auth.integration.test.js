const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.auth-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'integration-test-secret-with-more-than-thirty-two-characters';

// Sign in with Google test fixtures: we mint RS256 ID tokens with a locally
// generated keypair and teach google-auth-library to trust that key as if it
// were Google's published certificate. This exercises the real verification
// path (signature, audience, issuer, expiry) without contacting Google.
const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

const { OAuth2Client } = require('google-auth-library');
const KEY_ID = 'test-key-1';
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

function mintIdToken({ email, sub = `google-sub-${email}`, name = email.split('@')[0], emailVerified = true, expires = 3600, issued = -10 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub,
      email,
      email_verified: emailVerified,
      name,
      iat: now + issued,
      exp: now + expires
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

function googleLogin(baseUrl, credential, rememberMe = false) {
  return request(baseUrl, '/api/auth/google', { method: 'POST', body: { credential, rememberMe } });
}

test('Google sign-in, session lifecycle, and role boundaries', async t => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let ownerToken;
  let frontDeskToken;
  let trainerToken;

  await t.test('health is public and customer APIs reject anonymous requests', async () => {
    const response = await request(baseUrl, '/api/members');
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'AUTH_REQUIRED');

    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'OK');
  });

  await t.test('auth config exposes the client id without secrets', async () => {
    const config = await request(baseUrl, '/api/auth/config');
    assert.equal(config.status, 200);
    assert.equal(config.data.googleSignIn.configured, true);
    assert.equal(config.data.googleSignIn.clientId, GOOGLE_CLIENT_ID);
  });

  await t.test('seeded staff accounts have Gmail identities and no credentials', async () => {
    const owner = db.prepare("SELECT * FROM Users WHERE role = 'owner'").get();
    assert.ok(owner);
    assert.ok(owner.email);
    assert.equal('password_hash' in owner, false);
    assert.equal('username' in owner, false);
  });

  await t.test('an unregistered Gmail is rejected', async () => {
    const response = await googleLogin(baseUrl, mintIdToken({ email: 'stranger@gmail.com' }));
    assert.equal(response.status, 403);
    assert.equal(response.data.code, 'ACCOUNT_NOT_REGISTERED');
  });

  await t.test('a malformed or forged credential is rejected', async () => {
    const malformed = await googleLogin(baseUrl, 'not-a-jwt');
    assert.equal(malformed.status, 400);

    // Signed with a different key → signature check must fail.
    const forged = jwt.sign(
      { iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, email: 'ashish@samratfitness.test', email_verified: true, sub: 'x', iat: 0, exp: Math.floor(Date.now() / 1000) + 100 },
      crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).privateKey,
      { algorithm: 'RS256', header: { alg: 'RS256', typ: 'JWT', kid: KEY_ID } }
    );
    const forgedResponse = await googleLogin(baseUrl, forged);
    assert.equal(forgedResponse.status, 401);
  });

  await t.test('the seeded owner signs in with Google and gets a bounded session', async () => {
    const ownerEmail = db.prepare("SELECT email FROM Users WHERE role = 'owner'").get().email;
    const response = await googleLogin(baseUrl, mintIdToken({ email: ownerEmail, sub: 'owner-google-sub' }));
    assert.equal(response.status, 200);
    assert.equal(response.data.success, true);
    assert.equal(response.data.user.role, 'owner');
    assert.equal(response.data.user.email, ownerEmail);
    assert.equal(response.data.token.split('.').length, 3);
    assert.equal('password_hash' in response.data.user, false);
    ownerToken = response.data.token;

    const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM AuthSessions WHERE revoked_at IS NULL').get().count;
    assert.equal(sessionCount, 1);

    // First sign-in binds the Google subject id.
    const stored = db.prepare('SELECT google_sub FROM Users WHERE email = ?').get(ownerEmail);
    assert.equal(stored.google_sub, 'owner-google-sub');
  });

  await t.test('owner can access financial dashboards and staff list without hashes', async () => {
    const dashboard = await request(baseUrl, '/api/dashboard/stats', { token: ownerToken });
    assert.equal(dashboard.status, 200);
    assert.equal(typeof dashboard.data.summary.renewalRevenueThisMonth, 'number');

    const users = await request(baseUrl, '/api/users', { token: ownerToken });
    assert.equal(users.status, 200);
    assert.ok(users.data.data.length >= 4);
    assert.equal('password_hash' in users.data.data[0], false);
  });

  await t.test('owner can create a Gmail-based staff account and deactivation revokes it', async () => {
    const created = await request(baseUrl, '/api/users', {
      token: ownerToken,
      method: 'POST',
      body: {
        email: 'desk.integration@gmail.com',
        fullName: 'Integration Desk',
        role: 'front_desk'
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.role, 'front_desk');

    const duplicate = await request(baseUrl, '/api/users', {
      token: ownerToken,
      method: 'POST',
      body: { email: 'Desk.Integration@gmail.com', fullName: 'Dup Desk', role: 'front_desk' }
    });
    assert.equal(duplicate.status, 409);

    const staffLogin = await googleLogin(baseUrl, mintIdToken({ email: 'desk.integration@gmail.com', sub: 'desk-sub' }));
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

    // A disabled account cannot sign in.
    const reLogin = await googleLogin(baseUrl, mintIdToken({ email: 'desk.integration@gmail.com', sub: 'desk-sub' }));
    assert.equal(reLogin.status, 403);
    assert.equal(reLogin.data.code, 'ACCOUNT_DISABLED');
  });

  await t.test('a look-alike Google account with the same email is rejected', async () => {
    const ownerEmail = db.prepare("SELECT email FROM Users WHERE role = 'owner'").get().email;
    const response = await googleLogin(baseUrl, mintIdToken({ email: ownerEmail, sub: 'different-google-sub' }));
    assert.equal(response.status, 403);
    assert.equal(response.data.code, 'GOOGLE_ACCOUNT_MISMATCH');
  });

  await t.test('front desk is limited to redacted lookup and attendance operations', async () => {
    const email = db.prepare("SELECT email FROM Users WHERE role = 'front_desk'").get().email;
    const loginResponse = await googleLogin(baseUrl, mintIdToken({ email, sub: 'frontdesk-sub' }));
    assert.equal(loginResponse.status, 200);
    frontDeskToken = loginResponse.data.token;

    const members = await request(baseUrl, '/api/members', { token: frontDeskToken });
    assert.equal(members.status, 200);
    assert.equal(members.data.accessScope, 'assisted_lookup');
    assert.ok(members.data.data.length > 0);
    assert.equal('base_price' in members.data.data[0], false);

    const financials = await request(baseUrl, '/api/dashboard/stats', { token: frontDeskToken });
    assert.equal(financials.status, 403);
    assert.equal(financials.data.code, 'FORBIDDEN');

    const qr = await request(baseUrl, '/api/attendance/qr-session', { token: frontDeskToken });
    assert.equal(qr.status, 200);
  });

  await t.test('trainer sees only assigned PT clients', async () => {
    const email = db.prepare("SELECT email FROM Users WHERE role = 'trainer'").get().email;
    const loginResponse = await googleLogin(baseUrl, mintIdToken({ email, sub: 'trainer-sub' }));
    assert.equal(loginResponse.status, 200);
    trainerToken = loginResponse.data.token;

    const clients = await request(baseUrl, '/api/members', { token: trainerToken });
    assert.equal(clients.status, 200);
    assert.equal(clients.data.accessScope, 'assigned_pt_clients');
    assert.ok(clients.data.data.every(member => Number(member.assigned_trainer_id) === 101));

    const forbiddenDashboard = await request(baseUrl, '/api/dashboard/stats', { token: trainerToken });
    assert.equal(forbiddenDashboard.status, 403);
  });

  await t.test('changing a Gmail re-points the account and revokes existing sessions', async () => {
    const trainer = db.prepare("SELECT id, email FROM Users WHERE role = 'trainer'").get();
    const changed = await request(baseUrl, `/api/users/${trainer.id}`, {
      token: ownerToken,
      method: 'PATCH',
      body: { email: 'sona.relinked@gmail.com' }
    });
    assert.equal(changed.status, 200);

    // The previous Google binding is cleared and sessions are revoked.
    const stored = db.prepare('SELECT email, google_sub FROM Users WHERE id = ?').get(trainer.id);
    assert.equal(stored.email, 'sona.relinked@gmail.com');
    assert.equal(stored.google_sub, null);

    // The previous trainer session is invalidated by the token_version bump.
    const after = await request(baseUrl, '/api/addons/active-orders', { token: trainerToken });
    assert.equal(after.status, 401);

    // The old Gmail no longer resolves to the account.
    const oldLogin = await googleLogin(baseUrl, mintIdToken({ email: trainer.email, sub: 'trainer-sub' }));
    assert.equal(oldLogin.status, 403);

    // The new Gmail signs in and re-binds.
    const newLogin = await googleLogin(baseUrl, mintIdToken({ email: 'sona.relinked@gmail.com', sub: 'trainer-new-sub' }));
    assert.equal(newLogin.status, 200);
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
