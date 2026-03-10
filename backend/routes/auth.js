const crypto = require("crypto");
const { readDB, writeDB } = require("../db/store");

const JWT_SECRET = process.env.JWT_SECRET || "mnbase-dev-secret-change-me";

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function normalize(value) {
  return String(value || "").trim();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function signToken(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = String(token || "").split(".");

    if (!header || !body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (expected !== signature) return null;

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function getUserFromToken(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const db = readDB();
  return db.users.find((u) => u.id === payload.sub) || null;
}

function getDefaultWallet() {
  return {
    usdBalance: 0,
    cardActivated: false,
    assets: {
      BTC: { balance: 0.1254, address: "bc1qmnbase8x2k9v7w0examplebtc001" },
      ETH: { balance: 1.842, address: "0xMNBASEeTh00198f3examplewallet002" },
      USDT: { balance: 2500, address: "TQMNBASEuSdT002examplewallet003" }
    }
  };
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
        wallet: getDefaultWallet(),
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
    const user = getUserFromToken(req);

    if (!user) {
      sendJson(res, 401, { error: "Invalid or expired token." });
      return true;
    }

    sendJson(res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      wallet: user.wallet || getDefaultWallet()
    });
    return true;
  }

  if (pathname === "/api/wallet/receive" && req.method === "GET") {
    const user = getUserFromToken(req);

    if (!user) {
      sendJson(res, 401, { error: "Invalid or expired token." });
      return true;
    }

    sendJson(res, 200, {
      assets: user.wallet?.assets || getDefaultWallet().assets
    });
    return true;
  }

  if (pathname === "/api/wallet/convert-options" && req.method === "GET") {
    const user = getUserFromToken(req);

    if (!user) {
      sendJson(res, 401, { error: "Invalid or expired token." });
      return true;
    }

    sendJson(res, 200, {
      pairs: [
        { asset: "BTC", currencies: ["USD", "NGN", "EUR", "GBP"] },
        { asset: "ETH", currencies: ["USD", "NGN", "EUR", "GBP"] },
        { asset: "USDT", currencies: ["USD", "NGN", "KES", "GHS"] }
      ]
    });
    return true;
  }

  if (pathname === "/api/wallet/card" && req.method === "GET") {
    const user = getUserFromToken(req);

    if (!user) {
      sendJson(res, 401, { error: "Invalid or expired token." });
      return true;
    }

    sendJson(res, 200, {
      cardActivated: !!user.wallet?.cardActivated,
      usdBalance: user.wallet?.usdBalance || 0,
      holderName: user.username.toUpperCase(),
      last4: "2847",
      brand: "MNBase Virtual Card"
    });
    return true;
  }

  if (pathname === "/api/admin/users" && req.method === "GET") {
    const user = getUserFromToken(req);

    if (!user || user.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return true;
    }

    const db = readDB();

    sendJson(res, 200, {
      users: db.users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        usdBalance: u.wallet?.usdBalance || 0,
        cardActivated: !!u.wallet?.cardActivated
      }))
    });
    return true;
  }

  if (pathname === "/api/admin/fund" && req.method === "POST") {
    const admin = getUserFromToken(req);

    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return true;
    }

    try {
      const body = await parseBody(req);
      const identifier = normalize(body.identifier).toLowerCase();
      const amount = Number(body.amount);

      if (!identifier || !amount || amount <= 0) {
        sendJson(res, 400, { error: "Valid identifier and amount are required." });
        return true;
      }

      const db = readDB();
      const user = db.users.find(
        (u) =>
          String(u.username || "").toLowerCase() === identifier ||
          String(u.email || "").toLowerCase() === identifier
      );

      if (!user) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      if (!user.wallet) {
        user.wallet = getDefaultWallet();
      }

      user.wallet.usdBalance = Number(user.wallet.usdBalance || 0) + amount;
      writeDB(db);

      sendJson(res, 200, {
        message: "Wallet funded successfully.",
        usdBalance: user.wallet.usdBalance
      });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Funding failed." });
      return true;
    }
  }

  if (pathname === "/api/admin/activate-card" && req.method === "POST") {
    const admin = getUserFromToken(req);

    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return true;
    }

    try {
      const body = await parseBody(req);
      const identifier = normalize(body.identifier).toLowerCase();

      if (!identifier) {
        sendJson(res, 400, { error: "User identifier is required." });
        return true;
      }

      const db = readDB();
      const user = db.users.find(
        (u) =>
          String(u.username || "").toLowerCase() === identifier ||
          String(u.email || "").toLowerCase() === identifier
      );

      if (!user) {
        sendJson(res, 404, { error: "User not found." });
        return true;
      }

      if (!user.wallet) {
        user.wallet = getDefaultWallet();
      }

      user.wallet.cardActivated = true;
      writeDB(db);

      sendJson(res, 200, {
        message: "Card activated successfully."
      });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Card activation failed." });
      return true;
    }
  }

  return false;
}

module.exports = authRoute;