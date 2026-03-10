const { readDB, writeDB } = require("../db/store");
const {
  sendJson,
  parseBody,
  verifyToken,
  getBearerToken
} = require("./helpers");

function getAdmin(req) {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing authorization token." };

  const payload = verifyToken(token);
  if (!payload) return { error: "Invalid or expired token." };

  const db = readDB();
  const admin = db.users.find((u) => u.id === payload.sub);

  if (!admin || admin.role !== "admin") {
    return { error: "Admin access required." };
  }

  return { db, admin };
}

async function adminRoute(req, res, pathname) {
  if (pathname === "/api/admin/users" && req.method === "GET") {
    const result = getAdmin(req);
    if (result.error) {
      sendJson(res, 403, { error: result.error });
      return true;
    }

    const users = result.db.users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      balance: Number(u.balance || 0),
      cardActivated: !!u.cardActivated,
      cardBalance: Number(u.cardBalance || 0)
    }));

    sendJson(res, 200, { users });
    return true;
  }

  if (pathname === "/api/admin/fund" && req.method === "POST") {
    const result = getAdmin(req);
    if (result.error) {
      sendJson(res, 403, { error: result.error });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const amount = Number(body.amount || 0);

    if (!identifier || amount <= 0) {
      sendJson(res, 400, { error: "Identifier and valid amount are required." });
      return true;
    }

    const target = result.db.users.find(
      (u) =>
        String(u.username || "").toLowerCase() === identifier ||
        String(u.email || "").toLowerCase() === identifier
    );

    if (!target) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    target.balance = Number(target.balance || 0) + amount;
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];
    target.transactions.unshift({
      type: "fund",
      amount,
      createdAt: new Date().toISOString()
    });

    writeDB(result.db);
    sendJson(res, 200, { message: "Wallet funded successfully." });
    return true;
  }

  if (pathname === "/api/admin/remove-balance" && req.method === "POST") {
    const result = getAdmin(req);
    if (result.error) {
      sendJson(res, 403, { error: result.error });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const amount = Number(body.amount || 0);

    if (!identifier || amount <= 0) {
      sendJson(res, 400, { error: "Identifier and valid amount are required." });
      return true;
    }

    const target = result.db.users.find(
      (u) =>
        String(u.username || "").toLowerCase() === identifier ||
        String(u.email || "").toLowerCase() === identifier
    );

    if (!target) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    target.balance = Math.max(0, Number(target.balance || 0) - amount);
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];
    target.transactions.unshift({
      type: "balance_removed",
      amount,
      createdAt: new Date().toISOString()
    });

    writeDB(result.db);
    sendJson(res, 200, { message: "Balance removed successfully." });
    return true;
  }

  if (pathname === "/api/admin/card/activate" && req.method === "POST") {
    const result = getAdmin(req);
    if (result.error) {
      sendJson(res, 403, { error: result.error });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const cardBalance = Number(body.cardBalance || 0);

    const target = result.db.users.find(
      (u) =>
        String(u.username || "").toLowerCase() === identifier ||
        String(u.email || "").toLowerCase() === identifier
    );

    if (!target) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    target.cardActivated = true;
    target.cardBalance = Math.max(0, cardBalance);
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];
    target.transactions.unshift({
      type: "card_activated",
      amount: target.cardBalance,
      createdAt: new Date().toISOString()
    });

    writeDB(result.db);
    sendJson(res, 200, { message: "Card activated successfully." });
    return true;
  }

  if (pathname === "/api/admin/card/deactivate" && req.method === "POST") {
    const result = getAdmin(req);
    if (result.error) {
      sendJson(res, 403, { error: result.error });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();

    const target = result.db.users.find(
      (u) =>
        String(u.username || "").toLowerCase() === identifier ||
        String(u.email || "").toLowerCase() === identifier
    );

    if (!target) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    target.cardActivated = false;
    target.cardBalance = 0;
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];
    target.transactions.unshift({
      type: "card_deactivated",
      createdAt: new Date().toISOString()
    });

    writeDB(result.db);
    sendJson(res, 200, { message: "Card deactivated successfully." });
    return true;
  }

  return false;
}

module.exports = adminRoute;