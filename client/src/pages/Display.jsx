import React, { useEffect, useState } from 'react';
import API from '../lib/api.js';
import PosterCarousel from '../components/PosterCarousel.jsx';
import NowPlaying from '../components/NowPlaying.jsx';

export default function Display() {
  const [latest, setLatest] = useState([]);
  const [session, setSession] = useState(null);
  const [cfg, setCfg] = useState(null);

  async function refreshLatest() { try { setLatest(await API.getLatest()); } catch {} }
  async function refreshNow()    { try { setSession(await API.getNowPlaying()); } catch {} }

  useEffect(() => {
    let ws;
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');
      await Promise.all([refreshLatest(), refreshNow()]);
    })();

    ws = API.ws((sock) => {
      // on connect, also ask for current state
      refreshNow();
      sock.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'NOW_PLAYING') setSession(msg.payload);
        if (msg.type === 'IDLE') setSession(null);
      };
    });

    const t = setInterval(refreshLatest, 60_000);
    return () => { ws?.close(); clearInterval(t); };
  }, []);

  if (!cfg) return null;

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden hide-scrollbar bg-backdrop text-slate-200">
      {session ? <NowPlaying session={session} cfg={cfg} /> : <PosterCarousel items={latest} dwell={cfg.carousel_dwell_ms || 3500} cfg={cfg} />}
    </div>
  );
}
