const { db, logAudit } = require('../config/database');

class AutomationService {
  /**
   * 1. Daily No-Show Detection Engine
   * Finds members who have been absent for >= no_show_threshold days (default: 10 days)
   */
  static runDailyNoShowScan() {
    const settings = db.prepare('SELECT * FROM Settings ORDER BY id DESC LIMIT 1').get() || { no_show_threshold: 10 };
    const thresholdDays = settings.no_show_threshold || 10;
    const now = new Date();

    // Fetch all active members
    const activeMembers = db.prepare(`
      SELECT m.id, m.name, m.phone, m.email, m.risk_state, ms.expiry_date, ms.status as membership_status
      FROM Members m
      JOIN Memberships ms ON m.id = ms.member_id
      WHERE m.status = 'Active' AND ms.status = 'Active'
    `).all();

    let newCasesCount = 0;
    const detectedCases = [];

    const getLatestAttendance = db.prepare(`
      SELECT check_in_time FROM Attendance 
      WHERE member_id = ? 
      ORDER BY check_in_time DESC 
      LIMIT 1
    `);

    const checkExistingCase = db.prepare(`
      SELECT id, status FROM NoShowCases 
      WHERE member_id = ? AND status IN ('Open', 'Contacted', 'Follow-up due')
      ORDER BY id DESC LIMIT 1
    `);

    const createCase = db.prepare(`
      INSERT INTO NoShowCases (member_id, threshold_date, risk_days, owner_id, status, next_action_date)
      VALUES (?, date('now', 'localtime'), ?, 1, 'Open', date('now', '+1 day', 'localtime'))
    `);

    const updateMemberRisk = db.prepare(`
      UPDATE Members 
      SET risk_state = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `);

    const createNotification = db.prepare(`
      INSERT INTO Notifications (member_id, template, channel, message_content, scheduled_time, delivery_status)
      VALUES (?, 'No-show Care Message', 'WhatsApp', ?, datetime('now', 'localtime'), 'Scheduled')
    `);

    for (const member of activeMembers) {
      const lastAtt = getLatestAttendance.get(member.id);
      let daysAbsent = 0;

      if (lastAtt && lastAtt.check_in_time) {
        const lastDate = new Date(lastAtt.check_in_time);
        daysAbsent = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // If no check-in recorded yet, calculate from join_date
        const joinMember = db.prepare('SELECT join_date FROM Members WHERE id = ?').get(member.id);
        const joinDate = new Date(joinMember.join_date);
        daysAbsent = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (daysAbsent >= thresholdDays) {
        const existingCase = checkExistingCase.get(member.id);
        const riskLabel = `Risk-${daysAbsent}`;

        if (!existingCase) {
          const res = createCase.run(member.id, daysAbsent);
          updateMemberRisk.run(riskLabel, member.id);

          // Queue No-Show Care notification
          const msg = `Hi ${member.name}, your last gym check-in was ${daysAbsent} days ago. Everything okay? If you need help with timing, pause, or trainer support, reply here to connect with Samrat Fitness.`;
          createNotification.run(member.id, msg);

          logAudit(1, 'System', 'Open No-Show Case', 'NoShowCases', res.lastInsertRowid, null, {
            memberId: member.id,
            memberName: member.name,
            daysAbsent
          });

          newCasesCount++;
          detectedCases.push({
            caseId: res.lastInsertRowid,
            memberId: member.id,
            name: member.name,
            daysAbsent,
            status: 'Open'
          });
        } else {
          // Update risk days and state
          db.prepare(`UPDATE NoShowCases SET risk_days = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(daysAbsent, existingCase.id);
          updateMemberRisk.run(riskLabel, member.id);
        }
      }
    }

    return {
      success: true,
      scannedMembers: activeMembers.length,
      thresholdDays,
      newCasesCount,
      detectedCases
    };
  }

  /**
   * 2. Renewal Scan Engine
   * Detects memberships expiring within configured reminder windows (14d, 7d, 3d, 0d)
   */
  static runRenewalScan() {
    const settings = db.prepare('SELECT * FROM Settings ORDER BY id DESC LIMIT 1').get() || { renewal_reminder_days: '[14, 7, 3, 0]' };
    let reminderDays = [14, 7, 3, 0];
    try {
      reminderDays = JSON.parse(settings.renewal_reminder_days);
    } catch (e) {}

    const upcomingMemberships = db.prepare(`
      SELECT ms.id as membership_id, ms.member_id, ms.expiry_date, ms.status,
             m.name, m.phone, m.email,
             p.id as plan_id, p.name as plan_name, p.base_price, p.discount
      FROM Memberships ms
      JOIN Members m ON ms.member_id = m.id
      JOIN Plans p ON ms.plan_id = p.id
      WHERE ms.status = 'Active' AND m.status = 'Active'
    `).all();

    const now = new Date();
    const remindersSent = [];

    const insertNotification = db.prepare(`
      INSERT INTO Notifications (member_id, template, channel, message_content, scheduled_time, delivery_status)
      VALUES (?, 'Renewal Reminder', 'WhatsApp', ?, datetime('now', 'localtime'), 'Sent')
    `);

    for (const item of upcomingMemberships) {
      const expDate = new Date(item.expiry_date);
      const daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (reminderDays.includes(daysUntilExpiry) || (daysUntilExpiry <= 7 && daysUntilExpiry >= 0)) {
        // Check if reminder was already sent today
        const existingToday = db.prepare(`
          SELECT id FROM Notifications
          WHERE member_id = ? AND template = 'Renewal Reminder' AND date(created_at) = date('now', 'localtime')
        `).get(item.member_id);

        if (!existingToday) {
          const finalAmount = Math.max(0, item.base_price - item.discount);
          const msg = `Hi ${item.name}, your ${item.plan_name} membership expires in ${daysUntilExpiry} days (${item.expiry_date}). Renew today for ₹${finalAmount} with your loyalty discount!`;
          insertNotification.run(item.member_id, msg);

          remindersSent.push({
            memberId: item.member_id,
            name: item.name,
            plan: item.plan_name,
            expiryDate: item.expiry_date,
            daysUntilExpiry
          });

          logAudit(1, 'System', 'Send Renewal Reminder', 'Memberships', item.membership_id, null, {
            memberId: item.member_id,
            daysUntilExpiry,
            amount: finalAmount
          });
        }
      }
    }

    return {
      success: true,
      scannedCount: upcomingMemberships.length,
      remindersSentCount: remindersSent.length,
      remindersSent
    };
  }

  /**
   * 3. Idempotent Payment Processor & Automatic Fulfillment
   */
  static processPaymentVerification({ memberId, orderType, orderId, planId, addonId, amount, providerReference, staffId }) {
    // Check if providerReference already processed (Idempotency check)
    const existingPayment = db.prepare('SELECT * FROM Payments WHERE provider_reference = ?').get(providerReference);
    if (existingPayment && existingPayment.status === 'Paid') {
      return {
        alreadyProcessed: true,
        payment: existingPayment,
        message: 'Payment already processed with this reference.'
      };
    }

    const dbTx = db.transaction(() => {
      // 1. Record or update Payment
      const paymentRes = db.prepare(`
        INSERT INTO Payments (member_id, order_id, provider_reference, amount, status, verified_time)
        VALUES (?, ?, ?, ?, 'Paid', datetime('now', 'localtime'))
      `).run(memberId, orderId || null, providerReference, amount);
      const paymentId = paymentRes.lastInsertRowid;

      let fulfillmentDetails = {};

      if (orderType === 'RENEWAL' || planId) {
        // Find Plan
        const plan = db.prepare('SELECT * FROM Plans WHERE id = ?').get(planId);
        if (!plan) throw new Error('Selected plan not found.');

        // Find active or latest membership
        let currentMembership = db.prepare('SELECT * FROM Memberships WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);

        let newStartDate;
        let baseDate;

        if (currentMembership && currentMembership.status === 'Active' && new Date(currentMembership.expiry_date) > new Date()) {
          // If current membership is still active, extend from existing expiry date
          baseDate = new Date(currentMembership.expiry_date);
          newStartDate = currentMembership.expiry_date;
        } else {
          // If expired or new, start from today
          baseDate = new Date();
          newStartDate = new Date().toISOString().split('T')[0];
        }

        const newExpiryDateObj = new Date(baseDate);
        newExpiryDateObj.setMonth(newExpiryDateObj.getMonth() + plan.duration_months);
        const newExpiryDate = newExpiryDateObj.toISOString().split('T')[0];

        // Create or update Membership
        const newMembershipRes = db.prepare(`
          INSERT INTO Memberships (member_id, plan_id, start_date, expiry_date, status, renewal_source)
          VALUES (?, ?, ?, ?, 'Active', 'Online_Renewal')
        `).run(memberId, plan.id, newStartDate, newExpiryDate);

        // Record Renewal Order
        db.prepare(`
          INSERT INTO RenewalOrders (membership_id, selected_plan_id, amount, discount, payment_id, status)
          VALUES (?, ?, ?, ?, ?, 'Paid')
        `).run(newMembershipRes.lastInsertRowid, plan.id, amount, plan.discount || 0, paymentId);

        // Update Member status to Active
        db.prepare(`
          UPDATE Members SET status = 'Active', risk_state = 'Normal', updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(memberId);

        // Send payment confirmation notification
        const receiptLink = `/api/receipts/renewal/${paymentId}`;
        const msg = `✅ ₹${amount} payment received for ${plan.name}. Your membership is now active until ${newExpiryDate}. Receipt: ${receiptLink}`;
        db.prepare(`
          INSERT INTO Notifications (member_id, template, channel, message_content, scheduled_time, delivery_status)
          VALUES (?, 'Payment Success', 'WhatsApp', ?, datetime('now', 'localtime'), 'Delivered')
        `).run(memberId, msg);

        logAudit(staffId || 1, staffId ? 'Staff' : 'System', 'Membership Renewal Payment', 'Memberships', newMembershipRes.lastInsertRowid, null, {
          memberId,
          planName: plan.name,
          amount,
          newExpiryDate,
          paymentRef: providerReference
        });

        fulfillmentDetails = {
          type: 'RENEWAL',
          planName: plan.name,
          startDate: newStartDate,
          newExpiryDate,
          receiptNumber: `REC-REN-${paymentId}-${Date.now().toString().slice(-4)}`
        };
      } else if (orderType === 'ADDON' || addonId) {
        const addon = db.prepare('SELECT * FROM AddOns WHERE id = ?').get(addonId);
        if (!addon) throw new Error('Add-on item not found.');

        // Stock deduction for products
        if (addon.type === 'Product' && addon.stock > 0) {
          db.prepare('UPDATE AddOns SET stock = stock - 1 WHERE id = ?').run(addon.id);
        }

        const maxUsage = addon.capacity || 1;
        const addonOrderRes = db.prepare(`
          INSERT INTO AddOnOrders (member_id, addon_id, trainer_product_id, quantity, amount, usage, max_usage, status)
          VALUES (?, ?, ?, 1, ?, 0, ?, 'Active')
        `).run(memberId, addon.id, addon.trainer_id, amount, maxUsage);

        const msg = `✅ ₹${amount} payment received for ${addon.title}. You have access to ${maxUsage > 1 ? maxUsage + ' sessions' : 'your add-on package'}.`;
        db.prepare(`
          INSERT INTO Notifications (member_id, template, channel, message_content, scheduled_time, delivery_status)
          VALUES (?, 'Add-on Purchase Success', 'WhatsApp', ?, datetime('now', 'localtime'), 'Delivered')
        `).run(memberId, msg);

        logAudit(staffId || 1, staffId ? 'Staff' : 'System', 'Add-on Purchase Payment', 'AddOnOrders', addonOrderRes.lastInsertRowid, null, {
          memberId,
          addonTitle: addon.title,
          amount,
          paymentRef: providerReference
        });

        fulfillmentDetails = {
          type: 'ADDON',
          addonTitle: addon.title,
          addonType: addon.type,
          capacity: maxUsage,
          receiptNumber: `REC-ADD-${paymentId}-${Date.now().toString().slice(-4)}`
        };
      }

      return {
        paymentId,
        memberId,
        amount,
        providerReference,
        status: 'Paid',
        fulfillment: fulfillmentDetails
      };
    });

    return dbTx();
  }
}

module.exports = AutomationService;
