// Public, unauthenticated member check-in. A member scans the front-desk
// kiosk QR (which encodes /member-checkin?token=SFK_xxxxx), lands on the
// member-facing page, and submits their registered mobile number. This is the
// only operational endpoint exposed without a staff session.

const { db } = require('../config/database');
const { isCurrentQrToken } = require('./attendance.controller');
const { recordAttendance, settings } = require('../services/checkin.service');

function activeMembershipFor(memberId) {
  return db
    .prepare(
      `SELECT * FROM Memberships
       WHERE member_id = ? AND status = 'Active' AND expiry_date >= date('now', 'localtime')
       ORDER BY expiry_date DESC LIMIT 1`
    )
    .get(memberId);
}

function lastCheckInFor(memberId) {
  return db
    .prepare(`SELECT check_in_time FROM Attendance WHERE member_id = ? ORDER BY check_in_time DESC LIMIT 1`)
    .get(memberId);
}

// Members type their number by hand, so match on normalized digits (strip the
// +91 prefix and any spacing) rather than an exact string. This keeps the scan
// flow working whether the gym stored "+91 97234 88990" or the member types
// "+919723488990".
function findMemberByPhone(rawPhone) {
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return null;
  return db
    .prepare(`SELECT * FROM Members WHERE REPLACE(REPLACE(phone, ' ', ''), '+', '') = ? LIMIT 1`)
    .get(digits);
}

class PublicController {
  /**
   * POST /api/public/member-checkin
   * Body: { token: string, phone: string }
   */
  static memberCheckIn(req, res) {
    try {
      const body = req.body || {};
      const token = typeof body.token === 'string' ? body.token : '';
      const rawPhone = typeof body.phone === 'string' ? body.phone : '';
      const phone = rawPhone.replace(/\s+/g, '').trim();

      if (!isCurrentQrToken(token)) {
        return res.status(400).json({
          success: false,
          error: 'This QR code is invalid or has expired. Please scan the current kiosk code at the front desk.'
        });
      }

      if (!phone || phone.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Please enter your registered mobile number to check in.'
        });
      }

      const member = findMemberByPhone(phone);
      // Same generic message whether the number is unregistered or mistyped, so
      // the endpoint does not confirm which numbers belong to members.
      if (!member) {
        return res.status(404).json({
          success: false,
          error: 'No member found with this mobile number. Please check the number or visit the front desk.'
        });
      }

      if (member.status === 'Blocked' || member.status === 'Cancelled') {
        return res.status(403).json({
          success: false,
          error: `Member access is ${member.status}. Please contact the front desk.`
        });
      }

      const activeMembership = activeMembershipFor(member.id);
      if (!activeMembership) {
        return res.status(400).json({
          success: false,
          error: 'Membership is expired or inactive. Please renew to check in via QR.',
          memberId: member.id,
          memberName: member.name,
          needsRenewal: true
        });
      }

      // Duplicate scan prevention (mirrors the staff QR check-in window).
      const windowMinutes = settings().duplicate_scan_window_minutes || 30;
      const lastCheckIn = lastCheckInFor(member.id);
      if (lastCheckIn) {
        const diffMinutes = Math.floor((Date.now() - new Date(lastCheckIn.check_in_time).getTime()) / (1000 * 60));
        if (diffMinutes < windowMinutes) {
          return res.status(429).json({
            success: false,
            error: `You already checked in ${diffMinutes} min(s) ago.`,
            alreadyCheckedIn: true,
            lastCheckInTime: lastCheckIn.check_in_time
          });
        }
      }

      const result = recordAttendance({
        member,
        source: 'QR',
        qrSession: token,
        correctionReason: null,
        actorId: member.id,
        actorType: 'Member',
        staffActorId: null
      });

      return res.json({
        success: true,
        message: `Welcome to Samrat Fitness King, ${member.name}! 🎉`,
        ...result
      });
    } catch (err) {
      // Do not leak internal errors to anonymous callers.
      console.error('Public member check-in error:', err);
      return res.status(500).json({
        success: false,
        error: 'Unable to complete check-in right now. Please try again or visit the front desk.'
      });
    }
  }
}

module.exports = PublicController;
