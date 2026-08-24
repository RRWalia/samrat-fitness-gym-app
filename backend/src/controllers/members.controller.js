const { db, logAudit } = require('../config/database');

class MembersController {
  /**
   * Get all members with filters & search
   */
  static getAllMembers(req, res) {
    try {
      const { status, risk, search } = req.query;

      let query = `
        SELECT m.*, 
               ms.id as membership_id, ms.plan_id, ms.start_date, ms.expiry_date, ms.status as membership_status,
               p.name as plan_name,
               s.current_value as current_streak, s.best_value as best_streak, s.target as streak_target,
               (SELECT MAX(check_in_time) FROM Attendance WHERE member_id = m.id) as last_attendance,
               (SELECT COUNT(*) FROM Attendance WHERE member_id = m.id AND check_in_time >= date('now', '-7 days', 'localtime')) as past_7d_checkins
        FROM Members m
        LEFT JOIN Memberships ms ON m.id = ms.member_id AND ms.status = 'Active'
        LEFT JOIN Plans p ON ms.plan_id = p.id
        LEFT JOIN Streaks s ON m.id = s.member_id
        WHERE 1=1
      `;

      const params = [];

      if (status && status !== 'All') {
        query += ` AND m.status = ? `;
        params.push(status);
      }

      if (risk && risk !== 'All') {
        if (risk === 'Risk') {
          query += ` AND m.risk_state LIKE 'Risk-%' `;
        } else {
          query += ` AND m.risk_state = ? `;
          params.push(risk);
        }
      }

      if (search) {
        query += ` AND (m.name LIKE ? OR m.phone LIKE ? OR m.email LIKE ?) `;
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      query += ` ORDER BY m.id DESC `;

      const members = db.prepare(query).all(...params);

      return res.json({
        success: true,
        count: members.length,
        data: members
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get single member detailed 360 profile
   */
  static getMemberById(req, res) {
    try {
      const { id } = req.params;

      const member = db.prepare(`
        SELECT m.*, 
               s.current_value as current_streak, s.best_value as best_streak, s.target as streak_target, s.rule_type as streak_rule
        FROM Members m
        LEFT JOIN Streaks s ON m.id = s.member_id
        WHERE m.id = ?
      `).get(id);

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Memberships
      const memberships = db.prepare(`
        SELECT ms.*, p.name as plan_name, p.duration_months, p.base_price
        FROM Memberships ms
        JOIN Plans p ON ms.plan_id = p.id
        WHERE ms.member_id = ?
        ORDER BY ms.expiry_date DESC
      `).all(id);

      // Recent Attendance
      const attendance = db.prepare(`
        SELECT * FROM Attendance 
        WHERE member_id = ? 
        ORDER BY check_in_time DESC LIMIT 15
      `).all(id);

      // Add-on Orders
      const addOns = db.prepare(`
        SELECT ao.*, a.title, a.type, a.description, a.price
        FROM AddOnOrders ao
        JOIN AddOns a ON ao.addon_id = a.id
        WHERE ao.member_id = ?
        ORDER BY ao.id DESC
      `).all(id);

      // No Show Cases
      const noShowCases = db.prepare(`
        SELECT * FROM NoShowCases 
        WHERE member_id = ? 
        ORDER BY id DESC
      `).all(id);

      // Notifications
      const notifications = db.prepare(`
        SELECT * FROM Notifications 
        WHERE member_id = ? 
        ORDER BY created_at DESC LIMIT 10
      `).all(id);

      return res.json({
        success: true,
        data: {
          ...member,
          memberships,
          attendance,
          addOns,
          noShowCases,
          notifications
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Add new member
   */
  static createMember(req, res) {
    try {
      const { name, phone, email, plan_id, join_date = new Date().toISOString().split('T')[0] } = req.body;

      if (!name || !phone || !plan_id) {
        return res.status(400).json({ error: 'Name, phone and plan_id are required' });
      }

      const plan = db.prepare('SELECT * FROM Plans WHERE id = ?').get(plan_id);
      if (!plan) return res.status(400).json({ error: 'Selected plan not found' });

      const existingPhone = db.prepare('SELECT id FROM Members WHERE phone = ?').get(phone);
      if (existingPhone) return res.status(400).json({ error: 'Phone number already registered' });

      const tx = db.transaction(() => {
        // 1. Insert Member
        const memRes = db.prepare(`
          INSERT INTO Members (name, phone, email, consent, join_date, status, risk_state)
          VALUES (?, ?, ?, 1, ?, 'Active', 'Normal')
        `).run(name, phone, email || null, join_date);
        const memberId = memRes.lastInsertRowid;

        // 2. Insert Streak
        db.prepare(`
          INSERT INTO Streaks (member_id, rule_type, target, current_value, best_value, last_update)
          VALUES (?, 'Weekly', 4, 0, 0, ?)
        `).run(memberId, join_date);

        // 3. Insert Membership
        const exp = new Date(join_date);
        exp.setMonth(exp.getMonth() + plan.duration_months);
        const expiryDate = exp.toISOString().split('T')[0];

        const msRes = db.prepare(`
          INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
          VALUES (?, ?, ?, ?, 'Active', 'New_Registration')
        `).run(memberId, plan.id, join_date, expiryDate);

        // 4. Insert Payment
        const amount = Math.max(0, plan.base_price - (plan.discount || 0));
        db.prepare(`
          INSERT INTO Payments (member_id, order_id, provider_reference, amount, status, verified_time)
          VALUES (?, ?, ?, ?, 'Paid', datetime('now', 'localtime'))
        `).run(memberId, msRes.lastInsertRowid, `REG_${Date.now()}`, amount);

        logAudit(1, 'Staff', 'Register New Member', 'Members', memberId, null, {
          name, phone, planName: plan.name, amount, expiryDate
        });

        return { memberId, name, phone, planName: plan.name, expiryDate };
      });

      const result = tx();
      return res.json({ success: true, message: 'Member registered successfully', data: result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Pause or resume member
   */
  static toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body; // 'Paused', 'Active', 'Cancelled', 'Blocked'

      const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(id);
      if (!member) return res.status(404).json({ error: 'Member not found' });

      db.prepare(`
        UPDATE Members 
        SET status = ?, risk_state = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(status, status === 'Paused' ? 'Paused' : (status === 'Active' ? 'Normal' : status), id);

      // Update membership status
      if (status === 'Paused') {
        db.prepare(`UPDATE Memberships SET status = 'Frozen' WHERE member_id = ? AND status = 'Active'`).run(id);
      } else if (status === 'Active') {
        db.prepare(`UPDATE Memberships SET status = 'Active' WHERE member_id = ? AND status = 'Frozen'`).run(id);
      }

      logAudit(1, 'Staff', `Update Member Status to ${status}`, 'Members', id, { previous: member.status }, { new: status, reason });

      return res.json({ success: true, message: `Member status updated to ${status}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = MembersController;
