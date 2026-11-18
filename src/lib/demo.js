// Demo library: a few generated pictures in the browser's private storage (OPFS), laid out like the real one.
// Lets the app be tried (and tested) without touching any real files.
import { CONFIG } from '../config.js';
import { dirAt } from './library.js';

async function picture(hue, label, w = 900, h = 600) {
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue} 60% 35%)`); g.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 18%)`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = `hsl(${(hue + 180) % 360} 80% 70%)`; x.beginPath(); x.arc(w * .5, h * .55, h * .22, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = `bold ${h / 9}px sans-serif`; x.textAlign = 'center'; x.fillText(label, w / 2, h * .2);
  return c.convertToBlob({ type: 'image/jpeg', quality: .85 });
}
async function write(root, path, blob) {
  const p = path.split('/'), name = p.pop(), dir = await dirAt(root, p, true), w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(blob); await w.close();
}

export async function buildDemo() {
  const opfs = await navigator.storage.getDirectory();
  try { await opfs.removeEntry('gallery-reducer-demo', { recursive: true }); } catch { /* first run */ }
  const root = await opfs.getDirectoryHandle('gallery-reducer-demo', { create: true });
  const spec = [
    { hue: 200, label: 'Beach', items: [['2024/2024-07/IMG_1001.jpg', 0, false], ['albums/Summer - Copy/IMG_1001.jpg', 0, true], ['albums/Summer/IMG_1001 (2).jpg', 0, true]] },
    { hue: 110, label: 'Garden', items: [['2024/2024-05/DSC_0041.jpg', 0, false], ['2024/2024-05/DSC_0042.jpg', 1, false], ['2024/2024-05/DSC_0043.jpg', 2, false]] },
    { hue: 20, label: 'Birthday', items: [['2023/2023-11/PXL_2001.jpg', 0, false], ['albums/Party/PXL_2001.jpg', 0, true], ['2023/2023-11/PXL_2002.jpg', 3, false], ['albums/Party/PXL_2002.jpg', 3, true], ['2023/2023-11/PXL_2003.jpg', 7, false]] },
    { hue: 290, label: 'Hike', items: [['2022/2022-09/IMG_3001.jpg', 0, false], ['2022/2022-09/IMG_3002.jpg', 4, false]] },
  ];
  const groups = [];
  let n = 0;
  for (const [gi, s] of spec.entries()) {
    const items = [];
    for (const [rel, sec, suggestRemove] of s.items) {
      const id = `demo-${++n}`, blob = await picture(s.hue + sec * 6, `${s.label} ${sec ? '+' + sec + 's' : ''}`);
      const path = `${CONFIG.photosPrefix}${rel}`, preview = `immich/library/thumbs/${id}.jpg`;
      await write(root, path, blob); await write(root, preview, blob);
      items.push({ id, type: 'IMAGE', path, preview, video: '', w: 900, h: 600, bytes: blob.size, taken: `2024-0${gi + 1}-15 10:30:${String(10 + sec).padStart(2, '0')}`, duration: '', suggestRemove });
    }
    items.sort((a, b) => a.suggestRemove - b.suggestRemove);
    groups.push({ id: `demo-group-${gi + 1}`, suggested: items.filter(i => i.suggestRemove).length, items });
  }
  await write(root, CONFIG.groups, new Blob([JSON.stringify(groups)]));
  // a few copies of a small generated test clip stand in for video recordings
  try {
    const clip = await (await fetch(`${import.meta.env.BASE_URL}demo/clip.mp4`)).blob(), videos = [];
    for (const [i, rel] of ['2024/2024-08/VID_0001.mp4', '2023/2023-12/VID_0002.mp4', 'albums/Party/VID_0003.mp4'].entries()) {
      const id = `demo-video-${i + 1}`, path = `${CONFIG.photosPrefix}${rel}`, preview = `immich/library/thumbs/${id}.jpg`;
      await write(root, path, clip); await write(root, preview, await picture(40 + i * 90, `Video ${i + 1}`, 640, 360));
      videos.push({ id, type: 'VIDEO', path, preview, video: path, w: 640, h: 360, bytes: clip.size, taken: `2024-0${i + 1}-20 18:0${i}:00`, seconds: 20 });
    }
    await write(root, CONFIG.videos, new Blob([JSON.stringify(videos)]));
    // the Gallery lists everything: all demo photos plus the videos, newest first
    const everything = [...groups.flatMap(g => g.items), ...videos].map(({ suggestRemove, ...it }) => it).sort((a, b) => b.taken.localeCompare(a.taken));
    await write(root, CONFIG.library, new Blob([JSON.stringify({ items: everything })]));
  } catch { /* no demo clip available: the Videos mode just shows as empty */ }
  return root;
}
