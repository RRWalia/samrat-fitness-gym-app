#!/usr/bin/env node
// Attaches (or re-points) the Gmail address a staff account signs in with,
// directly against the database — the server-side equivalent of the owner's
// Staff Access panel. Use this from the service shell if you are locked out
// (e.g. the owner account has no Gmail linked yet).
//
// Usage:
//   node scripts/linkStaffGmail.js --email you@gmail.com --user ashish
//   node scripts/linkStaffGmail.js --email you@gmail.com --user 1 --yes
//   node scripts/linkStaffGmail.js --list            # show staff accounts
//
// Changing the linked Gmail revokes every active session for that account and
// clears any previously bound Google account so the new Gmail becomes the one
// trusted identity on the next sign-in.

require('dotenv').config({ quiet: true });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const readline = require('readline');

const backendDir = path.join(__dirname, '..', 'backend');
const { db, dbPath } = require(path.join(backendDir, 'src', 'config', 'database'));
const { initDatabase, logAudit } = require(path.join(backendDir, 'src', 'config', 'database'));
const { normalizeEmail, validateEmail } = require(path.join(backendDir, 'src', 'auth', 'email'));
const { revokeAllUserSessions } = require(path.join(backendDir, 'src', 'middleware', 'auth.middleware'));

function parseArgs(argv) {
  const args = { list: false, yes: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--email') args.email = argv[i + 1] || '';
    else if (arg === '--user') args.user = argv[i + 1] || '';
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg.startsWith('--user=')) args.user = arg.slice('--user='.length);
  }
  return args;
}

function listAccounts() {
  const users = db.prepare(`
    SELECT id, email, google_sub, full_name, role, active
    FROM Users
    ORDER BY active DESC, role ASC, full_name ASC
  `).all();
  if (!users.length) {
    console.log('No staff accounts exist. Start the server once with INITIAL_OWNER_EMAIL set to bootstrap.');
    return;
  }
  console.log('Staff accounts (id | email | google linked | name | role | active):');
  for (const user of users) {
    console.log(
      `  ${user.id} | ${user.email || '(no Gmail linked)'} | ${user.google_sub ? 'yes' : 'no'} | ${user.full_name} | ${user.role} | ${user.active ? 'active' : 'disabled'}`
    );
  }
}

function findUser(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(value));
  const email = normalizeEmail(value);
  if (email) return db.prepare('SELECT * FROM Users WHERE email = ? COLLATE NOCASE').get(email);
  return db.prepare("SELECT * FROM Users WHERE lower(full_name) = ? LIMIT 1").get(value.toLowerCase());
}

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  initDatabase();
  const args = parseArgs(process.argv);

  if (args.list || !args.email) {
    listAccounts();
    if (!args.email) {
      console.log('\nProvide --email <gmail> --user <id|email|name> to link a Gmail.');
      return 0;
    }
  }

  const emailError = validateEmail(args.email);
  if (emailError) {
    console.error(`Invalid Gmail: ${emailError}`);
    return 1;
  }
  const email = normalizeEmail(args.email);

  const user = findUser(args.user);
  if (!user) {
    console.error(`No staff account matches "${args.user}". Use --list to see accounts.`);
    return 1;
  }

  const takenBy = db.prepare('SELECT id, full_name FROM Users WHERE email = ? COLLATE NOCASE AND id != ?').get(email, user.id);
  if (takenBy) {
    console.error(`"${email}" is already linked to account #${takenBy.id} (${takenBy.full_name}).`);
    return 1;
  }

  console.log(`Account #${user.id}: ${user.full_name} (${user.role}) currently ${user.email ? `<${user.email}>` : 'has no Gmail linked'}.`);
  console.log(`Will link: ${email}. This revokes all active sessions for this account.`);

  if (!args.yes) {
    const ok = await confirm(`Continue? [y/N] `);
    if (!ok) {
      console.log('Cancelled.');
      return 0;
    }
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE Users SET email = ?, google_sub = NULL, updated_at = ? WHERE id = ?')
      .run(email, now, user.id);
    revokeAllUserSessions(user.id);
  })();

  logAudit(null, 'System', 'Link Staff Gmail (shell)', 'Users', user.id,
    { email: user.email ?? null }, { email });

  console.log(`Done. ${user.full_name} can now sign in with Google as ${email}.`);
  console.log(`Database: ${dbPath}`);
  return 0;
}

main().then(code => { db.close(); process.exit(code); }).catch(error => {
  console.error(error.message);
  process.exit(1);
});
