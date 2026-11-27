// Feature flag evaluation. The flag rows are synthetic; no database is used.
jest.mock('../config/db', () => ({ query: jest.fn() }));

const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');
const {
  clearFeatureFlagCache,
  getAllFlagsForUser,
  isFeatureEnabled,
} = require('../services/featureFlagService');
const requireFeatureFlag = require('../middleware/requireFeatureFlag');
const auditLogRepository = require('../modules/admin/repositories/auditLogRepository');
const { createAuditLog } = require('../services/auditLogService');

const USERS = Array.from({ length: 5000 }, (_, i) => `synthetic-uid-${i}`);

function listFlags(rows) {
  clearFeatureFlagCache();
  return jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue(rows);
}

function failLookup() {
  clearFeatureFlagCache();
  return jest.spyOn(featureFlagRepository, 'listAllFlags').mockRejectedValue(new Error('synthetic lookup failure'));
}

test('ADMIN-012: cohorts of similarly named flags are independent', async () => {
  listFlags([
    { key: 'new_editor_v1', enabled: true, rollout_percent: 10 },
    { key: 'new_editor_v2', enabled: true, rollout_percent: 10 },
  ]);

  let inFirst = 0;
  let inBoth = 0;
  for (const uid of USERS) {
    const flags = await getAllFlagsForUser(uid);
    if (flags.new_editor_v1) {
      inFirst += 1;
      if (flags.new_editor_v2) inBoth += 1;
    }
  }

  expect(inFirst / USERS.length).toBeGreaterThan(0.07);
  expect(inFirst / USERS.length).toBeLessThan(0.13);
  // About 0.10 when independent; the old hash gave about 0.9.
  expect(inBoth / inFirst).toBeLessThan(0.25);
});

test('a user stays in the cohort as the rollout grows', async () => {
  const cohort = async (percent) => {
    listFlags([{ key: 'demo', enabled: true, rollout_percent: percent }]);
    const members = [];
    for (const uid of USERS.slice(0, 500)) {
      if ((await getAllFlagsForUser(uid)).demo) members.push(uid);
    }
    return members;
  };

  const small = await cohort(10);
  const large = await cohort(50);

  expect(large).toEqual(expect.arrayContaining(small));
});

describe('ADMIN-005: flag enforcement', () => {
  const ON = (key) => ({ key, enabled: true, rollout_percent: 100 });
  const OFF = (key) => ({ key, enabled: false, rollout_percent: 100 });

  async function runMiddleware(flagKey) {
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();
    await requireFeatureFlag(flagKey)({ user: { firebaseUid: 'synthetic-uid' } }, res, next);
    return { res, next };
  }

  it('does not treat Object.prototype names as flags', async () => {
    listFlags([ON('demo')]);

    expect(await isFeatureEnabled('constructor', 'synthetic-uid')).toBe(false);
    const { res, next } = await runMiddleware('constructor');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes an enabled flag and refuses a disabled one', async () => {
    listFlags([ON('demo'), OFF('other')]);

    expect((await runMiddleware('demo')).next).toHaveBeenCalledWith();
    expect((await runMiddleware('other')).res.status).toHaveBeenCalledWith(403);
  });

  it('fails closed when the lookup fails', async () => {
    failLookup();

    const { res, next } = await runMiddleware('demo');
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reads the flags once for many checks', async () => {
    const spy = listFlags([ON('demo')]);

    await Promise.all(USERS.slice(0, 50).map((uid) => isFeatureEnabled('demo', uid)));
    await isFeatureEnabled('demo', 'synthetic-uid');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  describe('audit_logs', () => {
    const entry = { actorFirebaseUid: 'synthetic-uid', action: 'auth.login', resourceType: 'session' };
    let insert;
    beforeEach(() => {
      insert = jest.spyOn(auditLogRepository, 'insertAuditLog').mockResolvedValue(undefined);
    });

    it('skips the write when the flag is off', async () => {
      listFlags([OFF('audit_logs')]);
      await createAuditLog(entry);
      expect(insert).not.toHaveBeenCalled();
    });

    it.each([
      ['on', () => listFlags([ON('audit_logs')])],
      ['missing', () => listFlags([])],
      ['unreadable', failLookup],
    ])('still writes when the flag is %s', async (_label, setUp) => {
      setUp();
      await createAuditLog(entry);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('always records a change to the audit_logs flag itself', async () => {
      listFlags([OFF('audit_logs')]);
      await createAuditLog({ ...entry, resourceType: 'feature_flag', resourceId: 'audit_logs' });
      expect(insert).toHaveBeenCalledTimes(1);
    });
  });
});
