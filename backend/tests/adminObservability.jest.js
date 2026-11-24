// ADMIN-014, priority 1: log contents, metric labels and the latency histogram.
// All credentials and personal data below are synthetic.
delete process.env.LOG_LEVEL;

const mockVerifyIdToken = jest.fn();

jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: (...args) => mockVerifyIdToken(...args) }),
}));
jest.mock('../services/userService', () => ({
  findOrCreateUser: async () => ({ id: 1 }),
  getUserByFirebaseUid: async () => ({ id: 1, token_version: 0 }),
  incrementTokenVersion: async () => 1,
}));

const { EventEmitter } = require('node:events');
const { capturedLines } = require('pino');
const { createApp } = require('../app');
const db = require('../config/db');
const logger = require('../observability/logger');
const { metricsMiddleware, register } = require('../observability/metrics');
const { knownBug, sessionCookie, startServer } = require('./support/adminHarness');

const ADMIN_UID = 'synthetic-admin';
const originalAdmins = process.env.ADMIN_FIREBASE_UIDS;
let server;

beforeAll(async () => {
  process.env.ADMIN_FIREBASE_UIDS = ADMIN_UID;
  server = await startServer(createApp());
});

afterAll(async () => {
  if (originalAdmins === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
  else process.env.ADMIN_FIREBASE_UIDS = originalAdmins;
  await server.close();
});

beforeEach(() => {
  db.reset();
  db.addUser({ id: 1, firebaseUid: ADMIN_UID });
  capturedLines.length = 0;
  register.resetMetrics();
  mockVerifyIdToken.mockResolvedValue({ uid: ADMIN_UID, email: 'admin@example.test' });
});

const asAdmin = () => ({ headers: { cookie: sessionCookie(ADMIN_UID) } });
const logOutput = () => capturedLines.join('');

async function routeLabels() {
  const { values } = await register.getSingleMetric('http_requests_total').get();
  return values.map(({ labels }) => labels.route);
}

describe('logger output', () => {
  it('redacts request credentials', async () => {
    const cookie = sessionCookie(ADMIN_UID);
    const response = await server.request('GET', '/api/admin/feature-flags', {
      headers: { cookie, authorization: 'Basic synthetic-authorization-value' },
    });

    expect(response.status).toBe(200);
    expect(logOutput()).toContain('request completed');
    expect(logOutput()).toContain('[REDACTED]');
    expect(logOutput()).not.toContain(cookie);
    expect(logOutput()).not.toContain('synthetic-authorization-value');
  });

  it('does not contain a well-formed request body', async () => {
    const response = await server.request('POST', '/api/auth/exchange', {
      body: JSON.stringify({ firebaseToken: 'synthetic-body-token' }),
    });

    expect(response.status).toBe(200);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('synthetic-body-token');
    expect(logOutput()).toContain('request completed');
    expect(logOutput()).not.toContain('synthetic-body-token');
  });

  it('sign-in logs should not contain the session cookie', async () => {
    const response = await server.request('POST', '/api/auth/exchange', {
      body: JSON.stringify({ firebaseToken: 'synthetic-body-token' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toHaveLength(1);
    expect(logOutput()).toContain('request completed');
    const sessionToken = response.headers['set-cookie'][0].split(';')[0].replace('rc_auth=', '');

    expect(logOutput().includes(sessionToken)).toBe(false);
  });

  it('logs should not contain a malformed request body', async () => {
    const response = await server.request('POST', '/api/auth/exchange', {
      body: '{"firebaseToken":"synthetic-malformed-token",',
    });
    expect(response.status).toBe(400);
    expect(logOutput()).toContain('Request failed');

    expect(logOutput()).not.toContain('synthetic-malformed-token');
  });

  it('logs should not contain database error detail', async () => {
    db.on(/FROM feature_flags/, () => {
      throw Object.assign(new Error('synthetic database failure'), {
        code: '23505',
        detail: 'Key (email)=(private.person@example.test) already exists.',
      });
    });
    const response = await server.request('GET', '/api/admin/feature-flags', asAdmin());
    expect(response.status).toBe(500);
    expect(logOutput()).toContain('Request failed');

    expect(logOutput()).not.toContain('private.person@example.test');
  });

  it('keeps useful error fields but no values, at any depth of nested errors', async () => {
    db.on(/FROM feature_flags/, () => {
      const inner = Object.assign(new Error('synthetic-cause-message'), { detail: 'synthetic-cause-detail' });
      const listed = new AggregateError(
        [Object.assign(new Error('synthetic-listed-message'), { body: 'synthetic-listed-body' })],
        'synthetic-aggregate-message',
        { cause: inner }
      );
      const error = new Error('synthetic-outer-message\nsecond line', { cause: listed });
      throw Object.assign(error, {
        code: '22P02',
        constraint: 'users_email_key',
        hint: 'synthetic-hint',
        where: 'synthetic-where',
        parameters: ['synthetic-parameter'],
      });
    });
    const response = await server.request('GET', '/api/admin/feature-flags', asAdmin());

    expect(response.status).toBe(500);
    const failed = capturedLines.map((line) => JSON.parse(line)).find(({ msg }) => msg === 'Request failed');
    expect(failed).toMatchObject({
      method: 'GET',
      route: '/api/admin/feature-flags',
      statusCode: 500,
      err: {
        type: 'Error',
        code: '22P02',
        constraint: 'users_email_key',
        cause: { type: 'AggregateError', cause: { type: 'Error' }, errors: [{ type: 'Error' }] },
      },
    });
    expect(failed.err.stack).toContain('adminObservability.jest.js');
    expect(logOutput()).not.toMatch(/synthetic-(?!admin)/);
    expect(logOutput()).not.toContain('second line');
  });

  it('does not contain URLs, forwarded addresses, signatures or path identifiers', async () => {
    await server.request('GET', '/api/users/synthetic-uid?code=synthetic-query', {
      headers: { 'x-forwarded-for': '203.0.113.7', 'stripe-signature': 'synthetic-signature' },
    });
    await server.request('GET', '/api/users/%E0%A4%synthetic-undecodable', asAdmin());
    await server.request('GET', '/synthetic-unmatched');

    expect(logOutput().match(/request completed/g)).toHaveLength(3);
    expect(logOutput()).toContain('"route":"/api/users/*"');
    expect(logOutput()).not.toContain('203.0.113.7');
    expect(logOutput()).not.toMatch(/synthetic-(?!admin)/);
  });

  it('sanitizes direct logger calls', () => {
    const error = Object.assign(new Error('synthetic-message'), { detail: 'synthetic-detail' });

    logger.info({ firebaseToken: 'synthetic-a', a: { b: { token: 'synthetic-b' } }, list: [{ apiKey: 'synthetic-c' }] });
    logger.warn({ errorMessage: 'synthetic-provider', errorCode: 'rate_limit', httpStatus: 429 }, 'AI failed');
    logger.error(error);
    logger.error({ err: error });
    logger.error({ error, nested: { error } }, 'failed: %s %o', error, { password: 'synthetic-d' });
    logger.child({ firebaseToken: 'synthetic-e' }).info('child');

    expect(capturedLines).toHaveLength(6);
    expect(logOutput()).not.toContain('synthetic');
    expect(JSON.parse(capturedLines[1])).toMatchObject({ errorCode: 'rate_limit', httpStatus: 429, msg: 'AI failed' });
    expect(JSON.parse(capturedLines[2]).err.stack).toContain('adminObservability.jest.js');
  });
});

describe('route labels', () => {
  it('uses the mounted route pattern for a matched request', async () => {
    const response = await server.request('PATCH', '/api/admin/feature-flags/not-a-label', {
      ...asAdmin(),
      body: JSON.stringify({ enabled: 'invalid' }),
    });
    const listed = await server.request('GET', '/api/admin/feature-flags', asAdmin());

    expect(response.status).toBe(400);
    expect(listed.status).toBe(200);
    const labels = await routeLabels();
    expect(labels).toContain('/api/admin/feature-flags');
    expect(labels.join()).not.toContain('not-a-label');
  });

  it('unmatched paths should share one metric label', async () => {
    for (const path of ['/synthetic-one', '/synthetic-two', '/api/synthetic/three']) {
      const response = await server.request('GET', path);
      expect(response.status).toBe(404);
    }
    const labels = await routeLabels();
    expect(labels.length).toBeGreaterThan(0);

    expect(new Set(labels).size).toBe(1);
    expect(labels.join()).not.toContain('synthetic');
  });

  it('an early 401 should not put a Firebase UID in a metric label', async () => {
    const response = await server.request('GET', '/api/users/synthetic-firebase-uid');
    expect(response.status).toBe(401);
    expect(await routeLabels()).toHaveLength(1);

    expect((await register.metrics()).includes('synthetic-firebase-uid')).toBe(false);
  });

  it('an early 401 should not put a flag key in a metric label', async () => {
    const response = await server.request('PATCH', '/api/admin/feature-flags/synthetic-key', {
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(401);
    expect(await routeLabels()).toHaveLength(1);

    expect((await register.metrics()).includes('synthetic-key')).toBe(false);
  });

  it('a failing route should keep its mount prefix in the label', async () => {
    db.on(/feature_flags/, () => { throw new Error('synthetic failure'); });
    const response = await server.request('PATCH', '/api/admin/feature-flags/demo', {
      ...asAdmin(),
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(500);
    const labels = await routeLabels();
    expect(labels).toHaveLength(1);

    expect(labels).toEqual(['/api/admin/feature-flags/:key']);
  });

  it('a signed-in unmatched path should not be stored in usage_events', async () => {
    // Matches the users router, so the request is authenticated, but no route.
    const response = await server.request('GET', '/api/users/synthetic-uid/synthetic-path', asAdmin());
    expect(response.status).toBe(404);
    const inserts = db.callsMatching(/INSERT INTO usage_events/);
    expect(inserts).toHaveLength(1);
    const params = inserts[0].params;

    expect(params.join()).not.toContain('synthetic-path');
  });
});

describe('bounded labels', () => {
  it('keeps the label count constant under a flood of unmatched paths', async () => {
    const series = () => register.metrics().then((text) => text.split('\n').filter((line) => /^http_/.test(line)).length);
    const flood = async (prefix) => {
      for (let i = 0; i < 100; i += 1) {
        await server.request('GET', `/${prefix}-${i}`);
        await server.request('GET', `/api/users/${prefix}-${i}`);
        await server.request('PATCH', `/api/${prefix}/${i}`);
      }
    };

    await flood('first');
    const before = await series();
    await flood('second');

    expect(await series()).toBe(before);
    expect(new Set(await routeLabels())).toEqual(new Set(['unmatched', '/api/users/*']));
  });

  it('ignores the letter case of the mount path', async () => {
    await server.request('GET', '/API/Admin/feature-flags', asAdmin());
    await server.request('GET', '/aPi/uSers/uid');

    expect(await routeLabels()).toEqual(['/api/admin/feature-flags', '/api/users/*']);
  });

  it('keeps the mount prefix when router middleware fails before a route matches', async () => {
    const response = await server.request('GET', '/api/users/synthetic-uid', {
      headers: { cookie: 'rc_auth=%' }, // Rejects in authenticateJWT (IDENTITY-018).
    });

    expect(response.status).toBe(500);
    expect(await routeLabels()).toEqual(['/api/users/*']);
  });

  it('labels body-parser, parameter and webhook failures', async () => {
    const malformed = { body: '{' };
    await server.request('POST', '/synthetic', malformed);
    await server.request('POST', '/api/synthetic', malformed);
    await server.request('GET', '/api/resumes/%E0%A4%A', asAdmin());
    await server.request('POST', '/api/stripe/webhook', malformed);

    expect(await routeLabels()).toEqual(['unmatched', '/api/*', '/api/resumes/*', '/api/stripe/webhook']);
  });
});

describe('latency histogram', () => {
  knownBug(
    'ADMIN-003: a 1500 ms request should be recorded in the unit of the metric but is recorded in seconds',
    async () => {
      jest.useFakeTimers();
      try {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        const next = jest.fn();
        metricsMiddleware({ method: 'GET', path: '/timed', baseUrl: '', route: { path: '/timed' } }, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1500);
        res.emit('finish');
      } finally {
        jest.useRealTimers();
      }

      // Either fix in the audit is accepted: milliseconds, or a renamed metric.
      const metric = register.getSingleMetric('http_request_duration_ms')
        || register.getSingleMetric('http_request_duration_seconds');
      const { name, values } = await metric.get();
      const valueOf = (suffix) => values.find(({ metricName }) => metricName === `${name}_${suffix}`)?.value;
      expect(valueOf('count')).toBe(1);
      return { name, sum: valueOf('sum'), values };
    },
    ({ name, sum, values }) => {
      const expected = name.endsWith('_seconds') ? 1.5 : 1500;
      expect(sum).toBeCloseTo(expected, 3);
      const firstBucket = values.find(({ labels, value }) => labels.le !== undefined && value === 1);
      expect(firstBucket.labels.le).toBeGreaterThanOrEqual(expected);
    }
  );
});
