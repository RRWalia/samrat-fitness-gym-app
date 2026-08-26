const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const { roleDetails } = require('../auth/roles');

const JWT_ISSUER = 'samrat-fitness-api';
const JWT_AUDIENCE = 'samrat-fitness-staff';
const DEVELOPMENT_SECRET = 'samrat-development-only-secret-change-before-production-2026';

function getJwtSecret() {
  return process.env.JWT_SECRET || DEVELOPMENT_SECRET;
}

function validateAuthConfiguration() {
  const secret = process.env.JWT_SECRET;
  const looksLikePlaceholder = !secret || /replace|change[_-]?me|example/i.test(secret);
  if (process.env.NODE_ENV === 'production' && (looksLikePlaceholder || secret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 random characters in production.');
  }
  if (process.env.NODE_ENV !== 'production' && !secret) {
    console.warn('JWT_SECRET is not set; using the development-only signing key.');
  }
  // Google is the only sign-in method, so production must have a client ID.
  if (process.env.NODE_ENV === 'production' && !String(process.env.GOOGLE_CLIENT_ID || '').trim()) {
    throw new Error('GOOGLE_CLIENT_ID must be configured in production for Google sign-in.');
  }
}

function hashJti(jti) {
  return crypto.createHash('sha256').update(jti).digest('hex');
}

function publicUser(user) {
  const details = roleDetails(user.role);
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: user.full_name,
    role: user.role,
    roleLabel: details.label,
    roleDescription: details.description,
    permissions: details.permissions,
    trainerId: user.trainer_id ?? null,
    phone: user.phone ?? null
  };
}

function revokeAllUserSessions(userId) {
  db.prepare(`
    UPDATE AuthSessions
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), userId);
}

function authenticationFailure(res, code = 'AUTH_REQUIRED', message = 'Authentication is required.') {
  res.set('Cache-Control', 'no-store');
  return res.status(401).json({ success: false, error: message, code });
}

function authenticateToken(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return authenticationFailure(res);

  try {
    const payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5
    });

    if (!payload.jti || !payload.sub) {
      return authenticationFailure(res, 'INVALID_SESSION', 'Your session is invalid. Please sign in again.');
    }

    const session = db.prepare(`
      SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, s.last_seen_at,
             u.id, u.email, u.full_name, u.role, u.trainer_id, u.phone, u.active, u.token_version
      FROM AuthSessions s
      JOIN Users u ON u.id = s.user_id
      WHERE s.jti_hash = ?
      LIMIT 1
    `).get(hashJti(payload.jti));

    const now = Date.now();
    if (
      !session ||
      session.revoked_at ||
      !session.active ||
      Number(payload.sub) !== session.user_id ||
      Number(payload.ver) !== session.token_version ||
      Date.parse(session.expires_at) <= now
    ) {
      return authenticationFailure(res, 'INVALID_SESSION', 'Your session is no longer active. Please sign in again.');
    }

    // Avoid a database write for every request while retaining useful session activity data.
    if (!session.last_seen_at || now - Date.parse(session.last_seen_at) > 5 * 60 * 1000) {
      db.prepare('UPDATE AuthSessions SET last_seen_at = ? WHERE id = ?')
        .run(new Date(now).toISOString(), session.session_id);
    }

    req.user = publicUser(session);
    req.auth = {
      token: match[1],
      jtiHash: hashJti(payload.jti),
      sessionId: session.session_id,
      expiresAt: session.expires_at
    };
    res.set('Cache-Control', 'no-store');
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return authenticationFailure(res, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    return authenticationFailure(res, 'INVALID_SESSION', 'Your session is invalid. Please sign in again.');
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return authenticationFailure(res);
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this resource.',
        code: 'FORBIDDEN'
      });
    }
    return next();
  };
}

module.exports = {
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret,
  validateAuthConfiguration,
  hashJti,
  publicUser,
  revokeAllUserSessions,
  authenticateToken,
  authorizeRoles
};
