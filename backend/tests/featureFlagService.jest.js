// Feature flag evaluation. The flag rows are synthetic; no database is used.
jest.mock('../config/db', () => ({ query: jest.fn() }));

const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');
const { getAllFlagsForUser } = require('../services/featureFlagService');

const USERS = Array.from({ length: 5000 }, (_, i) => `synthetic-uid-${i}`);

function listFlags(rows) {
  jest.spyOn(featureFlagRepository, 'listAllFlags').mockResolvedValue(rows);
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
