// Postgres への接続。DATABASE_URL（Supabase や Render の接続文字列）を使う。
// 接続はプロセスで1つのプールを共有する。
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL が設定されていません');
    pool = new Pool({
      connectionString: url,
      // Supabase などマネージドDBは TLS 必須。ローカル（localhost）は平文でよい
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

// db/schema.sql を流す（IF NOT EXISTS で書いてあるので何度呼んでもよい）
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await query(sql);
}

async function close() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { query, migrate, close, getPool };
