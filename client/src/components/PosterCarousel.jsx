import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function formatTitle(item) {
  if (item.type === 'episode' && item.series) {
    const s = item.seasonNumber != null ? String(item.seasonNumber).padStart(2, '0') : '??';
    const e = item.episodeNumber != null ? String(item.episodeNumber).padStart(2, '0') : '??';
    return `${item.series} · S${s}E${e} · ${item.episodeTitle || item.title}`;
  }
  return item.title || 'Untitled';
}

function tmdbRating(item) {
  // Prefer item rating if TMDb, else grandparent
  const isTMDb = (img) => typeof img === 'string' && img.toLowerCase().includes('themoviedb');
  if (isTMDb(item.ratingImage) && item.rating) return item.rating;
  if (isTMDb(item.grandparentRatingImage) && item.grandparentRating) return item.grandparentRating;
  return null;
}

export default function PosterCarousel({ items = [], dwell = 3500, cfg }) {
  const [index, setIndex] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (!items.length) return;
    timer.current = setInterval(() => setIndex(i => (i + 1) % items.length), dwell);
    return () => clearInterval(timer.current);
  }, [items, dwell]);

  const current = items[index];
  const posterH = (cfg?.poster_height_vh ?? 90) + 'vh';
  const blurPx = cfg?.backdrop_blur_px ?? 14;
  const backOpacity = cfg?.backdrop_opacity ?? 0.28;

  const baseRem = 1.5;
  const titleSize = `${baseRem * (cfg?.title_scale ?? 1)}rem`;
  const synopsisSize = `${0.875 * (cfg?.synopsis_scale ?? 1)}rem`;

  const rating = cfg?.show_tmdb_badge ? tmdbRating(current || {}) : null;

  // summary fallback already done server-side, but guard here too
  const summary = current?.summary || current?.grandparentSummary || current?.parentSummary || '';

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <AnimatePresence mode="wait">
        {current?.artUrl && (
          <motion.img
            key={current.ratingKey + '-art'}
            src={current.artUrl}
            alt="backdrop"
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: backOpacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{ filter: `blur(${blurPx}px)` }}
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-0 vignette" />

      <div className="relative z-10 flex flex-col items-center justify-center max-w-[92vw]">
        <AnimatePresence mode="wait">
          {current && (
            <motion.img
              key={current.ratingKey}
              src={current.thumbUrl}
              alt={current.title}
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 1.02 }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl poster-shadow object-contain"
              style={{ height: posterH, aspectRatio: '2/3' }}
            />
          )}
        </AnimatePresence>

        {current && (
          <div className="mt-4 text-center px-6 max-w-[92vw]">
            <div className="font-semibold glow flex items-center justify-center gap-2" style={{ fontSize: titleSize }}>
              {formatTitle(current)}
              {rating != null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700/60 text-xs"
                  title="TMDb user score">
                  <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
                    <rect x="1" y="1" width="22" height="22" rx="4" fill="#01d277"></rect>
                    <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#001a0f" fontFamily="sans-serif">TMDB</text>
                  </svg>
                  <span>{Number(rating).toFixed(1)}</span>
                </span>
              )}
            </div>
            {cfg?.show_synopsis ? (
              <div
                className="mt-2 text-slate-200/85"
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
        )}
      </div>
    </div>
  );
}
