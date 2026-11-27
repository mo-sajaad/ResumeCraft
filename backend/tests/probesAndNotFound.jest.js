// PLATFORM-016 and PLATFORM-023: /metrics access, /healthz and /readyz, and the
// JSON 404 for unknown API paths. The database is scripted (no connection) and
// all tokens are synthetic.
delete process.env.LOG_LEVEL;
delete process.env.METRICS_TOKEN;

const mockVerifyIdToken = jest.fn();

jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: (...args) => mockVerifyIdToken(...args) }),
}));

const { capturedLines } = require('pino');
const { createApp } = require('../app');
const db = require('../config/db');
const { clearFeatureFlagCache } = require('../services/featureFlagService');
// The seeded flags, so usage collection is on for the control request (ADMIN-005).
const FLAG_LOOKUP = /^SELECT key, enabled, rollout_percent FROM feature_flags$/;
const SEEDED_FLAGS = ['admin_dashboard', 'usage_analytics', 'audit_logs']
  .map((key) => ({ key, enabled: true, rollout_percent: 100 }));
const { register } = require('../observability/metrics');
const { readyz, READINESS_TIMEOUT_MS } = require('../observability/health');
const { sessionCookie, startServer } = require('./support/adminHarness');

const USER_UID = 'synthetic-probe-user';
const METRICS_TOKEN = 'synthetic-metrics-token-0123456789';
const originalNodeEnv = process.env.NODE_ENV;
let server;

beforeAll(async () => {
  server = await startServer(createApp());
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  db.reset();
  db.addUser({ id: 7, firebaseUid: USER_UID });
  clearFeatureFlagCache();
  db.on(FLAG_LOOKUP, () => ({ rows: SEEDED_FLAGS }));
  capturedLines.length = 0;
  register.resetMetrics();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  delete process.env.METRICS_TOKEN;
});

async function requestSeries() {
  const { values } = await register.getSingleMetric('http_requests_total').get();
  return values;
}

describe('PLATFORM-023: unknown API paths', () => {
  test.each(['/api/nope', '/API/Nope', '/Api/users-typo/1', '/api', '/api/'])('%s answers a JSON 404', async (path) => {
    const response = await server.request('GET', path);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ message: 'Not found.' });
  });

  test('other methods on an unknown API path answer a JSON 404 too', async () => {
    const response = await server.request('DELETE', '/api/synthetic/thing');
    expect(response.status).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found.' });
  });

  test.each(['/nope', '/apix', '/apinope/1', '/static/api/x'])('non-API path %s keeps the default 404', async (path) => {
    const response = await server.request('GET', path);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  test('the JSON 404 keeps the "unmatched" metric label', async () => {
    await server.request('GET', '/api/synthetic-label-one');
    await server.request('GET', '/API/Synthetic-Label-Two');
    const series = await requestSeries();
    expect(series).toHaveLength(1);
    expect(series[0].labels).toMatchObject({ route: 'unmatched', status_code: '404' });
    expect(series[0].value).toBe(2);
  });
});

describe('PLATFORM-016: /metrics access', () => {
  test('is open when METRICS_TOKEN is unset outside production', async () => {
    process.env.NODE_ENV = 'development';
    const response = await server.request('GET', '/metrics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('http_requests_total');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('answers a JSON 404 when METRICS_TOKEN is unset in production', async () => {
    process.env.NODE_ENV = 'production';
    const response = await server.request('GET', '/metrics');
    expect(response.status).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found.' });
    expect(response.text).not.toContain('http_requests_total');
  });

  test.each([
    ['a missing token', undefined],
    ['a wrong token', `Bearer ${METRICS_TOKEN}x`],
    ['a prefix of the token', `Bearer ${METRICS_TOKEN.slice(0, 10)}`],
    ['a non-Bearer scheme', `Basic ${METRICS_TOKEN}`],
    ['an empty Bearer value', 'Bearer '],
  ])('answers 401 with %s', async (_name, authorization) => {
    process.env.METRICS_TOKEN = METRICS_TOKEN;
    const response = await server.request('GET', '/metrics', {
      headers: authorization === undefined ? {} : { authorization },
    });
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.json()).toEqual({ message: 'Unauthorized.' });
  });

  test('requires the token in production too', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_TOKEN = METRICS_TOKEN;
    expect((await server.request('GET', '/metrics')).status).toBe(401);
    const allowed = await server.request('GET', '/metrics', { headers: { authorization: `Bearer ${METRICS_TOKEN}` } });
    expect(allowed.status).toBe(200);
  });

  test('answers 200 with the right token', async () => {
    process.env.METRICS_TOKEN = METRICS_TOKEN;
    const response = await server.request('GET', '/metrics', {
      headers: { authorization: `bearer ${METRICS_TOKEN}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe(register.contentType);
    expect(response.text).toContain('http_request_duration_ms');
  });

  test('never logs the metrics token', async () => {
    process.env.METRICS_TOKEN = METRICS_TOKEN;
    await server.request('GET', '/metrics', { headers: { authorization: `Bearer ${METRICS_TOKEN}` } });
    await server.request('GET', '/metrics', { headers: { authorization: 'Bearer synthetic-wrong-token' } });
    expect(capturedLines.join('')).not.toContain(METRICS_TOKEN);
    expect(capturedLines.join('')).not.toContain('synthetic-wrong-token');
  });
});

describe('PLATFORM-016: /healthz and /readyz', () => {
  test('/healthz answers 200 without touching the database', async () => {
    const response = await server.request('GET', '/healthz');
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(db.calls).toHaveLength(0);
  });

  test('/readyz answers 200 when SELECT 1 succeeds', async () => {
    db.on(/^SELECT 1$/, () => ({ rows: [{ '?column?': 1 }] }));
    const response = await server.request('GET', '/readyz');
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(db.calls.map(({ sql }) => sql)).toEqual(['SELECT 1']);
  });

  test('/readyz answers 503 without details when the connection is refused', async () => {
    db.on(/^SELECT 1$/, () => {
      throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.9:5432 synthetic-db-host'), {
        code: 'ECONNREFUSED',
        syscall: 'connect',
      });
    });
    const response = await server.request('GET', '/readyz');
    expect(response.status).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.text).not.toContain('ECONNREFUSED');
    expect(capturedLines.join('')).toContain('Readiness check failed');
  });

  test('readyz answers 503 when the database hangs past the limit', async () => {
    expect(READINESS_TIMEOUT_MS).toBe(2000);
    jest.useFakeTimers();
    try {
      db.on(/^SELECT 1$/, () => new Promise(() => {}));
      const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      const pending = readyz({}, res);

      await jest.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS - 1);
      expect(res.body).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      await pending;

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('readyz clears its timer when the database answers', async () => {
    jest.useFakeTimers();
    try {
      db.on(/^SELECT 1$/, () => ({ rows: [] }));
      const res = { set() {}, status() { return this; }, json(body) { this.body = body; } };
      await readyz({}, res);
      expect(res.body).toEqual({ status: 'ok' });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('probes create no usage events, metric samples or request logs, even when signed in', async () => {
    db.on(/^SELECT 1$/, () => ({ rows: [] }));
    const signedIn = { headers: { cookie: sessionCookie(USER_UID) } };
    for (const path of ['/healthz', '/readyz', '/healthz', '/readyz']) {
      expect((await server.request('GET', path, signedIn)).status).toBe(200);
    }

    expect(db.callsMatching(/usage_events/)).toHaveLength(0);
    expect(await requestSeries()).toHaveLength(0);
    expect(capturedLines.join('')).not.toContain('request completed');

    // Control: an ordinary signed-in request is counted, logged and stored.
    await server.request('GET', '/api/users/synthetic-probe-user/synthetic', signedIn);
    expect(await requestSeries()).toHaveLength(1);
    expect(capturedLines.join('')).toContain('request completed');
    expect(db.callsMatching(/INSERT INTO usage_events/)).toHaveLength(1);
  });
});
