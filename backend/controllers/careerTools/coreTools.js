const {
  normalizeText,
  extractSkillsFromText,
  inferSeniority,
  splitResponsibilities,
  countMeasurableBullets,
  detectBuzzwords,
  estimateSalaryBand,
  estimateConfidence,
  clamp,
} = require('./utils');

function inferRoleSignals(targetRole = '') {
  const role = normalizeText(targetRole);
  const signals = new Set(extractSkillsFromText(targetRole));

  if (role.includes('backend')) ['node', 'express', 'sql', 'postgresql', 'microservices'].forEach((s) => signals.add(s));
  if (role.includes('frontend')) ['react', 'javascript', 'typescript', 'testing'].forEach((s) => signals.add(s));
  if (role.includes('data') || role.includes('ml') || role.includes('ai')) ['python', 'sql', 'machine learning', 'data engineering'].forEach((s) => signals.add(s));
  if (role.includes('platform') || role.includes('devops')) ['aws', 'docker', 'kubernetes', 'terraform', 'cicd'].forEach((s) => signals.add(s));

  return [...signals];
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
    const keywordDensityScore = clamp(Math.round((resumeSkills.length / Math.max(1, resumeText.split(/\s+/).length)) * 1200));
    const measurableBullets = countMeasurableBullets(resumeText);
    const impactScore = clamp(25 + measurableBullets * 12);
    const atsScore = clamp(Math.round((matchPercent * 0.6) + (keywordDensityScore * 0.2) + (impactScore * 0.2)));

    return res.json({
      atsScore,
      matchPercent,
      keywordDensityScore,
      impactScore,
      matchedSkills,
      missingSkills,
      recommendations: [
        ...missingSkills.slice(0, 4).map((skill) => `Add evidence of ${skill} in experience bullets.`),
        ...(measurableBullets < 3 ? ['Use measurable outcomes (%, $, time saved) in key bullet points.'] : []),
        'Mirror exact job terminology in one summary line and 2-3 core bullets.',
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
    const resumeSkills = extractSkillsFromText(resumeText);
    const weaknessDetection = jdSkills.filter((skill) => !resumeSkills.includes(skill)).slice(0, 5);
    const interviewQuestions = jdSkills.slice(0, 5).map((skill) => `Tell me about a project where you used ${skill} to deliver measurable impact.`);

    const confidenceScore = estimateConfidence(answerText);

    return res.json({
      interviewQuestions,
      weaknessDetection,
      answerGrading: answerText ? (confidenceScore >= 75 ? 'strong' : confidenceScore >= 50 ? 'average' : 'weak') : 'not_provided',
      confidenceScore,
      coachingPriorities: [
        ...(weaknessDetection.length ? [`Cover missing skills with one STAR story each: ${weaknessDetection.slice(0, 3).join(', ')}.`] : []),
        'Use STAR format with explicit scope, tradeoffs, and measurable outcome.',
        'End every answer with impact + what you would improve next.',
      ],
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
    const roleKeywords = inferRoleSignals(targetRole);
    const roleMatchPercent = roleKeywords.length
      ? Math.round((roleKeywords.filter((skill) => resumeSkills.includes(skill)).length / roleKeywords.length) * 100)
      : Math.min(100, 40 + resumeSkills.length * 2);

    const measurableBullets = countMeasurableBullets(resumeText);
    const quantifiedImpactScore = clamp(20 + measurableBullets * 10);
    const roleFitScore = clamp(Math.round((roleMatchPercent * 0.7) + (quantifiedImpactScore * 0.3)));

    return res.json({
      roleFitScore,
      roleMatchPercent,
      quantifiedImpactScore,
      trendingSkillsSuggestions: ['genai', 'cloud architecture', 'platform engineering', 'observability'],
      remoteReadinessScore: Math.min(100, 35 + measurableBullets * 6),
      promotionReadinessScore: Math.min(100, 30 + (normalizeText(resumeText).includes('lead') ? 25 : 0) + measurableBullets * 5),
      recommendations: [
        'Highlight ownership and cross-functional collaboration outcomes.',
        ...(measurableBullets < 3 ? ['Add one systems-level bullet with measurable business impact.'] : []),
      ],
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
  salaryEstimate,
  roleFitAnalysis,
};
