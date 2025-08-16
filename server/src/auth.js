// server/src/auth.js
import Database from 'better-sqlite3';
import crypto from 'crypto';

// --- DB SETUP ---
const db = new Database('config.db');
try { db.pragma('journal_mode = WAL'); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  token_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

function addCol(sql) { try { db.exec(sql); } catch {} }
addCol(`ALTER TABLE admin ADD COLUMN token_secret TEXT NOT NULL DEFAULT ''`);
addCol(`ALTER TABLE admin ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`);

function getAdminRow() {
  return db.prepare('SELECT * FROM admin WHERE id = 1').get();
}

// Backfill secret if needed
(function ensureSecret() {
  const row = getAdminRow();
  if (row && (!row.token_secret || row.token_secret.length < 16)) {
    const secret = crypto.randomBytes(32).toString('base64url');
    db.prepare('UPDATE admin SET token_secret = @s WHERE id = 1').run({ s: secret });
  }
})();

// --- SCRYPT PARAMS ---
function scryptParams() {
  const N = 1 << 15; // 32768
  const r = 8;
  const p = 1;
  const keylen = 64;
  // Bump maxmem so Node doesn’t error (default ~32MB is too low for N=32768, r=8)
  const maxmem = 128 * 1024 * 1024; // 128MB headroom
  return { N, r, p, keylen, maxmem };
}

// --- PASSWORD HASHING ---
function hashPassword(password, salt) {
  const { N, r, p, keylen, maxmem } = scryptParams();
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem });
  return `scrypt$N=${N},r=${r},p=${p}$${salt}$${derived.toString('base64url')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, params, salt, dig] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const parts = Object.fromEntries(params.split(',').map(kv => kv.split('=')));
    const N = Number(parts.N), r = Number(parts.r), p = Number(parts.p);
    const digestBuf = Buffer.from(dig, 'base64url');
    const keylen = digestBuf.length;
    // Calculate a safe maxmem for these params (>= memory needed)
    const needed = 128 * N * r; // bytes (approx scrypt memory)
    const maxmem = Math.max(64 * 1024 * 1024, needed + (8 * 1024 * 1024)); // add some slack
    const derived = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem });
    return crypto.timingSafeEqual(digestBuf, derived);
  } catch {
    return false;
  }
}

// --- TOKEN (HMAC “JWT”-ish) ---
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function sign(payload, secret) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const data = `${head}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verify(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const data = `${head}.${body}`;
  const expect = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
  return payload;
}

// --- PUBLIC API ---
export function hasAdmin() { return !!getAdminRow(); }

export function setAdminCredentials(username, password) {
  if (hasAdmin()) throw new Error('Admin already configured');
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!u || !p) throw new Error('Missing username or password');

  const salt = crypto.randomBytes(16).toString('base64url');
  const password_hash = hashPassword(p, salt);
  const token_secret = crypto.randomBytes(32).toString('base64url');
  const created_at = Date.now();

  db.prepare(`
    INSERT INTO admin (id, username, salt, password_hash, token_secret, created_at)
    VALUES (1, @username, @salt, @password_hash, @token_secret, @created_at)
  `).run({ username: u, salt, password_hash, token_secret, created_at });

  return { username: u, created_at };
}

export function verifyLogin(username, password) {
  const row = getAdminRow();
  if (!row) return false;
  if (String(username || '').trim() !== row.username) return false;
  return verifyPassword(String(password || ''), row.password_hash);
}

export function createSession(username, hours = 24) {
  const row = getAdminRow();
  if (!row) throw new Error('No admin configured');
  const now = Date.now();
  const exp = now + Math.max(1, Number(hours)) * 60 * 60 * 1000;
  return sign({ sub: String(username), iat: now, exp }, row.token_secret);
}

export function verifyToken(token) {
  const row = getAdminRow();
  if (!row) return null;
  const payload = verify(token, row.token_secret);
  if (!payload) return null;
  if (payload.sub !== row.username) return null;
  return { username: row.username, iat: payload.iat, exp: payload.exp };
}

export function rotateTokenSecret() {
  const row = getAdminRow();
  if (!row) throw new Error('No admin configured');
  const secret = crypto.randomBytes(32).toString('base64url');
  db.prepare('UPDATE admin SET token_secret = @secret WHERE id = 1').run({ secret });
  return true;
}
