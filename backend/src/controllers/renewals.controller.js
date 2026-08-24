const { db, logAudit } = require('../config/database');
const AutomationService = require('../services/automation.service');

class RenewalsController {
  /**
   * Get expiring or expired memberships
   */
  static getExpiring(req, res) {
    try {
      const { timeframe = 'all' } = req.query; // '7days', '14days', '30days', 'expired', 'all'

      let query = `
        SELECT ms.id as membership_id, ms.member_id, ms.start_date, ms.expiry_date, ms.status as membership_status,
               m.name as member_name, m.phone as member_phone, m.email as member_email, m.risk_state,
               p.id as plan_id, p.name as plan_name, p.duration_months, p.base_price, p.discount,
               CAST((julianday(ms.expiry_date) - julianday(date('now', 'localtime'))) AS INTEGER) as days_to_expiry,
               (SELECT MAX(check_in_time) FROM Attendance WHERE member_id = m.id) as last_check_in
        FROM Memberships ms
        JOIN Members m ON ms.member_id = m.id
        JOIN Plans p ON ms.plan_id = p.id
        WHERE m.status IN ('Active', 'Expired')
      `;

      if (timeframe === '7days') {
        query += ` AND ms.expiry_date >= date('now', 'localtime') AND ms.expiry_date <= date('now', '+7 days', 'localtime') `;
      } else if (timeframe === '14days') {
        query += ` AND ms.expiry_date >= date('now', 'localtime') AND ms.expiry_date <= date('now', '+14 days', 'localtime') `;
      } else if (timeframe === '30days') {
        query += ` AND ms.expiry_date >= date('now', 'localtime') AND ms.expiry_date <= date('now', '+30 days', 'localtime') `;
      } else if (timeframe === 'expired') {
        query += ` AND ms.expiry_date < date('now', 'localtime') `;
      }

      query += ` ORDER BY ms.expiry_date ASC `;

      const rows = db.prepare(query).all();

      return res.json({
        success: true,
        count: rows.length,
        data: rows
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get renewal offers for a member
   */
  static getRenewalOffers(req, res) {
    try {
      const { memberId } = req.params;
      const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(memberId);
      if (!member) return res.status(404).json({ error: 'Member not found' });

      const plans = db.prepare('SELECT * FROM Plans WHERE active = 1 ORDER BY duration_months ASC').all();

      // Check current membership
      const current = db.prepare(`
        SELECT ms.*, p.name as plan_name
        FROM Memberships ms
        JOIN Plans p ON ms.plan_id = p.id
        WHERE ms.member_id = ?
        ORDER BY ms.expiry_date DESC LIMIT 1
      `).get(memberId);

      const offers = plans.map(p => {
        // Loyalty discount: ₹200 extra discount for renewing members
        const loyaltyBonus = 200;
        const totalDiscount = (p.discount || 0) + loyaltyBonus;
        const finalPayable = Math.max(0, p.base_price - totalDiscount);
        return {
          planId: p.id,
          name: p.name,
          durationMonths: p.duration_months,
          basePrice: p.base_price,
          standardDiscount: p.discount,
          loyaltyBonus,
          finalPayable,
          benefits: p.benefits
        };
      });

      return res.json({
        success: true,
        member: { id: member.id, name: member.name, phone: member.phone },
        currentMembership: current,
        offers
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Process renewal payment and extend membership
   */
  static processRenewal(req, res) {
    try {
      const { member_id, plan_id } = req.body;

      if (!member_id || !plan_id) {
        return res.status(400).json({ success: false, error: 'member_id and plan_id are required.' });
      }
      const member = db.prepare('SELECT id FROM Members WHERE id = ?').get(member_id);
      const plan = db.prepare('SELECT * FROM Plans WHERE id = ? AND active = 1').get(plan_id);
      if (!member || !plan) {
        return res.status(404).json({ success: false, error: 'Member or active plan not found.' });
      }

      // Never trust a browser-supplied payable amount.
      const amount = Math.max(0, plan.base_price - (plan.discount || 0) - 200);
      const providerReference = `RZP_REN_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const result = AutomationService.processPaymentVerification({
        memberId: member_id,
        orderType: 'RENEWAL',
        planId: plan_id,
        amount,
        providerReference,
        staffId: req.user.id,
        staffRole: req.user.role
      });

      return res.json({
        success: true,
        message: 'Renewal processed successfully!',
        data: result
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Trigger renewal reminders scan
   */
  static triggerReminders(req, res) {
    try {
      const result = AutomationService.runRenewalScan();
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get receipt details
   */
  static getReceipt(req, res) {
    try {
      const { paymentId } = req.params;

      const payment = db.prepare(`
        SELECT p.*, m.name as member_name, m.phone as member_phone, m.email as member_email
        FROM Payments p
        JOIN Members m ON p.member_id = m.id
        WHERE p.id = ?
      `).get(paymentId);

      if (!payment) return res.status(404).json({ error: 'Receipt not found' });

      // Check renewal order
      const renewal = db.prepare(`
        SELECT ro.*, pl.name as plan_name, pl.duration_months, ms.start_date, ms.expiry_date
        FROM RenewalOrders ro
        JOIN Plans pl ON ro.selected_plan_id = pl.id
        JOIN Memberships ms ON ro.membership_id = ms.id
        WHERE ro.payment_id = ?
      `).get(paymentId);

      // Check addon order
      const addon = db.prepare(`
        SELECT ao.*, ad.title as addon_title, ad.type as addon_type
        FROM AddOnOrders ao
        JOIN AddOns ad ON ao.addon_id = ad.id
        WHERE ao.id = ?
      `).get(payment.order_id);

      const settings = db.prepare('SELECT gym_name, gym_address, gym_hours FROM Settings LIMIT 1').get();

      return res.json({
        success: true,
        receipt: {
          receiptNumber: `REC-${payment.id}-${new Date(payment.created_at).getFullYear()}`,
          paymentDate: payment.verified_time || payment.created_at,
          amount: payment.amount,
          status: payment.status,
          providerReference: payment.provider_reference,
          member: {
            name: payment.member_name,
            phone: payment.member_phone,
            email: payment.member_email
          },
          gym: settings,
          itemDetails: renewal ? {
            type: 'Membership Renewal',
            name: renewal.plan_name,
            duration: `${renewal.duration_months} Months`,
            validity: `${renewal.start_date} to ${renewal.expiry_date}`
          } : (addon ? {
            type: 'Add-on Purchase',
            name: addon.addon_title,
            category: addon.addon_type,
            quantity: addon.quantity
          } : {
            type: 'Gym Service',
            name: 'Standard Fee'
          })
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RenewalsController;
