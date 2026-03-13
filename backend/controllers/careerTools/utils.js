const COMMON_SKILLS = [
  'javascript', 'typescript', 'react', 'node', 'express', 'postgresql', 'sql', 'python', 'java',
  'aws', 'docker', 'kubernetes', 'git', 'rest', 'graphql', 'testing', 'jest', 'cicd', 'microservices',
  'agile', 'communication', 'leadership', 'problem solving', 'system design', 'redis', 'terraform',
  'observability', 'prompt engineering', 'machine learning', 'data engineering'
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

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  COMMON_SKILLS,
  normalizeText,
  extractSkillsFromText,
  inferSeniority,
  splitResponsibilities,
  countMeasurableBullets,
  detectBuzzwords,
  estimateSalaryBand,
  estimateConfidence,
  clamp,
};
