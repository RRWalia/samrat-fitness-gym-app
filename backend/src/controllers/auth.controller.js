const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, logAudit } = require('../config/database');
const { validatePassword, bcryptRounds } = require('../auth/password');
const { normalizePhone, maskPhone } = require('../auth/phone');
const { actorTypeForRole } = require('../auth/roles');
const {
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret,
  hashJti,
  publicUser,
  revokeAllUserSessions
} = require('../middleware/auth.middleware');

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('invalid-password-comparison-only', bcryptRounds());

function sessionTtlSeconds(rememberMe) {
  const fallback = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
  const envName = rememberMe ? 'JWT_REMEMBER_TTL_SECONDS' : 'JWT_TTL_SECONDS';
  const configured = Number(process.env[envName] || fallback);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

function safeUserAgent(req) {
  return String(req.get('user-agent') || 'unknown').slice(0, 255);
}

function genericLoginFailure(res) {
  return res.status(401).json({
    success: false,
    error: 'Invalid username or password.',
    code: 'INVALID_CREDENTIALS'
  });
}

// Staff can sign in with their User ID or their registered mobile number.
// Usernames are checked first so digit-heavy User IDs keep working.
function findStaffByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return undefined;
  let user = db.prepare('SELECT * FROM Users WHERE username = ? COLLATE NOCASE LIMIT 1').get(value.toLowerCase());
  if (!user) {
    const phone = normalizePhone(value);
    if (phone) user = db.prepare('SELECT * FROM Users WHERE phone = ? LIMIT 1').get(phone);
  }
  return user;
}

class AuthController {
  static async login(req, res) {
    res.set('Cache-Control', 'no-store');
    const identifier = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rememberMe = req.body?.rememberMe === true;

    // Strict bounds prevent oversized bcrypt work and malformed identifiers.
    if (!identifier || identifier.length > 40 || !password || password.length > 128) {
      await bcrypt.compare('invalid', DUMMY_HASH);
      return genericLoginFailure(res);
    }

    const user = findStaffByIdentifier(identifier);
    const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    const now = Date.now();
    const isLocked = Boolean(user?.locked_until && Date.parse(user.locked_until) > now);

    if (!user || !passwordMatches || !user.active || isLocked) {
      if (user && user.active && !isLocked) {
        const previousLockExpired = user.locked_until && Date.parse(user.locked_until) <= now;
        const failedAttempts = (previousLockExpired ? 0 : user.failed_login_attempts) + 1;
        const lockedUntil = failedAttempts >= MAX_FAILED_LOGINS
          ? new Date(now + LOCK_DURATION_MS).toISOString()
          : null;

        db.prepare(`
          UPDATE Users
          SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
          WHERE id = ?
        `).run(failedAttempts, lockedUntil, new Date(now).toISOString(), user.id);

        logAudit(user.id, actorTypeForRole(user.role), 'Failed Staff Login', 'Users', user.id, null, {
          username: user.username,
          locked: Boolean(lockedUntil)
        });
      }
      return genericLoginFailure(res);
    }

    const ttlSeconds = sessionTtlSeconds(rememberMe);
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
    const jti = crypto.randomUUID();

    const token = jwt.sign(
      {
        username: user.username,
        role: user.role,
        trainerId: user.trainer_id ?? null,
        ver: user.token_version
      },
      getJwtSecret(),
      {
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: String(user.id),
        jwtid: jti,
        expiresIn: ttlSeconds
      }
    );

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE Users
        SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
        WHERE id = ?
      `).run(issuedAt, issuedAt, user.id);

      db.prepare(`
        INSERT INTO AuthSessions (user_id, jti_hash, remember_me, issued_at, expires_at, last_seen_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, hashJti(jti), rememberMe ? 1 : 0, issuedAt, expiresAt, issuedAt, safeUserAgent(req));

      // Expired/revoked rows are retained briefly for auditability, then removed.
      db.prepare(`
        DELETE FROM AuthSessions
        WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)
      `).run(
        new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
      );
    });
    transaction();

    logAudit(user.id, actorTypeForRole(user.role), 'Staff Login', 'Users', user.id, null, {
      username: user.username,
      role: user.role,
      rememberMe
    });

    const currentUser = db.prepare('SELECT * FROM Users WHERE id = ?').get(user.id);
    return res.json({
      success: true,
      token,
      tokenType: 'Bearer',
      expiresAt,
      user: publicUser(currentUser)
    });
  }

  static me(req, res) {
    return res.json({
      success: true,
      expiresAt: req.auth.expiresAt,
      user: req.user
    });
  }

  // Pre-login recovery step: verifies which staff account an identifier
  // belongs to so the person (or the front desk) can confirm the right
  // account before an administrator resets the password from Staff Access.
  // No password or credential data is ever returned.
  static forgotPassword(req, res) {
    res.set('Cache-Control', 'no-store');
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    if (!identifier || identifier.length > 40) {
      return res.status(400).json({
        success: false,
        error: 'Enter your User ID or registered mobile number.'
      });
    }

    const user = findStaffByIdentifier(identifier);
    if (!user || !user.active) {
      return res.json({
        success: true,
        found: false,
        message: 'We could not find an active staff account with that User ID or mobile number.'
      });
    }

    logAudit(null, 'System', 'Password Recovery Request', 'Users', user.id, null, {
      username: user.username,
      hasRecoveryMobile: Boolean(user.phone)
    });

    return res.json({
      success: true,
      found: true,
      message: Boolean(user.phone)
        ? 'Recovery mobile verified. Your gym administrator can now reset this password immediately.'
        : 'This account has no recovery mobile on file. Your gym administrator can still reset this password.',
      account: {
        fullName: user.full_name,
        username: user.username,
        phoneMasked: maskPhone(user.phone),
        hasRecoveryMobile: Boolean(user.phone)
      }
    });
  }

  static logout(req, res) {
    db.prepare(`
      UPDATE AuthSessions
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id = ?
    `).run(new Date().toISOString(), req.auth.sessionId);

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Staff Logout', 'Users', req.user.id, null, {
      username: req.user.username
    });

    return res.json({ success: true, message: 'Signed out securely.' });
  }

  static logoutAll(req, res) {
    revokeAllUserSessions(req.user.id);
    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Revoke All Staff Sessions', 'Users', req.user.id);
    return res.json({ success: true, message: 'All sessions have been signed out.' });
  }

  static async changePassword(req, res) {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const policyError = validatePassword(newPassword);
    if (policyError) return res.status(400).json({ success: false, error: policyError, code: 'WEAK_PASSWORD' });

    const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.user.id);
    const currentMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentMatches) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect.', code: 'INVALID_CURRENT_PASSWORD' });
    }
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({ success: false, error: 'New password must be different from the current password.' });
    }

    const changedAt = new Date().toISOString();
    const passwordHash = await bcrypt.hash(newPassword, bcryptRounds());
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE Users
        SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1, updated_at = ?
        WHERE id = ?
      `).run(passwordHash, changedAt, changedAt, user.id);
      revokeAllUserSessions(user.id);
    });
    transaction();

    logAudit(user.id, actorTypeForRole(user.role), 'Change Staff Password', 'Users', user.id);
    return res.json({
      success: true,
      message: 'Password changed. Please sign in again on all devices.'
    });
  }
}

module.exports = AuthController;
