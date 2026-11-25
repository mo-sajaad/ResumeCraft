// IDENTITY-001 to 003 over HTTP: session cookie, names and reused emails.
// All credentials and personal data below are synthetic.
delete process.env.LOG_LEVEL;

const mockVerifyIdToken = jest.fn();

jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: (...args) => mockVerifyIdToken(...args) }),
}));
// The exchange limit (20 a minute) is shared by the whole file.
jest.mock('../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

const jwt = require('jsonwebtoken');
const { capturedLines } = require('pino');
const { createApp } = require('../app');
const db = require('../config/db');
const { startServer } = require('./support/adminHarness');
const { emailViolation, installUserStore, uniqueViolation } = require('./support/identityHarness');

const UID = 'synthetic-uid-one';
const NEW_UID = 'synthetic-uid-two';
const EMAIL = 'private.person@example.test';
const EXCHANGE = '/api/auth/exchange';

let store;
let server;

beforeAll(async () => {
  store = installUserStore(db);
  server = await startServer(createApp());
});

afterAll(() => server.close());

beforeEach(() => {
  store.reset();
  capturedLines.length = 0;
  signedInAs({ uid: UID, email: EMAIL });
});

function signedInAs(decodedToken) {
  mockVerifyIdToken.mockResolvedValue(decodedToken);
}

function exchange(body = {}) {
  return server.request('POST', EXCHANGE, {
    body: JSON.stringify({ firebaseToken: 'synthetic-id-token', ...body }),
  });
}

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

function cookiesOf(response) {
  return (response.headers['set-cookie'] || []).map(parseCookie);
}

function onlyCookie(response) {
  const cookies = cookiesOf(response);
  expect(cookies).toHaveLength(1);
  return cookies[0];
}

function getProfile(uid, cookie) {
  return server.request('GET', `/api/users/${uid}`, { headers: { cookie } });
}

function auditedActions() {
  return db.callsMatching(/INSERT INTO audit_logs/).map(({ params }) => params[2]);
}

async function withNodeEnv(value, run) {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return await run();
  } finally {
    process.env.NODE_ENV = original;
  }
}

function expectNoSession(response) {
  expect(cookiesOf(response)).toEqual([]);
  expect(auditedActions()).toEqual([]);
}

function expectPrivate409(response, values) {
  expect(response.status).toBe(409);
  const { message } = response.json();
  expect(message).toEqual(expect.any(String));
  expect(message).not.toBe('');
  expect(capturedLines.join('')).toContain('request completed');
  for (const value of values) {
    expect(response.text).not.toContain(value);
    expect(capturedLines.join('')).not.toContain(value);
  }
}

describe('IDENTITY-001: session cookie', () => {
  it.each([
    ['production', true],
    ['test', undefined],
  ])('exchange sets only __session with its security attributes (NODE_ENV=%s)', async (env, secure) => {
    const response = await withNodeEnv(env, () => exchange());

    expect(response.status).toBe(200);
    const cookie = onlyCookie(response);
    expect(cookie.name).toBe('__session');
    expect(cookie.attributes).toMatchObject({ httponly: true, samesite: 'Lax', path: '/' });
    expect(cookie.attributes.secure).toBe(secure);
    expect(cookie.attributes['max-age']).toBe(String(7 * 24 * 60 * 60));
    expect(cookie.attributes).not.toHaveProperty('domain');
    expect(jwt.verify(cookie.value, process.env.JWT_SECRET_KEY)).toMatchObject({ uid: UID, tokenVersion: 0 });
  });

  it.each([['production'], ['test']])('logout clears __session with matching options (NODE_ENV=%s)', async (env) => {
    const [signIn, signOut] = await withNodeEnv(env, async () => {
      const first = await exchange();
      const second = await server.request('POST', '/api/auth/logout', {
        headers: { cookie: onlyCookie(first).header },
      });
      return [first, second];
    });

    expect(signOut.status).toBe(204);
    const set = onlyCookie(signIn);
    const cleared = onlyCookie(signOut);
    expect(cleared.name).toBe('__session');
    expect(cleared.value).toBe('');
    expect(new Date(cleared.attributes.expires).getTime()).toBe(0);
    expect(cleared.attributes).not.toHaveProperty('max-age');
    // A browser replaces the cookie only if these agree.
    for (const name of ['path', 'domain', 'secure', 'httponly', 'samesite']) {
      expect([name, cleared.attributes[name]]).toEqual([name, set.attributes[name]]);
    }
  });

  it('accepts a session in __session', async () => {
    const { value } = onlyCookie(await exchange());

    const response = await getProfile(UID, `__session=${value}`);

    expect(response.status).toBe(200);
    expect(response.json().firebase_uid).toBe(UID);
  });

  it('answers 401 to a valid session sent only as rc_auth', async () => {
    const { value } = onlyCookie(await exchange());

    expect((await getProfile(UID, `rc_auth=${value}`)).status).toBe(401);
  });

  it('does not allow shared caches to store the exchange response', async () => {
    const response = await exchange();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control'] || '').not.toMatch(/public|s-maxage/i);
  });
});

describe('IDENTITY-002: fullName', () => {
  it.each([
    ['null', { fullName: null }],
    ['omitted', {}],
    ['empty', { fullName: '' }],
    ['blank', { fullName: '   ' }],
  ])('%s signs in a new user without a name', async (_label, body) => {
    const response = await exchange(body);

    expect(response.status).toBe(200);
    expect(onlyCookie(response).value).not.toBe('');
    expect(store.byUid(UID)).toMatchObject({ email: EMAIL, full_name: null });
  });

  it.each([
    ['null', { fullName: null }],
    ['omitted', {}],
    ['empty', { fullName: '' }],
    ['blank', { fullName: '   ' }],
  ])('%s keeps the stored name', async (_label, body) => {
    store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });

    const response = await exchange(body);

    expect(response.status).toBe(200);
    expect(store.byUid(UID).full_name).toBe('Stored Name');
  });

  it('uses the name in the Firebase token when fullName is null', async () => {
    signedInAs({ uid: UID, email: EMAIL, name: 'Token Name' });

    expect((await exchange({ fullName: null })).status).toBe(200);
    expect(store.byUid(UID).full_name).toBe('Token Name');
  });

  it('stores a given name', async () => {
    expect((await exchange({ fullName: 'Given Name' })).status).toBe(200);
    expect(store.byUid(UID).full_name).toBe('Given Name');
  });

  it.each([
    ['number', 7],
    ['boolean', true],
    ['object', { first: 'Given' }],
    ['array', ['Given']],
  ])('rejects a %s with 400', async (_label, fullName) => {
    const response = await exchange({ fullName });

    expect(response.status).toBe(400);
    expectNoSession(response);
    expect(store.rows()).toEqual([]);
  });
});

describe('IDENTITY-003: email held by another UID, not verified', () => {
  it.each([
    ['false', { email_verified: false }],
    ['missing', {}],
    ['the string "true"', { email_verified: 'true' }],
    ['1', { email_verified: 1 }],
    ['null', { email_verified: null }],
  ])('refuses with 409 when email_verified is %s', async (_label, claims) => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });
    signedInAs({ uid: NEW_UID, email: EMAIL, ...claims });

    const response = await exchange({ fullName: 'Other Person' });

    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(store.rows()).toEqual([holder]);
    // Linking would look up the holder or update the row.
    expect(db.callsMatching(/WHERE email/)).toEqual([]);
    expect(db.callsMatching(/UPDATE users/)).toEqual([]);
  });

  it('refuses an existing user who changes to a taken email', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    const before = store.rows();
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: false });

    const response = await exchange();

    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(store.rows()).toEqual(before);
  });
});

describe('IDENTITY-003: email held by another UID, verified', () => {
  it('links the existing account and issues a session for its new token version', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name', tokenVersion: 4 });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });

    const response = await exchange({ fullName: null });

    expect(response.status).toBe(200);
    expect(store.rows()).toEqual([{ ...holder, firebase_uid: NEW_UID, token_version: 5 }]);
    const cookie = onlyCookie(response);
    expect(jwt.verify(cookie.value, process.env.JWT_SECRET_KEY)).toMatchObject({ uid: NEW_UID, tokenVersion: 5 });
    expect(auditedActions()).toEqual(['auth.login']);
    expect((await getProfile(NEW_UID, cookie.header)).status).toBe(200);
  });

  it('does not end the new session on the next exchange', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });
    const first = onlyCookie(await exchange());

    expect((await exchange()).status).toBe(200);
    expect((await getProfile(NEW_UID, first.header)).status).toBe(200);
  });

  it('refuses with 409, and never merges, when the UID already has an account', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    const before = store.rows();
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });

    const response = await exchange();

    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(store.rows()).toEqual(before);
    expect(db.callsMatching(/UPDATE users/)).toEqual([]);
  });

  it('refuses with 409 when the link itself hits the email index', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });
    db.on(/INSERT INTO users/, () => { throw emailViolation(EMAIL); });

    const response = await exchange();

    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(store.rows()).toEqual([holder]);
  });

  it('ends the previous UID session, including after the account is linked back', async () => {
    const oldSession = onlyCookie(await exchange());
    expect((await getProfile(UID, oldSession.header)).status).toBe(200);

    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });
    const linked = await exchange();
    expect(linked.status).toBe(200);
    const newSession = onlyCookie(linked);
    expect((await getProfile(UID, oldSession.header)).status).toBe(401);

    signedInAs({ uid: UID, email: EMAIL, email_verified: true });
    expect((await exchange()).status).toBe(200);
    expect((await getProfile(UID, oldSession.header)).status).toBe(401);
    expect((await getProfile(NEW_UID, newSession.header)).status).toBe(401);
  });
});

describe('IDENTITY-003: other database errors stay 500', () => {
  it.each([
    ['the UID constraint', () => uniqueViolation('users_firebase_uid_key')],
    ['a 23505 without a constraint name', () => uniqueViolation(undefined)],
    ['an error that is not 23505', () => Object.assign(emailViolation(EMAIL), { code: '23514' })],
    ['a lost connection', () => Object.assign(new Error('synthetic failure'), { code: 'ECONNRESET' })],
  ])('%s, even with a verified email', async (_label, createError) => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });
    db.on(/INSERT INTO users/, () => { throw createError(); });

    const response = await exchange();

    expect(response.status).toBe(500);
    expectNoSession(response);
    expect(store.rows()).toEqual([holder]);
    expect(db.callsMatching(/INSERT INTO users/)).toHaveLength(1);
    expect(db.callsMatching(/WHERE email/)).toEqual([]);
  });

  it('answers 500 and undoes the link when a later step fails', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });
    db.on(/INSERT INTO subscriptions/, () => { throw uniqueViolation('subscriptions_synthetic_key'); });

    const response = await exchange();

    expect(response.status).toBe(500);
    expectNoSession(response);
    expect(db.callsMatching(/UPDATE users/)).toHaveLength(1);
    expect(store.rows()).toEqual([holder]);
  });
});
