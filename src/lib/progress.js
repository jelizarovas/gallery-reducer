// Progress lives in this browser's localStorage, so the app needs no server and can be opened any time.
const P = 'gallery-reducer.';
export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(P + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(P + key, JSON.stringify(value)); } catch { /* storage full or blocked: keep going in memory */ } },
};

export const fmt = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
export const ms = t => t ? Date.parse(t.replace(' ', 'T') + 'Z') : NaN;
export function delta(taken, oldest) {
  if (!taken) return 'no date';
  const s = Math.round((ms(taken) - oldest) / 1000); if (s === 0) return '';
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return '+' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${x}s` : `${x}s`);
}
export function parts(item, prefix) {
  const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path, cut = rel.lastIndexOf('/');
  const dir = rel.slice(0, Math.max(cut, 0)).replaceAll('/', '\\'), p = dir.split('\\');
  return { file: rel.slice(cut + 1), dir, shortDir: p.length > 2 ? '…\\' + p.slice(-2).join('\\') : dir, rel: rel.replaceAll('/', '\\') };
}
