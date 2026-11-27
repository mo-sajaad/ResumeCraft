// IDENTITY-023: preferences use one COALESCE upsert, and a failed ROLLBACK does
// not hide the original error. The fake client applies the statement's own
// COALESCE so a read-then-write implementation shows up as a different call.
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());

const db = require('../config/db');
const userService = require('../services/userService');

const UID = 'synthetic-uid';

beforeEach(() => {
  db.reset();
  db.on(/FROM users/, () => ({ rows: [{ id: 1 }] }));
});

describe('IDENTITY-023: preference updates', () => {
  it('sends null for the value that was not given, so the database keeps it', async () => {
    const stored = { weekly_insights: true, job_alerts: true };
    db.on(/INSERT INTO user_preferences/, ([, weekly, jobs], { sql }) => {
      expect(sql).toMatch(/COALESCE\(\$3::boolean, user_preferences\.job_alerts\)/);
      return { rows: [{ user_id: 1, weekly_insights: weekly ?? stored.weekly_insights, job_alerts: jobs ?? stored.job_alerts }] };
    });

    const result = await userService.updateUserPreferences(UID, { weeklyInsights: false });

    expect(result).toMatchObject({ weekly_insights: false, job_alerts: true });
    const [call] = db.callsMatching(/INSERT INTO user_preferences/);
    expect(call.params).toEqual([1, false, null]);
    expect(db.callsMatching(/SELECT[\s\S]*FROM user_preferences/)).toEqual([]);
  });

  it('rethrows the original error when ROLLBACK also fails', async () => {
    const connect = db.connect;
    db.connect = async () => {
      const client = await connect();
      return {
        release: () => client.release(),
        query: (sql, params) => {
          if (/^\s*ROLLBACK/i.test(sql)) return Promise.reject(new Error('synthetic rollback failure'));
          if (/user_preferences/.test(sql)) return Promise.reject(new Error('synthetic write failure'));
          return client.query(sql, params);
        },
      };
    };
    try {
      await expect(userService.updateUserPreferences(UID, { jobAlerts: true }))
        .rejects.toThrow('synthetic write failure');
    } finally {
      db.connect = connect;
    }
  });
});
