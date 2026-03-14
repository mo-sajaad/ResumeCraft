const express = require('express');
const authenticateJWT = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getFeatureFlags,
  updateFeatureFlag,
  getAnalytics,
  getAdminAuditLogs,
} = require('../controllers/adminController');

const router = express.Router();

router.use(authenticateJWT, requireAdmin);

router.get('/feature-flags', getFeatureFlags);
router.patch('/feature-flags/:key', express.json(), updateFeatureFlag);
router.get('/analytics/usage', getAnalytics);
router.get('/audit-logs', getAdminAuditLogs);

module.exports = router;
