const crypto = require("crypto");
const { readDB, writeDB } = require("../db/store");
const {
  sendJson,
  parseBody,
  normalize,
  hashPassword,
  signToken,
  verifyToken,
  getBearerToken
} = require("./helpers");

function makeAddress(symbol) {
  return `${symbol}_${crypto.randomBytes(16).toString("hex")}`;
}

async function authRoute(req, res, pathname) {
  if (pathname === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await parseBody(req);

      const username = normalize(body.username).toLowerCase();
      const email = normalize(body.email).toLowerCase();
      const password = normalize(body.password);

      if (!username || !email || !password) {
        sendJson(res, 400, {
          error: "Username, email, and password are required."
        });
        return true;
      }

      const db = readDB();

      const usernameTaken = db.users.some(
        (u) => String(u.username).toLowerCase() === username
      );

      if (usernameTaken) {
        sendJson(res, 409, { error: "Username already exists." });
        return true;
      }

      const emailTaken = db.users.some(
        (u) => String(u.email).toLowerCase() === email
      );

      if (emailTaken) {
        sendJson(res, 409, { error: "Email already exists." });
        return true;
      }

      const user = {
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash: hashPassword(password),
        role: "user",
        balance: 0,
        cardActivated: false,
        cardBalance: 0,
        wallets: {
          BTC: makeAddress("BTC"),
          ETH: makeAddress("ETH"),
          USDT: makeAddress("USDT")
        },
        transactions: [],
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
        sendJson(res, 400, {
          error: "Identifier and password are required."
        });
        return true;
      }

      const db = readDB();

      const user = db.users.find(
        (u) =>
          String(u.username || "").toLowerCase() === identifier ||
          String(u.email || "").toLowerCase() === identifier
      );

      if (!user || user.passwordHash !== hashPassword(password)) {
        sendJson(res, 401, {
          error: "Invalid username/email or password."
        });
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
      role: user.role,
      balance: Number(user.balance || 0),
      cardActivated: !!user.cardActivated,
      cardBalance: Number(user.cardBalance || 0)
    });
    return true;
  }

  return false;
}

module.exports = authRoute;