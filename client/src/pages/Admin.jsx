import React, { useEffect, useState } from 'react';
import API from '../lib/api.js';

export default function Admin() {
  const [cfg, setCfg] = useState(null);
  const [libs, setLibs] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      document.documentElement.setAttribute('data-theme', c.theme || 'neo-noir');
      if (c.plex_url && c.plex_token) {
        try { setLibs(await API.getLibraries()); } catch {}
      }
    })();
  }, []);

  async function reloadLibraries() {
    try { setLibs(await API.getLibraries()); setStatus('Loaded libraries.'); }
    catch { setStatus('Failed to load libraries.'); }
  }

  function toggleLib(key) {
    const keys = new Set(cfg.library_keys || []);
    keys.has(key) ? keys.delete(key) : keys.add(key);
    setCfg({ ...cfg, library_keys: [...keys] });
  }

  async function save() {
    const payload = { ...cfg };
    if (typeof payload.user_filters === 'string') payload.user_filters = payload.user_filters.split(',').map(s => s.trim()).filter(Boolean);
    if (typeof payload.player_filters === 'string') payload.player_filters = payload.player_filters.split(',').map(s => s.trim()).filter(Boolean);
    const saved = await API.saveConfig(payload);
    setCfg(saved);
    document.documentElement.setAttribute('data-theme', saved.theme || 'neo-noir');
    setStatus('Saved.');
  }

  if (!cfg) return <div className="p-6 text-slate-300">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-backdrop text-slate-200 min-h-screen">
      <h2 className="text-2xl font-semibold glow mb-4">Configuration</h2>

      {/* Plex Connection */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="text-sm text-slate-400 mb-2">Plex Connection</div>
        <label className="block text-sm mb-1">Plex URL</label>
        <input className="w-full bg-slate-800 rounded p-2" value={cfg.plex_url || ''} onChange={e => setCfg({ ...cfg, plex_url: e.target.value })} />
        <label className="block text-sm mt-3 mb-1">Plex Token</label>
        <input className="w-full bg-slate-800 rounded p-2" value={cfg.plex_token || ''} onChange={e => setCfg({ ...cfg, plex_token: e.target.value })} />
        <button onClick={reloadLibraries} className="mt-3 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">Reload Libraries</button>
      </div>

      {/* Libraries */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="text-sm text-slate-400 mb-2">Libraries</div>
        {libs.length === 0 ? (
          <div className="text-sm text-slate-500">Reload libraries to choose sections.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {libs.map(l => (
              <label key={l.key} className="flex items-center gap-2 bg-slate-800 rounded px-2 py-1">
                <input type="checkbox" checked={(cfg.library_keys || []).includes(l.key)} onChange={() => toggleLib(l.key)} />
                <span>{l.title} <span className="text-xs text-slate-500">({l.type})</span></span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6 grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-slate-400 mb-2">User Filters (optional)</div>
          <input className="w-full bg-slate-800 rounded p-2"
                 value={Array.isArray(cfg.user_filters) ? cfg.user_filters.join(', ') : (cfg.user_filters || '')}
                 onChange={e => setCfg({ ...cfg, user_filters: e.target.value })}
                 placeholder="e.g. marc, sarah" />
          <div className="text-xs text-slate-500 mt-1">Empty = allow any user</div>
        </div>
        <div>
          <div className="text-sm text-slate-400 mb-2">Player Filters (optional)</div>
          <input className="w-full bg-slate-800 rounded p-2"
                 value={Array.isArray(cfg.player_filters) ? cfg.player_filters.join(', ') : (cfg.player_filters || '')}
                 onChange={e => setCfg({ ...cfg, player_filters: e.target.value })}
                 placeholder="e.g. Living Room TV" />
          <div className="text-xs text-slate-500 mt-1">Empty = allow any player</div>
        </div>
      </div>

      {/* Display */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6 grid grid-cols-2 gap-4">
        <div className="col-span-2 text-sm text-slate-400">Display</div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.prefer_series_art} onChange={e => setCfg({ ...cfg, prefer_series_art: e.target.checked })} />
          <span>Prefer series/season artwork for TV episodes</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.show_synopsis} onChange={e => setCfg({ ...cfg, show_synopsis: e.target.checked })} />
          <span>Show synopsis under artwork</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.show_badges} onChange={e => setCfg({ ...cfg, show_badges: e.target.checked })} />
          <span>Show quality/codec badges</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!cfg.randomize_order} onChange={e => setCfg({ ...cfg, randomize_order: e.target.checked })} />
          <span>Randomise poster order</span>
        </label>

        <div>
          <div className="text-sm text-slate-400 mb-1">Synopsis max lines</div>
          <input type="number" min={2} max={12} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.synopsis_max_lines ?? 6}
                 onChange={e => setCfg({ ...cfg, synopsis_max_lines: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Poster height (vh)</div>
          <input type="number" min={50} max={100} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.poster_height_vh ?? 90}
                 onChange={e => setCfg({ ...cfg, poster_height_vh: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Title size modifier (×)</div>
          <input type="range" min={0.5} max={5} step={0.05} className="w-full"
                 value={cfg.title_scale ?? 1.0}
                 onChange={e => setCfg({ ...cfg, title_scale: Number(e.target.value) })} />
          <div className="text-xs text-slate-500">{(cfg.title_scale ?? 1.0).toFixed(2)}×</div>
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Synopsis size modifier (×)</div>
          <input type="range" min={0.5} max={5} step={0.05} className="w-full"
                 value={cfg.synopsis_scale ?? 1.0}
                 onChange={e => setCfg({ ...cfg, synopsis_scale: Number(e.target.value) })} />
          <div className="text-xs text-slate-500">{(cfg.synopsis_scale ?? 1.0).toFixed(2)}×</div>
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Badges size modifier (×)</div>
          <input type="range" min={0.5} max={5} step={0.05} className="w-full"
                 value={cfg.badges_scale ?? 1.0}
                 onChange={e => setCfg({ ...cfg, badges_scale: Number(e.target.value) })} />
          <div className="text-xs text-slate-500">{(cfg.badges_scale ?? 1.0).toFixed(2)}×</div>
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Time per slide (ms)</div>
          <input type="number" min={800} max={30000} step={100} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.carousel_dwell_ms ?? 3500}
                 onChange={e => setCfg({ ...cfg, carousel_dwell_ms: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Max recent items</div>
          <input type="number" min={5} max={200} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.latest_limit ?? 40}
                 onChange={e => setCfg({ ...cfg, latest_limit: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Backdrop blur (px)</div>
          <input type="number" min={0} max={30} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.backdrop_blur_px ?? 14}
                 onChange={e => setCfg({ ...cfg, backdrop_blur_px: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Backdrop opacity (0–1)</div>
          <input type="number" min={0} max={1} step={0.05} className="w-full bg-slate-800 rounded p-2"
                 value={cfg.backdrop_opacity ?? 0.3}
                 onChange={e => setCfg({ ...cfg, backdrop_opacity: Number(e.target.value) })} />
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-1">Theme</div>
          <select className="w-full bg-slate-800 rounded p-2"
                  value={cfg.theme || 'neo-noir'}
                  onChange={e => setCfg({ ...cfg, theme: e.target.value })}>
            <option value="neo-noir">Neo-Noir</option>
            <option value="amber">Amber</option>
            <option value="synthwave">Synthwave</option>
            <option value="mono">Monochrome</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} className="px-4 py-2 rounded bg-neon text-slate-900 font-semibold">Save</button>
        <div className="text-sm text-slate-400">{status}</div>
      </div>
    </div>
  );
}
