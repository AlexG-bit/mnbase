const crypto = require("crypto");

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

function buildWalletAddresses(seed) {
  return {
    BTC: `bc1q${seed}btc9x4f2w7m1q8n5`,
    ETH: `0x${seed}eth9ab45cd7821ef`,
    USDT: `T${seed}usdt6Za91x4Pq`
  };
}

module.exports = {
  sendJson,
  parseBody,
  normalize,
  hashPassword,
  signToken,
  verifyToken,
  getBearerToken,
  buildWalletAddresses
};