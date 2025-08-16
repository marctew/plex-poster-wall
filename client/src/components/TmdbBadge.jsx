import React from 'react';

export default function TmdbBadge({ score, className='' }) {
  if (score == null) return null;
  const rounded = Math.round(score * 10) / 10;
  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-[11px] leading-none ${className}`}
      style={{ borderColor:'rgba(51,65,85,.8)', background:'rgba(15,23,42,.65)' }}
      title="TMDB user score"
    >
      <span className="font-semibold tracking-wide">TMDB</span>
      <span>★ {rounded}</span>
    </span>
  );
}
