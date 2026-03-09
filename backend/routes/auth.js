const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "..", "db", "data.json");
const JWT_SECRET = process.env.JWT_SECRET || "mnbase-dev-secret-change-me";

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { users: [] };
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const db = raw ? JSON.parse(raw) : {};

    if (!Array.isArray(db.users)) {
      db.users = [];
    }

    return db;
  } catch (err) {
    return { users: [] };
  }
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
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
      } catch (err) {
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

function isPasswordValid(user, password) {
  const incomingHash = hashPassword(password);

  if (user.passwordHash) {
    return user.passwordHash === incomingHash;
  }

  if (user.password) {
    return user.password === password || user.password === incomingHash;
  }

  return false;
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

    if (!header || !body || !signature) {
      return null;
    }

    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (expected !== signature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return null;
  }
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
        return sendJson(res, 400, { error: "Username, email, and password are required." });
      }

      const db = readDb();

      const usernameTaken = db.users.some((u) => String(u.username).toLowerCase() === username);
      if (usernameTaken) {
        return sendJson(res, 409, { error: "Username already exists." });
      }

      const emailTaken = db.users.some((u) => String(u.email).toLowerCase() === email);
      if (emailTaken) {
        return sendJson(res, 409, { error: "Email already exists." });
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
      writeDb(db);

      return sendJson(res, 201, {
        message: "Account created successfully.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || "Registration failed." });
    }
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const identifier = normalize(body.identifier).toLowerCase();
      const password = normalize(body.password);

      if (!identifier || !password) {
        return sendJson(res, 400, { error: "Identifier and password are required." });
      }

      const db = readDb();

      const user = db.users.find(
        (u) =>
          String(u.username || "").toLowerCase() === identifier ||
          String(u.email || "").toLowerCase() === identifier
      );

      if (!user || !isPasswordValid(user, password)) {
        return sendJson(res, 401, { error: "Invalid username/email or password." });
      }

      const token = signToken({
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      return sendJson(res, 200, {
        message: "Login successful.",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role || "user"
        }
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || "Login failed." });
    }
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const token = getBearerToken(req);

    if (!token) {
      return sendJson(res, 401, { error: "Missing authorization token." });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return sendJson(res, 401, { error: "Invalid or expired token." });
    }

    const db = readDb();
    const user = db.users.find((u) => u.id === payload.sub);

    if (!user) {
      return sendJson(res, 404, { error: "User not found." });
    }

    return sendJson(res, 200, {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || "user"
    });
  }

  return false;
}

module.exports = authRoute;