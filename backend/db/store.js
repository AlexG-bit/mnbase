const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data.json');
let db = {};

function initDB() {
  if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } else {
    db = { users: {}, admin_txns: [] };
    saveDB();
  }
}

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getDB() { return db; }

module.exports = { initDB, saveDB, getDB };