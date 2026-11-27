const express = require('express');
const authenticateJWT = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const requireFeatureFlag = require('../middleware/requireFeatureFlag');
const { isAdminUid } = require('../services/adminService');
const { createAuditLog } = require('../services/auditLogService');
const {
  getFeatureFlags,
  updateFeatureFlag,
  getAnalytics,
  getAdminAuditLogs,
} = require('../controllers/adminController');

const router = express.Router();

// Records a signed-in user that requireAdmin is about to refuse (ADMIN-007).
// Only the method is stored, not the path, which the caller chooses.
async function auditDeniedAdmin(req, _res, next) {
  if (!isAdminUid(req.user?.firebaseUid)) {
    await createAuditLog({
      actorUserId: req.user?.id,
      actorFirebaseUid: req.user?.firebaseUid,
      action: 'admin.access_denied',
      resourceType: 'admin',
      metadata: { method: req.method },
      request: req,
    });
  }
  return next();
}

router.use(authenticateJWT, auditDeniedAdmin, requireAdmin);

// Off, missing or unreadable admin_dashboard refuses the admin routes below
// (ADMIN-005). Set per route so metric labels keep the route pattern. The
// flag routes are exempt, so an admin can always turn the dashboard back on.
const adminDashboard = requireFeatureFlag('admin_dashboard');

router.get('/feature-flags', getFeatureFlags);
router.patch('/feature-flags/:key', express.json(), updateFeatureFlag);
router.get('/analytics/usage', adminDashboard, getAnalytics);
router.get('/audit-logs', adminDashboard, getAdminAuditLogs);

module.exports = router;
