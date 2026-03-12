const crypto = require("crypto");
const { readDB, writeDB } = require("../db/store");
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

      const db = readDB();

      if (db.users.some((u) => String(u.username).toLowerCase() === username)) {
        sendJson(res, 409, { error: "Username already exists." });
        return true;
      }

      if (db.users.some((u) => String(u.email).toLowerCase() === email)) {
        sendJson(res, 409, { error: "Email already exists." });
        return true;
      }

      const seed = crypto.randomBytes(8).toString("hex");
      const user = {
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: hashPassword(password),
        role: "user",
        balance: 0,
        cardActivated: false,
        cardBalance: 0,
        wallets: buildWalletAddresses(seed),
        transactions: [],
        resetCode: null,
        resetCodeExpiresAt: null,
        createdAt: new Date().toISOString()
      };

      db.users.push(user);
      writeDB(db);

      sendJson(res, 201, {
        message: "Account created successfully.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
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

      const db = readDB();
      const user = db.users.find(
        (u) =>
          String(u.username || "").toLowerCase() === identifier ||
          String(u.email || "").toLowerCase() === identifier
      );

      if (!user || user.passwordHash !== hashPassword(password)) {
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

      const db = readDB();
      const user = db.users.find((u) => String(u.email || "").toLowerCase() === email);

      if (!user) {
        sendJson(res, 404, { error: "No account found with that email." });
        return true;
      }

      const code = generateResetCode();
      user.resetCode = code;
      user.resetCodeExpiresAt = Date.now() + 15 * 60 * 1000;

      writeDB(db);

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

      const db = readDB();
      const user = db.users.find((u) => String(u.email || "").toLowerCase() === email);

      if (!user) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      if (!user.resetCode || !user.resetCodeExpiresAt) {
        sendJson(res, 400, { error: "No active reset request found." });
        return true;
      }

      if (Date.now() > Number(user.resetCodeExpiresAt)) {
        user.resetCode = null;
        user.resetCodeExpiresAt = null;
        writeDB(db);
        sendJson(res, 400, { error: "Reset code has expired." });
        return true;
      }

      if (String(user.resetCode) !== resetCode) {
        sendJson(res, 400, { error: "Invalid reset code." });
        return true;
      }

      user.passwordHash = hashPassword(newPassword);
      user.resetCode = null;
      user.resetCodeExpiresAt = null;

      writeDB(db);

      sendJson(res, 200, { message: "Password reset successful." });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Could not reset password." });
      return true;
    }
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
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

    const db = readDB();
    const user = db.users.find((u) => u.id === payload.sub);

    if (!user) {
      sendJson(res, 404, { error: "User not found." });
      return true;
    }

    sendJson(res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });
    return true;
  }

  return false;
}

module.exports = authRoute;