import React from 'react';

function Chip({ children }) {
  return (
    <span
      className="inline-block px-2 py-1 rounded border text-[11px] leading-none"
      style={{ borderColor: 'rgba(51,65,85,.8)', background: 'rgba(15,23,42,.65)' }}
    >
      {children}
    </span>
  );
}

export default function Badges({ media, className = '' }) {
  if (!media) return null;
  const chips = [];

  if (media.resolution) chips.push(<Chip key="res">{media.resolution === '2160p' ? '4K' : media.resolution.replace('p','')}</Chip>);
  if (media.audioChannels) chips.push(<Chip key="ch">{media.audioChannels}</Chip>);

  if (media.videoCodec) {
    const vc = String(media.videoCodec).toUpperCase().replace('H265','HEVC').replace('X265','HEVC').replace('H264','AVC');
    chips.push(<Chip key="vcodec">{vc}</Chip>);
  }
  if (media.audioCodec) chips.push(<Chip key="acodec">{String(media.audioCodec).toUpperCase()}</Chip>);
  if (media.hdr) chips.push(<Chip key="hdr">{media.hdr}</Chip>);

  if (!chips.length) return null;
  return <div className={`flex items-center gap-2 flex-wrap justify-center ${className}`}>{chips}</div>;
}
