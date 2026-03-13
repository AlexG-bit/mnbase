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

function parseTransactions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
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

      sendJson(res, 200, {
        username: user.username,
        email: user.email,
        role: user.role,
        balance: Number(user.balance || 0),
        cardActivated: !!user.card_activated,
        cardBalance: Number(user.card_balance || 0),
        wallets: user.wallets || {},
        transactions: parseTransactions(user.transactions)
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load wallet profile." });
      return true;
    }
  }

  if (pathname === "/api/wallet/history" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const history = await pool.query(
        `SELECT id, user_id, type, amount, asset, message, created_at
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [result.user.id]
      );

      sendJson(res, 200, {
        transactions: history.rows.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount || 0),
          asset: tx.asset || "USD",
          message: tx.message || "",
          createdAt: tx.created_at
        }))
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load wallet history." });
      return true;
    }
  }

  if (pathname === "/api/wallet/notices" && req.method === "GET") {
    try {
      const result = await getCurrentUser(req);
      if (result.error) {
        sendJson(res, 401, { error: result.error });
        return true;
      }

      const notices = await pool.query(
        `SELECT id, notice_type, title, body, is_active, updated_at
         FROM system_notices
         WHERE is_active = true
         ORDER BY updated_at DESC`
      );

      sendJson(res, 200, { notices: notices.rows });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load notices." });
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