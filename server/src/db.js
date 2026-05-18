const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query
};
