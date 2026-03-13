const http = require("http");
const url = require("url");

const initDatabase = require("./db/init-db");
const pool = require("./db/postgres");
const { router } = require("./routes");
const { hashPassword, buildWalletAddresses } = require("./routes/helpers");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

const allowedOrigins = [
  "https://mnbase.app",
  "https://www.mnbase.app",
  "https://admin.mnbase.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000"
];

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function seedAdmin() {
  const username = "admin";
  const email = "admin@mnbase.app";
  const password = "Admin12345!";

  const existing = await pool.query(
    `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
    [username, email]
  );

  if (existing.rows.length) {
    console.log("Admin already exists in PostgreSQL.");
    return;
  }

  const id = crypto.randomUUID();
  const wallets = buildWalletAddresses(crypto.randomBytes(8).toString("hex"));

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

  console.log("Admin created in PostgreSQL.");
  console.log("Admin username:", username);
  console.log("Admin email:", email);
  console.log("Admin password:", password);
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        name: "MNBase API"
      })
    );
    return;
  }

  if (parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy"
      })
    );
    return;
  }

  try {
    const handled = await router(req, res, parsedUrl);

    if (!handled && !res.writableEnded) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (err) {
    console.error("SERVER ERROR:", err);

    if (!res.writableEnded) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

async function startServer() {
  try {
    await initDatabase();
    await seedAdmin();

    server.listen(PORT, HOST, () => {
      console.log(`MNBase API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

startServer();