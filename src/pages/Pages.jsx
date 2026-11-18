// The pages around the app itself: Home (what it is), Setup (how to get going, and why each step is needed),
// Privacy and Terms. Each is a route; they share one frame with the top bar and the footer.
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui.jsx';
import { HeroArt, LookArt, VideoArt, GalleryArt } from './art.jsx';

const REPO = 'https://github.com/jelizarovas/gallery-reducer';
const GAMES = 'https://jelizarovas.github.io/games-reducer/';
const Out = ({ href, children, ...rest }) => <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;

/* ---------- frame ---------- */

function Frame({ children }) {
  const { pathname } = useLocation();
  const tab = ({ isActive }) => 'w-link' + (isActive ? ' on' : '');
  return (
    <div className="app"><div className="welcome" key={pathname}>
      <nav className="w-top">
        <Link className="w-brand" to="/"><Icon n="photo_library" /> Gallery Reducer</Link>
        <span className="spacer" />
        <NavLink className={tab} to="/" end><Icon n="home" /> <span>Home</span></NavLink>
        <NavLink className={tab} to="/setup"><Icon n="checklist" /> <span>Setup</span></NavLink>
        <Out className="w-link" href={REPO}><Icon n="code" /> <span>GitHub</span></Out>
      </nav>
      <main className="w-main">{children}</main>
      <div className="w-foot">
        <span className="copy">© 2026 jelizarovas · MIT licence</span>
        <span className="spacer" />
        <Link to="/setup">Setup</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
        <Out href={REPO}>Source</Out><Out href={REPO + '/issues'}>Report a problem</Out>
        <Out className="sister" href={GAMES} title="The same idea for a ROM collection"><Icon n="sports_esports" /> Games Reducer</Out>
      </div>
    </div></div>
  );
}

// the buttons that get you into the app; shown on Home and at the end of Setup
function Actions({ saved, opened, error, onPick, onReconnect, onDemo, onContinue, center }) {
  const supported = 'showDirectoryPicker' in window;
  return (
    <>
      <div className={'w-actions' + (center ? ' center' : '')}>
        {opened ? <button className="filled big" onClick={onContinue}><Icon n="play_arrow" /> Continue reviewing</button> : <>
          {saved && supported && <button className="filled big" onClick={onReconnect}><Icon n="folder_open" /> Reopen “{saved.name}”</button>}
          {supported && <button className={(saved ? 'tonal' : 'filled') + ' big'} onClick={onPick}><Icon n="folder" /> Choose folder</button>}
          <button className="tonal big" onClick={onDemo}><Icon n="play_circle" /> Try the demo</button>
        </>}
      </div>
      {!supported && !opened && <p className="w-note err"><Icon n="error" /> <span>This browser can’t open local folders. Use Chrome or Edge on a computer, or try the demo.</span></p>}
      {error && <p className="w-note err"><Icon n="info" /> <span>{error}</span></p>}
    </>
  );
}

/* ---------- Home ---------- */

const MODES = [
  { art: <LookArt />, icon: 'burst_mode', title: 'Look-alikes', lead: 'One group of near-identical photos at a time.',
    points: ['The best copy is already marked, so most groups are one key press', 'Different shots of one scene are grouped but never pre-marked: you choose', 'Stop-motion frames and edited versions are left alone'] },
  { art: <VideoArt />, icon: 'movie', title: 'Videos', lead: 'Keep the 30 seconds that matter, not the 4 minutes around them.',
    points: ['Scrub, wind and mark one or several parts to keep', 'Turn sideways clips, slow down or speed up, save a frame as a picture', 'Largest first, so the first hour frees the most space'] },
  { art: <GalleryArt />, icon: 'grid_view', title: 'Gallery & favorites', lead: 'Everything that is left, newest first.',
    points: ['Star the ones worth printing or sharing as you go', 'Filter to photos, videos, favorites or one folder', 'Jump from any video straight into the editor'] },
];
const PROMISES = [
  ['cloud_off', 'Nothing is uploaded', 'The page reads your folder directly. Your photos never leave this computer, and there is no account.'],
  ['delete_forever', 'Nothing is deleted', 'Rejected files are moved to a trash folder. You empty it yourself, when you are sure.'],
  ['undo', 'Everything can be undone', 'Undo puts the files back where they were. Every move is written to a log.'],
  ['schedule', 'Stop whenever you like', 'Progress is saved in this browser. Ten minutes today, ten next week: it picks up where you left off.'],
];
const FLOW = [
  ['build', 'Set up once', 'About 15 minutes: free tools on your own PC sort the library into lists this page can read.'],
  ['touch_app', 'Decide a little at a time', 'Keep, trash or defer with one key or one controller button. Stop and come back whenever.'],
  ['delete_sweep', 'Empty the trash when sure', 'Rejects wait in a trash folder. Nothing is gone until you empty it yourself.'],
];
const TIPS = [
  ['timer', 'Little and often', 'Start a sprint: ten minutes, or 25 groups. Thousands of groups go quickly at a few seconds each.'],
  ['bolt', 'Trust the suggestion', 'When the marked copy looks right, press Y and move on. Flip one with Space only when it is wrong.'],
  ['watch_later', 'Defer, don’t dither', 'Unsure? Press D. The group goes to the end of the line and you keep your pace.'],
  ['sd_storage', 'Videos first for space', 'Videos are sorted largest first. Trimming a handful often frees more than a thousand photos.'],
  ['star', 'Star as you go', 'Press F on anything you love. The Favorites filter becomes your print list.'],
  ['help', 'Press ? anywhere', 'Each mode lists all of its keys and controller buttons.'],
];

export function Home(act) {
  return (
    <Frame>
      <section className="w-hero">
        <div>
          <h1>A photo library you actually want to open.</h1>
          <p className="w-sub">Years of phone backups leave five copies of the same shot and hours of video nobody watches. Gallery Reducer puts them in front of you one small decision at a time, until what is left is the good stuff.</p>
          <Actions {...act} />
          <p className="w-note"><Icon n="lock" /> <span>Free, runs in your browser, works on your own files. First time? <Link to="/setup">Setup takes about 15 minutes</Link>, or try the demo now.</span></p>
        </div>
        <HeroArt />
      </section>

      <section className="w-promises">
        {PROMISES.map(([icon, title, text]) => <div key={title} className="w-promise"><span className="w-ico"><Icon n={icon} /></span><div><b>{title}</b><p>{text}</p></div></div>)}
      </section>

      <section>
        <h2>Three ways to cut it down</h2>
        <div className="w-modes">
          {MODES.map(m => (
            <article key={m.title} className="w-mode">
              {m.art}
              <h3><Icon n={m.icon} /> {m.title}</h3>
              <p className="lead">{m.lead}</p>
              <ul>{m.points.map(p => <li key={p}><Icon n="check" /> {p}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>How it goes</h2>
        <div className="w-flow">
          {FLOW.map(([icon, title, text], i) => <div key={title} className="w-flowstep"><span className="num">{i + 1}</span><div><b><Icon n={icon} /> {title}</b><p>{text}</p></div></div>)}
        </div>
        <div className="w-actions"><Link className="w-cta" to="/setup"><Icon n="checklist" /> See the setup steps</Link></div>
      </section>

      <section>
        <h2>Getting the most out of it</h2>
        <div className="w-tips">
          {TIPS.map(([icon, title, text]) => <div key={title} className="w-tip"><span className="w-ico sm"><Icon n={icon} /></span><div><b>{title}</b><p>{text}</p></div></div>)}
        </div>
      </section>

      <section className="w-end">
        <h2>Start with ten minutes.</h2>
        <p className="w-intro">Nothing you do here is final until you empty the trash folder yourself.</p>
        <Actions {...act} center />
      </section>
    </Frame>
  );
}

/* ---------- Setup ---------- */

const TAGS = { req: 'Required', look: 'For Look-alikes', opt: 'Optional' };
// every step says what to do, and then why: what it does for you and what a web page alone could not
const STEPS = [
  { tag: 'req', title: 'Install Immich and add your photos',
    body: <>Install <Out href="https://immich.app">Immich</Out> (free; it runs in Docker Desktop, also free), add your photo folder as an <b>external library</b> and let the scan finish. Keep your photos and Immich’s data folder inside <b>one parent folder</b>.</>,
    why: <>Immich does the heavy work once, so reviewing is instant afterwards. It makes small previews so thousands of pictures load at once, reads the dates, and converts old video formats so they play in a browser. A web page alone would have to open every full-size file on every visit.</> },
  { tag: 'look', title: 'Run Duplicate Detection in Immich',
    body: <>Administration → Jobs → Duplicate Detection. Skip this if you only want Videos and Gallery.</>,
    why: <>This is the pass that compares every photo with every other one and groups the near-identical ones. Those groups are exactly what Look-alikes shows you; without it there is nothing to review.</> },
  { tag: 'req', title: 'Install PowerShell 7 and ffmpeg',
    body: <>Both free. In a terminal:<code>winget install Microsoft.PowerShell</code><code>winget install Gyan.FFmpeg</code></>,
    why: <>PowerShell runs the setup script in the next step. ffmpeg measures each video, makes the video thumbnails and later performs your cuts: a browser can play a video but cannot rewrite the file.</> },
  { tag: 'req', title: 'Download Gallery Reducer and run setup',
    body: <>Get it from <Out href={REPO}>GitHub</Out> (Code → Download ZIP, or <code className="inline">git clone</code>), then double-click <code className="inline">tools\setup.cmd</code> and answer where your library is.</>,
    why: <>A web page is not allowed to talk to Immich’s database, so setup copies what Immich found into list files inside your folder, which the page can read. It only reads from Immich and changes nothing there.</> },
  { tag: 'req', title: 'Choose your folder, in Chrome or Edge',
    body: <>Click <b>Choose folder</b> below and pick the parent folder from step 1. The browser asks twice: to view the folder, and to save changes.</>,
    why: <>Chrome and Edge can be given access to exactly one folder you pick, which is how rejects get moved to the trash folder with no server and no upload. That is also why everything has to sit under one parent folder.</> },
];
const EXTRAS = [
  ['sports_esports', 'Plug in a controller', 'An Xbox-style pad works as soon as you press a button. Every action has one, so you can review from the sofa.'],
  ['content_cut', 'Apply your video cuts', <>Only if you trimmed anything: run <code className="inline">tools\apply-trims.cmd</code>. Cuts are made without re-encoding and the originals go to the trash folder.</>],
  ['sync', 'Refresh after a big session', <>Rescan the library in Immich, then run <code className="inline">setup.cmd</code> again. It remembers your answers.</>],
  ['event', 'Put a sprint in your calendar', <>Add a link that opens straight into a timed sprint, for example ten minutes:<code>#/look-alikes?sprint=10</code>Put it after this page’s address.</>],
  ['terminal', 'Run it from your own computer', <>Instead of this page: install Node.js, then <code className="inline">npm install</code> and <code className="inline">npm run dev</code> in the app folder.</>],
];

export function Setup(act) {
  return (
    <Frame>
      <section className="w-pagehead">
        <h1>Set it up once</h1>
        <p className="w-sub">Five steps, about 15 minutes plus the time Immich needs to scan your library. You need a Windows PC. Everything here is free, and the demo needs none of it.</p>
      </section>
      <section className="w-setup">
        <ol className="w-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}><span className="num">{i + 1}</span>
              <div><h3>{s.title} <span className={'tag ' + s.tag}>{TAGS[s.tag]}</span></h3><p>{s.body}</p>
                <p className="why"><Icon n="lightbulb" /> <span><b>Why:</b> {s.why}</span></p></div></li>
          ))}
        </ol>
        <div className="w-extras">
          <h3 className="w-side">Later, if you want <span className="tag opt">Optional</span></h3>
          {EXTRAS.map(([icon, title, text]) => <div key={title} className="w-extra"><span className="w-ico sm"><Icon n={icon} /></span><div><b>{title}</b><p>{text}</p></div></div>)}
        </div>
      </section>
      <section className="w-end">
        <h2>Ready?</h2>
        <p className="w-intro">Pick the folder you gave to setup, or look around the demo first.</p>
        <Actions {...act} center />
      </section>
    </Frame>
  );
}

/* ---------- Privacy, Terms ---------- */

export function Privacy() {
  return (
    <Frame>
      <section className="w-pagehead"><h1>Privacy</h1><p className="w-sub">Short version: your photos never leave your computer, and nobody is tracking you.</p></section>
      <section className="w-doc">
        <h3><Icon n="home_storage" /> Your photos and videos stay on your computer</h3>
        <p>Your browser reads them straight from the folder you choose. They are never uploaded, and there is no server of ours to upload them to. Immich and the setup scripts also run only on your computer.</p>
        <h3><Icon n="visibility_off" /> No account, no ads, no tracking</h3>
        <p>The app sets no cookies and has no analytics.</p>
        <h3><Icon n="save" /> What is saved, and where</h3>
        <p>Your decisions, favorites and settings, and the permission for your folder, are kept in this browser’s storage on this computer. Clearing this site’s data in the browser removes them (not your files).</p>
        <h3><Icon n="public" /> Who can see that you visited</h3>
        <p>GitHub hosts this page and Google serves its fonts and icons, so both receive an ordinary web request, including your IP address. Neither receives anything about your library.</p>
      </section>
    </Frame>
  );
}

export function Terms() {
  return (
    <Frame>
      <section className="w-pagehead"><h1>Terms</h1><p className="w-sub">A free tool, offered as it is. Please keep a backup.</p></section>
      <section className="w-doc">
        <h3><Icon n="lock_open" /> Free and open source</h3>
        <p>Released under the <Out href={REPO + '/blob/main/LICENSE'}>MIT licence</Out>: use it, change it, share it.</p>
        <h3><Icon n="report" /> No warranty</h3>
        <p>It is provided as is. The author is not liable for lost or damaged files or any other loss from using it.</p>
        <h3><Icon n="backup" /> Keep a backup</h3>
        <p>Back up your library before a big clean-up, and look through the trash folder before you empty it. Emptying it is your decision and cannot be undone.</p>
        <h3><Icon n="person" /> Your own files</h3>
        <p>Use it on your own files, or files you are allowed to manage.</p>
        <h3><Icon n="handshake" /> Independent</h3>
        <p>This is an independent project, not affiliated with Immich, Google, Microsoft or Xbox.</p>
      </section>
    </Frame>
  );
}
