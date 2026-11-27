// ADMIN-015: an unknown LOG_LEVEL no longer stops startup, and every line has a
// Cloud Logging severity. pino writes to memory instead of pino-pretty.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));

const originalLevel = process.env.LOG_LEVEL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLevel;
  process.env.NODE_ENV = originalNodeEnv;
});

// A fresh logger and capture buffer for the given environment.
function loadLogger(env) {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  let loaded;
  jest.isolateModules(() => {
    const { capturedLines } = require('pino');
    const logger = require('../observability/logger');
    loaded = { logger, lines: () => capturedLines.map((line) => JSON.parse(line)) };
  });
  return loaded;
}

test.each(['verbose', 'WARNING', 'synthetic-typo'])('LOG_LEVEL=%s falls back to info with one warning', (value) => {
  let loaded;
  expect(() => { loaded = loadLogger({ LOG_LEVEL: value }); }).not.toThrow();
  const { logger, lines } = loaded;

  expect(logger.level).toBe('info');
  const warnings = lines();
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({
    level: 40,
    severity: 'WARNING',
    msg: 'Unknown LOG_LEVEL ignored',
    logLevel: value.toLowerCase(),
    using: 'info',
  });

  logger.debug('synthetic debug line');
  logger.info('synthetic info line');
  expect(lines().map(({ msg }) => msg)).toEqual(['Unknown LOG_LEVEL ignored', 'synthetic info line']);
});

test('a very long LOG_LEVEL is cut to 32 characters in the warning', () => {
  const { lines } = loadLogger({ LOG_LEVEL: 'x'.repeat(500) });
  expect(lines()[0].logLevel).toBe('x'.repeat(32));
});

test.each([
  ['debug', 'debug'],
  [' WARN ', 'warn'],
  ['silent', 'silent'],
  [undefined, 'info'],
  ['', 'info'],
])('LOG_LEVEL=%p is used as %s without a warning', (value, expected) => {
  const { logger, lines } = loadLogger({ LOG_LEVEL: value });
  expect(logger.level).toBe(expected);
  expect(lines()).toHaveLength(0);
});

test('every line carries a severity matching its level', () => {
  const { logger, lines } = loadLogger({ LOG_LEVEL: 'trace' });
  logger.trace('t');
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  logger.fatal('f');
  logger.child({ component: 'synthetic' }).warn('child line');

  expect(lines().map(({ level, severity, msg }) => [level, severity, msg])).toEqual([
    [10, 'DEBUG', 't'],
    [20, 'DEBUG', 'd'],
    [30, 'INFO', 'i'],
    [40, 'WARNING', 'w'],
    [50, 'ERROR', 'e'],
    [60, 'CRITICAL', 'f'],
    [40, 'WARNING', 'child line'],
  ]);
});

test('lines keep the service and environment fields', () => {
  const { logger, lines } = loadLogger({ LOG_LEVEL: undefined, NODE_ENV: 'production' });
  logger.info('synthetic');
  expect(lines()[0]).toMatchObject({ service: 'resumecraft-backend', env: 'production', severity: 'INFO' });
});
