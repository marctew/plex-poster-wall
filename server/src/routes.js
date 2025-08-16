import express from 'express';
import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';
import { getLibraries, getRecentlyAdded, buildImageProxyPath } from './plex.js';
import { getTmdbForRatingKey } from './tmdb.js';
import { hasAdmin, setAdminCredentials, verifyLogin, createSession, verifyToken } from './auth.js';

function pickArt(i, preferSeries) {
  if (preferSeries && i.type === 'episode') {
    return { thumb: i.grandparentThumb || i.parentThumb || i.thumb,
             art:   i.grandparentArt   || i.parentArt   || i.art };
  }
  return { thumb: i.thumb, art: i.art };
}

function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

function authFromReq(req){
  const h=req.headers.authorization||''; if(h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.headers['x-ppw-token'] ? String(req.headers['x-ppw-token']) : null;
}
function requireAuth(req,res,next){
  if(!hasAdmin()) return res.status(403).json({error:'Setup required'});
  const tok = authFromReq(req);
  const ok = tok ? verifyToken(tok) : null;
  if(!ok) return res.status(401).json({error:'Unauthorized'});
  req.user=ok.username; next();
}

export function createRouter({ state }) {
  const router = express.Router();
  router.use(express.json());

  router.get('/health', (_req,res)=>res.json({ok:true}));

  // ---- AUTH
  router.get('/auth/status', (req,res)=>{
    const setup=!hasAdmin();
    const tok=authFromReq(req);
    const ok=tok?verifyToken(tok):null;
    res.json({setup, authed:!!ok, user: ok?.username || null});
  });
  router.post('/auth/setup', (req,res)=>{
    if(hasAdmin()) return res.status(400).json({error:'Admin already exists'});
    const {username,password}=req.body||{};
    try{ setAdminCredentials(username,password); return res.json({ok:true, token:createSession(String(username))}); }
    catch(e){ return res.status(400).json({error:e.message||'Setup failed'}); }
  });
  router.post('/auth/login', (req,res)=>{
    if(!hasAdmin()) return res.status(404).json({error:'No admin. Run setup.'});
    const {username,password}=req.body||{};
    const ok=verifyLogin(String(username||''), String(password||''));
    if(!ok) return res.status(401).json({error:'Invalid credentials'});
    return res.json({ok:true, token:createSession(String(username))});
  });
  router.post('/auth/logout', (_req,res)=>res.json({ok:true}));

  // ---- CONFIG
  router.get('/config', (_req,res)=>res.json(getConfig()));
  router.post('/config', requireAuth, (req,res)=>res.json(setConfig(req.body||{})));

  // ---- LIBRARIES (protected)
  router.get('/plex/libraries', requireAuth, async (_req,res)=>{
    try{
      const cfg=getConfig();
      const libs=await getLibraries({baseUrl:cfg.plex_url, token:cfg.plex_token});
      res.json(libs);
    }catch(e){ res.status(500).json({error:e.message});}
  });

  // ---- LATEST (randomizable, public)
  router.get('/latest', async (req,res)=>{
    try{
      const cfg=getConfig();
      const preferSeries=!!cfg.prefer_series_art;
      const keys=(req.query.keys?String(req.query.keys).split(','):cfg.library_keys)||[];
      const limit=Number(req.query.limit || cfg.latest_limit || 40);
      const pool=[];
      for (const key of keys){
        const items=await getRecentlyAdded({baseUrl:cfg.plex_url, token:cfg.plex_token, sectionKey:key, limit});
        pool.push(...items);
      }
      let ordered = pool.sort((a,b)=>b.addedAt-a.addedAt);
      if (cfg.random_order) ordered = shuffle(ordered);
      const out = ordered.slice(0, limit).map(i=>{
        const chosen=pickArt(i, preferSeries);
        return {...i,
          thumbUrl: chosen.thumb ? buildImageProxyPath(chosen.thumb, 1000) : null,
          artUrl:   chosen.art   ? buildImageProxyPath(chosen.art,   2000) : null,
        };
      });
      res.json(out);
    }catch(e){ res.status(500).json({error:e.message});}
  });

  // ---- NOW PLAYING (public)
  router.get('/now-playing', (_req,res)=>res.json(state.nowPlaying||null));

  // ---- TMDB (public but requires key present)
  router.get('/tmdb/:ratingKey', async (req,res)=>{
    try{
      const cfg=getConfig();
      const apiKey=cfg.tmdb_api_key || process.env.TMDB_API_KEY || '';
      if(!apiKey) return res.json({});
      const info=await getTmdbForRatingKey({
        baseUrl: cfg.plex_url, token: cfg.plex_token,
        ratingKey: req.params.ratingKey, apiKey
      });
      res.json(info||{});
    }catch(e){ res.status(500).json({error:e.message});}
  });

  // ---- IMAGE PROXY (public)
  router.get('/image', async (req,res)=>{
    try{
      const { path, width } = req.query;
      if(!path) return res.status(400).send('Missing path');
      const cfg=getConfig();
      const url=new URL(String(path), cfg.plex_url);
      if(width) url.searchParams.set('width', String(width));
      url.searchParams.set('X-Plex-Token', cfg.plex_token);
      const upstream=await fetch(url, { headers:{Accept:'image/webp,image/*;q=0.8,*/*;q=0.5'} });
      res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      upstream.body.pipe(res);
    }catch(e){ res.status(500).send(e.message); }
  });

  return router;
}
