const { getDB, saveDB } = require('../db/store');
const { hashPassword, verifyPassword, generateToken } = require('../utils/crypto');
const { ok, created, badRequest, unauthorized } = require('../utils/response');

module.exports = function(req, res) {
  const p = req.path;
  if (p === '/api/auth/register' && req.method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return badRequest(res, 'Username and password required');
    if (username.length < 3) return badRequest(res, 'Username must be at least 3 characters');
    if (password.length < 6) return badRequest(res, 'Password must be at least 6 characters');
    const db = getDB();
    if (db.users[username]) return badRequest(res, 'Username already taken');
    db.users[username] = {
      username, password: hashPassword(password), role: 'user',
      balances: { btc:0, eth:0, sol:0, bnb:0, matic:0, avax:0, arb:0, op:0 },
      txns: [], createdAt: Date.now()
    };
    saveDB();
    const token = generateToken({ username, role: 'user' });
    return created(res, { token, user: { username, role: 'user' } });
  }
  if (p === '/api/auth/login' && req.method === 'POST') {
    const { username, password } = req.body;
    const db = getDB();
    const user = db.users[username];
    if (!user || !verifyPassword(password, user.password)) return unauthorized(res, 'Invalid credentials');
    const token = generateToken({ username, role: user.role });
    return ok(res, { token, user: { username, role: user.role } });
  }
  if (p === '/api/auth/me' && req.method === 'GET') {
    const header = req.headers['authorization'] || '';
    const token = header.replace('Bearer ', '');
    const { verifyToken } = require('../utils/crypto');
    const payload = verifyToken(token);
    if (!payload) return unauthorized(res);
    return ok(res, { user: payload });
  }
};