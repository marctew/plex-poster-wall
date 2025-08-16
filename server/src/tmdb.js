import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { getConfig } from './config.js';

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'' });

const cache = new Map(); // key: ratingKey -> { data, ts }
const TTL_MS = 1000 * 60 * 60; // 1h

async function plexMeta(baseUrl, token, ratingKey) {
  const url = new URL(`/library/metadata/${ratingKey}`, baseUrl);
  url.searchParams.set('includeGuids', '1');
  url.searchParams.set('X-Plex-Token', token);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json, text/xml;q=0.9' } });
  const text = await res.text();
  const doc = text.trim().startsWith('{') ? JSON.parse(text) : parser.parse(text);
  const m = doc?.MediaContainer?.Metadata || doc?.Metadata || [];
  const arr = Array.isArray(m) ? m : m ? [m] : [];
  return arr[0] || null;
}

function tmdbIdFromMeta(meta) {
  const guids = meta?.Guid ? (Array.isArray(meta.Guid) ? meta.Guid : [meta.Guid]) : [];
  for (const g of guids) {
    const id = g.id || '';
    if (id.startsWith('tmdb://')) {
      const bits = id.split('tmdb://')[1];
      const num = bits?.split('?')[0];
      if (num) return Number(num);
    }
    if ((g.agent || '').includes('themoviedb')) {
      const m = /[:/](\d+)/.exec(id);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

async function tmdbFetch(path) {
  const { tmdb_api_key } = getConfig();
  if (!tmdb_api_key) return null;
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', tmdb_api_key);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return res.json();
}

/**
 * Returns { id, type: 'movie'|'tv', vote_average, vote_count } or null
 */
export async function getTmdbForRatingKey({ baseUrl, token, ratingKey }) {
  const now = Date.now();
  const c = cache.get(ratingKey);
  if (c && now - c.ts < TTL_MS) return c.data;

  const meta = await plexMeta(baseUrl, token, ratingKey);
  if (!meta) return null;

  let type = meta.type; // movie|show|episode
  let id = tmdbIdFromMeta(meta);

  // Climb parents if missing or episode
  if ((!id || type === 'episode') && meta.parentRatingKey) {
    const parent = await plexMeta(baseUrl, token, meta.parentRatingKey);
    id = id || tmdbIdFromMeta(parent);
    type = parent?.type || type;
  }
  if ((!id || type === 'episode') && meta.grandparentRatingKey) {
    const gp = await plexMeta(baseUrl, token, meta.grandparentRatingKey);
    id = id || tmdbIdFromMeta(gp);
    type = gp?.type || type;
  }

  if (!id) { cache.set(ratingKey, { data: null, ts: now }); return null; }

  const tmdbType = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(`/${tmdbType}/${id}`);
  if (!data) { cache.set(ratingKey, { data: null, ts: now }); return null; }

  const out = {
    id,
    type: tmdbType,
    vote_average: data.vote_average,
    vote_count: data.vote_count
  };
  cache.set(ratingKey, { data: out, ts: now });
  return out;
}
