const crypto = require("crypto");
const pool = require("./postgres");
const { hashPassword, buildWalletAddresses } = require("../routes/helpers");

async function seedAdmin() {
  const username = "admin";
  const email = "admin@mnbase.app";
  const password = "Admin12345!";
  const wallets = buildWalletAddresses(crypto.randomBytes(8).toString("hex"));

  const existing = await pool.query(
    `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
    [username, email]
  );

  if (existing.rows.length) {
    console.log("Admin already exists.");
    process.exit(0);
  }

  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO users (
      id, username, email, password_hash, role, balance,
      card_activated, card_balance, wallets, transactions,
      reset_code, reset_code_expires_at, created_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9::jsonb,$10::jsonb,
      $11,$12,$13
    )`,
    [
      id,
      username,
      email,
      hashPassword(password),
      "admin",
      0,
      false,
      0,
      JSON.stringify(wallets),
      JSON.stringify([]),
      null,
      null,
      new Date().toISOString()
    ]
  );

  console.log("Admin created successfully.");
  console.log("Username:", username);
  console.log("Email:", email);
  console.log("Password:", password);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed admin failed:", err);
  process.exit(1);
});