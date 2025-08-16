import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

function parseCSV(str = '') {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

const db = new Database('config.db');
try { db.pragma('journal_mode = WAL'); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  plex_url TEXT,
  plex_token TEXT,
  library_keys TEXT,
  user_filters TEXT,
  player_filters TEXT,
  latest_limit INTEGER DEFAULT 40,
  carousel_dwell_ms INTEGER DEFAULT 3500,
  poll_ms INTEGER DEFAULT 3000,
  -- display prefs
  show_synopsis INTEGER DEFAULT 1,
  synopsis_max_lines INTEGER DEFAULT 6,
  poster_height_vh INTEGER DEFAULT 90,
  title_size TEXT DEFAULT 'xl',
  backdrop_blur_px INTEGER DEFAULT 14,
  backdrop_opacity REAL DEFAULT 0.30,
  prefer_series_art INTEGER DEFAULT 1,
  title_scale REAL DEFAULT 1.0,
  synopsis_scale REAL DEFAULT 1.0,
  theme TEXT DEFAULT 'neo-noir',
  -- NEW
  show_tmdb_badge INTEGER DEFAULT 0,
  admin_user TEXT,
  admin_pass_hash TEXT
);
`);

const exists = db.prepare('SELECT 1 FROM config WHERE id = 1').get();
if (!exists) {
  db.prepare(`INSERT INTO config (
    id, plex_url, plex_token, library_keys, user_filters, player_filters,
    latest_limit, carousel_dwell_ms, poll_ms,
    show_synopsis, synopsis_max_lines, poster_height_vh, title_size, backdrop_blur_px, backdrop_opacity,
    prefer_series_art, title_scale, synopsis_scale, theme, show_tmdb_badge
  ) VALUES (1, @plex_url, @plex_token, @library_keys, @user_filters, @player_filters,
            @latest_limit, @carousel_dwell_ms, @poll_ms,
            1, 6, 90, 'xl', 14, 0.30,
            1, 1.0, 1.0, 'neo-noir', 0)`).run({
    plex_url: process.env.PLEX_URL || null,
    plex_token: process.env.PLEX_TOKEN || null,
    library_keys: process.env.LIBRARY_KEYS ? JSON.stringify(parseCSV(process.env.LIBRARY_KEYS)) : null,
    user_filters: process.env.USER_FILTERS ? JSON.stringify(parseCSV(process.env.USER_FILTERS)) : null,
    player_filters: process.env.PLAYER_FILTERS ? JSON.stringify(parseCSV(process.env.PLAYER_FILTERS)) : null,
    latest_limit: Number(process.env.LATEST_LIMIT || 40),
    carousel_dwell_ms: Number(process.env.CAROUSEL_DWELL_MS || 3500),
    poll_ms: Number(process.env.POLL_MS || 3000),
  });
}

// Backfills
const addCol = (sql) => { try { db.exec(sql); } catch {} };
addCol("ALTER TABLE config ADD COLUMN show_synopsis INTEGER DEFAULT 1");
addCol("ALTER TABLE config ADD COLUMN synopsis_max_lines INTEGER DEFAULT 6");
addCol("ALTER TABLE config ADD COLUMN poster_height_vh INTEGER DEFAULT 90");
addCol("ALTER TABLE config ADD COLUMN title_size TEXT DEFAULT 'xl'");
addCol("ALTER TABLE config ADD COLUMN backdrop_blur_px INTEGER DEFAULT 14");
addCol("ALTER TABLE config ADD COLUMN backdrop_opacity REAL DEFAULT 0.30");
addCol("ALTER TABLE config ADD COLUMN prefer_series_art INTEGER DEFAULT 1");
addCol("ALTER TABLE config ADD COLUMN title_scale REAL DEFAULT 1.0");
addCol("ALTER TABLE config ADD COLUMN synopsis_scale REAL DEFAULT 1.0");
addCol("ALTER TABLE config ADD COLUMN theme TEXT DEFAULT 'neo-noir'");
addCol("ALTER TABLE config ADD COLUMN show_tmdb_badge INTEGER DEFAULT 0");
addCol("ALTER TABLE config ADD COLUMN admin_user TEXT");
addCol("ALTER TABLE config ADD COLUMN admin_pass_hash TEXT");

export function getConfig() {
  const row = db.prepare('SELECT * FROM config WHERE id = 1').get();
  return {
    plex_url: row.plex_url || '',
    plex_token: row.plex_token || '',
    library_keys: row.library_keys ? JSON.parse(row.library_keys) : [],
    user_filters: row.user_filters ? JSON.parse(row.user_filters) : [],
    player_filters: row.player_filters ? JSON.parse(row.player_filters) : [],
    latest_limit: row.latest_limit ?? 40,
    carousel_dwell_ms: row.carousel_dwell_ms ?? 3500,
    poll_ms: row.poll_ms ?? 3000,
    show_synopsis: row.show_synopsis ?? 1,
    synopsis_max_lines: row.synopsis_max_lines ?? 6,
    poster_height_vh: row.poster_height_vh ?? 90,
    title_size: row.title_size || 'xl',
    backdrop_blur_px: row.backdrop_blur_px ?? 14,
    backdrop_opacity: row.backdrop_opacity ?? 0.30,
    prefer_series_art: row.prefer_series_art ?? 1,
    title_scale: Number(row.title_scale ?? 1.0),
    synopsis_scale: Number(row.synopsis_scale ?? 1.0),
    theme: row.theme || 'neo-noir',
    show_tmdb_badge: row.show_tmdb_badge ? 1 : 0,
  };
}

export function setConfig(partial) {
  const current = getConfig();
  const next = { ...current, ...partial };
  db.prepare(`UPDATE config SET
    plex_url = @plex_url,
    plex_token = @plex_token,
    library_keys = @library_keys,
    user_filters = @user_filters,
    player_filters = @player_filters,
    latest_limit = @latest_limit,
    carousel_dwell_ms = @carousel_dwell_ms,
    poll_ms = @poll_ms,
    show_synopsis = @show_synopsis,
    synopsis_max_lines = @synopsis_max_lines,
    poster_height_vh = @poster_height_vh,
    title_size = @title_size,
    backdrop_blur_px = @backdrop_blur_px,
    backdrop_opacity = @backdrop_opacity,
    prefer_series_art = @prefer_series_art,
    title_scale = @title_scale,
    synopsis_scale = @synopsis_scale,
    theme = @theme,
    show_tmdb_badge = @show_tmdb_badge
    WHERE id = 1`).run({
      plex_url: next.plex_url || null,
      plex_token: next.plex_token || null,
      library_keys: next.library_keys ? JSON.stringify(next.library_keys) : null,
      user_filters: next.user_filters ? JSON.stringify(next.user_filters) : null,
      player_filters: next.player_filters ? JSON.stringify(next.player_filters) : null,
      latest_limit: Number(next.latest_limit ?? 40),
      carousel_dwell_ms: Number(next.carousel_dwell_ms ?? 3500),
      poll_ms: Number(next.poll_ms ?? 3000),
      show_synopsis: next.show_synopsis ? 1 : 0,
      synopsis_max_lines: Number(next.synopsis_max_lines ?? 6),
      poster_height_vh: Number(next.poster_height_vh ?? 90),
      title_size: String(next.title_size || 'xl'),
      backdrop_blur_px: Number(next.backdrop_blur_px ?? 14),
      backdrop_opacity: Number(next.backdrop_opacity ?? 0.30),
      prefer_series_art: next.prefer_series_art ? 1 : 0,
      title_scale: Number(next.title_scale ?? 1.0),
      synopsis_scale: Number(next.synopsis_scale ?? 1.0),
      theme: String(next.theme || 'neo-noir'),
      show_tmdb_badge: next.show_tmdb_badge ? 1 : 0,
    });
  return getConfig();
}
