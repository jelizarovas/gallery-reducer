// Shell: opens the library folder, holds what every mode shares (mode, favorites, controller state).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG, CONFIG_FILE, DEMO, K } from './config.js';
import * as lib from './lib/library.js';
import { buildDemo } from './lib/demo.js';
import { store } from './lib/progress.js';
import { useGamepadStore } from './gamepad/gamepadStore.js';
import { Icon } from './ui.jsx';
import LookAlikes from './LookAlikes.jsx';
import Videos from './Videos.jsx';
import Gallery from './Gallery.jsx';

function Connect({ saved, error, onPick, onReconnect, onDemo }) {
  const supported = 'showDirectoryPicker' in window;
  return (
    <div className="connect"><div className="panel">
      <h1>Gallery Reducer</h1>
      <p>Go through look-alike photos and video recordings a little at a time: keep the best, trim videos down, star the ones worth printing. Everything stays on this computer: the page reads your folder directly, nothing is uploaded, and rejected files are moved to a trash folder, never deleted.</p>
      {supported
        ? <p>Choose your library folder: the one you gave to <code>setup.cmd</code>, which holds both your photos and Immich’s data. Your progress is saved in this browser, so you can stop and come back any time. First time here? See the setup steps in the README, or try the demo.</p>
        : <p className="err">This browser can't open local folders. Use Chrome or Edge on a computer, or try the demo.</p>}
      {error && <p className="err">{error}</p>}
      <div className="row">
        {saved && supported && <button className="filled" onClick={onReconnect}><Icon n="folder_open" /> Reopen “{saved.name}”</button>}
        {supported && <button className={saved ? 'outlined' : 'filled'} onClick={onPick}><Icon n="folder" /> Choose folder</button>}
        <button onClick={onDemo}><Icon n="play_circle" /> Try the demo</button>
      </div>
    </div></div>
  );
}

export default function App() {
  const [root, setRoot] = useState(null), [saved, setSaved] = useState(null), [phase, setPhase] = useState('boot'), [error, setError] = useState('');
  const [mode, setMode] = useState(() => store.get(K('mode'), 'photos')), [favs, setFavs] = useState(() => store.get(K('favorites'), {}));
  const [peekState, setPeekState] = useState(() => ({ open: false, width: 256, view: 'list', ...store.get('peek', {}) }));
  const [galleryFolder, setGalleryFolder] = useState(() => store.get(K('galleryFolder'), ''));
  const [rots, setRots] = useState(() => store.get(K('rotations'), {}));   // how each item is turned for viewing: id -> degrees clockwise
  const booted = useRef(false);
  const pad = useGamepadStore(s => s.users.some(u => u.connected && u.supported));
  useEffect(() => store.set(K('mode'), mode), [mode]);
  useEffect(() => store.set(K('favorites'), favs), [favs]);
  useEffect(() => store.set('peek', peekState), [peekState]);
  useEffect(() => store.set(K('rotations'), rots), [rots]);
  const turn = useCallback(id => setRots(r => { const d = ((r[id] || 0) + 90) % 360, { [id]: _, ...rest } = r; return d ? { ...rest, [id]: d } : rest; }), []);
  useEffect(() => store.set(K('galleryFolder'), galleryFolder), [galleryFolder]);
  const peek = { ...peekState, set: patch => setPeekState(p => ({ ...p, ...patch })) };
  // Alt+L shows / hides the quick peek panel, Alt+V switches it between list and grid (same keys as games-reducer)
  useEffect(() => { const on = e => { if (!e.altKey || e.ctrlKey || e.metaKey) return; const k = e.key.toLowerCase(); if (k === 'l') { e.preventDefault(); setPeekState(p => ({ ...p, open: !p.open })); } else if (k === 'v') { e.preventDefault(); setPeekState(p => ({ ...p, view: p.view === 'grid' ? 'list' : 'grid' })); } }; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, []);

  const open = useCallback(async h => {
    setError('');
    try { if (await lib.exists(h, CONFIG_FILE)) Object.assign(CONFIG, await lib.readJson(h, CONFIG_FILE)); } catch { /* unreadable settings: fall back to the defaults */ }
    if ((await lib.exists(h, CONFIG.groups)) || (await lib.exists(h, CONFIG.videos)) || (await lib.exists(h, CONFIG.library))) { setRoot(h); setPhase('review'); }
    else { setError(`“${h.name}” has not been set up for Gallery Reducer. Run setup.cmd (in the app’s tools folder) and choose the same folder you gave it.`); setPhase('connect'); }
  }, []);
  const openDemo = useCallback(async () => { if (!DEMO) { location.search = '?demo'; return; } open(await buildDemo()); }, [open]);
  useEffect(() => {
    if (booted.current) return; booted.current = true;
    (async () => {
      if (DEMO) return openDemo();
      const h = await lib.loadRoot();
      if (h) { setSaved(h); if (await lib.hasPermission(h, false)) return open(h); }
      setPhase('connect');
    })();
  }, [open, openDemo]);
  const pick = async () => { setError('Waiting for the folder window… If none appears, this browser can’t show it: open this page in Chrome or Edge instead.'); try { const h = await window.showDirectoryPicker({ id: 'gallery-reducer', mode: 'readwrite' }); await lib.saveRoot(h); setSaved(h); open(h); } catch (e) { setError(e.name === 'AbortError' ? '' : e.message); } };
  const reconnect = async () => { if (await lib.hasPermission(saved, true)) open(saved); else setError('Access to the folder was not granted.'); };
  const changeFolder = async () => { await lib.clearRoot(); setSaved(null); setRoot(null); setPhase('connect'); };

  // a favorite remembers enough about the file to show it later without the group it came from
  const toggleFav = useCallback(item => setFavs(f => { if (f[item.id]) { const { [item.id]: _, ...rest } = f; return rest; } const { suggestRemove, ...keep } = item; return { ...f, [item.id]: { ...keep, at: Date.now() } }; }), []);

  if (phase === 'boot') return <div className="app" />;
  if (phase === 'connect' || !root) return <div className="app"><Connect saved={saved} error={error} onPick={pick} onReconnect={reconnect} onDemo={openDemo} /></div>;
  const openVideo = id => { store.set(K('video'), id); setMode('videos'); };   // from the gallery straight into the editor
  const openFolder = dir => { setGalleryFolder(dir); setMode('gallery'); };   // a folder heading in the peek panel -> everything in that folder
  const shared = { root, mode, setMode, favs, toggleFav, pad, changeFolder, peek, openVideo, openFolder, galleryFolder, setGalleryFolder, rots, turn };
  return mode === 'videos' ? <Videos {...shared} /> : mode === 'gallery' || mode === 'favorites' ? <Gallery {...shared} /> : <LookAlikes {...shared} />;
}
