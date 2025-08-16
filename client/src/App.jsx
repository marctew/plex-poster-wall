import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export default function App() {
  const loc = useLocation();
  const isDisplay = loc.pathname.startsWith('/display');

  if (isDisplay) {
    return (
      <div className="bg-backdrop text-slate-200 h-screen w-screen overflow-hidden">
        <Outlet />
      </div>
    );
  }

  const isAdmin = loc.pathname.startsWith('/admin');
  return (
    <div className="min-h-screen bg-backdrop text-slate-200">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h1 className="text-xl font-semibold tracking-wide glow">Plex Poster Wall</h1>
        <nav className="flex gap-3 text-sm">
          <Link className={`px-3 py-1 rounded ${!isAdmin ? 'bg-slate-800' : 'hover:bg-slate-800'}`} to="/display">Display</Link>
          <Link className={`px-3 py-1 rounded ${isAdmin ? 'bg-slate-800' : 'hover:bg-slate-800'}`} to="/admin">Admin</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
