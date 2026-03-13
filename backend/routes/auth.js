const crypto = require("crypto");
const pool = require("../db/postgres");
const {
  sendJson,
  parseBody,
  normalize,
  hashPassword,
  signToken,
  verifyToken,
  getBearerToken,
  buildWalletAddresses
} = require("./helpers");

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function authRoute(req, res, pathname) {
  if (pathname === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await parseBody(req);

      const username = normalize(body.username).toLowerCase();
      const email = normalize(body.email).toLowerCase();
      const password = normalize(body.password);

      if (!username || !email || !password) {
        sendJson(res, 400, { error: "Username, email, and password are required." });
        return true;
      }

      const existing = await pool.query(
        `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
        [username, email]
      );

      if (existing.rows.length) {
        sendJson(res, 409, { error: "Username or email already exists." });
        return true;
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
          "user",
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

      sendJson(res, 201, {
        message: "Account created successfully.",
        user: { id, username, email, role: "user" }
      });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Registration failed." });
      return true;
    }
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const identifier = normalize(body.identifier).toLowerCase();
      const password = normalize(body.password);

      if (!identifier || !password) {
        sendJson(res, 400, { error: "Identifier and password are required." });
        return true;
      }

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );

      const user = result.rows[0];

      if (!user || user.password_hash !== hashPassword(password)) {
        sendJson(res, 401, { error: "Invalid username/email or password." });
        return true;
      }

      const token = signToken({
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      sendJson(res, 200, {
        message: "Login successful.",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Login failed." });
      return true;
    }
  }

  if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const email = normalize(body.email).toLowerCase();

      if (!email) {
        sendJson(res, 400, { error: "Email is required." });
        return true;
      }

      const result = await pool.query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [email]
      );

      if (!result.rows.length) {
        sendJson(res, 404, { error: "No account found with that email." });
        return true;
      }

      const code = generateResetCode();
      const expires = Date.now() + 15 * 60 * 1000;

      await pool.query(
        `UPDATE users SET reset_code = $1, reset_code_expires_at = $2 WHERE email = $3`,
        [code, expires, email]
      );

      sendJson(res, 200, {
        message: "Reset code generated successfully.",
        resetCode: code
      });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Could not process forgot password." });
      return true;
    }
  }

  if (pathname === "/api/auth/reset-password" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const email = normalize(body.email).toLowerCase();
      const resetCode = normalize(body.resetCode);
      const newPassword = normalize(body.newPassword);

      if (!email || !resetCode || !newPassword) {
        sendJson(res, 400, { error: "Email, reset code, and new password are required." });
        return true;
      }

      const result = await pool.query(
        `SELECT * FROM users WHERE email = $1 LIMIT 1`,
        [email]
      );

      const user = result.rows[0];

      if (!user) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      if (!user.reset_code || !user.reset_code_expires_at) {
        sendJson(res, 400, { error: "No active reset request found." });
        return true;
      }

      if (Date.now() > Number(user.reset_code_expires_at)) {
        await pool.query(
          `UPDATE users SET reset_code = NULL, reset_code_expires_at = NULL WHERE email = $1`,
          [email]
        );
        sendJson(res, 400, { error: "Reset code has expired." });
        return true;
      }

      if (String(user.reset_code) !== resetCode) {
        sendJson(res, 400, { error: "Invalid reset code." });
        return true;
      }

      await pool.query(
        `UPDATE users
         SET password_hash = $1, reset_code = NULL, reset_code_expires_at = NULL
         WHERE email = $2`,
        [hashPassword(newPassword), email]
      );

      sendJson(res, 200, { message: "Password reset successful." });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Could not reset password." });
      return true;
    }
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    try {
      const token = getBearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing authorization token." });
        return true;
      }

      const payload = verifyToken(token);
      if (!payload) {
        sendJson(res, 401, { error: "Invalid or expired token." });
        return true;
      }

      const result = await pool.query(
        `SELECT id, username, email, role FROM users WHERE id = $1 LIMIT 1`,
        [payload.sub]
      );

      const user = result.rows[0];

      if (!user) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      sendJson(res, 200, user);
      return true;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Failed to fetch current user." });
      return true;
    }
  }

  return false;
}

module.exports = authRoute;