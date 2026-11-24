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

  knownBug(
    'ADMIN-001: sign-in logs should not contain the session cookie but include Set-Cookie',
    async () => {
      const response = await server.request('POST', '/api/auth/exchange', {
        body: JSON.stringify({ firebaseToken: 'synthetic-body-token' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers['set-cookie']).toHaveLength(1);
      expect(logOutput()).toContain('request completed');
      return response.headers['set-cookie'][0].split(';')[0].replace('rc_auth=', '');
    },
    (sessionToken) => {
      expect(logOutput().includes(sessionToken)).toBe(false);
    }
  );

  knownBug(
    'ADMIN-001: logs should not contain a malformed request body but include its raw text',
    async () => {
      const response = await server.request('POST', '/api/auth/exchange', {
        body: '{"firebaseToken":"synthetic-malformed-token",',
      });
      expect(response.status).toBe(400);
      expect(logOutput()).toContain('Request failed');
    },
    () => {
      expect(logOutput()).not.toContain('synthetic-malformed-token');
    }
  );

  knownBug(
    'ADMIN-001: logs should not contain database error detail but include it',
    async () => {
      db.on(/FROM feature_flags/, () => {
        throw Object.assign(new Error('synthetic database failure'), {
          code: '23505',
          detail: 'Key (email)=(private.person@example.test) already exists.',
        });
      });
      const response = await server.request('GET', '/api/admin/feature-flags', asAdmin());
      expect(response.status).toBe(500);
      expect(logOutput()).toContain('Request failed');
    },
    () => {
      expect(logOutput()).not.toContain('private.person@example.test');
    }
  );
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

  knownBug(
    'ADMIN-002: unmatched paths should share one metric label but each adds its own',
    async () => {
      for (const path of ['/synthetic-one', '/synthetic-two', '/api/synthetic/three']) {
        const response = await server.request('GET', path);
        expect(response.status).toBe(404);
      }
      const labels = await routeLabels();
      expect(labels.length).toBeGreaterThan(0);
      return labels;
    },
    (labels) => {
      expect(new Set(labels).size).toBe(1);
      expect(labels.join()).not.toContain('synthetic');
    }
  );

  knownBug(
    'ADMIN-002: an early 401 should not put a Firebase UID in a metric label but does',
    async () => {
      const response = await server.request('GET', '/api/users/synthetic-firebase-uid');
      expect(response.status).toBe(401);
      expect(await routeLabels()).toHaveLength(1);
    },
    async () => {
      expect((await register.metrics()).includes('synthetic-firebase-uid')).toBe(false);
    }
  );

  knownBug(
    'ADMIN-002: an early 401 should not put a flag key in a metric label but does',
    async () => {
      const response = await server.request('PATCH', '/api/admin/feature-flags/synthetic-key', {
        body: JSON.stringify({ enabled: true }),
      });
      expect(response.status).toBe(401);
      expect(await routeLabels()).toHaveLength(1);
    },
    async () => {
      expect((await register.metrics()).includes('synthetic-key')).toBe(false);
    }
  );

  knownBug(
    'ADMIN-002: a failing route should keep its mount prefix in the label but loses it',
    async () => {
      db.on(/feature_flags/, () => { throw new Error('synthetic failure'); });
      const response = await server.request('PATCH', '/api/admin/feature-flags/demo', {
        ...asAdmin(),
        body: JSON.stringify({ enabled: true }),
      });
      expect(response.status).toBe(500);
      const labels = await routeLabels();
      expect(labels).toHaveLength(1);
      return labels;
    },
    (labels) => {
      expect(labels).toEqual(['/api/admin/feature-flags/:key']);
    }
  );

  knownBug(
    'ADMIN-002: a signed-in unmatched path should not be stored in usage_events but is',
    async () => {
      // Matches the users router, so the request is authenticated, but no route.
      const response = await server.request('GET', '/api/users/synthetic-uid/synthetic-path', asAdmin());
      expect(response.status).toBe(404);
      const inserts = db.callsMatching(/INSERT INTO usage_events/);
      expect(inserts).toHaveLength(1);
      return inserts[0].params;
    },
    (params) => {
      expect(params.join()).not.toContain('synthetic-path');
    }
  );
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
