// Keeps backend tests away from real services, even when credentials are
// exported in the shell. Preloaded by `npm run test:node` (--require) and
// jest.config.cjs; config/testRun.js loads it for test files run directly.
const dgram = require('node:dgram');
const net = require('node:net');

const CLEARED_NAME = new RegExp(
  '^(DATABASE_|DB_|PG|POSTGRES|REDIS|OPENAI_|AZURE_|STRIPE_|FIREBASE_|FIRESTORE_|GOOGLE_|GCLOUD_|GCP_|GCE_'
    + '|CLOUDSDK_|AWS_|SENTRY_|ADMIN_|JWT_|SMTP_|DOTENV_)'
    + '|(^|_)(SECRET|TOKEN|PASSWORD|CREDENTIALS|API_KEY|PRIVATE_KEY)(_|$)'
    + '|^(HTTP|HTTPS|ALL|NO)_PROXY$|_(HTTP|HTTPS)_PROXY$',
  'i'
);

for (const name of Object.keys(process.env)) {
  if (CLEARED_NAME.test(name)) delete process.env[name];
}

// Port 1 refuses connections, so a local database cannot be used by accident.
// PG_* also covers a test that removes DATABASE_URL.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/resumecraft_test_unusable',
  PG_HOST: '127.0.0.1',
  PG_PORT: '1',
  PG_DATABASE: 'resumecraft_test_unusable',
  PG_USER: 'test',
  JWT_SECRET_KEY: 'test-only-secret',
});

process[Symbol.for('resumecraft.testIsolation')] = true;

function isLoopback(host) {
  return host === 'localhost' || host === '::1' || (net.isIPv4(host) && host.startsWith('127.'));
}

function blockedError(target) {
  const error = new Error(`Test isolation blocked a connection to ${target}`);
  error.code = 'ERR_TEST_NETWORK_BLOCKED';
  return error;
}

// Jest shares core modules between test files, so patch each only once.
const PATCHED = Symbol.for('resumecraft.testIsolation.patched');

if (!net.Socket.prototype[PATCHED]) {
  const { connect } = net.Socket.prototype;
  net.Socket.prototype[PATCHED] = true;

  // Plain, TLS, HTTP(S) and fetch connections all go through this method.
  net.Socket.prototype.connect = function isolatedConnect(...args) {
    // Node's internal callers pass one pre-normalized array.
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    let options;
    if (first && typeof first === 'object') options = first;
    else if (typeof first === 'string' && Number.isNaN(Number(first))) options = { path: first };
    else options = { host: typeof args[1] === 'string' ? args[1] : undefined };

    // A custom lookup could resolve "localhost" to another machine.
    const allowed = !options.path
      && isLoopback(options.host || 'localhost')
      && (net.isIP(options.host || '') !== 0 || !options.lookup);
    if (allowed) return connect.apply(this, args);

    // Fail later, like a real connection, so callers can attach listeners.
    this.connecting = true;
    setImmediate(() => this.destroy(blockedError(options.path || options.host)));
    return this;
  };

  // Refuse all outgoing UDP; nothing in the test suites uses it.
  for (const method of ['connect', 'send']) {
    dgram.Socket.prototype[method] = function isolatedUdp() {
      throw blockedError(`a UDP socket (${method})`);
    };
  }
}
