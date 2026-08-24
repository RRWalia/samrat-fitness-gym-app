const express = require('express');
const router = express.Router();

const AttendanceController = require('../controllers/attendance.controller');
const RedListController = require('../controllers/redlist.controller');
const RenewalsController = require('../controllers/renewals.controller');
const MembersController = require('../controllers/members.controller');
const AddOnsController = require('../controllers/addons.controller');
const DashboardController = require('../controllers/dashboard.controller');
const { db } = require('../config/database');

// --- Attendance & QR ---
router.get('/attendance/qr-session', AttendanceController.getQrSession);
router.post('/attendance/check-in', AttendanceController.checkIn);
router.get('/attendance/history', AttendanceController.getAttendanceHistory);

// --- No-Show Red List & Recovery ---
router.get('/red-list', RedListController.getRedList);
router.post('/red-list/follow-up', RedListController.recordFollowUp);
router.post('/red-list/scan', RedListController.triggerScan);

// --- Renewals & Payments ---
router.get('/renewals/expiring', RenewalsController.getExpiring);
router.get('/renewals/offers/:memberId', RenewalsController.getRenewalOffers);
router.post('/renewals/process', RenewalsController.processRenewal);
router.post('/renewals/scan', RenewalsController.triggerReminders);
router.get('/receipts/renewal/:paymentId', RenewalsController.getReceipt);

// --- Members ---
router.get('/members', MembersController.getAllMembers);
router.get('/members/:id', MembersController.getMemberById);
router.post('/members', MembersController.createMember);
router.patch('/members/:id/status', MembersController.toggleStatus);

// --- Plans ---
router.get('/plans', (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM Plans WHERE active = 1 ORDER BY duration_months ASC').all();
    return res.json({ success: true, count: plans.length, data: plans });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- Add-on Marketplace ---
router.get('/addons', AddOnsController.getAddOns);
router.post('/addons/purchase', AddOnsController.purchaseAddOn);
router.post('/addons/log-usage', AddOnsController.logUsage);
router.get('/addons/active-orders', AddOnsController.getActiveOrders);

// --- Dashboard & System Analytics ---
router.get('/dashboard/stats', DashboardController.getStats);
router.get('/dashboard/daily-summary', DashboardController.getDailySummary);
router.get('/dashboard/audit-logs', DashboardController.getAuditLogs);
router.get('/dashboard/settings', DashboardController.getSettings);
router.put('/dashboard/settings', DashboardController.updateSettings);

module.exports = router;
