// Shared pieces used by every mode.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from './config.js';
import { objectUrl } from './lib/library.js';
import { fmt, ms, delta, parts } from './lib/progress.js';

export const Icon = ({ n }) => <span className="ms">{n}</span>;
export const Badge = ({ kept, decided }) => <span className={`badge ${kept ? 'keep' : 'drop'}`}><Icon n={kept ? 'check' : 'delete'} />{kept ? 'KEEP' : decided ? 'TRASHED' : 'TRASH'}</span>;
export const Hint = ({ k, b, pad }) => pad ? <span className={`pad ${b}`}>{b}</span> : <kbd>{k}</kbd>;
export const csv = v => '"' + String(v).replace(/"/g, '""') + '"';
export const clock = s => { if (!isFinite(s)) return '–:––'; const t = Math.max(0, s), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = Math.floor(t % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

export function Dialog({ onClose, children }) {
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="dialog">{children}</div></div>;
}

// Two-line metadata strip: resolution · size · timestamp / file "in" folder (+ time after the oldest in the group)
export function Meta({ item, group, full, extra }) {
  const items = group?.items, maxPx = items && Math.max(...items.map(i => i.w * i.h)), maxB = items && Math.max(...items.map(i => i.bytes));
  const oldest = items ? Math.min(...items.map(i => ms(i.taken)).filter(n => !isNaN(n))) : NaN;
  const p = parts(item, CONFIG.photosPrefix), dl = items ? delta(item.taken, oldest) : '';
  const len = item.type === 'VIDEO' ? (item.seconds ? clock(item.seconds) : (item.duration || '').slice(0, 8)) : '';
  return (
    <div className="meta" title={p.rel}>
      <div className="l1"><span className={items && item.w * item.h === maxPx ? 'best' : ''}>{item.w}×{item.h}</span> · <span className={items && item.bytes === maxB ? 'best' : ''}>{fmt(item.bytes)}</span> · {item.taken || 'no date'}{len ? ` · ▶ ${len}` : ''}{extra}</div>
      <div className="l2">{dl && <span className="delta">{dl}</span>}<b>{p.file}</b> <span className="in">in</span> <span className="dir">{full ? p.dir : p.shortDir}</span></div>
    </div>
  );
}

export function ModeSwitch({ mode, setMode, favCount }) {
  const modes = [['photos', 'burst_mode', 'Look-alikes'], ['videos', 'movie', 'Videos'], ['gallery', 'grid_view', 'Gallery']];
  return <div className="seg modes">{modes.map(([k, icon, label]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)} title={label}><Icon n={icon} /><span className="lbl">{label}</span>{k === 'gallery' && favCount > 0 && <b title="Favorites">★ {favCount}</b>}</button>)}</div>;
}

// The status filter: a row of tabs on a wide window, one dropdown on a narrow one (CSS shows one or the other).
export function FilterTabs({ tiles, filter, counts, onPick }) {
  const cur = tiles.find(t => t[0] === filter) || tiles[0], n = k => k === 'all' ? null : counts[k].toLocaleString();
  return <>
    <div className="seg filters">{tiles.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => onPick(k)}>{l}{n(k) && <b>{n(k)}</b>}</button>)}</div>
    <Drop className="filterdrop" icon="filter_list" label={<>{cur[1]}{n(cur[0]) && <b>&nbsp;{n(cur[0])}</b>}</>} title="Which ones to show" align="left">
      <h4>Show</h4>{tiles.map(([k, l]) => <Choice key={k} on={filter === k} onClick={() => onPick(k)}>{l}{n(k) && <span className="cnt">{n(k)}</span>}</Choice>)}
    </Drop>
  </>;
}
// One button style for every toolbar control: icon, label (hidden when there is no room), optional key hint.
export const Tool = ({ icon, label, on, hint, className = '', ...rest }) => <button className={`tool${on ? ' on' : ''}${className ? ' ' + className : ''}`} {...rest}><Icon n={icon} /><span className="lbl">{label}</span>{hint}</button>;

export const PadChip = ({ pad }) => pad ? <span className="padchip" title="Controller connected"><Icon n="sports_esports" /></span> : null;
export const PeekButton = ({ peek }) => <button className="iconbtn" title={`${peek.open ? 'Hide' : 'Show'} the quick peek panel (Alt+L)`} onClick={() => peek.set({ open: !peek.open })}><Icon n={peek.open ? 'left_panel_close' : 'left_panel_open'} /></button>;

// Keyboard, mouse side-buttons and controller all funnel into one object of handlers held in a ref:
//   pad(button) also receives combinations as 'Mod+<button>' (LB or RB held while another button is pressed)
//   { key(e), keyUp(e), pad(button), padUp(button), move(direction, source), stick({x,y}), nav(dir), away() }
export function useInput(act) {
  useEffect(() => {
    const on = (type, fn) => { window.addEventListener(type, fn); return () => window.removeEventListener(type, fn); };
    const MODS = ['LB', 'RB'], held = new Set(), used = new Set();
    const mouse = up => e => { if (e.button !== 3 && e.button !== 4) return; e.preventDefault(); if (up) act.current.nav?.(e.button === 3 ? -1 : 1); };
    const offs = [
      on('keydown', e => act.current.key?.(e)), on('keyup', e => act.current.keyUp?.(e)),
      on('gamepadbuttonpress', e => { const b = e.detail.button;
        if (MODS.includes(b)) { held.add(b); used.delete(b); return; }
        const mod = MODS.find(m => held.has(m)); if (mod) { used.add(mod); return act.current.pad?.('Mod+' + b); }
        act.current.pad?.(b); }),
      on('gamepadbuttonrelease', e => { const b = e.detail.button;
        if (MODS.includes(b)) { const combo = used.has(b); held.delete(b); used.delete(b); if (!combo) act.current.pad?.(b); return; }
        act.current.padUp?.(b); }),
      on('gamepadmove', e => { if (e.detail.source === 'dpad' && MODS.some(m => held.has(m))) return; act.current.move?.(e.detail.direction, e.detail.source); }), on('gamepadstick', e => act.current.stick?.(e.detail)),
      on('mousedown', mouse(false)), on('auxclick', mouse(false)), on('mouseup', mouse(true)), on('click', () => act.current.away?.()),
    ];
    return () => offs.forEach(off => off());
  }, [act]);
}

// Object URL for one file in the granted folder (first path that exists), revoked when it changes.
export function useFileUrl(root, paths, setUrl) {
  const key = (paths || []).filter(Boolean).join('|');
  useEffect(() => {
    setUrl(null); if (!root || !key) return; let dead = false, made;
    (async () => { for (const p of key.split('|')) { try { made = await objectUrl(root, p); if (dead) URL.revokeObjectURL(made); else setUrl(made); return; } catch { /* try the next */ } } })();
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [root, key]); // eslint-disable-line
}
// An image read straight off disk; loads when mounted (so inside a virtual list only what is visible is read).
export function Thumb({ root, paths }) { const [u, setU] = useState(null); useFileUrl(root, paths, setU); return u ? <img src={u} alt="" draggable={false} /> : null; }

// A video's thumbnail that, while the mouse rests on it, steps through six moments of the video (a quick slideshow).
function Reel({ root, path, seconds }) {
  const [u, setU] = useState(null), ref = useRef(null);
  useFileUrl(root, [path], setU);
  useEffect(() => {
    const el = ref.current; if (!el || !u) return; let k = 0, timer;
    const go = () => { const d = isFinite(el.duration) && el.duration ? el.duration : seconds || 0; if (d) el.currentTime = d * ((k++ % 6) + 0.5) / 6; };
    const start = () => { go(); timer = setInterval(go, 900); };
    if (el.readyState >= 1) start(); else el.addEventListener('loadedmetadata', start, { once: true });
    return () => clearInterval(timer);
  }, [u]); // eslint-disable-line
  return u ? <video ref={ref} className="reel" src={u} muted preload="metadata" /> : null;
}
export function VThumb({ root, paths, video, seconds }) {
  const [on, setOn] = useState(false), t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <span className="vthumb" onMouseEnter={() => { if (video) t.current = setTimeout(() => setOn(true), 350); }} onMouseLeave={() => { clearTimeout(t.current); setOn(false); }}>
      <Thumb root={root} paths={paths} />{on && <Reel root={root} path={video} seconds={seconds} />}
    </span>
  );
}
// size of an element, kept up to date
export function useBox(ref, dep) {
  const [box, setBox] = useState({ w: 800, h: 450 });
  useEffect(() => { const el = ref.current; if (!el) return; const on = () => setBox({ w: el.clientWidth, h: el.clientHeight }); on(); const ro = new ResizeObserver(on); ro.observe(el); return () => ro.disconnect(); }, [ref, dep]);
  return box;
}
// style for a picture or video turned by rot degrees inside a w x h box (sideways ones are laid out with the sides swapped)
export const turnStyle = (rot, w, h) => !rot ? undefined : rot % 180 === 90 ? { position: 'absolute', left: '50%', top: '50%', width: h, height: w, maxWidth: 'none', maxHeight: 'none', objectFit: 'contain', transform: `translate(-50%,-50%) rotate(${rot}deg)` } : { transform: 'rotate(180deg)' };

// Windowing for long lists/grids: which rows to render for the current scroll position.
export function useVirtual(ref, rows, rowH, overscan = 3) {
  const [v, setV] = useState({ top: 0, h: 800 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const on = () => setV({ top: el.scrollTop, h: el.clientHeight });
    on(); el.addEventListener('scroll', on, { passive: true }); const ro = new ResizeObserver(on); ro.observe(el);
    return () => { el.removeEventListener('scroll', on); ro.disconnect(); };
  }, [ref, rows > 0]);   // the list element may only appear once there is something to show (after loading)
  const start = Math.max(0, Math.floor(v.top / rowH) - overscan), end = Math.min(rows, Math.ceil((v.top + v.h) / rowH) + overscan);
  return { start, end, pad: start * rowH, total: rows * rowH };
}

// Quick peek: a panel that slides out on the left with the whole queue, for jumping around (list or grid, three
// thumbnail sizes, resizable). Items arrive already sorted; an item whose `group` differs from the one before it
// starts a new headed section. `tools` is the mode's own sort / group / filter menu.
// items: [{ id, paths, title, sub, icon, tone, badge, group }]
export function Peek({ root, peek, items, current, onPick, tools, onGroup }) {
  const box = useRef(null), [drag, setDrag] = useState(false), [view, setView] = useState({ top: 0, h: 800 });
  // one thumbnail-size setting (the slider) drives both views: grid cell width, and the list's thumb / row size
  const size = typeof peek.size === 'number' ? peek.size : ({ S: 84, M: 124, L: 190 })[peek.size] || 124;
  const grid = peek.view === 'grid', cellW = size, listThumb = Math.round(Math.max(48, Math.min(170, size * 0.62))), listRow = Math.round(listThumb * 0.68) + 10, inner = peek.width - 16;
  const cols = grid ? Math.max(1, Math.floor(inner / cellW)) : 1, rowH = grid ? Math.floor(inner / cols * 0.75) : listRow;
  // rows of varying height: section headers (28px) and rows of cells
  const { rows, offsets, total, rowOf } = useMemo(() => {
    const rows = [], rowOf = new Array(items.length); let i = 0, prev;
    while (i < items.length) {
      const g = items[i].group; if (g !== undefined && g !== prev) { rows.push({ head: g, h: 28 }); prev = g; }
      const cells = []; while (i < items.length && cells.length < cols && items[i].group === g) { rowOf[i] = rows.length; cells.push(i++); }
      rows.push({ cells, h: rowH });
    }
    const offsets = new Array(rows.length + 1); offsets[0] = 0; for (let r = 0; r < rows.length; r++) offsets[r + 1] = offsets[r] + rows[r].h;
    return { rows, offsets, total: offsets[rows.length], rowOf };
  }, [items, cols, rowH]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const on = () => setView({ top: el.scrollTop, h: el.clientHeight });
    on(); el.addEventListener('scroll', on, { passive: true }); const ro = new ResizeObserver(on); ro.observe(el);
    return () => { el.removeEventListener('scroll', on); ro.disconnect(); };
  }, []);
  useEffect(() => { const el = box.current, r = rowOf[current]; if (!el || !peek.open || r === undefined) return; const y = offsets[r]; if (y < el.scrollTop || y + rowH > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, y - el.clientHeight / 2 + rowH / 2); }, [current, peek.open, offsets, rowOf]); // eslint-disable-line
  // first row whose bottom is below the top of the viewport (binary search), then forward until past the bottom
  let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (offsets[m + 1] < view.top - 200) lo = m + 1; else hi = m; }
  const shown = []; if (peek.open) for (let r = lo; r < rows.length && offsets[r] < view.top + view.h + 200; r++) shown.push(r);
  return (
    <aside className={`peek${peek.open ? ' open' : ''}${drag ? ' drag' : ''}`} style={{ width: peek.open ? peek.width : 0 }}>
      <div className="peekin" style={{ width: peek.width }}>
        <div className="peektools">
          {tools}
          <span className="peekcount" title="Items in this list">{items.length.toLocaleString()}</span>
          <label className="sizer" title="Thumbnail size: drag to make the pictures in this panel smaller or larger"><Icon n="photo_size_select_large" /><input type="range" min="70" max="260" step="10" value={size} onChange={e => peek.set({ size: +e.target.value })} /></label>
          <button className="iconbtn" title={`Switch to ${grid ? 'list' : 'grid'} view (Alt+V)`} onClick={() => peek.set({ view: grid ? 'list' : 'grid' })}><Icon n={grid ? 'view_list' : 'grid_view'} /></button>
        </div>
        <div className="peeklist" ref={box}>
          <div style={{ height: total, position: 'relative' }}>
            {shown.map(r => { const row = rows[r];
              if (row.head !== undefined) { const can = onGroup && row.head !== 'Deferred'; return <div key={'h' + r} className={`peekgroup${can ? ' click' : ''}`} style={{ top: offsets[r], height: row.h }} title={can ? 'Show everything in this folder (photos and videos) in the Gallery' : row.head} onClick={can ? () => onGroup(row.head) : undefined}>{can && <Icon n="folder_open" />}{row.head}</div>; }
              return (
                <div key={'r' + r} className={grid ? 'peekgrid' : 'peekline'} style={{ top: offsets[r], height: row.h, gridTemplateColumns: `repeat(${cols},1fr)` }}>
                  {row.cells.map(i => { const it = items[i]; return (
                    <div key={it.id} className={`peekrow${i === current ? ' on' : ''}${it.tone ? ' ' + it.tone : ''}`} onClick={() => onPick(i)} title={it.title}>
                      <span className="pt" style={grid ? undefined : { width: listThumb, height: listRow - 10 }}>{it.video ? <VThumb root={root} paths={it.paths} video={it.video} seconds={it.seconds} /> : <Thumb root={root} paths={it.paths} />}{it.badge && <em>{it.badge}</em>}{it.icon && <Icon n={it.icon} />}</span>
                      {!grid && <span className="pc"><b>{it.title}</b><i>{it.sub}</i></span>}
                    </div>
                  ); })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="peekresize" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); }} onPointerMove={e => { if (drag) peek.set({ width: Math.round(Math.max(224, Math.min(720, e.clientX))) }); }} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)} />
    </aside>
  );
}

// A small dropdown used inside toolbars: a button that opens a panel of choices.
export function Drop({ icon, label, title, children, align = 'left', on, className = '' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const off = () => setOpen(false); window.addEventListener('click', off); return () => window.removeEventListener('click', off); }, [open]);
  return (
    <div className={`menuwrap${className ? ' ' + className : ''}`} onClick={e => e.stopPropagation()}>
      <button className={`tool sm${on ? ' on' : ''}`} title={title} onClick={() => setOpen(o => !o)}><Icon n={icon} />{label && <span className="lbl">{label}</span>}<Icon n="arrow_drop_down" /></button>
      {open && <div className={`menu ${align}`}>{children}</div>}
    </div>
  );
}
export const Choice = ({ on, onClick, children }) => <button className={`item${on ? ' sel' : ''}`} onClick={onClick}><Icon n={on ? 'radio_button_checked' : 'radio_button_unchecked'} />{children}</button>;




