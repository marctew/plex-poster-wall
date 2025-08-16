import { WebSocketServer } from 'ws';

export function initWSServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    // Only accept upgrades for our endpoint
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Optional: basic ping/pong keepalive so reverse proxies don’t nuke idle sockets
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      // 1 = OPEN
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      try { client.ping(); } catch {}
    }
  }, 30000);

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
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
