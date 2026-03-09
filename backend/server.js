const http = require("http");
const url = require("url");

const { router } = require("./routes/index");
const log = require("./utils/logger");
const { initDB } = require("./db/store");
const { seedAdmin } = require("./db/seed");

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

const allowedOrigins = [
  "https://mnbase.app",
  "https://admin.mnbase.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000"
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

initDB();
seedAdmin();

const server = http.createServer((req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: "MNBase API",
        status: "ok",
        message: "Server is running"
      })
    );
    return;
  }

  if (parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy"
      })
    );
    return;
  }

  try {
    router(req, res, parsedUrl);
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error"
      })
    );
  }
});

server.listen(PORT, HOST, () => {
  log(`MNBase running on port ${PORT}`);
});