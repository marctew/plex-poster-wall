import React, { useEffect, useMemo, useState } from 'react';
import API from '../lib/api.js';

const cache = new Map();

function Donut({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Math.round((Number(value)||0) * 10))); // 0..10 -> %
  const r=18, c=2*Math.PI*r, dash=(pct/100)*c;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="6"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-neon)" strokeWidth="6"
              strokeDasharray={`${dash} ${c-dash}`} strokeLinecap="round" transform="rotate(-90 22 22)"/>
      <text x="22" y="23.8" textAnchor="middle" fontSize="11" fill="white" style={{fontWeight:700}}>
        {Math.round((Number(value)||0)*10)}
      </text>
    </svg>
  );
}

function TMDBPill(){
  return (
    <span className="px-2 py-1 rounded text-[10px] font-semibold tracking-wide"
          style={{background:'rgba(15,23,42,.65)', border:'1px solid rgba(51,65,85,.8)'}}>TMDB</span>
  );
}

export default function TmdbBadge({ ratingKey, cfg }) {
  const wantLogo  = !!cfg?.show_tmdb_logo;
  const wantScore = !!cfg?.show_tmdb_score;
  const enabled   = !!cfg?.tmdb_api_key && (wantLogo || wantScore);

  const key = useMemo(()=> String(ratingKey||''), [ratingKey]);
  const [info, setInfo] = useState(null);

  useEffect(()=>{
    let stop=false;
    if (!enabled || !key) { setInfo(null); return; }
    if (cache.has(key)) { setInfo(cache.get(key)); return; }
    (async()=>{
      try{
        const data = await API.getTmdb(key);
        if (!stop) { cache.set(key, data || {}); setInfo(data || {}); }
      }catch{ if(!stop) setInfo({}); }
    })();
    return ()=>{stop=true;};
  }, [enabled, key]);

  // If feature disabled or no data came back, render nothing.
  if (!enabled || !info || (Object.keys(info).length===0)) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      {wantLogo && <TMDBPill />}
      {wantScore && Number.isFinite(Number(info.vote_average)) && <Donut value={Number(info.vote_average)} />}
    </div>
  );
}
