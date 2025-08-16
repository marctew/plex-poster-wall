import { WebSocketServer } from 'ws';
import { URL } from 'url';

export function initWSServer(server, opts = {}) {
  const { verifyToken } = opts;
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let isWS = false, isAdmin = false;
    try {
      const u = new URL(req.url, 'http://localhost');
      isWS = u.pathname === '/ws';
      const token = u.searchParams.get('token');
      if (token && verifyToken) {
        const user = verifyToken(token);
        if (user) { isAdmin = true; req._adminUser = user; }
      }
    } catch {}
    if (!isWS) return socket.destroy();

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAdmin = !!isAdmin;
      wss.emit('connection', ws, req);
    });
  });

  // keepalive
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) { try { client.terminate(); } catch {} ; continue; }
      client.isAlive = false;
      try { client.ping(); } catch {}
    }
  }, 30000);

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        // Only admins may send preview messages
        if (ws.isAdmin && msg?.type === 'ADMIN_PREVIEW') {
          // sanitize: only forward presentational keys
          const allowed = [
            'prefer_series_art','show_synopsis','synopsis_max_lines','poster_height_vh',
            'title_scale','synopsis_scale','backdrop_blur_px','backdrop_opacity',
            'theme','show_tmdb_badge'
          ];
          const payload = {};
          for (const k of allowed) if (k in (msg.payload || {})) payload[k] = msg.payload[k];
          broadcastJSON(wss, { type: 'CONFIG_PREVIEW', payload });
        }
        if (ws.isAdmin && msg?.type === 'ADMIN_PREVIEW_CLEAR') {
          broadcastJSON(wss, { type: 'CONFIG_PREVIEW_CLEAR' });
        }
      } catch {}
    });
  });

  wss.on('close', () => clearInterval(interval));
  return wss;
}

export function broadcastJSON(wss, msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  }
}
