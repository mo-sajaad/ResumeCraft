/* const { Pool } = require('pg');
require('dotenv').config();


const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'resumecraft_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '', // or your password
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

module.exports = { pool };
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;