// The pictures on the Home page, drawn as SVG so they stay sharp at any size and follow the app's colours.
import { useId } from 'react';

/* ---------- drawings ---------- */

// a stand-in "photo": sky, sun and two hills, tinted by hue
function Pic({ x, y, w, h, hue = 210, r = 0, dim = false, rx = 6 }) {
  const id = 'p' + useId().replace(/:/g, '');
  return (
    <g transform={`rotate(${r} ${x + w / 2} ${y + h / 2})`} opacity={dim ? 0.32 : 1}>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx={rx} /></clipPath>
      <rect x={x + 1} y={y + 2} width={w} height={h} rx={rx} fill="#000" opacity=".35" />
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} fill={`hsl(${hue} 46% 44%)`} />
        <circle cx={x + w * 0.7} cy={y + h * 0.34} r={h * 0.16} fill="#ffd9a8" />
        <path d={`M${x} ${y + h * 0.78} Q${x + w * 0.3} ${y + h * 0.42} ${x + w * 0.62} ${y + h * 0.8} L${x + w * 0.62} ${y + h} L${x} ${y + h}Z`} fill={`hsl(${hue} 42% 30%)`} />
        <path d={`M${x + w * 0.3} ${y + h} Q${x + w * 0.72} ${y + h * 0.5} ${x + w} ${y + h * 0.76} L${x + w} ${y + h}Z`} fill={`hsl(${hue} 44% 22%)`} />
      </g>
    </g>
  );
}
const Pill = ({ x, y, w, text, bg, fg }) => (<g><rect x={x} y={y} width={w} height="16" rx="8" fill={bg} /><text x={x + w / 2} y={y + 11.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={fg} letterSpacing=".5">{text}</text></g>);

// before -> after: a heap of repeated shots on the left, a tidy shelf on the right
export function HeroArt() {
  const heap = [[16, 40, 150, -14], [70, 22, 150, 9], [34, 96, 150, 5], [96, 84, 28, -8], [22, 156, 28, 11], [84, 150, 28, -4], [128, 132, 330, 13], [58, 210, 330, -9], [118, 206, 200, 6], [14, 232, 200, -3]];
  const shelf = [[0, 0, 150], [1, 0, 28], [0, 1, 330], [1, 1, 200], [0, 2, 95], [1, 2, 265]];
  return (
    <svg className="art hero-art" viewBox="0 0 560 330" role="img" aria-label="A messy pile of repeated photos becomes a short, tidy set">
      <rect x="0" y="0" width="560" height="330" rx="28" fill="var(--surface)" />
      {heap.map(([x, y, hue, r], i) => <Pic key={i} x={x + 14} y={y} w={104} h={70} hue={hue} r={r} />)}
      <text x="124" y="316" textAnchor="middle" fontSize="12" fill="var(--on-var)">Before: copies, bursts, long videos</text>
      <circle cx="282" cy="160" r="22" fill="var(--primary-cont)" />
      <path className="go" d="M272 160h18m-7-8 8 8-8 8" stroke="var(--on-primary-cont)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {shelf.map(([c, r, hue], i) => <Pic key={i} x={330 + c * 108} y={36 + r * 82} w={98} h={70} hue={hue} />)}
      <path d="M418 44l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#ffd54f" />
      <path d="M526 208l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#ffd54f" />
      <text x="433" y="316" textAnchor="middle" fontSize="12" fill="var(--on-var)">After: one of each, the best one</text>
    </svg>
  );
}
export function LookArt() {
  return (
    <svg className="art" viewBox="0 0 320 180" role="img" aria-label="Three copies of one photo: one marked keep, two marked trash">
      <rect width="320" height="180" rx="16" fill="#0b0c0f" />
      <Pic x={16} y={22} w={136} h={92} hue={205} rx={8} />
      <Pic x={164} y={22} w={66} h={92} hue={205} dim rx={8} /><Pic x={238} y={22} w={66} h={92} hue={205} dim rx={8} />
      <Pill x={22} y={28} w={40} text="KEEP" bg="var(--keep)" fg="var(--on-keep)" />
      <Pill x={169} y={28} w={44} text="TRASH" bg="var(--trash)" fg="var(--on-trash)" /><Pill x={243} y={28} w={44} text="TRASH" bg="var(--trash)" fg="var(--on-trash)" />
      <rect x="16" y="132" width="170" height="30" rx="15" fill="var(--keep)" />
      <text x="34" y="151.5" fontSize="11.5" fontWeight="500" fill="var(--on-keep)">Keep marked, trash the rest</text>
      <rect x="196" y="137" width="20" height="20" rx="4" fill="var(--surface-top)" /><text x="206" y="151.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--on)">Y</text>
      <circle cx="238" cy="147" r="11" fill="#3c8b4b" /><text x="238" y="151" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">A</text>
    </svg>
  );
}
export function VideoArt() {
  return (
    <svg className="art" viewBox="0 0 320 180" role="img" aria-label="A video with two short parts marked to keep on its timeline">
      <rect width="320" height="180" rx="16" fill="#0b0c0f" />
      <Pic x={16} y={14} w={288} h={106} hue={265} rx={10} />
      <circle cx="160" cy="67" r="20" fill="#000" opacity=".55" /><path d="M154 57l16 10-16 10z" fill="#fff" />
      <rect x="16" y="136" width="288" height="14" rx="7" fill="var(--surface-top)" />
      <rect x="52" y="136" width="62" height="14" rx="4" fill="var(--keep)" /><rect x="186" y="136" width="46" height="14" rx="4" fill="var(--keep)" />
      <rect x="140" y="130" width="3" height="26" rx="1.5" fill="#fff" />
      <text x="16" y="170" fontSize="10.5" fill="var(--on-var)">4:12 recorded</text><text x="304" y="170" textAnchor="end" fontSize="10.5" fontWeight="500" fill="var(--keep)">0:38 kept</text>
    </svg>
  );
}
export function GalleryArt() {
  const hues = [150, 28, 330, 200, 95, 265, 20, 180, 300, 50, 230, 120], stars = [1, 6, 8];
  return (
    <svg className="art" viewBox="0 0 320 180" role="img" aria-label="A grid of photos, a few of them starred">
      <rect width="320" height="180" rx="16" fill="#0b0c0f" />
      {hues.map((hue, i) => { const x = 16 + (i % 4) * 74, y = 14 + Math.floor(i / 4) * 52; return (
        <g key={i}><Pic x={x} y={y} w={66} h={46} hue={hue} rx={6} dim={!stars.includes(i) && i % 5 === 4} />
          {stars.includes(i) && <path transform={`translate(${x + 48} ${y + 4})`} d="M7 0l2.1 4.4 4.8.7-3.5 3.3.9 4.8L7 10.9 2.7 13.2l.9-4.8L.1 5.1l4.8-.7z" fill="#ffd54f" />}</g>); })}
    </svg>
  );
}
