const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return verify === hash;
}

function generateToken(payload) {
  const secret = process.env.JWT_SECRET || 'mnbase_secret_2024';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'mnbase_secret_2024';
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken };