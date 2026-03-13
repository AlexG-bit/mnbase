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
        balance NUMERIC NOT NULL DEFAULT 0,
        card_activated BOOLEAN NOT NULL DEFAULT false,
        card_balance NUMERIC NOT NULL DEFAULT 0,
        wallets JSONB NOT NULL DEFAULT '{}'::jsonb,
        transactions JSONB NOT NULL DEFAULT '[]'::jsonb,
        reset_code TEXT,
        reset_code_expires_at BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0,
        asset TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_user TEXT,
        amount NUMERIC,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id
      ON transactions(user_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id
      ON admin_logs(admin_id);
    `);

    console.log("PostgreSQL tables ready");
  } catch (err) {
    console.error("Database init error:", err);
    throw err;
  }
}

module.exports = initDatabase;