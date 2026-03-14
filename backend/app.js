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

function resolveTrustProxySetting() {
  const raw = (process.env.TRUST_PROXY || '').trim();
  if (!raw) return false;

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
  app.set('trust proxy', resolveTrustProxySetting());

  const allowedOrigins = [process.env.FRONTEND_URL]
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

  app.use(pinoHttp({ logger }));
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
