#!/usr/bin/env node
/**
 * Re-apply the INITIAL_*_PASSWORD environment values to EXISTING staff accounts.
 *
 * Why this exists:
 *   seedAuthUsers() in backend/src/config/seed.js only runs while the Users
 *   table is empty. Once the first deploy has created the accounts, changing
 *   INITIAL_OWNER_PASSWORD (etc.) in the Render dashboard has no effect — the
 *   database still holds the hashes from that very first boot. This script
 *   closes that gap without recreating the database.
 *
 * Usage (Render Shell, from the repository root):
 *   node scripts/applyStaffPasswords.js --dry-run     # show what would change
 *   node scripts/applyStaffPasswords.js --yes         # apply every configured role
 *   node scripts/applyStaffPasswords.js --role owner --role manager --yes
 *
 * For each role it reads the username/password pair from the environment,
 * validates the password against the standard policy, rewrites the bcrypt
 * hash, clears any lockout, bumps token_version, revokes live sessions and
 * writes an audit entry. Accounts whose password env var is unset are skipped.
 */
const path = require('path');

const backendMod = (name) => require(path.join(__dirname, '..', 'backend', 'node_modules', name));

try { backendMod('dotenv').config({ quiet: true }); } catch { /* env already provided (e.g. Render) */ }

const bcrypt = backendMod('bcrypt');
const { initDatabase, db, dbPath, logAudit } = require('../backend/src/config/database');
const { validatePassword, bcryptRounds } = require('../backend/src/auth/password');
const { revokeAllUserSessions } = require('../backend/src/middleware/auth.middleware');

const ROLES = [
  { role: 'owner', userEnv: 'INITIAL_OWNER_USERNAME', passEnv: 'INITIAL_OWNER_PASSWORD', fallbackUser: 'ashish' },
  { role: 'manager', userEnv: 'INITIAL_MANAGER_USERNAME', passEnv: 'INITIAL_MANAGER_PASSWORD', fallbackUser: 'parmar' },
  { role: 'front_desk', userEnv: 'INITIAL_FRONT_DESK_USERNAME', passEnv: 'INITIAL_FRONT_DESK_PASSWORD', fallbackUser: 'frontdesk' },
  { role: 'trainer', userEnv: 'INITIAL_TRAINER_USERNAME', passEnv: 'INITIAL_TRAINER_PASSWORD', fallbackUser: 'sona.walia' }
];

function parseArgs(argv) {
  const args = { roles: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--role') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Missing value for --role');
        process.exit(1);
      }
      args.roles.push(value.trim().toLowerCase().replace(/[\s-]/g, '_'));
      i += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

console.log('--- Samrat Fitness King · Apply staff passwords from environment ---');
console.log(`Database: ${dbPath}`);
initDatabase();

const selected = args.roles.length ? ROLES.filter(r => args.roles.includes(r.role)) : ROLES;
if (!selected.length) {
  console.error(`No matching roles. Valid values: ${ROLES.map(r => r.role).join(', ')}`);
  process.exit(1);
}

const planned = [];
for (const entry of selected) {
  const username = (process.env[entry.userEnv] || entry.fallbackUser).trim().toLowerCase();
  const password = process.env[entry.passEnv];

  if (!password) {
    console.log(`• ${entry.role.padEnd(10)} skipped — ${entry.passEnv} is not set.`);
    continue;
  }

  const policyError = validatePassword(password);
  if (policyError) {
    console.log(`• ${entry.role.padEnd(10)} SKIPPED — ${entry.passEnv} fails the policy: ${policyError}`);
    continue;
  }

  const user = db.prepare('SELECT * FROM Users WHERE username = ? COLLATE NOCASE AND role = ? LIMIT 1')
    .get(username, entry.role);

  if (!user) {
    console.log(`• ${entry.role.padEnd(10)} SKIPPED — no ${entry.role} account with User ID "${username}".`);
    continue;
  }

  planned.push({ entry, user, password });
  const flags = [user.active ? 'active' : 'DISABLED'];
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) flags.push('locked → will be cleared');
  console.log(`• ${entry.role.padEnd(10)} will update @${user.username} (${user.full_name}) [${flags.join(', ')}]`);
}

if (!planned.length) {
  console.log('\nNothing to do.');
  process.exit(0);
}

if (args.dryRun) {
  console.log(`\nDry run — ${planned.length} account(s) would be updated. Re-run with --yes to apply.`);
  process.exit(0);
}

if (!args.yes) {
  console.error('\nRefusing to modify accounts without confirmation. Re-run with --yes (or --dry-run to preview).');
  process.exit(1);
}

const changedAt = new Date().toISOString();
let updated = 0;

for (const { entry, user, password } of planned) {
  const passwordHash = bcrypt.hashSync(password, bcryptRounds());
  db.transaction(() => {
    db.prepare(`
      UPDATE Users
      SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1,
          failed_login_attempts = 0, locked_until = NULL, active = 1, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, changedAt, changedAt, user.id);
    revokeAllUserSessions(user.id);
  })();

  logAudit(null, 'System', 'Apply Staff Password (CLI)', 'Users', user.id,
    { username: user.username, role: entry.role },
    { message: `Password re-applied from ${entry.passEnv} via scripts/applyStaffPasswords.js.` });

  console.log(`✔ ${entry.role.padEnd(10)} @${user.username} updated.`);
  updated += 1;
}

console.log(`\n✔ ${updated} account(s) updated. All previous sessions for them were revoked.`);
console.log('  Staff can now sign in with the values shown in the Render Environment page.');
