// Static checks for the container image and the schema migrations.
// They only read files, so they always run: no Docker and no database.
// Covers PLATFORM-010 (Dockerfile), PLATFORM-011 (.dockerignore),
// PLATFORM-012 (node-pg-migrate and the baseline) and PLATFORM-013
// (the constraints migration and its undo step).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const migrationsDir = path.join(backendRoot, 'migrations');
const read = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');

// ---------- Dockerfile ----------

// Joins "\" continuations and drops comments, returning { keyword, args } per instruction.
function parseDockerfile(text) {
  const logical = [];
  let current = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!current && (line === '' || line.startsWith('#'))) continue;
    if (line.startsWith('#')) continue;
    if (line.endsWith('\\')) {
      current += `${line.slice(0, -1)} `;
      continue;
    }
    current += line;
    logical.push(current.trim());
    current = '';
  }
  if (current.trim()) logical.push(current.trim());
  return logical.map((line) => {
    const [keyword] = line.split(/\s+/, 1);
    return { keyword: keyword.toUpperCase(), args: line.slice(keyword.length).trim() };
  });
}

const dockerfile = parseDockerfile(read('Dockerfile'));
const indexOf = (keyword) => dockerfile.findIndex((i) => i.keyword === keyword);
const lastIndexOf = (keyword) => dockerfile.map((i) => i.keyword).lastIndexOf(keyword);

test('Dockerfile: every base image is Node 22 pinned by an sha256 digest', () => {
  const froms = dockerfile.filter((i) => i.keyword === 'FROM');
  assert.ok(froms.length >= 1, 'Dockerfile has no FROM');
  for (const { args } of froms) {
    const image = args.split(/\s+/)[0];
    assert.match(image, /^(docker\.io\/(library\/)?)?node:22([.-][\w.-]*)?@sha256:[0-9a-f]{64}$/,
      `Base image must be node:22 pinned by digest, got "${image}"`);
  }
});

test('Dockerfile: a non-root USER is set before CMD and never switched back to root', () => {
  const cmd = lastIndexOf('CMD');
  assert.ok(cmd >= 0, 'Dockerfile has no CMD');
  const users = dockerfile
    .map((instruction, index) => ({ ...instruction, index }))
    .filter((i) => i.keyword === 'USER');
  assert.ok(users.length >= 1, 'Dockerfile has no USER instruction');
  const effective = users.filter((u) => u.index < cmd).pop();
  assert.ok(effective, 'USER must come before CMD');
  const name = effective.args.split(':')[0].trim();
  assert.notEqual(name, '', 'USER is empty');
  assert.ok(!['root', '0'].includes(name), `USER must not be root, got "${effective.args}"`);
});

test('Dockerfile: ENTRYPOINT runs tini, which then runs CMD', () => {
  const entry = dockerfile[lastIndexOf('ENTRYPOINT')];
  assert.ok(entry, 'Dockerfile has no ENTRYPOINT');
  const parsed = JSON.parse(entry.args);
  assert.ok(Array.isArray(parsed), 'ENTRYPOINT must use the exec (JSON array) form');
  assert.match(parsed[0], /(^|\/)tini$/);
  assert.equal(parsed[1], '--', 'tini needs "--" so CMD arguments are not parsed as tini flags');
  assert.match(dockerfile.filter((i) => i.keyword === 'RUN').map((i) => i.args).join('\n'),
    /apt-get install[^\n]*\btini\b/, 'tini must be installed in the image');
});

test('Dockerfile: dependencies are installed with npm ci --omit=dev', () => {
  const runs = dockerfile.filter((i) => i.keyword === 'RUN').map((i) => i.args);
  assert.ok(runs.some((r) => /\bnpm ci\b[^&;|]*--omit=dev\b/.test(r)), 'Expected "npm ci --omit=dev"');
  for (const run of runs) {
    assert.doesNotMatch(run, /--only=prod(uction)?\b/, `Deprecated flag in: ${run}`);
    assert.doesNotMatch(run, /\bnpm (install|i)\b/, `Use npm ci, not npm install: ${run}`);
  }
  // The install must run on the lockfile before the source is copied.
  const manifestCopy = dockerfile.findIndex((i) => i.keyword === 'COPY' && /package\*?\.json|package-lock\.json/.test(i.args));
  const install = dockerfile.findIndex((i) => i.keyword === 'RUN' && /\bnpm ci\b/.test(i.args));
  assert.ok(manifestCopy >= 0 && manifestCopy < install, 'package*.json must be copied before npm ci');
});

test('Dockerfile: no COPY or ADD names .env, env.yaml or a service-account file', () => {
  const secretSource = /(^|[\s/"'[,])(\.env[\w.*-]*|env\.ya?ml|[\w*.-]*service-account[\w*.-]*\.json)(?=$|[\s"',\]])/i;
  for (const { keyword, args } of dockerfile.filter((i) => ['COPY', 'ADD'].includes(i.keyword))) {
    assert.doesNotMatch(args, secretSource, `${keyword} ${args} copies a secret`);
  }
  assert.ok(indexOf('COPY') >= 0);
});

// ---------- .dockerignore ----------

const dockerignorePatterns = read('.dockerignore')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

// Docker semantics: patterns are relative to the context root, the last
// matching pattern wins, and a pattern that matches a directory excludes
// everything under it.
function isExcluded(file) {
  const parts = file.split('/');
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  let excluded = false;
  for (const raw of dockerignorePatterns) {
    const negate = raw.startsWith('!');
    const pattern = (negate ? raw.slice(1) : raw).replace(/^\/+/, '').replace(/\/+$/, '');
    if (candidates.some((c) => path.matchesGlob(c, pattern))) excluded = !negate;
  }
  return excluded;
}

test('.dockerignore: lists every pattern the image fix relies on', () => {
  for (const pattern of [
    'node_modules', '.env', '.env.*', 'env.yaml', 'tests', 'coverage', 'jest.config.cjs',
    'eslint.config.cjs', '*.md', 'firebase-service-account*.json', '*.local', 'db/*', '!db/schema.sql',
  ]) {
    assert.ok(dockerignorePatterns.includes(pattern), `.dockerignore is missing "${pattern}"`);
  }
  assert.ok(dockerignorePatterns.indexOf('db/*') < dockerignorePatterns.indexOf('!db/schema.sql'),
    '"!db/schema.sql" must come after "db/*" to re-include it');
});

test('.dockerignore: tests, local config and secrets stay out of the build context', () => {
  for (const file of [
    'tests/migrationsAndImage.test.js', 'tests/support/isolate.js', 'coverage/lcov.info',
    'jest.config.cjs', 'eslint.config.cjs', 'README.md', 'Dockerfile', '.dockerignore',
    '.env', '.env.production', 'env.yaml', 'firebase-service-account.json',
    'firebase-service-account-prod.json', 'settings.local', 'db/README.md', 'db/seed_admin.sql',
    'db/old_migration.sql', 'node_modules/pg/package.json',
  ]) {
    assert.ok(isExcluded(file), `${file} would be copied into the image`);
  }
});

test('.dockerignore: the app, db/schema.sql and every migration are still copied', () => {
  assert.ok(!dockerignorePatterns.some((p) => /^!?\/?migrations(\/|$)/.test(p)), 'migrations/ must not be listed');
  const migrationFiles = fs.readdirSync(migrationsDir).map((f) => `migrations/${f}`);
  assert.ok(migrationFiles.length > 0);
  for (const file of [
    'server.js', 'app.js', 'package.json', 'package-lock.json', 'db/schema.sql',
    'config/db.js', 'routes/careerToolsRoutes.js', ...migrationFiles,
  ]) {
    assert.ok(!isExcluded(file), `${file} would be left out of the image`);
  }
});

// ---------- package.json ----------

const pkg = JSON.parse(read('package.json'));

test('package.json: engines.node requires Node 22 or later', () => {
  const range = pkg.engines && pkg.engines.node;
  assert.equal(typeof range, 'string', 'engines.node is missing');
  const match = /^>=\s*v?(\d+)(\.\d+){0,2}$/.exec(range.trim());
  assert.ok(match, `engines.node should be a ">=" range, got "${range}"`);
  assert.ok(Number(match[1]) >= 22, `engines.node must require >=22, got "${range}"`);

  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(lock.packages[''].engines, pkg.engines, 'package-lock.json is out of date with engines');
});

test('package.json: migrate:up, migrate:down and migrate:create run node-pg-migrate', () => {
  assert.match(pkg.scripts['migrate:up'] || '', /^node-pg-migrate up\b/);
  assert.match(pkg.scripts['migrate:down'] || '', /^node-pg-migrate down\b/);
  assert.match(pkg.scripts['migrate:create'] || '', /^node-pg-migrate create\b/);
  assert.match(pkg.scripts['migrate:create'], /--migration-file-language sql\b/);
});

test('package.json: node-pg-migrate is a runtime dependency, so npm ci --omit=dev keeps it', () => {
  assert.ok(pkg.dependencies['node-pg-migrate'], 'node-pg-migrate must be in dependencies');
  assert.ok(!(pkg.devDependencies || {})['node-pg-migrate'], 'node-pg-migrate must not be a devDependency');
  const lock = JSON.parse(read('package-lock.json'));
  assert.ok(lock.packages[''].dependencies['node-pg-migrate'], 'package-lock.json root is missing node-pg-migrate');
  const entry = lock.packages['node_modules/node-pg-migrate'];
  assert.ok(entry, 'node-pg-migrate is not locked');
  assert.notEqual(entry.dev, true, 'node-pg-migrate is locked as dev-only');
});

// ---------- migrations ----------

const BASELINE = '1795802143249_baseline.js';
const CONSTRAINTS = '1795802374778_schema-constraints-and-indexes.sql';

test('migrations: files have unique numeric prefixes and sort with the baseline first', () => {
  const files = fs.readdirSync(migrationsDir).filter((f) => !f.startsWith('.'));
  for (const file of files) assert.match(file, /^\d+_[\w-]+\.(js|sql)$/, `Unexpected migration file name: ${file}`);
  const prefixes = files.map((f) => Number(f.split('_')[0]));
  assert.equal(new Set(prefixes).size, prefixes.length, 'Two migrations share a prefix');
  const byName = [...files].sort();
  const byNumber = [...files].sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  assert.deepEqual(byName, byNumber, 'Name order and numeric order disagree');
  assert.equal(byNumber[0], BASELINE, 'The baseline must run first');
  assert.ok(byNumber.indexOf(CONSTRAINTS) > 0, 'The constraints migration must run after the baseline');
});

test('migrations: the baseline runs db/schema.sql unchanged', () => {
  const baseline = require(path.join(migrationsDir, BASELINE));
  const statements = [];
  baseline.up({ sql: (sql) => statements.push(sql) });
  assert.deepEqual(statements, [read('db/schema.sql')]);
});

test('migrations: the baseline down step refuses to run', () => {
  const baseline = require(path.join(migrationsDir, BASELINE));
  // node-pg-migrate treats down === false as irreversible and stops.
  if (baseline.down === false) return;
  assert.equal(typeof baseline.down, 'function', 'down must be false or a function that throws');
  const calls = [];
  const recorder = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  assert.throws(() => baseline.down(recorder));
  assert.deepEqual(calls, [], 'down must not issue any statement');
});

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitSqlMigration(text) {
  const up = text.match(/^-- Up Migration\s*$/gm) || [];
  const down = text.match(/^-- Down Migration\s*$/gm) || [];
  assert.equal(up.length, 1, 'Expected exactly one "-- Up Migration" marker');
  assert.equal(down.length, 1, 'Expected exactly one "-- Down Migration" marker');
  const upAt = text.search(/^-- Up Migration\s*$/m);
  const downAt = text.search(/^-- Down Migration\s*$/m);
  assert.ok(upAt < downAt, 'Up section must come before Down section');
  return {
    up: stripSqlComments(text.slice(upAt, downAt)),
    down: stripSqlComments(text.slice(downAt)),
  };
}

const ident = '"?([A-Za-z_][\\w]*)"?';
const all = (sql, regex) => [...sql.matchAll(regex)];

function objectsCreated(sql) {
  return {
    indexes: all(sql, new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${ident}`, 'gi')).map((m) => m[1]),
    triggers: all(sql, new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+${ident}[\\s\\S]*?\\bON\\s+${ident}`, 'gi')).map((m) => `${m[1]} ON ${m[2]}`),
    functions: all(sql, new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${ident}`, 'gi')).map((m) => m[1]),
  };
}

function objectsDropped(sql) {
  return {
    indexes: all(sql, new RegExp(`DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+EXISTS\\s+)?${ident}`, 'gi')).map((m) => m[1]),
    triggers: all(sql, new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${ident}\\s+ON\\s+${ident}`, 'gi')).map((m) => `${m[1]} ON ${m[2]}`),
    functions: all(sql, new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?${ident}`, 'gi')).map((m) => m[1]),
  };
}

// Body of a plpgsql function, comments and whitespace removed, for comparison.
function functionBody(sql, name) {
  const match = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(sql);
  return match && stripSqlComments(match[1]).replace(/\s+/g, ' ').trim();
}

const constraintsSql = splitSqlMigration(fs.readFileSync(path.join(migrationsDir, CONSTRAINTS), 'utf8'));
const schemaSql = stripSqlComments(read('db/schema.sql'));

test('constraints migration: up creates the indexes, unique payment ID and triggers from the fix', () => {
  const created = objectsCreated(constraintsSql.up);
  assert.deepEqual([...created.indexes].sort(), [
    'idx_ai_usage_user_type_created_at',
    'idx_auth_identities_user_id',
    'idx_payment_transactions_subscription_id',
    'idx_subscriptions_plan_id',
    'unique_payment_transactions_provider_payment_id',
  ]);
  assert.match(constraintsSql.up, /INDEX\s+IF\s+NOT\s+EXISTS\s+idx_ai_usage_user_type_created_at\s+ON\s+ai_usage\s*\(\s*user_id\s*,\s*type\s*,\s*created_at\s*\)/i);
  assert.match(constraintsSql.up,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+unique_payment_transactions_provider_payment_id\s+ON\s+payment_transactions\s*\(\s*provider\s*,\s*provider_payment_id\s*\)\s+WHERE\s+provider_payment_id\s+IS\s+NOT\s+NULL/i);
  assert.match(functionBody(constraintsSql.up, 'create_free_subscription'), /IF free_plan_id IS NULL THEN RAISE EXCEPTION/i);
});

test('constraints migration: every table with updated_at gets the set_updated_at trigger', () => {
  const tablesWithUpdatedAt = all(schemaSql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\);/gi)
    .filter((m) => /^\s*updated_at\s+TIMESTAMPTZ/im.test(m[2]))
    .map((m) => m[1])
    .sort();
  assert.equal(tablesWithUpdatedAt.length, 9);
  const triggered = all(constraintsSql.up,
    /CREATE\s+TRIGGER\s+(\w+)\s+BEFORE\s+UPDATE\s+ON\s+(\w+)\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+set_updated_at\(\)/gi);
  assert.deepEqual(triggered.map((m) => m[2]).sort(), tablesWithUpdatedAt);
  for (const [, name, table] of triggered) assert.equal(name, `trigger_${table}_updated_at`);
});

test('constraints migration: down drops exactly what up creates', () => {
  const created = objectsCreated(constraintsSql.up);
  const dropped = objectsDropped(constraintsSql.down);
  assert.deepEqual([...dropped.indexes].sort(), [...created.indexes].sort());
  assert.deepEqual([...dropped.triggers].sort(), [...created.triggers].sort());

  // A function is either new (and dropped) or replaced (and restored to the baseline).
  const baselineFunctions = objectsCreated(schemaSql).functions;
  const restored = objectsCreated(constraintsSql.down).functions;
  for (const fn of created.functions) {
    if (baselineFunctions.includes(fn)) {
      assert.ok(restored.includes(fn), `down must restore the baseline ${fn}()`);
      assert.ok(!dropped.functions.includes(fn), `down must not drop the baseline ${fn}()`);
      assert.equal(functionBody(constraintsSql.down, fn), functionBody(schemaSql, fn),
        `down must restore ${fn}() exactly as db/schema.sql defines it`);
    } else {
      assert.ok(dropped.functions.includes(fn), `down must drop ${fn}()`);
    }
  }
  for (const fn of dropped.functions) assert.ok(created.functions.includes(fn), `down drops ${fn}() which up did not create`);
});

test('constraints migration: down drops the triggers before the function they use', () => {
  const dropFunctionAt = constraintsSql.down.search(/DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?set_updated_at/i);
  assert.ok(dropFunctionAt >= 0);
  assert.doesNotMatch(constraintsSql.down.slice(dropFunctionAt), /DROP\s+TRIGGER/i);
  assert.doesNotMatch(constraintsSql.down, /\bCASCADE\b/i, 'down should not need CASCADE');
});
