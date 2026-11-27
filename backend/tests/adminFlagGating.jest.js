// ADMIN-005 and ADMIN-007 over HTTP: flag gating of the admin routes and usage
// collection, admin read audits, cache invalidation on update and the flag
// update transaction. The scripted database does not run SQL; every user and
// credential is synthetic.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => null);

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');
const { clearFeatureFlagCache } = require('../services/featureFlagService');

const FLAG_LOOKUP = /^SELECT key, enabled, rollout_percent FROM feature_flags$/;
const SEEDED = { admin_dashboard: true, usage_analytics: true, audit_logs: true };
const ADMIN_UID = 'synthetic-admin';
const USER_UID = 'synthetic-user';
const originalAdmins = process.env.ADMIN_FIREBASE_UIDS;

let server;
let flagRows;
let stored;
let commands;

const rowsFrom = (state) => Object.entries(state)
  .filter(([, enabled]) => enabled !== undefined)
  .map(([key, enabled]) => ({ key, enabled, rollout_percent: 100 }));

function setFlags(change) {
  flagRows = rowsFrom({ ...SEEDED, ...change });
}

beforeAll(async () => {
  process.env.ADMIN_FIREBASE_UIDS = ADMIN_UID;
  server = await startServer(createApp());
});

afterAll(async () => {
  if (originalAdmins === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
  else process.env.ADMIN_FIREBASE_UIDS = originalAdmins;
  await server.close();
});

beforeEach(() => {
  db.reset();
  db.addUser({ id: 1, firebaseUid: ADMIN_UID });
  db.addUser({ id: 2, firebaseUid: USER_UID });
  clearFeatureFlagCache();
  setFlags({});
  stored = { key: 'demo', description: 'Old text', enabled: false, rollout_percent: 10 };
  commands = [];

  db.on(/SELECT[\s\S]*FROM feature_flags/, () => ({ rows: [{ ...stored }] }));
  db.on(FLAG_LOOKUP, () => ({ rows: flagRows }));
  db.on(/INSERT INTO feature_flags/, (params) => ({
    rows: [{ ...stored, key: params[0], description: params[1], enabled: params[2], rollout_percent: params[3] ?? stored.rollout_percent }],
  }));

  // Records the transaction commands of every client the app opens.
  const connect = db.connect.bind(db);
  jest.spyOn(db, 'connect').mockImplementation(async () => {
    const client = await connect();
    return {
      async query(sql, params) {
        const command = sql.trim().split(/\s+/)[0].toUpperCase();
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command)) commands.push(command);
        return client.query(sql, params);
      },
      release() {
        commands.push('RELEASE');
        client.release();
      },
    };
  });
});

const asAdmin = { cookie: sessionCookie(ADMIN_UID) };
const asUser = { cookie: sessionCookie(USER_UID) };
const get = (path, headers = asAdmin) => server.request('GET', `/api/admin${path}`, { headers });
const patch = (key, body, headers = asAdmin) => server.request('PATCH', `/api/admin/feature-flags/${key}`, {
  headers,
  body: JSON.stringify(body),
});

const auditActions = () => db.callsMatching(/INSERT INTO audit_logs/).map(({ params }) => params[2]);
const auditOf = (action) => db.callsMatching(/INSERT INTO audit_logs/).find(({ params }) => params[2] === action);
const dataReads = () => db.callsMatching(/FROM usage_events|SELECT[\s\S]*FROM audit_logs/);
// Usage rows are written after the response; give that handler time to run.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });

describe('ADMIN-005: admin_dashboard', () => {
  test.each([
    ['off', { admin_dashboard: false }],
    ['missing', { admin_dashboard: undefined }],
  ])('%s refuses analytics and audit logs to an admin with no data read', async (_label, change) => {
    setFlags(change);

    for (const path of ['/analytics/usage?days=7', '/audit-logs']) {
      const response = await get(path);
      expect(response.status).toBe(403);
      expect(response.json()).toEqual({ error: 'Feature is not enabled for your account.' });
    }
    expect(dataReads()).toEqual([]);
  });

  test('off still lets an admin read and change flags', async () => {
    setFlags({ admin_dashboard: false });

    expect((await get('/feature-flags')).status).toBe(200);
    const response = await patch('admin_dashboard', { enabled: true });
    expect(response.status).toBe(200);
    expect(response.json().flag).toMatchObject({ key: 'admin_dashboard', enabled: true });
  });

  test.each(['/feature-flags', '/analytics/usage?days=7', '/audit-logs'])(
    'off or on, a non-admin still gets 403 on %s',
    async (path) => {
      for (const enabled of [false, true]) {
        clearFeatureFlagCache();
        setFlags({ admin_dashboard: enabled });
        const response = await get(path, asUser);
        expect(response.status).toBe(403);
        expect(response.json()).toEqual({ error: 'Admin access required.' });
      }
      expect(dataReads()).toEqual([]);
      expect((await patch('demo', { enabled: true }, asUser)).status).toBe(403);
      expect(db.callsMatching(/INSERT INTO feature_flags/)).toEqual([]);
    }
  );

  test('a failed lookup answers 500 on the gated routes and reads no data', async () => {
    db.on(FLAG_LOOKUP, () => { throw new Error('synthetic lookup failure'); });

    expect((await get('/analytics/usage?days=7')).status).toBe(500);
    expect(dataReads()).toEqual([]);
  });

  test('turning admin_dashboard on takes effect on the next request (cache cleared by the update)', async () => {
    setFlags({ admin_dashboard: false });
    expect((await get('/audit-logs')).status).toBe(403);

    // The stored rows change and the update clears this process's cache.
    setFlags({ admin_dashboard: true });
    expect((await patch('admin_dashboard', { enabled: true })).status).toBe(200);

    expect((await get('/audit-logs')).status).toBe(200);
  });

  test('without an update, a change in the table is not seen within the cache window', async () => {
    setFlags({ admin_dashboard: false });
    expect((await get('/audit-logs')).status).toBe(403);
    setFlags({ admin_dashboard: true });

    expect((await get('/audit-logs')).status).toBe(403);
    expect(db.callsMatching(FLAG_LOOKUP)).toHaveLength(1);
  });
});

describe('ADMIN-005: usage_analytics', () => {
  test('a failed lookup stores no usage event and the request still succeeds', async () => {
    // /feature-flags is not gated by admin_dashboard, so it answers despite
    // the failed lookup; a failed lookup is never cached, so the usage check
    // after the response fails too.
    db.on(FLAG_LOOKUP, () => { throw new Error('synthetic lookup failure'); });

    const response = await get('/feature-flags');
    await settle();

    expect(response.status).toBe(200);
    expect(db.callsMatching(FLAG_LOOKUP).length).toBeGreaterThanOrEqual(2);
    expect(db.callsMatching(/INSERT INTO usage_events/)).toEqual([]);
  });

  test('a signed-out request stores no usage event and reads no flags', async () => {
    const response = await get('/feature-flags', {});
    await settle();

    expect(response.status).toBe(401);
    expect(db.callsMatching(/INSERT INTO usage_events/)).toEqual([]);
  });
});

describe('ADMIN-005: audit_logs', () => {
  test('explicitly off: an update to another flag commits with no audit record', async () => {
    setFlags({ audit_logs: false });

    const response = await patch('demo', { enabled: true });

    expect(response.status).toBe(200);
    expect(auditActions()).toEqual([]);
    expect(commands).toEqual(['BEGIN', 'COMMIT', 'RELEASE']);
  });

  test('explicitly off: a change to audit_logs itself is recorded in the transaction', async () => {
    setFlags({ audit_logs: false });

    const response = await patch('audit_logs', { enabled: true });

    expect(response.status).toBe(200);
    expect(auditActions()).toEqual(['feature_flag.update']);
    expect(auditOf('feature_flag.update').transaction).not.toBeNull();
  });

  test('explicitly off: admin reads are not recorded', async () => {
    setFlags({ audit_logs: false });

    expect((await get('/feature-flags')).status).toBe(200);
    expect(auditActions()).toEqual([]);
  });

  test.each([
    ['missing', () => setFlags({ audit_logs: undefined })],
    ['failing', () => db.on(FLAG_LOOKUP, (_p, { sql }) => {
      // admin_dashboard is not consulted on the flag routes; every lookup fails.
      throw new Error(`synthetic lookup failure ${sql.length}`);
    })],
  ])('%s: an update and a read are still recorded', async (_label, setUp) => {
    setUp();

    expect((await patch('demo', { enabled: true })).status).toBe(200);
    expect((await get('/feature-flags')).status).toBe(200);
    expect(auditActions()).toEqual(['feature_flag.update', 'admin.feature_flags.read']);
  });
});

describe('ADMIN-007: admin reads are audited', () => {
  test.each([
    ['/feature-flags', 'admin.feature_flags.read', undefined],
    ['/analytics/usage?days=14', 'admin.analytics.read', { days: 14 }],
    ['/audit-logs?limit=20', 'admin.audit_logs.read', { limit: 20 }],
  ])('GET %s records %s with request context', async (path, action, expected) => {
    const response = await server.request('GET', `/api/admin${path}`, {
      headers: { ...asAdmin, 'user-agent': 'synthetic-agent' },
    });

    expect(response.status).toBe(200);
    const audit = auditOf(action);
    expect(audit.params.slice(0, 4)).toEqual([1, ADMIN_UID, action, 'admin']);
    const metadata = JSON.parse(audit.params[5]);
    if (expected) expect(metadata).toMatchObject(expected);
    expect(metadata.request).toEqual({ requestId: expect.any(String), ip: expect.any(String), userAgent: 'synthetic-agent' });
    expect(JSON.stringify(metadata)).not.toContain(asAdmin.cookie.split('=')[1]);
  });

  test('a failed read audit does not fail the read', async () => {
    db.on(/INSERT INTO audit_logs/, () => { throw new Error('synthetic audit failure'); });

    expect((await get('/feature-flags')).status).toBe(200);
  });

  test('a refused signed-in non-admin leaves admin.access_denied with the method only', async () => {
    const response = await patch('demo', { enabled: true }, asUser);

    expect(response.status).toBe(403);
    const audit = auditOf('admin.access_denied');
    expect(audit.params.slice(0, 4)).toEqual([2, USER_UID, 'admin.access_denied', 'admin']);
    const metadata = JSON.parse(audit.params[5]);
    expect(metadata.method).toBe('PATCH');
    expect(JSON.stringify(metadata)).not.toContain('feature-flags');
  });

  test('an admin is not recorded as denied', async () => {
    expect((await get('/feature-flags')).status).toBe(200);
    expect(auditActions()).not.toContain('admin.access_denied');
  });
});

describe('ADMIN-007: flag update transaction', () => {
  test('a successful update runs BEGIN, the row lock, the write, the audit, COMMIT', async () => {
    const response = await patch('demo', { enabled: true, rolloutPercent: 40, description: 'New text' });

    expect(response.status).toBe(200);
    expect(commands).toEqual(['BEGIN', 'COMMIT', 'RELEASE']);
    const inTransaction = db.calls.filter(({ transaction }) => transaction).map(({ sql }) => sql);
    expect(inTransaction).toHaveLength(3);
    expect(inTransaction[0]).toMatch(/FROM feature_flags WHERE key = \$1 FOR UPDATE/);
    expect(inTransaction[1]).toMatch(/INSERT INTO feature_flags/);
    expect(inTransaction[2]).toMatch(/INSERT INTO audit_logs/);
  });

  test('a failed audit insert rolls back and releases the client', async () => {
    db.on(/INSERT INTO audit_logs/, () => { throw new Error('synthetic audit failure'); });

    const response = await patch('demo', { enabled: true });

    expect(response.status).toBe(500);
    expect(commands).toEqual(['BEGIN', 'ROLLBACK', 'RELEASE']);
  });

  test('a failed update leaves the cache alone, so the old value still applies', async () => {
    setFlags({ admin_dashboard: false });
    expect((await get('/audit-logs')).status).toBe(403);
    db.on(/INSERT INTO audit_logs/, () => { throw new Error('synthetic audit failure'); });
    setFlags({ admin_dashboard: true });

    expect((await patch('admin_dashboard', { enabled: true })).status).toBe(500);
    expect((await get('/audit-logs')).status).toBe(403);
  });

  test('the audit metadata holds old and new description, enabled and rollout and the request', async () => {
    const response = await server.request('PATCH', '/api/admin/feature-flags/demo', {
      headers: { ...asAdmin, 'user-agent': `synthetic-${'u'.repeat(400)}` },
      body: JSON.stringify({ enabled: true, rolloutPercent: 40, description: '  New text  ' }),
    });

    expect(response.status).toBe(200);
    const metadata = JSON.parse(auditOf('feature_flag.update').params[5]);
    expect(metadata).toMatchObject({
      enabled: true,
      rollout_percent: 40,
      before: { description: 'Old text', enabled: false, rollout_percent: 10 },
      after: { description: 'New text', enabled: true, rollout_percent: 40 },
      request: { requestId: expect.any(String), ip: expect.any(String) },
    });
    expect(metadata.request.userAgent).toHaveLength(256);
  });

  test('a new flag has before: null', async () => {
    db.on(/FOR UPDATE/, () => ({ rows: [] }));

    expect((await patch('brand_new', { enabled: true })).status).toBe(200);
    expect(JSON.parse(auditOf('feature_flag.update').params[5]).before).toBeNull();
  });
});
