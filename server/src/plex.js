import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function withToken(url, token) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}X-Plex-Token=${encodeURIComponent(token)}`;
}

async function fetchPlex({ baseUrl, token, path, searchParams = {} }) {
  const url = new URL(path, baseUrl);
  Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  const urlWithToken = withToken(url.toString(), token);
  const res = await fetch(urlWithToken, {
    headers: {
      Accept: 'application/json, text/xml;q=0.9, application/xml;q=0.8',
      'X-Plex-Product': 'PlexPosterWall',
      'X-Plex-Version': '1.0',
      'X-Plex-Client-Identifier': 'plex-poster-wall',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Plex fetch failed ${res.status}: ${t}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  const text = await res.text();
  return parser.parse(text);
}

export async function getLibraries({ baseUrl, token }) {
  const data = await fetchPlex({ baseUrl, token, path: '/library/sections' });
  const dir = data?.MediaContainer?.Directory || data?.Directory || [];
  const arr = Array.isArray(dir) ? dir : [dir];
  return arr.filter(Boolean).map((d) => ({ key: String(d.key), title: d.title, type: d.type }));
}

export async function getRecentlyAdded({ baseUrl, token, sectionKey, limit = 40 }) {
  const data = await fetchPlex({
    baseUrl,
    token,
    path: `/library/sections/${sectionKey}/recentlyAdded`,
    searchParams: { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': String(limit) },
  });
  const meta = data?.MediaContainer?.Metadata || data?.Metadata || [];
  const arr = Array.isArray(meta) ? meta : [meta];
  return arr.filter(Boolean).map((m) => ({
    ratingKey: String(m.ratingKey),
    type: m.type,
    title: m.title || m.grandparentTitle || m.parentTitle,
    year: m.year,
    thumb: m.thumb,
    art: m.art,
    parentThumb: m.parentThumb,
    parentArt: m.parentArt,
    grandparentThumb: m.grandparentThumb,
    grandparentArt: m.grandparentArt,
    grandparentSummary: m.grandparentSummary || '',
    parentSummary: m.parentSummary || '',
    addedAt: Number(m.addedAt) || 0,
    summary: m.summary || '',
    series: m.grandparentTitle || null,
    seasonNumber: m.parentIndex != null ? Number(m.parentIndex) : null,
    episodeNumber: m.index != null ? Number(m.index) : null,
    episodeTitle: m.type === 'episode' ? (m.title || '') : null,
    // Ratings (for TMDb badge)
    rating: m.rating != null ? Number(m.rating) : null,
    ratingImage: m.ratingImage || '',
    grandparentRating: m.grandparentRating != null ? Number(m.grandparentRating) : null,
    grandparentRatingImage: m.grandparentRatingImage || '',
  }));
}

export async function getSessions({ baseUrl, token }) {
  const data = await fetchPlex({ baseUrl, token, path: '/status/sessions' });
  const mc = data?.MediaContainer || data;
  let raw = mc?.Video ?? mc?.Metadata ?? [];
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];

  return raw.filter(Boolean).map((v) => {
    const player = v?.Player || {};
    const user = v?.User || {};
    const duration = Number(v.duration || 0);
    const progress = Number(v.viewOffset || 0);
    const playerState = (player.state || '').toLowerCase();
    const state = playerState || (progress > 0 ? 'playing' : 'paused');

    return {
      ratingKey: String(v.ratingKey),
      title: v.title || v.grandparentTitle || v.parentTitle,
      type: v.type,
      thumb: v.thumb,
      art: v.art,
      parentThumb: v.parentThumb,
      parentArt: v.parentArt,
      grandparentThumb: v.grandparentThumb,
      grandparentArt: v.grandparentArt,
      year: v.year,
      summary: v.summary || v.grandparentSummary || v.parentSummary || '',
      series: v.grandparentTitle || null,
      seasonNumber: v.parentIndex != null ? Number(v.parentIndex) : null,
      episodeNumber: v.index != null ? Number(v.index) : null,
      episodeTitle: v.type === 'episode' ? v.title || '' : null,
      // Ratings for TMDb badge on Now Playing
      rating: v.rating != null ? Number(v.rating) : null,
      ratingImage: v.ratingImage || '',
      grandparentRating: v.grandparentRating != null ? Number(v.grandparentRating) : null,
      grandparentRatingImage: v.grandparentRatingImage || '',

      user: { id: user.id ? String(user.id) : undefined, title: user.title },
      player: {
        title: player.title,
        product: player.product,
        platform: player.platform,
        machineIdentifier: player.machineIdentifier,
        state: player.state,
      },
      progress,
      duration,
      state,
    };
  });
}

export function buildImageProxyPath(path, width) {
  const sp = new URLSearchParams();
  sp.set('path', path || '');
  if (width) sp.set('width', String(width));
  return `/api/image?${sp.toString()}`;
}
