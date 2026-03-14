const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';
const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level,
  base: {
    service: 'resumecraft-backend',
    env: process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.token',
      'token',
    ],
    censor: '[REDACTED]',
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
