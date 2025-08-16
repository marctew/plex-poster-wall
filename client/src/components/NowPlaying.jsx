import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function ProgressBar({ progress = 0, widthClass = 'w-[80vw]' }) {
  return (
    <div className={`${widthClass} max-w-[1000px] h-2 bg-slate-800 rounded overflow-hidden`}>
      <div className="h-full bg-neon" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
    </div>
  );
}

function formatTitle(s) {
  if (s?.type === 'episode' && s?.series) {
    const sec = s.seasonNumber != null ? String(s.seasonNumber).padStart(2, '0') : '??';
    const ep  = s.episodeNumber != null ? String(s.episodeNumber).padStart(2, '0') : '??';
    return `${s.series} · S${sec}E${ep} · ${s.episodeTitle || s.title}`;
  }
  return s?.title || 'Untitled';
}

function tmdbRating(s) {
  const isTMDb = (img) => typeof img === 'string' && img.toLowerCase().includes('themoviedb');
  if (isTMDb(s?.ratingImage) && s?.rating != null) return s.rating;
  if (isTMDb(s?.grandparentRatingImage) && s?.grandparentRating != null) return s.grandparentRating;
  return null;
}

export default function NowPlaying({ session, cfg }) {
  if (!session) return null;
  const pct = session.duration ? (100 * (session.progress || 0) / session.duration) : 0;
  const posterH = (cfg?.poster_height_vh ?? 78) + 'vh';
  const blurPx = cfg?.backdrop_blur_px ?? 12;
  const backOpacity = cfg?.backdrop_opacity ?? 0.35;

  const baseRem = 1.75;
  const titleSize = `${baseRem * (cfg?.title_scale ?? 1)}rem`;
  const synopsisSize = `${0.95 * (cfg?.synopsis_scale ?? 1)}rem`;

  const rating = cfg?.show_tmdb_badge ? tmdbRating(session) : null;
  const summary = session?.summary || session?.grandparentSummary || session?.parentSummary || '';

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
          <div className="font-bold glow leading-tight px-4 flex items-center justify-center gap-2" style={{ fontSize: titleSize }}>
            {formatTitle(session)}
            {rating != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700/60 text-xs" title="TMDb user score">
                <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
                  <rect x="1" y="1" width="22" height="22" rx="4" fill="#01d277"></rect>
                  <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#001a0f" fontFamily="sans-serif">TMDB</text>
                </svg>
                <span>{Number(rating).toFixed(1)}</span>
              </span>
            )}
          </div>
          {session.year && <div className="text-slate-300/80 mt-1">{session.year}</div>}

          {cfg?.show_synopsis ? (
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
              {summary || '—'}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col items-center gap-1">
          <ProgressBar progress={pct} />
          <div className="text-xs text-slate-300/80 mt-1">
            {Math.round(pct)}% • {session.user?.title || 'Unknown user'} on {session.player?.title || session.player?.product || 'Unknown device'}
          </div>
        </div>
      </div>
    </div>
  );
}
