// Demo vendor sign-in. Each stall has a demo PIN (see the README). Signing in
// returns a signed token that names ONE stall; every vendor request is limited
// to that stall, so a vendor never sees another stall's orders.
//
// This is demo protection, not real security: the PINs are public in the README.
// The token is signed (HMAC), not stored, so it works on every Vercel server copy.
const crypto = require('node:crypto');
const config = require('./config');
const { OrderError } = require('./orders');

const SECRET = process.env.VENDOR_SESSION_SECRET || 'canteenflow-demo-only-not-secret';
const mac = (text) => crypto.createHmac('sha256', SECRET).update(text).digest('base64url');

/** Token "<stallId>.<expiresMs>.<signature>". */
function signToken(stallId, nowMs) {
  const payload = `${stallId}.${nowMs + config.VENDOR_SESSION_HOURS * 3600 * 1000}`;
  return `${payload}.${mac(payload)}`;
}

/** Stall id from a valid, unexpired token, else null. */
function verifyToken(token, nowMs) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [stallId, expires, sig] = parts;
  const expected = mac(`${stallId}.${expires}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!(Number(expires) > nowMs)) return null;
  return Number(stallId) || null;
}

/** Check a stall's demo PIN. Returns { token, stall }. */
async function login(db, stallId, pin, nowMs) {
  const row = await db.get('SELECT stall_id, name, vendor_pin FROM stalls WHERE stall_id = ?', [Number(stallId) || -1]);
  const given = Buffer.from(String(pin ?? ''));
  const real = Buffer.from(row ? row.vendor_pin : 'x');
  if (!row || given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    throw new OrderError(401, 'Wrong stall or PIN.');
  }
  return { token: signToken(Number(row.stall_id), nowMs), stall: { id: Number(row.stall_id), name: row.name } };
}

/** Express middleware: needs "Authorization: Bearer <token>"; sets req.stallId. */
const requireVendor = (now) => (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  const stallId = m && verifyToken(m[1], now());
  if (!stallId) return res.status(401).json({ error: 'Please sign in as the stall vendor.' });
  req.stallId = stallId;
  next();
};

module.exports = { login, requireVendor, signToken, verifyToken };
