const crypto = require('node:crypto');
const client = require('prom-client');
const { trackRoute, routeLabel } = require('./routeLabel');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [25, 50, 100, 200, 300, 500, 1000, 2000, 5000],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  trackRoute(req);
  // startTimer() would observe seconds; this metric and its buckets are in ms.
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: routeLabel(req, res),
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels, 1);
    httpRequestDurationMs.observe(labels, Number(process.hrtime.bigint() - start) / 1e6);
  });

  next();
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest();
}

// METRICS_TOKEN set: a matching bearer token is required. Unset: open outside
// production, and hidden (404) in production.
function metricsAccess(req) {
  const expected = (process.env.METRICS_TOKEN || '').trim();
  if (!expected) return process.env.NODE_ENV === 'production' ? 'hidden' : 'allowed';

  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '');
  // Equal-length digests make the comparison constant-time.
  const allowed = match && crypto.timingSafeEqual(digest(match[1]), digest(expected));
  return allowed ? 'allowed' : 'denied';
}

async function metricsHandler(req, res) {
  const access = metricsAccess(req);
  if (access === 'hidden') return res.status(404).json({ message: 'Not found.' });
  if (access === 'denied') {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  register,
};
