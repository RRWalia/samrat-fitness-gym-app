const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.csv-import-integration-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'csv-import-integration-secret-with-more-than-thirty-two-characters';

// Sign in with Google fixtures (see auth.integration.test.js): mint RS256 ID
// tokens locally and stub Google's certificate endpoint so the real
// google-auth-library verification path runs without contacting Google.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const GOOGLE_CLIENT_ID = 'csv-test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
const { OAuth2Client } = require('google-auth-library');
const KEY_ID = 'csv-test-key';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
OAuth2Client.prototype.getFederatedSignonCertsAsync = async function certStub() {
  return { certs: { [KEY_ID]: publicKey } };
};
function mintIdToken(email) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub: `sub-${email}`, email, email_verified: true, name: email, iat: now - 10, exp: now + 3600 },
    privateKey,
    { algorithm: 'RS256', header: { alg: 'RS256', typ: 'JWT', kid: KEY_ID } }
  );
}

const { app } = require('../server');
const { db } = require('../src/config/database');

const HEADER = 'name,phone,email,plan_name,join_date,expiry_date,status';
const IMPORT_CSV = [
  HEADER,
  'Imported Arjun,9875500011,imported.arjun@gmail.com,Monthly Starter,15/06/2026,15/07/2026,Active',
  '"Imported, Priya",+91 98755 00022,,Quarterly Fitness Booster,01/07/2026,,Paused',
  'Broken Row,9875500033,,Platinum Elite,15/06/2026,,Active'
].join('\n');

function request(baseUrl, route, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(async response => {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { text }; }
    return { status: response.status, data, text };
  });
}

function login(baseUrl, email) {
  return request(baseUrl, '/api/auth/google', { method: 'POST', body: { credential: mintIdToken(email) } });
}

test('CSV bulk import endpoint, role boundary, and audit trail', async t => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ownerEmail = db.prepare("SELECT email FROM Users WHERE role = 'owner'").get().email;
  const deskEmail = db.prepare("SELECT email FROM Users WHERE role = 'front_desk'").get().email;
  const ownerToken = (await login(baseUrl, ownerEmail)).data.token;
  const deskToken = (await login(baseUrl, deskEmail)).data.token;
  assert.ok(ownerToken && deskToken);

  await t.test('the sample template downloads with the seeded plan names', async () => {
    const response = await fetch(`${baseUrl}/api/members/import/sample`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(response.headers.get('content-disposition'), /samrat_members_import_template\.csv/);

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], HEADER);
    assert.equal(lines.length, 5);
    assert.match(csv, /Monthly Starter/);
    assert.match(csv, /Annual King Pass/);
  });

  await t.test('front desk cannot preview or import members', async () => {
    const preview = await request(baseUrl, '/api/members/import/preview', {
      token: deskToken, method: 'POST', body: { csv: IMPORT_CSV }
    });
    assert.equal(preview.status, 403);
    assert.equal(preview.data.code, 'FORBIDDEN');

    const sample = await fetch(`${baseUrl}/api/members/import/sample`, {
      headers: { Authorization: `Bearer ${deskToken}` }
    });
    assert.equal(sample.status, 403);
  });

  await t.test('import without a CSV body or with a bad header is rejected', async () => {
    const empty = await request(baseUrl, '/api/members/import', { token: ownerToken, method: 'POST', body: {} });
    assert.equal(empty.status, 400);

    const badHeader = await request(baseUrl, '/api/members/import/preview', {
      token: ownerToken, method: 'POST', body: { csv: 'email,status\na@b.com,Active' }
    });
    assert.equal(badHeader.status, 400);
    assert.match(badHeader.data.error, /must contain "name" and "phone"/);
  });

  await t.test('preview reports new, skipped-duplicate and broken rows without writing', async () => {
    const before = db.prepare('SELECT COUNT(*) AS count FROM Members').get().count;
    const response = await request(baseUrl, '/api/members/import/preview', {
      token: ownerToken, method: 'POST', body: { csv: IMPORT_CSV }
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.success, true);
    assert.deepEqual(response.data.summary, { total: 3, new: 2, update: 0, skip: 0, error: 1, importable: 2 });
    assert.deepEqual(response.data.detectedColumns, ['name', 'phone', 'email', 'plan_name', 'join_date', 'expiry_date', 'status']);
    assert.equal(response.data.rows[0].plan, 'Monthly Starter');
    assert.equal(response.data.rows[1].name, 'Imported, Priya');
    assert.equal(response.data.rows[1].expiryDate, '2026-10-01');
    assert.match(response.data.issues[0].issues[0], /Platinum Elite/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Members').get().count, before);
  });

  await t.test('import creates members, memberships, payments and one audit entry', async () => {
    const response = await request(baseUrl, '/api/members/import', {
      token: ownerToken, method: 'POST', body: { csv: IMPORT_CSV }
    });

    assert.equal(response.status, 201);
    assert.deepEqual(response.data.summary, { created: 2, updated: 0, skipped: 0, failed: 1, total: 3 });

    const member = db.prepare("SELECT * FROM Members WHERE phone = '+919875500011'").get();
    assert.ok(member);
    assert.equal(member.name, 'Imported Arjun');
    assert.equal(member.email, 'imported.arjun@gmail.com');
    assert.equal(member.join_date, '2026-06-15');
    assert.equal(member.status, 'Active');

    const membership = db.prepare('SELECT * FROM Memberships WHERE member_id = ?').get(member.id);
    assert.equal(membership.start_date, '2026-06-15');
    assert.equal(membership.expiry_date, '2026-07-15');
    assert.equal(membership.status, 'Active');
    assert.equal(membership.renewal_source, 'CSV_Import');

    const plan = db.prepare('SELECT * FROM Plans WHERE id = ?').get(membership.plan_id);
    assert.equal(plan.name, 'Monthly Starter');
    const payment = db.prepare('SELECT * FROM Payments WHERE member_id = ?').get(member.id);
    assert.equal(payment.status, 'Paid');
    assert.equal(payment.amount, plan.base_price - (plan.discount || 0));
    assert.match(payment.provider_reference, /^IMP_/);

    const pausedMember = db.prepare("SELECT * FROM Members WHERE phone = '+919875500022'").get();
    assert.equal(pausedMember.name, 'Imported, Priya');
    assert.equal(pausedMember.status, 'Paused');
    assert.equal(pausedMember.risk_state, 'Paused');
    assert.equal(db.prepare('SELECT status FROM Memberships WHERE member_id = ?').get(pausedMember.id).status, 'Frozen');

    assert.ok(db.prepare('SELECT id FROM Streaks WHERE member_id = ?').get(member.id));
    assert.equal(db.prepare("SELECT id FROM Members WHERE phone = '+919875500033'").get(), undefined);

    const audits = db.prepare("SELECT * FROM AuditLogs WHERE action = 'CSV Bulk Import'").all();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor_type, 'Owner');
    assert.deepEqual(JSON.parse(audits[0].after_summary), { file: 'csv-upload', created: 2, updated: 0, skipped: 0, failed: 1 });
  });

  await t.test('re-importing the same file updates existing members instead of duplicating', async () => {
    const memberCountBefore = db.prepare('SELECT COUNT(*) AS count FROM Members').get().count;
    const response = await request(baseUrl, '/api/members/import', {
      token: ownerToken, method: 'POST', body: { csv: IMPORT_CSV }
    });

    assert.equal(response.status, 201);
    assert.equal(response.data.summary.created, 0);
    assert.equal(response.data.summary.updated, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Members').get().count, memberCountBefore);

    const member = db.prepare("SELECT * FROM Members WHERE phone = '+919875500011'").get();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Memberships WHERE member_id = ?').get(member.id).count, 2);
  });

  await t.test('skip-existing mode leaves existing members untouched', async () => {
    const response = await request(baseUrl, '/api/members/import', {
      token: ownerToken, method: 'POST', body: { csv: IMPORT_CSV, duplicateMode: 'skip-existing' }
    });

    assert.equal(response.status, 422);
    assert.equal(response.data.success, false);
    assert.equal(response.data.issues.length, 3);
  });

  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbFile}${suffix}`); } catch { /* already removed */ }
  }
});
