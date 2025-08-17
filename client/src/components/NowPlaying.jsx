import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Badges from './Badges.jsx';

function ProgressBar({ progressPct=0, widthClass='w-[80vw]' }){
  return (
    <div className={`${widthClass} max-w-[1000px] h-2 bg-slate-800 rounded overflow-hidden`}>
      <div className="h-full bg-neon" style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
    </div>
  );
}

function formatTitle(s){
  if (s?.type === 'episode' && s?.series) {
    const sec = s.seasonNumber != null ? String(s.seasonNumber).padStart(2,'0') : '??';
    const ep  = s.episodeNumber != null ? String(s.episodeNumber).padStart(2,'0') : '??';
    return `${s.series} · S${sec}E${ep} · ${s.episodeTitle || s.title}`;
  }
  return s?.title || 'Untitled';
}

export default function NowPlaying({ session, cfg }){
  const [pct, setPct] = useState(0);
  const rafRef = useRef(0);
  const baseRef = useRef({ progress:0, ts:0 });

  useEffect(() => {
    if (!session) return;
    baseRef.current = { progress: session.progress || 0, ts: session.ts || Date.now() };
    // rAF tick for buttery progress
    const tick = () => {
      const { progress, ts } = baseRef.current;
      const playing = session.state === 'playing';
      const now = Date.now();
      const eff = playing ? progress + (now - ts) : progress;
      const pctLocal = session.duration ? (100 * eff / session.duration) : 0;
      setPct(pctLocal);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [session?.ratingKey, session?.ts, session?.state, session?.duration]);

  if (!session) return null;

  const posterH = (cfg?.poster_height_vh ?? 78) + 'vh';
  const blurPx = cfg?.backdrop_blur_px ?? 12;
  const backOpacity = cfg?.backdrop_opacity ?? 0.35;
  const baseRem = cfg?.title_size === 'lg' ? 2.0 : cfg?.title_size === 'sm' ? 1.375 : 1.75;
  const titleSize = `${baseRem * (cfg?.title_scale ?? 1)}rem`;
  const synopsisSize = `${0.95 * (cfg?.synopsis_scale ?? 1)}rem`;

  return (
    <div className="fixed inset-0">
      <AnimatePresence mode="wait">
        {session.artUrl && (
          <motion.img
            key={session.ratingKey + '-art'}
            src={session.artUrl}
            alt="backdrop"
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: backOpacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            style={{ filter: `blur(${blurPx}px)` }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4">
        {session.thumbUrl && (
          <img
            src={session.thumbUrl}
            alt={session.title}
            className="rounded-2xl poster-shadow object-contain"
            style={{ height: posterH, aspectRatio: '2/3' }}
          />
        )}

        <div className="mt-5 text-center max-w-[92vw]">
          <div className="text-xs uppercase tracking-widest text-neon mb-1">Now Playing</div>
          <div className="font-bold glow leading-tight px-4" style={{ fontSize: titleSize }}>
            {formatTitle(session)}
          </div>
          {session.year && <div className="text-slate-300/80 mt-1">{session.year}</div>}

          {/* badges */}
          {cfg?.show_badges && (
            <div className="mt-2 flex justify-center">
              <Badges media={session.media} scale={cfg.badges_scale ?? 1} />
            </div>
          )}

          {cfg?.show_synopsis && (
            <div
              className="mt-3 text-slate-200/90 mx-auto"
              style={{
                fontSize: synopsisSize,
                display: '-webkit-box',
                WebkitLineClamp: String(cfg?.synopsis_max_lines ?? 6),
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {session.summary || '—'}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col items-center gap-1">
          <ProgressBar progressPct={pct} />
          <div className="text-xs text-slate-300/80 mt-1">
            {Math.round(pct)}% • {session.user?.title || 'Unknown user'} on {session.player?.title || session.player?.product || 'Unknown device'}
          </div>
        </div>
      </div>
    </div>
  );
}
