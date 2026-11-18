// Everything is relative to the one folder the user grants in the browser. These are the defaults (the demo uses
// them); a real library overrides them with gallery-reducer/config.json, which tools/setup.ps1 writes.
export const CONFIG = {
  groups: 'gallery-reducer/lookalike-groups.json',      // built by tools/build-lookalikes.ps1
  videos: 'gallery-reducer/videos.json',                // built by tools/build-videos.ps1
  library: 'gallery-reducer/library.json',              // built by tools/build-library.ps1 (everything, for the Gallery)
  videoThumbs: 'gallery-reducer/video-thumbs',          // built by tools/build-video-thumbs.ps1 (a frame from inside each video)
  trims: 'gallery-reducer/video-trims.json',            // cuts waiting for tools/apply-trims.ps1
  trash: 'trash/photo-lookalikes',                      // rejected look-alike copies are moved here, never deleted
  videoTrash: 'trash/gallery-videos',                   // rejected videos are moved here
  log: 'gallery-reducer/lookalikes-reduced.csv',        // one line per move / restore
  photosPrefix: 'photos/',
  rootPath: '',                                         // the library folder's full path on disk, for copying paths
};
export const CONFIG_FILE = 'gallery-reducer/config.json';

export const DEMO = new URLSearchParams(location.search).has('demo');
export const K = k => (DEMO ? 'demo.' : '') + k;        // demo progress is kept apart from the real one
if (DEMO) for (const k of ['decisions', 'deferred', 'sprint', 'group', 'filter', 'onlySug', 'videoDecisions', 'videoDeferred', 'video', 'videoFilter', 'favorites', 'mode', 'speeds', 'rotations', 'videoView', 'groupView', 'galleryFolder']) localStorage.removeItem('gallery-reducer.demo.' + k);   // the demo starts fresh each time
