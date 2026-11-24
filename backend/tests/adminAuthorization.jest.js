// ADMIN-014, priority 1: who may reach the admin routes.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => null);

const { createApp } = require('../app');
const db = require('../config/db');
const adminRoutes = require('../modules/admin/routes/adminRoutes');
const { sessionCookie, startServer } = require('./support/adminHarness');

const ADMIN_UID = 'synthetic-admin';
const USER_UID = 'synthetic-user';
const ADMIN_TABLES = /feature_flags|audit_logs|date_trunc/;

const ROUTES = [
  ['GET', '/feature-flags'],
  ['PATCH', '/feature-flags/:key'],
  ['GET', '/analytics/usage'],
  ['GET', '/audit-logs'],
];

const originalAdmins = process.env.ADMIN_FIREBASE_UIDS;
let server;

beforeAll(async () => {
  server = await startServer(createApp());
});

afterAll(() => server.close());

beforeEach(() => {
  db.reset();
  db.addUser({ id: 1, firebaseUid: ADMIN_UID });
  db.addUser({ id: 2, firebaseUid: USER_UID });
  db.on(/INSERT INTO feature_flags/, () => ({
    rows: [{ key: 'demo', enabled: true, rollout_percent: 50 }],
  }));
  process.env.ADMIN_FIREBASE_UIDS = `someone-else, ${ADMIN_UID} ,`;
});

afterEach(() => {
  if (originalAdmins === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
  else process.env.ADMIN_FIREBASE_UIDS = originalAdmins;
});

function callRoute(method, path, cookie) {
  return server.request(method, `/api/admin${path.replace(':key', 'demo')}`, {
    headers: cookie ? { cookie } : {},
    ...(method === 'PATCH' && { body: JSON.stringify({ enabled: true, rolloutPercent: 50 }) }),
  });
}

test('the routes below are all of the admin routes', () => {
  const registered = adminRoutes.stack
    .filter((layer) => layer.route)
    .flatMap(({ route }) => Object.keys(route.methods)
      .map((method) => [method.toUpperCase(), route.path]));

  expect(registered).toEqual(ROUTES);
});

describe.each(ROUTES)('%s /api/admin%s', (method, path) => {
  it('returns 401 to an anonymous caller without touching admin data', async () => {
    const response = await callRoute(method, path);

    expect(response.status).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for a token signed with another secret', async () => {
    const forged = require('jsonwebtoken').sign({ uid: ADMIN_UID, tokenVersion: 0 }, 'wrong-secret');
    const response = await callRoute(method, path, `rc_auth=${forged}`);

    expect(response.status).toBe(401);
    expect(db.callsMatching(ADMIN_TABLES)).toEqual([]);
  });

  it('returns 403 to a signed-in user who is not an admin', async () => {
    const response = await callRoute(method, path, sessionCookie(USER_UID));

    expect(response.status).toBe(403);
    expect(response.json()).toEqual({ error: 'Admin access required.' });
    expect(db.callsMatching(ADMIN_TABLES)).toEqual([]);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['only separators', ' , ,'],
  ])('returns 403 to everyone when ADMIN_FIREBASE_UIDS is %s', async (_label, value) => {
    if (value === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
    else process.env.ADMIN_FIREBASE_UIDS = value;

    const response = await callRoute(method, path, sessionCookie(ADMIN_UID));

    expect(response.status).toBe(403);
    expect(db.callsMatching(ADMIN_TABLES)).toEqual([]);
  });

  it('allows a listed admin', async () => {
    const response = await callRoute(method, path, sessionCookie(ADMIN_UID));

    expect(response.status).toBe(200);
    expect(db.callsMatching(ADMIN_TABLES)).not.toEqual([]);
  });
});

test('part of a listed UID does not grant admin access', async () => {
  const partial = ADMIN_UID.slice(0, -1);
  db.addUser({ id: 3, firebaseUid: partial });

  const response = await callRoute('GET', '/feature-flags', sessionCookie(partial));

  expect(response.status).toBe(403);
});
