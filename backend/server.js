const dotenv = require('dotenv');

const logger = require('./observability/logger');
const { initSentry } = require('./observability/sentry');
const { createApp } = require('./app');

dotenv.config();

function assertCriticalSecrets() {
  const jwtSecret = process.env.JWT_SECRET_KEY;
  if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error('Missing JWT_SECRET_KEY. Refusing to start server.');
  }
}

assertCriticalSecrets();

const sentryEnabled = initSentry();
const app = createApp({ sentryEnabled });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info({ port: PORT, sentryEnabled }, 'Server started');
});
