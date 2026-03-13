const COMMON_SKILLS = [
  'javascript', 'typescript', 'react', 'node', 'express', 'postgresql', 'sql', 'python', 'java',
  'aws', 'docker', 'kubernetes', 'git', 'rest', 'graphql', 'testing', 'jest', 'cicd', 'microservices',
  'agile', 'communication', 'leadership', 'problem solving', 'system design'
];

const BUZZWORDS = ['synergy', 'go-getter', 'ninja', 'rockstar', 'hardworking', 'passionate'];

function normalizeText(value = '') {
  return String(value).toLowerCase();
}

function extractSkillsFromText(text = '') {
  const normalized = normalizeText(text);
  return COMMON_SKILLS.filter((skill) => normalized.includes(skill));
}

function inferSeniority(text = '') {
  const normalized = normalizeText(text);
  if (normalized.includes('staff') || normalized.includes('principal') || normalized.includes('lead')) return 'senior+';
  if (normalized.includes('senior') || normalized.includes('5+') || normalized.includes('7+')) return 'senior';
  if (normalized.includes('mid') || normalized.includes('3+') || normalized.includes('4+')) return 'mid';
  return 'junior';
}

function splitResponsibilities(text = '') {
  return String(text)
    .split('\n')
    .map((line) => line.replace(/^[-•*\s]+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);
}

function countMeasurableBullets(text = '') {
  const lines = String(text).split('\n').map((line) => line.trim());
  return lines.filter((line) => /\d|%|\$|x\b|\bms\b|\bsec\b|\bhours?\b/i.test(line)).length;
}

function detectBuzzwords(text = '') {
  const normalized = normalizeText(text);
  return BUZZWORDS.filter((word) => normalized.includes(word));
}


function estimateSalaryBand({ targetRole = '', location = '', yearsExperience = 0 }) {
  const roleText = normalizeText(targetRole);
  const locationText = normalizeText(location);
  const years = Number.isFinite(Number(yearsExperience)) ? Number(yearsExperience) : 0;

  let baseMin = 45000;
  let baseMax = 70000;

  if (roleText.includes('engineer') || roleText.includes('developer')) {
    baseMin = 65000;
    baseMax = 110000;
  }
  if (roleText.includes('senior')) {
    baseMin += 25000;
    baseMax += 35000;
  }
  if (roleText.includes('staff') || roleText.includes('principal') || roleText.includes('lead')) {
    baseMin += 45000;
    baseMax += 65000;
  }

  const expAdj = Math.min(20, years) * 2200;
  baseMin += expAdj;
  baseMax += expAdj;

  const highCostCities = ['london', 'new york', 'san francisco', 'seattle', 'zurich'];
  if (highCostCities.some((city) => locationText.includes(city))) {
    baseMin = Math.round(baseMin * 1.2);
    baseMax = Math.round(baseMax * 1.2);
  }

  return {
    minAnnual: Math.round(baseMin),
    maxAnnual: Math.round(baseMax),
    currency: locationText.includes('uk') || locationText.includes('london') ? 'GBP' : 'USD',
  };
}

function estimateConfidence(answerText = '') {
  const text = String(answerText).trim();
  if (!text) return 0;
  const hasStructure = /(situation|task|action|result)/i.test(text);
  const hasMetrics = /\d|%|\$/i.test(text);
  const lengthScore = Math.min(60, Math.round(text.split(/\s+/).length * 0.45));
  return Math.min(100, lengthScore + (hasStructure ? 20 : 0) + (hasMetrics ? 20 : 0));
}

async function parseJobDescription(req, res, next) {
  try {
    const jobDescription = String(req.body?.jobDescription || '').trim();

    if (!jobDescription) {
      return res.status(400).json({ error: 'jobDescription is required.' });
    }

    const skills = extractSkillsFromText(jobDescription);

    return res.json({
      requiredSkills: skills.slice(0, Math.ceil(skills.length * 0.7)),
      preferredSkills: skills.slice(Math.ceil(skills.length * 0.7)),
      softSkills: ['communication', 'problem solving'].filter((skill) => normalizeText(jobDescription).includes(skill)),
      seniority: inferSeniority(jobDescription),
      responsibilities: splitResponsibilities(jobDescription),
    });
  } catch (error) {
    return next(error);
  }
}

async function analyzeAts(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const jobDescription = String(req.body?.jobDescription || '').trim();

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'resumeText and jobDescription are required.' });
    }

    const jdSkills = extractSkillsFromText(jobDescription);
    const resumeSkills = extractSkillsFromText(resumeText);

    const matchedSkills = jdSkills.filter((skill) => resumeSkills.includes(skill));
    const missingSkills = jdSkills.filter((skill) => !resumeSkills.includes(skill));

    const matchPercent = jdSkills.length ? Math.round((matchedSkills.length / jdSkills.length) * 100) : 0;
    const keywordDensityScore = Math.min(100, Math.round((resumeSkills.length / Math.max(1, resumeText.split(/\s+/).length)) * 1000));
    const atsScore = Math.round((matchPercent * 0.75) + (keywordDensityScore * 0.25));

    return res.json({
      atsScore,
      matchPercent,
      keywordDensityScore,
      matchedSkills,
      missingSkills,
      recommendations: [
        ...missingSkills.slice(0, 4).map((skill) => `Add evidence of ${skill} in experience bullets.`),
        'Use measurable outcomes (%, $, time saved) in key bullet points.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function recruiterScan(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    if (!resumeText) return res.status(400).json({ error: 'resumeText is required.' });

    const measurableBullets = countMeasurableBullets(resumeText);
    const buzzwords = detectBuzzwords(resumeText);
    const skimScore = Math.max(0, Math.min(100, 40 + measurableBullets * 8 - buzzwords.length * 6));

    const redFlags = [];
    if (measurableBullets < 2) redFlags.push('Low quantification: add more metrics and outcomes.');
    if (buzzwords.length) redFlags.push(`Buzzword overuse detected: ${buzzwords.join(', ')}.`);
    if (resumeText.split(/\s+/).length > 900) redFlags.push('Resume may be too long for a 6-second recruiter skim.');

    return res.json({
      skimScore,
      sixSecondReadiness: skimScore,
      measurableBullets,
      buzzwords,
      redFlags,
      recruiterSummary: skimScore >= 75
        ? 'Strong first-pass recruiter readability.'
        : 'Needs clearer impact bullets and tighter wording for recruiter skim.',
    });
  } catch (error) {
    return next(error);
  }
}

async function competitiveAnalysis(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const benchmarkText = String(req.body?.benchmarkText || '').trim();

    if (!resumeText || !benchmarkText) {
      return res.status(400).json({ error: 'resumeText and benchmarkText are required.' });
    }

    const resumeSkills = extractSkillsFromText(resumeText);
    const benchmarkSkills = extractSkillsFromText(benchmarkText);

    const sharedSkills = benchmarkSkills.filter((skill) => resumeSkills.includes(skill));
    const missingComparedToBenchmark = benchmarkSkills.filter((skill) => !resumeSkills.includes(skill));

    const benchmarkAlignment = benchmarkSkills.length
      ? Math.round((sharedSkills.length / benchmarkSkills.length) * 100)
      : 0;

    return res.json({
      benchmarkAlignment,
      sharedSkills,
      missingComparedToBenchmark,
      rewriteSuggestions: missingComparedToBenchmark
        .slice(0, 5)
        .map((skill) => `Add a concrete bullet that demonstrates ${skill}.`),
    });
  } catch (error) {
    return next(error);
  }
}

async function interviewPrep(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const jobDescription = String(req.body?.jobDescription || '').trim();
    const answerText = String(req.body?.answerText || '').trim();

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'resumeText and jobDescription are required.' });
    }

    const jdSkills = extractSkillsFromText(jobDescription);
    const interviewQuestions = jdSkills.slice(0, 5).map((skill) => `Tell me about a project where you used ${skill}.`);

    const confidenceScore = estimateConfidence(answerText);

    return res.json({
      interviewQuestions,
      weaknessDetection: jdSkills.filter((skill) => !extractSkillsFromText(resumeText).includes(skill)).slice(0, 5),
      answerGrading: answerText ? (confidenceScore >= 70 ? 'strong' : confidenceScore >= 40 ? 'average' : 'weak') : 'not_provided',
      confidenceScore,
      suggestion: answerText
        ? 'Use STAR format and include measurable outcomes in every answer.'
        : 'Provide a sample answer to receive grading and confidence scoring.',
    });
  } catch (error) {
    return next(error);
  }
}


async function salaryEstimate(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const yearsExperience = Number(req.body?.yearsExperience || 0);

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const band = estimateSalaryBand({ targetRole, location, yearsExperience });

    return res.json({
      targetRole,
      location: location || 'unspecified',
      yearsExperience,
      salaryBand: band,
      tips: [
        'Use this estimate as a negotiation anchor, not a guarantee.',
        'Compare with local market data and company stage for better accuracy.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function roleFitAnalysis(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();

    if (!resumeText || !targetRole) {
      return res.status(400).json({ error: 'resumeText and targetRole are required.' });
    }

    const resumeSkills = extractSkillsFromText(resumeText);
    const roleKeywords = extractSkillsFromText(targetRole);
    const roleFitScore = roleKeywords.length
      ? Math.round((roleKeywords.filter((skill) => resumeSkills.includes(skill)).length / roleKeywords.length) * 100)
      : Math.min(100, 40 + resumeSkills.length * 2);

    return res.json({
      roleFitScore,
      trendingSkillsSuggestions: ['genai', 'cloud architecture', 'platform engineering', 'observability'],
      remoteReadinessScore: Math.min(100, 35 + countMeasurableBullets(resumeText) * 6),
      promotionReadinessScore: Math.min(100, 30 + (normalizeText(resumeText).includes('lead') ? 25 : 0) + countMeasurableBullets(resumeText) * 5),
      recommendations: [
        'Highlight ownership and cross-functional collaboration outcomes.',
        'Add one systems-level impact bullet for promotion-level signaling.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}


async function marketDemandAnalysis(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const role = normalizeText(targetRole);

    let demandScore = 55;
    if (role.includes('ai') || role.includes('ml') || role.includes('data')) demandScore += 20;
    if (role.includes('backend') || role.includes('platform') || role.includes('cloud')) demandScore += 12;
    if (role.includes('frontend')) demandScore += 8;

    if (normalizeText(location).includes('remote')) demandScore += 6;
    demandScore = Math.min(100, demandScore);

    return res.json({
      demandScore,
      marketOutlook: demandScore >= 75 ? 'high' : demandScore >= 60 ? 'moderate' : 'emerging',
      topSignals: [
        'Cloud-native engineering demand remains strong.',
        'GenAI tooling literacy is increasingly requested.',
        'System design depth is a strong differentiator for senior roles.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function learningRoadmap(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const jobDescription = String(req.body?.jobDescription || '').trim();

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'resumeText and jobDescription are required.' });
    }

    const resumeSkills = extractSkillsFromText(resumeText);
    const jdSkills = extractSkillsFromText(jobDescription);
    const gaps = jdSkills.filter((skill) => !resumeSkills.includes(skill));

    return res.json({
      prioritySkills: gaps.slice(0, 6),
      roadmap: gaps.slice(0, 4).map((skill, index) => ({
        week: index + 1,
        focus: skill,
        action: `Build one mini-project and one resume bullet proving ${skill}.`,
      })),
      note: 'Prioritize practical proof (projects/bullets) over passive reading.',
    });
  } catch (error) {
    return next(error);
  }
}

async function visaGuidance(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const resumeText = String(req.body?.resumeText || '').trim();

    if (!targetRole || !location) {
      return res.status(400).json({ error: 'targetRole and location are required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const profileStrength = Math.min(100, 35 + measurableBullets * 8 + (normalizeText(targetRole).includes('senior') ? 12 : 0));

    return res.json({
      profileStrength,
      guidance: [
        `For ${location}, emphasize scarce skills and measurable impact in ${targetRole} projects.`,
        'Highlight leadership/ownership evidence to improve sponsorship viability.',
        'Prepare a concise impact portfolio (resume + project links + quantified outcomes).',
      ],
      disclaimer: 'This is product guidance, not legal immigration advice.',
    });
  } catch (error) {
    return next(error);
  }
}

async function applicationReadiness(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const jobDescription = String(req.body?.jobDescription || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'resumeText and jobDescription are required.' });
    }

    const resumeSkills = extractSkillsFromText(resumeText);
    const jdSkills = extractSkillsFromText(jobDescription);
    const measurableBullets = countMeasurableBullets(resumeText);
    const skillMatchScore = jdSkills.length ? Math.round((jdSkills.filter((skill) => resumeSkills.includes(skill)).length / jdSkills.length) * 100) : 0;
    const quantifiedImpactScore = Math.min(100, measurableBullets * 12);
    const readinessScore = Math.round((skillMatchScore * 0.65) + (quantifiedImpactScore * 0.35));

    const blockers = [];
    if (skillMatchScore < 55) blockers.push('Skill overlap is low; align resume bullets directly to the job requirements.');
    if (quantifiedImpactScore < 45) blockers.push('Quantified outcomes are limited; add measurable impact to key bullets.');
    if (resumeText.split(/\s+/).length < 150) blockers.push('Resume detail appears sparse for this role level.');

    return res.json({
      targetRole: targetRole || 'unspecified',
      readinessScore,
      skillMatchScore,
      quantifiedImpactScore,
      blockers,
      actionPlan14Days: [
        'Days 1-3: Rewrite top 6 bullets to mirror role requirements with metrics.',
        'Days 4-7: Build one role-aligned proof project and publish a concise README.',
        'Days 8-10: Prepare STAR stories for core requirements and outcomes.',
        'Days 11-14: Apply in focused batches and iterate based on response signals.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}

async function networkingStrategy(req, res, next) {
  try {
    const targetRole = String(req.body?.targetRole || '').trim();
    const location = String(req.body?.location || '').trim();
    const resumeText = String(req.body?.resumeText || '').trim();

    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const profileSignal = Math.min(100, 45 + measurableBullets * 7);

    return res.json({
      profileSignal,
      targetChannels: [
        `Alumni and ex-colleagues working as ${targetRole} in ${location || 'your target market'}.`,
        `Hiring managers and team leads posting ${targetRole} openings.`,
        'Recruiters focused on your target stack and geography.',
      ],
      outreachCadence: {
        weeklyNewContacts: 12,
        weeklyFollowUps: 18,
        referralRequestsPerWeek: 4,
      },
      messageTemplate: `Hi <Name> — I’m targeting ${targetRole} roles${location ? ` in ${location}` : ''} and would value 10 minutes to learn how your team evaluates candidates. I can share a concise portfolio with measurable outcomes if useful.`,
    });
  } catch (error) {
    return next(error);
  }
}

async function portfolioAudit(req, res, next) {
  try {
    const resumeText = String(req.body?.resumeText || '').trim();
    const targetRole = String(req.body?.targetRole || '').trim();

    if (!resumeText) {
      return res.status(400).json({ error: 'resumeText is required.' });
    }

    const measurableBullets = countMeasurableBullets(resumeText);
    const hasLeadershipSignal = normalizeText(resumeText).includes('led') || normalizeText(resumeText).includes('mentored');
    const proofCoverageScore = Math.min(100, 35 + measurableBullets * 9 + (hasLeadershipSignal ? 12 : 0));

    return res.json({
      targetRole: targetRole || 'unspecified',
      proofCoverageScore,
      missingEvidence: [
        'One architecture/system-design artifact showing decision trade-offs.',
        'One performance or cost optimization case study with before/after metrics.',
        'One collaboration story demonstrating stakeholder management.',
      ],
      portfolioBacklog: [
        'Create a 1-page project brief per flagship project (problem, constraints, impact).',
        'Attach links to code, demo, and measurable outcome snapshot.',
        'Map each artifact to a target role requirement for quick recruiter scan.',
      ],
    });
  } catch (error) {
    return next(error);
  }
}


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
    const buzzwords = detectBuzzwords(resumeText);
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
  careerPivotPlan,
  outreachMessageGenerator,
  interviewDrillPlan,
};
