const express = require('express');

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const requirePlan = require('../middleware/requirePlan');
const requireFeature = require('../middleware/requireFeature');
const {
  aiRequestRateLimiter,
  workspaceRewriteInputGuard,
  enforceMaxBulletCount,
} = require('../middleware/aiAbuseProtection');
const {
  getWorkspaceDocument,
  updateWorkspaceDocument,
  rewriteWorkspaceDocument,
} = require('../controllers/workspaceController');

const router = express.Router();

router.get('/document', authenticateJWT, getWorkspaceDocument);
router.put('/document', authenticateJWT, updateWorkspaceDocument);
router.post(
  '/ai-rewrite',
  authenticateJWT,
  attachPlan,
  requirePlan('premium'),
  requireFeature('has_advanced_ai'),
  aiRequestRateLimiter,
  workspaceRewriteInputGuard,
  enforceMaxBulletCount,
  rewriteWorkspaceDocument
);

module.exports = router;