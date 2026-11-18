// Local folder access through the browser's File System Access API (Chrome / Edge).
// Nothing is uploaded: the page reads thumbnails and moves files on the user's own disk.

const DB = 'gallery-reducer', STORE = 'handles';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); });
}
// the folder handle is remembered (IndexedDB — handles cannot live in localStorage) so a return visit is one click
export const saveRoot = h => tx('readwrite', s => s.put(h, 'root'));
export const loadRoot = () => tx('readonly', s => s.get('root')).catch(() => null);
export const clearRoot = () => tx('readwrite', s => s.delete('root'));

export async function hasPermission(h, ask) {
  const o = { mode: 'readwrite' };
  if (!h.queryPermission) return true;                       // OPFS (demo) handles need no permission
  if ((await h.queryPermission(o)) === 'granted') return true;
  return ask ? (await h.requestPermission(o)) === 'granted' : false;
}

const split = p => p.split(/[\\/]/).filter(Boolean);
export async function dirAt(root, parts, create = false) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
export async function fileAt(root, path) { const parts = split(path), name = parts.pop(), dir = await dirAt(root, parts); return { dir, name, handle: await dir.getFileHandle(name) }; }
export async function exists(root, path) { try { await fileAt(root, path); return true; } catch { return false; } }
export async function readJson(root, path) { const { handle } = await fileAt(root, path); return JSON.parse(await (await handle.getFile()).text()); }
export async function objectUrl(root, path) { const { handle } = await fileAt(root, path); return URL.createObjectURL(await handle.getFile()); }

async function freeName(dir, name) {
  const taken = async n => { try { await dir.getFileHandle(n); return true; } catch { return false; } };
  if (!(await taken(name))) return name;
  const dot = name.lastIndexOf('.'), b = dot > 0 ? name.slice(0, dot) : name, e = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) { const c = `${b} (${i})${e}`; if (!(await taken(c))) return c; }
}
async function sha256(file) { const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

// Move a file inside the granted folder without ever overwriting. Uses the browser's native move when it has one;
// otherwise copies, verifies the copy (size, plus SHA-256 up to 64 MB) and only then removes the original.
export async function moveFile(root, from, to, { forceCopy = false } = {}) {
  const src = await fileAt(root, from), tp = split(to), wanted = tp.pop(), destDir = await dirAt(root, tp, true), name = await freeName(destDir, wanted);
  let moved = false;
  if (!forceCopy && typeof src.handle.move === 'function') { try { await src.handle.move(destDir, name); moved = true; } catch { /* fall through to copy */ } }
  if (!moved) {
    const file = await src.handle.getFile(), dh = await destDir.getFileHandle(name, { create: true });
    await file.stream().pipeTo(await dh.createWritable());
    const copy = await dh.getFile();
    const ok = copy.size === file.size && (file.size > 64 * 2 ** 20 || (await sha256(file)) === (await sha256(copy)));
    if (!ok) { await destDir.removeEntry(name); throw new Error(`Copy could not be verified, original left in place: ${from}`); }
    await src.dir.removeEntry(src.name);
  }
  return [...tp, name].join('/');
}

export async function writeText(root, path, text) {
  const parts = split(path), name = parts.pop(), dir = await dirAt(root, parts, true);
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
}

export async function appendLine(root, path, header, line) {
  const parts = split(path), name = parts.pop(), dir = await dirAt(root, parts, true);
  const fh = await dir.getFileHandle(name, { create: true }), size = (await fh.getFile()).size;
  const w = await fh.createWritable({ keepExistingData: true });
  await w.seek(size); await w.write((size ? '' : header + '\r\n') + line + '\r\n'); await w.close();
}
