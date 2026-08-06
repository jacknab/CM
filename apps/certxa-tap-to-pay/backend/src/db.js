const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in');
}

// Same database the main certxa.com app uses — this backend only reads
// from it (session lookups, account resolution), never writes.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
