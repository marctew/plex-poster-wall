import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const cache = new Map(); // ratingKey -> result

async function plexFetch({ baseUrl, token, path, params = {} }) {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('X-Plex-Token', token);
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/xml;q=0.9, application/xml;q=0.8',
      'X-Plex-Product': 'PlexPosterWall',
      'X-Plex-Client-Identifier': 'plex-poster-wall',
    }
  });
  if (!res.ok) throw new Error(`Plex ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('application/json')) return JSON.parse(text);
  return parser.parse(text);
}

async function tmdbFetch(path, apiKey, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const takeGuids = (m) => {
  const g = m?.Guid || m?.guid || [];
  const arr = Array.isArray(g) ? g : g ? [g] : [];
  return arr.map(x => String(x.id || x).toLowerCase());
};

export async function getTmdbForRatingKey({ baseUrl, token, ratingKey, apiKey }) {
  if (!apiKey) return null;
  if (cache.has(ratingKey)) return cache.get(ratingKey);

  const detail = await plexFetch({
    baseUrl, token,
    path: `/library/metadata/${encodeURIComponent(ratingKey)}`,
    params: { includeGuids: '1' }
  });
  const meta = detail?.MediaContainer?.Metadata?.[0] || detail?.MediaContainer?.Metadata || detail?.Metadata?.[0] || detail?.Metadata;
  if (!meta) return null;

  let probe = meta;
  if (String(meta.type).toLowerCase() === 'episode' && meta.grandparentRatingKey) {
    const gp = await plexFetch({
      baseUrl, token,
      path: `/library/metadata/${encodeURIComponent(meta.grandparentRatingKey)}`,
      params: { includeGuids: '1' }
    });
    probe = gp?.MediaContainer?.Metadata?.[0] || gp?.MediaContainer?.Metadata || gp?.Metadata?.[0] || gp?.Metadata || meta;
  }

  const guids = takeGuids(probe);

  // direct TMDB
  const t = guids.find(x => x.startsWith('tmdb://'));
  if (t) {
    const id = t.replace('tmdb://', '');
    const isTv = (probe.type || '').toLowerCase() === 'show';
    const data = await tmdbFetch(`/${isTv ? 'tv' : 'movie'}/${id}`, apiKey);
    const out = {
      tmdb_id: data.id,
      type: isTv ? 'tv' : 'movie',
      title: data.title || data.name || '',
      year: (data.release_date || data.first_air_date || '').slice(0, 4),
      vote_average: data.vote_average || 0,
      vote_count: data.vote_count || 0,
    };
    cache.set(ratingKey, out);
    return out;
  }

  // TVDB fallback
  const tvdb = guids.find(x => x.startsWith('tvdb://'));
  if (tvdb) {
    const id = tvdb.replace('tvdb://', '');
    const f = await tmdbFetch(`/find/${id}`, apiKey, { external_source: 'tvdb_id' });
    const pick = [...(f.tv_results || []), ...(f.movie_results || [])].sort((a,b)=> (b.vote_count||0)-(a.vote_count||0))[0];
    if (pick) {
      const out = {
        tmdb_id: pick.id,
        type: pick.name ? 'tv' : 'movie',
        title: pick.title || pick.name || '',
        year: (pick.release_date || pick.first_air_date || '').slice(0,4),
        vote_average: pick.vote_average || 0,
        vote_count: pick.vote_count || 0,
      };
      cache.set(ratingKey, out);
      return out;
    }
  }

  // IMDB fallback
  const imdb = guids.find(x => x.startsWith('imdb://'));
  if (imdb) {
    const id = imdb.replace('imdb://', '');
    const f = await tmdbFetch(`/find/${id}`, apiKey, { external_source: 'imdb_id' });
    const pick = [...(f.movie_results || []), ...(f.tv_results || [])].sort((a,b)=> (b.vote_count||0)-(a.vote_count||0))[0];
    if (pick) {
      const out = {
        tmdb_id: pick.id,
        type: pick.name ? 'tv' : 'movie',
        title: pick.title || pick.name || '',
        year: (pick.release_date || pick.first_air_date || '').slice(0,4),
        vote_average: pick.vote_average || 0,
        vote_count: pick.vote_count || 0,
      };
      cache.set(ratingKey, out);
      return out;
    }
  }

  // last-ditch: search
  const title = probe.title || probe.grandparentTitle || probe.parentTitle || '';
  const year = Number(probe.year || 0);
  if (title) {
    if ((probe.type || '').toLowerCase() === 'show') {
      const s = await tmdbFetch('/search/tv', apiKey, { query: title, first_air_date_year: year || undefined });
      const pick = (s.results || []).sort((a,b)=> (b.vote_count||0)-(a.vote_count||0))[0];
      if (pick) {
        const out = {
          tmdb_id: pick.id, type: 'tv', title: pick.name || '', year: (pick.first_air_date || '').slice(0,4),
          vote_average: pick.vote_average || 0, vote_count: pick.vote_count || 0,
        };
        cache.set(ratingKey, out); return out;
      }
    } else {
      const s = await tmdbFetch('/search/movie', apiKey, { query: title, year: year || undefined });
      const pick = (s.results || []).sort((a,b)=> (b.vote_count||0)-(a.vote_count||0))[0];
      if (pick) {
        const out = {
          tmdb_id: pick.id, type: 'movie', title: pick.title || '', year: (pick.release_date || '').slice(0,4),
          vote_average: pick.vote_average || 0, vote_count: pick.vote_count || 0,
        };
        cache.set(ratingKey, out); return out;
      }
    }
  }
  return null;
}
