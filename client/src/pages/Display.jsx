import React, { useEffect, useState } from 'react';
import API from '../lib/api.js';
import PosterCarousel from '../components/PosterCarousel.jsx';
import NowPlaying from '../components/NowPlaying.jsx';

export default function Display() {
  const [latest, setLatest] = useState([]);
  const [session, setSession] = useState(null);
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    let ws;

    // Load config & theme
    API.getConfig().then(c => {
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');
    });

    // First batch of posters
    API.getLatest().then(setLatest).catch(() => {});

    // Live updates for now playing
    ws = API.ws((sock) => {
      sock.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'NOW_PLAYING') setSession(msg.payload);
          if (msg.type === 'IDLE') setSession(null);
        } catch {}
      };
    });

    // Refresh posters periodically
    const refresh = setInterval(() => {
      API.getLatest().then(setLatest).catch(() => {});
    }, 60_000);

    return () => {
      ws?.close();
      clearInterval(refresh);
    };
  }, []);

  if (!cfg) return null;

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden hide-scrollbar bg-backdrop text-slate-200">
      {session
        ? <NowPlaying session={session} cfg={cfg} />
        : <PosterCarousel items={latest} dwell={cfg.carousel_dwell_ms || 3500} cfg={cfg} />}
    </div>
  );
}
