const { readDB, writeDB } = require("../db/store");
const {
  verifyToken,
  getBearerToken,
  sendJson,
  parseBody
} = require("./helpers");

function getCurrentUser(req) {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing authorization token." };

  const payload = verifyToken(token);
  if (!payload) return { error: "Invalid or expired token." };

  const db = readDB();
  const user = db.users.find((u) => u.id === payload.sub);

  if (!user) return { error: "User not found." };

  return { db, user };
}

async function walletRoute(req, res, pathname) {
  if (pathname === "/api/wallet/me" && req.method === "GET") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { user } = result;

    sendJson(res, 200, {
      username: user.username,
      email: user.email,
      role: user.role,
      balance: Number(user.balance || 0),
      cardActivated: !!user.cardActivated,
      cardBalance: Number(user.cardBalance || 0),
      wallets: user.wallets || {},
      transactions: Array.isArray(user.transactions) ? user.transactions : []
    });
    return true;
  }

  if (pathname === "/api/wallet/receive-assets" && req.method === "GET") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { user } = result;

    sendJson(res, 200, {
      assets: [
        {
          symbol: "BTC",
          name: "Bitcoin",
          address: user.wallets?.BTC || "BTC_ADDRESS_NOT_AVAILABLE"
        },
        {
          symbol: "ETH",
          name: "Ethereum",
          address: user.wallets?.ETH || "ETH_ADDRESS_NOT_AVAILABLE"
        },
        {
          symbol: "USDT",
          name: "Tether",
          address: user.wallets?.USDT || "USDT_ADDRESS_NOT_AVAILABLE"
        }
      ]
    });
    return true;
  }

  if (pathname === "/api/wallet/convert-options" && req.method === "GET") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    sendJson(res, 200, {
      assets: ["BTC", "ETH", "USDT"],
      localCurrencies: ["USD", "EUR", "GBP", "NGN"]
    });
    return true;
  }

  if (pathname === "/api/wallet/send" && req.method === "POST") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { user } = result;

    if (!user.cardActivated) {
      sendJson(res, 403, {
        error: "Please contact support to activate your MNBase card before using send."
      });
      return true;
    }

    sendJson(res, 200, { message: "Send request accepted." });
    return true;
  }

  if (pathname === "/api/wallet/withdraw" && req.method === "POST") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { user } = result;

    if (!user.cardActivated) {
      sendJson(res, 403, {
        error: "Please contact support to activate your MNBase card before using withdraw."
      });
      return true;
    }

    sendJson(res, 200, { message: "Withdraw request accepted." });
    return true;
  }

  if (pathname === "/api/admin/fund" && req.method === "POST") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { db, user } = result;

    if (user.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const amount = Number(body.amount || 0);

    if (!identifier || amount <= 0) {
      sendJson(res, 400, { error: "Identifier and valid amount are required." });
      return true;
    }

    const target = db.users.find(
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

    writeDB(db);

    sendJson(res, 200, {
      message: "Wallet funded successfully.",
      balance: target.balance
    });
    return true;
  }

  if (pathname === "/api/admin/card/activate" && req.method === "POST") {
    const result = getCurrentUser(req);
    if (result.error) {
      sendJson(res, 401, { error: result.error });
      return true;
    }

    const { db, user } = result;

    if (user.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return true;
    }

    const body = await parseBody(req);
    const identifier = String(body.identifier || "").trim().toLowerCase();
    const cardBalance = Number(body.cardBalance || 0);

    if (!identifier) {
      sendJson(res, 400, { error: "Identifier is required." });
      return true;
    }

    const target = db.users.find(
      (u) =>
        String(u.username || "").toLowerCase() === identifier ||
        String(u.email || "").toLowerCase() === identifier
    );

    if (!target) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    target.cardActivated = true;
    target.cardBalance = cardBalance >= 0 ? cardBalance : 0;
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];
    target.transactions.unshift({
      type: "card_activated",
      amount: target.cardBalance,
      createdAt: new Date().toISOString()
    });

    writeDB(db);

    sendJson(res, 200, {
      message: "Card activated successfully.",
      cardActivated: true,
      cardBalance: target.cardBalance
    });
    return true;
  }

  return false;
}

module.exports = walletRoute;