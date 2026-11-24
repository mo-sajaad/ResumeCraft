// PLATFORM-015: tests must not load .env, keep credentials or reach outside
// services. Each case runs in a child process with a minimal environment and
// synthetic values; the real .env is never used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('./support/isolate');

const backendRoot = path.join(__dirname, '..');
const isolatePath = path.join(__dirname, 'support', 'isolate.js');

function runNode(args, { cwd, env = {} }) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

// A copy of the loading code beside a synthetic .env.
function createProject(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resumecraft-env-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const file of ['config/env.js', 'config/testRun.js', 'tests/support/isolate.js']) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(backendRoot, file), target);
  }
  // Only dotenv is linked, so nothing else from the real project is reachable.
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.symlinkSync(
    path.join(backendRoot, 'node_modules', 'dotenv'),
    path.join(root, 'node_modules', 'dotenv'),
    'dir'
  );
  fs.writeFileSync(path.join(root, '.env'), 'SYNTHETIC_DOTENV_VALUE=loaded\n');

  const report = 'console.log(JSON.stringify({ value: process.env.SYNTHETIC_DOTENV_VALUE ?? null }));\n';
  fs.writeFileSync(path.join(root, 'start.js'), `require('./config/env');\n${report}`);
  fs.writeFileSync(path.join(root, 'tests', 'direct.js'), `require('../config/env');\n${report}`);
  return root;
}

test('env.js loads .env for an ordinary start', (t) => {
  const cwd = createProject(t);

  for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'production' }]) {
    assert.deepEqual(runNode(['start.js'], { cwd, env }), { value: 'loaded' }, JSON.stringify(env));
  }
});

for (const [label, args, env] of [
  ['NODE_ENV is test', ['start.js'], { NODE_ENV: 'test' }],
  ['node:test started the process', ['start.js'], { NODE_TEST_CONTEXT: 'child-v8' }],
  ['a Jest worker started the process', ['start.js'], { JEST_WORKER_ID: '1' }],
  ['a file in tests/ is run directly', ['tests/direct.js'], {}],
  ['NODE_ENV is production but a test runner is active', ['start.js'], { NODE_ENV: 'production', JEST_WORKER_ID: '1' }],
]) {
  test(`env.js does not load .env when ${label}`, (t) => {
    assert.deepEqual(runNode(args, { cwd: createProject(t), env }), { value: null });
  });
}

test('a test file run directly is isolated as soon as it loads a config module', (t) => {
  const cwd = createProject(t);
  fs.writeFileSync(
    path.join(cwd, 'tests', 'unprepared.js'),
    `require('../config/testRun');
     console.log(JSON.stringify({
       openai: process.env.OPENAI_API_KEY ?? null,
       database: process.env.DATABASE_URL,
       isolated: process[Symbol.for('resumecraft.testIsolation')] === true,
     }));`
  );

  const result = runNode(['tests/unprepared.js'], {
    cwd,
    env: { OPENAI_API_KEY: 'synthetic', DATABASE_URL: 'postgresql://synthetic.invalid/real' },
  });

  assert.equal(result.openai, null);
  assert.equal(result.isolated, true);
  assert.doesNotMatch(result.database, /synthetic\.invalid/);
});

test('a real start is not isolated by config/testRun.js', (t) => {
  const cwd = createProject(t);
  fs.writeFileSync(
    path.join(cwd, 'server.js'),
    `require('./config/testRun');
     console.log(JSON.stringify({ key: process.env.OPENAI_API_KEY ?? null }));`
  );

  // NODE_ENV alone must not strip a running server's configuration.
  for (const NODE_ENV of ['production', 'test']) {
    const result = runNode(['server.js'], { cwd, env: { NODE_ENV, OPENAI_API_KEY: 'synthetic' } });
    assert.equal(result.key, 'synthetic', NODE_ENV);
  }
});

const CREDENTIAL_NAMES = [
  'DB_CA_CERT', 'PG_PASSWORD', 'PGPASSWORD', 'POSTGRES_PASSWORD', 'REDIS_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'STRIPE_SECRET_KEY', 'STRIPE_PRICE_PRO', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PRIVATE_KEY_PATH', 'FIREBASE_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS',
  'GCLOUD_PROJECT', 'AWS_ACCESS_KEY_ID', 'SENTRY_DSN', 'ADMIN_FIREBASE_UIDS', 'DOTENV_CONFIG_PATH',
  'SOME_VENDOR_API_KEY', 'SOME_VENDOR_TOKEN', 'SOME_VENDOR_SECRET', 'HTTPS_PROXY', 'http_proxy',
];

test('isolate.js clears credentials and replaces the required ones', () => {
  const env = { APP_BASE_URL: 'https://kept.invalid', DATABASE_URL: 'synthetic', JWT_SECRET_KEY: 'synthetic' };
  for (const name of CREDENTIAL_NAMES) env[name] = 'synthetic';

  const result = runNode(
    ['--require', isolatePath, '-e', 'console.log(JSON.stringify(process.env))'],
    { cwd: os.tmpdir(), env }
  );

  assert.deepEqual(CREDENTIAL_NAMES.filter((name) => name in result), []);
  assert.equal(Object.values(result).includes('synthetic'), false);
  assert.equal(result.NODE_ENV, 'test');
  assert.equal(result.JWT_SECRET_KEY, 'test-only-secret');
  assert.equal(result.APP_BASE_URL, 'https://kept.invalid');

  const database = new URL(result.DATABASE_URL);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.port, '1');
  assert.equal(result.PG_HOST, '127.0.0.1');
  assert.equal(result.PG_PORT, '1');
});

// 192.0.2.1 (TEST-NET-1) and .invalid are reserved and never route anywhere, so
// nothing real is contacted even if isolation is broken.
const BLOCKED = {
  'TCP by address': "net.connect({ host: '192.0.2.1', port: 80 })",
  'TCP by positional host': "new net.Socket().connect(80, '192.0.2.1')",
  'TCP by host name': "net.connect({ host: 'outside.invalid', port: 80 })",
  'TLS': "tls.connect({ host: '192.0.2.1', port: 443 })",
  'HTTP': "http.get('http://192.0.2.1/')",
  'HTTPS': "https.get('https://192.0.2.1/')",
  'a Unix socket': "net.connect('/synthetic/outside.sock')",
  'localhost with a custom lookup':
    "net.connect({ host: 'localhost', port: 80, lookup: (h, o, cb) => cb(null, '192.0.2.1', 4) })",
};

const CONNECT_SCRIPT = `
  const net = require('node:net'); const tls = require('node:tls');
  const http = require('node:http'); const https = require('node:https');
  const socket = EXPRESSION;
  const finish = (code) => { console.log(JSON.stringify({ code })); process.exit(0); };
  socket.on('error', (error) => finish(error.code));
  socket.on('connect', () => finish('CONNECTED'));
  socket.on('response', () => finish('CONNECTED'));
  setTimeout(() => finish('STILL_CONNECTING'), 5000);
`;

for (const [label, expression] of Object.entries(BLOCKED)) {
  test(`isolate.js blocks ${label}`, () => {
    const result = runNode(
      ['--require', isolatePath, '-e', CONNECT_SCRIPT.replace('EXPRESSION', expression)],
      { cwd: os.tmpdir() }
    );
    assert.equal(result.code, 'ERR_TEST_NETWORK_BLOCKED');
  });
}

test('isolate.js blocks fetch', () => {
  const script = `
    fetch('http://192.0.2.1/', { signal: AbortSignal.timeout(5000) })
      .then(() => 'CONNECTED', (error) => error.cause?.code ?? error.name)
      .then((code) => { console.log(JSON.stringify({ code })); process.exit(0); });
  `;
  const result = runNode(['--require', isolatePath, '-e', script], { cwd: os.tmpdir() });
  assert.equal(result.code, 'ERR_TEST_NETWORK_BLOCKED');
});

test('isolate.js blocks UDP', () => {
  const script = `
    const codes = [];
    for (const attempt of [
      (socket) => socket.send('x', 9, '192.0.2.1'),
      (socket) => socket.connect(9, '192.0.2.1'),
    ]) {
      try { attempt(require('node:dgram').createSocket('udp4')); codes.push('SENT'); }
      catch (error) { codes.push(error.code); }
    }
    console.log(JSON.stringify({ codes }));
    process.exit(0);
  `;
  const result = runNode(['--require', isolatePath, '-e', script], { cwd: os.tmpdir() });
  assert.deepEqual(result.codes, ['ERR_TEST_NETWORK_BLOCKED', 'ERR_TEST_NETWORK_BLOCKED']);
});

test('isolate.js allows loopback TCP and HTTP', () => {
  const script = `
    const http = require('node:http');
    const server = http.createServer((req, res) => res.end('ok'));
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      const socket = require('node:net').connect(port, '127.0.0.1');
      await new Promise((resolve, reject) => socket.once('connect', resolve).once('error', reject));
      socket.destroy();
      const body = await (await fetch('http://127.0.0.1:' + port)).text();
      console.log(JSON.stringify({ body }));
      process.exit(0);
    });
  `;
  const result = runNode(['--require', isolatePath, '-e', script], { cwd: os.tmpdir() });
  assert.equal(result.body, 'ok');
});
