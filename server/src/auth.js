// server/src/auth.js
import Database from 'better-sqlite3';
import crypto from 'crypto';

const db = new Database('config.db');
try { db.pragma('journal_mode = WAL'); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS admin_user (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username   TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,   -- "s1:<hex>" or "pbk2:<hex>"
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function getSecret() {
  const row = db.prepare('SELECT value FROM auth_meta WHERE key = ?').get('secret');
  if (row?.value) return Buffer.from(row.value, 'hex');
  const sec = crypto.randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO auth_meta (key,value) VALUES (?,?)')
    .run('secret', sec.toString('hex'));
  return sec;
}
const SECRET = getSecret();

// scrypt with safe memory + PBKDF2 fallback
const SCRYPT = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }; // ~16MiB

const saltHex = () => crypto.randomBytes(16).toString('hex');
const scrypt = (pwd, salt) => crypto.scryptSync(pwd, Buffer.from(salt, 'hex'), 64, SCRYPT).toString('hex');
const pbkdf2 = (pwd, salt) => crypto.pbkdf2Sync(pwd, Buffer.from(salt, 'hex'), 310000, 64, 'sha256').toString('hex');

export function hasAdmin() {
  return !!db.prepare('SELECT 1 FROM admin_user WHERE id = 1').get();
}

export function setAdminCredentials(username, password) {
  if (!username || !password) throw new Error('Missing username/password');
  const salt = saltHex();
  let method = 's1', hash;
  try { hash = scrypt(password, salt); }
  catch { method = 'pbk2'; hash = pbkdf2(password, salt); }
  const ts = Date.now();
  db.prepare(`
    INSERT INTO admin_user (id, username, pass_hash, salt, created_at, updated_at)
    VALUES (1, @u, @h, @s, @ts, @ts)
    ON CONFLICT(id) DO UPDATE SET
      username=excluded.username, pass_hash=excluded.pass_hash,
      salt=excluded.salt, updated_at=excluded.updated_at
  `).run({ u: String(username), h: `${method}:${hash}`, s: salt, ts });
  return true;
}

export function verifyLogin(username, password) {
  const row = db.prepare('SELECT username, pass_hash, salt FROM admin_user WHERE id = 1').get();
  if (!row || row.username !== String(username)) return false;
  const [prefix, stored] = row.pass_hash.includes(':') ? row.pass_hash.split(':', 2) : [null, row.pass_hash];
  let calc;
  try { calc = (prefix === 'pbk2') ? pbkdf2(password, row.salt) : scrypt(password, row.salt); }
  catch { calc = pbkdf2(password, row.salt); }
  const a = Buffer.from(calc, 'hex'); const b = Buffer.from(stored, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// tiny HS256 JWT
const b64url = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
  .toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64')
  .replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

export function createSession(username, hours = 24) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: username, iat: now, exp: now + hours * 3600, v: 1 };
  const seg = `${b64url(header)}.${b64url(payload)}`;
  return `${seg}.${sign(seg)}`;
}

export function verifyToken(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [h, p, s] = token.split('.');
  if (sign(`${h}.${p}`) !== s) return null;
  try {
    const payload = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
    if (!payload?.sub) return null;
    if (payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
    return { username: payload.sub };
  } catch { return null; }
}
