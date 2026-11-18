// Shell: opens the library folder, holds what every mode shares (mode, favorites, controller state).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CONFIG, CONFIG_FILE, DEMO, K } from './config.js';
import * as lib from './lib/library.js';
import { buildDemo } from './lib/demo.js';
import { store } from './lib/progress.js';
import { useGamepadStore } from './gamepad/gamepadStore.js';
import { Icon } from './ui.jsx';
import LookAlikes from './LookAlikes.jsx';
import Videos from './Videos.jsx';
import Gallery from './Gallery.jsx';
import { Home, Setup, Privacy, Terms } from './pages/Pages.jsx';

// each mode has its own address; anything else is one of the pages around the app
const ROUTES = { photos: '/look-alikes', videos: '/videos', gallery: '/gallery', favorites: '/gallery' };
const modeOf = p => p.startsWith('/look-alikes') ? 'photos' : p.startsWith('/videos') ? 'videos' : p.startsWith('/gallery') ? 'gallery' : null;

export default function App() {
  const [root, setRoot] = useState(null), [saved, setSaved] = useState(null), [phase, setPhase] = useState('boot'), [error, setError] = useState('');
  const { pathname, search } = useLocation(), navigate = useNavigate(), here = useRef(pathname); here.current = pathname;
  const mode = modeOf(pathname), setMode = useCallback(k => navigate(ROUTES[k] || ROUTES.photos), [navigate]);
  const [favs, setFavs] = useState(() => store.get(K('favorites'), {}));
  const [peekState, setPeekState] = useState(() => ({ open: false, width: 256, view: 'list', ...store.get('peek', {}) }));
  const [galleryFolder, setGalleryFolder] = useState(() => store.get(K('galleryFolder'), ''));
  const [rots, setRots] = useState(() => store.get(K('rotations'), {}));   // how each item is turned for viewing: id -> degrees clockwise
  const booted = useRef(false);
  const pad = useGamepadStore(s => s.users.some(u => u.connected && u.supported));
  useEffect(() => { if (mode) store.set(K('mode'), mode); }, [mode]);   // remembered, so the next visit starts in the same mode
  // a link may ask for a sprint (?sprint=<minutes> or ?groups=<count>); it is kept until Look-alikes can start it,
  // which may be after the folder is reopened
  const [launch, setLaunch] = useState(null), pending = useRef(null); pending.current = launch;
  useEffect(() => { const q = new URLSearchParams(search), num = (k, max) => Math.min(max, Math.max(0, Math.round(+q.get(k)) || 0)); const sprint = num('sprint', 240), groups = num('groups', 5000); if (sprint || groups) setLaunch({ sprint, groups }); }, [search]);
  useEffect(() => { if (launch && root && mode !== 'photos') navigate(ROUTES.photos, { replace: true }); }, [launch, root, mode, navigate]);   // sprints live in Look-alikes
  const resume = useCallback(replace => navigate(pending.current ? ROUTES.photos : ROUTES[store.get(K('mode'), 'photos')] || ROUTES.photos, { replace }), [navigate]);
  useEffect(() => store.set(K('favorites'), favs), [favs]);
  useEffect(() => store.set('peek', peekState), [peekState]);
  useEffect(() => store.set(K('rotations'), rots), [rots]);
  const turn = useCallback(id => setRots(r => { const d = ((r[id] || 0) + 90) % 360, { [id]: _, ...rest } = r; return d ? { ...rest, [id]: d } : rest; }), []);
  useEffect(() => store.set(K('galleryFolder'), galleryFolder), [galleryFolder]);
  const peek = { ...peekState, set: patch => setPeekState(p => ({ ...p, ...patch })) };
  // Alt+L shows / hides the quick peek panel, Alt+V switches it between list and grid (same keys as games-reducer)
  useEffect(() => { const on = e => { if (!e.altKey || e.ctrlKey || e.metaKey) return; const k = e.key.toLowerCase(); if (k === 'l') { e.preventDefault(); setPeekState(p => ({ ...p, open: !p.open })); } else if (k === 'v') { e.preventDefault(); setPeekState(p => ({ ...p, view: p.view === 'grid' ? 'list' : 'grid' })); } }; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, []);

  // enter: go into the app afterwards (always after a click; on start-up only from the home page)
  const open = useCallback(async (h, enter = true) => {
    setError('');
    try { if (await lib.exists(h, CONFIG_FILE)) Object.assign(CONFIG, await lib.readJson(h, CONFIG_FILE)); } catch { /* unreadable settings: fall back to the defaults */ }
    if ((await lib.exists(h, CONFIG.groups)) || (await lib.exists(h, CONFIG.videos)) || (await lib.exists(h, CONFIG.library))) { setRoot(h); setPhase('review'); if (enter && !modeOf(here.current)) resume(true); }
    else { setError(`“${h.name}” has not been set up for Gallery Reducer. Run setup.cmd (in the app’s tools folder) and choose the same folder you gave it.`); setPhase('connect'); }
  }, [resume]);
  const openDemo = useCallback(async () => { if (!DEMO) { location.search = '?demo'; return; } open(await buildDemo(), here.current === '/' || !!modeOf(here.current)); }, [open]);
  useEffect(() => {
    if (booted.current) return; booted.current = true;
    (async () => {
      if (DEMO) return openDemo();
      const h = await lib.loadRoot();
      if (h) { setSaved(h); if (await lib.hasPermission(h, false)) return open(h, here.current === '/'); }
      setPhase('connect');
    })();
  }, [open, openDemo]);
  const pick = async () => { setError('Waiting for the folder window… If none appears, this browser can’t show it: open this page in Chrome or Edge instead.'); try { const h = await window.showDirectoryPicker({ id: 'gallery-reducer', mode: 'readwrite' }); await lib.saveRoot(h); setSaved(h); open(h); } catch (e) { setError(e.name === 'AbortError' ? '' : e.message); } };
  const reconnect = async () => { if (await lib.hasPermission(saved, true)) open(saved); else setError('Access to the folder was not granted.'); };
  const changeFolder = async () => { await lib.clearRoot(); setSaved(null); setRoot(null); setPhase('connect'); navigate('/'); };

  // a favorite remembers enough about the file to show it later without the group it came from
  const toggleFav = useCallback(item => setFavs(f => { if (f[item.id]) { const { [item.id]: _, ...rest } = f; return rest; } const { suggestRemove, ...keep } = item; return { ...f, [item.id]: { ...keep, at: Date.now() } }; }), []);

  if (phase === 'boot') return <div className="app" />;
  const openVideo = id => { store.set(K('video'), id); setMode('videos'); };   // from the gallery straight into the editor
  const openFolder = dir => { setGalleryFolder(dir); setMode('gallery'); };   // a folder heading in the peek panel -> everything in that folder
  const goHome = () => navigate('/');
  const shared = { root, mode, setMode, favs, toggleFav, pad, changeFolder, goHome, launch, clearLaunch: () => setLaunch(null), peek, openVideo, openFolder, galleryFolder, setGalleryFolder, rots, turn };
  const page = { saved, error, opened: !!root, onPick: pick, onReconnect: reconnect, onDemo: openDemo, onContinue: () => resume(false) };
  const app = el => root ? el : <Navigate to="/" replace />;   // a mode's address without an open library leads home
  return (
    <Routes>
      <Route path="/" element={<Home {...page} />} />
      <Route path="/setup" element={<Setup {...page} />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/look-alikes/*" element={app(<LookAlikes {...shared} />)} />
      <Route path="/videos/*" element={app(<Videos {...shared} />)} />
      <Route path="/gallery/*" element={app(<Gallery {...shared} />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
