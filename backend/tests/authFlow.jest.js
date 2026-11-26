const jwt = require('jsonwebtoken');

const mockVerifyIdToken = jest.fn();

jest.mock('../firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

jest.mock('../services/userService', () => ({
  findOrCreateUser: jest.fn(),
  getUserByFirebaseUid: jest.fn(),
  incrementTokenVersion: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({ createAuditLog: jest.fn() }));

const { exchangeFirebaseToken, logout } = require('../modules/identity/controllers/authController');
const {
  findOrCreateUser,
  getUserByFirebaseUid,
  incrementTokenVersion,
} = require('../services/userService');
const { createAuditLog } = require('../services/auditLogService');

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
  const originalSecret = process.env.JWT_SECRET_KEY;

  // Set per test: restoreMocks may reset implementations given in factories.
  beforeEach(() => {
    process.env.JWT_SECRET_KEY = 'test-secret';
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-1',
      email: 'user@example.com',
      email_verified: true,
      name: 'Resume Tester',
    });
    findOrCreateUser.mockResolvedValue({ id: 1 });
    getUserByFirebaseUid.mockResolvedValue({ id: 1, token_version: 2 });
    incrementTokenVersion.mockResolvedValue(3);
    createAuditLog.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = originalSecret;
  });

  it.each([
    ['missing', {}],
    ['blank', { firebaseToken: '   ' }],
  ])('passes a 400 validation error to next when firebaseToken is %s', async (_label, body) => {
    const res = createRes();
    const next = jest.fn();

    await exchangeFirebaseToken({ body }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual([expect.objectContaining({ path: ['firebaseToken'] })]);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(res.cookieCall).toBeNull();
  });

  it('issues JWT cookie on successful exchange', async () => {
    const req = { body: { firebaseToken: 'firebase-token' } };
    const res = createRes();
    const next = jest.fn();

    await exchangeFirebaseToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).toHaveBeenCalledWith('firebase-token', true);
    expect(findOrCreateUser).toHaveBeenCalledWith('firebase-uid-1', 'user@example.com', 'Resume Tester');
    expect(res.cookieCall.name).toBe('__session');
    expect(res.cookieCall.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const decoded = jwt.verify(res.cookieCall.value, process.env.JWT_SECRET_KEY);
    expect(decoded.uid).toBe('firebase-uid-1');
    expect(decoded.tokenVersion).toBe(2);
    expect(res.jsonPayload.user.email).toBe('user@example.com');
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 1,
      actorFirebaseUid: 'firebase-uid-1',
      action: 'auth.login',
    }));
  });

  it('increments token version on logout and clears cookie', async () => {
    const req = { user: { id: 1, firebaseUid: 'firebase-uid-1' } };
    const res = createRes();
    const next = jest.fn();

    await logout(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(incrementTokenVersion).toHaveBeenCalledWith('firebase-uid-1');
    expect(res.statusCode).toBe(204);
    expect(res.clearCookieCall.name).toBe('__session');
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 1,
      actorFirebaseUid: 'firebase-uid-1',
      action: 'auth.logout',
    }));
  });
});
