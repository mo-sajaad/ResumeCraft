// PLATFORM-020: APP_BASE_URL is one origin, normalised with new URL().origin.
// A malformed value stops production and only warns elsewhere. Loopback only; database and Firebase are fakes.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({ auth: () => ({ verifyIdToken: jest.fn() }) }));

const { createApp } = require('../app');
const { startServer } = require('./support/adminHarness');

const saved = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  TRUST_PROXY: process.env.TRUST_PROXY,
};
const logLines = () => require('pino').capturedLines;
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function statusFor(appBaseUrl, origin) {
  process.env.APP_BASE_URL = appBaseUrl;
  const app = createApp();
  app.get('/__test/ok', (_req, res) => res.json({ ok: true }));
  const server = await startServer(app);
  try {
    return (await server.request('GET', '/__test/ok', { headers: { origin } })).status;
  } finally {
    await server.close();
  }
}

const MALFORMED = [
  ['not a URL', 'app.test'],
  ['a list', 'https://app.test, https://www.app.test'],
  ['an opaque origin', 'file:///tmp/app'],
];

describe('PLATFORM-020: allowed origins', () => {
  it.each([
    ['a trailing slash', 'https://app.test/', 'https://app.test'],
    ['a path', 'https://app.test/dashboard?x=1', 'https://app.test'],
    ['surrounding spaces', '  http://localhost:5173  ', 'http://localhost:5173'],
  ])('accepts the origin of a value with %s', async (_label, value, origin) => {
    expect(await statusFor(value, origin)).toBe(200);
  });

  it('still rejects a foreign origin with 403', async () => {
    expect(await statusFor('https://app.test/', 'https://evil.test')).toBe(403);
  });

  it.each(MALFORMED)('refuses to start in production when APP_BASE_URL is %s', (_label, value) => {
    process.env.NODE_ENV = 'production';
    process.env.APP_BASE_URL = value;
    process.env.TRUST_PROXY = '1';
    expect(() => createApp()).toThrow(/APP_BASE_URL is malformed/);
  });

  it.each(MALFORMED)('only warns outside production when APP_BASE_URL is %s, and refuses browser origins', async (_label, value) => {
    process.env.NODE_ENV = 'development';
    const before = logLines().length;
    expect(await statusFor(value, 'https://app.test')).toBe(403);
    const warnings = logLines().slice(before).filter((line) => line.includes('APP_BASE_URL is malformed'));
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0]).level).toBe(40);
    expect(await statusFor(value, 'https://www.app.test')).toBe(403);
  });
});
