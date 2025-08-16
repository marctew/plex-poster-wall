const API = {
  async getConfig(){ const r = await fetch('/api/config'); return r.json(); },
  async saveConfig(cfg){ const r = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)}); return r.json(); },
  async getLibraries(){ const r = await fetch('/api/plex/libraries'); return r.json(); },
  async getLatest(limit){ const r = await fetch(`/api/latest${limit?`?limit=${limit}`:''}`); return r.json(); },
  async getTmdb(ratingKey){ const r = await fetch(`/api/tmdb/${encodeURIComponent(ratingKey)}`); return r.json(); },
  ws(cb){ const proto = location.protocol==='https:'?'wss':'ws'; const ws = new WebSocket(`${proto}://${location.host}/ws`); ws.onopen = ()=>cb?.(ws); return ws; }
};
export default API;
