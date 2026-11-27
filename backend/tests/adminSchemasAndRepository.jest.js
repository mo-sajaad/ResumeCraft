// ADMIN-011 input rules, ADMIN-010 usage totals and the ADMIN-007 transaction,
// at the schema and repository level. The pool is a stub; no SQL runs.
jest.mock('../config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const pool = require('../config/db');
const { featureFlagKeySchema, updateFeatureFlagSchema } = require('../modules/admin/schemas/adminSchemas');
const { listUsageSummary, updateFeatureFlagWithAudit } = require('../modules/admin/repositories/adminRepository');

describe('ADMIN-011: flag keys', () => {
  test.each([
    ['empty', ''],
    ['upper case', 'Upper'],
    ['a leading digit', '1abc'],
    ['a hyphen', 'a-b'],
    ['a space', 'a b'],
    ['a dot', 'a.b'],
    ['a leading underscore', '_abc'],
    ['65 characters', `a${'b'.repeat(64)}`],
    ['a non-string', 42],
  ])('refuses a key with %s', (_label, key) => {
    expect(featureFlagKeySchema.safeParse(key).success).toBe(false);
  });

  test.each(['a', 'demo', 'admin_dashboard', 'feature_2', `a${'b'.repeat(63)}`])('accepts %s', (key) => {
    expect(featureFlagKeySchema.safeParse(key)).toEqual({ success: true, data: key });
  });
});

describe('ADMIN-011: update body', () => {
  const parse = (body) => updateFeatureFlagSchema.safeParse(body);

  test.each([12.5, -1, 101, '50', null, Number.NaN, Infinity])('refuses rolloutPercent %p', (rolloutPercent) => {
    expect(parse({ enabled: true, rolloutPercent }).success).toBe(false);
  });

  test.each([0, 1, 50, 100])('accepts rolloutPercent %p', (rolloutPercent) => {
    expect(parse({ enabled: true, rolloutPercent })).toEqual({ success: true, data: { enabled: true, rolloutPercent } });
  });

  test.each([undefined, 'true', 1, null])('refuses enabled %p', (enabled) => {
    expect(parse({ enabled }).success).toBe(false);
  });

  test('refuses a description over 500 characters after trimming', () => {
    expect(parse({ enabled: true, description: 'x'.repeat(501) }).success).toBe(false);
    expect(parse({ enabled: true, description: `  ${'x'.repeat(500)}  ` }).data.description).toHaveLength(500);
  });

  test.each([
    ['omitted', {}, undefined, false],
    ['null', { description: null }, null, true],
    ['empty', { description: '' }, '', true],
    ['blank', { description: '   ' }, '', true],
    ['padded', { description: '  Hello  ' }, 'Hello', true],
  ])('a description that is %s parses as expected', (_label, body, description, present) => {
    const { success, data } = parse({ enabled: true, ...body });
    expect(success).toBe(true);
    expect(data.description).toBe(description);
    expect('description' in data).toBe(present);
  });
});

describe('ADMIN-010: usage summary', () => {
  const row = (i, groupCount, total) => ({
    route: `/r${i}`, event_type: 'api_request', count: 100 - i, group_count: groupCount, total_events: total,
  });

  test('returns the rows in ranked order with only route, event_type and count', async () => {
    pool.query.mockResolvedValue({ rows: [row(0, 2, '199'), row(1, 2, '199')] });

    const summary = await listUsageSummary(30);

    expect(summary).toEqual({
      events: [
        { route: '/r0', event_type: 'api_request', count: 100 },
        { route: '/r1', event_type: 'api_request', count: 99 },
      ],
      truncated: false,
      totalEvents: 199,
    });
    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual(['30', 50]);
    expect(sql).toMatch(/GROUP BY route, event_type/);
    expect(sql).toMatch(/ORDER BY count DESC/);
    expect(sql).toMatch(/LIMIT \$2/);
    // Totals span the whole window: no per-day split.
    expect(sql).not.toMatch(/date_trunc|GROUP BY 1/);
  });

  test('exactly 50 groups is not truncated', async () => {
    pool.query.mockResolvedValue({ rows: Array.from({ length: 50 }, (_, i) => row(i, 50, '1000')) });

    const summary = await listUsageSummary(7);

    expect(summary.events).toHaveLength(50);
    expect(summary.truncated).toBe(false);
    expect(summary.totalEvents).toBe(1000);
  });

  test('more than 50 groups is truncated and totalEvents still counts them all', async () => {
    pool.query.mockResolvedValue({ rows: Array.from({ length: 50 }, (_, i) => row(i, 51, '9007199254')) });

    const summary = await listUsageSummary(7);

    expect(summary.truncated).toBe(true);
    expect(summary.totalEvents).toBe(9007199254);
  });

  test('an empty window', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await listUsageSummary(7)).toEqual({ events: [], truncated: false, totalEvents: 0 });
  });
});

describe('ADMIN-007: updateFeatureFlagWithAudit', () => {
  function fakeClient({ failOn, failRollback = false } = {}) {
    const commands = [];
    const client = {
      commands,
      released: 0,
      async query(sql) {
        const command = sql.trim().split(/\s+/)[0].toUpperCase();
        commands.push(/audit_logs/.test(sql) ? 'AUDIT' : /INSERT INTO feature_flags/.test(sql) ? 'UPSERT' : command);
        if (command === 'ROLLBACK' && failRollback) throw new Error('synthetic rollback failure');
        if (failOn && failOn.test(sql)) throw new Error('synthetic statement failure');
        if (/FOR UPDATE/.test(sql)) return { rows: [{ key: 'demo', enabled: false, rollout_percent: 10 }] };
        if (/INSERT INTO feature_flags/.test(sql)) return { rows: [{ key: 'demo', enabled: true, rollout_percent: 10 }] };
        return { rows: [] };
      },
      release() { client.released += 1; },
    };
    pool.connect.mockResolvedValue(client);
    return client;
  }

  const audit = () => ({ action: 'feature_flag.update', resourceType: 'feature_flag', resourceId: 'demo' });

  test('commits the flag and the audit together and passes before and after to the builder', async () => {
    const client = fakeClient();
    const build = jest.fn(audit);

    const result = await updateFeatureFlagWithAudit({ key: 'demo', enabled: true }, build);

    expect(client.commands).toEqual(['BEGIN', 'SELECT', 'UPSERT', 'AUDIT', 'COMMIT']);
    expect(build).toHaveBeenCalledWith(result.before, result.after);
    expect(result.before).toMatchObject({ enabled: false });
    expect(result.after).toMatchObject({ enabled: true });
    expect(client.released).toBe(1);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('a builder that returns a falsy value skips the audit insert', async () => {
    const client = fakeClient();

    await updateFeatureFlagWithAudit({ key: 'demo', enabled: true }, () => false);

    expect(client.commands).toEqual(['BEGIN', 'SELECT', 'UPSERT', 'COMMIT']);
  });

  test('a failed audit insert rolls back, releases and rethrows', async () => {
    const client = fakeClient({ failOn: /audit_logs/ });

    await expect(updateFeatureFlagWithAudit({ key: 'demo', enabled: true }, audit))
      .rejects.toThrow('synthetic statement failure');
    expect(client.commands).toEqual(['BEGIN', 'SELECT', 'UPSERT', 'AUDIT', 'ROLLBACK']);
    expect(client.released).toBe(1);
  });

  test('a failed ROLLBACK keeps the original error', async () => {
    const client = fakeClient({ failOn: /audit_logs/, failRollback: true });

    await expect(updateFeatureFlagWithAudit({ key: 'demo', enabled: true }, audit))
      .rejects.toThrow('synthetic statement failure');
    expect(client.released).toBe(1);
  });

  test('an omitted rollout and description keep the stored values (ADMIN-006, ADMIN-011)', async () => {
    const client = fakeClient();
    const calls = [];
    const query = client.query;
    client.query = async (sql, params) => { calls.push({ sql, params }); return query(sql, params); };

    await updateFeatureFlagWithAudit({ key: 'demo', enabled: true }, () => null);

    const { sql, params } = calls.find((call) => /INSERT INTO feature_flags/.test(call.sql));
    expect(params).toEqual(['demo', null, true, null, false]);
    expect(sql).toMatch(/COALESCE\(\$4::int, feature_flags\.rollout_percent\)/);
    expect(sql).toMatch(/COALESCE\(\$4::int, 100\)/);
  });
});
