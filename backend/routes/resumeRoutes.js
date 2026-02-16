const express = require('express');
const router = express.Router();

const authenticateJWT = require('../middleware/authMiddleware');
const enforceAIUsage = require('../middleware/subscriptionMiddleware');

const {
  createResumeWithAI,
  getResumesByUser,
  getResumeById,
  updateResume,
  deleteResume,
} = require('../controllers/resumeController');

router.post(
  '/generate',
  authenticateJWT,
  enforceAIUsage('resume'),
  createResumeWithAI
);

router.get('/', authenticateJWT, getResumesByUser);
router.get('/:id', authenticateJWT, getResumeById);
router.put('/:id', authenticateJWT, updateResume);
router.delete('/:id', authenticateJWT, deleteResume);

module.exports = router;
