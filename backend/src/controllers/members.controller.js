const { db, logAudit } = require('../config/database');
const { ROLES, isFullAccessRole, actorTypeForRole } = require('../auth/roles');

function trainerCanAccessMember(trainerId, memberId) {
  if (!trainerId) return false;
  return Boolean(db.prepare(`
    SELECT 1
    FROM Members m
    WHERE m.id = ? AND (
      m.assigned_trainer_id = ? OR EXISTS (
        SELECT 1
        FROM AddOnOrders ao
        JOIN AddOns a ON a.id = ao.addon_id
        WHERE ao.member_id = m.id
          AND a.type = 'PT'
          AND COALESCE(ao.trainer_product_id, a.trainer_id) = ?
      )
    )
  `).get(memberId, trainerId, trainerId));
}

class MembersController {
  static getAllMembers(req, res) {
    try {
      const { status, risk, search } = req.query;
      const fullAccess = isFullAccessRole(req.user.role);
      const trainerAccess = req.user.role === ROLES.TRAINER;

      const selectFields = fullAccess
        ? `m.*, ms.id AS membership_id, ms.plan_id, ms.start_date, ms.expiry_date,
           ms.status AS membership_status, p.name AS plan_name,
           s.current_value AS current_streak, s.best_value AS best_streak, s.target AS streak_target,
           (SELECT MAX(check_in_time) FROM Attendance WHERE member_id = m.id) AS last_attendance,
           (SELECT COUNT(*) FROM Attendance WHERE member_id = m.id AND check_in_time >= date('now', '-7 days', 'localtime')) AS past_7d_checkins`
        : `m.id, m.name, m.phone, m.status, m.risk_state, m.assigned_trainer_id,
           ms.id AS membership_id, ms.start_date, ms.expiry_date, ms.status AS membership_status,
           p.name AS plan_name, s.current_value AS current_streak,
           (SELECT MAX(check_in_time) FROM Attendance WHERE member_id = m.id) AS last_attendance`;

      let query = `
        SELECT ${selectFields}
        FROM Members m
        LEFT JOIN Memberships ms ON ms.id = (
          SELECT inner_ms.id FROM Memberships inner_ms
          WHERE inner_ms.member_id = m.id
          ORDER BY (inner_ms.status = 'Active') DESC, inner_ms.expiry_date DESC, inner_ms.id DESC
          LIMIT 1
        )
        LEFT JOIN Plans p ON ms.plan_id = p.id
        LEFT JOIN Streaks s ON m.id = s.member_id
        WHERE 1=1
      `;
      const params = [];

      if (trainerAccess) {
        query += ` AND (
          m.assigned_trainer_id = ? OR EXISTS (
            SELECT 1 FROM AddOnOrders ao
            JOIN AddOns a ON a.id = ao.addon_id
            WHERE ao.member_id = m.id AND a.type = 'PT'
              AND COALESCE(ao.trainer_product_id, a.trainer_id) = ?
          )
        ) `;
        params.push(req.user.trainerId, req.user.trainerId);
      }
      if (status && status !== 'All') {
        query += ' AND m.status = ? ';
        params.push(status);
      }
      if (risk && risk !== 'All') {
        if (risk === 'Risk') query += " AND m.risk_state LIKE 'Risk-%' ";
        else {
          query += ' AND m.risk_state = ? ';
          params.push(risk);
        }
      }
      if (search) {
        query += ' AND (m.name LIKE ? OR m.phone LIKE ? ';
        if (fullAccess) query += ' OR m.email LIKE ? ';
        query += ') ';
        const term = `%${String(search).slice(0, 80)}%`;
        params.push(term, term);
        if (fullAccess) params.push(term);
      }
      query += ' ORDER BY m.name ASC ';

      const members = db.prepare(query).all(...params);
      return res.json({
        success: true,
        count: members.length,
        accessScope: fullAccess ? 'full' : (trainerAccess ? 'assigned_pt_clients' : 'assisted_lookup'),
        data: members
      });
    } catch (err) {
      console.error('Member list error:', err);
      return res.status(500).json({ success: false, error: 'Unable to load member records.' });
    }
  }

  static getMemberById(req, res) {
    try {
      const memberId = Number(req.params.id);
      const fullAccess = isFullAccessRole(req.user.role);
      const trainerAccess = req.user.role === ROLES.TRAINER;

      if (trainerAccess && !trainerCanAccessMember(req.user.trainerId, memberId)) {
        return res.status(403).json({ success: false, error: 'This member is not assigned to your trainer account.', code: 'FORBIDDEN' });
      }

      const memberFields = fullAccess
        ? 'm.*'
        : 'm.id, m.name, m.phone, m.status, m.risk_state, m.join_date, m.assigned_trainer_id';
      const member = db.prepare(`
        SELECT ${memberFields}, s.current_value AS current_streak, s.best_value AS best_streak,
               s.target AS streak_target, s.rule_type AS streak_rule
        FROM Members m
        LEFT JOIN Streaks s ON m.id = s.member_id
        WHERE m.id = ?
      `).get(memberId);
      if (!member) return res.status(404).json({ success: false, error: 'Member not found.' });

      const attendance = db.prepare(`
        SELECT id, check_in_time, source, correction_reason
        FROM Attendance WHERE member_id = ?
        ORDER BY check_in_time DESC LIMIT 15
      `).all(memberId);

      if (!fullAccess) {
        if (trainerAccess) {
          const ptOrders = db.prepare(`
            SELECT ao.id, ao.usage, ao.max_usage, ao.status, ao.created_at,
                   a.title, a.type, a.qualifications
            FROM AddOnOrders ao
            JOIN AddOns a ON a.id = ao.addon_id
            WHERE ao.member_id = ? AND a.type = 'PT'
              AND COALESCE(ao.trainer_product_id, a.trainer_id) = ?
            ORDER BY ao.created_at DESC
          `).all(memberId, req.user.trainerId);
          return res.json({
            success: true,
            accessScope: 'assigned_pt_client',
            data: { ...member, attendance, ptOrders }
          });
        }

        const activeMembership = db.prepare(`
          SELECT ms.id, ms.start_date, ms.expiry_date, ms.status, p.name AS plan_name
          FROM Memberships ms
          JOIN Plans p ON p.id = ms.plan_id
          WHERE ms.member_id = ?
          ORDER BY (ms.status = 'Active') DESC, ms.expiry_date DESC LIMIT 1
        `).get(memberId);
        return res.json({
          success: true,
          accessScope: 'assisted_lookup',
          data: { ...member, activeMembership, attendance }
        });
      }

      const memberships = db.prepare(`
        SELECT ms.*, p.name AS plan_name, p.duration_months, p.base_price
        FROM Memberships ms
        JOIN Plans p ON ms.plan_id = p.id
        WHERE ms.member_id = ?
        ORDER BY ms.expiry_date DESC
      `).all(memberId);
      const addOns = db.prepare(`
        SELECT ao.*, a.title, a.type, a.description, a.price
        FROM AddOnOrders ao
        JOIN AddOns a ON ao.addon_id = a.id
        WHERE ao.member_id = ?
        ORDER BY ao.id DESC
      `).all(memberId);
      const noShowCases = db.prepare('SELECT * FROM NoShowCases WHERE member_id = ? ORDER BY id DESC').all(memberId);
      const notifications = db.prepare(`
        SELECT * FROM Notifications WHERE member_id = ? ORDER BY created_at DESC LIMIT 10
      `).all(memberId);

      return res.json({
        success: true,
        accessScope: 'full',
        data: { ...member, memberships, attendance, addOns, noShowCases, notifications }
      });
    } catch (err) {
      console.error('Member detail error:', err);
      return res.status(500).json({ success: false, error: 'Unable to load this member.' });
    }
  }

  static createMember(req, res) {
    try {
      const {
        name,
        phone,
        email,
        plan_id,
        assigned_trainer_id = null,
        join_date = new Date().toISOString().split('T')[0]
      } = req.body;

      if (!name || !phone || !plan_id) {
        return res.status(400).json({ success: false, error: 'Name, phone and plan_id are required.' });
      }
      const plan = db.prepare('SELECT * FROM Plans WHERE id = ?').get(plan_id);
      if (!plan) return res.status(400).json({ success: false, error: 'Selected plan not found.' });
      if (db.prepare('SELECT id FROM Members WHERE phone = ?').get(phone)) {
        return res.status(409).json({ success: false, error: 'Phone number already registered.' });
      }

      const tx = db.transaction(() => {
        const memRes = db.prepare(`
          INSERT INTO Members (name, phone, email, consent, join_date, status, risk_state, assigned_trainer_id)
          VALUES (?, ?, ?, 1, ?, 'Active', 'Normal', ?)
        `).run(String(name).trim(), String(phone).trim(), email ? String(email).trim() : null, join_date, assigned_trainer_id || null);
        const memberId = memRes.lastInsertRowid;

        db.prepare(`
          INSERT INTO Streaks (member_id, rule_type, target, current_value, best_value, last_update)
          VALUES (?, 'Weekly', 4, 0, 0, ?)
        `).run(memberId, join_date);

        const exp = new Date(join_date);
        exp.setMonth(exp.getMonth() + plan.duration_months);
        const expiryDate = exp.toISOString().split('T')[0];
        const msRes = db.prepare(`
          INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
          VALUES (?, ?, ?, ?, 'Active', 'New_Registration')
        `).run(memberId, plan.id, join_date, expiryDate);

        const amount = Math.max(0, plan.base_price - (plan.discount || 0));
        db.prepare(`
          INSERT INTO Payments (member_id, order_id, provider_reference, amount, status, verified_time)
          VALUES (?, ?, ?, ?, 'Paid', datetime('now', 'localtime'))
        `).run(memberId, msRes.lastInsertRowid, `REG_${Date.now()}`, amount);

        logAudit(req.user.id, actorTypeForRole(req.user.role), 'Register New Member', 'Members', memberId, null, {
          name, phone, planName: plan.name, amount, expiryDate
        });
        return { memberId, name, phone, planName: plan.name, expiryDate };
      });

      return res.status(201).json({ success: true, message: 'Member registered successfully.', data: tx() });
    } catch (err) {
      console.error('Create member error:', err);
      return res.status(500).json({ success: false, error: 'Unable to register member.' });
    }
  }

  static toggleStatus(req, res) {
    try {
      const memberId = Number(req.params.id);
      const { status, reason } = req.body;
      if (!['Paused', 'Active', 'Cancelled', 'Blocked'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Select a valid member status.' });
      }
      const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ success: false, error: 'Member not found.' });

      db.prepare(`
        UPDATE Members SET status = ?, risk_state = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
      `).run(status, status === 'Paused' ? 'Paused' : (status === 'Active' ? 'Normal' : status), memberId);

      if (status === 'Paused') {
        db.prepare("UPDATE Memberships SET status = 'Frozen' WHERE member_id = ? AND status = 'Active'").run(memberId);
      } else if (status === 'Active') {
        db.prepare("UPDATE Memberships SET status = 'Active' WHERE member_id = ? AND status = 'Frozen'").run(memberId);
      }

      logAudit(req.user.id, actorTypeForRole(req.user.role), `Update Member Status to ${status}`, 'Members', memberId,
        { previous: member.status }, { new: status, reason });
      return res.json({ success: true, message: `Member status updated to ${status}.` });
    } catch (err) {
      console.error('Member status error:', err);
      return res.status(500).json({ success: false, error: 'Unable to update member status.' });
    }
  }
}

module.exports = MembersController;
