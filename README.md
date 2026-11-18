# Gallery Reducer

A keyboard- and controller-driven tool for thinning out a large photo and video library, a little at a time.

- **Look-alikes** — goes through groups of near-identical photos one group at a time, with the best copy
  pre-selected, so a decision is usually one key press.
- **Videos** — one recording at a time: scrub, mark the parts worth keeping, then keep, trash or defer.
- **Gallery** — everything in the library, newest first, with favorites (a shortlist, for example for printing).

It runs entirely in your browser. There is no server and no account, and **nothing leaves your computer**: the
page reads your library folder directly. **Nothing is ever deleted**: rejected files are moved to a trash folder
that you empty yourself, and every move can be undone.

Try it without installing anything: open https://jelizarovas.github.io/gallery-reducer/ and click **Try the demo** (or add `?demo` to the address). The
demo uses a few generated pictures and clips kept in the browser's private storage.

---

## What you need

| | |
|---|---|
| Windows | The helper scripts are PowerShell and use Windows imaging. The app itself is plain web code. |
| Chrome or Edge | The app uses the File System Access API, which Firefox and Safari do not have. |
| [Immich](https://immich.app) in Docker | It supplies thumbnails, dates and look-alike detection. Your photos must be an **external library** in Immich (files Immich indexes in place), not uploads it manages itself. |
| [PowerShell 7](https://aka.ms/powershell) (`pwsh`) | Runs the helper scripts. |
| [ffmpeg](https://ffmpeg.org) | `winget install Gyan.FFmpeg`. Used for video sizes, thumbnails and cutting. |
| Node.js 20+ | Only to run or build the app yourself. |

### One folder for everything

The browser is given exactly **one folder**, so that folder has to contain both your photos and Immich's own data
folder (where its thumbnails live). For example:

```
D:\media\                 <- the folder you choose in the browser
  photos\                 <- your library (Immich external library)
  immich\library\         <- Immich's data (UPLOAD_LOCATION), contains "thumbs"
  trash\                  <- rejected files end up here (created for you)
  gallery-reducer\        <- the app's lists, video thumbnails and logs (created for you)
```

The folder names are up to you; setup asks for them.

---

## Setup

1. **Get Immich ready.** Add your photo folder as an external library and let it finish scanning. Then, under
   Administration → Jobs, run **Duplicate Detection** (this is what finds the look-alikes).
2. **Get the app.**
   ```
   git clone https://github.com/jelizarovas/gallery-reducer.git
   cd gallery-reducer
   npm install
   ```
3. **Run setup.** Double-click `tools\setup.cmd` (or run `pwsh tools\setup.ps1`). It asks where your library is,
   checks that Docker, Immich and ffmpeg can be reached, and builds the lists the app reads. The first run takes
   a few minutes on a large library. It only reads from Immich; it changes nothing there.
4. **Start the app.**
   ```
   npm run dev
   ```
   Open http://localhost:4748 in Chrome or Edge, click **Choose folder** and pick the same folder you gave to
   setup. Chrome asks twice: once to view the folder and once to save changes (the app moves rejected files into
   the trash folder).

Run `tools\setup.cmd` again whenever Immich has indexed new files; it reuses your answers and only redoes what
changed.

To host it instead of running it locally, `npm run build` produces a static site in `dist/` that can be served
from anywhere, GitHub Pages included. The hosted page still only works on a computer where setup has been run,
because the photos never leave that computer.

---

## How it stays safe

- **Trash, not delete.** A rejected photo or video is moved to the trash folder, keeping its folder structure.
  Empty that folder yourself when you are sure.
- **Undo.** Every decision can be undone, which moves the files back.
- **A log.** Each move and restore is appended to `lookalikes-reduced.csv` in the data folder.
- **Never overwrites.** If a file of the same name is already in the trash, the new one gets a number.
- **Copy, check, then remove.** Where the browser cannot move a file directly it copies it, verifies the copy and
  only then removes the original.
- **Immich's own files are off limits.** Only files in your photo library are listed; files Immich manages itself
  are never touched.
- **Your progress stays put.** Decisions, favorites and settings are kept in the browser's storage on that
  computer. Clearing the site's data in the browser clears your progress (not your files).

---

## Using it

Press `?` in any mode for the full list of keys and controller buttons. The essentials:

### Look-alikes

Each screen is one group. Green badges are kept, red ones go to trash; the suggestion is already marked.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Keep the marked, trash the rest | `Y` / `Enter` | A |
| Keep all | `N` | X |
| Trash all | `T` / `Delete` | hold LB or RB + B |
| Defer to the end of the line | `D` | Y |
| Undo | `U` | View |
| Flip the previewed photo between keep and trash | `Space`, click | B |
| Keep only one photo | `1`–`9` | hold LB or RB + A |
| Move the preview | `↑` `↓`, hover | D-pad / left stick |
| Previous / next group | `←` `→`, mouse back / forward | LB / RB |
| Favorite | `F` | right-stick click |

A suggestion is only made when two files are the same picture: near-identical fingerprints, the same shape and
taken in the same second. The copy with the most pixels is kept. Different shots of the same scene are grouped
but never pre-marked.

### Videos

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Play / pause | `Space`, click | A |
| Fast forward / rewind while held | hold `L` / `J` | hold RT / LT |
| Scrub | `←` `→` `↑` `↓`, drag the timeline, tilt the mouse wheel | left stick |
| Slice: start, then end (repeat for more) | `S` | LB |
| Adjust a slice | drag it, or drag its ends | |
| Keep (with the slices, if any) | `Y` / `Enter` | X |
| Trash | `T` / `Delete` | B |
| Defer / undo | `D` / `U` | Y / View |
| Speed | `<` `>` | hold LB or RB + D-pad left / right |
| Turn a quarter turn | `R` | hold LB or RB + D-pad up |
| Loop, mute, zoom | `Q`, `M`, `Z` | hold LB or RB + D-pad down, left-stick click, right-stick click |
| Save the frame as a picture | `G` | hold LB or RB + right-stick click |
| Full screen | `Alt+Enter`, double-click | |
| Previous / next video | `[` `]` | D-pad left / right |

**Cuts are applied afterwards.** While reviewing, slices are only noted. Run `tools\apply-trims.cmd` to perform
them: each video is cut without re-encoding, several slices are joined into one video, the result is checked,
and the original goes to the trash folder. Because nothing is re-encoded, a slice can begin a second or two
before your mark (`-Reencode` gives exact cuts). Turning a video is lossless for `.mp4`, `.mov` and `.m4v`.

### Gallery

Click a thumbnail to preview it; hover a video for a quick slideshow. `F` (or A) stars it, `R` turns it,
`Enter` (or X) opens a video in the editor. The Favorites filter shows everything starred.

### The panel on the left

`Alt+L` shows or hides the whole queue; `Alt+V` switches between list and grid. Sort, group and filter there —
the order you choose is the order you review in. With grouping by folder, click a folder heading to see
everything in it.

---

## Project layout

```
src/                 the app (React + Vite, no backend)
  LookAlikes.jsx     look-alike review
  Videos.jsx         video editor
  Gallery.jsx        gallery and favorites
  ui.jsx             shared pieces (panel, thumbnails, input handling)
  lib/library.js     folder access: reading, moving, logging
  gamepad/           controller support
tools/               PowerShell helpers that build the lists from Immich
  setup.ps1          asks where things are, then runs the builders below
  build-lookalikes.ps1, build-videos.ps1, build-video-thumbs.ps1, build-library.ps1
  apply-trims.ps1    performs the noted video cuts with ffmpeg
```

`tools\settings.json` (your folders) is created by setup and is not part of the repository. No library data,
thumbnails or progress are stored in this project.

## Limits

- Windows, Chrome or Edge, and Immich are required for real use; other setups only get the demo.
- Progress lives in one browser on one computer and does not sync.
- Videos in formats a browser cannot play (`.avi`, `.mts`, `.mpg`, `.wmv` …) play from Immich's converted copy,
  which can be lower resolution than the original.
- `.mpg`, `.mpeg` and `.wmv` files cannot be turned by `apply-trims`.
