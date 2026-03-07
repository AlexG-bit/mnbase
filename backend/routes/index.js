const authRoutes = require('./auth');
const walletRoutes = require('./wallet');
const userRoutes = require('./users');
const adminRoutes = require('./admin');

function router(req, res) {
  const p = req.path;
  if (p.startsWith('/api/auth')) return authRoutes(req, res);
  if (p.startsWith('/api/wallet')) return walletRoutes(req, res);
  if (p.startsWith('/api/user')) return userRoutes(req, res);
  if (p.startsWith('/api/admin')) return adminRoutes(req, res);
  if (p === '/api/health') { res.writeHead(200); res.end(JSON.stringify({status:'ok'})); return; }
  res.writeHead(404); res.end(JSON.stringify({message:'Not found'}));
}

module.exports = { router };