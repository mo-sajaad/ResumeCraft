const express = require('express');
const authenticateJWT = require('../middleware/authMiddleware');
const { getAllFlagsForUser } = require('../services/featureFlagService');

const router = express.Router();

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const flags = await getAllFlagsForUser(req.user.firebaseUid);
    return res.json({ flags });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
