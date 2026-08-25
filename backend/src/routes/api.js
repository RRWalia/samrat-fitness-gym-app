const express = require('express');
const router = express.Router();

const AttendanceController = require('../controllers/attendance.controller');
const RedListController = require('../controllers/redlist.controller');
const RenewalsController = require('../controllers/renewals.controller');
const MembersController = require('../controllers/members.controller');
const MembersImportController = require('../controllers/members.import.controller');
const AddOnsController = require('../controllers/addons.controller');
const DashboardController = require('../controllers/dashboard.controller');
const UsersController = require('../controllers/users.controller');
const { db } = require('../config/database');
const { authorizeRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../auth/roles');

const fullAccess = authorizeRoles(ROLES.OWNER, ROLES.MANAGER);
const attendanceAccess = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.FRONT_DESK);
const memberLookupAccess = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.FRONT_DESK, ROLES.TRAINER);
const trainerAccess = authorizeRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.TRAINER);

// Attendance and assisted lookup are the only operational APIs exposed to front desk.
router.get('/attendance/qr-session', attendanceAccess, AttendanceController.getQrSession);
router.post('/attendance/check-in', attendanceAccess, AttendanceController.checkIn);
router.get('/attendance/history', attendanceAccess, AttendanceController.getAttendanceHistory);

// Owner/manager retention, financial, and customer-management APIs.
router.get('/red-list', fullAccess, RedListController.getRedList);
router.post('/red-list/follow-up', fullAccess, RedListController.recordFollowUp);
router.post('/red-list/scan', fullAccess, RedListController.triggerScan);

router.get('/renewals/expiring', fullAccess, RenewalsController.getExpiring);
router.get('/renewals/offers/:memberId', fullAccess, RenewalsController.getRenewalOffers);
router.post('/renewals/process', fullAccess, RenewalsController.processRenewal);
router.post('/renewals/scan', fullAccess, RenewalsController.triggerReminders);
router.get('/receipts/renewal/:paymentId', fullAccess, RenewalsController.getReceipt);

// List/detail responses are scoped and redacted by role in the controller.
router.get('/members', memberLookupAccess, MembersController.getAllMembers);
router.get('/members/:id', memberLookupAccess, MembersController.getMemberById);
router.post('/members', fullAccess, MembersController.createMember);
router.patch('/members/:id/status', fullAccess, MembersController.toggleStatus);

// CSV bulk import. Files travel as text inside a JSON body (no multipart upload
// handling needed), with a route-local limit larger than the global 100kb cap.
const importBodyParser = express.json({ limit: '2mb' });
router.get('/members/import/sample', fullAccess, MembersImportController.getSampleTemplate);
router.post('/members/import/preview', importBodyParser, fullAccess, MembersImportController.previewImport);
router.post('/members/import', importBodyParser, fullAccess, MembersImportController.importMembers);

router.get('/plans', fullAccess, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM Plans WHERE active = 1 ORDER BY duration_months ASC').all();
    return res.json({ success: true, count: plans.length, data: plans });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Unable to load plans.' });
  }
});

router.get('/addons', fullAccess, AddOnsController.getAddOns);
router.post('/addons/purchase', fullAccess, AddOnsController.purchaseAddOn);
router.post('/addons/log-usage', trainerAccess, AddOnsController.logUsage);
router.get('/addons/active-orders', trainerAccess, AddOnsController.getActiveOrders);

router.get('/dashboard/stats', fullAccess, DashboardController.getStats);
router.get('/dashboard/daily-summary', fullAccess, DashboardController.getDailySummary);
router.get('/dashboard/audit-logs', fullAccess, DashboardController.getAuditLogs);
router.get('/dashboard/settings', fullAccess, DashboardController.getSettings);
router.put('/dashboard/settings', fullAccess, DashboardController.updateSettings);

// Credential hashes are never returned by these owner/manager-only endpoints.
router.get('/users', fullAccess, UsersController.list);
router.post('/users', fullAccess, UsersController.create);
router.patch('/users/:id', fullAccess, UsersController.update);
router.put('/users/:id/password', fullAccess, UsersController.resetPassword);

module.exports = router;
