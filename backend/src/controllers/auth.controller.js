const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, logAudit } = require('../config/database');
const { actorTypeForRole, validateRoleSelection } = require('../auth/roles');
const { normalizePhone, validatePhone } = require('../auth/phone');
const { GoogleAuthError, googleClientId, isGoogleLoginConfigured, verifyGoogleCredential } = require('../auth/google');
const {
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret,
  hashJti,
  publicUser,
  revokeAllUserSessions
} = require('../middleware/auth.middleware');

function sessionTtlSeconds(rememberMe) {
  const fallback = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
  const envName = rememberMe ? 'JWT_REMEMBER_TTL_SECONDS' : 'JWT_TTL_SECONDS';
  const configured = Number(process.env[envName] || fallback);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

function safeUserAgent(req) {
  return String(req.get('user-agent') || 'unknown').slice(0, 255);
}

class AuthController {
  // Sign-in configuration for the login screen. The OAuth client ID is public
  // by design (Google embeds it in the browser), so it is safe to expose here;
  // no secret material is ever returned.
  static config(req, res) {
    res.set('Cache-Control', 'no-store');
    const clientId = googleClientId();
    return res.json({
      success: true,
      googleSignIn: {
        configured: isGoogleLoginConfigured(),
        clientId: isGoogleLoginConfigured() ? clientId : null
      }
    });
  }

  // Exchanges a Google ID token ("credential") for an app session. Only Gmail
  // addresses an administrator registered in Staff Access resolve to an account.
  static async googleLogin(req, res) {
    res.set('Cache-Control', 'no-store');
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    const rememberMe = req.body?.rememberMe === true;
    const selectedRole = typeof req.body?.selectedRole === 'string' ? req.body.selectedRole.trim() : null;

    let identity;
    try {
      identity = await verifyGoogleCredential(credential);
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        return res.status(error.status).json({ success: false, error: error.message, code: error.code });
      }
      console.error('Google sign-in verification failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Unable to verify Google sign-in right now. Please try again.',
        code: 'GOOGLE_VERIFICATION_FAILED'
      });
    }

    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const user = db.prepare('SELECT * FROM Users WHERE email = ? COLLATE NOCASE LIMIT 1').get(identity.email);

    if (!user) {
      logAudit(null, 'System', 'Rejected Google Sign-in', 'Users', 0, null, {
        email: identity.email,
        reason: 'not_registered'
      });
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_NOT_REGISTERED',
        error: 'No staff account is registered for that Gmail. Ask your gym administrator to add it under Staff Access.'
      });
    }

    // The Google subject ID is bound on first sign-in. A different subject with
    // the same address means a look-alike account, not the one that was vetted.
    if (user.google_sub && identity.sub && user.google_sub !== identity.sub) {
      logAudit(user.id, 'System', 'Rejected Google Sign-in', 'Users', user.id, null, {
        email: identity.email,
        reason: 'google_account_mismatch'
      });
      return res.status(403).json({
        success: false,
        code: 'GOOGLE_ACCOUNT_MISMATCH',
        error: 'That Gmail is linked to a different Google account. Contact your gym administrator.'
      });
    }

    if (!user.active) {
      logAudit(user.id, 'System', 'Rejected Google Sign-in', 'Users', user.id, null, {
        email: identity.email,
        reason: 'deactivated'
      });
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        error: 'This staff account has been deactivated. Contact your gym administrator.'
      });
    }

    const roleCheck = validateRoleSelection(user.role, selectedRole);
    if (!roleCheck.valid) {
      logAudit(user.id, 'System', 'Rejected Google Sign-in', 'Users', user.id, null, {
        email: identity.email,
        reason: 'role_mismatch',
        selectedRole,
        registeredRole: user.role
      });
      return res.status(403).json({
        success: false,
        code: 'ROLE_MISMATCH',
        error: roleCheck.error
      });
    }

    const ttlSeconds = sessionTtlSeconds(rememberMe);
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
    const jti = crypto.randomUUID();

    const token = jwt.sign(
      {
        email: user.email,
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
        SET google_sub = COALESCE(google_sub, ?), last_login_at = ?, updated_at = ?
        WHERE id = ?
      `).run(identity.sub, issuedAt, issuedAt, user.id);

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

    logAudit(user.id, actorTypeForRole(user.role), 'Staff Google Sign-in', 'Users', user.id, null, {
      email: user.email,
      role: user.role,
      ...(selectedRole ? { selectedRole } : {}),
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

  static logout(req, res) {
    db.prepare(`
      UPDATE AuthSessions
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id = ?
    `).run(new Date().toISOString(), req.auth.sessionId);

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Staff Logout', 'Users', req.user.id, null, {
      email: req.user.email
    });

    return res.json({ success: true, message: 'Signed out securely.' });
  }

  static logoutAll(req, res) {
    revokeAllUserSessions(req.user.id);
    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Revoke All Staff Sessions', 'Users', req.user.id);
    return res.json({ success: true, message: 'All sessions have been signed out.' });
  }

  // Self-service contact number. The registered Gmail is not editable here —
  // only an owner/manager can re-point an account at another Google identity.
  static updateMyPhone(req, res) {
    const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const phoneError = validatePhone(rawPhone);
    if (phoneError) return res.status(400).json({ success: false, error: phoneError });

    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (phone && db.prepare('SELECT id FROM Users WHERE phone = ? AND id != ?').get(phone, req.user.id)) {
      return res.status(409).json({ success: false, error: 'That mobile number is already linked to another staff account.' });
    }

    db.prepare('UPDATE Users SET phone = ?, updated_at = ? WHERE id = ?')
      .run(phone, new Date().toISOString(), req.user.id);

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Update Staff Contact Mobile', 'Users', req.user.id, {
      phone: req.user.phone ?? null
    }, { phone });

    const updated = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.user.id);
    return res.json({ success: true, message: 'Mobile number updated.', data: publicUser(updated) });
  }
}

module.exports = AuthController;
