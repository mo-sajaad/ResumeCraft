const path = require('path');

// Set by tests/support/isolate.js once the process environment is cleaned.
const ISOLATED = Symbol.for('resumecraft.testIsolation');
const TESTS_DIR = path.join(__dirname, '..', 'tests') + path.sep;

// True when a test runner, or a test file run directly, started this process.
// NODE_ENV is deliberately not used here: it can be set for a real server.
function isTestRunner() {
  return Boolean(
    process.env.NODE_TEST_CONTEXT
      || process.env.JEST_WORKER_ID
      || process.execArgv.includes('--test')
      || process.argv[1]?.startsWith(TESTS_DIR)
      || require.main?.filename?.startsWith(TESTS_DIR)
  );
}

// Safety net for test files run without the npm scripts. Required by every
// config module that can open a connection to an outside service.
if (isTestRunner() && !process[ISOLATED]) {
  require('../tests/support/isolate');
}

module.exports = { isTestRunner };
