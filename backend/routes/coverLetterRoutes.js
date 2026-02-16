const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const enforceAIUsage = require('../middleware/subscriptionMiddleware');

const {
  createCoverLetterWithAI,
} = require('../controllers/coverLetterController');

router.post(
  '/generate',
  authenticateJWT,
  enforceAIUsage('cover_letter'),
  createCoverLetterWithAI
);

module.exports = router;
