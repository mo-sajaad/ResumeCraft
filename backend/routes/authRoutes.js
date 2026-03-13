const express = require('express');

const { exchangeFirebaseToken } = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const authExchangeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

router.post('/exchange', authExchangeRateLimiter, exchangeFirebaseToken);

module.exports = router;
