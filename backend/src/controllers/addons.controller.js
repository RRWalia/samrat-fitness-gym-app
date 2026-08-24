const { db, logAudit } = require('../config/database');
const AutomationService = require('../services/automation.service');

class AddOnsController {
  /**
   * List all available add-ons
   */
  static getAddOns(req, res) {
    try {
      const { type } = req.query;
      let query = 'SELECT * FROM AddOns WHERE active = 1';
      const params = [];
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      query += ' ORDER BY type ASC, price DESC';
      const items = db.prepare(query).all(...params);
      return res.json({ success: true, count: items.length, data: items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Purchase add-on (Opt-in only, never pre-selected)
   */
  static purchaseAddOn(req, res) {
    try {
      const { member_id, addon_id, payment_method = 'UPI / Razorpay' } = req.body;

      if (!member_id || !addon_id) {
        return res.status(400).json({ error: 'member_id and addon_id are required' });
      }

      const addon = db.prepare('SELECT * FROM AddOns WHERE id = ?').get(addon_id);
      if (!addon) return res.status(404).json({ error: 'Add-on not found' });

      if (addon.type === 'Product' && addon.stock <= 0) {
        return res.status(400).json({ error: 'This item is currently out of stock' });
      }

      const providerRef = `RZP_ADD_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const result = AutomationService.processPaymentVerification({
        memberId: member_id,
        orderType: 'ADDON',
        addonId: addon_id,
        amount: addon.price,
        providerReference: providerRef,
        staffId: 1
      });

      return res.json({
        success: true,
        message: `Successfully purchased ${addon.title}!`,
        data: result
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Log PT session usage
   */
  static logUsage(req, res) {
    try {
      const { order_id, notes, staff_id = 1 } = req.body;

      const order = db.prepare(`
        SELECT ao.*, a.title as addon_title, m.name as member_name
        FROM AddOnOrders ao
        JOIN AddOns a ON ao.addon_id = a.id
        JOIN Members m ON ao.member_id = m.id
        WHERE ao.id = ?
      `).get(order_id);

      if (!order) return res.status(404).json({ error: 'Add-on package order not found' });

      if (order.usage >= order.max_usage) {
        return res.status(400).json({ error: 'All sessions in this package have already been utilized!' });
      }

      const newUsage = order.usage + 1;
      const isCompleted = newUsage >= order.max_usage;
      const newStatus = isCompleted ? 'Completed' : 'Active';

      db.prepare(`
        UPDATE AddOnOrders 
        SET usage = ?, status = ?
        WHERE id = ?
      `).run(newUsage, newStatus, order_id);

      logAudit(staff_id, 'Trainer', 'Log PT Session Usage', 'AddOnOrders', order_id, { previousUsage: order.usage }, {
        newUsage,
        total: order.max_usage,
        member: order.member_name,
        notes: notes || 'PT workout completed'
      });

      return res.json({
        success: true,
        message: `Session logged (${newUsage}/${order.max_usage}). ${isCompleted ? 'Package completed! 🎉' : ''}`,
        usage: newUsage,
        maxUsage: order.max_usage,
        status: newStatus
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get active add-ons across the gym (e.g. for trainers)
   */
  static getActiveOrders(req, res) {
    try {
      const orders = db.prepare(`
        SELECT ao.*, a.title, a.type, a.qualifications,
               m.name as member_name, m.phone as member_phone
        FROM AddOnOrders ao
        JOIN AddOns a ON ao.addon_id = a.id
        JOIN Members m ON ao.member_id = m.id
        ORDER BY ao.created_at DESC
      `).all();

      return res.json({ success: true, count: orders.length, data: orders });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = AddOnsController;
