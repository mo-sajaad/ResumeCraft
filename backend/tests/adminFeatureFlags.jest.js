// ADMIN-014, priority 1: feature flag updates and their audit record.
// The scripted database does not run SQL. Confirm a fix for ADMIN-006 or
// ADMIN-007 on a throwaway PostgreSQL as well.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => null);

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');
const { clearFeatureFlagCache } = require('../services/featureFlagService');
// The seeded flags, as the flag service reads them (ADMIN-005).
const FLAG_LOOKUP = /^SELECT key, enabled, rollout_percent FROM feature_flags$/;
const SEEDED_FLAGS = ['admin_dashboard', 'usage_analytics', 'audit_logs']
  .map((key) => ({ key, enabled: true, rollout_percent: 100 }));

const ADMIN_UID = 'synthetic-admin';
const originalAdmins = process.env.ADMIN_FIREBASE_UIDS;
let server;

beforeAll(async () => {
  process.env.ADMIN_FIREBASE_UIDS = ADMIN_UID;
  server = await startServer(createApp());
});

afterAll(async () => {
  if (originalAdmins === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
  else process.env.ADMIN_FIREBASE_UIDS = originalAdmins;
  await server.close();
});

// Committed writes, honouring transactions opened through pool.connect().
let committed;

function commitOrDefer(table, row, transaction) {
  const apply = () => committed[table].push(row);
  if (transaction) transaction.onCommit.push(apply);
  else apply();
}

beforeEach(() => {
  db.reset();
  db.addUser({ id: 1, firebaseUid: ADMIN_UID });
  committed = { flags: [], audit: [] };
  clearFeatureFlagCache();

  db.on(/SELECT[\s\S]*FROM feature_flags/, () => ({
    rows: [{ key: 'demo', description: null, enabled: false, rollout_percent: 10 }],
  }));
  db.on(FLAG_LOOKUP, () => ({ rows: SEEDED_FLAGS }));
  db.on(/INSERT INTO audit_logs/, (params, { transaction }) => {
    commitOrDefer('audit', params, transaction);
    return { rows: [] };
  });
  db.on(/(INSERT INTO|UPDATE) feature_flags/, (params, { sql, transaction }) => {
    // A single statement may write both tables; both then succeed together.
    if (/audit_logs/.test(sql)) commitOrDefer('audit', params, transaction);
    commitOrDefer('flags', params, transaction);
    return { rows: [{ key: 'demo', enabled: true, rollout_percent: 25 }] };
  });
});

function patchFlag(body, key = 'demo') {
  return server.request('PATCH', `/api/admin/feature-flags/${key}`, {
    headers: { cookie: sessionCookie(ADMIN_UID) },
    body: JSON.stringify(body),
  });
}

test('an update stores the flag and an audit record', async () => {
  const response = await patchFlag({ enabled: true, rolloutPercent: 25 });

  expect(response.status).toBe(200);
  expect(response.json().flag).toMatchObject({ key: 'demo', enabled: true, rollout_percent: 25 });
  expect(committed.flags).toHaveLength(1);
  expect(committed.flags[0]).toEqual(expect.arrayContaining(['demo', true, 25]));
  expect(committed.audit).toHaveLength(1);
  expect(committed.audit[0]).toEqual(
    expect.arrayContaining([1, ADMIN_UID, 'feature_flag.update', 'feature_flag', 'demo'])
  );
});

test.each([0, 100])('an explicit rolloutPercent of %i is stored', async (rolloutPercent) => {
  const response = await patchFlag({ enabled: true, rolloutPercent });

  expect(response.status).toBe(200);
  expect(committed.flags[0]).toContain(rolloutPercent);
});

test.each([-1, 101, '50', 12.5])('rolloutPercent %p is rejected and nothing is written', async (rolloutPercent) => {
  const response = await patchFlag({ enabled: true, rolloutPercent });

  expect(response.status).toBe(400);
  expect(committed).toEqual({ flags: [], audit: [] });
});

test('ADMIN-006: PATCH without rolloutPercent keeps the stored value', async () => {
  const response = await patchFlag({ enabled: true });
  expect(response.status).toBe(200);
  expect(committed.flags).toHaveLength(1);
  const { sql, params } = db.callsMatching(/(INSERT INTO|UPDATE) feature_flags/)[0];
  // Either the stored 10 is written back, or the SQL keeps the column when
  // the value is absent. 100 as a parameter, or NULL copied over the stored
  // value, loses the partial rollout.
  expect(params).not.toContain(100);
  if (!params.includes(10)) {
    expect(sql).not.toMatch(/rollout_percent\s*=\s*EXCLUDED\.rollout_percent/i);
  }
});

test('a failed flag write returns 500 and leaves no audit record', async () => {
  db.on(/(INSERT INTO|UPDATE) feature_flags/, () => { throw new Error('synthetic flag failure'); });

  const response = await patchFlag({ enabled: true, rolloutPercent: 25 });

  expect(response.status).toBe(500);
  expect(committed).toEqual({ flags: [], audit: [] });
});

test('ADMIN-007: a failed audit insert undoes the flag change', async () => {
  db.on(/audit_logs/, () => { throw new Error('synthetic audit failure'); });
  const response = await patchFlag({ enabled: true, rolloutPercent: 25 });
  expect(response.status).toBe(500);
  expect(db.callsMatching(/audit_logs/)).not.toEqual([]);
  expect(committed.audit).toEqual([]);
  expect(committed.flags).toEqual([]);
});

test('ADMIN-007: the audit record holds the old and new values and the request', async () => {
  const response = await patchFlag({ enabled: true, rolloutPercent: 25 });

  expect(response.status).toBe(200);
  const metadata = JSON.parse(committed.audit[0][5]);
  expect(metadata).toMatchObject({
    before: { enabled: false, rollout_percent: 10, description: null },
    after: { enabled: true, rollout_percent: 25 },
    request: { ip: expect.any(String), requestId: expect.any(String) },
  });
});

describe('ADMIN-005: admin_dashboard and usage_analytics', () => {
  const withFlag = (key, change) => SEEDED_FLAGS.map((row) => (row.key === key ? { ...row, ...change } : row));
  const getFlags = () => server.request('GET', '/api/admin/feature-flags', { headers: { cookie: sessionCookie(ADMIN_UID) } });
  // The usage row is written after the response; wait for that handler.
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });

  const getAdmin = (path) => server.request('GET', `/api/admin${path}`, { headers: { cookie: sessionCookie(ADMIN_UID) } });

  test.each(['/analytics/usage?days=14', '/audit-logs'])(
    'admin_dashboard off refuses %s',
    async (path) => {
      db.on(FLAG_LOOKUP, () => ({ rows: withFlag('admin_dashboard', { enabled: false }) }));

      const response = await getAdmin(path);

      expect(response.status).toBe(403);
      expect(db.callsMatching(/FROM usage_events|SELECT[\s\S]*FROM audit_logs/)).toEqual([]);
    }
  );

  test('admin_dashboard off still lets an admin list and update flags', async () => {
    db.on(FLAG_LOOKUP, () => ({ rows: withFlag('admin_dashboard', { enabled: false }) }));

    expect((await getFlags()).status).toBe(200);
    const response = await patchFlag({ enabled: true });

    expect(response.status).toBe(200);
    expect(committed.flags).toHaveLength(1);
  });

  test('a failed admin_dashboard lookup refuses the other admin routes', async () => {
    db.on(FLAG_LOOKUP, () => { throw new Error('synthetic lookup failure'); });

    const response = await getAdmin('/audit-logs');

    expect(response.status).toBe(500);
    expect(db.callsMatching(/SELECT[\s\S]*FROM audit_logs/)).toEqual([]);
  });

  test('usage events are stored while usage_analytics is on', async () => {
    expect((await getFlags()).status).toBe(200);
    await settle();
    expect(db.callsMatching(/INSERT INTO usage_events/)).toHaveLength(1);
  });

  test.each([
    ['off', () => ({ rows: withFlag('usage_analytics', { enabled: false }) })],
    ['missing', () => ({ rows: SEEDED_FLAGS.filter(({ key }) => key !== 'usage_analytics') })],
  ])('usage events are not stored while usage_analytics is %s', async (_label, answer) => {
    db.on(FLAG_LOOKUP, answer);

    expect((await getFlags()).status).toBe(200);
    await settle();
    expect(db.callsMatching(/INSERT INTO usage_events/)).toEqual([]);
  });
});

describe('ADMIN-011: flag input validation', () => {
  test.each([
    ['too long', 'a'.repeat(65)],
    ['upper case', 'Demo'],
    ['punctuation', 'demo-flag'],
    ['a leading digit', '1demo'],
  ])('a key that is %s is rejected and nothing is written', async (_label, key) => {
    const response = await patchFlag({ enabled: true }, key);

    expect(response.status).toBe(400);
    expect(committed).toEqual({ flags: [], audit: [] });
  });

  test('a description over 500 characters is rejected', async () => {
    const response = await patchFlag({ enabled: true, description: 'x'.repeat(501) });

    expect(response.status).toBe(400);
    expect(committed).toEqual({ flags: [], audit: [] });
  });

  test.each([
    ['omitted', {}, [null, false]],
    ['null', { description: null }, [null, true]],
    ['empty', { description: '  ' }, [null, true]],
    ['set', { description: 'New text' }, ['New text', true]],
  ])('a description that is %s is kept or replaced as asked', async (_label, body, [stored, replace]) => {
    const response = await patchFlag({ enabled: true, ...body });

    expect(response.status).toBe(200);
    const [{ params }] = db.callsMatching(/(INSERT INTO|UPDATE) feature_flags/);
    expect(params[1]).toBe(stored);
    expect(params[4]).toBe(replace);
  });
});

describe('ADMIN-010: usage totals', () => {
  const getUsage = () => server.request('GET', '/api/admin/analytics/usage?days=14', {
    headers: { cookie: sessionCookie(ADMIN_UID) },
  });

  test('ranks totals per route in SQL and reports truncation', async () => {
    db.on(/FROM usage_events/, () => ({
      rows: [
        { route: '/a', event_type: 'api_request', count: 9, group_count: 3, total_events: '15' },
        { route: '/b', event_type: 'api_request', count: 4, group_count: 3, total_events: '15' },
      ],
    }));

    const response = await getUsage();

    expect(response.status).toBe(200);
    expect(response.json()).toEqual({
      days: 14,
      events: [
        { route: '/a', event_type: 'api_request', count: 9 },
        { route: '/b', event_type: 'api_request', count: 4 },
      ],
      truncated: true,
      totalEvents: 15,
    });
    const [{ sql, params }] = db.callsMatching(/FROM usage_events/);
    expect(sql).toMatch(/GROUP BY route, event_type/);
    expect(sql).toMatch(/ORDER BY count DESC/);
    expect(sql).not.toMatch(/date_trunc/);
    expect(params).toEqual(['14', 50]);
  });

  test('an empty window is not truncated', async () => {
    const response = await getUsage();

    expect(response.json()).toMatchObject({ events: [], truncated: false, totalEvents: 0 });
  });
});
