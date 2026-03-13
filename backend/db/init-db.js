const pool = require("./postgres");

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        balance NUMERIC DEFAULT 0,
        card_activated BOOLEAN DEFAULT false,
        card_balance NUMERIC DEFAULT 0,
        wallets JSONB,
        transactions JSONB DEFAULT '[]',
        reset_code TEXT,
        reset_code_expires_at BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("PostgreSQL users table ready");
  } catch (err) {
    console.error("Database init error:", err);
  }
}

module.exports = initDatabase;