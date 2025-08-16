import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { getConfig } from './config.js';
import { getSessions, buildImageProxyPath } from './plex.js';
import { initWSServer, broadcastJSON } from './websocket.js';
import { createRouter } from './routes.js';
import { verifyToken } from './auth.js';

dotenv.config();

const app = express();
app.use(cors());
const state = { nowPlaying: null };
app.use('/api', createRouter({ state }));

const server = http.createServer(app);
const wss = initWSServer(server, { verifyToken });

// WS: push snapshot to new clients
wss.on('connection', (ws) => {
  if (state.nowPlaying) {
    try { ws.send(JSON.stringify({ type: 'NOW_PLAYING', payload: state.nowPlaying })); } catch {}
  }
});

let lastNowPlayingKey = null;
let lastProgressMs = null;
let lastPlayerState = null;

function pickArtPaths(item, preferSeries) {
  if (preferSeries && item.type === 'episode') {
    return {
      thumb: item.grandparentThumb || item.parentThumb || item.thumb,
      art: item.grandparentArt || item.parentArt || item.art,
    };
  }
  return { thumb: item.thumb, art: item.art };
}

async function pollSessions() {
  const cfg = getConfig();
  if (!cfg.plex_url || !cfg.plex_token) return;

  try {
    const sessions = await getSessions({ baseUrl: cfg.plex_url, token: cfg.plex_token });
    const users = (cfg.user_filters || []).map(u => u.toLowerCase());
    const players = (cfg.player_filters || []).map(p => p.toLowerCase());

    const match = sessions.find(s => {
      const userOk = users.length === 0 || (s.user?.title && users.includes(s.user.title.toLowerCase()));
      const playerName = s.player?.title || s.player?.product || s.player?.platform || '';
      const playerOk = players.length === 0 || players.includes(String(playerName).toLowerCase());
      const pstate = (s.player?.state || s.state || '').toLowerCase();
      const playing = pstate === 'playing' || (s.duration && s.progress && s.progress < s.duration);
      return userOk && playerOk && playing;
    });

    if (match) {
      const key = `${match.ratingKey}:${match.player?.machineIdentifier || ''}`;
      const chosen = pickArtPaths(match, !!cfg.prefer_series_art);
      const payload = {
        ...match,
        thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1200) : null,
        artUrl: chosen.art ? buildImageProxyPath(chosen.art, 2000) : null,
        ts: Date.now(),
      };
      state.nowPlaying = payload;

      const progress = Number(match.progress || 0);
      const duration = Number(match.duration || 0);
      const pState = (match.player?.state || match.state || '').toLowerCase();

      if (key !== lastNowPlayingKey) {
        lastNowPlayingKey = key;
        lastProgressMs = progress;
        lastPlayerState = pState;
        broadcastJSON(wss, { type: 'NOW_PLAYING', payload });
        return;
      }
      if (pState !== lastPlayerState) {
        lastPlayerState = pState;
        lastProgressMs = progress;
        broadcastJSON(wss, { type: 'NOW_PLAYING', payload });
        return;
      }
      if (lastProgressMs == null || Math.abs(progress - lastProgressMs) >= 2000) {
        lastProgressMs = progress;
        broadcastJSON(wss, { type: 'PROGRESS', payload: {
          ratingKey: match.ratingKey, progress, duration, state: pState, ts: Date.now()
        }});
      }
    } else {
      if (lastNowPlayingKey !== null) {
        lastNowPlayingKey = null;
        lastProgressMs = null;
        lastPlayerState = null;
        state.nowPlaying = null;
        broadcastJSON(wss, { type: 'IDLE' });
      }
    }
  } catch (e) {
    if (process.env.LOG_SESSIONS === '1') console.error('pollSessions error', e.message);
  }
}

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

const intervalMs = (() => {
  const v = Number(getConfig().poll_ms || 3000);
  return Number.isFinite(v) && v > 250 ? v : 3000;
})();
setInterval(pollSessions, intervalMs);
pollSessions();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
