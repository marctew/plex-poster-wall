// client/src/lib/api.js
function getToken() {
  return localStorage.getItem('ppw_token') || '';
}
function authHeaders(extra = {}) {
  const h = { ...extra };
  const tok = getToken();
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
async function j(res) {
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

const API = {
  // AUTH
  async authStatus() { return j(await fetch('/api/auth/status', { headers: authHeaders() })); },
  async authSetup(username, password) {
    return j(await fetch('/api/auth/setup', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password })
    }));
  },
  async login(username, password) {
    return j(await fetch('/api/auth/login', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password })
    }));
  },

  // CONFIG
  async getConfig() { return j(await fetch('/api/config', { headers: authHeaders() })); },
  async saveConfig(cfg) {
    return j(await fetch('/api/config', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(cfg)
    }));
  },

  // PLEX
  async getLibraries() { return j(await fetch('/api/plex/libraries', { headers: authHeaders() })); },
  async getLatest(limit) { return j(await fetch(`/api/latest${limit ? `?limit=${limit}` : ''}`)); },
  async getNowPlaying() { return j(await fetch('/api/now-playing')); }
  ,
  async getTmdb(ratingKey) { return j(await fetch(`/api/tmdb/${encodeURIComponent(ratingKey)}`)); },

  // WS
  ws(connectCb) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => connectCb?.(ws);
    return ws;
  },
};
export default API;
