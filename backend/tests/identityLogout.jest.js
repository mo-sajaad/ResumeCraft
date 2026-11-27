// IDENTITY-012 over HTTP: POST /api/auth/logout clears the session cookie for
// any session, valid or not, and still revokes a valid one. Protected routes
// keep answering 401 to the same bad sessions. Uses the fake database; all
// credentials and personal data below are synthetic.
delete process.env.LOG_LEVEL;

const mockVerifyIdToken = jest.fn();

jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: (...args) => mockVerifyIdToken(...args) }),
}));
jest.mock('../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const db = require('../config/db');
const { knownBug, startServer } = require('./support/adminHarness');
const { installUserStore } = require('./support/identityHarness');

const UID = 'synthetic-logout-uid';
const OTHER_UID = 'synthetic-unknown-uid';
const EMAIL = 'logout.person@example.test';
const LOGOUT = '/api/auth/logout';

let store;
let server;

beforeAll(async () => {
  store = installUserStore(db);
  server = await startServer(createApp());
});

afterAll(() => server.close());

beforeEach(() => {
  store.reset();
  mockVerifyIdToken.mockResolvedValue({ uid: UID, email: EMAIL, email_verified: true });
});

function parseCookie(header) {
  const [pair, ...attributes] = header.split('; ');
  const [name, value] = pair.split('=');
  return {
    name,
    value,
    header: pair,
    attributes: Object.fromEntries(attributes.map((attribute) => {
      const [key, attributeValue = true] = attribute.split('=');
      return [key.toLowerCase(), attributeValue];
    })),
  };
}

const cookiesOf = (response) => (response.headers['set-cookie'] || []).map(parseCookie);

async function signIn() {
  const response = await server.request('POST', '/api/auth/exchange', {
    body: JSON.stringify({ firebaseToken: 'synthetic-id-token' }),
  });
  expect(response.status).toBe(200);
  const [cookie] = cookiesOf(response);
  return cookie.header;
}

const sign = (payload, options) => `__session=${jwt.sign(payload, process.env.JWT_SECRET_KEY, options)}`;

const logout = (cookie) => server.request('POST', LOGOUT, { headers: cookie ? { cookie } : {} });
const getProfile = (cookie) => server.request('GET', `/api/users/${UID}`, { headers: cookie ? { cookie } : {} });
const revokeAll = (cookie) => server.request('POST', '/api/auth/sessions/revoke', { headers: cookie ? { cookie } : {} });

const tokenVersionUpdates = () => db.callsMatching(/^\s*UPDATE users\b/);
const auditedActions = () => db.callsMatching(/INSERT INTO audit_logs/).map(({ params }) => params[2]);

function expectClearedCookie(response) {
  const cookies = cookiesOf(response);
  expect(cookies).toHaveLength(1);
  const [cleared] = cookies;
  expect(cleared.name).toBe('__session');
  expect(cleared.value).toBe('');
  expect(new Date(cleared.attributes.expires).getTime()).toBe(0);
  expect(cleared.attributes).toMatchObject({ httponly: true, path: '/' });
}

// The bad sessions, each built once a user with token_version 1 exists.
const BAD_SESSIONS = [
  ['no cookie', () => null],
  ['a garbage cookie', () => '__session=not-a-jwt'],
  ['a cookie signed with another secret', () => `__session=${jwt.sign({ uid: UID, tokenVersion: 1 }, 'synthetic-wrong-secret')}`],
  ['an expired session', () => sign({ uid: UID, tokenVersion: 1 }, { expiresIn: -10 })],
  ['a session without a uid', () => sign({ tokenVersion: 1 })],
  ['a session of an unknown user', () => sign({ uid: OTHER_UID, tokenVersion: 0 })],
  ['a revoked session', () => sign({ uid: UID, tokenVersion: 0 })],
];

describe('IDENTITY-012: logout of a bad session', () => {
  beforeEach(() => {
    store.add({ firebaseUid: UID, email: EMAIL, tokenVersion: 1 });
  });

  it.each(BAD_SESSIONS)('answers 204 and clears the cookie for %s, without revoking anything', async (_label, cookieOf) => {
    db.calls.length = 0;

    const response = await logout(cookieOf());

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectClearedCookie(response);
    expect(tokenVersionUpdates()).toEqual([]);
    expect(auditedActions()).toEqual([]);
    expect(store.byUid(UID).token_version).toBe(1);
  });

  // authenticateJWT is unchanged: the same sessions are still refused elsewhere.
  it.each([
    ['no cookie', 'Authorization token missing.'],
    ['a garbage cookie', 'Invalid or expired token.'],
    ['a cookie signed with another secret', 'Invalid or expired token.'],
    ['an expired session', 'Invalid or expired token.'],
    ['a session without a uid', 'Invalid token payload.'],
    ['a session of an unknown user', 'User not found for provided token.'],
    ['a revoked session', 'Session has been revoked. Please sign in again.'],
  ])('still answers 401 on protected routes to %s', async (label, message) => {
    const [, cookieOf] = BAD_SESSIONS.find(([name]) => name === label);
    const cookie = cookieOf();

    for (const response of [await getProfile(cookie), await revokeAll(cookie)]) {
      expect(response.status).toBe(401);
      expect(response.json()).toEqual({ message });
      expect(cookiesOf(response)).toEqual([]);
    }
    expect(store.byUid(UID).token_version).toBe(1);
  });
});

describe('IDENTITY-012: logout of a valid session', () => {
  it('answers 204, clears the cookie, bumps token_version and records it', async () => {
    const cookie = await signIn();
    const user = store.byUid(UID);
    expect(user.token_version).toBe(0);
    db.calls.length = 0;

    const response = await logout(cookie);

    expect(response.status).toBe(204);
    expectClearedCookie(response);
    expect(store.byUid(UID).token_version).toBe(1);
    expect(tokenVersionUpdates()).toHaveLength(1);
    expect(tokenVersionUpdates()[0].params).toEqual([UID]);
    const audits = db.callsMatching(/INSERT INTO audit_logs/);
    expect(audits).toHaveLength(1);
    expect(audits[0].params.slice(0, 3)).toEqual([user.id, UID, 'auth.logout']);
    // The ended session no longer works.
    expect((await getProfile(cookie)).status).toBe(401);
  });

  it('only revokes once when the same cookie logs out twice', async () => {
    const cookie = await signIn();

    expect((await logout(cookie)).status).toBe(204);
    const second = await logout(cookie);

    expect(second.status).toBe(204);
    expectClearedCookie(second);
    expect(store.byUid(UID).token_version).toBe(1);
  });

  it('answers 500 and still clears the cookie when the token_version update fails', async () => {
    const cookie = await signIn();
    db.on(/^\s*UPDATE users\b/, () => { throw new Error('synthetic database outage'); });
    db.calls.length = 0;

    const response = await logout(cookie);

    expect(response.status).toBe(500);
    expect(response.json().message).toBe('Internal server error');
    expectClearedCookie(response);
    expect(auditedActions()).toEqual([]);
    expect(store.byUid(UID).token_version).toBe(0);
  });
});

// Remaining gap noted in IDENTITY-012: a failure of the session lookup is a
// server error before the controller runs, so the cookie is not cleared.
describe('IDENTITY-012: remaining gap', () => {
  knownBug(
    'IDENTITY-012 remaining: a failed session lookup leaves the cookie in place',
    async () => {
      const cookie = await signIn();
      db.on(/FROM users WHERE firebase_uid/, () => { throw new Error('synthetic database outage'); });
      const response = await logout(cookie);
      expect(response.status).toBe(500);
      return response;
    },
    (response) => {
      expectClearedCookie(response);
    },
  );
});
