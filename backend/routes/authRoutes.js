const express = require('express');

const { exchangeFirebaseToken } = require('../controllers/authController');

const router = express.Router();

router.post('/exchange', exchangeFirebaseToken);

module.exports = router;