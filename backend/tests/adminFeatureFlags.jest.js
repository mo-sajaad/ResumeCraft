// ADMIN-014, priority 1: feature flag updates and their audit record.
// The scripted database does not run SQL. Confirm a fix for ADMIN-006 or
// ADMIN-007 on a throwaway PostgreSQL as well.
jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => null);

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');

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

  db.on(/SELECT[\s\S]*FROM feature_flags/, () => ({
    rows: [{ key: 'demo', description: null, enabled: false, rollout_percent: 10 }],
  }));
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

function patchFlag(body) {
  return server.request('PATCH', '/api/admin/feature-flags/demo', {
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

test.each([-1, 101, '50'])('rolloutPercent %p is rejected and nothing is written', async (rolloutPercent) => {
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
