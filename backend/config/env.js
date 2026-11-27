const { isTestRunner } = require('./testRun');

// The only place .env is loaded. server.js requires this before anything else,
// because several modules read process.env when they are first required.
if (process.env.NODE_ENV !== 'test' && !isTestRunner()) {
  require('dotenv').config();
}

// Reads a whole-number setting. Unset or empty uses the default; anything else
// that is not an integer of at least `min` stops startup, so a typo cannot
// silently disable a limit (PLATFORM-008). The value itself is not echoed.
function readIntegerEnv(name, defaultValue, { min = 1 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;

  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (!/^-?\d+$/.test(trimmed) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min}.`);
  }

  return value;
}

module.exports = {
  readIntegerEnv,
};
