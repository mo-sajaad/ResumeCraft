const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const requirePlan = require('../middleware/requirePlan');
const requireFeature = require('../middleware/requireFeature');
const enforceUsage = require('../middleware/enforceUsage');

const { createResumeWithAI } = require('../controllers/resumeController');

router.post(
  '/generate-resume',
  authenticateJWT,
  attachPlan,
  requirePlan("premium"),
  requireFeature("has_advanced_ai"),
  enforceUsage("resume"),
  createResumeWithAI
);

module.exports = router;