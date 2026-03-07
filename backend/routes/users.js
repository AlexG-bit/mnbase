const { getDB, saveDB } = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { ok, badRequest } = require('../utils/response');
const { hashPassword, verifyPassword } = require('../utils/crypto');

module.exports = function(req, res) {
  requireAuth(req, res, () => {
    const db = getDB();
    const user = db.users[req.user.username];
    const p = req.path;

    if (p === '/api/user/profile' && req.method === 'GET') {
      return ok(res, { user: { username: user.username, role: user.role, createdAt: user.createdAt } });
    }

    if (p === '/api/user/change-password' && req.method === 'PATCH') {
      const { oldPassword, newPassword } = req.body;
      if (!verifyPassword(oldPassword, user.password)) return badRequest(res, 'Wrong password');
      if (newPassword.length < 6) return badRequest(res, 'Password too short');
      user.password = hashPassword(newPassword);
      saveDB();
      return ok(res, { message: 'Password updated' });
    }
  });
};