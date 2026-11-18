// Gallery: every photo and video in the library, newest first, with a preview on the right.
// Filters: all / photos / videos / favorites (the shortlist for printing). Only what is on screen is read from disk.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from './config.js';
import * as lib from './lib/library.js';
import { store } from './lib/progress.js';
import { Icon, Hint, Meta, ModeSwitch, PadChip, Thumb, VThumb, useInput, useFileUrl, useVirtual, useBox, turnStyle, clock } from './ui.jsx';

const FILTERS = [['all', 'All'], ['photos', 'Photos'], ['videos', 'Videos'], ['favorites', 'Favorites']];
const SIZES = { S: 120, M: 180, L: 260 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const thumbPaths = it => [it.type === 'VIDEO' ? `${CONFIG.videoThumbs}/${it.id}.jpg` : null, it.thumb, it.preview?.replace(/_preview\.\w+$/, '_thumbnail.webp'), it.preview].filter(Boolean);

export default function Gallery({ root, mode, setMode, favs, toggleFav, pad, openVideo, galleryFolder, setGalleryFolder, rots, turn }) {
  const [phase, setPhase] = useState('loading'), [all, setAll] = useState([]);
  const [filter, setFilter] = useState(() => store.get('galleryFilter', 'all')), [size, setSize] = useState(() => store.get('gallerySize', 'M'));
  const [focus, setFocus] = useState(0), [url, setUrl] = useState(null), [videoUrl, setVideoUrl] = useState(null), [width, setWidth] = useState(800);
  const [pw, setPw] = useState(() => store.get('pw', 0)), [dragging, setDragging] = useState(false), [msg, setMsg] = useState('');
  const box = useRef(null), act = useRef({}), stageRef = useRef(null);
  useEffect(() => store.set('galleryFilter', filter), [filter]);
  useEffect(() => store.set('gallerySize', size), [size]);
  useEffect(() => store.set('pw', pw), [pw]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const doc = await lib.readJson(root, CONFIG.library);
        const items = doc.items.map(r => { if (!Array.isArray(r)) return r; const [id, t, path, w, h, bytes, taken, seconds, video] = r, base = `${doc.thumbs}/${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
          return { id, type: t === 'V' ? 'VIDEO' : 'IMAGE', path, w, h, bytes, taken, seconds, thumb: base + doc.thumbExt, preview: base + '_preview.jpeg', video: video === 1 ? path : video || '' }; });
        if (!dead) { setAll(items); setPhase('ready'); }
      } catch { if (!dead) setPhase('missing'); }
    })();
    return () => { dead = true; };
  }, [root]);

  const items = useMemo(() => {
    const base = filter === 'favorites' ? Object.values(favs).sort((x, y) => y.at - x.at) : filter === 'photos' ? all.filter(i => i.type === 'IMAGE') : filter === 'videos' ? all.filter(i => i.type === 'VIDEO') : all;
    if (!galleryFolder) return base; const pre = CONFIG.photosPrefix + galleryFolder.replaceAll('\\', '/') + '/';
    return base.filter(i => i.path.startsWith(pre));
  }, [all, favs, filter, galleryFolder]);
  useEffect(() => { setFocus(0); if (box.current) box.current.scrollTop = 0; }, [filter, galleryFolder]);
  useEffect(() => { if (galleryFolder && filter === 'favorites') setFilter('all'); }, [galleryFolder]); // eslint-disable-line

  // grid geometry + windowing
  useEffect(() => { const el = box.current; if (!el) return; const on = () => setWidth(el.clientWidth - 48); on(); const ro = new ResizeObserver(on); ro.observe(el); return () => ro.disconnect(); }, [phase]);
  const gap = 8, cols = Math.max(1, Math.floor((width + gap) / (SIZES[size] + gap))), cell = Math.floor((width - gap * (cols - 1)) / cols), rowH = Math.floor(cell * 0.75) + gap;
  const rows = Math.ceil(items.length / cols), win = useVirtual(box, rows, rowH, 2);
  const cur = items[Math.min(focus, items.length - 1)];
  const move = n => { if (n < 0 || n >= items.length) return; setFocus(n); const el = box.current, y = Math.floor(n / cols) * rowH + 16; if (el && (y < el.scrollTop || y + rowH > el.scrollTop + el.clientHeight)) el.scrollTop = Math.max(0, y - el.clientHeight / 2); };

  useFileUrl(root, cur && [cur.preview, cur.type === 'IMAGE' ? cur.path : null], setUrl);
  useFileUrl(root, cur?.type === 'VIDEO' ? [cur.video] : null, setVideoUrl);

  // month shown in the header follows the top visible row
  const top = items[Math.min(items.length - 1, (win.start + 2) * cols)], month = top?.taken ? `${MONTHS[+top.taken.slice(5, 7) - 1]} ${top.taken.slice(0, 4)}` : top ? 'No date' : '';
  const winPath = it => `${CONFIG.rootPath || root.name}\\${it.path.replaceAll('/', '\\')}`;
  const copy = async text => { try { await navigator.clipboard.writeText(text); setMsg('Copied.'); } catch { setMsg('Could not copy.'); } };
  const star = () => { if (cur) toggleFav(cur); };
  const sbox = useBox(stageRef, cur?.id), rot = cur ? rots[cur.id] || 0 : 0, rotate = () => { if (cur) turn(cur.id); };
  const edit = () => { if (cur?.type === 'VIDEO') openVideo(cur.id); };

  act.current = {
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey || !cur) return; const k = e.key.toLowerCase(), page = Math.max(1, Math.floor((box.current?.clientHeight || 600) / rowH)) * cols;
      if (k === 'f') star(); else if (k === 'r') rotate(); else if (k === 'enter') edit();
      else if (k === 'arrowright') move(focus + 1); else if (k === 'arrowleft') move(focus - 1);
      else if (k === 'arrowdown') { e.preventDefault(); move(Math.min(items.length - 1, focus + cols)); } else if (k === 'arrowup') { e.preventDefault(); move(Math.max(0, focus - cols)); }
      else if (k === 'pagedown') { e.preventDefault(); move(Math.min(items.length - 1, focus + page)); } else if (k === 'pageup') { e.preventDefault(); move(Math.max(0, focus - page)); }
      else if (k === 'home') move(0); else if (k === 'end') move(items.length - 1);
    },
    pad(button) { const page = Math.max(1, Math.floor((box.current?.clientHeight || 600) / rowH)) * cols; ({ A: star, X: edit, 'Mod+A': rotate, RB: () => move(Math.min(items.length - 1, focus + page)), LB: () => move(Math.max(0, focus - page)) })[button]?.(); },
    move(direction) { move(focus + ({ Left: -1, Right: 1, Up: -cols, Down: cols })[direction]); },
  };
  useInput(act);

  const dragStart = e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); };
  const dragMove = e => { if (dragging) setPw(Math.round(Math.max(260, Math.min(innerWidth - 300, innerWidth - e.clientX - 8)))); };
  const favCount = Object.keys(favs).length, cells = []; for (let i = win.start * cols; i < Math.min(items.length, win.end * cols); i++) cells.push(i);

  return (
    <div className="app">
      <header>
        <ModeSwitch mode={mode} setMode={setMode} favCount={favCount} />
        <div className="seg">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'favorites' && <Icon n="star" />}{l}{k === 'favorites' && <b>{favCount}</b>}</button>)}</div>
        {galleryFolder && <button className="tonal sm folderchip" title="Showing only this folder and the folders inside it. Click to show the whole library again." onClick={() => setGalleryFolder('')}><Icon n="folder_open" /><span>{galleryFolder}</span><Icon n="close" /></button>}
        <span className="pos">{month}</span>
        <span className="spacer" />
        <PadChip pad={pad} />
        <div className="seg" title="Thumbnail size">{Object.keys(SIZES).map(s => <button key={s} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>{s}</button>)}</div>
      </header>
      <div className="bar" />
      {phase === 'missing' && filter !== 'favorites' ? <div className="connect"><div className="panel"><h1>Gallery</h1><p className="err">No library list found ({CONFIG.library}). Run <code>tools\build-library.ps1</code> to create it.</p></div></div>
        : !cur ? <div className="connect"><div className="panel"><h1>{phase === 'loading' ? 'Loading…' : filter === 'favorites' ? 'No favorites yet' : 'Nothing here'}</h1>{galleryFolder && phase !== 'loading' && <div className="row"><button className="tonal" onClick={() => setGalleryFolder('')}>Show the whole library</button></div>}{filter === 'favorites' && <p>Star any photo or video (<kbd>F</kbd>, or <span className="pad A">A</span> here in the gallery) and it collects in this view, ready to find again for printing.</p>}</div></div>
        : <>
          <div className="work">
            <main className="gal" ref={box}>
              <div style={{ height: win.total, position: 'relative' }}>
                <div className="galgrid" style={{ top: win.pad, gridTemplateColumns: `repeat(${cols},${cell}px)`, gridAutoRows: rowH - gap, gap }}>
                  {cells.map(i => { const it = items[i]; return (
                    <div key={it.id} className={`gcell${i === focus ? ' focus' : ''}`} onClick={() => setFocus(i)} onDoubleClick={() => { if (it.type === 'VIDEO') openVideo(it.id); else toggleFav(it); }}>
                      {it.type === 'VIDEO' ? <VThumb root={root} paths={thumbPaths(it)} video={it.video} seconds={it.seconds} /> : <Thumb root={root} paths={thumbPaths(it)} />}
                      {it.type === 'VIDEO' && <span className="dur"><Icon n="play_arrow" />{it.seconds ? clock(it.seconds) : ''}</span>}
                      {favs[it.id] && <span className="gstar"><Icon n="star" /></span>}
                    </div>
                  ); })}
                </div>
              </div>
            </main>
            <div className={`split${dragging ? ' drag' : ''}`} title="Drag to resize the preview · double-click to reset" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onDoubleClick={() => setPw(0)}><i /></div>
            <aside style={{ width: pw ? pw + 'px' : '46%' }}>
              <div className={`stage${cur.type === 'VIDEO' ? ' video' : ''}`} ref={stageRef}>
                {cur.type === 'VIDEO' ? <video key={cur.id + (videoUrl ? '' : '-wait')} style={turnStyle(rot, sbox.w, sbox.h)} controls autoPlay={store.get('autoplay', true)} muted={store.get('muted', false)} preload="auto" poster={url || undefined} src={videoUrl || undefined} /> : url && <img style={turnStyle(rot, sbox.w, sbox.h)} src={url} alt="" />}
                <button className={`starbtn${favs[cur.id] ? ' on' : ''}`} title="Favorite (F · A)" onClick={star}><Icon n="star" /></button>
                <Meta item={cur} full />
              </div>
            </aside>
          </div>
          <footer>
            <button className="tonal" onClick={star}><Icon n="star" /> {favs[cur.id] ? 'Remove star' : 'Star'} <Hint k="F" b="A" pad={pad} /></button>
            {cur.type === 'VIDEO' && <button onClick={edit}><Icon n="content_cut" /> Open in the editor <Hint k="Enter" b="X" pad={pad} /></button>}
            <button onClick={rotate} title="Turn a quarter turn clockwise, for viewing (R)"><Icon n="rotate_90_degrees_cw" /><span className="wide">Turn</span> <kbd>R</kbd></button>
            <button onClick={() => copy(winPath(cur))}><Icon n="content_copy" /><span className="wide">Copy path</span></button>
            {filter === 'favorites' && <button onClick={() => copy(items.map(winPath).join('\r\n'))}><Icon n="list" /> Copy all {items.length} paths</button>}
            <span className="msg">{msg}</span>
            <span className="spacer" />
            <span className="stat">{(focus + 1).toLocaleString()} of {items.length.toLocaleString()}</span>
          </footer>
        </>}
    </div>
  );
}
