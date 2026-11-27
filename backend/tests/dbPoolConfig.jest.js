// PLATFORM-018: pool size and timeouts. pg's Pool is a fake that records its
// options, so no connection is attempted.
jest.mock('pg', () => ({
  Pool: jest.fn(function FakePool(options) {
    this.options = options;
    this.on = jest.fn();
  }),
}));
jest.mock('../observability/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const VARIABLES = ['PG_POOL_MAX', 'PG_CONNECTION_TIMEOUT_MS', 'PG_IDLE_TIMEOUT_MS', 'PG_STATEMENT_TIMEOUT_MS'];
const saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function loadPool(env = {}) {
  for (const name of VARIABLES) delete process.env[name];
  Object.assign(process.env, env);
  let pool;
  jest.isolateModules(() => {
    pool = require('../config/db');
  });
  return pool;
}

test('defaults apply when the variables are unset', () => {
  const pool = loadPool();
  expect(pool.options).toMatchObject({
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
  });
  // The test isolation URL still reaches the pool.
  expect(pool.options.connectionString).toBe(process.env.DATABASE_URL);
});

test('empty and blank values use the defaults', () => {
  const pool = loadPool({ PG_POOL_MAX: '', PG_STATEMENT_TIMEOUT_MS: '   ' });
  expect(pool.options.max).toBe(10);
  expect(pool.options.statement_timeout).toBe(30000);
});

test('valid values are used, with surrounding spaces ignored', () => {
  const pool = loadPool({
    PG_POOL_MAX: '25',
    PG_CONNECTION_TIMEOUT_MS: ' 1500 ',
    PG_IDLE_TIMEOUT_MS: '1',
    PG_STATEMENT_TIMEOUT_MS: '60000',
  });
  expect(pool.options).toMatchObject({
    max: 25,
    connectionTimeoutMillis: 1500,
    idleTimeoutMillis: 1,
    statement_timeout: 60000,
  });
});

describe.each(VARIABLES)('%s', (name) => {
  test.each(['abc', '0', '-1', '1.5', '1e3', '10ms', '99999999999999999999'])('%p stops startup', (value) => {
    expect(() => loadPool({ [name]: value })).toThrow(`Invalid ${name}: must be a positive integer.`);
  });
});

test('the error does not quote the rejected value', () => {
  expect(() => loadPool({ PG_POOL_MAX: 'synthetic-value' })).toThrow(/^Invalid PG_POOL_MAX: must be a positive integer\.$/);
});
