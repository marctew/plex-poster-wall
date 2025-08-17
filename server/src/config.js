import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

function parseCSV(str = '') {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

const db = new Database('config.db');
try { db.pragma('journal_mode = WAL'); } catch {}

/**
 * Master config table
 * (includes randomize_order, show_badges, badges_scale)
 */
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

  -- new prefs
  prefer_series_art INTEGER DEFAULT 1,
  title_scale REAL DEFAULT 1.0,
  synopsis_scale REAL DEFAULT 1.0,
  theme TEXT DEFAULT 'neo-noir',

  -- badges
  show_badges INTEGER DEFAULT 1,
  badges_scale REAL DEFAULT 1.0,

  -- ordering
  randomize_order INTEGER DEFAULT 0
);
`);

/** Ensure a single row exists */
const exists = db.prepare('SELECT 1 FROM config WHERE id = 1').get();
if (!exists) {
  db.prepare(`
    INSERT INTO config (
      id, plex_url, plex_token, library_keys, user_filters, player_filters,
      latest_limit, carousel_dwell_ms, poll_ms,
      show_synopsis, synopsis_max_lines, poster_height_vh, title_size, backdrop_blur_px, backdrop_opacity,
      prefer_series_art, title_scale, synopsis_scale, theme,
      show_badges, badges_scale, randomize_order
    ) VALUES (
      1, @u, @t, @lk, @uf, @pf,
      @ll, @cd, @pm,
      1, 6, 90, 'xl', 14, 0.30,
      1, 1.0, 1.0, 'neo-noir',
      1, 1.0, 0
    )
  `).run({
    u: process.env.PLEX_URL || null,
    t: process.env.PLEX_TOKEN || null,
    lk: process.env.LIBRARY_KEYS ? JSON.stringify(parseCSV(process.env.LIBRARY_KEYS)) : null,
    uf: process.env.USER_FILTERS ? JSON.stringify(parseCSV(process.env.USER_FILTERS)) : null,
    pf: process.env.PLAYER_FILTERS ? JSON.stringify(parseCSV(process.env.PLAYER_FILTERS)) : null,
    ll: Number(process.env.LATEST_LIMIT || 40),
    cd: Number(process.env.CAROUSEL_DWELL_MS || 3500),
    pm: Number(process.env.POLL_MS || 3000),
  });
}

/** Backfill for older DBs (ignore if they already exist) */
const add = (sql) => { try { db.exec(sql); } catch {} };
add("ALTER TABLE config ADD COLUMN show_synopsis INTEGER DEFAULT 1");
add("ALTER TABLE config ADD COLUMN synopsis_max_lines INTEGER DEFAULT 6");
add("ALTER TABLE config ADD COLUMN poster_height_vh INTEGER DEFAULT 90");
add("ALTER TABLE config ADD COLUMN title_size TEXT DEFAULT 'xl'");
add("ALTER TABLE config ADD COLUMN backdrop_blur_px INTEGER DEFAULT 14");
add("ALTER TABLE config ADD COLUMN backdrop_opacity REAL DEFAULT 0.30");
add("ALTER TABLE config ADD COLUMN prefer_series_art INTEGER DEFAULT 1");
add("ALTER TABLE config ADD COLUMN title_scale REAL DEFAULT 1.0");
add("ALTER TABLE config ADD COLUMN synopsis_scale REAL DEFAULT 1.0");
add("ALTER TABLE config ADD COLUMN theme TEXT DEFAULT 'neo-noir'");
add("ALTER TABLE config ADD COLUMN show_badges INTEGER DEFAULT 1");
add("ALTER TABLE config ADD COLUMN badges_scale REAL DEFAULT 1.0");
add("ALTER TABLE config ADD COLUMN randomize_order INTEGER DEFAULT 0");

export function getConfig() {
  const r = db.prepare('SELECT * FROM config WHERE id = 1').get();
  return {
    plex_url: r.plex_url || '',
    plex_token: r.plex_token || '',
    library_keys: r.library_keys ? JSON.parse(r.library_keys) : [],
    user_filters: r.user_filters ? JSON.parse(r.user_filters) : [],
    player_filters: r.player_filters ? JSON.parse(r.player_filters) : [],

    latest_limit: r.latest_limit ?? 40,
    carousel_dwell_ms: r.carousel_dwell_ms ?? 3500,
    poll_ms: r.poll_ms ?? 3000,

    show_synopsis: r.show_synopsis ?? 1,
    synopsis_max_lines: r.synopsis_max_lines ?? 6,
    poster_height_vh: r.poster_height_vh ?? 90,
    title_size: r.title_size || 'xl',
    backdrop_blur_px: r.backdrop_blur_px ?? 14,
    backdrop_opacity: r.backdrop_opacity ?? 0.30,

    prefer_series_art: r.prefer_series_art ?? 1,
    title_scale: Number(r.title_scale ?? 1.0),
    synopsis_scale: Number(r.synopsis_scale ?? 1.0),
    theme: r.theme || 'neo-noir',

    show_badges: r.show_badges ?? 1,
    badges_scale: Number(r.badges_scale ?? 1.0),

    randomize_order: r.randomize_order ?? 0,
  };
}

export function setConfig(partial) {
  const cur = getConfig();
  const n = { ...cur, ...partial };

  db.prepare(`
    UPDATE config SET
      plex_url=@u,
      plex_token=@t,
      library_keys=@lk,
      user_filters=@uf,
      player_filters=@pf,

      latest_limit=@ll,
      carousel_dwell_ms=@cd,
      poll_ms=@pm,

      show_synopsis=@ss,
      synopsis_max_lines=@sml,
      poster_height_vh=@ph,
      title_size=@tsz,
      backdrop_blur_px=@bb,
      backdrop_opacity=@bo,

      prefer_series_art=@psa,
      title_scale=@ts,
      synopsis_scale=@syns,
      theme=@th,

      show_badges=@sb,
      badges_scale=@bscale,

      randomize_order=@ro
    WHERE id=1
  `).run({
    u: n.plex_url || null,
    t: n.plex_token || null,
    lk: n.library_keys ? JSON.stringify(n.library_keys) : null,
    uf: n.user_filters ? JSON.stringify(n.user_filters) : null,
    pf: n.player_filters ? JSON.stringify(n.player_filters) : null,

    ll: Number(n.latest_limit ?? 40),
    cd: Number(n.carousel_dwell_ms ?? 3500),
    pm: Number(n.poll_ms ?? 3000),

    ss: n.show_synopsis ? 1 : 0,
    sml: Number(n.synopsis_max_lines ?? 6),
    ph: Number(n.poster_height_vh ?? 90),
    tsz: String(n.title_size || 'xl'),
    bb: Number(n.backdrop_blur_px ?? 14),
    bo: Number(n.backdrop_opacity ?? 0.30),

    psa: n.prefer_series_art ? 1 : 0,
    ts: Number(n.title_scale ?? 1.0),
    syns: Number(n.synopsis_scale ?? 1.0),
    th: String(n.theme || 'neo-noir'),

    sb: n.show_badges ? 1 : 0,
    bscale: Number(n.badges_scale ?? 1.0),

    ro: n.randomize_order ? 1 : 0,
  });

  return getConfig();
}
