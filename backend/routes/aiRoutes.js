const express = require("express");
const router = express.Router();

const authenticateJWT = require("../middleware/authMiddleware");
const attachPlan = require("../middleware/attachPlan");
const requirePlan = require("../middleware/requirePlan");
const requireFeature = require("../middleware/requireFeature");
const enforceUsage = require("../middleware/enforceUsage");
const requireTemplateAccess = require("../middleware/requireTemplateAccess");
const { aiRequestRateLimiter } = require("../middleware/aiAbuseProtection");

const { createResumeWithAI } = require("../controllers/resumeController");
const {
  createCoverLetterWithAI,
} = require("../controllers/coverLetterController");

router.post(
  "/generate-resume",
  authenticateJWT,
  attachPlan,
  requirePlan("premium"),
  requireFeature("has_advanced_ai"),
  aiRequestRateLimiter,
  enforceUsage("resume"),
  requireTemplateAccess(),
  createResumeWithAI,
);

router.post(
  "/generate-cover-letter",
  authenticateJWT,
  attachPlan,
  requirePlan("premium"),
  requireFeature("has_advanced_ai"),
  aiRequestRateLimiter,
  enforceUsage("cover_letter"),
  requireTemplateAccess(),
  createCoverLetterWithAI,
);

module.exports = router;
