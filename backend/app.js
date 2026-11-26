const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const logger = require('./observability/logger');
const errorHandler = require('./middleware/errorMiddleware');
const { Sentry } = require('./observability/sentry');
const { metricsMiddleware, metricsHandler } = require('./observability/metrics');
const usageAnalytics = require('./middleware/usageAnalytics');

const identityModule = require('./modules/identity');
const billingModule = require('./modules/billing');
const documentsModule = require('./modules/documents');
const careerIntelligenceModule = require('./modules/career-intelligence');
const adminModule = require('./modules/admin');

const TRUST_PROXY_HELP =
  'Set TRUST_PROXY to a non-negative integer hop count (likely 2 behind Firebase Hosting and Cloud Run), '
  + 'true, false, or a comma-separated list of IP addresses, CIDR ranges or loopback/linklocal/uniquelocal.';

function trustProxyError(reason) {
  return new Error(`${reason} ${TRUST_PROXY_HELP}`);
}

// Without it behind a proxy, req.ip is the proxy and all users share IP rate limits.
function resolveTrustProxySetting() {
  const raw = (process.env.TRUST_PROXY || '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw trustProxyError('TRUST_PROXY is required when NODE_ENV=production.');
    }
    return false;
  }

  if (raw === 'true') return 1;
  if (raw === 'false') return false;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  return raw;
}

function createApp({ sentryEnabled = false } = {}) {
  const app = express();
  const trustProxy = resolveTrustProxySetting();
  try {
    app.set('trust proxy', trustProxy);
  } catch (error) {
    throw trustProxyError(`TRUST_PROXY is malformed (${error.message}).`);
  }

  const allowedOrigins = [process.env.APP_BASE_URL]
    .filter((origin) => typeof origin === 'string')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error('CORS not allowed');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  }));

  if (sentryEnabled) {
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
  }

  // pino-http would otherwise replace the logger's serializers with its own.
  app.use(pinoHttp({ logger, wrapSerializers: false }));
  app.use(metricsMiddleware);
  app.use(usageAnalytics);

  app.get('/metrics', metricsHandler);

  app.use('/api', billingModule.preJsonRouter);
  app.use(express.json());

  app.use('/api', identityModule.router);
  app.use('/api', billingModule.router);
  app.use('/api', documentsModule.router);
  app.use('/api', careerIntelligenceModule.router);
  app.use('/api', adminModule.router);

  if (sentryEnabled) {
    app.use(Sentry.Handlers.errorHandler());
  }

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
