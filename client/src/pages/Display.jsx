import React, { useEffect, useRef, useState } from 'react';
import API from '../lib/api.js';
import PosterCarousel from '../components/PosterCarousel.jsx';
import NowPlaying from '../components/NowPlaying.jsx';

export default function Display() {
  const [latest, setLatest] = useState([]);
  const [session, setSession] = useState(null);
  const [cfg, setCfg] = useState(null);

  const tickRef = useRef(null);
  const wsRef = useRef(null);

  // Local “smooth” progress tick (keeps bar moving between polls)
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setSession(s => {
        if (!s || s.state !== 'playing') return s;
        const next = Math.min((s.duration || 0), (s.progress || 0) + 1000);
        if (next === s.progress) return s;
        return { ...s, progress: next };
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    let refresh;

    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');

      // grab current session immediately (fix: reload shows now-playing)
      try {
        const cur = await API.getNowPlaying();
        if (cur && cur.ratingKey) setSession(cur);
      } catch {}

      API.getLatest().then(setLatest).catch(()=>{});
    })();

    wsRef.current = API.ws((sock) => {
      sock.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'NOW_PLAYING') setSession(msg.payload);
        if (msg.type === 'IDLE') setSession(null);
        if (msg.type === 'PROGRESS') {
          setSession(s => {
            if (!s) return s;
            if (String(s.ratingKey) !== String(msg.payload.ratingKey)) return s;
            return {
              ...s,
              progress: msg.payload.progress ?? s.progress,
              duration: msg.payload.duration ?? s.duration,
              state: msg.payload.state ?? s.state,
              ts: msg.payload.ts || Date.now(),
            };
          });
        }
      };
    });

    // keep latest posters fresh
    refresh = setInterval(() => API.getLatest().then(setLatest).catch(()=>{}), 60_000);

    return () => {
      clearInterval(refresh);
      try { wsRef.current?.close(); } catch {}
    };
  }, []);

  if (!cfg) return null;

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden hide-scrollbar bg-backdrop text-slate-200">
      {session ? (
        <NowPlaying session={session} cfg={cfg} />
      ) : (
        <PosterCarousel items={latest} dwell={cfg.carousel_dwell_ms || 3500} cfg={cfg} />
      )}
    </div>
  );
}
