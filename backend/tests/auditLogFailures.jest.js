// IDENTITY-008 and ADMIN-008: a failed audit insert must not break sign-in,
// logout or session revocation, and the failure is logged with the action and
// the error only. Uses the fake database and a captured logger; every
// credential below is synthetic.
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

const { capturedLines } = require('pino');
const { createApp } = require('../app');
const db = require('../config/db');
const { startServer } = require('./support/adminHarness');
const { installUserStore } = require('./support/identityHarness');

const UID = 'synthetic-audit-uid';
const EMAIL = 'audit.person@example.test';
const ID_TOKEN = 'synthetic-firebase-id-token-marker';
const BODY_MARKER = 'synthetic-body-name-marker';
const FAILURE_MARKER = 'synthetic-audit-failure-marker';

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
  mockVerifyIdToken.mockResolvedValue({ uid: UID, email: EMAIL, email_verified: true });
  db.on(/INSERT INTO audit_logs/, () => { throw new Error(FAILURE_MARKER); });
});

const sessionCookies = (response) => (response.headers['set-cookie'] || [])
  .filter((header) => header.startsWith('__session='));

async function signIn() {
  const response = await server.request('POST', '/api/auth/exchange', {
    body: JSON.stringify({ firebaseToken: ID_TOKEN, fullName: BODY_MARKER }),
  });
  return response;
}

const auditFailures = () => capturedLines
  .map((line) => JSON.parse(line))
  .filter(({ msg }) => msg === 'Audit log write failed');

// The failure line names the action and the error, and nothing from the
// request: no cookie, token, body or error message.
function expectOneFailureLine(action, secrets) {
  const lines = auditFailures();
  expect(lines).toHaveLength(1);
  const [line] = lines;
  expect(line.auditAction).toBe(action);
  expect(line.level).toBe(50);
  expect(line.err).toEqual(expect.objectContaining({ type: 'Error' }));
  const { level, time, pid, hostname, service, env, msg, auditAction, err, ...rest } = line;
  expect(rest).toEqual({});
  const text = JSON.stringify(line);
  for (const secret of [...secrets, ID_TOKEN, BODY_MARKER, FAILURE_MARKER, EMAIL]) {
    expect(text).not.toContain(secret);
  }
}

const tokenOf = (setCookie) => setCookie.split(';')[0].slice('__session='.length);

test('sign-in answers 200 with a working session cookie and logs the failure', async () => {
  const response = await signIn();

  expect(response.status).toBe(200);
  expect(response.json().user).toMatchObject({ uid: UID, email: EMAIL });
  const [setCookie] = sessionCookies(response);
  expect(setCookie).toMatch(/HttpOnly/i);
  const token = tokenOf(setCookie);
  expect(token).not.toBe('');
  expect(db.callsMatching(/INSERT INTO audit_logs/).map(({ params }) => params[2])).toEqual(['auth.login']);
  expectOneFailureLine('auth.login', [token]);

  const profile = await server.request('GET', `/api/users/${UID}`, { headers: { cookie: `__session=${token}` } });
  expect(profile.status).toBe(200);
});

test('logout answers 204, clears the cookie, revokes the session and logs the failure', async () => {
  const token = tokenOf(sessionCookies(await signIn())[0]);
  capturedLines.length = 0;

  const response = await server.request('POST', '/api/auth/logout', { headers: { cookie: `__session=${token}` } });

  expect(response.status).toBe(204);
  const [cleared] = sessionCookies(response);
  expect(cleared).toMatch(/^__session=;/);
  expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  expect(store.byUid(UID).token_version).toBe(1);
  expectOneFailureLine('auth.logout', [token]);

  const after = await server.request('GET', `/api/users/${UID}`, { headers: { cookie: `__session=${token}` } });
  expect(after.status).toBe(401);
});

test('session revocation answers 204, revokes every session and logs the failure', async () => {
  const token = tokenOf(sessionCookies(await signIn())[0]);
  capturedLines.length = 0;

  const response = await server.request('POST', '/api/auth/sessions/revoke', { headers: { cookie: `__session=${token}` } });

  expect(response.status).toBe(204);
  expect(store.byUid(UID).token_version).toBe(1);
  expectOneFailureLine('auth.sessions_revoked', [token]);

  const after = await server.request('GET', `/api/users/${UID}`, { headers: { cookie: `__session=${token}` } });
  expect(after.status).toBe(401);
});

test('a working audit insert logs no failure', async () => {
  db.on(/INSERT INTO audit_logs/, () => ({ rows: [] }));

  expect((await signIn()).status).toBe(200);
  expect(auditFailures()).toEqual([]);
});
