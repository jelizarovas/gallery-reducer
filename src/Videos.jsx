// Videos: one recording at a time. Scrub or wind through it, mark the parts worth keeping (one slice or several),
// then keep / trash / defer. Cuts are only recorded here (video-trims.json in the data folder);
// tools/apply-trims.ps1 performs them with ffmpeg and joins several slices into one video.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, DEMO, K } from './config.js';
import * as lib from './lib/library.js';
import { store, fmt, parts } from './lib/progress.js';
import { Icon, Hint, Dialog, Meta, ModeSwitch, PadChip, PeekButton, Peek, Drop, Choice, useInput, useFileUrl, csv, clock } from './ui.jsx';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8];
const TILES = [['open', 'Open'], ['trim', 'To cut'], ['keep', 'Kept'], ['trash', 'Trashed'], ['later', 'Later'], ['all', 'All']];
const STATUS = { keep: ['keep', 'check', 'KEEP'], trim: ['keep', 'content_cut', 'CUT'], trash: ['drop', 'delete', 'TRASHED'] };
const PEEK_ICON = { keep: 'check', trim: 'content_cut', trash: 'delete', later: 'schedule' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SORTS = {
  size: ['Largest first', (a, b) => b.bytes - a.bytes], sizeAsc: ['Smallest first', (a, b) => a.bytes - b.bytes],
  newest: ['Newest first', (a, b) => (b.taken || '').localeCompare(a.taken || '')], oldest: ['Oldest first', (a, b) => (a.taken || '9').localeCompare(b.taken || '9')],
  longest: ['Longest first', (a, b) => b.seconds - a.seconds], shortest: ['Shortest first', (a, b) => a.seconds - b.seconds],
  name: ['Name', (a, b) => a.path.slice(a.path.lastIndexOf('/') + 1).localeCompare(b.path.slice(b.path.lastIndexOf('/') + 1))],
};
const SIZE_BUCKETS = [[2 ** 30, 'Over 1 GB'], [500 * 2 ** 20, '500 MB – 1 GB'], [100 * 2 ** 20, '100 – 500 MB'], [0, 'Under 100 MB']];
// group: [menu label, sort key (ascending), heading]
const GROUPS = {
  none: ['No grouping'],
  year: ['Year', v => v.taken ? -v.taken.slice(0, 4) : 1, v => v.taken ? v.taken.slice(0, 4) : 'No date'],
  month: ['Month', v => v.taken ? -(v.taken.slice(0, 4) + v.taken.slice(5, 7)) : 1, v => v.taken ? `${MONTHS[+v.taken.slice(5, 7) - 1]} ${v.taken.slice(0, 4)}` : 'No date'],
  folder: ['Folder', v => parts(v, CONFIG.photosPrefix).dir.toLowerCase(), v => parts(v, CONFIG.photosPrefix).dir],
  size: ['Size', v => SIZE_BUCKETS.findIndex(b => v.bytes >= b[0]), v => SIZE_BUCKETS.find(b => v.bytes >= b[0])[1]],
  quality: ['Quality', v => QUALITY.indexOf(qualityOf(v)), v => qualityOf(v)[1]],
  orient: ['Vertical / horizontal', v => orientOf(v), v => orientOf(v)],
};
const QUALITY = [[2160, '4K'], [1080, 'Full HD (1080p)'], [720, 'HD (720p)'], [1, 'SD (below 720p)'], [0, 'Unknown']];
const qualityOf = v => QUALITY.find(q => Math.min(v.w, v.h) >= q[0]);   // by the short side, so vertical videos rate the same
const orientOf = v => !v.w || !v.h ? 'Unknown' : v.h > v.w ? 'Vertical' : v.w > v.h ? 'Horizontal' : 'Square';
const MIN_SIZES = [[0, 'Any size'], [100, 'Over 100 MB'], [500, 'Over 500 MB'], [1024, 'Over 1 GB']];
export const thumbOf = it => [it.type === 'VIDEO' ? `${CONFIG.videoThumbs}/${it.id}.jpg` : null, it.preview?.replace(/_preview\.\w+$/, '_thumbnail.webp'), it.preview];
// sorted, merged list of kept slices
const addSeg = (segs, s, e) => { const all = [...segs, { s, e }].sort((x, y) => x.s - y.s), out = []; for (const g of all) { const l = out[out.length - 1]; if (l && g.s <= l.e + 0.05) l.e = Math.max(l.e, g.e); else out.push({ ...g }); } return out; };

export default function Videos({ root, mode, setMode, favs, toggleFav, pad, changeFolder, peek, openFolder, rots, turn }) {
  const [phase, setPhase] = useState('loading'), [error, setError] = useState('');
  const [data, setData] = useState([]), [curId, setCurId] = useState(() => store.get(K('video'), null));
  const [vdec, setVdec] = useState(() => store.get(K('videoDecisions'), {})), [deferred, setDeferred] = useState(() => store.get(K('videoDeferred'), []));
  const [filter, setFilter] = useState(() => store.get(K('videoFilter'), 'open'));
  const [view, setViewState] = useState(() => ({ sort: 'size', group: 'none', minMB: 0, year: 'all', quality: 'all', orient: 'all', ...store.get(K('videoView'), {}) }));
  const [autoplay, setAutoplay] = useState(() => store.get('autoplay', true)), [info, setInfo] = useState(() => store.get('videoInfo', false));
  const [url, setUrl] = useState(null), [poster, setPoster] = useState(null);
  const [time, setTime] = useState(0), [dur, setDur] = useState(0), [segs, setSegs] = useState([]), [inP, setInP] = useState(null), [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(() => store.get('muted', false)), [noAudio, setNoAudio] = useState(false), [cutsOnly, setCutsOnly] = useState(true);
  const [zoom, setZoom] = useState(1), [origin, setOrigin] = useState({ x: 50, y: 50 }), [wind, setWind] = useState(0), [pop, setPop] = useState(null);
  const [msg, setMsg] = useState({ text: '', err: false }), [dialog, setDialog] = useState(null), [menu, setMenu] = useState(false), [busy, setBusy] = useState(false), [scrub, setScrub] = useState(false);
  const [box, setBox] = useState({ w: 800, h: 450 }), [saveTurn, setSaveTurn] = useState(() => store.get('saveTurn', false)), [explorer] = useState(false);
  const stageRef = useRef(null);
  const [loop, setLoop] = useState(() => store.get('loop', true)), [speeds, setSpeeds] = useState(() => store.get(K('speeds'), {})); const speedRef = useRef(1); const dragRef = useRef(null);
  const [fs, setFs] = useState(false), [infoHover, setInfoHover] = useState(false);
  const fsRef = useRef(null), tiltRef = useRef(null), vref = useRef(null), pv = useRef(null), tl = useRef(null), act = useRef({}), winder = useRef(null), autoFor = useRef(null), stickScrub = useRef(null), pvWant = useRef(null);

  useEffect(() => store.set(K('videoDecisions'), vdec), [vdec]);
  useEffect(() => store.set(K('videoDeferred'), deferred), [deferred]);
  useEffect(() => store.set(K('videoFilter'), filter), [filter]);
  useEffect(() => store.set(K('videoView'), view), [view]);
  useEffect(() => store.set('muted', muted), [muted]);
  useEffect(() => store.set('autoplay', autoplay), [autoplay]);
  useEffect(() => store.set('videoInfo', info), [info]);
  useEffect(() => store.set('loop', loop), [loop]);
  useEffect(() => store.set(K('speeds'), speeds), [speeds]);
  useEffect(() => store.set('saveTurn', saveTurn), [saveTurn]);
  const setView = patch => setViewState(v => ({ ...v, ...patch }));

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const all = await lib.readJson(root, CONFIG.videos); let dec = store.get(K('videoDecisions'), {});
        for (const [id, x] of Object.entries(dec)) if (x.action === 'trim' && !x.segs) dec = { ...dec, [id]: { ...x, segs: [{ s: x.in, e: x.out }] } };   // older single-cut records
        // cuts the script has already applied are no longer in the trims file
        if (await lib.exists(root, CONFIG.trims)) { const waiting = new Set((await lib.readJson(root, CONFIG.trims)).map(t => t.id)); for (const [id, x] of Object.entries(dec)) if (x.action === 'trim' && !x.applied && !waiting.has(id)) dec = { ...dec, [id]: { ...x, applied: true } }; }
        if (dead) return;
        setVdec(dec); setData(all); setPhase('review');
      } catch { if (!dead) { setError(`No video list found (${CONFIG.videos}).`); setPhase('error'); } }
    })();
    return () => { dead = true; };
  }, [root]);

  // the queue: filtered and sorted as chosen in the peek panel's menu, deferred videos last
  const years = useMemo(() => [...new Set(data.map(v => (v.taken || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [data]);
  const list = useMemo(() => {
    const ds = new Set(deferred), g = GROUPS[view.group] || GROUPS.none, cmp = (SORTS[view.sort] || SORTS.size)[1];
    const a = data.filter(v => v.bytes >= view.minMB * 2 ** 20 && (view.year === 'all' || (v.taken || '').slice(0, 4) === view.year) && (view.quality === 'all' || qualityOf(v)[1] === view.quality) && (view.orient === 'all' || orientOf(v) === view.orient));
    a.sort((x, y) => { if (g[1]) { const kx = g[1](x), ky = g[1](y); if (kx !== ky) return kx < ky ? -1 : 1; } return cmp(x, y); });
    return [...a.filter(v => !ds.has(v.id)), ...deferred.map(id => a.find(v => v.id === id)).filter(Boolean)];
  }, [data, deferred, view]);
  const idx = useMemo(() => { const i = list.findIndex(v => v.id === curId); return i < 0 ? Math.max(0, list.findIndex(v => !vdec[v.id])) : i; }, [list, curId]); // eslint-disable-line
  const goTo = i => { if (list[i]) { setCurId(list[i].id); flash(''); } };

  const cur = list[idx], d = cur && vdec[cur.id], defSet = useMemo(() => new Set(deferred), [deferred]);
  const rot = cur ? rots[cur.id] || 0 : 0;   // quarter turns clockwise, for viewing
  const speed = cur ? speeds[cur.id] || 1 : 1; speedRef.current = speed;
  const setSpeed = s => { if (cur) setSpeeds(m => { const { [cur.id]: _, ...rest } = m; return s === 1 ? rest : { ...rest, [cur.id]: s }; }); };
  const stepSpeed = dir => { const i = SPEEDS.indexOf(speed), n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))]; setSpeed(n); flash(`Speed ${n}×`); };
  const status = (v, dec = vdec, ds = defSet) => dec[v.id]?.action || (ds.has(v.id) ? 'later' : 'open');
  const matchV = (v, f, dec = vdec, ds = defSet) => { const s = status(v, dec, ds); return f === 'all' || (f === 'open' ? s === 'open' || s === 'later' : s === f); };
  const find = (from, dir, strict, dec = vdec, ds = defSet) => { const f = strict ? filter : filter === 'open' ? 'all' : filter; for (let i = from + dir; i >= 0 && i < list.length; i += dir) if (matchV(list[i], f, dec, ds)) return i; return -1; };
  const counts = useMemo(() => { const c = { open: 0, trim: 0, keep: 0, trash: 0, later: 0, all: list.length }; for (const v of list) { const s = status(v); c[s]++; if (s === 'later') c.open++; } return c; }, [list, vdec, defSet]); // eslint-disable-line
  const pendingOf = dec => data.filter(v => dec[v.id]?.action === 'trim' && !dec[v.id].applied).map(v => { const x = dec[v.id]; return { id: v.id, path: v.path, segments: x.segs.map(g => ({ start: +g.s.toFixed(2), end: +g.e.toFixed(2) })), duration: +x.dur.toFixed(2), bytes: v.bytes, removeAudio: !!x.noAudio, rotate: x.rot || 0 }; });
  const writeTrims = async dec => { try { await lib.writeText(root, CONFIG.trims, JSON.stringify(pendingOf(dec), null, 1)); } catch { /* shown as pending again next time */ } };
  const pending = useMemo(() => pendingOf(vdec), [data, vdec]); // eslint-disable-line
  const pendingBytes = pending.reduce((a, t) => a + t.bytes * (1 - t.segments.reduce((s, g) => s + g.end - g.start, 0) / (t.duration || 1)), 0);
  const peekItems = useMemo(() => { const g = GROUPS[view.group] || GROUPS.none; return list.map(v => { const s = status(v); return { id: v.id, paths: thumbOf(v), title: parts(v, CONFIG.photosPrefix).file, sub: `${clock(v.seconds)} · ${fmt(v.bytes)}`, badge: v.seconds ? clock(v.seconds) : '', video: v.video, seconds: v.seconds, icon: PEEK_ICON[s], tone: s === 'trash' ? 'gone' : s === 'open' ? '' : 'done', group: g[2] ? (s === 'later' ? 'Deferred' : g[2](v)) : undefined }; }); }, [list, vdec, defSet, view.group]); // eslint-disable-line
  const flash = (text, err = false) => setMsg({ text, err });

  useFileUrl(root, cur && [cur.video, d?.moved?.[0]?.to], setUrl);
  useFileUrl(root, cur && [cur.preview], setPoster);
  useEffect(() => { if (!cur) return; store.set(K('video'), cur.id); if (curId !== cur.id) setCurId(cur.id); stopWind(); autoFor.current = cur.id; setTime(0); setDur(d?.dur || cur.seconds || 0); setPlaying(false); setSegs(d?.action === 'trim' ? d.segs : []); setInP(null); setNoAudio(!!d?.noAudio); setZoom(1); setPop(null); }, [cur?.id, d?.at]); // eslint-disable-line
  useEffect(() => { const el = vref.current; if (el) el.muted = muted || wind !== 0; }, [muted, wind, url]);
  useEffect(() => { const el = vref.current; if (el && !winder.current) { el.defaultPlaybackRate = speed; el.playbackRate = speed; } }, [speed, url, cur?.id]);

  // what would be kept right now: finished slices, plus an open start mark running to the end
  const final = inP != null ? addSeg(segs, inP, dur) : segs, keptLen = final.reduce((a, g) => a + g.e - g.s, 0);
  const isCut = final.length > 0 && !(final.length === 1 && final[0].s < 0.25 && final[0].e > dur - 0.25), saved = dur && isCut ? cur?.bytes * (1 - keptLen / dur) : 0;
  const v = () => vref.current;
  const seekTo = t => { const el = v(); if (!el || !dur) return; el.currentTime = Math.max(0, Math.min(dur - 0.05, t)); setTime(el.currentTime); };
  const nextKept = t => final.find(g => t < g.e - 0.05);                           // slice at or after t
  const play = () => { const el = v(); if (!el || !url) return; if (cutsOnly && final.length) { const g = nextKept(el.currentTime) || final[0]; if (el.currentTime < g.s) el.currentTime = g.s; } el.play().catch(() => {}); };
  const togglePlay = () => { const el = v(); if (!el || !url) return; if (el.paused) play(); else el.pause(); };
  // stepping with keys or the stick pauses while you scrub and carries on playing when you let go
  const seek = dlt => { const el = v(); if (!el) return; const s = stickScrub.current || (stickScrub.current = { resume: !el.paused }); clearTimeout(s.timer); if (!el.paused) el.pause(); seekTo(el.currentTime + dlt); s.timer = setTimeout(() => { stickScrub.current = null; if (s.resume) v()?.play().catch(() => {}); }, 450); };
  const setIn = () => { if (d || !dur) return; setInP(v()?.currentTime || 0); flash('Slice started. Press Slice again where it ends.'); };
  const setOut = () => { if (d || !dur) return; const t = v()?.currentTime || 0, s = inP ?? (segs.length ? null : 0); if (s == null) return flash('Mark a start first.', true); if (t - s < 0.3) return flash('The end has to be after the start.', true); setSegs(addSeg(segs, s, t)); setInP(null); flash(''); };
  const slice = () => { if (inP == null) setIn(); else setOut(); };
  const dropLast = () => { if (d) return false; if (inP != null) { setInP(null); return true; } if (segs.length) { setSegs(segs.slice(0, -1)); return true; } return false; };
  const clearCuts = () => { if (d) return; setSegs([]); setInP(null); flash(''); };
  const onTime = () => {   // with "cuts only" on, playback skips everything outside the kept slices and loops
    const el = v(); if (!el) return; const t = el.currentTime;
    if (cutsOnly && final.length && !el.paused && !scrub && !winder.current) { const g = final.find(x => t >= x.s - 0.05 && t < x.e); if (!g) { const nx = final.find(x => x.s > t); if (nx) el.currentTime = nx.s; else if (loop) el.currentTime = final[0].s; else { el.pause(); el.currentTime = final[final.length - 1].e; } } }
    setTime(el.currentTime);
  };
  const onLoaded = e => { const el = e.target; el.defaultPlaybackRate = speed; el.playbackRate = speed; if (isFinite(el.duration)) setDur(el.duration); if (autoplay && !d && autoFor.current === cur.id) { autoFor.current = null; el.play().catch(() => {}); } };

  // timeline: hovering or dragging shows a small preview of that moment; letting go of a drag jumps there and plays
  const timeAt = e => { const r = tl.current.getBoundingClientRect(), x = Math.max(0, Math.min(r.width, e.clientX - r.left)); return { x, t: dur * x / r.width }; };
  const pvSeek = tm => { const el = pv.current; if (!el) return; if (el.seeking) pvWant.current = tm; else { pvWant.current = null; el.currentTime = tm; } };
  const peekAt = e => { if (!dur) return; const p = timeAt(e); setPop(p); pvSeek(p.t); };
  const trackDown = e => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture: dragging still works inside the bar */ }
    const edge = e.target.dataset?.edge, i = +e.target.dataset?.seg;
    if (edge && !d && inP == null && segs[i]) { dragRef.current = { edge, i, x0: e.clientX, orig: { ...segs[i] }, moved: false }; return; }
    v()?.pause(); setScrub(true); peekAt(e);
  };
  const trackMove = e => {
    const g = dragRef.current; if (!g) return peekAt(e);
    const r = tl.current.getBoundingClientRect(), dx = e.clientX - g.x0; if (!g.moved && Math.abs(dx) < 4) return; g.moved = true; v()?.pause();
    const dt = dur * dx / r.width, lo = g.i > 0 ? segs[g.i - 1].e + 0.05 : 0, hi = g.i < segs.length - 1 ? segs[g.i + 1].s - 0.05 : dur; let { s, e: en } = g.orig;
    if (g.edge === 'l') s = Math.max(lo, Math.min(en - 0.3, s + dt)); else if (g.edge === 'r') en = Math.min(hi, Math.max(s + 0.3, en + dt)); else { const len = en - s; s = Math.max(lo, Math.min(hi - len, s + dt)); en = s + len; }
    setSegs(segs.map((x, n) => n === g.i ? { s, e: en } : x)); const show = g.edge === 'r' ? en : s; setPop({ x: r.width * show / dur, t: show }); pvSeek(show);   // the preview shows the edge being moved
  };
  const trackUp = e => {
    const g = dragRef.current; if (!g) return scrubEnd(); dragRef.current = null; setPop(null);
    if (!g.moved) { const p = timeAt(e); seekTo(p.t); v()?.play().catch(() => {}); return; }   // a plain click on a slice: jump there and play
    seekTo(g.edge === 'r' ? segs[g.i].e : segs[g.i].s);
  };
  const scrubEnd = () => { if (!scrub) return; setScrub(false); if (pop) { seekTo(pop.t); v()?.play().catch(() => {}); } setPop(null); };

  // hold to wind: forward plays at 4x, then 8x and 16x the longer it is held; backward steps the same way
  function startWind(dir) {
    const el = v(); if (!el || !url || winder.current) return; const w = { dir, t0: performance.now(), wasPaused: el.paused }; winder.current = w; setWind(dir);
    const rate = () => { const held = performance.now() - w.t0, r = held > 3000 ? 16 : held > 1500 ? 8 : 4; return Math.min(16, Math.max(r, speedRef.current * 2)); };   // always faster than the chosen playback speed
    if (dir > 0) { el.playbackRate = rate(); el.play().catch(() => {}); w.timer = setInterval(() => { try { el.playbackRate = rate(); } catch { /* rate not supported */ } }, 250); }
    else { el.pause(); w.timer = setInterval(() => { el.currentTime = Math.max(0, el.currentTime - rate() * 0.1); setTime(el.currentTime); }, 100); }
  }
  function stopWind() { const w = winder.current; if (!w) return; clearInterval(w.timer); winder.current = null; setWind(0); const el = v(); if (el) { el.playbackRate = speedRef.current; if (w.wasPaused) el.pause(); else el.play().catch(() => {}); } }
  useEffect(() => () => { stopWind(); clearTimeout(stickScrub.current?.timer); }, []); // eslint-disable-line

  // fullscreen covers the video, its timeline and the buttons on it
  useEffect(() => { const on = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else fsRef.current?.requestFullscreen?.().catch(() => {}); };
  useEffect(() => { const el = stageRef.current; if (!el) return; const on = () => setBox({ w: el.clientWidth, h: el.clientHeight }); on(); const ro = new ResizeObserver(on); ro.observe(el); return () => ro.disconnect(); }, [phase, cur?.id]);
  const rotate = () => { if (cur) turn(cur.id); };
  const reveal = async () => {
    if (explorer) { const f = document.createElement('iframe'); f.style.display = 'none'; f.src = 'gallery-reducer-open:' + encodeURIComponent(cur.path); document.body.appendChild(f); setTimeout(() => f.remove(), 3000); return flash('Opening the folder in Explorer…'); }
    const full = `${CONFIG.rootPath || root.name}\\${cur.path.slice(0, cur.path.lastIndexOf('/')).replaceAll('/', '\\')}`;
    try { await navigator.clipboard.writeText(full); flash('Folder path copied. Paste it into Explorer’s address bar.'); } catch { flash(full); }
  };
  const snapshot = () => {
    const el = v(); if (!el || !el.videoWidth) return flash('No picture to save yet.', true);
    const side = rot % 180 === 90, c = document.createElement('canvas'); c.width = side ? el.videoHeight : el.videoWidth; c.height = side ? el.videoWidth : el.videoHeight;
    const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(el, -el.videoWidth / 2, -el.videoHeight / 2);
    const tm = el.currentTime, stamp = `${String(Math.floor(tm / 60)).padStart(2, '0')}m${String(Math.floor(tm % 60)).padStart(2, '0')}s${String(Math.floor(tm % 1 * 100)).padStart(2, '0')}`;
    const name = `${parts(cur, CONFIG.photosPrefix).file.replace(/\.[^.]+$/, '')}_${stamp}.jpg`;
    c.toBlob(b => { if (!b) return flash('Could not save the frame.', true); const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); flash(`Saved ${name} (${c.width}×${c.height}) to your Downloads.`); }, 'image/jpeg', 0.95);
  };
  const toggleZoom = () => setZoom(z => z > 1 ? 1 : 2.5);
  const pan = (dx, dy) => setOrigin(o => ({ x: Math.max(0, Math.min(100, o.x + dx)), y: Math.max(0, Math.min(100, o.y + dy)) }));

  const log = async (...row) => { try { await lib.appendLine(root, CONFIG.log, 'Time,Action,From,To,KeptCopies,Group', [new Date().toISOString(), ...row].map(csv).join(',')); } catch { /* best-effort */ } };
  const go = (dir, strict = false) => { const i = find(idx, dir, strict); if (i >= 0) goTo(i); };
  const pickFilter = f => { setFilter(f); if (!cur || !matchV(cur, f)) { const i = list.findIndex(x => matchV(x, f)); if (i < 0) return flash('No videos in that view yet.'); goTo(i); } flash(''); };
  const finish = async dec => { setVdec(dec); await writeTrims(dec); const next = find(idx, 1, true, dec); if (next >= 0) setCurId(list[next].id); };
  const keep = async () => {
    if (!cur || d || busy) return; stopWind(); v()?.pause();
    const turnSave = saveTurn ? rot : 0, cut = isCut || noAudio || turnSave, rec = cut ? { action: 'trim', segs: isCut ? final : [{ s: 0, e: dur }], noAudio, rot: turnSave, dur, at: Date.now() } : { action: 'keep', at: Date.now() };
    await finish({ ...vdec, [cur.id]: rec });
    flash(isCut ? `Cut noted: keeping ${clock(keptLen)} of ${clock(dur)} in ${final.length} slice${final.length === 1 ? '' : 's'}.` : turnSave ? `Noted: turn ${turnSave}° clockwise in the file.` : noAudio ? 'Noted: save without sound.' : '');
  };
  const trash = async () => {
    if (!cur || d || busy) return; setBusy(true); stopWind(); v()?.pause(); setUrl(null); const moved = []; let failed = '';
    await new Promise(r => setTimeout(r, 150));   // let the player let go of the file before it is moved
    try {
      const dest = `${CONFIG.videoTrash}/${cur.path.startsWith(CONFIG.photosPrefix) ? cur.path.slice(CONFIG.photosPrefix.length) : cur.path}`;
      const to = await lib.moveFile(root, cur.path, dest); moved.push({ id: cur.id, from: cur.path, to, bytes: cur.bytes }); await log('moved', cur.path, to, '', 'video');
      if (await lib.exists(root, cur.path + '.xmp')) { const sto = await lib.moveFile(root, cur.path + '.xmp', dest + '.xmp'); moved.push({ id: null, from: cur.path + '.xmp', to: sto, bytes: 0 }); await log('moved', cur.path + '.xmp', sto, '', 'video'); }
    } catch (e) { failed = e.message; }
    setBusy(false); if (!moved.length) return flash(failed || 'Could not move the file.', true);
    await finish({ ...vdec, [cur.id]: { action: 'trash', moved, at: Date.now() } }); flash(failed, !!failed);
  };
  const undo = async () => {
    if (!cur || busy) return; if (!d) { if (dropLast()) flash('Removed the last mark.'); return; }
    if (d.applied) return flash('This cut has already been applied; the original is in trash/video-trims.', true);
    setBusy(true); let failed = '';
    try { for (const m of [...(d.moved || [])].reverse()) if ((await lib.exists(root, m.to)) && !(await lib.exists(root, m.from))) { await lib.moveFile(root, m.to, m.from); await log('restored', m.to, m.from, '', 'video'); } } catch (e) { failed = e.message; }
    if (!failed) { const { [cur.id]: _, ...rest } = vdec; setVdec(rest); await writeTrims(rest); }
    setBusy(false); flash(failed || 'Undone.', !!failed);
  };
  const defer = () => {   // to the end of the line; the next video in the current view takes its place
    if (!cur || d) return; stopWind(); v()?.pause(); const ds = new Set([...deferred, cur.id]);
    let n = find(idx, 1, true, vdec, ds); if (n < 0) n = find(idx, -1, true, vdec, ds);
    setDeferred([...deferred.filter(x => x !== cur.id), cur.id]); if (n >= 0) setCurId(list[n].id); flash('Deferred to the end of the line.');
  };
  const closeAll = () => { setDialog(null); setMenu(false); };

  const live = () => phase === 'review' && cur && !dialog && !menu;
  act.current = {
    key(e) {
      if (e.altKey && e.key === 'Enter' && phase === 'review' && cur) { e.preventDefault(); return toggleFs(); }
      if (e.ctrlKey || e.altKey || e.metaKey || phase !== 'review' || !cur) return; const k = e.key.toLowerCase();
      if (e.key === '?') { e.preventDefault(); return setDialog(x => x ? null : 'keys'); }
      if (dialog || menu) { if (k === 'escape') closeAll(); return; }
      if (e.key === '<' || e.key === '>') return stepSpeed(e.key === '>' ? 1 : -1);
      if (k === 'l' || k === 'j') { if (!e.repeat) startWind(k === 'l' ? 1 : -1); return; }
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); seek((k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 10 : 1)); }
      else if (k === 'arrowup' || k === 'arrowdown') { e.preventDefault(); seek(k === 'arrowup' ? 10 : -10); }
      else if (k === 's') slice(); else if (k === 'i') setIn(); else if (k === 'o') setOut(); else if (k === 'backspace') dropLast(); else if (k === 'c') clearCuts();
      else if (k === 'g') snapshot(); else if (k === 'q') setLoop(l => !l); else if (k === 'r') rotate(); else if (k === 'm') setMuted(m => !m); else if (k === 'z') toggleZoom(); else if (k === 'p') setCutsOnly(c => !c);
      else if (k === 'y' || k === 'enter') keep(); else if (k === 't' || k === 'delete') trash(); else if (k === 'd') defer(); else if (k === 'u') undo();
      else if (k === 'f') toggleFav(cur); else if (k === '[' || k === 'pageup') go(-1); else if (k === ']' || k === 'pagedown') go(1);
    },
    keyUp(e) { const k = e.key.toLowerCase(); if (k === 'l' || k === 'j') stopWind(); },
    pad(button) {
      if (phase !== 'review' || !cur) return;
      if (button === 'Start') return setDialog(x => x ? null : 'keys');
      if (dialog || menu) { if (button === 'A' || button === 'B') closeAll(); return; }
      ({ A: togglePlay, LB: slice, RB: setOut, LT: () => startWind(-1), RT: () => startWind(1), X: keep, B: trash, Y: defer, Back: undo,
        LS: () => setMuted(m => !m), RS: toggleZoom, DPadLeft: () => go(-1), DPadRight: () => go(1), DPadUp: () => toggleFav(cur), DPadDown: () => setCutsOnly(c => !c),
        'Mod+DPadLeft': () => stepSpeed(-1), 'Mod+DPadRight': () => stepSpeed(1), 'Mod+DPadUp': rotate, 'Mod+DPadDown': () => setLoop(l => !l),
        'Mod+A': () => { seekTo(0); v()?.play().catch(() => {}); }, 'Mod+B': clearCuts, 'Mod+Y': () => peek.set({ open: !peek.open }), 'Mod+X': () => setInfo(i => !i), 'Mod+LS': () => setNoAudio(n => !n), 'Mod+RS': snapshot })[button]?.();
    },
    padUp(button) { if (button === 'LT' || button === 'RT') stopWind(); },
    move(direction, source) { if (live() && source !== 'dpad') seek({ Left: -2, Right: 2, Up: 30, Down: -30 }[direction]); },   // left stick; repeats while held
    stick({ x, y }) { if (live() && zoom > 1) pan(x * 1.6, y * 1.6); },                                                          // right stick pans the zoomed picture
    nav(dir) { if (phase === 'review') go(dir); },
    tilt(dir) { if (!live()) return; const now = performance.now(), s = tiltRef.current; if (!s || s.dir !== dir || now - s.last > 350) tiltRef.current = { dir, t0: now, last: now }; else s.last = now; seek(dir * Math.min(1, (1 / 30) * 2 ** ((now - tiltRef.current.t0) / 2500))); },                                                                                     // mouse wheel tilted left / right
    away() { setMenu(false); },
  };
  useInput(act);
  // a tilting (sideways) mouse wheel seeks back / forward; it keeps firing while held, so holding it scrubs
  useEffect(() => { const on = e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); act.current.tilt?.(e.deltaX > 0 ? 1 : -1); } }; window.addEventListener('wheel', on, { passive: false }); return () => window.removeEventListener('wheel', on); }, []);

  const filtered = view.minMB > 0 || view.year !== 'all' || view.quality !== 'all' || view.orient !== 'all';
  const activeFilters = (view.minMB > 0) + (view.year !== 'all') + (view.quality !== 'all') + (view.orient !== 'all');
  const filterLabel = [view.minMB > 0 && (MIN_SIZES.find(m => m[0] === view.minMB) || [])[1], view.quality !== 'all' && view.quality.replace(/ \(.*/, ''), view.orient !== 'all' && view.orient, view.year !== 'all' && view.year].filter(Boolean).join(' · ');
  const sortTools = (
    <><Drop icon="sort" label={(SORTS[view.sort] || SORTS.size)[0]} title="Sort the videos">
      <h4>Sort by</h4>{Object.entries(SORTS).map(([k, [l]]) => <Choice key={k} on={view.sort === k} onClick={() => setView({ sort: k })}>{l}</Choice>)}
    </Drop>
    <Drop icon="category" label={view.group === 'none' || !GROUPS[view.group] ? 'Group' : GROUPS[view.group][0]} title="Group the videos under headings" on={view.group !== 'none'}>
      <h4>Group by</h4>{Object.entries(GROUPS).map(([k, [l]]) => <Choice key={k} on={view.group === k} onClick={() => setView({ group: k })}>{l}</Choice>)}
    </Drop>
    <Drop icon="filter_alt" label={activeFilters ? filterLabel : 'Filter'} title="Show only some of the videos" on={activeFilters > 0}>
      {activeFilters > 0 && <button className="item" onClick={() => setView({ minMB: 0, year: 'all', quality: 'all', orient: 'all' })}><Icon n="filter_alt_off" />Clear all filters</button>}
      <h4>Size</h4>{MIN_SIZES.map(([mb, l]) => <Choice key={mb} on={view.minMB === mb} onClick={() => setView({ minMB: mb })}>{l}</Choice>)}
      <h4>Quality</h4><Choice on={view.quality === 'all'} onClick={() => setView({ quality: 'all' })}>Any quality</Choice>{QUALITY.slice(0, 4).map(([, l]) => <Choice key={l} on={view.quality === l} onClick={() => setView({ quality: l })}>{l}</Choice>)}
      <h4>Shape</h4>{[['all', 'Vertical and horizontal'], ['Vertical', 'Vertical only'], ['Horizontal', 'Horizontal only']].map(([k, l]) => <Choice key={k} on={view.orient === k} onClick={() => setView({ orient: k })}>{l}</Choice>)}
      <h4>Year</h4><Choice on={view.year === 'all'} onClick={() => setView({ year: 'all' })}>Any year</Choice>{years.map(y => <Choice key={y} on={view.year === y} onClick={() => setView({ year: y })}>{y}</Choice>)}
    </Drop></>
  );

  if (phase !== 'review' || !cur) return (
    <div className="app">
      <header><ModeSwitch mode={mode} setMode={setMode} favCount={Object.keys(favs).length} /></header>
      <div className="connect"><div className="panel"><h1>Videos</h1><p className={error ? 'err' : ''}>{error || (phase === 'loading' ? 'Loading the video list…' : filtered ? 'No videos match the filters.' : 'The video list is empty.')}</p>
        {filtered && phase === 'review' && <div className="row"><button className="tonal" onClick={() => setView({ minMB: 0, year: 'all', quality: 'all', orient: 'all' })}>Clear the filters</button></div>}</div></div>
    </div>
  );

  const side = rot % 180 === 90, ar0 = cur.w && cur.h ? cur.w / cur.h : 16 / 9, ar = side ? 1 / ar0 : ar0, popSize = ar >= 1 ? { width: 220, height: Math.round(220 / ar) } : { height: 200, width: Math.round(200 * ar) };   // no black bars beside a vertical video
  const nm = parts(cur, CONFIG.photosPrefix);
  // a video turned on its side is laid out with width and height swapped, then rotated about its centre
  const turned = (w, h) => !rot ? undefined : side ? { position: 'absolute', left: '50%', top: '50%', width: h, height: w, maxWidth: 'none', maxHeight: 'none', transform: `translate(-50%,-50%) rotate(${rot}deg)` } : { transform: 'rotate(180deg)' };
  const pct = t => (dur ? 100 * t / dur : 0) + '%', st = d && STATUS[d.action], fav = !!favs[cur.id], headAt = scrub && pop ? pop.t : time;
  return (
    <div className="app">
      <header>
        <PeekButton peek={peek} />
        <ModeSwitch mode={mode} setMode={setMode} favCount={Object.keys(favs).length} />
        <div className="seg nav">
          <button title="Previous video ([ · mouse back · D-pad left)" onClick={() => go(-1)}><Icon n="chevron_left" /></button>
          <span className="pos" title="Video"><span className="wide">Video&nbsp;</span>{(idx + 1).toLocaleString()}<span className="wide">&nbsp;of&nbsp;</span><span className="narrow">&nbsp;/&nbsp;</span>{list.length.toLocaleString()}</span>
          <button title="Next video (] · mouse forward · D-pad right)" onClick={() => go(1)}><Icon n="chevron_right" /></button>
        </div>
        <div className="seg">{TILES.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => pickFilter(k)}>{l}{k !== 'all' && <b>{counts[k].toLocaleString()}</b>}</button>)}</div>
        <span className="spacer" />
        <PadChip pad={pad} />
        <button className="tonal sm" title="Cuts waiting to be applied" onClick={() => setDialog('cuts')}><Icon n="content_cut" /> {pending.length}<span className="wide">&nbsp;to cut</span></button>
        <div className="menuwrap" onClick={e => e.stopPropagation()}>
          <button className="outlined sm" onClick={() => setMenu(m => !m)}><Icon n="tune" /><span className="wide">Options</span><Icon n="arrow_drop_down" /></button>
          {menu && <div className="menu">
            <label className="item"><input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} /> Play each video as it opens</label>
            <label className="item"><input type="checkbox" checked={saveTurn} onChange={e => setSaveTurn(e.target.checked)} /> Save the turn into the file when kept</label>
            <label className="item"><input type="checkbox" checked={noAudio} disabled={!!d} onChange={e => setNoAudio(e.target.checked)} /> Save this video without sound</label>
            <button className="item" onClick={() => { setMenu(false); setDialog('keys'); }}><Icon n="keyboard" /> Keys and controller <kbd>?</kbd></button>
            {!DEMO && <button className="item" onClick={changeFolder}><Icon n="folder_off" /> Change folder</button>}
          </div>}
        </div>
      </header>
      <div className="bar"><i style={{ width: 100 * (counts.all - counts.open) / Math.max(1, counts.all) + '%' }} /></div>

      <div className="body">
        <Peek root={root} peek={peek} items={peekItems} current={idx} onPick={i => { if (i === idx) { seekTo(0); v()?.play().catch(() => {}); } else goTo(i); }} tools={sortTools} onGroup={view.group === 'folder' ? openFolder : undefined} />
        <div className="col">
          <div className={`vwork${fs ? ' fs' : ''}`} ref={fsRef}>
            <div className={`stage${d?.action === 'trash' ? ' drop' : ''}${zoom > 1 ? ' zoomed' : ''}`} ref={stageRef} onClick={togglePlay} onDoubleClick={toggleFs}
              onMouseMove={e => { if (zoom > 1) { const r = e.currentTarget.getBoundingClientRect(); setOrigin({ x: 100 * (e.clientX - r.left) / r.width, y: 100 * (e.clientY - r.top) / r.height }); } }}
              onWheel={e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; const r = e.currentTarget.getBoundingClientRect(); setOrigin({ x: 100 * (e.clientX - r.left) / r.width, y: 100 * (e.clientY - r.top) / r.height }); setZoom(z => Math.max(1, Math.min(8, +(z * (e.deltaY < 0 ? 1.25 : 0.8)).toFixed(2)))); }}>
              <div className="zoomer" style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}>
                {url ? <video key={cur.id} ref={vref} style={turned(box.w, box.h)} loop={loop && !(cutsOnly && final.length)} src={url} poster={poster || undefined} preload="metadata" onLoadedData={onLoaded} onTimeUpdate={onTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
                  : poster ? <img src={poster} alt="" /> : null}
              </div>
              {!cur.video && <span className="note"><Icon n="videocam_off" /> This format can't play in the browser, but you can still keep, trash or defer it.</span>}
              {st && <span className={`badge ${st[0]}`}><Icon n={st[1]} />{st[2]}{d.applied ? ' · APPLIED' : ''}</span>}
              {wind !== 0 && <span className="badge wind"><Icon n={wind > 0 ? 'fast_forward' : 'fast_rewind'} />{wind > 0 ? 'FAST FORWARD' : 'REWIND'}</span>}
              <div className="vtop" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <button className="vbtn keep" disabled={!!d || busy} onClick={keep} title="Keep this video (with the slices, if any are marked)"><Icon n={isCut ? 'content_cut' : 'check'} /><span className="wide">{isCut ? `Keep ${final.length} slice${final.length === 1 ? '' : 's'}` : 'Keep'}</span><Hint k="Y" b="X" pad={pad} /></button>
                <button className="vbtn" disabled={!!d || busy} onClick={trash} title="Move this video to trash"><Icon n="delete" /><span className="wide">Trash</span><Hint k="T" b="B" pad={pad} /></button>
                <button className="vbtn" disabled={!!d || busy} onClick={defer} title="Defer: send to the end of the line"><Icon n="schedule" /><span className="wide">Defer</span><Hint k="D" b="Y" pad={pad} /></button>
                <button className="vbtn" disabled={busy || (!d && !segs.length && inP == null)} onClick={undo} title="Undo (the last mark, or the decision)"><Icon n="undo" /><span className="wide">Undo</span><Hint k="U" b="View" pad={pad} /></button>
                <span className="infowrap" onMouseEnter={() => setInfoHover(true)} onMouseLeave={() => setInfoHover(false)}>
                  <button className={`vbtn round${info ? ' on' : ''}`} title={info ? 'Details pinned open: click to unpin' : 'Details: hover to peek, click to pin'} onClick={() => setInfo(i => !i)}><Icon n="info" /></button>
                  {(info || infoHover) && <div className="infopop"><table><tbody>
                    <tr><td>File</td><td>{nm.file}</td></tr>
                    <tr><td>Folder</td><td>{nm.dir}</td></tr>
                    <tr><td>Taken</td><td>{cur.taken || 'no date'}</td></tr>
                    <tr><td>Length</td><td>{clock(dur)}</td></tr>
                    <tr><td>Size</td><td>{fmt(cur.bytes)}{dur ? ` · ${fmt(cur.bytes / dur * 60)} per minute` : ''}</td></tr>
                    <tr><td>Picture</td><td>{cur.w}×{cur.h} · {qualityOf(cur)[1]} · {orientOf(cur).toLowerCase()}</td></tr>
                    {d && <tr><td>Decision</td><td>{st[2].toLowerCase()}{d.applied ? ', applied' : ''}</td></tr>}
                  </tbody></table></div>}
                </span>
                <button className={`vbtn round${fav ? ' on star' : ''}`} title="Favorite (F · D-pad up)" onClick={() => toggleFav(cur)}><Icon n="star" /></button>
              </div>
              {url && !playing && wind === 0 && <span className="bigplay"><Icon n="play_arrow" /></span>}
              {zoom === 1 && !playing && <div className="namecard" onClick={e => e.stopPropagation()}><b>{nm.file}</b> <span className="in">in</span> <span className="dirlink" title={explorer ? 'Open this folder in Explorer' : 'Copy this folder’s path (to paste into Explorer)'} onClick={reveal}>{nm.dir}</span></div>}
              {isCut && !d && <span className="cutchip" title="Estimate, based on the share of the video being kept"><Icon n="content_cut" />Keeping {clock(keptLen)} of {clock(dur)} · frees about {fmt(saved)}</span>}
              {rot > 0 && saveTurn && !d && <span className="cutchip turn"><Icon n="rotate_90_degrees_cw" />will be turned {rot}°</span>}
              {noAudio && <span className="cutchip sound"><Icon n="volume_off" />no sound in result</span>}
              {msg.text && <span className={`toast${msg.err ? ' err' : ''}`}>{msg.text}</span>}
            </div>
            <div className="timeline">
              <button className="iconbtn play" disabled={!url} onClick={togglePlay} title={`${playing ? 'Pause' : 'Play'} (Space · A)`}><Icon n={playing ? 'pause' : 'play_arrow'} /></button>
              <span className="t">{clock(headAt)}</span>
              <div className={`track${scrub ? ' drag' : ''}`} ref={tl}
                onPointerDown={trackDown} onPointerMove={trackMove} onPointerUp={trackUp} onPointerCancel={trackUp} onPointerLeave={() => { if (!scrub) setPop(null); }}>
                <i className="rail" />
                {final.length === 0 && <i className="kept" style={{ left: 0, width: pct(headAt) }} />}
                {final.map((g, n) => <i key={n} className={`kept on${!d && inP == null ? ' edit' : ''}`} data-seg={n} data-edge="move" title={!d && inP == null ? 'Drag to slide this slice; drag its ends to resize it' : undefined} style={{ left: pct(g.s), width: pct(g.e - g.s) }} />)}
                {!d && inP == null && segs.map((g, n) => [<b key={'l' + n} className="grip" data-seg={n} data-edge="l" style={{ left: pct(g.s) }} />, <b key={'r' + n} className="grip" data-seg={n} data-edge="r" style={{ left: pct(g.e) }} />])}
                {inP != null && <i className="mark" style={{ left: pct(inP) }}><Icon n="first_page" /></i>}
                <i className="head" style={{ left: pct(headAt) }} />
                {url && <div className="scrubpop" style={{ left: pop ? pop.x : 0, display: pop ? 'block' : 'none', ...popSize }}><video ref={pv} style={turned(popSize.width, popSize.height)} src={url} muted preload="metadata" onSeeked={e => { if (pvWant.current != null) { const t = pvWant.current; pvWant.current = null; e.target.currentTime = t; } }} /><span>{clock(pop ? pop.t : 0)}</span></div>}
              </div>
              <span className="t">{clock(dur)}</span>
              <button className={`outlined slicebtn${inP != null ? ' open' : ''}`} disabled={!!d || !url} onClick={slice} title={inP != null ? 'End the slice here (S · LB)' : 'Start a slice here (S · LB). Press again where it ends; repeat for more slices.'}><Icon n="content_cut" /><span>{inP != null ? 'End slice' : 'Slice'}</span><Hint k="S" b="LB" pad={pad} /></button>
              <button className={`iconbtn${cutsOnly ? ' on' : ''}`} title={`Play only the kept slices: ${cutsOnly ? 'on' : 'off'} (P · D-pad down)`} onClick={() => setCutsOnly(c => !c)}><Icon n="playlist_play" /></button>
              <button className="iconbtn" disabled={!url} title="Save this frame as a picture (G). It goes to your Downloads folder." onClick={snapshot}><Icon n="photo_camera" /></button>
              <Drop icon="speed" label={speed === 1 ? '' : `${speed}×`} title="Playback speed (< slower, > faster). Remembered for this video." align="up" on={speed !== 1}>
                <h4>Playback speed</h4>{SPEEDS.map(s => <Choice key={s} on={speed === s} onClick={() => setSpeed(s)}>{s === 1 ? 'Normal (1×)' : s < 1 ? `${s}× (slower)` : `${s}×`}</Choice>)}
              </Drop>
              <button className={`iconbtn${loop ? ' on' : ''}`} title={`Loop: ${loop ? 'on, playback starts over at the end' : 'off, playback stops at the end'} (Q)`} onClick={() => setLoop(l => !l)}><Icon n={loop ? 'repeat_on' : 'repeat'} /></button>
              <button className={`iconbtn${muted ? ' on' : ''}`} title={`Sound: ${muted ? 'muted' : 'on'} (M · left stick click)`} onClick={() => setMuted(m => !m)}><Icon n={muted ? 'volume_off' : 'volume_up'} /></button>
              <button className={`iconbtn${zoom > 1 ? ' on' : ''}`} title="Quick zoom (Z · right stick click · mouse wheel); move the mouse or right stick to look around" onClick={toggleZoom}><Icon n={zoom > 1 ? 'zoom_out' : 'zoom_in'} /></button>
              <button className={`iconbtn${rot ? ' on' : ''}`} title={`Turn the picture a quarter turn clockwise (R)${rot ? ` · now ${rot}°` : ''}. For viewing only, unless "Save the turn into the file" is ticked in Options.`} onClick={rotate}><Icon n="rotate_90_degrees_cw" /></button>
              <button className={`iconbtn${fs ? ' on' : ''}`} title="Full screen (Alt+Enter · double-click the video)" onClick={toggleFs}><Icon n={fs ? 'fullscreen_exit' : 'fullscreen'} /></button>
            </div>
          </div>

        </div>
      </div>

      {dialog === 'keys' && <Dialog onClose={closeAll}>
        <h2>Keys and controller · videos</h2>
        <table><tbody>
          <tr><th>Keyboard / mouse</th><th>Controller</th><th /></tr>
          <tr><td><kbd>Space</kbd> or click</td><td><span className="pad A">A</span></td><td>Play / pause</td></tr>
          <tr><td>hold <kbd>L</kbd> / hold <kbd>J</kbd></td><td>hold <span className="pad">RT</span> / <span className="pad">LT</span></td><td>Fast forward / rewind while held (speeds up the longer you hold)</td></tr>
          <tr><td>tilt the mouse wheel left / right</td><td /><td>Seek back / forward: frame by frame at first, faster the longer you hold</td></tr>
          <tr><td>drag the timeline</td><td /><td>Shows a preview of that moment; let go to jump there and play</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd> · <kbd>Shift</kbd> = 10 s · <kbd>↑</kbd> <kbd>↓</kbd> = 10 s</td><td><span className="pad">L stick</span></td><td>Step through (hold to keep going); playback carries on when you let go</td></tr>
          <tr><td><kbd>S</kbd></td><td><span className="pad">LB</span></td><td>Slice: press where a slice starts, press again where it ends. Repeat for more slices; they are joined into one video. (<kbd>I</kbd> and <kbd>O</kbd> still set a start or an end directly.)</td></tr>
          <tr><td><kbd>Backspace</kbd> · <kbd>C</kbd></td><td><span className="pad">View</span></td><td>Remove the last mark · clear all slices</td></tr>
          <tr><td>drag a slice or its ends</td><td /><td>Slide the slice along, or make it longer / shorter</td></tr>
          <tr><td><kbd>&lt;</kbd> / <kbd>&gt;</kbd></td><td /><td>Play slower / faster (for slow-motion clips); remembered per video</td></tr>
          <tr><td><kbd>G</kbd></td><td>hold <span className="pad">LB</span> / <span className="pad">RB</span> + <span className="pad">RS</span></td><td>Save the frame on screen as a picture (to Downloads)</td></tr>
          <tr><td><kbd>Q</kbd></td><td /><td>Loop on / off</td></tr>
          <tr><td><kbd>P</kbd></td><td><span className="pad">D-pad ↓</span></td><td>Play only the kept slices (on by default) or the whole video</td></tr>
          <tr><td><kbd>R</kbd></td><td /><td>Turn the picture a quarter turn clockwise (for videos filmed sideways or upside down). For viewing; tick “Save the turn into the file” in Options to make it permanent.</td></tr>
          <tr><td><kbd>M</kbd></td><td><span className="pad">LS</span></td><td>Mute / unmute while reviewing</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>Enter</kbd> or double-click</td><td /><td>Full screen</td></tr>
          <tr><td>click the open video's thumbnail</td><td /><td>Start it again from the beginning</td></tr>
          <tr><td><kbd>Z</kbd> or mouse wheel</td><td><span className="pad">RS</span> + move it</td><td>Quick zoom, and look around while zoomed</td></tr>
          <tr><td><kbd>Y</kbd> or <kbd>Enter</kbd></td><td><span className="pad X">X</span></td><td>Keep (as slices, if any are marked)</td></tr>
          <tr><td><kbd>T</kbd> or <kbd>Delete</kbd></td><td><span className="pad B">B</span></td><td>Move the video to trash</td></tr>
          <tr><td><kbd>D</kbd> · <kbd>U</kbd></td><td><span className="pad Y">Y</span> · <span className="pad">View</span></td><td>Defer · undo the decision</td></tr>
          <tr><td><kbd>F</kbd></td><td><span className="pad">D-pad ↑</span></td><td>Star as a favorite</td></tr>
          <tr><td><kbd>[</kbd> <kbd>]</kbd> or mouse back / forward</td><td><span className="pad">D-pad ← →</span></td><td>Previous / next video</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>L</kbd> · <kbd>?</kbd></td><td><span className="pad">Menu</span></td><td>Quick peek panel · this list</td></tr>
          <tr><th colSpan="3">Controller combinations: hold <span className="pad">LB</span> or <span className="pad">RB</span> and press…</th></tr>
          <tr><td /><td><span className="pad">D-pad ← →</span></td><td>Play slower / faster</td></tr>
          <tr><td /><td><span className="pad">D-pad ↑</span> · <span className="pad">D-pad ↓</span></td><td>Turn the picture · loop on / off</td></tr>
          <tr><td /><td><span className="pad A">A</span> · <span className="pad B">B</span></td><td>Start the video again · clear all slices</td></tr>
          <tr><td /><td><span className="pad X">X</span> · <span className="pad Y">Y</span> · <span className="pad">LS</span></td><td>Pin the details · quick peek panel · save without sound</td></tr>
        </tbody></table>
        <div className="row"><button className="tonal" onClick={closeAll}>Close</button></div>
      </Dialog>}
      {dialog === 'cuts' && <Dialog onClose={closeAll}>
        <h2>Cuts waiting</h2>
        <div className="big">{pending.length} video{pending.length === 1 ? '' : 's'} · about {fmt(pendingBytes)} to free</div>
        <p>Cuts are only noted while you review. To perform them, run <code>apply-trims.cmd</code> in the app's <code>tools</code> folder. It cuts each video without re-encoding, joins several slices into one video, turns the ones you rotated, checks the result, and moves the original to <code>trash\video-trims</code>. Because nothing is re-encoded, each slice starts at the nearest earlier keyframe, so it may begin a second or two before your mark.</p>
        <div className="row"><button className="tonal" onClick={closeAll}>Close</button></div>
      </Dialog>}
    </div>
  );
}
