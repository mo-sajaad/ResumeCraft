// Opt-in: runs the real migrations against a throwaway local PostgreSQL.
//
// Skipped unless MIGRATION_TEST_DATABASE_URL is set. It must point at an
// EMPTY database on 127.0.0.1 or localhost (any other host is refused), and
// that database is changed: the schema is created, reverted and re-applied.
// The test refuses to start if the database already has tables.
//
//   docker run -d --rm --name rc-migrate-test -p 127.0.0.1:55432:5432 \
//     -e POSTGRES_PASSWORD=test -e POSTGRES_DB=migrate_test postgres:15
//   MIGRATION_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/migrate_test \
//     node --require ./tests/support/isolate.js --test tests/migrationsDatabase.test.js
//   docker stop rc-migrate-test
//
// Covers PLATFORM-012 (node-pg-migrate, baseline cannot be reverted) and
// PLATFORM-013 (indexes, unique payment ID, updated_at triggers, free plan
// error, working down step).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const URL_VAR = 'MIGRATION_TEST_DATABASE_URL';
const backendRoot = path.join(__dirname, '..');
const migrationsDir = path.join(backendRoot, 'migrations');
const cli = path.join(backendRoot, 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');

// Throws unless the URL is a postgres URL for this machine only.
function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${URL_VAR} is not a valid URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${URL_VAR} must be a postgres:// URL`);
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${URL_VAR} host must be 127.0.0.1 or localhost`);
  }
  // pg lets query parameters override the host (for example ?host=...).
  for (const key of url.searchParams.keys()) {
    if (/host|service|sslrootcert|options/i.test(key)) {
      throw new Error(`${URL_VAR} must not set "${key}" in the query string`);
    }
  }
  return url;
}

test('migration database guard: only local postgres URLs are accepted', () => {
  for (const ok of [
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgres://u@localhost/db',
  ]) {
    assert.doesNotThrow(() => assertLocalDatabaseUrl(ok), ok);
  }
  for (const bad of [
    'postgresql://u:p@db.example.com:5432/db',
    'postgresql://u:p@10.0.0.5/db',
    'postgresql://u:p@127.0.0.1.example.com/db',
    'postgresql://u:p@[::ffff:7f00:1]/db',
    'postgresql://u:p@127.0.0.1/db?host=db.example.com',
    'postgresql://u:p@localhost/db?hostaddr=10.0.0.5',
    'mysql://u:p@127.0.0.1/db',
    '/var/run/postgresql',
    'not a url',
  ]) {
    assert.throws(() => assertLocalDatabaseUrl(bad), bad);
  }
});

const databaseUrl = process.env[URL_VAR];

test('migrations against a local database', { skip: databaseUrl ? false : `set ${URL_VAR} to run` }, async (t) => {
  assertLocalDatabaseUrl(databaseUrl);
  const { Client } = require('pg');

  // Runs the CLI with only the test URL in its environment, from an empty
  // directory, so no .env file or PG* variable can redirect it.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-migrate-'));
  const emptyEnv = path.join(workDir, 'empty.env');
  fs.writeFileSync(emptyEnv, '');
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  function migrate(...args) {
    const result = spawnSync(process.execPath, [
      cli, ...args,
      '--migrations-dir', migrationsDir,
      '--database-url-var', URL_VAR,
      '--envPath', emptyEnv,
    ], {
      cwd: workDir,
      env: { PATH: process.env.PATH, [URL_VAR]: databaseUrl },
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  t.after(() => client.end());

  const query = async (sql, params) => (await client.query(sql, params)).rows;
  const appliedMigrations = async () => (await query('SELECT name, run_on FROM pgmigrations ORDER BY id'));

  const existing = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  assert.deepEqual(existing, [], 'Refusing to run: the test database must be empty');

  const expectedIndexes = [
    'idx_ai_usage_user_type_created_at',
    'idx_auth_identities_user_id',
    'idx_payment_transactions_subscription_id',
    'idx_subscriptions_plan_id',
    'unique_payment_transactions_provider_payment_id',
  ];
  const triggeredTables = [
    'cover_letters', 'educations', 'feature_flags', 'projects', 'resumes',
    'subscriptions', 'user_preferences', 'users', 'work_experiences',
  ];

  const indexes = async () => query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1) ORDER BY indexname",
    [expectedIndexes]
  );
  const updatedAtTriggers = async () => query(`
    SELECT t.tgname, c.relname AS table_name, p.proname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND t.tgname LIKE 'trigger\\_%\\_updated\\_at'
    ORDER BY c.relname`);
  const freeSubscriptionSource = async () => (await query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'create_free_subscription'"
  ))[0].prosrc;

  // Runs body in a transaction that is always rolled back.
  async function inRolledBackTransaction(body) {
    await client.query('BEGIN');
    try {
      await body();
    } finally {
      await client.query('ROLLBACK');
    }
  }
  const insertUser = async (suffix, extra = '') => (await query(
    `INSERT INTO users (firebase_uid, email${extra ? ', updated_at' : ''})
     VALUES ($1, $2${extra ? `, ${extra}` : ''}) RETURNING id, updated_at`,
    [`uid-${suffix}`, `${suffix}@example.test`]
  ))[0];

  await t.test('up applies the baseline and then the constraints migration', async () => {
    const result = migrate('up');
    assert.equal(result.status, 0, result.output);
    assert.deepEqual((await appliedMigrations()).map((m) => m.name), [
      '1795802143249_baseline',
      '1795802374778_schema-constraints-and-indexes',
    ]);
  });

  await t.test('the new indexes exist with the intended columns', async () => {
    const rows = await indexes();
    assert.deepEqual(rows.map((r) => r.indexname), expectedIndexes);
    const def = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    assert.match(def.idx_ai_usage_user_type_created_at, /ON public\.ai_usage USING btree \(user_id, type, created_at\)/);
    assert.match(def.unique_payment_transactions_provider_payment_id,
      /^CREATE UNIQUE INDEX .* ON public\.payment_transactions USING btree \(provider, provider_payment_id\) WHERE \(provider_payment_id IS NOT NULL\)$/);
  });

  await t.test('every table with updated_at has a set_updated_at trigger', async () => {
    const rows = await updatedAtTriggers();
    assert.deepEqual(rows.map((r) => r.table_name), triggeredTables);
    for (const row of rows) {
      assert.equal(row.tgname, `trigger_${row.table_name}_updated_at`);
      assert.equal(row.proname, 'set_updated_at');
    }
  });

  await t.test('a duplicate (provider, provider_payment_id) is rejected; NULL IDs are allowed', async () => {
    await inRolledBackTransaction(async () => {
      const user = await insertUser('payments');
      const insertPayment = (id) => client.query(
        "INSERT INTO payment_transactions (user_id, amount_cents, provider, provider_payment_id, status) VALUES ($1, 100, 'stripe', $2, 'succeeded')",
        [user.id, id]
      );
      await insertPayment('pi_1');
      await insertPayment(null);
      await insertPayment(null);
      await client.query("INSERT INTO payment_transactions (user_id, amount_cents, provider, provider_payment_id, status) VALUES ($1, 100, 'other', 'pi_1', 'succeeded')", [user.id]);
      await assert.rejects(insertPayment('pi_1'), (error) => {
        assert.equal(error.code, '23505');
        assert.equal(error.constraint, 'unique_payment_transactions_provider_payment_id');
        return true;
      });
    });
  });

  await t.test('an UPDATE sets updated_at to now, even if the caller sends an old value', async () => {
    await inRolledBackTransaction(async () => {
      const user = await insertUser('updated', "'2000-01-01T00:00:00Z'");
      assert.equal(user.updated_at.toISOString(), '2000-01-01T00:00:00.000Z');
      const [row] = await query(
        "UPDATE users SET full_name = 'Changed', updated_at = '2001-01-01T00:00:00Z' WHERE id = $1 RETURNING updated_at, NOW() AS now",
        [user.id]
      );
      assert.equal(row.updated_at.getTime(), row.now.getTime());

      const [flag] = await query(
        "UPDATE feature_flags SET enabled = NOT enabled WHERE key = 'admin_dashboard' RETURNING updated_at, NOW() AS now"
      );
      assert.equal(flag.updated_at.getTime(), flag.now.getTime());
    });
  });

  await t.test('creating a user without a free plan fails with a clear message', async () => {
    await inRolledBackTransaction(async () => {
      await client.query("DELETE FROM plans WHERE code = 'free'");
      await assert.rejects(insertUser('noplan'), (error) => {
        assert.equal(error.code, '23502');
        assert.match(error.message, /No plan with code 'free' exists/);
        return true;
      });
    });
  });

  await t.test('down 1 reverts only the constraints migration', async () => {
    const result = migrate('down', '1');
    assert.equal(result.status, 0, result.output);
    assert.deepEqual((await appliedMigrations()).map((m) => m.name), ['1795802143249_baseline']);
    assert.deepEqual(await indexes(), []);
    assert.deepEqual(await updatedAtTriggers(), []);
    assert.deepEqual(await query("SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'"), []);
    assert.doesNotMatch(await freeSubscriptionSource(), /No plan with code/);
    assert.equal((await query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'users'"))[0].n, 1);
  });

  await t.test('the baseline cannot be reverted', async () => {
    const result = migrate('down', '1');
    assert.notEqual(result.status, 0, 'down on the baseline must fail');
    assert.deepEqual((await appliedMigrations()).map((m) => m.name), ['1795802143249_baseline']);
    assert.equal((await query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'users'"))[0].n, 1);
  });

  await t.test('up re-applies the constraints migration', async () => {
    const result = migrate('up');
    assert.equal(result.status, 0, result.output);
    assert.equal((await appliedMigrations()).length, 2);
    assert.deepEqual((await indexes()).map((r) => r.indexname), expectedIndexes);
    assert.equal((await updatedAtTriggers()).length, triggeredTables.length);
    assert.match(await freeSubscriptionSource(), /No plan with code/);
  });

  await t.test('a second up is a no-op', async () => {
    const before = await appliedMigrations();
    const result = migrate('up');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /No migrations to run/);
    assert.deepEqual(await appliedMigrations(), before);
  });
});
