const { db, logAudit } = require('../config/database');
const { actorTypeForRole } = require('../auth/roles');

class DashboardController {
  /**
   * Top Cards & Key Metrics Analytics
   */
  static getStats(req, res) {
    try {
      // 1. Active Members
      const activeMembersCount = db.prepare(`SELECT COUNT(*) as count FROM Members WHERE status = 'Active'`).get().count;
      const totalMembersCount = db.prepare(`SELECT COUNT(*) as count FROM Members`).get().count;

      // 2. Today's Check-ins
      const todayCheckinsCount = db.prepare(`
        SELECT COUNT(DISTINCT member_id) as count 
        FROM Attendance 
        WHERE date(check_in_time) = date('now', 'localtime')
      `).get().count;

      // 3. 7-day active members
      const sevenDayActiveCount = db.prepare(`
        SELECT COUNT(DISTINCT member_id) as count 
        FROM Attendance 
        WHERE check_in_time >= datetime('now', '-7 days', 'localtime')
      `).get().count;
      const attendanceActivityRate = activeMembersCount > 0 
        ? Math.round((sevenDayActiveCount / activeMembersCount) * 100) 
        : 0;

      // 4. Open No-show Cases & Red-list members
      const openNoShowCasesCount = db.prepare(`
        SELECT COUNT(*) as count FROM NoShowCases 
        WHERE status IN ('Open', 'Contacted', 'Follow-up due')
      `).get().count;

      // 5. Members Returned after follow-up & recovery rate
      const returnedCasesCount = db.prepare(`
        SELECT COUNT(*) as count FROM NoShowCases WHERE status = 'Returned'
      `).get().count;
      const contactedOrReturnedCount = db.prepare(`
        SELECT COUNT(*) as count FROM NoShowCases WHERE status IN ('Contacted', 'Follow-up due', 'Returned', 'Closed')
      `).get().count;
      const recoveryRate = contactedOrReturnedCount > 0 
        ? Math.round((returnedCasesCount / contactedOrReturnedCount) * 100) 
        : 0;

      // 6. Renewals due in 7 days
      const renewalsDue7dCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM Memberships ms
        JOIN Members m ON ms.member_id = m.id
        WHERE ms.status = 'Active' AND m.status = 'Active'
          AND ms.expiry_date >= date('now', 'localtime')
          AND ms.expiry_date <= date('now', '+7 days', 'localtime')
      `).get().count;

      // 7. Renewal Revenue Collected This Month
      const renewalRevenueThisMonth = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM RenewalOrders 
        WHERE status = 'Paid' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now', 'localtime'))
      `).get().total;

      // 8. Add-on Revenue This Month
      const addonRevenueThisMonth = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM AddOnOrders 
        WHERE status IN ('Paid', 'Active', 'Completed') 
          AND strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now', 'localtime'))
      `).get().total;

      // Add-on conversion rate (distinct members who purchased add-ons / active members)
      const membersWithAddons = db.prepare(`
        SELECT COUNT(DISTINCT member_id) as count FROM AddOnOrders WHERE status IN ('Paid', 'Active', 'Completed')
      `).get().count;
      const addonConversionRate = activeMembersCount > 0 
        ? Math.round((membersWithAddons / activeMembersCount) * 100) 
        : 0;

      // 9. On-Time Renewal Rate
      const onTimeRenewals = db.prepare(`
        SELECT COUNT(*) as count FROM RenewalOrders ro
        JOIN Memberships ms ON ro.membership_id = ms.id
        WHERE ro.status = 'Paid' AND ro.created_at <= ms.expiry_date
      `).get().count;
      const totalPaidRenewals = db.prepare(`SELECT COUNT(*) as count FROM RenewalOrders WHERE status = 'Paid'`).get().count;
      const onTimeRenewalRate = totalPaidRenewals > 0 
        ? Math.round((onTimeRenewals / totalPaidRenewals) * 100) 
        : 85;

      // 10. Data Quality Checks
      const dataAlerts = [];
      const expiredWithoutAction = db.prepare(`
        SELECT COUNT(*) as count FROM Memberships WHERE status = 'Active' AND expiry_date < date('now', 'localtime')
      `).get().count;
      if (expiredWithoutAction > 0) {
        dataAlerts.push({ severity: 'warning', message: `${expiredWithoutAction} memberships past expiry date still marked Active.` });
      }

      const outOfStockItems = db.prepare(`SELECT title FROM AddOns WHERE type = 'Product' AND stock <= 0`).all();
      if (outOfStockItems.length > 0) {
        dataAlerts.push({ severity: 'info', message: `Stock alert: ${outOfStockItems.map(i => i.title).join(', ')} is out of stock.` });
      }

      // Past 7 Days Attendance Trend
      const attendanceTrend = db.prepare(`
        SELECT date(check_in_time) as check_date, COUNT(DISTINCT member_id) as count
        FROM Attendance
        WHERE check_in_time >= date('now', '-6 days', 'localtime')
        GROUP BY date(check_in_time)
        ORDER BY check_date ASC
      `).all();

      return res.json({
        success: true,
        summary: {
          activeMembersCount,
          totalMembersCount,
          todayCheckinsCount,
          sevenDayActiveCount,
          attendanceActivityRate, // Target: >80%
          openNoShowCasesCount,
          returnedCasesCount,
          recoveryRate, // Target: >50%
          renewalsDue7dCount,
          renewalRevenueThisMonth,
          onTimeRenewalRate, // Target: >80%
          addonRevenueThisMonth,
          addonConversionRate, // Target: >20%
          dataAlerts,
          attendanceTrend
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Daily Closing Owner Summary
   */
  static getDailySummary(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const todayCheckins = db.prepare(`
        SELECT COUNT(DISTINCT member_id) as count FROM Attendance WHERE date(check_in_time) = date('now', 'localtime')
      `).get().count;

      const newNoShow = db.prepare(`
        SELECT COUNT(*) as count FROM NoShowCases WHERE date(created_at) = date('now', 'localtime')
      `).get().count;

      const followUpsDone = db.prepare(`
        SELECT COUNT(*) as count FROM FollowUps WHERE date(timestamp) = date('now', 'localtime')
      `).get().count;

      const renewalsCollected = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM RenewalOrders WHERE status = 'Paid' AND date(created_at) = date('now', 'localtime')
      `).get().total;

      const addonSold = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM AddOnOrders WHERE status IN ('Paid', 'Active') AND date(created_at) = date('now', 'localtime')
      `).get().total;

      const tomorrowPtCount = db.prepare(`
        SELECT COUNT(*) as count FROM AddOnOrders WHERE status = 'Active' AND usage < max_usage
      `).get().count;

      return res.json({
        success: true,
        date: today,
        gymName: 'Samrat Fitness King',
        todayCheckins,
        newNoShow,
        followUpsDone,
        renewalsCollected,
        addonSold,
        tomorrowPtCount
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Audit Logs
   */
  static getAuditLogs(req, res) {
    try {
      const logs = db.prepare(`
        SELECT * FROM AuditLogs ORDER BY timestamp DESC LIMIT 50
      `).all();
      return res.json({ success: true, count: logs.length, data: logs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Gym Settings
   */
  static getSettings(req, res) {
    try {
      const settings = db.prepare('SELECT * FROM Settings ORDER BY id DESC LIMIT 1').get();
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Update Settings
   */
  static updateSettings(req, res) {
    try {
      const { gym_name, gym_address, gym_hours, no_show_threshold, streak_rule, renewal_reminder_days, duplicate_scan_window_minutes } = req.body;

      if (gym_name !== undefined && (!String(gym_name).trim() || String(gym_name).length > 100)) {
        return res.status(400).json({ success: false, error: 'Gym name must be between 1 and 100 characters.' });
      }
      if (no_show_threshold !== undefined && (!Number.isInteger(Number(no_show_threshold)) || Number(no_show_threshold) < 1 || Number(no_show_threshold) > 90)) {
        return res.status(400).json({ success: false, error: 'No-show threshold must be between 1 and 90 days.' });
      }
      if (duplicate_scan_window_minutes !== undefined && (!Number.isInteger(Number(duplicate_scan_window_minutes)) || Number(duplicate_scan_window_minutes) < 1 || Number(duplicate_scan_window_minutes) > 240)) {
        return res.status(400).json({ success: false, error: 'Duplicate scan window must be between 1 and 240 minutes.' });
      }
      if (streak_rule !== undefined && !['Visit', 'Weekly', 'Calendar'].includes(streak_rule)) {
        return res.status(400).json({ success: false, error: 'Select a valid streak rule.' });
      }

      db.prepare(`
        UPDATE Settings 
        SET gym_name = COALESCE(?, gym_name),
            gym_address = COALESCE(?, gym_address),
            gym_hours = COALESCE(?, gym_hours),
            no_show_threshold = COALESCE(?, no_show_threshold),
            streak_rule = COALESCE(?, streak_rule),
            renewal_reminder_days = COALESCE(?, renewal_reminder_days),
            duplicate_scan_window_minutes = COALESCE(?, duplicate_scan_window_minutes)
        WHERE id = 1
      `).run(
        gym_name, gym_address, gym_hours, no_show_threshold, streak_rule,
        typeof renewal_reminder_days === 'object' ? JSON.stringify(renewal_reminder_days) : renewal_reminder_days,
        duplicate_scan_window_minutes
      );

      logAudit(req.user.id, actorTypeForRole(req.user.role), 'Update Gym Settings', 'Settings', 1, null, req.body);

      const updated = db.prepare('SELECT * FROM Settings WHERE id = 1').get();
      return res.json({ success: true, message: 'Settings updated successfully', data: updated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = DashboardController;
