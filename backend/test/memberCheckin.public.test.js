const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.membercheckin-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'integration-test-secret-with-more-than-thirty-two-characters';

const { app } = require('../server');
const { db } = require('../src/config/database');
const { qrTokenForWindow, QR_WINDOW_MS } = require('../src/controllers/attendance.controller');

function currentToken() {
  return qrTokenForWindow(Math.floor(Date.now() / QR_WINDOW_MS));
}

function post(baseUrl, route, body) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, data: await response.json() }));
}

// Seeded members (see seed.js). Phones are stored formatted, e.g. "+91 97234 88990".
const NEHA = '+91 97234 88990'; // Active, active membership, last visit ~1 day ago.
const POOJA = '+91 98200 55443'; // Expired status + expired membership.
const VIKRAM = '+91 99090 12345'; // Active, active membership, OPEN no-show case.

test('Public member QR check-in', async (t) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await t.test('rejects an invalid / expired QR token', async () => {
    const res = await post(baseUrl, '/api/public/member-checkin', { token: 'SFK_notarealtoken', phone: NEHA });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /invalid or has expired/i);
  });

  await t.test('rejects an empty / too-short phone after a valid token', async () => {
    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: '12' });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  await t.test('does not reveal whether an unknown number is registered', async () => {
    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: '+91 00000 00000' });
    assert.equal(res.status, 404);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /No member found/i);
  });

  await t.test('completes check-in for a valid member + token and records it as member-originated', async () => {
    const token = currentToken();
    const res = await post(baseUrl, '/api/public/member-checkin', { token, phone: NEHA });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.member.name, 'Neha Verma');
    assert.ok(res.data.streak && typeof res.data.streak.current === 'number');

    // Attendance row should be a QR scan with no staff actor.
    const att = db
      .prepare(`SELECT source, qr_session, staff_actor_id FROM Attendance WHERE member_id = (SELECT id FROM Members WHERE phone = ?) ORDER BY id DESC LIMIT 1`)
      .get(NEHA);
    assert.equal(att.source, 'QR');
    assert.equal(att.qr_session, token);
    assert.equal(att.staff_actor_id, null);

    // Audit log should be attributed to the Member actor type.
    const audit = db
      .prepare(`SELECT actor_type, actor_id, action FROM AuditLogs WHERE record_type = 'Attendance' AND action = 'Gym Check-in' ORDER BY id DESC LIMIT 1`)
      .get();
    assert.equal(audit.actor_type, 'Member');
  });

  await t.test('matches a phone entered without spaces or +91 prefix', async () => {
    // Vikram's stored phone is "+91 99090 12345"; submit digit-only.
    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: '+919909012345' });
    assert.equal(res.status, 200);
    assert.equal(res.data.member.name, 'Vikram Rajput');
  });

  await t.test('resolves an open no-show case on check-in', async () => {
    const openBefore = db.prepare(`SELECT status FROM NoShowCases WHERE member_id = (SELECT id FROM Members WHERE phone = ?) ORDER BY id DESC LIMIT 1`).get(VIKRAM);
    assert.equal(openBefore.status, 'Open');
    // Vikram already checked in (digit-only) above; the case resolves on that first QR check-in.
    const resolved = db.prepare(`SELECT status FROM NoShowCases WHERE member_id = (SELECT id FROM Members WHERE phone = ?) ORDER BY id DESC LIMIT 1`).get(VIKRAM);
    assert.equal(resolved.status, 'Returned');
  });

  await t.test('rejects a duplicate scan inside the duplicate window', async () => {
    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: NEHA });
    assert.equal(res.status, 429);
    assert.equal(res.data.alreadyCheckedIn, true);
  });

  await t.test('rejects a member with no active membership', async () => {
    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: POOJA });
    assert.equal(res.status, 400);
    assert.equal(res.data.needsRenewal, true);
  });

  await t.test('rejects a blocked / cancelled member', async () => {
    // Insert a blocked member with an otherwise-active membership.
    const m = db
      .prepare(`INSERT INTO Members (name, phone, email, join_date, status, risk_state) VALUES (?, ?, ?, date('now'), 'Blocked', 'Normal')`)
      .run('Blocked Tester', '+91 91111 22233', 'blocked@example.com');
    db.prepare(`INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status) VALUES (?, 1, date('now'), date('now', '+30 days'), 'Active')`).run(m.lastInsertRowid);

    const res = await post(baseUrl, '/api/public/member-checkin', { token: currentToken(), phone: '+91 91111 22233' });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /Blocked/);
  });

  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      /* already removed */
    }
  }
});
