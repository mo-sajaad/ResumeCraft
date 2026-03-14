const {
  normalizeText,
  extractSkillsFromText,
  countMeasurableBullets,
} = require('./utils');
const { buildAiEnhancedResponse } = require('./aiEnhancement');

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

    const baselineResponse = {
      demandScore,
      marketOutlook: demandScore >= 75 ? 'high' : demandScore >= 60 ? 'moderate' : 'emerging',
      topSignals: [
        'Cloud-native engineering demand remains strong.',
        'GenAI tooling literacy is increasingly requested.',
        'System design depth is a strong differentiator for senior roles.',
      ],
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'market_demand',
      input: { targetRole, location },
      baselineResponse,
    });

    return res.json(enhancedResponse);
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

    const baselineResponse = {
      prioritySkills: gaps.slice(0, 6),
      roadmap: gaps.slice(0, 4).map((skill, index) => ({
        week: index + 1,
        focus: skill,
        action: `Build one mini-project and one resume bullet proving ${skill}.`,
      })),
      note: 'Prioritize practical proof (projects/bullets) over passive reading.',
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'learning_roadmap',
      input: { resumeText, jobDescription },
      baselineResponse,
    });

    return res.json(enhancedResponse);
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

    const baselineResponse = {
      profileStrength,
      guidance: [
        `For ${location}, emphasize scarce skills and measurable impact in ${targetRole} projects.`,
        'Highlight leadership/ownership evidence to improve sponsorship viability.',
        'Prepare a concise impact portfolio (resume + project links + quantified outcomes).',
      ],
      disclaimer: 'This is product guidance, not legal immigration advice.',
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'visa_guidance',
      input: { targetRole, location, resumeText },
      baselineResponse,
    });

    return res.json(enhancedResponse);
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

    const baselineResponse = {
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
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'application_readiness',
      input: { resumeText, jobDescription, targetRole },
      baselineResponse,
    });

    return res.json(enhancedResponse);
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

    const baselineResponse = {
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
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'networking_strategy',
      input: { targetRole, location, resumeText },
      baselineResponse,
    });

    return res.json(enhancedResponse);
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

    const baselineResponse = {
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
    };

    const enhancedResponse = await buildAiEnhancedResponse({
      toolName: 'portfolio_audit',
      input: { resumeText, targetRole },
      baselineResponse,
    });

    return res.json(enhancedResponse);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  marketDemandAnalysis,
  learningRoadmap,
  visaGuidance,
  applicationReadiness,
  networkingStrategy,
  portfolioAudit,
};
