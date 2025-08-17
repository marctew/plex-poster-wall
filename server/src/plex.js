import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'' });

function withToken(url, token){ return `${url}${url.includes('?')?'&':'?'}X-Plex-Token=${encodeURIComponent(token)}`; }

async function fetchPlex({ baseUrl, token, path, searchParams = {} }) {
  const url = new URL(path, baseUrl);
  Object.entries(searchParams).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(withToken(url.toString(), token), {
    headers: {
      Accept: 'application/json, text/xml;q=0.9, application/xml;q=0.8',
      'X-Plex-Product':'PlexPosterWall','X-Plex-Version':'1.0','X-Plex-Client-Identifier':'plex-poster-wall',
    }
  });
  if (!res.ok) throw new Error(`Plex ${res.status}: ${await res.text()}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return parser.parse(await res.text());
}

function summarizeMedia(v){
  const arr = Array.isArray(v.Media) ? v.Media : v.Media ? [v.Media] : [];
  const m = arr[0] || {};
  const vr = (m.videoResolution || '').toString().toLowerCase();
  const vrNum = parseInt(vr,10);
  let resolution = null;
  if (vr === '4k' || vrNum >= 2160) resolution = '2160p';
  else if (vrNum >= 1440) resolution = '1440p';
  else if (vrNum >= 1080) resolution = '1080p';
  else if (vrNum >= 720)  resolution = '720p';
  else if (vrNum)         resolution = `${vrNum}p`;
  const videoCodec = (m.videoCodec || v.videoCodec || '').toUpperCase() || null;
  const audioCodec = (m.audioCodec || '').toUpperCase() || null;
  const ch = Number(m.audioChannels || 0);
  let audioChannels = null;
  if (ch === 8) audioChannels = '7.1';
  else if (ch === 6) audioChannels = '5.1';
  else if (ch === 2) audioChannels = '2.0';
  else if (ch > 0)   audioChannels = `${ch}.0`;
  const dyn = (m.videoDynamicRange || '').toLowerCase();
  let hdr = null;
  if (dyn.includes('dolby') || dyn.includes('dv')) hdr = 'DV';
  else if (dyn.includes('hdr')) hdr = 'HDR';
  return { resolution, videoCodec, audioCodec, audioChannels, hdr };
}

export async function getLibraries({ baseUrl, token }) {
  const d = await fetchPlex({ baseUrl, token, path:'/library/sections' });
  const dir = d?.MediaContainer?.Directory || d?.Directory || [];
  const arr = Array.isArray(dir) ? dir : [dir];
  return arr.filter(Boolean).map(d => ({ key:String(d.key), title:d.title, type:d.type }));
}

export async function getRecentlyAdded({ baseUrl, token, sectionKey, limit = 40 }) {
  const d = await fetchPlex({ baseUrl, token, path:`/library/sections/${sectionKey}/recentlyAdded`,
                              searchParams:{'X-Plex-Container-Start':'0','X-Plex-Container-Size':String(limit)} });
  const meta = d?.MediaContainer?.Metadata || d?.Metadata || [];
  const arr = Array.isArray(meta) ? meta : [meta];
  return arr.filter(Boolean).map(m => ({
    ratingKey: String(m.ratingKey),
    type: m.type,
    title: m.title || m.grandparentTitle || m.parentTitle,
    year: m.year,
    thumb: m.thumb, art: m.art,
    parentThumb: m.parentThumb, parentArt: m.parentArt,
    grandparentThumb: m.grandparentThumb, grandparentArt: m.grandparentArt,
    addedAt: Number(m.addedAt) || 0,
    summary: m.summary || '',
    series: m.grandparentTitle || null,
    seasonNumber: m.parentIndex != null ? Number(m.parentIndex) : null,
    episodeNumber: m.index != null ? Number(m.index) : null,
    episodeTitle: m.type === 'episode' ? (m.title || '') : null,
    media: summarizeMedia(m),
  }));
}

export async function getSessions({ baseUrl, token }) {
  const d = await fetchPlex({ baseUrl, token, path:'/status/sessions' });
  const mc = d?.MediaContainer || d;
  let raw = mc?.Video ?? mc?.Metadata ?? [];
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];
  return raw.filter(Boolean).map(v => {
    const player = v?.Player || {};
    const user = v?.User || {};
    const duration = Number(v.duration || 0);
    const progress = Number(v.viewOffset || 0);
    const state = (player.state || '').toLowerCase() || (progress > 0 ? 'playing' : 'paused');
    return {
      ratingKey: String(v.ratingKey),
      title: v.title || v.grandparentTitle || v.parentTitle,
      type: v.type, thumb: v.thumb, art: v.art,
      parentThumb: v.parentThumb, parentArt: v.parentArt,
      grandparentThumb: v.grandparentThumb, grandparentArt: v.grandparentArt,
      year: v.year, summary: v.summary || '',
      series: v.grandparentTitle || null, seasonNumber: v.parentIndex!=null?Number(v.parentIndex):null,
      episodeNumber: v.index!=null?Number(v.index):null, episodeTitle: v.type==='episode'?(v.title||''):null,
      user: { id: user.id ? String(user.id) : undefined, title: user.title },
      player: { title: player.title, product: player.product, platform: player.platform, machineIdentifier: player.machineIdentifier, state: player.state },
      progress, duration, state,
      media: summarizeMedia(v),
    };
  });
}

export function buildImageProxyPath(path, width){
  const sp = new URLSearchParams();
  sp.set('path', path || '');
  if (width) sp.set('width', String(width));
  return `/api/image?${sp.toString()}`;
}
