const pool = require("../db/postgres");
const {
  sendJson,
  parseBody,
  verifyToken,
  getBearerToken
} = require("./helpers");

async function getAdmin(req) {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing authorization token." };

  const payload = verifyToken(token);
  if (!payload) return { error: "Invalid or expired token." };

  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [payload.sub]
  );

  const admin = result.rows[0];

  if (!admin || admin.role !== "admin") {
    return { error: "Admin access required." };
  }

  return { admin };
}

async function adminRoute(req, res, pathname) {
  if (pathname === "/api/admin/users" && req.method === "GET") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const usersResult = await pool.query(`
        SELECT
          id,
          username,
          email,
          role,
          balance,
          card_activated,
          card_balance
        FROM users
        ORDER BY created_at DESC
      `);

      const users = usersResult.rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        balance: Number(u.balance || 0),
        cardActivated: !!u.card_activated,
        cardBalance: Number(u.card_balance || 0)
      }));

      sendJson(res, 200, { users });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load users." });
      return true;
    }
  }

  if (pathname === "/api/admin/fund" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const amount = Number(body.amount || 0);
      const message = String(body.message || "").trim();

      if (!identifier || amount <= 0) {
        sendJson(res, 400, { error: "Identifier and valid amount are required." });
        return true;
      }

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );

      const target = result.rows[0];

      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = Array.isArray(target.transactions)
        ? target.transactions
        : (target.transactions || []);

      parsedTransactions.unshift({
        type: "fund",
        amount,
        message: message || "Wallet funded by admin.",
        createdAt: new Date().toISOString()
      });

      await pool.query(
        `UPDATE users
         SET balance = $1, transactions = $2::jsonb
         WHERE id = $3`,
        [
          Number(target.balance || 0) + amount,
          JSON.stringify(parsedTransactions),
          target.id
        ]
      );

      sendJson(res, 200, { message: "Wallet funded successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to fund wallet." });
      return true;
    }
  }

  if (pathname === "/api/admin/remove-balance" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const amount = Number(body.amount || 0);
      const message = String(body.message || "").trim();

      if (!identifier || amount <= 0) {
        sendJson(res, 400, { error: "Identifier and valid amount are required." });
        return true;
      }

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );

      const target = result.rows[0];

      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = Array.isArray(target.transactions)
        ? target.transactions
        : (target.transactions || []);

      parsedTransactions.unshift({
        type: "balance_removed",
        amount,
        message: message || "Balance deducted by admin.",
        createdAt: new Date().toISOString()
      });

      await pool.query(
        `UPDATE users
         SET balance = $1, transactions = $2::jsonb
         WHERE id = $3`,
        [
          Math.max(0, Number(target.balance || 0) - amount),
          JSON.stringify(parsedTransactions),
          target.id
        ]
      );

      sendJson(res, 200, { message: "Balance removed successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to remove balance." });
      return true;
    }
  }

  if (pathname === "/api/admin/card/activate" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const cardBalance = Number(body.cardBalance || 0);

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );

      const target = result.rows[0];

      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = Array.isArray(target.transactions)
        ? target.transactions
        : (target.transactions || []);

      parsedTransactions.unshift({
        type: "card_activated",
        amount: cardBalance,
        message: "Virtual card activated by admin.",
        createdAt: new Date().toISOString()
      });

      await pool.query(
        `UPDATE users
         SET card_activated = $1, card_balance = $2, transactions = $3::jsonb
         WHERE id = $4`,
        [true, Math.max(0, cardBalance), JSON.stringify(parsedTransactions), target.id]
      );

      sendJson(res, 200, { message: "Card activated successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to activate card." });
      return true;
    }
  }

  if (pathname === "/api/admin/card/deactivate" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );

      const target = result.rows[0];

      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = Array.isArray(target.transactions)
        ? target.transactions
        : (target.transactions || []);

      parsedTransactions.unshift({
        type: "card_deactivated",
        message: "Virtual card deactivated by admin.",
        createdAt: new Date().toISOString()
      });

      await pool.query(
        `UPDATE users
         SET card_activated = $1, card_balance = $2, transactions = $3::jsonb
         WHERE id = $4`,
        [false, 0, JSON.stringify(parsedTransactions), target.id]
      );

      sendJson(res, 200, { message: "Card deactivated successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to deactivate card." });
      return true;
    }
  }

  return false;
}

module.exports = adminRoute;