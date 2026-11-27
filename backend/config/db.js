require('./testRun');
const { Pool } = require('pg');
const logger = require('../observability/logger');


const validateAndNormalizeConnectionString = (value) => {
  if (!value) return null;

  const trimmed = value.trim();
    if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);

    } catch (error) {
    throw new Error(`Invalid DATABASE_URL: ${error.message}`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Invalid DATABASE_URL: must use postgres:// or postgresql://');
  }

  const hasDatabaseInUrl = parsed.pathname && parsed.pathname !== '/';
  if (!hasDatabaseInUrl) {
    const fallbackDatabase = process.env.PG_DATABASE?.trim();
    if (fallbackDatabase) {
      parsed.pathname = `/${fallbackDatabase}`;
      return parsed.toString();
    }

    throw new Error(
      'Invalid DATABASE_URL: missing database name in URL path (e.g. postgres://user:pass@host:5432/resumecraft_db)'
    );
  }

  return trimmed;
  
};

// Unset uses the default; anything but a positive integer stops startup.
function positiveIntegerEnv(name, defaultValue) {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`Invalid ${name}: must be a positive integer.`);
  }
  return Number(raw);
}

// Without these a request waits forever for a pooled connection, and one slow
// statement can hold a connection indefinitely.
const poolLimits = {
  max: positiveIntegerEnv('PG_POOL_MAX', 10),
  connectionTimeoutMillis: positiveIntegerEnv('PG_CONNECTION_TIMEOUT_MS', 5000),
  idleTimeoutMillis: positiveIntegerEnv('PG_IDLE_TIMEOUT_MS', 30000),
  statement_timeout: positiveIntegerEnv('PG_STATEMENT_TIMEOUT_MS', 30000),
};

const connectionString = validateAndNormalizeConnectionString(process.env.DATABASE_URL);
const sslConfig =
  process.env.PG_SSL === 'true'
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_CA_CERT,
      }
    : undefined;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: sslConfig,
    }
  : {
      host: process.env.PG_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.PG_PORT || process.env.PGPORT || 5432),
      database:
        process.env.PG_DATABASE ||
        process.env.PGDATABASE ||
        process.env.USER ||
        'resumecraft_db',
      user:
        process.env.PG_USER ||
        process.env.PGUSER ||
        process.env.USER ||
        process.env.USERNAME,
      password: process.env.PG_PASSWORD || process.env.PGPASSWORD || '',
      ssl: sslConfig,
    };

const pool = new Pool({ ...poolConfig, ...poolLimits });

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL client error');
});

module.exports = pool;
