const API = {
  async getConfig() {
    const res = await fetch('/api/config');
    return res.json();
  },
  async saveConfig(cfg) {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    return res.json();
  },
  async getLibraries() {
    const res = await fetch('/api/plex/libraries');
    return res.json();
  },
  async getLatest(limit) {
    const res = await fetch(`/api/latest${limit ? `?limit=${limit}` : ''}`);
    return res.json();
  },
  ws(onOpen) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => onOpen?.(ws);
    return ws;
  }
};

export default API;
