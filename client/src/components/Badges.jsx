import React, { useEffect, useRef, useState } from 'react';
import API from '../lib/api.js';

const cache = new Map(); // ratingKey -> {rating, votes}

export function useTmdb(ratingKey) {
  const [tmdb, setTmdb] = useState(null);
  const busy = useRef(false);

  useEffect(() => {
    let dead = false;
    async function run() {
      if (!ratingKey) return setTmdb(null);
      if (cache.has(ratingKey)) return setTmdb(cache.get(ratingKey));
      if (busy.current) return;
      busy.current = true;
      try {
        const data = await API.getTmdb(ratingKey);
        const info = data && typeof data.rating === 'number'
          ? { rating: data.rating, votes: data.votes || null }
          : null;
        cache.set(ratingKey, info);
        if (!dead) setTmdb(info);
      } catch {
        if (!dead) setTmdb(null);
      } finally { busy.current = false; }
    }
    run();
    return () => { dead = true; };
  }, [ratingKey]);

  return tmdb;
}

export default function BadgesRow({ tmdb }) {
  if (!tmdb) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-emerald-900/50 border border-emerald-700/60">
        <span className="font-bold tracking-tight">TMDb</span>
        <span className="font-semibold">{tmdb.rating.toFixed(1)}</span>
      </span>
    </div>
  );
}
