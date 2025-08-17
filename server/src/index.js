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
app.use('/api', createRouter({ state }));

const server = http.createServer(app);
const wss = initWSServer(server);

let lastKey = null;

function pickArt(item, preferSeries){
  if (preferSeries && item.type === 'episode') {
    return {
      thumb: item.grandparentThumb || item.parentThumb || item.thumb,
      art: item.grandparentArt || item.parentArt || item.art,
    };
  }
  return { thumb: item.thumb, art: item.art };
}

async function pollSessions(){
  const cfg = getConfig();
  if (!cfg.plex_url || !cfg.plex_token) return;

  try {
    const sessions = await getSessions({ baseUrl: cfg.plex_url, token: cfg.plex_token });
    const users = (cfg.user_filters || []).map(s => s.toLowerCase());
    const players = (cfg.player_filters || []).map(s => s.toLowerCase());

    const match = sessions.find(s => {
      const userOk = users.length === 0 || (s.user?.title && users.includes(s.user.title.toLowerCase()));
      const pName = s.player?.title || s.player?.product || s.player?.platform || '';
      const playerOk = players.length === 0 || players.includes(String(pName).toLowerCase());
      const playing = s.state === 'playing' || (s.duration && s.progress < s.duration);
      return userOk && playerOk && playing;
    });

    if (match) {
      const key = `${match.ratingKey}:${match.player?.machineIdentifier || ''}`;
      const art = pickArt(match, !!cfg.prefer_series_art);
      const payload = {
        ...match,
        thumbUrl: art.thumb ? buildImageProxyPath(art.thumb, 1200) : null,
        artUrl: art.art ? buildImageProxyPath(art.art, 2000) : null,
        ts: Date.now(),
      };
      state.nowPlaying = payload;

      // ALWAYS broadcast while playing (baseline refresh for client interpolation)
      broadcastJSON(wss, { type: 'NOW_PLAYING', payload });

      lastKey = key;
    } else {
      if (lastKey !== null) {
        lastKey = null;
        state.nowPlaying = null;
        broadcastJSON(wss, { type: 'IDLE' });
      }
    }
  } catch (e) {
    if (process.env.LOG_SESSIONS === '1') console.error('pollSessions error', e.message);
  }
}

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => console.log(`Server listening on http://0.0.0.0:${PORT}`));

function pollInterval(){
  const v = Number(getConfig().poll_ms || 3000);
  return Number.isFinite(v) && v > 250 ? v : 3000;
}
setInterval(pollSessions, pollInterval());
pollSessions();

for (const sig of ['SIGINT','SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
