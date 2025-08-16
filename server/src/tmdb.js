// server/src/tmdb.js
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

// teeny in-memory cache
const TTL = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map();
const getCache = (k) => {
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() > hit.exp) { cache.delete(k); return null; }
  return hit.v;
};
const setCache = (k, v) => cache.set(k, { v, exp: Date.now() + TTL });

async function fetchPlexMeta(baseUrl, token, ratingKey, includeGuids = true) {
  const url = new URL(`/library/metadata/${ratingKey}`, baseUrl);
  if (includeGuids) url.searchParams.set('includeGuids', '1');
  url.searchParams.set('X-Plex-Token', token);
  const res = await fetch(url, { headers: { Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`Plex meta ${res.status}`);
  const xml = await res.text();
  const mc = parser.parse(xml)?.MediaContainer;
  const m = mc?.Metadata;
  return Array.isArray(m) ? m[0] : m || null;
}

function extractTmdb(meta) {
  if (!meta) return null;
  const type = meta.type;
  const guids = Array.isArray(meta.Guid) ? meta.Guid : meta.Guid ? [meta.Guid] : [];
  const tmdb = guids.find(g => String(g.id || '').startsWith('tmdb://'));
  if (!tmdb) return null;
  const id = String(tmdb.id).replace('tmdb://', '');
  const tmdbType = type === 'movie' ? 'movie' : 'tv';
  return { id, tmdbType };
}

async function fetchTmdb(apiKey, tmdbType, id) {
  if (!apiKey) return null;
  const res = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`TMDb ${res.status}`);
  const j = await res.json();
  return {
    id,
    type: tmdbType,
    rating: typeof j.vote_average === 'number' ? j.vote_average : null,
    votes: typeof j.vote_count === 'number' ? j.vote_count : null,
  };
}

/**
 * Get TMDb vote/rating for a Plex item by ratingKey.
 * Falls back to the show's TMDb id if the episode itself has none.
 */
export async function getTmdbForRatingKey({ baseUrl, token, ratingKey, apiKey }) {
  if (!apiKey) return null;
  const ck = `tmdb:${ratingKey}`;
  const cached = getCache(ck);
  if (cached !== null) return cached;

  const meta = await fetchPlexMeta(baseUrl, token, ratingKey, true);
  let idf = extractTmdb(meta);

  // Episode without tmdb guid? Try the series (grandparent)
  if ((!idf || !idf.id) && meta?.grandparentRatingKey) {
    const showMeta = await fetchPlexMeta(baseUrl, token, meta.grandparentRatingKey, true);
    idf = extractTmdb(showMeta);
  }
  if (!idf) { setCache(ck, null); return null; }

  const out = await fetchTmdb(apiKey, idf.tmdbType, idf.id);
  setCache(ck, out);
  return out;
}

// Back-compat alias if any old import still lingers
export const tmdbForRatingKey = getTmdbForRatingKey;
export default { getTmdbForRatingKey };
