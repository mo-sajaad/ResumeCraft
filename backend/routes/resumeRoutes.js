const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const enforceUsage = require('../middleware/enforceUsage');
const requirePlan = require('../middleware/requirePlan');
const requireTemplateAccess = require('../middleware/requireTemplateAccess');

const {
  createResumeWithAI,
  getResumesByUser,
  getResumeById,
  updateResume,
  deleteResume,
  previewResume,
  downloadResume
} = require('../controllers/resumeController');

/*
  AI Resume Generation
  - Must be logged in
  - Must have active subscription
  - Must respect monthly resume limit
*/
router.post(
  '/generate',
  authenticateJWT,
  attachPlan,
  enforceUsage('resume'),
  requireTemplateAccess(),
  createResumeWithAI
);

router.get('/', authenticateJWT, getResumesByUser);
router.get('/:id', authenticateJWT, getResumeById);
router.put('/:id', authenticateJWT, updateResume);
router.delete('/:id', authenticateJWT, deleteResume);

router.get("/:id/preview", authenticateJWT, attachPlan, requireTemplateAccess(), previewResume);

/*
  Download Resume
  Only premium and pro users allowed
*/
router.get(
  "/:id/download",
  authenticateJWT,
  attachPlan,
  requirePlan("premium"), // premium + pro allowed
  requireTemplateAccess(),
  downloadResume
);

module.exports = router;