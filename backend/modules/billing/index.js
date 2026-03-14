const express = require('express');
const billingRoutes = require('./routes/billingRoutes');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes');
const subscriptionRepository = require('./repositories/subscriptionRepository');
const contracts = require('./services/contracts');

const preJsonRouter = express.Router();
const router = express.Router();

preJsonRouter.use('/stripe', stripeWebhookRoutes);
router.use('/billing', billingRoutes);

module.exports = {
  preJsonRouter,
  router,
  interfaces: {
    subscriptionRepository,
  },
  contracts,
};
