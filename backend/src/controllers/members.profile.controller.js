const { db } = require('../config/database');
const { ROLES, isFullAccessRole } = require('../auth/roles');

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

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  const diff = Math.floor((a - b) / (1000 * 60 * 60 * 24));
  return diff;
}

function parseLocalDate(dateStr) {
  // dateStr like YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d;
}

class MembersProfileController {
  static getMemberProfile(req, res) {
    try {
      const memberId = Number(req.params.id);
      if (!memberId || Number.isNaN(memberId)) {
        return res.status(400).json({ success: false, error: 'Invalid member id.' });
      }

      const fullAccess = isFullAccessRole(req.user.role);
      const trainerAccess = req.user.role === ROLES.TRAINER;
      const frontDeskAccess = req.user.role === ROLES.FRONT_DESK;

      if (trainerAccess && !trainerCanAccessMember(req.user.trainerId, memberId)) {
        return res.status(403).json({ success: false, error: 'This member is not assigned to your trainer account.', code: 'FORBIDDEN' });
      }

      // Member + streak + trainer resolution
      const memberFields = fullAccess
        ? 'm.*'
        : 'm.id, m.name, m.phone, m.status, m.risk_state, m.join_date, m.assigned_trainer_id';

      const memberRow = db.prepare(`
        SELECT ${memberFields},
               s.current_value AS current_streak, s.best_value AS best_streak,
               s.target AS streak_target, s.rule_type AS streak_rule, s.last_update AS streak_last_update
        FROM Members m
        LEFT JOIN Streaks s ON m.id = s.member_id
        WHERE m.id = ?
      `).get(memberId);

      if (!memberRow) {
        return res.status(404).json({ success: false, error: 'Member not found.' });
      }

      // Resolve trainer name: Users.trainer_id = assigned_trainer_id OR Users.id = assigned_trainer_id
      let trainer = null;
      if (memberRow.assigned_trainer_id) {
        trainer = db.prepare(`
          SELECT id, full_name, email, role, trainer_id, phone
          FROM Users
          WHERE trainer_id = ? OR id = ?
          LIMIT 1
        `).get(memberRow.assigned_trainer_id, memberRow.assigned_trainer_id) || null;
        if (trainer && !fullAccess) {
          // Front desk and trainer should not see trainer email
          trainer = { id: trainer.id, full_name: trainer.full_name, trainer_id: trainer.trainer_id };
        }
      }

      // Memberships
      const allMemberships = db.prepare(`
        SELECT ms.*, p.name AS plan_name, p.duration_months, p.base_price, p.discount, p.benefits
        FROM Memberships ms
        JOIN Plans p ON ms.plan_id = p.id
        WHERE ms.member_id = ?
        ORDER BY (ms.status = 'Active') DESC, ms.expiry_date DESC, ms.id DESC
      `).all(memberId);

      const activeMembership = allMemberships.length ? allMemberships[0] : null;
      let daysLeft = null;
      let daysToExpiryLabel = null;
      if (activeMembership) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = parseLocalDate(activeMembership.expiry_date);
        if (expiry) {
          expiry.setHours(0, 0, 0, 0);
          daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          if (daysLeft < 0) daysToExpiryLabel = `Expired ${Math.abs(daysLeft)}d ago`;
          else if (daysLeft === 0) daysToExpiryLabel = 'Expires today';
          else daysToExpiryLabel = `${daysLeft} days left`;
        }
      }

      // Attendance - recent 15, total counts, 30d, heatmap 16 weeks (112 days)
      const recentAttendance = db.prepare(`
        SELECT id, check_in_time, source, correction_reason
        FROM Attendance WHERE member_id = ?
        ORDER BY check_in_time DESC LIMIT 20
      `).all(memberId);

      const totalAttendance = db.prepare(`
        SELECT COUNT(*) AS count FROM Attendance WHERE member_id = ?
      `).get(memberId).count;

      const lastAttendanceRow = db.prepare(`
        SELECT MAX(check_in_time) AS last_time FROM Attendance WHERE member_id = ?
      `).get(memberId);
      const lastAttendanceTime = lastAttendanceRow?.last_time || null;

      const last30Count = db.prepare(`
        SELECT COUNT(*) AS count FROM Attendance
        WHERE member_id = ? AND check_in_time >= datetime('now', '-30 days', 'localtime')
      `).get(memberId).count;

      const last7Count = db.prepare(`
        SELECT COUNT(*) AS count FROM Attendance
        WHERE member_id = ? AND check_in_time >= datetime('now', '-7 days', 'localtime')
      `).get(memberId).count;

      // Days since last attendance
      let daysSinceLast = null;
      if (lastAttendanceTime) {
        const lastDate = parseLocalDate(lastAttendanceTime);
        if (lastDate) {
          const now = new Date();
          daysSinceLast = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        }
      } else {
        // No attendance yet, use join_date
        const joinDate = parseLocalDate(memberRow.join_date);
        if (joinDate) {
          const now = new Date();
          daysSinceLast = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));
        }
      }

      const avgPerWeek = last30Count ? Number((last30Count / (30 / 7)).toFixed(1)) : 0;

      // Heatmap: last 112 days daily counts
      const heatmapRows = db.prepare(`
        SELECT date(check_in_time) AS day, COUNT(*) AS count
        FROM Attendance
        WHERE member_id = ? AND check_in_time >= date('now', '-112 days', 'localtime')
        GROUP BY date(check_in_time)
      `).all(memberId);
      const heatmapMap = new Map(heatmapRows.map(r => [r.day, r.count]));

      // Build 112 days array from today backwards
      const heatmap = [];
      const today = new Date();
      for (let i = 111; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        heatmap.push({
          date: iso,
          count: heatmapMap.get(iso) || 0,
          dayOfWeek: d.getDay()
        });
      }

      // Payment history - fullAccess only
      let payments = [];
      let renewalOrders = [];
      let addOnOrders = [];
      let timeline = [];

      if (fullAccess) {
        payments = db.prepare(`
          SELECT id, member_id, order_id, provider_reference, amount, status, verified_time, created_at
          FROM Payments WHERE member_id = ?
          ORDER BY created_at DESC, id DESC
        `).all(memberId);

        renewalOrders = db.prepare(`
          SELECT ro.*, p.name AS plan_name, p.duration_months, p.base_price,
                 pay.provider_reference, pay.amount AS pay_amount, pay.verified_time, pay.status AS pay_status, pay.created_at AS pay_created_at,
                 ms.start_date, ms.expiry_date
          FROM RenewalOrders ro
          JOIN Plans p ON ro.selected_plan_id = p.id
          LEFT JOIN Payments pay ON pay.id = ro.payment_id
          LEFT JOIN Memberships ms ON ms.id = ro.membership_id
          WHERE ms.member_id = ? OR ro.id IN (SELECT order_id FROM Payments WHERE member_id = ?)
          ORDER BY ro.created_at DESC
        `).all(memberId, memberId);

        addOnOrders = db.prepare(`
          SELECT ao.*, a.title, a.type, a.description, a.price AS addon_price
          FROM AddOnOrders ao
          JOIN AddOns a ON ao.addon_id = a.id
          WHERE ao.member_id = ?
          ORDER BY ao.created_at DESC, ao.id DESC
        `).all(memberId);

        // Build merged timeline
        const renewalTimeline = renewalOrders.map(ro => ({
          id: `renewal-${ro.id}`,
          kind: 'renewal',
          title: `Renewal: ${ro.plan_name}`,
          amount: ro.amount,
          status: ro.status,
          date: ro.created_at,
          verified_time: ro.verified_time || ro.pay_created_at,
          provider_reference: ro.provider_reference,
          payment_id: ro.payment_id,
          meta: {
            duration_months: ro.duration_months,
            start_date: ro.start_date,
            expiry_date: ro.expiry_date
          }
        }));

        const addonTimeline = addOnOrders.map(ao => ({
          id: `addon-${ao.id}`,
          kind: 'addon',
          title: ao.title,
          amount: ao.amount,
          status: ao.status,
          date: ao.created_at,
          verified_time: null,
          provider_reference: null,
          payment_id: null,
          meta: {
            type: ao.type,
            usage: ao.usage,
            max_usage: ao.max_usage
          }
        }));

        const paymentTimeline = payments.map(p => ({
          id: `payment-${p.id}`,
          kind: 'payment',
          title: p.order_id ? `Payment #${p.id}` : `Payment #${p.id}`,
          amount: p.amount,
          status: p.status,
          date: p.created_at,
          verified_time: p.verified_time,
          provider_reference: p.provider_reference,
          payment_id: p.id,
          meta: {}
        }));

        timeline = [...renewalTimeline, ...addonTimeline, ...paymentTimeline]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 50);
      } else if (trainerAccess) {
        // Trainers see only PT orders assigned to them
        addOnOrders = db.prepare(`
          SELECT ao.*, a.title, a.type, a.description, a.price AS addon_price
          FROM AddOnOrders ao
          JOIN AddOns a ON ao.addon_id = a.id
          WHERE ao.member_id = ? AND a.type = 'PT'
            AND COALESCE(ao.trainer_product_id, a.trainer_id) = ?
          ORDER BY ao.created_at DESC
        `).all(memberId, req.user.trainerId);

        timeline = addOnOrders.map(ao => ({
          id: `addon-${ao.id}`,
          kind: 'addon',
          title: ao.title,
          amount: ao.amount,
          status: ao.status,
          date: ao.created_at,
          meta: { type: ao.type, usage: ao.usage, max_usage: ao.max_usage }
        }));
      }

      // No-show cases
      const allNoShowCases = db.prepare(`
        SELECT * FROM NoShowCases WHERE member_id = ? ORDER BY created_at DESC, id DESC
      `).all(memberId);

      const openCase = allNoShowCases.find(c => ['Open', 'Contacted', 'Follow-up due'].includes(c.status)) || null;

      let followUps = [];
      if (openCase) {
        followUps = db.prepare(`
          SELECT f.*, u.full_name AS staff_name
          FROM FollowUps f
          LEFT JOIN Users u ON u.id = f.staff_id
          WHERE f.case_id = ?
          ORDER BY f.timestamp DESC
        `).all(openCase.id);
      }

      // Churn risk scoring
      const factors = [];
      let score = 0;

      // Factor: days since last attendance
      if (daysSinceLast !== null) {
        if (daysSinceLast >= 22) {
          const pts = Math.min(40, 20 + Math.floor((daysSinceLast - 10) * 1.5));
          score += pts;
          factors.push({ points: pts, label: `Absent ${daysSinceLast} days`, severity: 'critical' });
        } else if (daysSinceLast >= 15) {
          const pts = 30;
          score += pts;
          factors.push({ points: pts, label: `Absent ${daysSinceLast} days`, severity: 'high' });
        } else if (daysSinceLast >= 10) {
          const pts = 20;
          score += pts;
          factors.push({ points: pts, label: `Absent ${daysSinceLast} days`, severity: 'medium' });
        } else if (daysSinceLast >= 7) {
          const pts = 10;
          score += pts;
          factors.push({ points: pts, label: `Absent ${daysSinceLast} days - early warning`, severity: 'low' });
        }
      } else {
        score += 15;
        factors.push({ points: 15, label: 'No attendance recorded yet', severity: 'medium' });
      }

      // Factor: expiry
      if (daysLeft !== null) {
        if (daysLeft < 0) {
          const pts = 25;
          score += pts;
          factors.push({ points: pts, label: `Membership expired ${Math.abs(daysLeft)} days ago`, severity: 'critical' });
        } else if (daysLeft <= 3) {
          const pts = 15;
          score += pts;
          factors.push({ points: pts, label: `Expires in ${daysLeft} days`, severity: 'high' });
        } else if (daysLeft <= 7) {
          const pts = 10;
          score += pts;
          factors.push({ points: pts, label: 'Expires within a week', severity: 'medium' });
        } else if (daysLeft <= 14) {
          const pts = 5;
          score += pts;
          factors.push({ points: pts, label: 'Expires within 2 weeks', severity: 'low' });
        }
      }

      // Factor: lost streak
      if (memberRow.current_streak === 0 && memberRow.best_streak > 0) {
        const pts = 10;
        score += pts;
        factors.push({ points: pts, label: `Lost ${memberRow.best_streak}-day streak`, severity: 'medium' });
      }

      // Factor: risk_state flagged
      if (memberRow.risk_state && String(memberRow.risk_state).startsWith('Risk-')) {
        const pts = 10;
        score += pts;
        factors.push({ points: pts, label: `Flagged in no-show red list (${memberRow.risk_state})`, severity: 'high' });
      }

      // Factor: open no-show case
      if (openCase) {
        const pts = openCase.risk_days >= 20 ? 15 : 10;
        score += pts;
        factors.push({ points: pts, label: `Open no-show case: ${openCase.status} (${openCase.risk_days}d)`, severity: openCase.risk_days >= 20 ? 'critical' : 'high' });
      }

      // Factor: low activity last 30 days
      if (last30Count < 2) {
        const pts = last30Count === 0 ? 15 : 10;
        if (daysSinceLast === null || daysSinceLast >= 7) {
          // Avoid double counting if already absent factor, but still add for 0 visits
          if (last30Count === 0 && (daysSinceLast === null || daysSinceLast < 10)) {
            score += pts;
            factors.push({ points: pts, label: `No visits in last 30 days`, severity: 'high' });
          } else if (last30Count === 1) {
            score += pts;
            factors.push({ points: pts, label: `Only 1 visit in last 30 days`, severity: 'medium' });
          }
        }
      } else if (last30Count < 4) {
        const pts = 5;
        score += pts;
        factors.push({ points: pts, label: `Low activity: ${last30Count} visits in 30 days`, severity: 'low' });
      }

      // Factor: low lifetime engagement
      if (totalAttendance < 5) {
        const joinDate = parseLocalDate(memberRow.join_date);
        if (joinDate) {
          const daysAsMember = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24));
          if (daysAsMember > 30) {
            const pts = 10;
            score += pts;
            factors.push({ points: pts, label: `Low lifetime engagement: ${totalAttendance} total visits`, severity: 'medium' });
          }
        }
      }

      // Cap at 100
      score = Math.min(100, score);
      const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

      const churnRisk = {
        score,
        level,
        factors: factors.sort((a, b) => b.points - a.points),
        daysSinceLast,
        daysLeft,
        lastAttendanceTime,
        last30Count,
        totalAttendance
      };

      // Build response based on role
      if (fullAccess) {
        return res.json({
          success: true,
          accessScope: 'full',
          data: {
            member: memberRow,
            trainer,
            membership: activeMembership ? { ...activeMembership, daysLeft, daysToExpiryLabel } : null,
            memberships: allMemberships,
            streak: {
              current: memberRow.current_streak || 0,
              best: memberRow.best_streak || 0,
              target: memberRow.streak_target || 4,
              rule: memberRow.streak_rule || 'Weekly',
              last_update: memberRow.streak_last_update
            },
            attendance: {
              total: totalAttendance,
              last30: last30Count,
              last7: last7Count,
              avgPerWeek,
              daysSinceLast,
              lastTime: lastAttendanceTime,
              recent: recentAttendance,
              heatmap
            },
            payments: {
              all: payments,
              renewals: renewalOrders,
              addOns: addOnOrders,
              timeline
            },
            noShow: {
              openCase,
              allCases: allNoShowCases,
              followUps
            },
            churnRisk
          }
        });
      }

      if (trainerAccess) {
        return res.json({
          success: true,
          accessScope: 'assigned_pt_client',
          data: {
            member: memberRow,
            trainer,
            membership: activeMembership ? { ...activeMembership, daysLeft, daysToExpiryLabel } : null,
            streak: {
              current: memberRow.current_streak || 0,
              best: memberRow.best_streak || 0,
              target: memberRow.streak_target || 4,
              rule: memberRow.streak_rule || 'Weekly'
            },
            attendance: {
              total: totalAttendance,
              last30: last30Count,
              last7: last7Count,
              avgPerWeek,
              daysSinceLast,
              lastTime: lastAttendanceTime,
              recent: recentAttendance,
              heatmap
            },
            payments: {
              addOns: addOnOrders,
              timeline
            },
            noShow: {
              openCase,
              allCases: allNoShowCases.slice(0, 5)
            },
            churnRisk
          }
        });
      }

      // front_desk
      return res.json({
        success: true,
        accessScope: 'assisted_lookup',
        data: {
          member: memberRow,
          trainer,
          membership: activeMembership ? { ...activeMembership, daysLeft, daysToExpiryLabel } : null,
          streak: {
            current: memberRow.current_streak || 0,
            best: memberRow.best_streak || 0,
            target: memberRow.streak_target || 4
          },
          attendance: {
            total: totalAttendance,
            last30: last30Count,
            last7: last7Count,
            avgPerWeek,
            daysSinceLast,
            lastTime: lastAttendanceTime,
            recent: recentAttendance.slice(0, 10),
            heatmap
          },
          noShow: {
            openCase
          },
          churnRisk
        }
      });
    } catch (err) {
      console.error('Member profile error:', err);
      return res.status(500).json({ success: false, error: 'Unable to load member profile.' });
    }
  }
}

module.exports = MembersProfileController;
