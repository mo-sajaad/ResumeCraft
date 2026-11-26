// PLATFORM-017: TRUST_PROXY must be set, and valid, in production, so req.ip
// is the client and not the proxy. Requests go to loopback only; the database
// and Firebase are fakes. Every address below is synthetic.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({ auth: () => ({ verifyIdToken: jest.fn() }) }));

const { createApp } = require('../app');
const { startServer } = require('./support/adminHarness');

const ENV_NAMES = ['NODE_ENV', 'TRUST_PROXY'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
});

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setEnv({ NODE_ENV, TRUST_PROXY }) {
  process.env.NODE_ENV = NODE_ENV;
  if (TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = TRUST_PROXY;
}

// createApp with the given environment, plus a route that reports req.ip.
function appWith(env) {
  setEnv(env);
  const app = createApp();
  app.get('/__test/ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

async function ipSeenBy(app, headers = {}) {
  const server = await startServer(app);
  try {
    const response = await server.request('GET', '/__test/ip', { headers });
    expect(response.status).toBe(200);
    return response.json().ip;
  } finally {
    await server.close();
  }
}

describe('PLATFORM-017: TRUST_PROXY in production', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('refuses to start when it is %s', (_label, value) => {
    setEnv({ NODE_ENV: 'production', TRUST_PROXY: value });

    expect(() => createApp()).toThrow(/TRUST_PROXY is required when NODE_ENV=production/);
  });

  it.each([
    ['a word', 'not-a-proxy'],
    ['a bad address in a list', 'loopback, 999.1.1.1'],
    ['a negative count', '-1'],
    ['a fraction', '1.5'],
  ])('refuses to start when it is %s', (_label, value) => {
    setEnv({ NODE_ENV: 'production', TRUST_PROXY: value });

    expect(() => createApp()).toThrow(/TRUST_PROXY is malformed/);
  });

  it.each([
    ['2', 2],
    ['true', 1],
    ['false', false],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('accepts %s', (value, expected) => {
    setEnv({ NODE_ENV: 'production', TRUST_PROXY: value });

    expect(createApp().get('trust proxy')).toEqual(expected);
  });
});

describe('PLATFORM-017: TRUST_PROXY outside production', () => {
  it.each([['test'], ['development']])('defaults to false when unset (NODE_ENV=%s)', (nodeEnv) => {
    setEnv({ NODE_ENV: nodeEnv, TRUST_PROXY: undefined });

    expect(createApp().get('trust proxy')).toBe(false);
  });
});

describe('PLATFORM-017: req.ip', () => {
  const FORWARDED = { 'x-forwarded-for': '203.0.113.7, 198.51.100.20' };

  it('with 2 hops, is the client two entries back, not the proxy', async () => {
    const app = appWith({ NODE_ENV: 'production', TRUST_PROXY: '2' });

    expect(await ipSeenBy(app, FORWARDED)).toBe('203.0.113.7');
  });

  it('with 2 hops, ignores an entry the client added itself', async () => {
    const app = appWith({ NODE_ENV: 'production', TRUST_PROXY: '2' });

    const spoofed = { 'x-forwarded-for': '192.0.2.99, 203.0.113.7, 198.51.100.20' };
    expect(await ipSeenBy(app, spoofed)).toBe('203.0.113.7');
  });

  it('with a loopback list, is the nearest untrusted address', async () => {
    const app = appWith({ NODE_ENV: 'production', TRUST_PROXY: 'loopback, 10.0.0.0/8' });

    expect(await ipSeenBy(app, { 'x-forwarded-for': '203.0.113.7, 10.1.2.3' })).toBe('203.0.113.7');
  });

  it('when unset in test, is the socket address and ignores X-Forwarded-For', async () => {
    const app = appWith({ NODE_ENV: 'test', TRUST_PROXY: undefined });

    expect(await ipSeenBy(app, FORWARDED)).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
  });
});
