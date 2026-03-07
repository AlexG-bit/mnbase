const { getDB, saveDB } = require('../db/store');
const { requireAdmin } = require('../middleware/auth');
const { ok, created, badRequest, notFound } = require('../utils/response');
const { hashPassword } = require('../utils/crypto');

module.exports = function(req, res) {
  requireAdmin(req, res, () => {
    const db = getDB();
    const p = req.path;

    if (p === '/api/admin/stats' && req.method === 'GET') {
      const users = Object.values(db.users);
      const total = users.reduce((a, u) => a + Object.values(u.balances).reduce((x,y)=>x+y,0), 0);
      return ok(res, { userCount: users.length, totalBalance: total, txnCount: db.admin_txns.length });
    }

    if (p === '/api/admin/users' && req.method === 'GET') {
      const users = Object.values(db.users).map(u => ({
        username: u.username, role: u.role, balances: u.balances,
        total: Object.values(u.balances).reduce((a,b)=>a+b,0),
        txnCount: u.txns.length,
        cardActivated: u.card?.activated || false
      }));
      return ok(res, { users });
    }

    if (p === '/api/admin/users' && req.method === 'POST') {
      const { username, password, role } = req.body;
      if (!username || !password) return badRequest(res, 'Username and password required');
      if (db.users[username]) return badRequest(res, 'User already exists');
      const cardNum = '4716 ' + Math.random().toString().slice(2,6) + ' ' + Math.random().toString().slice(2,6) + ' ' + Math.random().toString().slice(2,6);
      db.users[username] = {
        username, password: hashPassword(password), role: role || 'user',
        balances: { btc:0, eth:0, sol:0, bnb:0, matic:0, avax:0, arb:0, op:0, usdt:0, xrp:0 },
        txns: [], createdAt: Date.now(),
        card: { activated: false, number: cardNum, expiry: '12/28', cvv: Math.floor(100+Math.random()*900).toString() }
      };
      saveDB();
      return created(res, { message: 'User created' });
    }

    if (p === '/api/admin/activate-card' && req.method === 'POST') {
      const { username } = req.body;
      const user = db.users[username];
      if (!user) return notFound(res, 'User not found');
      if (!user.card) user.card = { activated: false, number: '4716 0000 0000 0000', expiry: '12/28', cvv: '000' };
      user.card.activated = true;
      saveDB();
      return ok(res, { message: 'Card activated for ' + username });
    }

    if (p === '/api/admin/deactivate-card' && req.method === 'POST') {
      const { username } = req.body;
      const user = db.users[username];
      if (!user) return notFound(res, 'User not found');
      if (user.card) user.card.activated = false;
      saveDB();
      return ok(res, { message: 'Card deactivated for ' + username });
    }

    if (p === '/api/admin/fund' && req.method === 'POST') {
      const { username, netKey, type, amount, note } = req.body;
      const user = db.users[username];
      if (!user) return notFound(res, 'User not found');
      const prev = user.balances[netKey] || 0;
      if (type === 'add') user.balances[netKey] = prev + amount;
      else if (type === 'sub') user.balances[netKey] = Math.max(0, prev - amount);
      else if (type === 'set') user.balances[netKey] = amount;
      const txn = { netKey, type, amount, note, prev, after: user.balances[netKey], time: new Date().toLocaleTimeString(), label: note || type, ts: Date.now() };
      user.txns.unshift(txn);
      db.admin_txns.unshift({ ...txn, username });
      saveDB();
      return ok(res, { message: 'Funded', balance: user.balances[netKey] });
    }

    if (p === '/api/admin/txns' && req.method === 'GET') {
      return ok(res, { txns: db.admin_txns });
    }
  });
};