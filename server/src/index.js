import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { getConfig } from './config.js';
import { getSessions, buildImageProxyPath } from './plex.js';
import { initWSServer, broadcastJSON } from './websocket.js';
import { createRouter } from './routes.js';

dotenv.config();

const app = express();
app.use(cors());

const state = { nowPlaying: null };
const server = http.createServer(app);
const wss = initWSServer(server);

// tiny broadcaster fn we pass into routes for live preview
const broadcast = (type, payload) => broadcastJSON(wss, { type, payload });

app.use('/api', createRouter({ state, broadcast }));

let lastNowPlayingKey = null;

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
      const playing = s.state === 'playing' || (s.duration && s.progress && s.progress < s.duration);
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
      if (key !== lastNowPlayingKey) {
        lastNowPlayingKey = key;
        broadcast('NOW_PLAYING', payload);
      }
    } else if (lastNowPlayingKey !== null) {
      lastNowPlayingKey = null;
      state.nowPlaying = null;
      broadcast('IDLE', null);
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
