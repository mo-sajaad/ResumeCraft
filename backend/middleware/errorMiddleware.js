const logger = require('../observability/logger');
const { Sentry } = require('../observability/sentry');

const isProd = process.env.NODE_ENV === 'production';

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  logger.error(
    {
      err,
      statusCode,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id,
    },
    'Request failed'
  );

  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: {
        statusCode: String(statusCode),
      },
      extra: {
        method: req.method,
        path: req.originalUrl,
      },
      user: req.user?.id ? { id: String(req.user.id) } : undefined,
    });
  }

  if (statusCode === 500) {
    return res.status(500).json({
      message: 'Internal server error',
      ...(isProd ? {} : { error: err.message }),
    });
  }

  return res.status(statusCode).json({
    message: err.message,
  });
};

module.exports = errorHandler;
