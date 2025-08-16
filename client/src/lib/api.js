const token = () => localStorage.getItem('ppw_token') || '';
const withAuth = (opts = {}) => {
  const h = new Headers(opts.headers || {});
  if (token()) h.set('Authorization', `Bearer ${token()}`);
  return { ...opts, headers: h };
};

const API = {
  async authStatus(){ const r=await fetch('/api/auth/status', withAuth()); return r.json(); },
  async authSetup(u,p){ const r=await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return r.json(); },
  async login(u,p){ const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); return r.json(); },
  async logout(){ localStorage.removeItem('ppw_token'); await fetch('/api/auth/logout',{method:'POST'}); },

  async getConfig(){ const r=await fetch('/api/config', withAuth()); return r.json(); },
  async saveConfig(cfg){ const r=await fetch('/api/config', withAuth({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cfg)})); return r.json(); },
  async getLibraries(){ const r=await fetch('/api/plex/libraries', withAuth()); return r.json(); },

  async getLatest(limit){ const r=await fetch(`/api/latest${limit?`?limit=${limit}`:''}`); return r.json(); },
  async getTmdb(ratingKey){ const r=await fetch(`/api/tmdb/${encodeURIComponent(ratingKey)}`); if(!r.ok) return {}; return r.json(); },

  ws(connectCb){ const proto=location.protocol==='https:'?'wss':'ws'; const ws=new WebSocket(`${proto}://${location.host}/ws`); ws.onopen=()=>connectCb?.(ws); return ws; }
};
export default API;
