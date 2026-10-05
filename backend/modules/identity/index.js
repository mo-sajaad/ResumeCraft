const express = require('express');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const userRepository = require('./repositories/userRepository.js');
const contracts = require('./services/contracts');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

module.exports = {
  router,
  interfaces: {
    userRepository,
  },
  contracts,
};
