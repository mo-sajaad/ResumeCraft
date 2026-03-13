const {
  extractSkillsFromText,
  countMeasurableBullets,
  estimateSalaryBand,
  estimateConfidence,
} = require('./utils');

async function offerNegotiationPrep(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const yearsExperience = Number(req.body?.yearsExperience || 0);

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const salaryBand = estimateSalaryBand({ targetRole, location, yearsExperience });
    const anchor = Math.round(salaryBand.maxAnnual * 1.08);

    return res.json({
      salaryBand,
      negotiationAnchor: anchor,
      script: [
        `Based on role scope and market data for ${targetRole}${location ? ` in ${location}` : ''}, I’m targeting total compensation around ${anchor} ${salaryBand.currency}.`,
        'I can share examples where I delivered measurable impact and would love to align package with expected outcomes.',
      ],
      concessions: [
        'Sign-on bonus if base is capped.',
        '6-month performance review tied to comp adjustment.',
        'Additional PTO or professional development budget.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function jobSearchSprint(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const resumeText = String(req.body?.resumeText || '').trim();

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const executionReadiness = Math.min(100, 42 + measurableBullets * 8);

    return res.json({
      executionReadiness,
      weeklyPlan: {
        tailoredApplications: 18,
        networkingTouches: 30,
        recruiterMessages: 8,
        interviewPracticeSessions: 3,
      },
      dailyChecklist: [
        `Apply to 3 focused ${targetRole} opportunities${location ? ` in ${location}` : ''}.`,
        'Send 5 outreach/follow-up messages.',
        'Refine one resume bullet or portfolio artifact based on role signals.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function personalBrandAudit(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();

    if (!resumeText) {
      return res.status(400).json({ error: 'resumeText is required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const buzzwords = ['synergy', 'go-getter', 'ninja', 'rockstar', 'hardworking', 'passionate'].filter((word) => resumeText.toLowerCase().includes(word));
    const clarityScore = Math.max(0, Math.min(100, 50 + measurableBullets * 7 - buzzwords.length * 6));

    return res.json({
      targetRole: targetRole || 'unspecified',
      clarityScore,
      positioningStatement: targetRole
        ? `I help teams ship high-impact outcomes as a ${targetRole} by combining technical depth with measurable business results.`
        : 'I deliver high-impact technical outcomes with measurable business results.',
      improvements: [
        'Use a one-line headline that states scope + outcomes.',
        'Replace generic adjectives with quantified wins.',
        'Keep a consistent narrative from resume to portfolio to outreach.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function careerPivotPlan(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();
    const jobDescription = String(req.body?.jobDescription || '').trim();

    if (!resumeText || !targetRole) {
      return res.status(400).json({ error: 'resumeText and targetRole are required.' });
    }

    const resumeSkills = extractSkillsFromText(resumeText);
    const targetSignals = extractSkillsFromText(`${targetRole} ${jobDescription}`);
    const missingSignals = targetSignals.filter((skill) => !resumeSkills.includes(skill));
    const transferabilityScore = Math.max(25, Math.min(100, 45 + resumeSkills.length * 4 - missingSignals.length * 6));

    return res.json({
      transferabilityScore,
      pivotTrack: [
        'Week 1: Reframe resume summary around transferable outcomes.',
        'Week 2: Ship one domain-relevant mini project and document impact.',
        'Week 3: Practice 5 pivot narrative stories (problem, action, result).',
        'Week 4: Apply with targeted messaging and iterate weekly.',
      ],
      skillGaps: missingSignals.slice(0, 6),
      narrative: `Position your background as immediately relevant to ${targetRole} through outcomes, ownership, and speed-to-ramp evidence.`,
    });
  } catch (error) {
    return next(error);
  }
}

async function outreachMessageGenerator(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const resumeText = String(req.body?.resumeText || '').trim();

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const credibilitySignal = Math.min(100, 38 + measurableBullets * 10);

    return res.json({
      credibilitySignal,
      coldMessage: `Hi <Name> — I’m exploring ${targetRole} opportunities${location ? ` in ${location}` : ''}. I’ve delivered measurable impact on production systems and would value a short chat on what your team prioritizes for this role.`,
      warmFollowUp: 'Wanted to follow up in case this got buried — happy to send a concise portfolio summary with outcomes and relevance to your current hiring needs.',
      referralAsk: 'If there is a fit, would you be open to referring me or suggesting the best way to align my application with your team expectations?',
    });
  } catch (error) {
    return next(error);
  }
}

async function interviewDrillPlan(req, res, next) {
  try {
    const jobDescription = String(req.body?.jobDescription || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();
    const answerText = String(req.body?.answerText || '').trim();

    if (!jobDescription && !targetRole) {
      return res.status(400).json({ error: 'jobDescription or targetRole is required.' });
    }

    const skillSignals = extractSkillsFromText(`${jobDescription} ${targetRole}`);
    const confidenceScore = estimateConfidence(answerText);

    return res.json({
      confidenceScore,
      drillQuestions: (skillSignals.length ? skillSignals : ['system design', 'leadership', 'debugging']).slice(0, 6).map((skill) => `Drill: Explain a high-impact example demonstrating ${skill}.`),
      cadence: {
        sessionsPerWeek: 4,
        mockInterviewsPerWeek: 2,
        retrospectiveMinutes: 20,
      },
      focus: confidenceScore < 55 ? 'Strengthen structured storytelling and quantified outcomes.' : 'Raise depth and precision under follow-up pressure.',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  offerNegotiationPrep,
  jobSearchSprint,
  personalBrandAudit,
  careerPivotPlan,
  outreachMessageGenerator,
  interviewDrillPlan,
};
