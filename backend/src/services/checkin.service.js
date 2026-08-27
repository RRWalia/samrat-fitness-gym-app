// Shared attendance core used by both the staff check-in endpoint and the
// public, member-originated QR check-in endpoint. Validation (token, member
// lookup, membership status, duplicate-scan window) lives in each controller;
// this module performs the authoritative write: attendance insert, streak
// update, no-show resolution, risk-state reset, and audit logging.

const { db, logAudit } = require('../config/database');

function settings() {
  return (
    db
      .prepare('SELECT duplicate_scan_window_minutes, streak_rule FROM Settings ORDER BY id DESC LIMIT 1')
      .get() || { duplicate_scan_window_minutes: 30, streak_rule: 'Weekly' }
  );
}

/**
 * @param {object} params
 * @param {object} params.member            Full Members row from the DB.
 * @param {'QR'|'Assisted'|'Manual'} params.source
 * @param {string} [params.qrSession]        QR token for QR-source check-ins.
 * @param {string} [params.correctionReason] Reason for assisted check-ins.
 * @param {number|null} params.actorId        Audit/follow-up actor (staff id or member id).
 * @param {'Member'|'Staff'|'Owner'|'System'} params.actorType
 * @param {number|null} params.staffActorId   Value written to Attendance.staff_actor_id.
 */
function recordAttendance({ member, source, qrSession, correctionReason, actorId, actorType, staffActorId }) {
  const attRes = db
    .prepare(`
      INSERT INTO Attendance (member_id, check_in_time, source, qr_session, correction_reason, staff_actor_id)
      VALUES (?, datetime('now', 'localtime'), ?, ?, ?, ?)
    `)
    .run(member.id, source, qrSession || null, correctionReason || null, staffActorId ?? null);

  // Streak engine
  let streak = db.prepare('SELECT * FROM Streaks WHERE member_id = ?').get(member.id);
  if (!streak) {
    db.prepare(
      `INSERT INTO Streaks (member_id, rule_type, target, current_value, best_value, last_update)
       VALUES (?, ?, 4, 1, 1, date('now', 'localtime'))`
    ).run(member.id, settings().streak_rule || 'Weekly');
    streak = db.prepare('SELECT * FROM Streaks WHERE member_id = ?').get(member.id);
  } else {
    const newCurrent = streak.current_value + 1;
    const newBest = Math.max(streak.best_value, newCurrent);
    db.prepare(
      `UPDATE Streaks SET current_value = ?, best_value = ?, last_update = date('now', 'localtime') WHERE member_id = ?`
    ).run(newCurrent, newBest, member.id);
    streak.current_value = newCurrent;
    streak.best_value = newBest;
  }

  // OPERATING LOOP KEY LINK: Resolve open No-Show cases automatically upon check-in!
  const openCase = db
    .prepare(
      `SELECT id FROM NoShowCases
       WHERE member_id = ? AND status IN ('Open', 'Contacted', 'Follow-up due')
       ORDER BY id DESC LIMIT 1`
    )
    .get(member.id);

  let caseResolved = false;
  if (openCase) {
    db.prepare(`UPDATE NoShowCases SET status = 'Returned', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(
      openCase.id
    );
    db.prepare(
      `INSERT INTO FollowUps (case_id, channel, outcome, notes, staff_id, timestamp)
       VALUES (?, 'Call', 'Will return', 'Member returned and checked in successfully at gym gate!', ?, datetime('now', 'localtime'))`
    ).run(openCase.id, actorId ?? null);
    caseResolved = true;
  }

  // Reset member risk_state to Normal
  db.prepare(`UPDATE Members SET risk_state = 'Normal', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(
    member.id
  );

  logAudit(actorId ?? null, actorType || 'System', 'Gym Check-in', 'Attendance', attRes.lastInsertRowid, null, {
    memberName: member.name,
    source,
    memberOriginated: actorType === 'Member',
    streak: streak.current_value,
    noShowCaseResolved: caseResolved
  });

  const checkInTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return {
    attendanceId: attRes.lastInsertRowid,
    checkInTime,
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      status: member.status
    },
    streak: {
      current: streak.current_value,
      best: streak.best_value,
      target: streak.target
    },
    noShowCaseResolved: caseResolved
  };
}

module.exports = { recordAttendance, settings };
