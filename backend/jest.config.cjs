// Cleans this process first, so worker processes inherit the safe environment.
require('./tests/support/isolate');

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.jest.js'],
  setupFiles: ['<rootDir>/tests/support/isolate.js'],
  clearMocks: true,
  restoreMocks: true,
};
