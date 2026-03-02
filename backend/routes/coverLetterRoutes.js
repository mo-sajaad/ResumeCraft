const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const enforceUsage = require('../middleware/enforceUsage');

const {
  createCoverLetterWithAI,
} = require('../controllers/coverLetterController');

router.post(
  '/generate',
  authenticateJWT,
  attachPlan,
  enforceUsage('cover_letter'),
  createCoverLetterWithAI
);

module.exports = router;