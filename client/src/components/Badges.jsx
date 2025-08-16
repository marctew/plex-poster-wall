import React from 'react';

function Chip({ children, title }) {
  return (
    <span
      title={title}
      className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900/70 text-[10px] uppercase tracking-wide text-slate-200"
      style={{ lineHeight: '1.2' }}
    >
      {children}
    </span>
  );
}

export default function Badges({ media, className = '', show = true }) {
  if (!show || !media) return null;

  const out = [];

  if (media.resolution) out.push(<Chip key="res" title="Resolution">{media.resolution}</Chip>);
  if (media.hdr) out.push(<Chip key="hdr" title="High Dynamic Range">{media.hdr}</Chip>);
  if (media.atmos) out.push(<Chip key="atmos" title="Dolby Atmos">ATMOS</Chip>);

  // Audio channels as 5.1 / 7.1
  if (media.audioChannels) {
    const ch = Number(media.audioChannels);
    if (ch >= 2) {
      const layout = ch === 6 ? '5.1' : ch === 8 ? '7.1' : `${ch}.0`;
      out.push(<Chip key="ch" title="Audio Channels">{layout}</Chip>);
    }
  }

  // Codecs
  if (media.videoCodec) out.push(<Chip key="vcodec" title="Video Codec">{media.videoCodec}</Chip>);
  if (media.audioCodec) out.push(<Chip key="acodec" title="Audio Codec">{media.audioCodec}</Chip>);

  if (!out.length) return null;
  return <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>{out}</div>;
}
