const express = require('express');

const authenticateJWT = require('../middleware/authMiddleware');
const {
  getUserProfile,
  patchUserPreferences,
} = require('../controllers/userController');

const router = express.Router();

router.use(authenticateJWT);

router.get('/:firebaseUid', getUserProfile);
router.patch('/:firebaseUid/preferences', patchUserPreferences);

module.exports = router;