const { isTestRunner } = require('./testRun');

// The only place .env is loaded. server.js requires this before anything else,
// because several modules read process.env when they are first required.
if (process.env.NODE_ENV !== 'test' && !isTestRunner()) {
  require('dotenv').config();
}
