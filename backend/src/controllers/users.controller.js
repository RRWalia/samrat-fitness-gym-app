const bcrypt = require('bcrypt');
const { db, logAudit } = require('../config/database');
const { ALL_ROLES, actorTypeForRole } = require('../auth/roles');
const { validateUsername, validatePassword, bcryptRounds } = require('../auth/password');
const { revokeAllUserSessions } = require('../middleware/auth.middleware');

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    trainerId: user.trainer_id ?? null,
    active: Boolean(user.active),
    failedLoginAttempts: user.failed_login_attempts,
    lockedUntil: user.locked_until,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    activeSessions: Number(user.active_sessions || 0)
  };
}

function validateTrainerLink(role, trainerId) {
  if (role !== 'trainer') return null;
  const value = Number(trainerId);
  if (!Number.isInteger(value) || value <= 0) {
    return 'A positive Trainer ID is required for trainer accounts.';
  }
  return null;
}

function isLastActiveOwner(userId) {
  const activeOwners = db.prepare(`SELECT COUNT(*) AS count FROM Users WHERE role = 'owner' AND active = 1`).get().count;
  const target = db.prepare('SELECT role, active FROM Users WHERE id = ?').get(userId);
  return target?.role === 'owner' && Boolean(target.active) && activeOwners <= 1;
}

class UsersController {
  static list(req, res) {
    const users = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.trainer_id, u.active,
             u.failed_login_attempts, u.locked_until, u.last_login_at, u.created_at,
             COUNT(s.id) AS active_sessions
      FROM Users u
      LEFT JOIN AuthSessions s
        ON s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?
      GROUP BY u.id
      ORDER BY u.active DESC, u.role ASC, u.full_name ASC
    `).all(new Date().toISOString());

    return res.json({ success: true, count: users.length, data: users.map(serializeUser) });
  }

  static async create(req, res) {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role;
    const trainerId = role === 'trainer' ? Number(req.body?.trainerId) : null;

    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    const trainerError = validateTrainerLink(role, trainerId);
    if (usernameError || passwordError || trainerError || !fullName || fullName.length > 100 || !ALL_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: usernameError || passwordError || trainerError ||
          (!ALL_ROLES.includes(role) ? 'Select a valid staff role.' : 'Full name is required and must be under 100 characters.')
      });
    }

    const existing = db.prepare('SELECT id FROM Users WHERE username = ? COLLATE NOCASE').get(username);
    if (existing) return res.status(409).json({ success: false, error: 'That username is already in use.' });

    const passwordHash = await bcrypt.hash(password, bcryptRounds());
    const result = db.prepare(`
      INSERT INTO Users (username, password_hash, full_name, role, trainer_id, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(username, passwordHash, fullName, role, trainerId);

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Create Staff User', 'Users', result.lastInsertRowid, null, {
      username,
      fullName,
      role,
      trainerId
    });

    const created = db.prepare('SELECT * FROM Users WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ success: true, message: 'Staff account created.', data: serializeUser(created) });
  }

  static update(req, res) {
    const userId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ success: false, error: 'Staff account not found.' });

    const fullName = req.body.fullName === undefined ? existing.full_name : String(req.body.fullName).trim();
    const role = req.body.role === undefined ? existing.role : req.body.role;
    const active = req.body.active === undefined ? Boolean(existing.active) : req.body.active === true;
    const trainerId = role === 'trainer'
      ? Number(req.body.trainerId === undefined ? existing.trainer_id : req.body.trainerId)
      : null;

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ success: false, error: 'Full name is required and must be under 100 characters.' });
    }
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Select a valid staff role.' });
    }
    const trainerError = validateTrainerLink(role, trainerId);
    if (trainerError) return res.status(400).json({ success: false, error: trainerError });
    if (userId === req.user.id && !active) {
      return res.status(400).json({ success: false, error: 'You cannot deactivate your own account.' });
    }
    if (isLastActiveOwner(userId) && (!active || role !== 'owner')) {
      return res.status(400).json({ success: false, error: 'At least one active owner account is required.' });
    }

    const securityScopeChanged = (
      existing.role !== role ||
      Number(existing.trainer_id || 0) !== Number(trainerId || 0) ||
      Boolean(existing.active) !== active
    );
    const updatedAt = new Date().toISOString();

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE Users
        SET full_name = ?, role = ?, trainer_id = ?, active = ?,
            token_version = token_version + ?,
            failed_login_attempts = CASE WHEN ? = 1 THEN 0 ELSE failed_login_attempts END,
            locked_until = CASE WHEN ? = 1 THEN NULL ELSE locked_until END,
            updated_at = ?
        WHERE id = ?
      `).run(
        fullName,
        role,
        trainerId,
        active ? 1 : 0,
        securityScopeChanged ? 1 : 0,
        active ? 1 : 0,
        active ? 1 : 0,
        updatedAt,
        userId
      );
      if (securityScopeChanged) revokeAllUserSessions(userId);
    });
    transaction();

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Update Staff User', 'Users', userId, {
      fullName: existing.full_name,
      role: existing.role,
      trainerId: existing.trainer_id,
      active: Boolean(existing.active)
    }, { fullName, role, trainerId, active });

    const updated = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
    return res.json({ success: true, message: 'Staff access updated.', data: serializeUser(updated) });
  }

  static async resetPassword(req, res) {
    const userId = Number(req.params.id);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ success: false, error: policyError });

    const existing = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
    if (!existing) return res.status(404).json({ success: false, error: 'Staff account not found.' });

    const passwordHash = await bcrypt.hash(password, bcryptRounds());
    const changedAt = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE Users
        SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1,
            failed_login_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?
      `).run(passwordHash, changedAt, changedAt, userId);
      revokeAllUserSessions(userId);
    });
    transaction();

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Reset Staff Password', 'Users', userId, null, {
      username: existing.username
    });
    return res.json({ success: true, message: 'Password reset. Existing sessions were revoked.' });
  }
}

module.exports = UsersController;
