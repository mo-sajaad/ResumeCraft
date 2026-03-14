const express = require('express');
const adminRoutes = require('./routes/adminRoutes');
const featureFlagRoutes = require('./routes/featureFlagRoutes');

const adminRepository = require('./repositories/adminRepository');
const featureFlagRepository = require('./repositories/featureFlagRepository');
const auditLogRepository = require('./repositories/auditLogRepository');
const contracts = require('./services/contracts');

const router = express.Router();

router.use('/admin', adminRoutes);
router.use('/feature-flags', featureFlagRoutes);

module.exports = {
  router,
  interfaces: {
    adminRepository,
    featureFlagRepository,
    auditLogRepository,
  },
  contracts,
};
