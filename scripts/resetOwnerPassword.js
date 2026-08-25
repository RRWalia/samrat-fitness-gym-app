#!/usr/bin/env node
/**
 * Emergency owner password reset — run from the server shell (e.g. Render Shell)
 * when the owner account is locked out and the current password is unknown.
 *
 * Usage (from the repository root, or set DB_PATH explicitly):
 *   node scripts/resetOwnerPassword.js --username ashish --password 'Ashish@samrat1!'
 *   node scripts/resetOwnerPassword.js --password 'Ashish@samrat1!' --yes
 *
 * What it does:
 *   - Reuses the application's database (same DB_PATH resolution as the API).
 *   - Validates the new password against the standard security policy.
 *   - Replaces the password hash (bcrypt), bumps token_version and revokes
 *     every active session, so old tokens stop working immediately.
 *   - Writes an audit log entry (System → Reset Owner Password (CLI)).
 *
 * Accessing the server shell already implies full control of the service, so
 * this script intentionally requires no existing credentials.
 */
const path = require('path');

// Dependencies (dotenv, bcrypt) live in the backend install, so resolve them
// from there regardless of where this script is launched from.
const backendMod = (name) => require(path.join(__dirname, '..', 'backend', 'node_modules', name));

try { backendMod('dotenv').config({ quiet: true }); } catch { /* env vars already provided (e.g. Render) */ }

const bcrypt = backendMod('bcrypt');
const { initDatabase, db, dbPath, logAudit } = require('../backend/src/config/database');
const { validatePassword, bcryptRounds } = require('../backend/src/auth/password');
const { revokeAllUserSessions } = require('../backend/src/middleware/auth.middleware');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        console.error(`Missing value for ${arg}`);
        process.exit(1);
      }
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
const username = (args.username || process.env.INITIAL_OWNER_USERNAME || 'ashish').trim().toLowerCase();
const password = typeof args.password === 'string' ? args.password : '';

if (!password) {
  fail('Provide the new password with --password \'...\' (12+ chars, upper, lower, number & symbol).');
}
const policyError = validatePassword(password);
if (policyError) fail(`New password is not secure: ${policyError}`);

console.log('--- Samrat Fitness King · Owner Password Reset (CLI) ---');
console.log(`Database: ${dbPath}`);
initDatabase();

const user = db.prepare('SELECT * FROM Users WHERE username = ? COLLATE NOCASE LIMIT 1').get(username);
if (!user) fail(`No staff account found with User ID "${username}".`);

console.log(`Target:   ${user.full_name} (@${user.username}, role: ${user.role}, status: ${user.active ? 'active' : 'disabled'})`);
if (!user.active) fail('That account is disabled. Re-enable it from Staff Access first (or reset by role).');

if (!args.yes) {
  if (!process.stdin.isTTY) {
    fail('Interactive confirmation requires a terminal. Re-run with --yes to confirm non-interactively.');
  }
  const answer = (require('readline').createInterface({ input: process.stdin, output: process.stdout })
    .question(`Type the User ID (${username}) to confirm: `)) || '';
  if (answer.trim().toLowerCase() !== username) fail('Confirmation did not match. Nothing was changed.');
}

const changedAt = new Date().toISOString();
const passwordHash = bcrypt.hashSync(password, bcryptRounds());

db.transaction(() => {
  db.prepare(`
    UPDATE Users
    SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1,
        failed_login_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(passwordHash, changedAt, changedAt, user.id);
  revokeAllUserSessions(user.id);
})();

logAudit(null, 'System', 'Reset Owner Password (CLI)', 'Users', user.id, {
  username: user.username
}, { message: 'Password reset via scripts/resetOwnerPassword.js from the server shell.' });

console.log('✔ Password updated.');
console.log(`  Sign in with User ID "${user.username}" and the new password.`);
console.log('  All previous sessions for this account were revoked.');
