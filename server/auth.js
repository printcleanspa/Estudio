'use strict';
const crypto = require('node:crypto');

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const exp = Buffer.from(hashHex, 'hex');
  return h.length === exp.length && crypto.timingSafeEqual(h, exp);
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function makeAuth(db, { secureCookie = false } = {}) {
  const TTL = 7 * 24 * 3600 * 1000;
  const attempts = new Map(); // limitador simple de intentos de login

  function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token), userId, Date.now() + TTL);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL / 1000}${secureCookie ? '; Secure' : ''}`);
  }
  function destroySession(req, res) {
    const t = parseCookies(req).sid;
    if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(t));
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  }
  function requireAuth(req, res, next) {
    const t = parseCookies(req).sid;
    if (t) {
      const row = db.prepare('SELECT u.id,u.email,u.name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(hashToken(t));
      if (row && row.expires_at > Date.now()) { req.user = { id: row.id, email: row.email, name: row.name, role: row.role }; return next(); }
    }
    res.status(401).json({ error: 'No autenticado' });
  }
  const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Solo administradores' }));
  function throttle(key) {
    const now = Date.now();
    const a = (attempts.get(key) || []).filter((x) => now - x < 15 * 60 * 1000);
    if (a.length >= 10) return false;
    a.push(now); attempts.set(key, a); return true;
  }
  return { createSession, destroySession, requireAuth, requireAdmin, throttle };
}
module.exports = { hashPassword, verifyPassword, makeAuth };
