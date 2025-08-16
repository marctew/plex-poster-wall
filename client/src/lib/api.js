function authHeader() {
  const t = localStorage.getItem('ppw_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const API = {
  async authStatus() {
    const r = await fetch('/api/auth/status', { headers: authHeader(), cache: 'no-store' });
    return r.json();
  },
  async authSetup(username, password) {
    const r = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return r.json();
  },
  async login(username, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return r.json();
  },

  async getConfig() {
    const res = await fetch('/api/config', { cache: 'no-store' });
    return res.json();
  },
  async saveConfig(cfg) {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(cfg)
    });
    if (!res.ok) throw new Error('Not authorized');
    return res.json();
  },
  async getLibraries() {
    const res = await fetch('/api/plex/libraries', { headers: authHeader(), cache: 'no-store' });
    if (!res.ok) throw new Error('Not authorized');
    return res.json();
  },
  async getLatest(limit) {
    const res = await fetch(`/api/latest${limit ? `?limit=${limit}` : ''}`, { cache: 'no-store' });
    return res.json();
  },
  async getNowPlaying() {
    const res = await fetch('/api/now-playing', { cache: 'no-store' });
    return res.json();
  },
  ws(onOpen, token) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(`${proto}://${location.host}/ws`);
    if (token) url.searchParams.set('token', token);
    const ws = new WebSocket(url.toString());
    ws.onopen = () => onOpen?.(ws);
    return ws;
  }
};
export default API;
