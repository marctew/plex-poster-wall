import express from 'express';
import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';
import { getLibraries, getRecentlyAdded, buildImageProxyPath } from './plex.js';
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

export function createRouter({ state }) {
  const router = express.Router();

  router.get('/health', (req, res) => res.json({ ok: true }));

  router.get('/config', (req, res) => res.json(getConfig()));
  router.post('/config', express.json(), (req, res) => res.json(setConfig(req.body || {})));

  router.get('/plex/libraries', async (req, res) => {
    try {
      const cfg = getConfig();
      res.json(await getLibraries({ baseUrl: cfg.plex_url, token: cfg.plex_token }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

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
      results.sort((a,b)=>b.addedAt-a.addedAt);
      const total = results.slice(0, limit).map(i => {
        const chosen = pickArt(i, preferSeries);
        return {
          ...i,
          thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1000) : null,
          artUrl: chosen.art ? buildImageProxyPath(chosen.art, 2000) : null,
        };
      });
      res.json(total);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/now-playing', (req,res)=> res.json(state.nowPlaying || null));

  // Image proxy (keeps token server-side)
  router.get('/image', async (req, res) => {
    try {
      const { path, width } = req.query;
      if (!path) return res.status(400).send('Missing path');
      const cfg = getConfig();
      const url = new URL(String(path), cfg.plex_url);
      if (width) url.searchParams.set('width', String(width));
      url.searchParams.set('X-Plex-Token', cfg.plex_token);
      const upstream = await fetch(url, { headers: { Accept:'image/webp,image/*;q=0.8,*/*;q=0.5' } });
      res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      upstream.body.pipe(res);
    } catch (e) { res.status(500).send(e.message); }
  });

  // TMDB lookup (lazy per item)
  router.get('/tmdb/:ratingKey', async (req, res) => {
    try {
      const cfg = getConfig();
      if (!cfg.tmdb_api_key || !cfg.show_tmdb) return res.json(null);
      const data = await getTmdbForRatingKey({
        baseUrl: cfg.plex_url, token: cfg.plex_token, ratingKey: req.params.ratingKey
      });
      res.json(data || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
