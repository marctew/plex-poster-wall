import React from 'react';

export default function Badges({ media, scale = 1 }) {
  if (!media) return null;

  const pills = [
    media.resolution,
    media.audioChannels,
    media.videoCodec,
    media.audioCodec,
    media.hdr,
  ].filter(Boolean);

  if (!pills.length) return null;

  // Base 11px, scale 0.5x–5x (i.e., 5.5px–55px)
  const s = Math.max(0.5, Math.min(5, Number(scale || 1)));
  const fontSizePx = 11 * s;

  return (
    <div
      className="badges flex items-center justify-center flex-wrap gap-2"
      style={{ fontSize: `${fontSizePx}px`, lineHeight: 1 }}
    >
      {pills.map((p, i) => (
        <span key={i} className="badge-pill">{p}</span>
      ))}
    </div>
  );
}
