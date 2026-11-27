// PLATFORM-002 and ADMIN-004: what Sentry is started with, what an event keeps
// after scrubbing, and which errors are reported. @sentry/node is replaced by a
// fake, so nothing is sent; every credential below is synthetic.
delete process.env.LOG_LEVEL;
delete process.env.SENTRY_DSN;

const mockVerifyIdToken = jest.fn();
const mockReported = [];

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  close: jest.fn(async () => true),
  // Stands in for the v8 handler: report when shouldHandleError allows it,
  // then pass the error on like the real one does.
  setupExpressErrorHandler: jest.fn((app, options = {}) => {
    app.use((error, req, res, next) => {
      if (!options.shouldHandleError || options.shouldHandleError(error)) mockReported.push(error);
      next(error);
    });
  }),
}));
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

const Sentry = require('@sentry/node');
const { initSentry, scrubEvent } = require('../observability/sentry');
const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');

const JWT_COOKIE = '__session=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJzeW50aGV0aWMifQ.c3ludGhldGljLXNpZ25hdHVyZQ';
const BEARER = 'Bearer synthetic-bearer-token';
const SECRET_QUERY = 'token=synthetic-query-token&email=private.person%40example.test';

function syntheticEvent() {
  return {
    event_id: 'synthetic-event-id',
    level: 'error',
    transaction: 'GET /api/resumes/:id',
    tags: { route: '/api/resumes/:id' },
    exception: { values: [{ type: 'Error', value: 'synthetic failure' }] },
    request: {
      method: 'POST',
      url: `https://api.example.test/api/resumes/42?${SECRET_QUERY}#fragment`,
      query_string: SECRET_QUERY,
      cookies: { __session: JWT_COOKIE },
      data: '{"summary":"synthetic resume content"}',
      headers: {
        Authorization: BEARER,
        'proxy-authorization': 'Basic synthetic-proxy',
        Cookie: JWT_COOKIE,
        'Stripe-Signature': 't=1,v1=synthetic-signature',
        'X-API-Key': 'synthetic-api-key',
        'user-agent': 'synthetic-agent/1.0',
        'content-type': 'application/json',
      },
    },
    contexts: {
      response: {
        status_code: 500,
        headers: { 'set-cookie': `${JWT_COOKIE}; HttpOnly`, 'content-type': 'application/json' },
      },
      trace: {
        trace_id: 'synthetic-trace-id',
        span_id: 'synthetic-span-id',
        op: 'http.server',
        data: {
          'http.url': `https://api.example.test/api/resumes/42?${SECRET_QUERY}`,
          'url.full': `https://api.example.test/api/resumes/42?${SECRET_QUERY}`,
          'http.target': `/api/resumes/42?${SECRET_QUERY}`,
          'http.query': `?${SECRET_QUERY}`,
          'url.query': `?${SECRET_QUERY}`,
          'http.method': 'POST',
          'http.route': '/api/resumes/:id',
        },
      },
    },
    breadcrumbs: [
      {
        category: 'http',
        type: 'http',
        data: { url: `https://api.openai.test/v1/chat?${SECRET_QUERY}`, method: 'POST', status_code: 429 },
      },
      { category: 'console', message: 'synthetic breadcrumb message' },
    ],
    spans: [
      {
        op: 'http.client',
        description: 'POST https://api.openai.test/v1/chat',
        data: {
          url: `https://api.openai.test/v1/chat?${SECRET_QUERY}`,
          'http.query': SECRET_QUERY,
          query: SECRET_QUERY,
          'http.method': 'POST',
        },
      },
      { op: 'db', description: 'SELECT 1' },
    ],
  };
}

describe('scrubEvent', () => {
  test('removes cookies, credential headers, bodies and query strings everywhere', () => {
    const scrubbed = scrubEvent(syntheticEvent());
    const text = JSON.stringify(scrubbed);

    for (const secret of [
      'eyJhbGciOiJIUzI1NiJ9', 'synthetic-bearer-token', 'synthetic-proxy', 'synthetic-signature',
      'synthetic-api-key', 'synthetic-query-token', 'private.person', 'synthetic resume content', 'fragment',
    ]) {
      expect(text).not.toContain(secret);
    }

    expect(scrubbed.request).not.toHaveProperty('cookies');
    expect(scrubbed.request).not.toHaveProperty('data');
    expect(scrubbed.request).not.toHaveProperty('query_string');
    expect(scrubbed.contexts.response.headers).toEqual({ 'content-type': 'application/json' });
    expect(scrubbed.contexts.trace.data).not.toHaveProperty('http.query');
    expect(scrubbed.contexts.trace.data).not.toHaveProperty('url.query');
    expect(scrubbed.spans[0].data).not.toHaveProperty('http.query');
    expect(scrubbed.spans[0].data).not.toHaveProperty('query');
  });

  test('keeps what is needed to diagnose the error', () => {
    const scrubbed = scrubEvent(syntheticEvent());

    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://api.example.test/api/resumes/42',
      headers: { 'user-agent': 'synthetic-agent/1.0', 'content-type': 'application/json' },
    });
    expect(scrubbed.event_id).toBe('synthetic-event-id');
    expect(scrubbed.level).toBe('error');
    expect(scrubbed.transaction).toBe('GET /api/resumes/:id');
    expect(scrubbed.tags).toEqual({ route: '/api/resumes/:id' });
    expect(scrubbed.exception.values[0]).toEqual({ type: 'Error', value: 'synthetic failure' });
    expect(scrubbed.contexts.response.status_code).toBe(500);
    expect(scrubbed.contexts.trace).toMatchObject({
      trace_id: 'synthetic-trace-id',
      span_id: 'synthetic-span-id',
      op: 'http.server',
      data: {
        'http.url': 'https://api.example.test/api/resumes/42',
        'url.full': 'https://api.example.test/api/resumes/42',
        'http.target': '/api/resumes/42',
        'http.method': 'POST',
        'http.route': '/api/resumes/:id',
      },
    });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'http', type: 'http', data: { url: 'https://api.openai.test/v1/chat', method: 'POST', status_code: 429 } },
      { category: 'console', message: 'synthetic breadcrumb message' },
    ]);
    expect(scrubbed.spans).toEqual([
      {
        op: 'http.client',
        description: 'POST https://api.openai.test/v1/chat',
        data: { url: 'https://api.openai.test/v1/chat', 'http.method': 'POST' },
      },
      { op: 'db', description: 'SELECT 1' },
    ]);
  });

  test('accepts events without request, contexts, breadcrumbs or spans', () => {
    expect(scrubEvent({ message: 'synthetic' })).toEqual({ message: 'synthetic' });
    expect(scrubEvent({ request: { url: '/api/x' }, breadcrumbs: [{}], spans: [{ data: null }] }))
      .toEqual({ request: { url: '/api/x' }, breadcrumbs: [{}], spans: [{ data: null }] });
  });
});

describe('initSentry', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  test('does nothing without SENTRY_DSN', () => {
    expect(initSentry()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  test('starts with sendDefaultPii off and scrubbing on events and transactions', () => {
    process.env.SENTRY_DSN = 'https://synthetic-public-key@sentry.example.test/1';
    expect(initSentry()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);

    const options = Sentry.init.mock.calls[0][0];
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubEvent);
    expect(options).not.toHaveProperty('profilesSampleRate');

    const sent = options.beforeSend(syntheticEvent(), {});
    expect(JSON.stringify(sent)).not.toContain('synthetic-bearer-token');
    expect(JSON.stringify(options.beforeSendTransaction(syntheticEvent(), {}))).not.toContain('synthetic-query-token');
  });
});

describe('Express error reporting', () => {
  const ADMIN_UID = 'synthetic-sentry-admin';
  let server;
  let sentryOptions;

  beforeAll(async () => {
    process.env.ADMIN_FIREBASE_UIDS = ADMIN_UID;
    const app = createApp({ sentryEnabled: true });
    expect(Sentry.setupExpressErrorHandler).toHaveBeenCalledTimes(1);
    expect(Sentry.setupExpressErrorHandler.mock.calls[0][0]).toBe(app);
    sentryOptions = Sentry.setupExpressErrorHandler.mock.calls[0][1];
    server = await startServer(app);
  });

  afterAll(async () => {
    delete process.env.ADMIN_FIREBASE_UIDS;
    await server.close();
  });

  beforeEach(() => {
    mockReported.length = 0;
    db.reset();
    db.addUser({ id: 1, firebaseUid: ADMIN_UID });
  });

  const asAdmin = () => ({ headers: { cookie: sessionCookie(ADMIN_UID) } });

  test('is not set up when Sentry is disabled', () => {
    Sentry.setupExpressErrorHandler.mockClear();
    createApp();
    expect(Sentry.setupExpressErrorHandler).not.toHaveBeenCalled();
  });

  test('a 400 is not reported', async () => {
    const response = await server.request('POST', '/api/auth/exchange', { body: '{"firebaseToken":' });
    expect(response.status).toBe(400);
    expect(mockReported).toHaveLength(0);
  });

  test('a 500 is reported, and our handler still answers', async () => {
    db.on(/FROM feature_flags/, () => { throw new Error('synthetic database failure'); });
    const response = await server.request('GET', '/api/admin/feature-flags', asAdmin());
    expect(response.status).toBe(500);
    expect(response.json().message).toBe('Internal server error');
    expect(mockReported).toHaveLength(1);
    expect(mockReported[0].message).toBe('synthetic database failure');
  });

  test('a provider error answered as 502 is reported', async () => {
    db.on(/FROM feature_flags/, () => {
      throw Object.assign(new TypeError('synthetic provider failure'), { statusCode: 402 });
    });
    const response = await server.request('GET', '/api/admin/feature-flags', asAdmin());
    expect(response.status).toBe(502);
    expect(mockReported).toHaveLength(1);
  });

  test('shouldHandleError follows the status the client gets', () => {
    const { shouldHandleError } = sentryOptions;
    expect(shouldHandleError(Object.assign(new Error('x'), { statusCode: 400 }))).toBe(false);
    expect(shouldHandleError(Object.assign(new Error('x'), { statusCode: 404 }))).toBe(false);
    expect(shouldHandleError(Object.assign(new SyntaxError('x'), { status: 400, expose: true }))).toBe(false);
    expect(shouldHandleError(new Error('x'))).toBe(true);
    expect(shouldHandleError(Object.assign(new Error('x'), { statusCode: 503 }))).toBe(true);
    expect(shouldHandleError(Object.assign(new TypeError('x'), { status: 401 }))).toBe(true);
  });
});
