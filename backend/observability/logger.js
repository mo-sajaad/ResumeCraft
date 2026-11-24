const pino = require('pino');
const { CENSOR, serializers, logMethod } = require('./logSerializers');

const level = process.env.LOG_LEVEL || 'info';
const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level,
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

module.exports = logger;
