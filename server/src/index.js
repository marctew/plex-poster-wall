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

// Shared state for routes
const state = { nowPlaying: null };
app.use('/api', createRouter({ state }));

const server = http.createServer(app);
const wss = initWSServer(server);

// Track what we last announced
let lastNowPlayingKey = null;
let lastProgressSecond = -1;
let lastState = null;

function pickArtPaths(item, preferSeries) {
  if (preferSeries && item.type === 'episode') {
    return {
      thumb: item.grandparentThumb || item.parentThumb || item.thumb,
      art:   item.grandparentArt   || item.parentArt   || item.art,
    };
  }
  return { thumb: item.thumb, art: item.art };
}

async function pollSessions() {
  const cfg = getConfig();
  if (!cfg.plex_url || !cfg.plex_token) return;

  try {
    const sessions = await getSessions({ baseUrl: cfg.plex_url, token: cfg.plex_token });

    const users   = (cfg.user_filters   || []).map(s => s.toLowerCase());
    const players = (cfg.player_filters || []).map(s => s.toLowerCase());

    const match = sessions.find(s => {
      const userOK = users.length === 0 || (s.user?.title && users.includes(String(s.user.title).toLowerCase()));
      const pName  = s.player?.title || s.player?.product || s.player?.platform || '';
      const playerOK = players.length === 0 || players.includes(String(pName).toLowerCase());
      const playing = s.state === 'playing' || (s.duration && s.progress < s.duration);
      return userOK && playerOK && playing;
    });

    if (match) {
      const key = `${match.ratingKey}:${match.player?.machineIdentifier || ''}`;
      const chosen = pickArtPaths(match, !!cfg.prefer_series_art);
      const payload = {
        ...match,
        thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1200) : null,
        artUrl:   chosen.art   ? buildImageProxyPath(chosen.art,   2000) : null,
        ts: Date.now(),
      };

      // keep state always fresh
      state.nowPlaying = payload;

      const progressSecond = Math.floor((match.progress || 0) / 1000);
      const stateChanged   = match.state !== lastState;

      if (key !== lastNowPlayingKey) {
        // New item/device → hard switch to NOW_PLAYING
        lastNowPlayingKey = key;
        lastProgressSecond = progressSecond;
        lastState = match.state;
        broadcastJSON(wss, { type: 'NOW_PLAYING', payload });
      } else if (progressSecond !== lastProgressSecond || stateChanged) {
        // Same item, but progress ticking or pause/play toggled → broadcast PROGRESS
        lastProgressSecond = progressSecond;
        lastState = match.state;
        broadcastJSON(wss, {
          type: 'PROGRESS',
          payload: {
            ratingKey: match.ratingKey,
            progress: match.progress,
            duration: match.duration,
            state: match.state,
            ts: Date.now()
          }
        });
      }
    } else {
      // No qualifying session
      if (lastNowPlayingKey !== null) {
        lastNowPlayingKey = null;
        lastProgressSecond = -1;
        lastState = null;
        state.nowPlaying = null;
        broadcastJSON(wss, { type: 'IDLE' });
      }
    }
  } catch (e) {
    if (process.env.LOG_SESSIONS === '1') {
      console.error('pollSessions error:', e.message);
    }
  }
}

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

// polling cadence from config (min clamp 250ms)
function pollInterval() {
  const v = Number(getConfig().poll_ms || 3000);
  return Number.isFinite(v) && v > 250 ? v : 3000;
}
setInterval(pollSessions, pollInterval());
pollSessions();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
