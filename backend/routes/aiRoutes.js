const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middleware/authMiddleware');
const { createResumeWithAI } = require('../controllers/resumeController');

router.post('/generate-resume', authenticateJWT, createResumeWithAI);

module.exports = router;
