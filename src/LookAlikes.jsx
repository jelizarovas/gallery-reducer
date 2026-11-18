// Look-alike photos: one group at a time, suggestion pre-marked, keep / trash / defer / undo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, DEMO, K } from './config.js';
import * as lib from './lib/library.js';
import { store, fmt, parts } from './lib/progress.js';
import { Icon, Badge, Hint, Dialog, Meta, ModeSwitch, PadChip, PeekButton, Peek, Drop, Choice, useInput, csv } from './ui.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const gBytes = g => g.items.reduce((a, i) => a + i.bytes, 0), gTaken = g => g.items.map(i => i.taken).filter(Boolean).sort()[0] || '', gFile = g => parts(g.items[0], CONFIG.photosPrefix).file, gDir = g => parts(g.items[0], CONFIG.photosPrefix).dir;
// how the queue can be ordered and sectioned from the peek panel
const GSORTS = {
  default: ['Suggested first', null], extra: ['Most extra copies', (a, b) => b.suggested - a.suggested], count: ['Most photos', (a, b) => b.items.length - a.items.length], size: ['Biggest', (a, b) => gBytes(b) - gBytes(a)],
  newest: ['Newest first', (a, b) => gTaken(b).localeCompare(gTaken(a))], oldest: ['Oldest first', (a, b) => (gTaken(a) || '9').localeCompare(gTaken(b) || '9')], name: ['Name', (a, b) => gFile(a).localeCompare(gFile(b))],
};
const GGROUPS = {
  none: ['No grouping'],
  kind: ['Kind', g => g.suggested ? 0 : 1, g => g.suggested ? 'Same picture, extra copies' : 'Similar, no suggestion'],
  year: ['Year', g => gTaken(g) ? -gTaken(g).slice(0, 4) : 1, g => gTaken(g) ? gTaken(g).slice(0, 4) : 'No date'],
  month: ['Month', g => gTaken(g) ? -(gTaken(g).slice(0, 4) + gTaken(g).slice(5, 7)) : 1, g => gTaken(g) ? MONTHS[+gTaken(g).slice(5, 7) - 1] + ' ' + gTaken(g).slice(0, 4) : 'No date'],
  folder: ['Folder', g => gDir(g).toLowerCase(), g => gDir(g)],
  count: ['Number of photos', g => -Math.min(g.items.length, 10), g => g.items.length >= 10 ? '10 or more photos' : g.items.length + ' photos'],
};
const TILES = [['open', 'Open'], ['reduced', 'Reduced'], ['kept', 'Kept'], ['later', 'Later'], ['all', 'All']];

export default function LookAlikes({ root, mode, setMode, favs, toggleFav, pad, changeFolder, peek, openFolder }) {
  const [phase, setPhase] = useState('loading'), [error, setError] = useState('');
  const [data, setData] = useState([]), [curId, setCurId] = useState(() => store.get(K('group'), null));
  const [view, setViewState] = useState(() => ({ sort: 'default', group: 'none', ...store.get(K('groupView'), {}) })), setView = patch => setViewState(v => ({ ...v, ...patch }));
  const [decisions, setDecisions] = useState(() => store.get(K('decisions'), {})), [deferred, setDeferred] = useState(() => store.get(K('deferred'), []));
  const [marks, setMarks] = useState(() => new Set()), [focus, setFocus] = useState(0);
  const [filter, setFilter] = useState(() => store.get(K('filter'), 'open')), [onlySug, setOnlySug] = useState(() => store.get(K('onlySug'), false));
  const [sprint, setSprint] = useState(() => store.get(K('sprint'), null)), [pw, setPw] = useState(() => store.get('pw', 0));
  const [msg, setMsg] = useState({ text: '', err: false }), [dialog, setDialog] = useState(null), [menu, setMenu] = useState(false), [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState({}), [videoUrl, setVideoUrl] = useState(null), [cell, setCell] = useState({ cols: 1, w: 200 }), [dragging, setDragging] = useState(false);
  const gridRef = useRef(null), act = useRef({});

  useEffect(() => store.set(K('decisions'), decisions), [decisions]);
  useEffect(() => store.set(K('deferred'), deferred), [deferred]);
  useEffect(() => store.set(K('filter'), filter), [filter]);
  useEffect(() => store.set(K('onlySug'), onlySug), [onlySug]);
  useEffect(() => store.set(K('sprint'), sprint), [sprint]);
  useEffect(() => store.set('pw', pw), [pw]);
  useEffect(() => store.set(K('groupView'), view), [view]);

  // ---- loading the group list ----------------------------------------------------------------------------------
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const all = await lib.readJson(root, CONFIG.groups);
        if (dead) return;
        setData(all); setPhase('review');
      } catch { if (!dead) { setError(`No look-alike list found (${CONFIG.groups}).`); setPhase('error'); } }
    })();
    return () => { dead = true; };
  }, [root]);

  // ---- derived state -------------------------------------------------------------------------------------------
  // the queue: ordered as chosen in the peek panel's menu, deferred groups last
  const groups = useMemo(() => {
    const ds = new Set(deferred), g = GGROUPS[view.group] || GGROUPS.none, cmp = (GSORTS[view.sort] || GSORTS.default)[1];
    const a = data.map((x, n) => ({ x, n })); a.sort((p, q) => { if (g[1]) { const kp = g[1](p.x), kq = g[1](q.x); if (kp !== kq) return kp < kq ? -1 : 1; } return (cmp ? cmp(p.x, q.x) : 0) || p.n - q.n; });
    const s = a.map(p => p.x); return [...s.filter(x => !ds.has(x.id)), ...deferred.map(id => s.find(x => x.id === id)).filter(Boolean)];
  }, [data, deferred, view]);
  const idx = useMemo(() => { const i = groups.findIndex(g => g.id === curId); return i < 0 ? Math.max(0, groups.findIndex(g => !decisions[g.id])) : i; }, [groups, curId]); // eslint-disable-line
  const setIdx = i => { if (groups[i]) setCurId(groups[i].id); };
  const cur = groups[idx], d = cur && decisions[cur.id], defSet = useMemo(() => new Set(deferred), [deferred]);
  const status = (g, dec = decisions, ds = defSet) => { const x = dec[g.id]; return x ? (x.moved.length ? 'reduced' : 'kept') : ds.has(g.id) ? 'later' : 'open'; };
  // "open" = still undecided, deferred ones included (they sit at the end of the line)
  const matchG = (g, f, dec = decisions, ds = defSet) => { if (onlySug && !g.suggested) return false; const s = status(g, dec, ds); return f === 'all' || (f === 'open' ? s === 'open' || s === 'later' : s === f); };
  const find = (from, dir, strict, dec = decisions, ds = defSet) => { const f = strict ? filter : filter === 'open' ? 'all' : filter; for (let i = from + dir; i >= 0 && i < groups.length; i += dir) if (matchG(groups[i], f, dec, ds)) return i; return -1; };
  const counts = useMemo(() => { const c = { open: 0, reduced: 0, kept: 0, later: 0, all: groups.length }; for (const g of groups) { const s = status(g); c[s]++; if (s === 'later') c.open++; } return c; }, [groups, decisions, defSet]); // eslint-disable-line
  const totals = useMemo(() => { const v = Object.values(decisions); return { n: v.reduce((a, x) => a + x.moved.filter(m => m.id).length, 0), bytes: v.reduce((a, x) => a + x.moved.reduce((s, m) => s + m.bytes, 0), 0), done: v.length }; }, [decisions]);
  const sprintStats = useMemo(() => { if (!sprint) return null; const v = Object.values(decisions).filter(x => x.at >= sprint.start); return { n: v.length, trashed: v.reduce((a, x) => a + x.moved.filter(m => m.id).length, 0), bytes: v.reduce((a, x) => a + x.moved.reduce((s, m) => s + m.bytes, 0), 0) }; }, [sprint, decisions]);
  const flash = (text, err = false) => setMsg({ text, err });
  const peekItems = useMemo(() => { const gg = GGROUPS[view.group] || GGROUPS.none; return groups.map(g => { const s = status(g), f = g.items[0]; return { group: gg[2] ? (s === 'later' ? 'Deferred' : gg[2](g)) : undefined, id: g.id, paths: [f.preview?.replace(/_preview\.\w+$/, '_thumbnail.webp'), f.preview], title: parts(f, CONFIG.photosPrefix).file, sub: `${g.items.length} photos${g.suggested ? ' · ' + g.suggested + ' extra' : ''}`, icon: { reduced: 'content_cut', kept: 'check', later: 'schedule' }[s], tone: s === 'open' ? '' : 'done' }; }); }, [groups, decisions, defSet, view.group]); // eslint-disable-line

  // marks follow the group on screen: the saved choice if decided, else the suggestion
  useEffect(() => { if (!cur) return; setMarks(new Set(d ? d.keep : cur.items.filter(i => !i.suggestRemove).map(i => i.id))); setFocus(0); }, [cur?.id, d?.at]); // eslint-disable-line
  useEffect(() => { if (!cur) return; store.set(K('group'), cur.id); const h = '#' + (idx + 1); if (location.hash !== h) { if (location.hash) history.pushState(null, '', h); else history.replaceState(null, '', h); } }, [idx, cur?.id]); // eslint-disable-line
  useEffect(() => { const pop = () => { const n = +location.hash.slice(1) - 1; if (n >= 0 && n < groups.length) setIdx(n); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, [groups.length]);

  // thumbnails come straight off disk as object URLs, one group at a time
  useEffect(() => {
    if (!root || !cur) return; let dead = false; const made = []; setUrls({});
    (async () => {
      const out = {};
      await Promise.all(cur.items.map(async it => {
        for (const p of [it.preview, it.type === 'IMAGE' ? it.path : null]) { if (!p) continue; try { const u = await lib.objectUrl(root, p); if (dead) URL.revokeObjectURL(u); else { made.push(u); out[it.id] = u; } return; } catch { /* try the next source */ } }
      }));
      if (!dead) setUrls(out);
    })();
    return () => { dead = true; made.forEach(u => URL.revokeObjectURL(u)); };
  }, [root, cur?.id]); // eslint-disable-line
  const fItem = cur?.items[Math.min(focus, (cur?.items.length || 1) - 1)];
  useEffect(() => {
    setVideoUrl(null); if (!root || !fItem || fItem.type !== 'VIDEO') return; let dead = false, made;
    (async () => { for (const p of [fItem.video, d?.moved.find(m => m.id === fItem.id)?.to]) { if (!p) continue; try { made = await lib.objectUrl(root, p); if (dead) URL.revokeObjectURL(made); else setVideoUrl(made); return; } catch { /* next */ } } })();
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [root, fItem?.id]); // eslint-disable-line

  // biggest 4:3 cards that fit the pane without scrolling; a scrolling grid only for very large groups
  useEffect(() => {
    const m = gridRef.current; if (!m || !cur) return;
    const calc = () => {
      const n = cur.items.length, W = m.clientWidth - 48, H = m.clientHeight - 32, gap = 12; let best = 0, cols = 1;
      for (let c = 1; c <= n; c++) { const rows = Math.ceil(n / c), w = Math.min((W - gap * (c - 1)) / c, ((H - gap * (rows - 1)) / rows) * 4 / 3); if (w > best) { best = w; cols = c; } }
      if (best < 150) { cols = Math.max(1, Math.floor((W + gap) / (160 + gap))); best = (W - gap * (cols - 1)) / cols; }
      setCell({ cols, w: Math.floor(best) });
    };
    calc(); const ro = new ResizeObserver(calc); ro.observe(m); return () => ro.disconnect();
  }, [cur?.id, phase]); // eslint-disable-line
  useEffect(() => { document.querySelector('.card.focus')?.scrollIntoView({ block: 'nearest' }); }, [focus, idx]);

  // sprint reaches its target -> summary
  useEffect(() => { if (!sprint || !sprintStats) return; if (sprintStats.n >= sprint.target && !sprint.done) { setSprint({ ...sprint, done: true }); setDialog('sprintDone'); } else if (sprintStats.n < sprint.target && sprint.done) setSprint({ ...sprint, done: false }); }, [sprint, sprintStats]);

  // ---- actions -------------------------------------------------------------------------------------------------
  const log = async (...row) => { try { await lib.appendLine(root, CONFIG.log, 'Time,Action,From,To,KeptCopies,Group', [new Date().toISOString(), ...row].map(csv).join(',')); } catch { /* the log is best-effort */ } };
  const go = (dir, strict = false) => { const i = find(idx, dir, strict); if (i >= 0) { setIdx(i); flash(''); } };
  const pickFilter = f => { setFilter(f); if (!cur || !matchG(cur, f)) { const i = groups.findIndex(g => matchG(g, f)); if (i < 0) return flash('No groups in that view yet.'); setIdx(i); } flash(''); };
  const toggle = n => { const it = cur?.items[n]; if (!it || d) return; setMarks(m => { const s = new Set(m); s.has(it.id) ? s.delete(it.id) : s.add(it.id); return s; }); };
  const only = n => { const it = cur?.items[n]; if (!it || d) return; setMarks(new Set([it.id])); setFocus(n); };
  const cycle = kind => { const c = cur.items.length; for (let s = 1; s <= c; s++) { const n = (focus + s) % c, kept = marks.has(cur.items[n].id); if (kind === 'any' || (kind === 'keep') === kept) return setFocus(n); } };
  const moveFocus = dir => { const n = focus + ({ Left: -1, Right: 1, Up: -cell.cols, Down: cell.cols })[dir]; if (n >= 0 && n < cur.items.length) setFocus(n); };

  const decide = async (keepIds, none = false) => {
    if (!cur || d || busy) return; if (!keepIds.length && !none) return flash('Nothing is marked to keep. Mark one, or use Trash all.', true);
    setBusy(true); const g = cur, keep = new Set(keepIds), moved = [], kept = g.items.filter(i => keep.has(i.id)).map(i => i.path).join(' | '); let failed = '';
    try {
      for (const it of g.items) {
        if (keep.has(it.id) || !(await lib.exists(root, it.path))) continue;
        const dest = `${CONFIG.trash}/${it.path.startsWith(CONFIG.photosPrefix) ? it.path.slice(CONFIG.photosPrefix.length) : it.path}`;
        const to = await lib.moveFile(root, it.path, dest); moved.push({ id: it.id, from: it.path, to, bytes: it.bytes }); await log('moved', it.path, to, kept, g.id);
        if (await lib.exists(root, it.path + '.xmp')) { const sto = await lib.moveFile(root, it.path + '.xmp', dest + '.xmp'); moved.push({ id: null, from: it.path + '.xmp', to: sto, bytes: 0 }); await log('moved', it.path + '.xmp', sto, kept, g.id); }   // date sidecar travels with its photo
      }
    } catch (e) { failed = e.message; }
    const dec = { ...decisions, [g.id]: { keep: [...keep], moved, at: Date.now() } };
    setDecisions(dec); setBusy(false);
    if (failed) return flash(failed, true);
    const next = find(idx, 1, true, dec); if (next >= 0) setIdx(next); flash('');
  };
  const undo = async () => {
    if (!cur || !d || busy) return; setBusy(true); let failed = '';
    try { for (const m of [...d.moved].reverse()) if ((await lib.exists(root, m.to)) && !(await lib.exists(root, m.from))) { await lib.moveFile(root, m.to, m.from); await log('restored', m.to, m.from, '', cur.id); } } catch (e) { failed = e.message; }
    if (!failed) setDecisions(({ [cur.id]: _, ...rest }) => rest);
    setBusy(false); flash(failed || 'Undone: files are back in place.', !!failed);
  };
  const defer = () => {
    if (!cur || d) return; const ds = new Set([...deferred, cur.id]); let n = find(idx, 1, true, decisions, ds); if (n < 0) n = find(idx, -1, true, decisions, ds);   // the next group in view takes its place
    setDeferred([...deferred.filter(x => x !== cur.id), cur.id]); if (n >= 0) setIdx(n); flash('Deferred to the end of the line.');
  };
  const fav = it => { if (!it) return; if (!favs[it.id] && !d) setMarks(m => new Set(m).add(it.id)); toggleFav(it); };
  const startSprint = n => { setSprint({ target: n, start: Date.now() }); setDialog(null); };
  const closeAll = () => { setDialog(null); setMenu(false); };

  // keyboard, mouse buttons and controller all funnel into the same actions
  act.current = {
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey || phase !== 'review' || !cur) return; const k = e.key.toLowerCase();
      if (e.key === '?') { e.preventDefault(); return setDialog(x => x ? null : 'keys'); }
      if (dialog || menu) { if (k === 'escape') closeAll(); return; }
      if (k === 'y' || k === 'enter') decide([...marks]); else if (k === 'n') decide(cur.items.map(i => i.id));
      else if (k === 't' || k === 'delete') decide([], true); else if (k === 'u') undo(); else if (k === 'd') defer(); else if (k === 'arrowleft') go(-1); else if (k === 'arrowright') go(1);
      else if (k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); const n = focus + (k === 'arrowdown' ? 1 : -1); if (n >= 0 && n < cur.items.length) setFocus(n); }
      else if (k === ',' || k === '.' || k === '/') { e.preventDefault(); cycle(k === ',' ? 'keep' : k === '.' ? 'trash' : 'any'); }
      else if (k === 'k' || k === ' ') { e.preventDefault(); toggle(focus); }
      else if (k === 'f') fav(fItem);
      else if (/^Digit[1-9]$/.test(e.code)) { const n = +e.code.slice(5) - 1; e.shiftKey ? toggle(n) : only(n); }
    },
    pad(button) {
      if (phase !== 'review' || !cur) return;
      if (button === 'Start') return setDialog(x => x ? null : 'keys');
      if (dialog || menu) { if (button === 'A' || button === 'B') closeAll(); return; }
      ({ A: () => decide([...marks]), X: () => decide(cur.items.map(i => i.id)), Y: defer, B: () => toggle(focus), LB: () => go(-1), RB: () => go(1), LT: () => cycle('keep'), RT: () => cycle('trash'), Back: undo, RS: () => fav(fItem), LS: () => peek.set({ open: !peek.open }), 'Mod+B': () => decide([], true), 'Mod+A': () => only(focus), 'Mod+X': () => decide(cur.items.map(i => i.id)), 'Mod+Y': () => setDialog('sprint') })[button]?.();
    },
    move(direction) { if (phase === 'review' && cur && !dialog && !menu) moveFocus(direction); },
    nav(dir) { if (phase === 'review') go(dir); },
    away() { setMenu(false); },
  };
  useInput(act);

  const sortTools = (
    <><Drop icon="sort" label={(GSORTS[view.sort] || GSORTS.default)[0]} title="Sort the look-alike groups">
      <h4>Sort by</h4>{Object.entries(GSORTS).map(([k, [l]]) => <Choice key={k} on={view.sort === k} onClick={() => setView({ sort: k })}>{l}</Choice>)}
    </Drop>
    <Drop icon="category" label={view.group === 'none' || !GGROUPS[view.group] ? 'Group' : GGROUPS[view.group][0]} title="Put the look-alike groups under headings" on={view.group !== 'none'}>
      <h4>Group by</h4>{Object.entries(GGROUPS).map(([k, [l]]) => <Choice key={k} on={view.group === k} onClick={() => setView({ group: k })}>{l}</Choice>)}
    </Drop></>
  );

  // preview panel resize
  const dragStart = e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); };
  const dragMove = e => { if (dragging) setPw(Math.round(Math.max(260, Math.min(innerWidth - 300, innerWidth - e.clientX - 8)))); };

  // ---- render --------------------------------------------------------------------------------------------------
  if (phase !== 'review' || !cur) return (
    <div className="app">
      <header><ModeSwitch mode={mode} setMode={setMode} favCount={Object.keys(favs).length} /></header>
      <div className="connect"><div className="panel"><h1>Look-alikes</h1><p className={error ? 'err' : ''}>{error || (phase === 'loading' ? 'Loading the group list…' : 'The group list is empty.')}</p></div></div>
    </div>
  );

  const fKept = marks.has(fItem.id);
  const kind = d ? ['done', 'task_alt', d.moved.length ? 'Decided: reduced' : 'Decided: kept all', 'You already decided this group. Undo to change it.']
    : cur.suggested ? ['copy', 'content_copy', 'Same picture, extra copies', 'True copies of the same picture (taken at the same second). The extras are pre-marked for trash.']
    : ['sim', 'help', 'Similar, no suggestion', 'These look alike but are different shots, so nothing is pre-marked. Pick what to keep yourself.'];
  const progress = sprint ? Math.min(100, 100 * sprintStats.n / sprint.target) : 100 * totals.done / groups.length;

  return (
    <div className="app">
      <header>
        <PeekButton peek={peek} />
        <ModeSwitch mode={mode} setMode={setMode} favCount={Object.keys(favs).length} />
        <div className="seg nav">
          <button title="Previous group (← · mouse back · LB)" onClick={() => go(-1)}><Icon n="chevron_left" /></button>
          <span className="pos" title="Group"><span className="wide">Group&nbsp;</span>{(idx + 1).toLocaleString()}<span className="wide">&nbsp;of&nbsp;</span><span className="narrow">&nbsp;/&nbsp;</span>{groups.length.toLocaleString()}</span>
          <button title="Next group (→ · mouse forward · RB)" onClick={() => go(1)}><Icon n="chevron_right" /></button>
        </div>
        <div className="seg">{TILES.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => pickFilter(k)}>{l}{k !== 'all' && <b>{counts[k].toLocaleString()}</b>}</button>)}</div>
        <span className="spacer" />
        <PadChip pad={pad} />
        <button className="tonal sm" title="Sprint" onClick={() => setDialog('sprint')}><Icon n="timer" /> {sprint ? `${sprintStats.n} / ${sprint.target}` : <span className="wide">Start sprint</span>}</button>
        <div className="menuwrap" onClick={e => e.stopPropagation()}>
          <button className="outlined sm" onClick={() => setMenu(m => !m)}><Icon n="tune" /><span className="wide">Options</span><Icon n="arrow_drop_down" /></button>
          {menu && <div className="menu">
            <label className="item"><input type="checkbox" checked={onlySug} onChange={e => setOnlySug(e.target.checked)} /> Only groups with a suggestion</label>
            <button className="item" onClick={() => { setMenu(false); setDialog('keys'); }}><Icon n="keyboard" /> Keys and controller <kbd>?</kbd></button>
            <button className="item" onClick={() => { setMenu(false); setPw(0); }}><Icon n="width" /> Reset preview size</button>
            {!DEMO && <button className="item" onClick={changeFolder}><Icon n="folder_off" /> Change folder</button>}
          </div>}
        </div>
      </header>
      <div className="bar"><i style={{ width: progress + '%' }} /></div>

      <div className="body">
      <Peek root={root} peek={peek} items={peekItems} current={idx} onPick={i => { setIdx(i); flash(''); }} tools={sortTools} onGroup={view.group === 'folder' ? openFolder : undefined} />
      <div className="col">
      <div className="work">
        <main className="grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${cell.cols},${cell.w}px)`, gridAutoRows: Math.floor(cell.w * 3 / 4) + 'px' }}>
          {cur.items.map((it, n) => {
            const kept = marks.has(it.id), gone = d?.moved.some(m => m.id === it.id);
            return (
              <div key={it.id} className={`card ${kept ? 'keep' : 'drop'}${n === focus ? ' focus' : ''}${gone ? ' gone' : ''}`} onMouseEnter={() => setFocus(n)} onClick={() => { toggle(n); setFocus(n); }}>
                {urls[it.id] && <img src={urls[it.id]} alt="" />}
                <Badge kept={kept} decided={!!d} /><span className="num">{favs[it.id] && <Icon n="star" />}{n + 1}</span>
                <Meta item={it} group={cur} />
              </div>
            );
          })}
        </main>
        <div className={`split${dragging ? ' drag' : ''}`} title="Drag to resize the preview · double-click to reset" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onDoubleClick={() => setPw(0)}><i /></div>
        <aside style={{ width: pw ? pw + 'px' : '46%' }}>
          <div className={`stage ${fKept ? 'keep' : 'drop'}${fItem.type === 'VIDEO' ? ' video' : ''}`}>
            {fItem.type === 'VIDEO' ? <video key={fItem.id} controls preload="metadata" poster={urls[fItem.id]} src={videoUrl || undefined} /> : urls[fItem.id] && <img src={urls[fItem.id]} alt="" />}
            <Badge kept={fKept} decided={!!d} />
            <button className={`starbtn${favs[fItem.id] ? ' on' : ''}`} title="Favorite (F · right stick click)" onClick={() => fav(fItem)}><Icon n="star" /></button>
            <Meta item={fItem} group={cur} full />
          </div>
        </aside>
      </div>

      <footer>
        <button className="filled" disabled={!!d || busy} onClick={() => decide([...marks])}><Icon n="check" /> Keep marked, trash the rest <Hint k="Y" b="A" pad={pad} /></button>
        <button className="tonal" disabled={!!d || busy} onClick={() => decide(cur.items.map(i => i.id))}><Icon n="done_all" /> Keep all <Hint k="N" b="X" pad={pad} /></button>
        <button disabled={!!d || busy} onClick={() => decide([], true)} title="None of these is worth keeping: move the whole group to trash"><Icon n="delete_sweep" /> Trash all <kbd>T</kbd></button>
        <button disabled={!!d || busy} onClick={defer}><Icon n="schedule" /> Defer <Hint k="D" b="Y" pad={pad} /></button>
        <button disabled={!d || busy} onClick={undo}><Icon n="undo" /> Undo <Hint k="U" b="View" pad={pad} /></button>
        <span className={`msg${msg.err ? ' err' : ''}`}>{msg.text}</span>
        <span className="spacer" />
        <span className={`kind ${kind[0]}`} title={kind[3]}><Icon n={kind[1]} />{kind[2]}</span>
        <span className="stat">{totals.n.toLocaleString()} trashed · {fmt(totals.bytes)} freed</span>
      </footer>
      </div>
      </div>

      {dialog === 'keys' && <Dialog onClose={closeAll}>
        <h2>Keys and controller</h2>
        <table><tbody>
          <tr><th>Keyboard / mouse</th><th>Controller</th><th /></tr>
          <tr><td><kbd>Y</kbd> or <kbd>Enter</kbd></td><td><span className="pad A">A</span></td><td>Keep the marked photos, move the rest to trash</td></tr>
          <tr><td><kbd>N</kbd></td><td><span className="pad X">X</span></td><td>Keep all</td></tr>
          <tr><td><kbd>T</kbd> or <kbd>Delete</kbd></td><td>hold <span className="pad">LB</span> or <span className="pad">RB</span> + <span className="pad B">B</span></td><td>Trash all: move every photo in the group to trash</td></tr>
          <tr><td><kbd>D</kbd></td><td><span className="pad Y">Y</span></td><td>Defer: send this group to the end of the line</td></tr>
          <tr><td><kbd>U</kbd></td><td><span className="pad">View</span></td><td>Undo this group and put its files back</td></tr>
          <tr><td><kbd>Space</kbd> or <kbd>K</kbd></td><td><span className="pad B">B</span></td><td>Flip the previewed photo between keep and trash</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd> or hover</td><td><span className="pad">D-pad</span> <span className="pad">L stick</span></td><td>Move the preview between photos (hold to repeat)</td></tr>
          <tr><td><kbd>,</kbd> &nbsp;<kbd>.</kbd> &nbsp;<kbd>/</kbd></td><td><span className="pad">LT</span> <span className="pad">RT</span></td><td>Preview the next keep / next trash / next of any</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd> or mouse back / forward</td><td><span className="pad">LB</span> <span className="pad">RB</span></td><td>Previous / next group</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>hold <span className="pad">LB</span> or <span className="pad">RB</span> + <span className="pad A">A</span></td><td>Keep only that photo (on the controller: the one being previewed)</td></tr>
          <tr><td /><td>hold <span className="pad">LB</span> or <span className="pad">RB</span> + <span className="pad Y">Y</span></td><td>Sprint</td></tr>
          <tr><td><kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>9</kbd> or click</td><td /><td>Flip that photo between keep and trash</td></tr>
          <tr><td><kbd>F</kbd></td><td><span className="pad">RS</span></td><td>Star the previewed photo as a favorite</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>L</kbd></td><td><span className="pad">LS</span></td><td>Show or hide the quick peek panel</td></tr>
          <tr><td><kbd>?</kbd></td><td><span className="pad">Menu</span></td><td>Show or hide this list</td></tr>
        </tbody></table>
        <div className="row"><button className="tonal" onClick={closeAll}>Close</button></div>
      </Dialog>}
      {dialog === 'sprint' && <Dialog onClose={closeAll}>
        {sprint ? <>
          <h2>Sprint in progress</h2><div className="big">{sprintStats.n} of {sprint.target} groups</div>
          <p>{sprintStats.trashed} photos moved to trash · {fmt(sprintStats.bytes)} freed · {Math.max(1, Math.round((Date.now() - sprint.start) / 60000))} min</p>
          <div className="row"><button onClick={() => { setSprint(null); closeAll(); }}>End sprint</button><button className="tonal" onClick={closeAll}>Keep going</button></div>
        </> : <>
          <h2>Start a sprint</h2><p>Pick how many groups to decide in this sitting. The bar at the top tracks the sprint, and you get a summary at the end.</p>
          <div className="row pick">{[10, 25, 50, 100, 250].map(n => <button key={n} className="tonal" onClick={() => startSprint(n)}>{n}</button>)}</div>
          <div className="row"><button onClick={closeAll}>Cancel</button></div>
        </>}
      </Dialog>}
      {dialog === 'sprintDone' && sprint && <Dialog onClose={closeAll}>
        <h2>Sprint complete</h2><div className="big">{sprintStats.n} of {sprint.target} groups</div>
        <p>{sprintStats.trashed} photos moved to trash · {fmt(sprintStats.bytes)} freed · {Math.max(1, Math.round((Date.now() - sprint.start) / 60000))} min</p>
        <div className="row"><button onClick={() => { setSprint(null); closeAll(); }}>Finish</button><button className="filled" onClick={() => startSprint(sprint.target)}>Another {sprint.target}</button></div>
      </Dialog>}
    </div>
  );
}
