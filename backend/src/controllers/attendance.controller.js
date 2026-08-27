const { db } = require('../config/database');
const { ROLES, actorTypeForRole } = require('../auth/roles');
const { recordAttendance } = require('../services/checkin.service');
const crypto = require('crypto');

// The kiosk QR rotates every QR_WINDOW_MS, and a scan is accepted for the
// current window plus the one before it (so effective validity is
// ~2 * QR_WINDOW_MS). This needs to be long enough for a real member to
// unlock their phone, open the camera, scan, wait for the page to load, and
// type their registered mobile number by hand — a flow that routinely takes
// 30-60+ seconds. A short window (previously 15s, ~30s effective) meant the
// token had almost always expired by the time the member submitted, so every
// scan was rejected with "invalid or expired" even though the QR was in fact
// the one currently on screen. 2 minutes (~4 min effective) comfortably
// covers the manual-entry flow while still limiting how long a screenshot of
// the kiosk QR stays usable.
const QR_WINDOW_MS = 120000;

function qrTokenForWindow(windowNumber) {
  const raw = `SAMRAT_GYM_${windowNumber}`;
  return `SFK_${crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16)}`;
}

function isCurrentQrToken(token) {
  if (typeof token !== 'string') return false;
  const currentWindow = Math.floor(Date.now() / QR_WINDOW_MS);
  // Permit the immediately previous rotation to account for a scan at the boundary.
  return token === qrTokenForWindow(currentWindow) || token === qrTokenForWindow(currentWindow - 1);
}

class AttendanceController {
  /**
   * Generates a dynamic rotating session-bound QR token
   */
  static getQrSession(req, res) {
    try {
      const timestamp = Date.now();
      const token = qrTokenForWindow(Math.floor(timestamp / QR_WINDOW_MS));

      return res.json({
        success: true,
        qrToken: token,
        expiresInSeconds: Math.floor(QR_WINDOW_MS / 1000) - Math.floor((timestamp % QR_WINDOW_MS) / 1000),
        gymName: 'Samrat Fitness King'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Check-in endpoint with duplicate scan prevention & streak update
   */
  static checkIn(req, res) {
    try {
      const { member_id, phone, source = 'QR', qr_session, correction_reason } = req.body;

      if (!['QR', 'Assisted', 'Manual'].includes(source)) {
        return res.status(400).json({ success: false, error: 'Invalid check-in source.' });
      }
      if (req.user.role === ROLES.FRONT_DESK && !['QR', 'Assisted'].includes(source)) {
        return res.status(403).json({ success: false, error: 'Front desk accounts may record assisted or QR check-ins only.', code: 'FORBIDDEN' });
      }
      if (source === 'QR' && !isCurrentQrToken(qr_session)) {
        return res.status(400).json({ success: false, error: 'This QR code is invalid or has expired. Please scan the current kiosk code.' });
      }
      if (source === 'Assisted' && (!correction_reason || String(correction_reason).trim().length < 3)) {
        return res.status(400).json({ success: false, error: 'A reason is required for assisted check-in.' });
      }

      let member;
      if (member_id) {
        member = db.prepare('SELECT * FROM Members WHERE id = ?').get(member_id);
      } else if (phone) {
        member = db.prepare('SELECT * FROM Members WHERE phone = ?').get(phone);
      }

      if (!member) {
        return res.status(404).json({ error: 'Member not found. Please verify member ID or phone.' });
      }

      if (member.status === 'Blocked' || member.status === 'Cancelled') {
        return res.status(403).json({ error: `Member access is ${member.status}. Please contact front desk.` });
      }

      // Check active membership
      const activeMembership = db.prepare(`
        SELECT * FROM Memberships 
        WHERE member_id = ? AND status = 'Active' AND expiry_date >= date('now', 'localtime')
        ORDER BY expiry_date DESC LIMIT 1
      `).get(member.id);

      if (!activeMembership && source === 'QR') {
        return res.status(400).json({
          error: 'Membership is expired or inactive. Please renew to check-in via QR.',
          memberId: member.id,
          memberName: member.name,
          needsRenewal: true
        });
      }

      // Settings: Duplicate scan window
      const settings = db.prepare('SELECT duplicate_scan_window_minutes, streak_rule FROM Settings ORDER BY id DESC LIMIT 1').get() || { duplicate_scan_window_minutes: 30, streak_rule: 'Weekly' };
      const windowMinutes = settings.duplicate_scan_window_minutes || 30;

      // Duplicate scan prevention
      const lastCheckIn = db.prepare(`
        SELECT check_in_time FROM Attendance 
        WHERE member_id = ? 
        ORDER BY check_in_time DESC LIMIT 1
      `).get(member.id);

      if (lastCheckIn) {
        const lastTime = new Date(lastCheckIn.check_in_time).getTime();
        const nowTime = new Date().getTime();
        const diffMinutes = Math.floor((nowTime - lastTime) / (1000 * 60));

        if (diffMinutes < windowMinutes && source === 'QR') {
          return res.status(429).json({
            error: `Duplicate scan rejected. Already checked in ${diffMinutes} min(s) ago. Window is ${windowMinutes} mins.`,
            alreadyCheckedIn: true,
            lastCheckInTime: lastCheckIn.check_in_time
          });
        }
      }

      const result = recordAttendance({
        member,
        source,
        qrSession: qr_session,
        correctionReason: correction_reason,
        actorId: req.user.id,
        actorType: actorTypeForRole(req.user.role),
        staffActorId: req.user.id
      });

      return res.json({
        success: true,
        message: `Welcome to Samrat Fitness King, ${member.name}! 🎉`,
        attendanceId: result.attendanceId,
        checkInTime: result.checkInTime,
        member: result.member,
        streak: result.streak,
        noShowCaseResolved: result.noShowCaseResolved
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get attendance history / live feed
   */
  static getAttendanceHistory(req, res) {
    try {
      const { member_id, limit = 50 } = req.query;

      let query = `
        SELECT a.id, a.check_in_time, a.source, a.correction_reason,
               m.id as member_id, m.name as member_name, m.phone as member_phone,
               m.risk_state, s.current_value as current_streak
        FROM Attendance a
        JOIN Members m ON a.member_id = m.id
        LEFT JOIN Streaks s ON m.id = s.member_id
      `;

      const params = [];
      if (member_id) {
        query += ` WHERE a.member_id = ? `;
        params.push(member_id);
      }

      query += ` ORDER BY a.check_in_time DESC LIMIT ? `;
      const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
      params.push(safeLimit);

      const rows = db.prepare(query).all(...params);
      return res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = AttendanceController;
// Exposed for the public member check-in endpoint and tests.
module.exports.qrTokenForWindow = qrTokenForWindow;
module.exports.isCurrentQrToken = isCurrentQrToken;
module.exports.QR_WINDOW_MS = QR_WINDOW_MS;
