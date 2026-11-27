// IDENTITY-019: a soft-deleted user (deleted_at set) cannot use an old session
// and is not revived by an exchange. The fake database answers as PostgreSQL
// would for a row with deleted_at set, following each statement's own filter.
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

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');

const UID = 'synthetic-deleted-uid';
const EMAIL = 'deleted.person@example.test';
const DELETED_ROW = {
  id: 7, firebase_uid: UID, email: EMAIL, full_name: 'Synthetic Name', token_version: 0, deleted_at: new Date(0),
};
let server;

beforeAll(async () => { server = await startServer(createApp()); });
afterAll(() => server.close());

beforeEach(() => {
  db.reset();
  mockVerifyIdToken.mockResolvedValue({ uid: UID, email: EMAIL, email_verified: true });
  const visible = (sql) => (/deleted_at IS NULL/.test(sql) ? [] : [{ ...DELETED_ROW }]);
  db.on(/FROM plans/, () => ({ rows: [{ id: 'synthetic-free-plan' }] }));
  db.on(/FROM users/, (_params, { sql }) => ({ rows: visible(sql) }));
  db.on(/^\s*INSERT INTO users\b/, (_params, { sql }) => ({ rows: visible(sql) }));
});

describe('IDENTITY-019: soft-deleted users', () => {
  it('rejects an existing session with 401', async () => {
    const response = await server.request('GET', `/api/users/${UID}`, { headers: { cookie: sessionCookie(UID) } });

    expect(response.status).toBe(401);
  });

  it('refuses an exchange with 403 ACCOUNT_DELETED and sets no cookie', async () => {
    const response = await server.request('POST', '/api/auth/exchange', {
      body: JSON.stringify({ firebaseToken: 'synthetic-id-token' }),
    });

    expect(response.status).toBe(403);
    expect(response.json()).toMatchObject({ code: 'ACCOUNT_DELETED' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
