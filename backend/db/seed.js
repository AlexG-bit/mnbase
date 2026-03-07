const { getDB, saveDB } = require('./store');
const { hashPassword } = require('../utils/crypto');

function seedAdmin() {
  const db = getDB();
  if (!db.users['admin']) {
    db.users['admin'] = {
      username: 'admin',
      password: hashPassword('mnbase2024'),
      role: 'admin',
      balances: { btc:0, eth:0, sol:0, bnb:0, matic:0, avax:0, arb:0, op:0, usdt:0, xrp:0 },
      txns: [],
      card: { activated: true, number: '4716 2345 6789 0123', expiry: '12/28', cvv: '321' },
      createdAt: Date.now()
    };
    saveDB();
    console.log('Admin account created');
  }
}

module.exports = { seedAdmin };