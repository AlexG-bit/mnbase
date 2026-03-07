const { getDB } = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { ok } = require('../utils/response');

module.exports = function(req, res) {
  requireAuth(req, res, () => {
    const db = getDB();
    const user = db.users[req.user.username];
    const p = req.path;

    if (p === '/api/wallet/balances' && req.method === 'GET') {
      const balances = user.balances;
      const total = Object.values(balances).reduce((a, b) => a + b, 0);
      return ok(res, { balances, total });
    }

    if (p === '/api/wallet/txns' && req.method === 'GET') {
      return ok(res, { txns: user.txns || [] });
    }

    if (p === '/api/wallet/summary' && req.method === 'GET') {
      const total = Object.values(user.balances).reduce((a, b) => a + b, 0);
      return ok(res, { total, txnCount: user.txns.length });
    }

    if (p === '/api/wallet/card' && req.method === 'GET') {
      const card = user.card || { activated: false, number: '#### #### #### ####', expiry: '--/--', cvv: '---' };
      return ok(res, { card });
    }
  });
};