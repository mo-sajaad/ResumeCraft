// IDENTITY-001 to 003 and 005 to 007 over HTTP: session cookie, names, reused
// emails, unverified emails, revocation, and server failures versus bad tokens.
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
const ID_TOKEN = 'synthetic-id-token';

// Everything that does not prove the email was verified.
const UNVERIFIED = [
  ['false', { email_verified: false }],
  ['missing', {}],
  ['the string "true"', { email_verified: 'true' }],
  ['1', { email_verified: 1 }],
  ['null', { email_verified: null }],
];

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
  signedInAs({ uid: UID, email: EMAIL, email_verified: true });
});

function signedInAs(decodedToken) {
  mockVerifyIdToken.mockResolvedValue(decodedToken);
}

function exchange(body = {}) {
  return server.request('POST', EXCHANGE, {
    body: JSON.stringify({ firebaseToken: ID_TOKEN, ...body }),
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

// IDENTITY-006: refused before any account lookup, with nothing written.
function expectUnverifiedRefusal(response, values) {
  expect(response.status).toBe(403);
  expect(response.json()).toEqual({
    code: 'EMAIL_NOT_VERIFIED',
    message: 'Verify your email address to continue.',
  });
  expectNoSession(response);
  expect(store.connected).toBe(0);
  expect(store.commands).toEqual([]);
  // Rate limiting and metrics do not use the database, so nothing else may either.
  expect(db.calls).toEqual([]);
  expect(capturedLines.join('')).toContain('request completed');
  for (const value of values) expect(capturedLines.join('')).not.toContain(value);
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
    expect(cookie.attributes['max-age']).toBe(String(24 * 60 * 60));
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
    signedInAs({ uid: UID, email: EMAIL, email_verified: true, name: 'Token Name' });

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
  it.each(UNVERIFIED)('refuses with 403 when email_verified is %s', async (_label, claims) => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });
    signedInAs({ uid: NEW_UID, email: EMAIL, ...claims });

    const response = await exchange({ fullName: 'Other Person' });

    expectUnverifiedRefusal(response, [EMAIL, UID, NEW_UID, ID_TOKEN, 'Other Person']);
    expect(store.rows()).toEqual([holder]);
  });

  it('refuses an existing user who changes to a taken email', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    const before = store.rows();
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: false });

    const response = await exchange();

    expectUnverifiedRefusal(response, [EMAIL, UID, NEW_UID, ID_TOKEN]);
    expect(store.rows()).toEqual(before);
  });

  // The 006 gate makes this branch unreachable with an ordinary token, so the
  // claim changes after the gate reads it. Guards the linking step on its own.
  it.each(UNVERIFIED)('does not link past the gate when email_verified is %s', async (_label, claims) => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });
    let reads = 0;
    signedInAs({
      uid: NEW_UID,
      email: EMAIL,
      get email_verified() {
        reads += 1;
        return reads === 1 ? true : claims.email_verified;
      },
    });

    const response = await exchange({ fullName: 'Other Person' });

    expect(reads).toBeGreaterThan(1);
    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(store.rows()).toEqual([holder]);
    expect(db.callsMatching(/WHERE email/)).toEqual([]);
    expect(db.callsMatching(/UPDATE users/)).toEqual([]);
  });
});

describe('IDENTITY-006: unverified email', () => {
  const cases = ['password', 'google.com', 'custom', undefined].flatMap((provider) => (
    ['free', 'held'].flatMap((email) => (
      UNVERIFIED.map(([label, claims]) => [label, provider || 'missing', email, provider, claims])
    ))
  ));

  it.each(cases)('is refused: email_verified %s, provider %s, email %s', async (_l, _p, email, provider, claims) => {
    if (email === 'held') store.add({ firebaseUid: UID, email: EMAIL });
    const before = store.rows();
    signedInAs({
      uid: NEW_UID,
      email: EMAIL,
      ...(provider && { firebase: { sign_in_provider: provider } }),
      ...claims,
    });

    const response = await exchange({ fullName: 'Other Person' });

    expectUnverifiedRefusal(response, [EMAIL, NEW_UID, ID_TOKEN, 'Other Person']);
    expect(store.rows()).toEqual(before);
  });

  it('gets an identical response whether or not the email is taken', async () => {
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: false });
    const free = await exchange();
    store.add({ firebaseUid: UID, email: EMAIL });
    const held = await exchange();

    // Headers that differ between any two requests.
    const comparable = ({ status, text, headers }) => {
      const rest = { ...headers };
      for (const name of ['date', 'x-request-id', 'x-response-time']) delete rest[name];
      return { status, text, headers: rest };
    };
    expect(free.status).toBe(403);
    expect(comparable(held)).toEqual(comparable(free));
  });

  it('creates the account once the same UID has verified', async () => {
    signedInAs({ uid: UID, email: EMAIL, email_verified: false });
    expect((await exchange({ fullName: 'Given Name' })).status).toBe(403);

    signedInAs({ uid: UID, email: EMAIL, email_verified: true });
    const response = await exchange({ fullName: 'Given Name' });

    expect(response.status).toBe(200);
    expect(store.rows()).toEqual([expect.objectContaining({ firebase_uid: UID, full_name: 'Given Name' })]);
    expect((await getProfile(UID, onlyCookie(response).header)).status).toBe(200);
  });

  it('links a held email once the same UID has verified', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: false });
    expect((await exchange()).status).toBe(403);
    expect(store.rows()).toEqual([holder]);

    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });

    expect((await exchange()).status).toBe(200);
    expect(store.rows()).toEqual([{ ...holder, firebase_uid: NEW_UID, token_version: 1 }]);
  });

  it('does not renew the session of a user whose email becomes unverified, and changes nothing', async () => {
    expect((await exchange({ fullName: 'Stored Name' })).status).toBe(200);
    const before = store.rows();
    db.calls.length = 0;
    store.commands.length = 0;
    store.connected = 0;
    signedInAs({ uid: UID, email: 'changed.person@example.test', email_verified: false });

    const response = await exchange({ fullName: 'Changed Name' });

    expectUnverifiedRefusal(response, [EMAIL, 'changed.person@example.test', UID, ID_TOKEN]);
    expect(store.rows()).toEqual(before);
  });

  // Not the required behavior: IDENTITY-005 keeps issued cookies valid.
  it('KNOWN BUG IDENTITY-005: the cookie issued before the email became unverified still works', async () => {
    const { header } = onlyCookie(await exchange());
    signedInAs({ uid: UID, email: 'changed.person@example.test', email_verified: false });
    expect((await exchange()).status).toBe(403);

    const response = await getProfile(UID, header);

    expect(response.status).toBe(200);
    expect(response.json().email).toBe(EMAIL);
  });

  it.each([
    ['uid', { email: EMAIL }],
    ['email', { uid: UID }],
  ])('a token without %s is still 400 first', async (_label, claims) => {
    signedInAs({ ...claims, email_verified: false });

    const response = await exchange();

    expect(response.status).toBe(400);
    expect(response.json()).toEqual({ message: 'Firebase token must include uid and email' });
    expectNoSession(response);
    expect(db.calls).toEqual([]);
  });

  // auth/argument-error is a bad token only with one of the SDK's bad-token
  // messages; IDENTITY-007 covers the other messages.
  it.each([
    ['auth/id-token-expired', 'synthetic'],
    ['auth/argument-error', 'Synthetic. See https://firebase.google.com/docs/auth/admin/verify-id-tokens for details.'],
  ])('a token refused with %s is still 401', async (code, message) => {
    mockVerifyIdToken.mockRejectedValue(Object.assign(new Error(message), { code }));

    const response = await exchange();

    expect(response.status).toBe(401);
    expect(response.json()).toEqual({ message: 'Invalid Firebase token' });
    expectNoSession(response);
    expect(db.calls).toEqual([]);
  });

  it('leaves the verified 409 without a code, or advice to verify or use Google', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    signedInAs({ uid: NEW_UID, email: EMAIL, email_verified: true });

    const response = await exchange();

    expectPrivate409(response, [EMAIL, UID, NEW_UID]);
    expectNoSession(response);
    expect(Object.keys(response.json())).toEqual(['message']);
    expect(response.json().message).not.toMatch(/verif|google/i);
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

describe('IDENTITY-005: revoked accounts and session revocation', () => {
  const REVOKE = '/api/auth/sessions/revoke';
  const REVOKED_MESSAGE =
    'This sign-in is no longer valid because the account was signed out, disabled or deleted. Sign in again.';
  const sdkError = (code) => Object.assign(new Error('synthetic sdk failure'), { code });

  function revoke(cookie) {
    return server.request('POST', REVOKE, cookie === undefined ? {} : { headers: { cookie } });
  }

  it('asks Firebase to check revocation on every exchange', async () => {
    expect((await exchange()).status).toBe(200);

    expect(mockVerifyIdToken.mock.calls).toEqual([[ID_TOKEN, true]]);
  });

  it.each([['auth/id-token-revoked'], ['auth/user-disabled'], ['auth/user-not-found']])(
    'answers 401 to %s with no cookie, no audit log and no database use',
    async (code) => {
      store.add({ firebaseUid: UID, email: EMAIL });
      mockVerifyIdToken.mockRejectedValue(sdkError(code));

      const response = await exchange();

      expect(response.status).toBe(401);
      expect(response.json()).toEqual({ message: REVOKED_MESSAGE });
      expectNoSession(response);
      expect(db.calls).toEqual([]);
    }
  );

  it.each([['auth/insufficient-permission'], ['auth/internal-error'], [undefined]])(
    'passes other SDK failures (%s) to the error handler instead of answering 401',
    async (code) => {
      mockVerifyIdToken.mockRejectedValue(sdkError(code));

      const response = await exchange();

      expect(response.status).toBe(500);
      expect(response.json().message).toBe('Internal server error');
      expectNoSession(response);
      expect(db.calls).toEqual([]);
    }
  );

  it('issues a session JWT and cookie that last one day', async () => {
    const cookie = onlyCookie(await exchange());

    const { iat, exp } = jwt.verify(cookie.value, process.env.JWT_SECRET_KEY);
    expect(exp - iat).toBe(86400);
    expect(cookie.attributes['max-age']).toBe('86400');
  });

  it.each([
    ['no session', undefined],
    ['a session signed with another key', `__session=${jwt.sign({ uid: UID, tokenVersion: 0 }, 'other-key')}`],
  ])('refuses to revoke with %s', async (_label, cookie) => {
    store.add({ firebaseUid: UID, email: EMAIL });

    const response = await revoke(cookie);

    expect(response.status).toBe(401);
    expect(store.byUid(UID).token_version).toBe(0);
    expect(auditedActions()).toEqual([]);
  });

  it('ends every session, including the caller, and records it', async () => {
    const first = onlyCookie(await exchange());
    const second = onlyCookie(await exchange());
    expect(store.byUid(UID).token_version).toBe(0);
    const user = store.byUid(UID);
    db.calls.length = 0;

    const response = await revoke(first.header);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(cookiesOf(response)).toEqual([]);
    expect(store.byUid(UID).token_version).toBe(1);
    const audits = db.callsMatching(/INSERT INTO audit_logs/);
    expect(audits).toHaveLength(1);
    expect(audits[0].params.slice(0, 5)).toEqual([user.id, UID, 'auth.sessions_revoked', 'session', '__session']);
    for (const old of [first, second]) {
      expect((await getProfile(UID, old.header)).status).toBe(401);
    }
    expect((await revoke(second.header)).status).toBe(401);
    expect(store.byUid(UID).token_version).toBe(1);
  });

  it('lets a fresh exchange after revocation issue a working session', async () => {
    const old = onlyCookie(await exchange());
    expect((await revoke(old.header)).status).toBe(204);

    const fresh = onlyCookie(await exchange());

    expect(jwt.verify(fresh.value, process.env.JWT_SECRET_KEY)).toMatchObject({ uid: UID, tokenVersion: 1 });
    expect((await getProfile(UID, fresh.header)).status).toBe(200);
    expect((await getProfile(UID, old.header)).status).toBe(401);
  });

  it('does not revoke other users', async () => {
    const mine = onlyCookie(await exchange());
    signedInAs({ uid: NEW_UID, email: 'other.person@example.test', email_verified: true });
    const theirs = onlyCookie(await exchange());

    expect((await revoke(mine.header)).status).toBe(204);

    expect(store.byUid(NEW_UID).token_version).toBe(0);
    expect((await getProfile(NEW_UID, theirs.header)).status).toBe(200);
  });
});

describe('IDENTITY-007: server failures are not reported as a bad token', () => {
  const PROJECT = 'synthetic-project';
  const synthetic = (code, message) => Object.assign(new Error(message), { code });
  let sdk;

  // The real SDK, offline. Test isolation blocks the download of Google's
  // public keys, as an outage would; the credential is never used.
  beforeAll(() => {
    sdk = jest.requireActual('firebase-admin').initializeApp({
      projectId: PROJECT,
      credential: { getAccessToken: async () => ({ access_token: 'synthetic', expires_in: 3600 }) },
    }, 'identity-007');
  });
  afterAll(() => sdk.delete());

  async function sdkErrorFor(token) {
    const error = await sdk.auth().verifyIdToken(token, true).then(() => null, (failure) => failure);
    expect(error).not.toBeNull();
    return error;
  }

  function wellFormedToken(claims = {}) {
    const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: UID, auth_time: now, ...claims },
      privateKey,
      { algorithm: 'RS256', keyid: 'synthetic-kid', expiresIn: 600 }
    );
  }

  function firebaseLog() {
    return capturedLines.map((line) => JSON.parse(line)).filter(({ msg }) => msg === 'Firebase token exchange failed');
  }

  it.each([
    ['a malformed token', () => 'not-a-jwt'],
    ['a token for another project', () => wellFormedToken({ aud: 'other-project' })],
  ])('answers 401 to %s and logs the SDK code and message', async (_label, token) => {
    const sdkError = await sdkErrorFor(token());
    expect(sdkError.code).toBe('auth/argument-error');
    mockVerifyIdToken.mockRejectedValue(sdkError);

    const response = await exchange();

    expect(response.status).toBe(401);
    expect(response.json()).toEqual({ message: 'Invalid Firebase token' });
    expectNoSession(response);
    expect(firebaseLog()).toEqual([expect.objectContaining({
      level: 40, outcome: 'invalid_token', sdkCode: 'auth/argument-error', sdkMessage: expect.stringContaining('ID token'),
    })]);
  });

  it('answers 401 to a token signed with a key Google does not list', async () => {
    mockVerifyIdToken.mockRejectedValue(synthetic('auth/argument-error',
      'Firebase ID token has "kid" claim which does not correspond to a known public key. Most likely the ID token is expired.'));

    expect((await exchange()).status).toBe(401);
  });

  it('answers 500, not 401, when the public keys cannot be downloaded', async () => {
    const sdkError = await sdkErrorFor(wellFormedToken());
    // The code alone cannot tell this apart from a bad token.
    expect(sdkError.code).toBe('auth/argument-error');
    expect(sdkError.message).toContain('ERR_TEST_NETWORK_BLOCKED');
    mockVerifyIdToken.mockRejectedValue(sdkError);

    const response = await exchange();

    expect(response.status).toBe(500);
    expect(response.json().message).toBe('Internal server error');
    expectNoSession(response);
    expect(firebaseLog()).toEqual([expect.objectContaining({
      outcome: 'server_error', sdkCode: 'auth/argument-error', sdkMessage: expect.stringContaining('Error while making request'),
    })]);
  });

  it.each([
    ['auth/argument-error', 'Error fetching public keys for Google certs: synthetic outage'],
    ['auth/internal-error', 'synthetic'],
    ['auth/insufficient-permission', 'synthetic'],
    ['app/network-error', 'Error while making request: synthetic. Error code: ECONNRESET'],
  ])('answers 500 to %s (%s)', async (code, message) => {
    mockVerifyIdToken.mockRejectedValue(synthetic(code, message));

    const response = await exchange();

    expect(response.status).toBe(500);
    expectNoSession(response);
    expect(firebaseLog()).toEqual([expect.objectContaining({ outcome: 'server_error', sdkCode: code })]);
  });

  it('never logs the token, cookie or email', async () => {
    mockVerifyIdToken.mockRejectedValue(synthetic('auth/argument-error', 'Error fetching public keys for Google certs: x'));
    expect((await exchange()).status).toBe(500);
    store.add({ firebaseUid: UID, email: EMAIL });
    const cookie = onlyCookie(await (signedInAs({ uid: UID, email: EMAIL, email_verified: true }), exchange()));
    mockVerifyIdToken.mockRejectedValue(synthetic('auth/argument-error',
      'Decoding failed. See https://firebase.google.com/docs/auth/admin/verify-id-tokens'));
    expect((await server.request('POST', EXCHANGE, {
      headers: { cookie: cookie.header },
      body: JSON.stringify({ firebaseToken: ID_TOKEN }),
    })).status).toBe(401);

    const logs = capturedLines.join('');
    for (const value of [ID_TOKEN, cookie.value, EMAIL]) expect(logs).not.toContain(value);
  });
});

describe('IDENTITY-007: API sessions', () => {
  beforeEach(() => {
    store.add({ firebaseUid: UID, email: EMAIL });
  });

  it.each([
    ['expired', { expiresIn: -10 }],
    ['not yet valid', { notBefore: 60 }],
  ])('answers 401 to a session that is %s', async (_label, options) => {
    const cookie = `__session=${jwt.sign({ uid: UID, tokenVersion: 0 }, process.env.JWT_SECRET_KEY, options)}`;

    const response = await getProfile(UID, cookie);

    expect(response.status).toBe(401);
    expect(response.json()).toEqual({ message: 'Invalid or expired token.' });
  });

  it('answers 500, not 401, when the user lookup fails', async () => {
    const { header } = onlyCookie(await exchange());
    db.on(/FROM users WHERE firebase_uid/, () => { throw new Error('synthetic database outage'); });

    const response = await getProfile(UID, header);

    expect(response.status).toBe(500);
    expect(response.json().message).toBe('Internal server error');
  });

  it('answers 500, not 401, when JWT_SECRET_KEY is missing', async () => {
    const { header } = onlyCookie(await exchange());
    const secret = process.env.JWT_SECRET_KEY;
    delete process.env.JWT_SECRET_KEY;
    try {
      const response = await getProfile(UID, header);

      expect(response.status).toBe(500);
    } finally {
      process.env.JWT_SECRET_KEY = secret;
    }
  });
});

describe('IDENTITY-007: error handling and logs', () => {
  const sdkError = (code, message) => Object.assign(new Error(message), { code });
  const logLines = () => capturedLines.map((line) => JSON.parse(line));
  const firebaseLog = () => logLines().filter(({ msg }) => msg === 'Firebase token exchange failed');
  const requestFailedLog = () => logLines().filter(({ msg }) => msg === 'Request failed');

  function expectNothingPrivateLogged(values) {
    const logs = capturedLines.join('');
    for (const value of values) expect(logs).not.toContain(value);
  }

  async function withoutJwtSecret(run) {
    const secret = process.env.JWT_SECRET_KEY;
    delete process.env.JWT_SECRET_KEY;
    try {
      return await run();
    } finally {
      process.env.JWT_SECRET_KEY = secret;
    }
  }

  describe('on an authenticated route', () => {
    beforeEach(() => {
      store.add({ firebaseUid: UID, email: EMAIL });
    });

    it('passes a failed user lookup to the error handler as a 500', async () => {
      const cookie = onlyCookie(await exchange());
      db.on(/FROM users WHERE firebase_uid/, () => { throw new Error('synthetic database outage'); });
      capturedLines.length = 0;

      const response = await getProfile(UID, cookie.header);

      expect(response.status).toBe(500);
      expect(response.json().message).toBe('Internal server error');
      expect(requestFailedLog()).toEqual([expect.objectContaining({ level: 50, statusCode: 500 })]);
      expectNothingPrivateLogged([cookie.value, EMAIL]);
    });

    it('passes a missing JWT_SECRET_KEY to the error handler as a 500, before any lookup', async () => {
      const cookie = onlyCookie(await exchange());
      db.calls.length = 0;
      capturedLines.length = 0;

      const response = await withoutJwtSecret(() => getProfile(UID, cookie.header));

      expect(response.status).toBe(500);
      expect(response.json().message).toBe('Internal server error');
      expect(db.callsMatching(/FROM users WHERE firebase_uid/)).toEqual([]);
      expect(requestFailedLog()).toEqual([expect.objectContaining({ level: 50, statusCode: 500 })]);
      expectNothingPrivateLogged([cookie.value, EMAIL]);
    });

    it.each([
      ['malformed', () => 'not-a-jwt'],
      ['signed with another secret', () => jwt.sign({ uid: UID, tokenVersion: 0 }, 'synthetic-other-secret')],
      ['expired', () => jwt.sign({ uid: UID, tokenVersion: 0 }, process.env.JWT_SECRET_KEY, { expiresIn: -10 })],
      ['not yet valid', () => jwt.sign({ uid: UID, tokenVersion: 0 }, process.env.JWT_SECRET_KEY, { notBefore: 60 })],
      ['unsigned (alg none)', () => jwt.sign({ uid: UID, tokenVersion: 0 }, null, { algorithm: 'none' })],
    ])('answers 401 to a session that is %s, without a lookup or an error log', async (_label, token) => {
      db.calls.length = 0;

      const response = await getProfile(UID, `__session=${token()}`);

      expect(response.status).toBe(401);
      expect(response.json()).toEqual({ message: 'Invalid or expired token.' });
      expect(db.callsMatching(/FROM users WHERE firebase_uid/)).toEqual([]);
      expect(requestFailedLog()).toEqual([]);
    });
  });

  describe('on the exchange', () => {
    it.each([
      ['invalid_token', 401, 'auth/id-token-expired', 'Firebase ID token has expired.'],
      ['invalid_token', 401, 'auth/argument-error',
        'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens for details.'],
      ['revoked', 401, 'auth/id-token-revoked', 'The Firebase ID token has been revoked.'],
      ['revoked', 401, 'auth/user-disabled', 'The user record is disabled.'],
      ['revoked', 401, 'auth/user-not-found', 'There is no user record corresponding to the provided identifier.'],
      ['server_error', 500, 'auth/internal-error', 'synthetic internal error'],
      ['server_error', 500, 'app/network-error', 'Error while making request: synthetic. Error code: ECONNRESET'],
    ])('logs outcome %s at warn level and answers %i for %s', async (outcome, status, code, message) => {
      mockVerifyIdToken.mockRejectedValue(sdkError(code, message));

      const response = await exchange();

      expect(response.status).toBe(status);
      expectNoSession(response);
      expect(firebaseLog()).toEqual([expect.objectContaining({ level: 40, outcome, sdkCode: code, sdkMessage: message })]);
      // Only server errors reach the error handler.
      expect(requestFailedLog()).toHaveLength(status === 500 ? 1 : 0);
      expectNothingPrivateLogged([ID_TOKEN, EMAIL]);
    });

    it('logs only outcome, sdkCode and sdkMessage of its own', async () => {
      mockVerifyIdToken.mockRejectedValue(sdkError('auth/user-disabled', 'synthetic'));

      await exchange();

      const [line] = firebaseLog();
      const own = Object.keys(line).filter((key) => !['level', 'severity', 'time', 'pid', 'hostname', 'service', 'env', 'msg'].includes(key));
      expect(own.sort()).toEqual(['outcome', 'sdkCode', 'sdkMessage']);
    });

    it('shortens a long SDK message to 300 characters', async () => {
      const long = `Error fetching public keys for Google certs: ${'x'.repeat(1000)}`;
      mockVerifyIdToken.mockRejectedValue(sdkError('auth/argument-error', long));

      expect((await exchange()).status).toBe(500);

      expect(firebaseLog()[0].sdkMessage).toBe(long.slice(0, 300));
    });

    it('never logs the token, an existing cookie or the email on a revoked exchange', async () => {
      store.add({ firebaseUid: UID, email: EMAIL });
      const cookie = onlyCookie(await exchange());
      capturedLines.length = 0;
      mockVerifyIdToken.mockRejectedValue(sdkError('auth/id-token-revoked', 'The Firebase ID token has been revoked.'));

      const response = await server.request('POST', EXCHANGE, {
        headers: { cookie: cookie.header },
        body: JSON.stringify({ firebaseToken: ID_TOKEN }),
      });

      expect(response.status).toBe(401);
      expect(firebaseLog()).toEqual([expect.objectContaining({ outcome: 'revoked' })]);
      expectNothingPrivateLogged([ID_TOKEN, cookie.value, EMAIL]);
    });

    it('does not log a Firebase failure for errors that are not from Firebase', async () => {
      mockVerifyIdToken.mockRejectedValue(sdkError(undefined, 'synthetic plain failure'));

      expect((await exchange()).status).toBe(500);

      expect(firebaseLog()).toEqual([]);
      expect(requestFailedLog()).toHaveLength(1);
    });

    it('answers 500 without a session when JWT_SECRET_KEY is missing', async () => {
      const response = await withoutJwtSecret(() => exchange());

      expect(response.status).toBe(500);
      expect(response.json().message).toBe('Internal server error');
      expectNoSession(response);
      expect(firebaseLog()).toEqual([]);
      expect(requestFailedLog()).toEqual([expect.objectContaining({ level: 50, statusCode: 500 })]);
      expectNothingPrivateLogged([ID_TOKEN, EMAIL]);
    });
  });
});
