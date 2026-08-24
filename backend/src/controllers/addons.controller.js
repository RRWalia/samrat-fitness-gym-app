const { db, logAudit } = require('../config/database');
const { ROLES, actorTypeForRole } = require('../auth/roles');
const AutomationService = require('../services/automation.service');

class AddOnsController {
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
      console.error('Add-on list error:', err);
      return res.status(500).json({ success: false, error: 'Unable to load add-ons.' });
    }
  }

  static purchaseAddOn(req, res) {
    try {
      const { member_id, addon_id } = req.body;
      if (!member_id || !addon_id) {
        return res.status(400).json({ success: false, error: 'member_id and addon_id are required.' });
      }

      const member = db.prepare('SELECT id FROM Members WHERE id = ?').get(member_id);
      const addon = db.prepare('SELECT * FROM AddOns WHERE id = ? AND active = 1').get(addon_id);
      if (!member || !addon) return res.status(404).json({ success: false, error: 'Member or add-on not found.' });
      if (addon.type === 'Product' && addon.stock <= 0) {
        return res.status(400).json({ success: false, error: 'This item is currently out of stock.' });
      }

      const providerRef = `RZP_ADD_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const result = AutomationService.processPaymentVerification({
        memberId: member_id,
        orderType: 'ADDON',
        addonId: addon_id,
        amount: addon.price,
        providerReference: providerRef,
        staffId: req.user.id,
        staffRole: req.user.role
      });

      return res.json({ success: true, message: `Successfully purchased ${addon.title}!`, data: result });
    } catch (err) {
      console.error('Add-on purchase error:', err);
      return res.status(500).json({ success: false, error: 'Unable to process the add-on purchase.' });
    }
  }

  static logUsage(req, res) {
    try {
      const { order_id, notes } = req.body;
      if (!order_id) return res.status(400).json({ success: false, error: 'order_id is required.' });

      const order = db.prepare(`
        SELECT ao.*, a.title AS addon_title, a.type AS addon_type, a.trainer_id AS addon_trainer_id,
               m.name AS member_name, m.assigned_trainer_id
        FROM AddOnOrders ao
        JOIN AddOns a ON ao.addon_id = a.id
        JOIN Members m ON ao.member_id = m.id
        WHERE ao.id = ?
      `).get(order_id);
      if (!order) return res.status(404).json({ success: false, error: 'PT package order not found.' });

      if (req.user.role === ROLES.TRAINER) {
        const assignedTrainerId = order.trainer_product_id || order.addon_trainer_id || order.assigned_trainer_id;
        if (order.addon_type !== 'PT' || !req.user.trainerId || Number(assignedTrainerId) !== Number(req.user.trainerId)) {
          return res.status(403).json({ success: false, error: 'This PT client is not assigned to your trainer account.', code: 'FORBIDDEN' });
        }
      }
      if (order.addon_type !== 'PT') {
        return res.status(400).json({ success: false, error: 'Session usage can only be logged for PT packages.' });
      }
      if (order.usage >= order.max_usage) {
        return res.status(400).json({ success: false, error: 'All sessions in this package have already been used.' });
      }

      const newUsage = order.usage + 1;
      const isCompleted = newUsage >= order.max_usage;
      const newStatus = isCompleted ? 'Completed' : 'Active';
      db.prepare('UPDATE AddOnOrders SET usage = ?, status = ? WHERE id = ?')
        .run(newUsage, newStatus, order_id);

      logAudit(req.user.id, actorTypeForRole(req.user.role), 'Log PT Session Usage', 'AddOnOrders', order_id,
        { previousUsage: order.usage }, {
          newUsage,
          total: order.max_usage,
          member: order.member_name,
          notes: String(notes || 'PT workout completed').slice(0, 1000)
        });

      return res.json({
        success: true,
        message: `Session logged (${newUsage}/${order.max_usage}).${isCompleted ? ' Package completed!' : ''}`,
        usage: newUsage,
        maxUsage: order.max_usage,
        status: newStatus
      });
    } catch (err) {
      console.error('PT usage error:', err);
      return res.status(500).json({ success: false, error: 'Unable to log this PT session.' });
    }
  }

  static getActiveOrders(req, res) {
    try {
      const trainerOnly = req.user.role === ROLES.TRAINER;
      let query;
      let params = [];

      if (trainerOnly) {
        query = `
          SELECT ao.id, ao.member_id, ao.addon_id, ao.usage, ao.max_usage, ao.status, ao.created_at,
                 a.title, a.type, a.qualifications,
                 m.name AS member_name, m.phone AS member_phone
          FROM AddOnOrders ao
          JOIN AddOns a ON ao.addon_id = a.id
          JOIN Members m ON ao.member_id = m.id
          WHERE a.type = 'PT'
            AND COALESCE(ao.trainer_product_id, a.trainer_id, m.assigned_trainer_id) = ?
          ORDER BY ao.created_at DESC
        `;
        params = [req.user.trainerId];
      } else {
        query = `
          SELECT ao.*, a.title, a.type, a.qualifications,
                 m.name AS member_name, m.phone AS member_phone
          FROM AddOnOrders ao
          JOIN AddOns a ON ao.addon_id = a.id
          JOIN Members m ON ao.member_id = m.id
          ORDER BY ao.created_at DESC
        `;
      }

      const orders = db.prepare(query).all(...params);
      return res.json({
        success: true,
        count: orders.length,
        accessScope: trainerOnly ? 'assigned_pt_clients' : 'full',
        data: orders
      });
    } catch (err) {
      console.error('Active add-on order error:', err);
      return res.status(500).json({ success: false, error: 'Unable to load PT clients.' });
    }
  }
}

module.exports = AddOnsController;
