const { db, logAudit } = require('../config/database');
const { ALL_ROLES, actorTypeForRole } = require('../auth/roles');
const { normalizeEmail, validateEmail } = require('../auth/email');
const { normalizePhone, validatePhone } = require('../auth/phone');
const { revokeAllUserSessions } = require('../middleware/auth.middleware');

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: user.full_name,
    role: user.role,
    trainerId: user.trainer_id ?? null,
    phone: user.phone ?? null,
    active: Boolean(user.active),
    // A staff member's Google account is bound the first time they sign in.
    googleLinked: Boolean(user.google_sub),
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
  const target = db.prepare(`SELECT role, active FROM Users WHERE id = ?`).get(userId);
  return target?.role === 'owner' && Boolean(target.active) && activeOwners <= 1;
}

class UsersController {
  static list(req, res) {
    const users = db.prepare(`
      SELECT u.id, u.email, u.google_sub, u.full_name, u.role, u.trainer_id, u.phone, u.active,
             u.last_login_at, u.created_at,
             COUNT(s.id) AS active_sessions
      FROM Users u
      LEFT JOIN AuthSessions s
        ON s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?
      GROUP BY u.id
      ORDER BY u.active DESC, u.role ASC, u.full_name ASC
    `).all(new Date().toISOString());

    return res.json({ success: true, count: users.length, data: users.map(serializeUser) });
  }

  static create(req, res) {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const role = req.body?.role;
    const trainerId = role === 'trainer' ? Number(req.body?.trainerId) : null;
    const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    const emailError = validateEmail(rawEmail);
    const trainerError = validateTrainerLink(role, trainerId);
    const phoneError = validatePhone(rawPhone);
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (emailError || trainerError || phoneError || !fullName || fullName.length > 100 || !ALL_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: emailError || trainerError || phoneError ||
          (!ALL_ROLES.includes(role) ? 'Select a valid staff role.' : 'Full name is required and must be under 100 characters.')
      });
    }

    if (email && db.prepare('SELECT id FROM Users WHERE email = ? COLLATE NOCASE').get(email)) {
      return res.status(409).json({ success: false, error: 'That Gmail is already registered to another staff account.' });
    }
    if (phone && db.prepare('SELECT id FROM Users WHERE phone = ?').get(phone)) {
      return res.status(409).json({ success: false, error: 'That mobile number is already linked to another staff account.' });
    }

    const result = db.prepare(`
      INSERT INTO Users (email, full_name, role, trainer_id, phone, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(email, fullName, role, trainerId, phone);

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Create Staff User', 'Users', result.lastInsertRowid, null, {
      email,
      fullName,
      role,
      trainerId,
      phone
    });

    const created = db.prepare('SELECT * FROM Users WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      success: true,
      message: 'Staff account created. They can sign in with Google using that Gmail.',
      data: serializeUser(created)
    });
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

    let email = existing.email ?? null;
    if (req.body.email !== undefined) {
      const rawEmail = typeof req.body.email === 'string' ? req.body.email.trim() : '';
      if (!rawEmail) {
        email = null;
      } else {
        const emailError = validateEmail(rawEmail);
        if (emailError) return res.status(400).json({ success: false, error: emailError });
        email = normalizeEmail(rawEmail);
      }
    }
    if (email && db.prepare('SELECT id FROM Users WHERE email = ? COLLATE NOCASE AND id != ?').get(email, userId)) {
      return res.status(409).json({ success: false, error: 'That Gmail is already registered to another staff account.' });
    }

    let phone = existing.phone ?? null;
    if (req.body.phone !== undefined) {
      const rawPhone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
      if (!rawPhone) {
        phone = null;
      } else {
        const phoneError = validatePhone(rawPhone);
        if (phoneError) return res.status(400).json({ success: false, error: phoneError });
        phone = normalizePhone(rawPhone);
      }
    }
    if (phone && db.prepare('SELECT id FROM Users WHERE phone = ? AND id != ?').get(phone, userId)) {
      return res.status(409).json({ success: false, error: 'That mobile number is already linked to another staff account.' });
    }

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

    // Changing the registered Gmail re-points the account at a different Google
    // identity, so the previous binding and every live session are invalidated.
    const emailChanged = (existing.email ?? null) !== email;
    const securityScopeChanged = (
      existing.role !== role ||
      Number(existing.trainer_id || 0) !== Number(trainerId || 0) ||
      Boolean(existing.active) !== active ||
      emailChanged
    );
    const updatedAt = new Date().toISOString();

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE Users
        SET email = ?, google_sub = CASE WHEN ? = 1 THEN NULL ELSE google_sub END,
            full_name = ?, role = ?, trainer_id = ?, phone = ?, active = ?,
            token_version = token_version + ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        email,
        emailChanged ? 1 : 0,
        fullName,
        role,
        trainerId,
        phone,
        active ? 1 : 0,
        securityScopeChanged ? 1 : 0,
        updatedAt,
        userId
      );
      if (securityScopeChanged) revokeAllUserSessions(userId);
    });
    transaction();

    logAudit(req.user.id, actorTypeForRole(req.user.role), 'Update Staff User', 'Users', userId, {
      email: existing.email,
      fullName: existing.full_name,
      role: existing.role,
      trainerId: existing.trainer_id,
      phone: existing.phone,
      active: Boolean(existing.active)
    }, { email, fullName, role, trainerId, phone, active, sessionsRevoked: securityScopeChanged });

    const updated = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
    return res.json({
      success: true,
      message: securityScopeChanged ? 'Staff access updated; existing sessions were revoked.' : 'Staff access updated.',
      data: serializeUser(updated)
    });
  }
}

module.exports = UsersController;
