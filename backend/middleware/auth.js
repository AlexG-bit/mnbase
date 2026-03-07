const { verifyToken } = require('../utils/crypto');
const { unauthorized } = require('../utils/response');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '');
  if (!token) return unauthorized(res);
  const payload = verifyToken(token);
  if (!payload) return unauthorized(res);
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return unauthorized(res, 'Admin only');
    next();
  });
}

module.exports = { requireAuth, requireAdmin };