// IDENTITY-018: only the session cookie is decoded. An unrelated malformed
// cookie must not break the API; a malformed session cookie is a 401.
// Database and Firebase are fakes; every credential is synthetic.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({ auth: () => ({ verifyIdToken: jest.fn() }) }));

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');

const UID = 'synthetic-uid';
let server;

beforeAll(async () => { server = await startServer(createApp()); });
afterAll(() => server.close());
beforeEach(() => {
  db.reset();
  db.addUser({ id: 1, firebaseUid: UID });
  // The profile read after authentication.
  db.on(/FROM users u\s/, () => ({ rows: [{ id: 1, firebase_uid: UID, email: 'person@example.test' }] }));
});

const getProfile = (cookie) => server.request('GET', '/api/users/synthetic-uid', { headers: { cookie } });

describe('IDENTITY-018: malformed cookies', () => {
  it('ignores an unrelated malformed cookie on an authenticated route', async () => {
    const response = await getProfile(`foo=%E0%A4%A; ${sessionCookie(UID)}`);

    expect(response.status).toBe(200);
  });

  it.each([
    ['a bad escape', '__session=%E0%A4%A'],
    ['a lone percent', '__session=%'],
  ])('answers 401 for a session cookie with %s', async (_label, cookie) => {
    const response = await getProfile(cookie);

    expect(response.status).toBe(401);
  });
});
