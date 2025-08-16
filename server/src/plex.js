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
    const t = await res.text().catch(() => '');
    throw new Error(`Plex ${path} failed ${res.status}: ${t.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  const text = await res.text();
  return parser.parse(text);
}

/* ---------- Helpers to pull media/stream info for badges ---------- */
function pickFirstMedia(m) {
  const arr = Array.isArray(m?.Media) ? m.Media : m?.Media ? [m.Media] : [];
  if (arr.length === 0) return null;
  // choose the highest resolution media
  const scored = arr
    .map(x => ({ x, res: Number(x.videoResolution) || (x.videoResolution === '4k' ? 2160 : 0) }))
    .sort((a, b) => b.res - a.res);
  return scored[0].x;
}
function extractBadgeInfo(media) {
  if (!media) return {};
  const vr = String(media.videoResolution || '').toLowerCase();
  const res = vr === '4k' || Number(vr) >= 2160 ? '4k' :
              Number(vr) >= 1440 ? '1440p' :
              Number(vr) >= 1080 ? '1080p' :
              Number(vr) >= 720  ? '720p'  : vr || null;

  const vCodec = (media.videoCodec || '').toUpperCase();   // H264 / HEVC …
  const aCodec = (media.audioCodec || '').toUpperCase();   // AAC / EAC3 / TRUEHD …
  const ch = Number(media.audioChannels || 0);              // 2 / 5.1 / 7.1 etc (Plex gives 2/6/8)

  const dyn = String(media.videoDynamicRange || '').toLowerCase(); // 'hdr10', 'dolby vision', 'hlg'
  const hdr =
    dyn.includes('dolby') ? 'DV' :
    dyn.includes('hdr10+') ? 'HDR10+' :
    dyn.includes('hdr10') ? 'HDR10' :
    dyn.includes('hlg') ? 'HLG' : null;

  // Atmos best-effort: look into Streams for EAC3 JOC or TRUEHD Atmos
  let atmos = false;
  const streams = Array.isArray(media.Part?.Stream)
    ? media.Part.Stream
    : media.Part?.Stream
    ? [media.Part.Stream]
    : [];
  for (const s of streams) {
    if (String(s.streamType) !== '2') continue; // audio only
    const sc = String(s.codec || '').toLowerCase(); // eac3/truehd/dts
    const title = String(s.title || '').toLowerCase();
    const prof  = String(s.profile || s.audioProfile || '').toLowerCase();
    // heuristics
    if (sc === 'truehd' || prof.includes('atmos') || title.includes('atmos') || prof.includes('joc')) {
      atmos = true;
      break;
    }
  }

  return {
    resolution: res,
    videoCodec: vCodec || null,
    audioCodec: aCodec || null,
    audioChannels: ch || null,
    hdr, atmos,
  };
}

/* ---------- Public API used by routes ---------- */

export async function getLibraries({ baseUrl, token }) {
  const data = await fetchPlex({ baseUrl, token, path: '/library/sections' });
  const dir = data?.MediaContainer?.Directory || data?.Directory || [];
  const arr = Array.isArray(dir) ? dir : [dir];
  return arr.filter(Boolean).map(d => ({ key: String(d.key), title: d.title, type: d.type }));
}

export async function getRecentlyAdded({ baseUrl, token, sectionKey, limit = 40 }) {
  const data = await fetchPlex({
    baseUrl, token,
    path: `/library/sections/${sectionKey}/recentlyAdded`,
    searchParams: { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': String(limit) }
  });
  const meta = data?.MediaContainer?.Metadata || data?.Metadata || [];
  const arr = Array.isArray(meta) ? meta : [meta];

  return arr.filter(Boolean).map(m => {
    const media = pickFirstMedia(m);
    const badges = extractBadgeInfo(media);
    return {
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
      addedAt: Number(m.addedAt) || 0,
      summary: m.summary || '',
      series: m.grandparentTitle || null,
      seasonNumber: m.parentIndex != null ? Number(m.parentIndex) : null,
      episodeNumber: m.index != null ? Number(m.index) : null,
      episodeTitle: m.type === 'episode' ? (m.title || '') : null,
      media: badges,
    };
  });
}

export async function getSessions({ baseUrl, token }) {
  const data = await fetchPlex({ baseUrl, token, path: '/status/sessions' });
  const mc = data?.MediaContainer || data;
  let raw = mc?.Video ?? mc?.Metadata ?? [];
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];

  return raw.filter(Boolean).map(v => {
    const media = pickFirstMedia(v);
    const badges = extractBadgeInfo(media);

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
      summary: v.summary || '',
      series: v.grandparentTitle || null,
      seasonNumber: v.parentIndex != null ? Number(v.parentIndex) : null,
      episodeNumber: v.index != null ? Number(v.index) : null,
      episodeTitle: v.type === 'episode' ? (v.title || '') : null,
      user: { id: user.id ? String(user.id) : undefined, title: user.title },
      player: { title: player.title, product: player.product, platform: player.platform, machineIdentifier: player.machineIdentifier, state: player.state },
      progress, duration, state,
      media: badges,
    };
  });
}

/* Fetch full metadata (for synopsis fallback and TMDb GUIDs) */
export async function getMetadata({ baseUrl, token, ratingKey, includeGuids = true }) {
  const data = await fetchPlex({
    baseUrl, token,
    path: `/library/metadata/${ratingKey}`,
    searchParams: includeGuids ? { includeGuids: '1' } : {}
  });
  const m = data?.MediaContainer?.Metadata;
  return Array.isArray(m) ? m[0] : m || null;
}

export async function getFallbackSummary({ baseUrl, token, itemMeta }) {
  if (!itemMeta) return '';
  if (itemMeta.summary) return String(itemMeta.summary);

  // Try season, then series
  if (itemMeta.parentRatingKey) {
    const season = await getMetadata({ baseUrl, token, ratingKey: itemMeta.parentRatingKey, includeGuids: false }).catch(() => null);
    if (season?.summary) return String(season.summary);
  }
  if (itemMeta.grandparentRatingKey) {
    const series = await getMetadata({ baseUrl, token, ratingKey: itemMeta.grandparentRatingKey, includeGuids: false }).catch(() => null);
    if (series?.summary) return String(series.summary);
  }
  return '';
}

export function buildImageProxyPath(path, width) {
  const sp = new URLSearchParams();
  sp.set('path', path || '');
  if (width) sp.set('width', String(width));
  return `/api/image?${sp.toString()}`;
}
