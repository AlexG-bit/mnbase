const crypto = require("crypto");
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

function parseUserTransactions(user) {
  if (Array.isArray(user.transactions)) return user.transactions;
  if (!user.transactions) return [];
  if (typeof user.transactions === "string") {
    try {
      return JSON.parse(user.transactions);
    } catch {
      return [];
    }
  }
  return [];
}

async function addAdminLog(client, { adminId, action, targetUser, amount = null, message = null }) {
  await client.query(
    `INSERT INTO admin_logs (id, admin_id, action, target_user, amount, message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      crypto.randomUUID(),
      adminId,
      action,
      targetUser,
      amount,
      message,
      new Date().toISOString()
    ]
  );
}

async function addTransaction(client, { userId, type, amount = 0, asset = "USD", message = "" }) {
  await client.query(
    `INSERT INTO transactions (id, user_id, type, amount, asset, message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      crypto.randomUUID(),
      userId,
      type,
      amount,
      asset,
      message,
      new Date().toISOString()
    ]
  );
}

async function findUserByIdentifier(identifier, client = pool) {
  const result = await client.query(
    `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
    [identifier]
  );
  return result.rows[0];
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
          card_balance,
          created_at
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
        cardBalance: Number(u.card_balance || 0),
        createdAt: u.created_at
      }));

      sendJson(res, 200, { users });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load users." });
      return true;
    }
  }

  if (pathname === "/api/admin/stats" && req.method === "GET") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const users = await pool.query(`SELECT COUNT(*) FROM users`);
      const balance = await pool.query(`SELECT COALESCE(SUM(balance), 0) AS sum FROM users`);
      const transactions = await pool.query(`SELECT COUNT(*) FROM transactions`);

      sendJson(res, 200, {
        totalUsers: Number(users.rows[0].count || 0),
        totalBalance: Number(balance.rows[0].sum || 0),
        totalTransactions: Number(transactions.rows[0].count || 0)
      });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load admin stats." });
      return true;
    }
  }

  if (pathname === "/api/admin/fund" && req.method === "POST") {
    const client = await pool.connect();
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const amount = Number(body.amount || 0);
      const message = String(body.message || "").trim() || "Wallet funded by admin.";

      if (!identifier || amount <= 0) {
        sendJson(res, 400, { error: "Identifier and valid amount are required." });
        return true;
      }

      const target = await findUserByIdentifier(identifier, client);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = parseUserTransactions(target);
      parsedTransactions.unshift({
        type: "fund",
        amount,
        message,
        createdAt: new Date().toISOString()
      });

      await client.query("BEGIN");

      await client.query(
        `UPDATE users
         SET balance = $1, transactions = $2::jsonb
         WHERE id = $3`,
        [
          Number(target.balance || 0) + amount,
          JSON.stringify(parsedTransactions),
          target.id
        ]
      );

      await addTransaction(client, {
        userId: target.id,
        type: "fund",
        amount,
        asset: "USD",
        message
      });

      await addAdminLog(client, {
        adminId: auth.admin.id,
        action: "fund",
        targetUser: target.username || target.email,
        amount,
        message
      });

      await client.query("COMMIT");
      sendJson(res, 200, { message: "Wallet funded successfully." });
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      sendJson(res, 500, { error: err.message || "Failed to fund wallet." });
      return true;
    } finally {
      client.release();
    }
  }

  if (pathname === "/api/admin/remove-balance" && req.method === "POST") {
    const client = await pool.connect();
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const amount = Number(body.amount || 0);
      const message = String(body.message || "").trim() || "Balance deducted by admin.";

      if (!identifier || amount <= 0) {
        sendJson(res, 400, { error: "Identifier and valid amount are required." });
        return true;
      }

      const target = await findUserByIdentifier(identifier, client);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = parseUserTransactions(target);
      parsedTransactions.unshift({
        type: "balance_removed",
        amount,
        message,
        createdAt: new Date().toISOString()
      });

      await client.query("BEGIN");

      await client.query(
        `UPDATE users
         SET balance = $1, transactions = $2::jsonb
         WHERE id = $3`,
        [
          Math.max(0, Number(target.balance || 0) - amount),
          JSON.stringify(parsedTransactions),
          target.id
        ]
      );

      await addTransaction(client, {
        userId: target.id,
        type: "balance_removed",
        amount,
        asset: "USD",
        message
      });

      await addAdminLog(client, {
        adminId: auth.admin.id,
        action: "remove_balance",
        targetUser: target.username || target.email,
        amount,
        message
      });

      await client.query("COMMIT");
      sendJson(res, 200, { message: "Balance removed successfully." });
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      sendJson(res, 500, { error: err.message || "Failed to remove balance." });
      return true;
    } finally {
      client.release();
    }
  }

  if (pathname === "/api/admin/card/activate" && req.method === "POST") {
    const client = await pool.connect();
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const cardBalance = Number(body.cardBalance || 0);
      const message = "Virtual card activated by admin.";

      const target = await findUserByIdentifier(identifier, client);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = parseUserTransactions(target);
      parsedTransactions.unshift({
        type: "card_activated",
        amount: cardBalance,
        message,
        createdAt: new Date().toISOString()
      });

      await client.query("BEGIN");

      await client.query(
        `UPDATE users
         SET card_activated = $1, card_balance = $2, transactions = $3::jsonb
         WHERE id = $4`,
        [true, Math.max(0, cardBalance), JSON.stringify(parsedTransactions), target.id]
      );

      await addTransaction(client, {
        userId: target.id,
        type: "card_activated",
        amount: Math.max(0, cardBalance),
        asset: "USD",
        message
      });

      await addAdminLog(client, {
        adminId: auth.admin.id,
        action: "card_activate",
        targetUser: target.username || target.email,
        amount: Math.max(0, cardBalance),
        message
      });

      await client.query("COMMIT");
      sendJson(res, 200, { message: "Card activated successfully." });
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      sendJson(res, 500, { error: err.message || "Failed to activate card." });
      return true;
    } finally {
      client.release();
    }
  }

  if (pathname === "/api/admin/card/deactivate" && req.method === "POST") {
    const client = await pool.connect();
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const message = "Virtual card deactivated by admin.";

      const target = await findUserByIdentifier(identifier, client);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      const parsedTransactions = parseUserTransactions(target);
      parsedTransactions.unshift({
        type: "card_deactivated",
        amount: 0,
        message,
        createdAt: new Date().toISOString()
      });

      await client.query("BEGIN");

      await client.query(
        `UPDATE users
         SET card_activated = $1, card_balance = $2, transactions = $3::jsonb
         WHERE id = $4`,
        [false, 0, JSON.stringify(parsedTransactions), target.id]
      );

      await addTransaction(client, {
        userId: target.id,
        type: "card_deactivated",
        amount: 0,
        asset: "USD",
        message
      });

      await addAdminLog(client, {
        adminId: auth.admin.id,
        action: "card_deactivate",
        targetUser: target.username || target.email,
        amount: 0,
        message
      });

      await client.query("COMMIT");
      sendJson(res, 200, { message: "Card deactivated successfully." });
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      sendJson(res, 500, { error: err.message || "Failed to deactivate card." });
      return true;
    } finally {
      client.release();
    }
  }

  if (pathname === "/api/admin/user-controls" && req.method === "GET") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const result = await pool.query(
        `SELECT id, user_id, action_type, title, body, is_active, updated_at
         FROM user_action_controls
         ORDER BY updated_at DESC`
      );

      sendJson(res, 200, { controls: result.rows });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to load user controls." });
      return true;
    }
  }

  if (pathname === "/api/admin/user-controls" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const actionType = String(body.actionType || "").trim().toLowerCase();
      const title = String(body.title || "").trim();
      const noticeBody = String(body.body || "").trim();

      if (!identifier || !actionType || !title || !noticeBody) {
        sendJson(res, 400, { error: "Identifier, action type, title, and body are required." });
        return true;
      }

      if (!["send", "withdraw"].includes(actionType)) {
        sendJson(res, 400, { error: "Action type must be send or withdraw." });
        return true;
      }

      const target = await findUserByIdentifier(identifier);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      await pool.query(
        `INSERT INTO user_action_controls (
          id, user_id, action_type, title, body, is_active, created_by, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id, action_type)
        DO UPDATE SET
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          is_active = EXCLUDED.is_active,
          created_by = EXCLUDED.created_by,
          updated_at = EXCLUDED.updated_at`,
        [
          crypto.randomUUID(),
          target.id,
          actionType,
          title,
          noticeBody,
          true,
          auth.admin.id,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      sendJson(res, 200, { message: "User action control saved successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to save user action control." });
      return true;
    }
  }

  if (pathname === "/api/admin/user-controls/remove" && req.method === "POST") {
    try {
      const auth = await getAdmin(req);
      if (auth.error) {
        sendJson(res, 403, { error: auth.error });
        return true;
      }

      const body = await parseBody(req);
      const identifier = String(body.identifier || "").trim().toLowerCase();
      const actionType = String(body.actionType || "").trim().toLowerCase();

      if (!identifier || !actionType) {
        sendJson(res, 400, { error: "Identifier and action type are required." });
        return true;
      }

      const target = await findUserByIdentifier(identifier);
      if (!target) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      await pool.query(
        `DELETE FROM user_action_controls WHERE user_id = $1 AND action_type = $2`,
        [target.id, actionType]
      );

      sendJson(res, 200, { message: "User action control removed successfully." });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to remove user action control." });
      return true;
    }
  }

  return false;
}

module.exports = adminRoute;