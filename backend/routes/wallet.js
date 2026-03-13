const pool = require("../db/postgres");
const {
  verifyToken,
  getBearerToken,
  sendJson
} = require("./helpers");

async function getCurrentUser(req) {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing authorization token." };

  const payload = verifyToken(token);
  if (!payload) return { error: "Invalid or expired token." };

  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [payload.sub]
  );

  const user = result.rows[0];

  if (!user) return { error: "User not found." };

  return { user };
}

async function walletRoute(req, res, pathname) {
  if (pathname === "/api/wallet/me" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const { user } = result;

      const wallets = user.wallets || {};
      const transactions = Array.isArray(user.transactions)
        ? user.transactions
        : (user.transactions || []);

      sendJson(res, 200, {
        username: user.username,
        email: user.email,
        role: user.role,
        balance: Number(user.balance || 0),
        cardActivated: !!user.card_activated,
        cardBalance: Number(user.card_balance || 0),
        wallets,
        transactions
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load wallet profile." });
      return true;
    }
  }

  if (pathname === "/api/wallet/receive-assets" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const { user } = result;
      const wallets = user.wallets || {};

      sendJson(res, 200, {
        assets: [
          {
            symbol: "BTC",
            name: "Bitcoin",
            address: wallets.BTC || "BTC_ADDRESS_NOT_AVAILABLE"
          },
          {
            symbol: "ETH",
            name: "Ethereum",
            address: wallets.ETH || "ETH_ADDRESS_NOT_AVAILABLE"
          },
          {
            symbol: "USDT",
            name: "Tether",
            address: wallets.USDT || "USDT_ADDRESS_NOT_AVAILABLE"
          }
        ]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load receive assets." });
      return true;
    }
  }

  if (pathname === "/api/wallet/convert-options" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      sendJson(res, 200, {
        assets: ["BTC", "ETH", "USDT"],
        localCurrencies: ["USD", "EUR", "GBP", "NGN"]
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load convert options." });
      return true;
    }
  }

  if (pathname === "/api/wallet/send" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      if (!result.user.card_activated) {
        sendJson(res, 403, {
          error: "Please contact support to activate your MNBase card before using send."
        });
        return true;
      }

      sendJson(res, 200, { message: "Send request accepted." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Send request failed." });
      return true;
    }
  }

  if (pathname === "/api/wallet/withdraw" && req.method === "POST") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      if (!result.user.card_activated) {
        sendJson(res, 403, {
          error: "Please contact support to activate your MNBase card before using withdraw."
        });
        return true;
      }

      sendJson(res, 200, { message: "Withdraw request accepted." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Withdraw request failed." });
      return true;
    }
  }

  return false;
}

module.exports = walletRoute;