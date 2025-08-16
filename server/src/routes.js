import express from 'express';
import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';
import { getLibraries, getRecentlyAdded, buildImageProxyPath } from './plex.js';

function pickArt(item, preferSeries) {
  if (preferSeries && item.type === 'episode') {
    return {
      thumb: item.grandparentThumb || item.parentThumb || item.thumb,
      art: item.grandparentArt || item.parentArt || item.art,
    };
  }
  return { thumb: item.thumb, art: item.art };
}

export function createRouter({ state }) {
  const router = express.Router();

  // Health check
  router.get('/health', (req, res) => res.json({ ok: true }));

  // Config
  router.get('/config', (req, res) => {
    res.json(getConfig());
  });

  router.post('/config', express.json(), (req, res) => {
    const saved = setConfig(req.body || {});
    res.json(saved);
  });

  // Libraries
  router.get('/plex/libraries', async (req, res) => {
    try {
      const cfg = getConfig();
      const libs = await getLibraries({ baseUrl: cfg.plex_url, token: cfg.plex_token });
      res.json(libs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recently added across selected libraries
  router.get('/latest', async (req, res) => {
    try {
      const cfg = getConfig();
      const preferSeries = !!cfg.prefer_series_art;
      const keys = (req.query.keys ? String(req.query.keys).split(',') : cfg.library_keys) || [];
      const limit = Number(req.query.limit || cfg.latest_limit || 40);

      const results = [];
      for (const key of keys) {
        const items = await getRecentlyAdded({
          baseUrl: cfg.plex_url,
          token: cfg.plex_token,
          sectionKey: key,
          limit,
        });
        results.push(...items);
      }

      results.sort((a, b) => b.addedAt - a.addedAt);

      const sliced = results.slice(0, limit).map((i) => {
        const chosen = pickArt(i, preferSeries);
        return {
          ...i,
          thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1000) : null,
          artUrl: chosen.art ? buildImageProxyPath(chosen.art, 2000) : null,
        };
      });

      res.json(sliced);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Now playing snapshot
  router.get('/now-playing', (req, res) => {
    res.json(state.nowPlaying || null);
  });

  // Image proxy (keeps token server-side)
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
