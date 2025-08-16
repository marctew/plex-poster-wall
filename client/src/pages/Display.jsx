import React, { useEffect, useMemo, useRef, useState } from 'react';
import API from '../lib/api.js';
import PosterCarousel from '../components/PosterCarousel.jsx';
import NowPlaying from '../components/NowPlaying.jsx';

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

export default function Display() {
  const [latest, setLatest] = useState([]);
  const [session, setSession] = useState(null);
  const [cfg, setCfg] = useState(null);

  // local ticking for progress so the bar moves smoothly
  const lastTick = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setSession(s => {
        if (!s || s.state !== 'playing' || !s.duration) return s;
        const now = Date.now();
        const dt = now - lastTick.current;
        lastTick.current = now;
        const next = Math.min(s.duration, (s.progress || 0) + dt);
        return { ...s, progress: next };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let ws;
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');
      const items = await API.getLatest();
      setLatest(c.random_order ? shuffle(items) : items);
    })();

    ws = API.ws(sock => {
      sock.onmessage = evt => {
        lastTick.current = Date.now();
        const msg = JSON.parse(evt.data);
        if (msg.type === 'NOW_PLAYING') setSession(msg.payload);
        if (msg.type === 'IDLE') setSession(null);
      };
    });

    const refresh = setInterval(async () => {
      try {
        const items = await API.getLatest();
        setLatest(curCfg => (cfg?.random_order ? shuffle(items) : items));
      } catch {}
    }, 60_000);

    return () => { ws?.close(); clearInterval(refresh); };
  }, [cfg?.random_order]);

  if (!cfg) return null;

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden hide-scrollbar bg-backdrop text-slate-200">
      {session ? <NowPlaying session={session} cfg={cfg} /> : <PosterCarousel items={latest} dwell={cfg.carousel_dwell_ms || 3500} cfg={cfg} />}
    </div>
  );
}
