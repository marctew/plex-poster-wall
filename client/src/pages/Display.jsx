import React, { useEffect, useState } from 'react';
import API from '../lib/api.js';
import PosterCarousel from '../components/PosterCarousel.jsx';
import NowPlaying from '../components/NowPlaying.jsx';

export default function Display() {
  const [latest, setLatest] = useState([]);
  const [session, setSession] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [override, setOverride] = useState(null);

  // Effective config = saved config + preview override
  const eff = override ? { ...cfg, ...override } : cfg;

  useEffect(() => {
    let ws;
    let cancelled = false;

    (async () => {
      const c = await API.getConfig();
      if (cancelled) return;
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');

      API.getLatest().then(items => !cancelled && setLatest(items)).catch(() => {});
      API.getNowPlaying().then(s => { if (!cancelled && s) setSession(s); }).catch(() => {});

      ws = API.ws((sock) => {
        sock.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'NOW_PLAYING') setSession(msg.payload);
            else if (msg.type === 'PROGRESS') {
              const p = msg.payload;
              setSession(prev => {
                if (!prev || prev.ratingKey !== p.ratingKey) return prev;
                const state = p.state || prev.state;
                return { ...prev, progress: Number(p.progress || 0), duration: Number(p.duration || prev.duration || 0), state, player: { ...(prev.player||{}), state } };
              });
            } else if (msg.type === 'IDLE') setSession(null);
            else if (msg.type === 'CONFIG_PREVIEW') {
              setOverride(msg.payload || null);
              const theme = (msg.payload && msg.payload.theme) || (cfg && cfg.theme) || 'neo-noir';
              document.documentElement.setAttribute('data-theme', theme);
            } else if (msg.type === 'CONFIG_PREVIEW_CLEAR') {
              setOverride(null);
              const theme = (cfg && cfg.theme) || 'neo-noir';
              document.documentElement.setAttribute('data-theme', theme);
            }
          } catch {}
        };
      });
    })();

    const refresh = setInterval(() => {
      API.getLatest().then(items => setLatest(items)).catch(() => {});
    }, 60_000);

    return () => { cancelled = true; ws?.close(); clearInterval(refresh); };
  }, []);

  // Smooth tick
  useEffect(() => {
    if (!session || !session.duration) return;
    const tick = setInterval(() => {
      setSession(s => {
        if (!s || !s.duration) return s;
        const playing = (s.player?.state || s.state || '').toLowerCase() === 'playing';
        if (!playing) return s;
        const next = Math.min((s.progress || 0) + 1000, s.duration);
        return { ...s, progress: next };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [session?.ratingKey, session?.player?.machineIdentifier]);

  if (!eff) return null;

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden hide-scrollbar bg-backdrop text-slate-200">
      <div className="pointer-events-none absolute inset-0 z-0 vignette" />
      {session
        ? <NowPlaying session={session} cfg={eff} />
        : <PosterCarousel items={latest} dwell={eff.carousel_dwell_ms || 3500} cfg={eff} />}
    </div>
  );
}
