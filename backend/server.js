const http = require('http');
const url = require('url');
const { router } = require('./routes/index');
const logger = require('./utils/logger');
const { initDB } = require('./db/store');
const { seedAdmin } = require('./db/seed');

const PORT = process.env.PORT || 3000;

initDB();
seedAdmin();

const server = http.createServer((req, res) => {
  const p = url.parse(req.url, true);
  req.query = p.query;
  req.path = p.pathname;
  res.setHeader("Access-Control-Allow-Origin", "https://mnbase.app");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

if (req.method === "OPTIONS") {
  res.writeHead(204);
  res.end();
  return;
 }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
    logger.log(req.method + ' ' + req.path);
    router(req, res);
  });
});
   server.listen(PORT, '0.0.0.0', () => {
  console.log(`MN Base running on port ${PORT}`);
}); 