const { readDB } = require("../db/store");
const {
  sendJson,
  verifyToken,
  getBearerToken
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
        { symbol: "BTC", name: "Bitcoin", address: user.wallets.BTC },
        { symbol: "ETH", name: "Ethereum", address: user.wallets.ETH },
        { symbol: "USDT", name: "Tether", address: user.wallets.USDT }
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

    if (!result.user.cardActivated) {
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

    if (!result.user.cardActivated) {
      sendJson(res, 403, {
        error: "Please contact support to activate your MNBase card before using withdraw."
      });
      return true;
    }

    sendJson(res, 200, { message: "Withdraw request accepted." });
    return true;
  }

  return false;
}

module.exports = walletRoute;