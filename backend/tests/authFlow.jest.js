const jwt = require('jsonwebtoken');

jest.mock('../firebaseAdmin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'firebase-uid-1',
      email: 'user@example.com',
      name: 'Resume Tester',
    }),
  }),
}));

jest.mock('../services/userService', () => ({
  findOrCreateUser: jest.fn().mockResolvedValue({ id: 1 }),
  getUserByFirebaseUid: jest.fn().mockResolvedValue({ token_version: 2 }),
  incrementTokenVersion: jest.fn().mockResolvedValue(3),
}));

const { exchangeFirebaseToken, logout } = require('../modules/identity/controllers/authController');
const { incrementTokenVersion } = require('../services/userService');

function createRes() {
  return {
    statusCode: 200,
    jsonPayload: null,
    cookieCall: null,
    clearCookieCall: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    send() {
      return this;
    },
    cookie(name, value, options) {
      this.cookieCall = { name, value, options };
      return this;
    },
    clearCookie(name, options) {
      this.clearCookieCall = { name, options };
      return this;
    },
  };
}

describe('auth flow', () => {
  beforeEach(() => {
    process.env.JWT_SECRET_KEY = 'test-secret';
  });

  it('returns 400 when firebaseToken is missing', async () => {
    const req = { body: {} };
    const res = createRes();

    await exchangeFirebaseToken(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.jsonPayload.message).toContain('firebaseToken is required');
  });

  it('issues JWT cookie on successful exchange', async () => {
    const req = { body: { firebaseToken: 'firebase-token' } };
    const res = createRes();

    await exchangeFirebaseToken(req, res, jest.fn());

    expect(res.cookieCall.name).toBe('rc_auth');
    const decoded = jwt.verify(res.cookieCall.value, process.env.JWT_SECRET_KEY);
    expect(decoded.uid).toBe('firebase-uid-1');
    expect(decoded.tokenVersion).toBe(2);
    expect(res.jsonPayload.user.email).toBe('user@example.com');
  });

  it('increments token version on logout and clears cookie', async () => {
    const req = { user: { firebaseUid: 'firebase-uid-1' } };
    const res = createRes();

    await logout(req, res, jest.fn());

    expect(incrementTokenVersion).toHaveBeenCalledWith('firebase-uid-1');
    expect(res.statusCode).toBe(204);
    expect(res.clearCookieCall.name).toBe('rc_auth');
  });
});
