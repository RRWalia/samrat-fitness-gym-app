const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(__dirname, `.csv-import-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'csv-import-test-secret-with-more-than-thirty-two-characters';

const { initDatabase } = require('../src/config/database');
const { seedDatabase } = require('../src/config/seed');
initDatabase();
seedDatabase();

const { db } = require('../src/config/database');
const { parseCsv, parseCsvRows, mapHeaders } = require('../src/services/csv.service');
const { buildPreview } = require('../src/controllers/members.import.controller');

const HEADER = 'name,phone,email,plan_name,join_date,expiry_date,status';

function csv(...rows) {
  return [HEADER, ...rows].join('\n');
}

function rowFor(preview, rowNumber) {
  return preview.rows.find(row => row.rowNumber === rowNumber);
}

test('CSV parser handles the shapes gym spreadsheets actually produce', () => {
  const withBomAndCrlf = `\uFEFF${HEADER}\r\n"Patel, Arjun",+91 98765 43210,,Monthly Starter,15/06/2026,,Active\r\n`;
  const parsed = parseCsv(withBomAndCrlf);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].name, 'Patel, Arjun');
  assert.equal(parsed.records[0].phone, '+91 98765 43210');
  assert.equal(parsed.records[0].plan_name, 'Monthly Starter');

  const embeddedNewline = parseCsvRows('name,notes\n"Line one\nLine two",ok\n');
  assert.deepEqual(embeddedNewline[1], ['Line one\nLine two', 'ok']);

  const escapedQuotes = parseCsvRows('name,notes\n"He said ""hi""",ok\n');
  assert.deepEqual(escapedQuotes[1], ['He said "hi"', 'ok']);

  const blankLinesIgnored = parseCsv(`${HEADER}\n\n   \nArjun Patel,9871100001,,Monthly Starter,15/06/2026,,Active\n\n`);
  assert.equal(blankLinesIgnored.ok, true);
  assert.equal(blankLinesIgnored.records.length, 1);

  const emptyFile = parseCsv('\n\n');
  assert.equal(emptyFile.ok, false);
  assert.match(emptyFile.error, /empty/i);
});

test('header aliases map to canonical columns', () => {
  const map = mapHeaders(['Full Name', 'Mobile No', 'Email ID', 'Membership Plan', 'Joining Date', 'Valid Till', 'Member Status']);
  assert.equal(map.name, 0);
  assert.equal(map.phone, 1);
  assert.equal(map.email, 2);
  assert.equal(map.plan_name, 3);
  assert.equal(map.join_date, 4);
  assert.equal(map.expiry_date, 5);
  assert.equal(map.status, 6);

  const missingRequired = parseCsv('email,status\na@b.com,Active\n');
  assert.equal(missingRequired.ok, false);
  assert.match(missingRequired.error, /must contain "name" and "phone"/);
});

test('preview resolves plans, dates and duplicate phones', () => {
  const monthlyPlan = db.prepare("SELECT * FROM Plans WHERE name = 'Monthly Starter'").get();
  const annualPlan = db.prepare("SELECT * FROM Plans WHERE name = 'Annual King Pass'").get();

  const preview = buildPreview(csv(
    'Arjun Patel,9871100011,arjun.patel@gmail.com,Monthly Starter,15/06/2026,15/07/2026,Active',
    'Priya Sharma,+91 98711 00022,,Quarterly (3 Mo),2026-07-01,,Paused',
    'Rohan Gupta,9871100033,,Annual King Pass,31/01/2026,,'
  ));

  const first = rowFor(preview, 2);
  assert.equal(first.action, 'new');
  assert.equal(first.phone, '+919871100011');
  assert.equal(first.planName, 'Monthly Starter');
  assert.equal(first.expiryDate, '2026-07-15');
  assert.equal(first.membershipStatus, 'Active');

  const second = rowFor(preview, 3);
  assert.equal(second.action, 'new');
  assert.equal(second.planName, 'Quarterly Fitness Booster');
  assert.equal(second.expiryDate, '2026-10-01');
  assert.equal(second.status, 'Paused');
  assert.equal(second.membershipStatus, 'Frozen');

  const third = rowFor(preview, 4);
  assert.equal(third.planName, 'Annual King Pass');
  assert.equal(third.expiryDate, '2027-01-31');
  assert.equal(third.status, 'Active');

  assert.deepEqual(preview.summary, { total: 3, new: 3, update: 0, skip: 0, error: 0 });

  const duplicateRow = buildPreview(csv(
    'Arjun Patel,9871100011,,Monthly Starter,15/06/2026,,Active',
    'Arjun Patel Again,9871100011,,Monthly Starter,15/06/2026,,Active'
  ));
  assert.equal(rowFor(duplicateRow, 2).action, 'new');
  assert.equal(rowFor(duplicateRow, 3).action, 'skip');
  assert.equal(duplicateRow.summary.skip, 1);

  assert.ok(monthlyPlan && annualPlan);
});

test('preview rejects unknown plans, bad dates and impossible expiry values', () => {
  const unknownPlan = buildPreview(csv('Karan Mehta,9871100044,,Platinum Elite,15/06/2026,,Active'));
  const unknownRow = rowFor(unknownPlan, 2);
  assert.equal(unknownRow.action, 'error');
  assert.match(unknownRow.issues.join(' '), /Plan "Platinum Elite" was not found/);
  assert.match(unknownRow.issues.join(' '), /Available plans:/);

  const badDate = buildPreview(csv('Karan Mehta,9871100045,,Monthly Starter,31/02/2026,,Active'));
  assert.equal(rowFor(badDate, 2).action, 'error');
  assert.match(rowFor(badDate, 2).issues.join(' '), /does not exist on the calendar/);

  const dashSeparated = buildPreview(csv('Karan Mehta,9871100046,,Monthly Starter,15-06-2026,,Active'));
  assert.equal(rowFor(dashSeparated, 2).joinDate, '2026-06-15');
  assert.equal(rowFor(dashSeparated, 2).action, 'new');

  const unparseableDate = buildPreview(csv('Karan Mehta,9871100069,,Monthly Starter,June 15,,Active'));
  assert.match(rowFor(unparseableDate, 2).issues.join(' '), /Use DD\/MM\/YYYY or YYYY-MM-DD/);

  const expiryBeforeJoin = buildPreview(csv('Karan Mehta,9871100047,,Monthly Starter,15/06/2026,15/05/2026,Active'));
  assert.match(rowFor(expiryBeforeJoin, 2).issues.join(' '), /before the join date/);

  const badPhone = buildPreview(csv('Karan Mehta,12345,,Monthly Starter,15/06/2026,,Active'));
  assert.match(rowFor(badPhone, 2).issues.join(' '), /not a valid 7–15 digit number/);

  const missingName = buildPreview(csv(',9871100048,,Monthly Starter,15/06/2026,,Active'));
  assert.match(rowFor(missingName, 2).issues.join(' '), /Name is missing/);
  assert.equal(missingName.summary.error, 1);
});

test('preview honours the skip-existing duplicate mode against the seeded roster', () => {
  const seeded = db.prepare('SELECT name, phone FROM Members ORDER BY id LIMIT 1').get();

  const updateMode = buildPreview(csv(`${seeded.name},9871100099,,Monthly Starter,15/06/2026,,Active`));
  assert.equal(rowFor(updateMode, 2).action, 'new');

  const existingCsv = csv(`${seeded.name},${seeded.phone},,Monthly Starter,15/06/2026,,Active`);
  assert.equal(rowFor(buildPreview(existingCsv), 2).action, 'update');

  const skipped = buildPreview(existingCsv, { duplicateMode: 'skip-existing' });
  assert.equal(rowFor(skipped, 2).action, 'skip');
  assert.equal(skipped.summary.update, 0);
});

test('CSV parsing service is exported with documented limits', () => {
  const service = require('../src/services/csv.service');
  assert.equal(typeof service.parseCsv, 'function');
  assert.ok(service.MAX_IMPORT_ROWS >= 1000);
  assert.ok(service.CANONICAL_COLUMNS.includes('plan_name'));
});

test('teardown', () => {
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbFile}${suffix}`); } catch { /* already removed */ }
  }
});
