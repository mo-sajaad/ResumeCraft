const pino = require('pino');
const { CENSOR, serializers, logMethod } = require('./logSerializers');

const DEFAULT_LEVEL = 'info';
const requestedLevel = (process.env.LOG_LEVEL || '').trim().toLowerCase();
// pino throws at load on an unknown level; a typo should not stop startup.
const levelIsValid = !requestedLevel || requestedLevel === 'silent' || Object.hasOwn(pino.levels.values, requestedLevel);
const level = levelIsValid && requestedLevel ? requestedLevel : DEFAULT_LEVEL;
const isProd = process.env.NODE_ENV === 'production';

// Cloud Logging reads "severity", not pino's numeric level.
const SEVERITY = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

const logger = pino({
  level,
  formatters: {
    level: (label, number) => ({ level: number, severity: SEVERITY[label] || 'DEFAULT' }),
  },
  base: {
    service: 'resumecraft-backend',
    env: process.env.NODE_ENV || 'development',
  },
  serializers,
  hooks: { logMethod },
  // Child bindings do not pass through logMethod.
  redact: {
    paths: [
      'password',
      '*.password',
      '*.token',
      'token',
      'firebaseToken',
      '*.firebaseToken',
    ],
    censor: CENSOR,
  },
  transport: !isProd
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

if (!levelIsValid) {
  logger.warn({ logLevel: requestedLevel.slice(0, 32), using: DEFAULT_LEVEL }, 'Unknown LOG_LEVEL ignored');
}

module.exports = logger;
