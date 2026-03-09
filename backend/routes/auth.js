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
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
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

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
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

      const usernameTaken = db.users.some((u) => String(u.username).toLowerCase() === username);
      if (usernameTaken) {
        sendJson(res, 409, { error: "Username already exists." });
        return true;
      }

      const emailTaken = db.users.some((u) => String(u.email).toLowerCase() === email);
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