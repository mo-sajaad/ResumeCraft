// ADMIN-005 flag cache and lookups, ADMIN-012 rollout buckets. The flag rows
// are synthetic and the repository is stubbed; no database is used.
jest.mock('../config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');
const {
  clearFeatureFlagCache,
  getAllFlagsForUser,
  isFeatureEnabled,
  isSwitchEnabled,
} = require('../services/featureFlagService');

const ON = (key, rollout = 100) => ({ key, enabled: true, rollout_percent: rollout });
const OFF = (key) => ({ key, enabled: false, rollout_percent: 100 });
const USERS = Array.from({ length: 10000 }, (_, i) => `synthetic-uid-${i}`);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearFeatureFlagCache();
});

afterEach(() => {
  jest.useRealTimers();
  clearFeatureFlagCache();
});

describe('ADMIN-005: flag cache', () => {
  test('two concurrent lookups share one query', async () => {
    const pending = deferred();
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags').mockReturnValue(pending.promise);

    const first = isFeatureEnabled('demo', 'synthetic-a');
    const second = getAllFlagsForUser('synthetic-b');
    pending.resolve([ON('demo')]);

    expect(await first).toBe(true);
    expect((await second).demo).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a cached value is reused within 5 s and refetched after', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags')
      .mockResolvedValueOnce([ON('demo')])
      .mockResolvedValueOnce([OFF('demo')]);

    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(true);
    jest.advanceTimersByTime(4999);
    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('clearing the cache makes the next lookup read again', async () => {
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags')
      .mockResolvedValueOnce([ON('demo')])
      .mockResolvedValueOnce([OFF('demo')]);

    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(true);
    clearFeatureFlagCache();
    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('a lookup started before a clear does not refill the cache with old rows', async () => {
    const stale = deferred();
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags')
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([OFF('demo')]);

    const early = isFeatureEnabled('demo', 'synthetic-a');
    clearFeatureFlagCache();
    const late = isFeatureEnabled('demo', 'synthetic-a');
    stale.resolve([ON('demo')]);

    expect(await early).toBe(true);
    expect(await late).toBe(false);
    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('a failed lookup is not cached; the next call retries', async () => {
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags')
      .mockRejectedValueOnce(new Error('synthetic lookup failure'))
      .mockResolvedValueOnce([ON('demo')]);

    await expect(isFeatureEnabled('demo', 'synthetic-a')).rejects.toThrow('synthetic lookup failure');
    expect(await isFeatureEnabled('demo', 'synthetic-a')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('concurrent lookups all see the same failure', async () => {
    const pending = deferred();
    const spy = jest.spyOn(featureFlagRepository, 'listAllFlags').mockReturnValue(pending.promise);

    const lookups = [isFeatureEnabled('demo', 'a'), isFeatureEnabled('demo', 'b')];
    pending.reject(new Error('synthetic lookup failure'));

    for (const lookup of lookups) await expect(lookup).rejects.toThrow('synthetic lookup failure');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('ADMIN-005: flag names', () => {
  test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    '%s is never a flag',
    async (name) => {
      jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue([ON('demo')]);

      const flags = await getAllFlagsForUser('synthetic-a');
      expect(Object.getPrototypeOf(flags)).toBeNull();
      expect(flags[name]).toBeUndefined();
      expect(await isFeatureEnabled(name, 'synthetic-a')).toBe(false);
      expect(await isFeatureEnabled(name, 'synthetic-a', { ifMissing: true })).toBe(true);
      expect(await isSwitchEnabled(name)).toBe(false);
    }
  );

  test('ifMissing applies only to a flag with no row', async () => {
    jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue([OFF('present_off')]);

    expect(await isFeatureEnabled('present_off', 'synthetic-a', { ifMissing: true })).toBe(false);
    expect(await isFeatureEnabled('absent', 'synthetic-a', { ifMissing: true })).toBe(true);
    expect(await isFeatureEnabled('absent', 'synthetic-a')).toBe(false);
  });

  test('isSwitchEnabled ignores the rollout percent and honours ifMissing', async () => {
    jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue([ON('zero', 0), OFF('off')]);

    expect(await isSwitchEnabled('zero')).toBe(true);
    expect(await isSwitchEnabled('off', { ifMissing: true })).toBe(false);
    expect(await isSwitchEnabled('absent', { ifMissing: true })).toBe(true);
    expect(await isSwitchEnabled('absent')).toBe(false);
  });
});

describe('ADMIN-012: rollout buckets', () => {
  async function membersOf(rows, key, users = USERS) {
    clearFeatureFlagCache();
    jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue(rows);
    const members = new Set();
    for (const uid of users) {
      if ((await getAllFlagsForUser(uid))[key]) members.add(uid);
    }
    return members;
  }

  test('the bucket is the same for the same flag and user on every read', async () => {
    const first = await membersOf([ON('demo', 30)], 'demo', USERS.slice(0, 1000));
    const second = await membersOf([ON('demo', 30)], 'demo', USERS.slice(0, 1000));

    expect([...second]).toEqual([...first]);
  });

  test.each([0, 1, 25, 50, 90, 100])('a %i%% rollout admits about that share of users', async (percent) => {
    const members = await membersOf([ON('demo', percent)], 'demo');
    const share = (members.size / USERS.length) * 100;

    if (percent === 0) expect(members.size).toBe(0);
    else if (percent === 100) expect(members.size).toBe(USERS.length);
    else {
      expect(share).toBeGreaterThan(percent - 2);
      expect(share).toBeLessThan(percent + 2);
    }
  });

  test('a disabled flag admits nobody whatever its rollout', async () => {
    expect((await membersOf([OFF('demo')], 'demo', USERS.slice(0, 500))).size).toBe(0);
  });

  test('feature_a and feature_b overlap close to chance', async () => {
    const rows = [ON('feature_a', 50), ON('feature_b', 50)];
    const a = await membersOf(rows, 'feature_a');
    const b = await membersOf(rows, 'feature_b');

    const both = [...a].filter((uid) => b.has(uid)).length;
    // Independent cohorts share about 50% of their members.
    expect(both / a.size).toBeGreaterThan(0.45);
    expect(both / a.size).toBeLessThan(0.55);
  });

  test('a different flag puts the same user in a different bucket for many users', async () => {
    const rows = [ON('feature_a', 10), ON('feature_b', 10)];
    const a = await membersOf(rows, 'feature_a');
    const b = await membersOf(rows, 'feature_b');

    const both = [...a].filter((uid) => b.has(uid)).length;
    expect(both / a.size).toBeLessThan(0.2);
  });
});
