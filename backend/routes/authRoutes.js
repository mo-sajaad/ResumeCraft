const express = require('express');

const { exchangeFirebaseToken, logout, revokeSessions } = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimiter');
const authenticateJWT = require('../middleware/authMiddleware');

const router = express.Router();

const authExchangeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

router.post('/exchange', authExchangeRateLimiter, exchangeFirebaseToken);
router.post('/logout', authenticateJWT, logout);
router.post('/sessions/revoke', authenticateJWT, revokeSessions);

module.exports = router;
