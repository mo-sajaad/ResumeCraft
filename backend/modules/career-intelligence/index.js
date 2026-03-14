const express = require('express');
const aiRoutes = require('./routes/aiRoutes');
const careerToolsRoutes = require('./routes/careerToolsRoutes');
const contracts = require('./services/contracts');

const router = express.Router();

router.use('/ai', aiRoutes);
router.use('/career-tools', careerToolsRoutes);

module.exports = {
  router,
  contracts,
};
