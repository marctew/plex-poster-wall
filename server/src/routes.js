import express from 'express';
import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';
import { getLibraries, getRecentlyAdded, buildImageProxyPath } from './plex.js';
import { hasAdmin, setAdminCredentials, verifyLogin, createSession, verifyToken } from './auth.js';

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function pickArt(i, preferSeries) {
  if (preferSeries && i.type === 'episode') {
    return {
      thumb: i.grandparentThumb || i.parentThumb || i.thumb,
      art: i.grandparentArt || i.parentArt || i.art,
    };
  }
  return { thumb: i.thumb, art: i.art };
}

export function createRouter({ state }) {
  const router = express.Router();
  router.use(express.json());

  // Health
  router.get('/health', (req, res) => res.json({ ok: true }));

  // Auth
  router.get('/auth/status', (req, res) => {
    const setup = !hasAdmin();
    let authed = false;
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token && verifyToken(token)) authed = true;
    res.json({ setup, authed });
  });

  router.post('/auth/setup', (req, res) => {
    if (hasAdmin()) return res.status(400).json({ error: 'Already configured' });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    setAdminCredentials(username, password);
    const token = createSession(username, 24);
    res.json({ ok: true, token, username });
  });

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    if (!verifyLogin(username, password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = createSession(username, 24);
    res.json({ ok: true, token, username });
  });

  // Config
  router.get('/config', (req, res) => res.json(getConfig()));
  router.post('/config', requireAuth, (req, res) => res.json(setConfig(req.body || {})));

  // Libraries (admin)
  router.get('/plex/libraries', requireAuth, async (req, res) => {
    try {
      const cfg = getConfig();
      const libs = await getLibraries({ baseUrl: cfg.plex_url, token: cfg.plex_token });
      res.json(libs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recently added → mapped (summary fallback + ratings)
  router.get('/latest', async (req, res) => {
    try {
      const cfg = getConfig();
      const preferSeries = !!cfg.prefer_series_art;
      const keys = (req.query.keys ? String(req.query.keys).split(',') : cfg.library_keys) || [];
      const limit = Number(req.query.limit || cfg.latest_limit || 40);

      const results = [];
      for (const key of keys) {
        const items = await getRecentlyAdded({
          baseUrl: cfg.plex_url, token: cfg.plex_token, sectionKey: key, limit
        });
        results.push(...items);
      }

      results.sort((a, b) => b.addedAt - a.addedAt);
      const mapped = results.slice(0, limit).map((i) => {
        const chosen = pickArt(i, preferSeries);
        // synopsis fallback: episode -> series -> season -> nothing
        const summary = i.summary || i.grandparentSummary || i.parentSummary || '';
        return {
          ...i,
          summary,
          thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1000) : null,
          artUrl: chosen.art ? buildImageProxyPath(chosen.art, 2000) : null,
        };
      });

      res.json(mapped);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Now playing snapshot (already set in index poller)
  router.get('/now-playing', (req, res) => {
    res.json(state.nowPlaying || null);
  });

  // Image proxy
  router.get('/image', async (req, res) => {
    try {
      const { path, width } = req.query;
      if (!path) return res.status(400).send('Missing path');

      const cfg = getConfig();
      const url = new URL(String(path), cfg.plex_url);
      if (width) url.searchParams.set('width', String(width));
      url.searchParams.set('X-Plex-Token', cfg.plex_token);

      const upstream = await fetch(url, {
        headers: { Accept: 'image/webp,image/*;q=0.8,*/*;q=0.5' },
      });

      res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      upstream.body.pipe(res);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

  return router;
}
