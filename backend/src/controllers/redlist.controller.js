const { db, logAudit } = require('../config/database');
const { actorTypeForRole } = require('../auth/roles');
const AutomationService = require('../services/automation.service');

class RedListController {
  /**
   * Get Red List cases with filters
   */
  static getRedList(req, res) {
    try {
      const { band, status } = req.query;

      let query = `
        SELECT c.id as case_id, c.member_id, c.threshold_date, c.risk_days, c.status as case_status,
               c.next_action_date, c.created_at, c.updated_at,
               m.name as member_name, m.phone as member_phone, m.email as member_email,
               m.risk_state, m.status as member_status,
               p.name as plan_name, ms.expiry_date as membership_expiry,
               (SELECT MAX(check_in_time) FROM Attendance WHERE member_id = m.id) as last_attendance_time
        FROM NoShowCases c
        JOIN Members m ON c.member_id = m.id
        LEFT JOIN Memberships ms ON m.id = ms.member_id AND ms.status = 'Active'
        LEFT JOIN Plans p ON ms.plan_id = p.id
        WHERE 1=1
      `;

      const params = [];

      if (status && status !== 'All') {
        query += ` AND c.status = ? `;
        params.push(status);
      }

      if (band === '10-14') {
        query += ` AND c.risk_days >= 10 AND c.risk_days <= 14 `;
      } else if (band === '15-21') {
        query += ` AND c.risk_days >= 15 AND c.risk_days <= 21 `;
      } else if (band === '22+') {
        query += ` AND c.risk_days >= 22 `;
      }

      query += ` ORDER BY c.risk_days DESC, c.updated_at DESC `;

      const cases = db.prepare(query).all(...params);

      // Attach latest follow-ups for each case
      const getFollowUps = db.prepare(`
        SELECT id, channel, outcome, notes, staff_id, timestamp, next_action_date
        FROM FollowUps 
        WHERE case_id = ? 
        ORDER BY timestamp DESC
      `);

      const casesWithFollowUps = cases.map(c => {
        return {
          ...c,
          followUps: getFollowUps.all(c.case_id)
        };
      });

      return res.json({
        success: true,
        count: casesWithFollowUps.length,
        data: casesWithFollowUps
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Record a follow-up action with outcome and next step
   */
  static recordFollowUp(req, res) {
    try {
      const { case_id, channel, outcome, notes, next_action_date } = req.body;
      const staff_id = req.user.id;

      if (!case_id || !channel || !outcome) {
        return res.status(400).json({ error: 'Missing required follow-up fields: case_id, channel, outcome.' });
      }

      const gymCase = db.prepare('SELECT * FROM NoShowCases WHERE id = ?').get(case_id);
      if (!gymCase) {
        return res.status(404).json({ error: 'No-show case not found.' });
      }

      // Determine new case status
      let newStatus = 'Contacted';
      if (outcome === 'Cancelled') {
        newStatus = 'Closed';
      } else if (next_action_date) {
        newStatus = 'Follow-up due';
      }

      // Insert FollowUp
      const fuRes = db.prepare(`
        INSERT INTO FollowUps (case_id, channel, outcome, notes, staff_id, timestamp, next_action_date)
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
      `).run(case_id, channel, outcome, notes || '', staff_id, next_action_date || null);

      // Update case
      db.prepare(`
        UPDATE NoShowCases 
        SET status = ?, next_action_date = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(newStatus, next_action_date || null, case_id);

      logAudit(staff_id, actorTypeForRole(req.user.role), 'Record No-Show Follow-up', 'NoShowCases', case_id, { status: gymCase.status }, {
        status: newStatus,
        channel,
        outcome,
        notes,
        next_action_date
      });

      return res.json({
        success: true,
        message: `Follow-up logged via ${channel} (${outcome})`,
        followUpId: fuRes.lastInsertRowid,
        newStatus
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Trigger on-demand automated no-show scan
   */
  static triggerScan(req, res) {
    try {
      const result = AutomationService.runDailyNoShowScan();
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RedListController;
