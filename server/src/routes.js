// server/src/routes.js
import express from 'express';
import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';
import {
  getLibraries, getRecentlyAdded, buildImageProxyPath,
  getMetadata, getFallbackSummary
} from './plex.js';
import { hasAdmin, setAdminCredentials, verifyLogin, createSession, verifyToken } from './auth.js';
import { getTmdbForRatingKey } from './tmdb.js';

function pickArt(i, preferSeries) {
  if (preferSeries && i.type === 'episode') {
    return {
      thumb: i.grandparentThumb || i.parentThumb || i.thumb,
      art: i.grandparentArt || i.parentArt || i.art,
    };
  }
  return { thumb: i.thumb, art: i.art };
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

export function createRouter({ state, broadcast = () => {} }) {
  const router = express.Router();
  router.use(express.json());

  // ---------- Auth ----------
  router.get('/auth/status', (req, res) => {
    const setup = !hasAdmin();
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const authed = !!verifyToken(token);
    res.json({ setup, authed });
  });

  router.post('/auth/setup', (req, res) => {
    try {
      if (hasAdmin()) return res.status(400).json({ error: 'Already configured' });
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
      setAdminCredentials(username, password);
      const token = createSession(username, 24);
      res.json({ ok: true, token, username });
    } catch (e) { res.status(500).json({ error: e.message || 'Setup failed' }); }
  });

  router.post('/auth/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
      if (!verifyLogin(username, password)) return res.status(401).json({ error: 'Invalid credentials' });
      const token = createSession(username, 24);
      res.json({ ok: true, token, username });
    } catch (e) { res.status(500).json({ error: e.message || 'Login failed' }); }
  });

  // ---------- Health ----------
  router.get('/health', (_req, res) => res.json({ ok: true }));

  // ---------- Config ----------
  router.get('/config', (_req, res) => res.json(getConfig()));
  router.post('/config', requireAuth, (req, res) => {
    const saved = setConfig(req.body || {});
    res.json(saved);
    try { broadcast('CONFIG', saved); } catch {}
  });

  // ---------- Plex libraries (admin only) ----------
  router.get('/plex/libraries', requireAuth, async (_req, res) => {
    try {
      const cfg = getConfig();
      const libs = await getLibraries({ baseUrl: cfg.plex_url, token: cfg.plex_token });
      res.json(libs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- Recently added (public for display) ----------
  router.get('/latest', async (req, res) => {
    try {
      const cfg = getConfig();
      const preferSeries = !!cfg.prefer_series_art;
      const keys = (req.query.keys ? String(req.query.keys).split(',') : cfg.library_keys) || [];
      const limit = Number(req.query.limit || cfg.latest_limit || 40);

      const results = [];
      for (const key of keys) {
        const items = await getRecentlyAdded({ baseUrl: cfg.plex_url, token: cfg.plex_token, sectionKey: key, limit });
        results.push(...items);
      }

      results.sort((a, b) => b.addedAt - a.addedAt);
      if (cfg.random_order) {
        for (let i = results.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [results[i], results[j]] = [results[j], results[i]];
        }
      }

      const out = [];
      for (const i of results.slice(0, limit)) {
        let summary = i.summary;
        if ((!summary || summary.trim() === '') && i.type === 'episode') {
          try {
            const meta = await getMetadata({ baseUrl: cfg.plex_url, token: cfg.plex_token, ratingKey: i.ratingKey, includeGuids: false });
            summary = await getFallbackSummary({ baseUrl: cfg.plex_url, token: cfg.plex_token, itemMeta: meta });
          } catch {}
        }
        const chosen = pickArt(i, preferSeries);
        out.push({
          ...i,
          summary,
          thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1000) : null,
          artUrl: chosen.art ? buildImageProxyPath(chosen.art, 2000) : null,
        });
      }

      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- Now playing snapshot (public) ----------
  router.get('/now-playing', (_req, res) => res.json(state.nowPlaying || null));

  // ---------- TMDb rating (public; key lives in config/env) ----------
  router.get('/tmdb/:ratingKey', async (req, res) => {
    try {
      const cfg = getConfig();
      const info = await getTmdbForRatingKey({
        baseUrl: cfg.plex_url,
        token: cfg.plex_token,
        ratingKey: req.params.ratingKey,
        apiKey: cfg.tmdb_api_key || process.env.TMDB_API_KEY || ''
      });
      res.json(info || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------- Image proxy ----------
  router.get('/image', async (req, res) => {
    try {
      const { path, width } = req.query;
      if (!path) return res.status(400).send('Missing path');
      const cfg = getConfig();
      const url = new URL(String(path), cfg.plex_url);
      if (width) url.searchParams.set('width', String(width));
      url.searchParams.set('X-Plex-Token', cfg.plex_token);
      const upstream = await fetch(url, { headers: { Accept: 'image/webp,image/*;q=0.8,*/*;q=0.5' } });
      res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      upstream.body.pipe(res);
    } catch (e) { res.status(500).send(e.message); }
  });

  return router;
}
