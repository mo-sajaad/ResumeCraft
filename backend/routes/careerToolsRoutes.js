const express = require('express');

const authenticateJWT = require('../middleware/authMiddleware');
const attachPlan = require('../middleware/attachPlan');
const requireFeature = require('../middleware/requireFeature');
const {
  parseJobDescription,
  analyzeAts,
  recruiterScan,
  competitiveAnalysis,
  interviewPrep,
  roleFitAnalysis,
  salaryEstimate,
  marketDemandAnalysis,
  learningRoadmap,
  visaGuidance,
  applicationReadiness,
  networkingStrategy,
  portfolioAudit,
  offerNegotiationPrep,
  jobSearchSprint,
  personalBrandAudit,
} = require('../controllers/careerToolsController');

const router = express.Router();

router.post('/job-parser', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), parseJobDescription);
router.post('/ats-analysis', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), analyzeAts);
router.post('/recruiter-scan', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), recruiterScan);
router.post('/competitive-analysis', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), competitiveAnalysis);
router.post('/interview-prep', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), interviewPrep);
router.post('/role-fit', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), roleFitAnalysis);
router.post('/salary-estimate', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), salaryEstimate);
router.post('/market-demand', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), marketDemandAnalysis);
router.post('/learning-roadmap', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), learningRoadmap);
router.post('/visa-guidance', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), visaGuidance);
router.post('/application-readiness', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), applicationReadiness);
router.post('/networking-strategy', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), networkingStrategy);
router.post('/portfolio-audit', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), portfolioAudit);
router.post('/offer-negotiation', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), offerNegotiationPrep);
router.post('/job-search-sprint', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), jobSearchSprint);
router.post('/personal-brand-audit', authenticateJWT, attachPlan, requireFeature('has_resume_analysis'), personalBrandAudit);

module.exports = router;
