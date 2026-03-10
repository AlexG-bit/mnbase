const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "data.json");

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2), "utf8");
  }
}

function readDB() {
  initDB();

  const raw = fs.readFileSync(DB_PATH, "utf8");
  const db = raw ? JSON.parse(raw) : { users: [] };

  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function seedAdmin() {
  const db = readDB();
  const hasAdmin = db.users.some((u) => u.role === "admin");

  if (hasAdmin) {
    return;
  }

  const passwordHash = crypto
    .createHash("sha256")
    .update(process.env.ADMIN_PASSWORD || "admin123")
    .digest("hex");

  db.users.push({
    id: crypto.randomUUID(),
    username: "admin",
    email: "admin@mnbase.app",
    passwordHash,
    role: "admin",
    createdAt: new Date().toISOString()
  });

  writeDB(db);
}

module.exports = {
  initDB,
  readDB,
  writeDB,
  seedAdmin
};