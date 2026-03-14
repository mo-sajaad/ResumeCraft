const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const enforceUsage = require('../middleware/enforceUsage');
const requirePlan = require('../middleware/requirePlan');
const requireTemplateAccess = require('../middleware/requireTemplateAccess');

const {
  aiRequestRateLimiter,
  enforceResumePayloadLength,
} = require('../middleware/aiAbuseProtection');

const {
  createCoverLetterWithAI,
  getCoverLettersByUser,
  getCoverLetterById,
  updateCoverLetter,
  deleteCoverLetter,
  previewCoverLetter,
  downloadCoverLetter,
} = require('../controllers/coverLetterController');


router.post('/generate', authenticateJWT, attachPlan, enforceUsage('cover_letter'), requireTemplateAccess(), aiRequestRateLimiter, enforceResumePayloadLength, createCoverLetterWithAI);

router.get('/', authenticateJWT, getCoverLettersByUser);
router.get('/:id', authenticateJWT, getCoverLetterById);
router.put('/:id', authenticateJWT, updateCoverLetter);
router.delete('/:id', authenticateJWT, deleteCoverLetter);
router.get('/:id/preview', authenticateJWT, attachPlan, requireTemplateAccess(), previewCoverLetter);
router.get('/:id/download', authenticateJWT, attachPlan, requirePlan('premium'), requireTemplateAccess(), downloadCoverLetter);

module.exports = router;