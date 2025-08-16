import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const db = new Database('config.db');

// Backfill admin columns
try { db.exec("ALTER TABLE config ADD COLUMN admin_user TEXT"); } catch {}
try { db.exec("ALTER TABLE config ADD COLUMN admin_pass_hash TEXT"); } catch {}

const sessions = new Map(); // token -> { user, exp }

function now() { return Date.now(); }
function ttl(ms) { return now() + ms; }

export function hasAdmin() {
  const row = db.prepare('SELECT admin_user, admin_pass_hash FROM config WHERE id = 1').get();
  return !!(row?.admin_user && row?.admin_pass_hash);
}

export function setAdminCredentials(username, password) {
  if (!username || !password) throw new Error('Missing username/password');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE config SET admin_user = ?, admin_pass_hash = ? WHERE id = 1').run(username, hash);
  return true;
}

export function verifyLogin(username, password) {
  const row = db.prepare('SELECT admin_user, admin_pass_hash FROM config WHERE id = 1').get();
  if (!row?.admin_user || !row?.admin_pass_hash) return false;
  if (String(username) !== String(row.admin_user)) return false;
  return bcrypt.compareSync(password, row.admin_pass_hash);
}

export function createSession(username, hours = 24) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: username, exp: ttl(hours * 3600 * 1000) });
  return token;
}

export function verifyToken(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < now()) { sessions.delete(token); return null; }
  return s.user;
}

export function revokeToken(token) {
  sessions.delete(token);
}
