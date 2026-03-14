const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();


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

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('[db] Unexpected PostgreSQL client error:', error.message);
});

module.exports = pool;
