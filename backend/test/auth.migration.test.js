const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

// Verifies the idempotent migration that retires the password sign-in era: a
// database created with username/password columns is rebuilt to the Google-only
// schema, preserving ids and revoking every password-era session.

const dbFile = path.join(__dirname, `.migration-test-${process.pid}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbFile;
process.env.JWT_SECRET = 'migration-test-secret-with-more-than-thirty-two-characters';

// Build a legacy Users table (pre-Google schema) before the app opens the DB.
const Database = require('better-sqlite3');
const legacy = new Database(dbFile);
legacy.exec(`
  CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'manager', 'front_desk', 'trainer')),
    trainer_id INTEGER,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    token_version INTEGER NOT NULL DEFAULT 0,
    password_changed_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE AuthSessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    jti_hash TEXT NOT NULL UNIQUE,
    remember_me INTEGER NOT NULL DEFAULT 0 CHECK(remember_me IN (0, 1)),
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_seen_at TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
  );
  INSERT INTO Users (username, password_hash, full_name, role, active, token_version)
  VALUES ('ashish', '$2b$10$legacyhash', 'Ashish', 'owner', 1, 0);
  INSERT INTO AuthSessions (user_id, jti_hash, issued_at, expires_at)
  VALUES (1, 'legacy-jti', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
`);
legacy.close();

const { initDatabase } = require('../src/config/database');
const { db } = require('../src/config/database');

test('password-era database is migrated to the Google-only schema', () => {
  initDatabase();

  const columns = db.prepare('PRAGMA table_info(Users)').all().map(col => col.name);
  assert.ok(columns.includes('email'));
  assert.ok(columns.includes('google_sub'));
  assert.equal(columns.includes('username'), false);
  assert.equal(columns.includes('password_hash'), false);
  assert.equal(columns.includes('failed_login_attempts'), false);
  assert.equal(columns.includes('locked_until'), false);
  assert.equal(columns.includes('password_changed_at'), false);

  // Identity and role survive; credentials do not; account cannot sign in yet.
  const user = db.prepare('SELECT * FROM Users WHERE id = 1').get();
  assert.equal(user.full_name, 'Ashish');
  assert.equal(user.role, 'owner');
  assert.equal(user.email, null);

  // Password-era sessions are revoked so stale tokens stop working.
  const session = db.prepare('SELECT revoked_at FROM AuthSessions WHERE id = 1').get();
  assert.ok(session.revoked_at);

  // Running the migration again is a no-op (idempotent).
  initDatabase();
  const again = db.prepare('PRAGMA table_info(Users)').all().map(col => col.name);
  assert.ok(again.includes('email'));
  assert.equal(again.includes('username'), false);

  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbFile}${suffix}`); } catch { /* already removed */ }
  }
});
