const logger = require('../observability/logger');
const { Sentry } = require('../observability/sentry');
const { routeLabel } = require('../observability/routeLabel');

const isProd = process.env.NODE_ENV === 'production';

const UPSTREAM_STATUS = 502;
const UPSTREAM_MESSAGE = 'A service we depend on failed. Please try again later.';

function isHttpStatus(value) {
  return Number.isInteger(value) && value >= 400 && value <= 599;
}

// Only our own errors (plain Error objects given a statusCode), the router's
// URIError for an undecodable path and Express or body-parser errors marked
// safe to expose choose the client status. Errors
// from SDKs (OpenAI, Stripe, Firebase) carry the provider's status and message,
// which describe our account, so they become a generic 502.
function resolveStatus(err) {
  const status = err?.statusCode ?? err?.status;
  if (!isHttpStatus(status)) return 500;

  const ownError = err instanceof Error && Object.getPrototypeOf(err) === Error.prototype;
  const exposedHttpError = err instanceof Error && err.expose === true && status < 500;
  const undecodablePath = err instanceof URIError && status === 400;
  if (ownError || exposedHttpError || undecodablePath) return status;

  return UPSTREAM_STATUS;
}

const errorHandler = (err, req, res, next) => {
  const statusCode = resolveStatus(err);

  logger.error(
    {
      err,
      statusCode,
      method: req.method,
      route: routeLabel(req, res),
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

  // The provider's message is never sent, in any environment.
  if (statusCode === UPSTREAM_STATUS) {
    return res.status(statusCode).json({ message: UPSTREAM_MESSAGE });
  }

  if (statusCode >= 500) {
    return res.status(statusCode).json({
      message: 'Internal server error',
      ...(isProd ? {} : { error: err?.message }),
    });
  }

  return res.status(statusCode).json({
    // The router's message quotes the undecodable path.
    message: err instanceof URIError ? 'Malformed URL.' : err.message,
  });
};

module.exports = errorHandler;
module.exports.resolveStatus = resolveStatus;
