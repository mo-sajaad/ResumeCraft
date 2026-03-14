const express = require('express');
const resumeRoutes = require('./routes/resumeRoutes');
const coverLetterRoutes = require('./routes/coverLetterRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');

const resumeService = require('./services/resumeService');
const coverLetterService = require('./services/coverLetterService');
const workspaceService = require('./services/workspaceService');
const contracts = require('./services/contracts');

const router = express.Router();

router.use('/resumes', resumeRoutes);
router.use('/cover-letters', coverLetterRoutes);
router.use('/workspace', workspaceRoutes);

module.exports = {
  router,
  services: {
    resumeService,
    coverLetterService,
    workspaceService,
  },
  contracts,
};
