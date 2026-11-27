require('./config/env');

// Sentry v8 instruments modules as they load, so it starts before Express.
const { initSentry } = require('./observability/sentry');

const sentryEnabled = initSentry();

const logger = require('./observability/logger');
const { createApp } = require('./app');

function assertCriticalSecrets() {
  const jwtSecret = process.env.JWT_SECRET_KEY;
  if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error('Missing JWT_SECRET_KEY. Refusing to start server.');
  }
}

assertCriticalSecrets();

const app = createApp({ sentryEnabled });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info({ port: PORT, sentryEnabled }, 'Server started');
});
