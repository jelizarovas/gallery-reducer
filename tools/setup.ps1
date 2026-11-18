# One-time setup for Gallery Reducer on this computer.
# Asks where things are, checks what is needed, saves the answers, then builds the lists the app reads.
# Run it again any time (for example after Immich has indexed new photos): it only rebuilds what changed.
#
#   setup.cmd                          asks questions
#   setup.ps1 -Root D:\media -Yes      no questions, defaults for everything else
param(
  [string]$Root,                      # the ONE folder you will give the app in the browser; it must contain everything below
  [string]$PhotosDir,                 # your photo library inside it (the folder Immich reads as an external library)
  [string]$ImmichDir,                 # Immich's own data folder inside it (the one holding "thumbs" and "encoded-video")
  [string]$TrashDir,                  # where rejected files are moved; created if missing
  [string]$DataDir,                   # where the lists, video thumbnails and logs go
  [string]$ContainerPhotos,           # the photo library's path as seen inside the Immich container
  [string]$ContainerData = '/data',   # Immich's data path inside its container
  [string]$DbContainer = 'immich_postgres', [string]$DbUser = 'postgres', [string]$DbName = 'immich',
  [switch]$Yes,                       # accept defaults without asking
  [switch]$SkipBuild                  # only save the settings
)
$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'settings.json'
$old = if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } else { $null }
function Ask([string]$question, [string]$default) { if ($Yes) { return $default }; $a = Read-Host "$question [$default]"; if ($a) { $a.Trim().Trim('"') } else { $default } }
function Pick($given, [string]$name, [string]$fallback) { if ($given) { $given } elseif ($old.$name) { $old.$name } else { $fallback } }

''
'Gallery Reducer setup'
'---------------------'
'The app works on ONE folder that you grant to it in the browser. That folder has to contain both your'
'photo library and Immich''s data folder (thumbnails), so the app can read both. Nothing leaves this computer.'
''
$Root = Ask 'Library folder (the one you will choose in the browser)' (Pick $Root 'Root' (Get-Location).Path)
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "Folder not found: $Root" }
$PhotosDir = Ask 'Photo library, inside that folder' (Pick $PhotosDir 'PhotosDir' 'photos')
$ImmichDir = Ask "Immich's data folder, inside that folder (contains 'thumbs')" (Pick $ImmichDir 'ImmichDir' 'immich\library')
$TrashDir = Ask 'Trash folder, inside that folder (rejected files are moved here, never deleted)' (Pick $TrashDir 'TrashDir' 'trash')
$DataDir = Ask 'Folder for the app''s lists, video thumbnails and logs, inside that folder' (Pick $DataDir 'DataDir' 'gallery-reducer')
$ContainerPhotos = Ask 'The photo library''s path inside the Immich container (the external library path in Immich)' (Pick $ContainerPhotos 'ContainerPhotos' '/mnt/photos')

foreach ($pair in @(@($PhotosDir, 'photo library'), @($ImmichDir, "Immich's data folder"))) { if (-not (Test-Path -LiteralPath (Join-Path $Root $pair[0]) -PathType Container)) { throw "The $($pair[1]) was not found at $(Join-Path $Root $pair[0])" } }
if (-not (Test-Path -LiteralPath (Join-Path $Root (Join-Path $ImmichDir 'thumbs')))) { throw "No 'thumbs' folder inside $(Join-Path $Root $ImmichDir). That should be the folder Immich stores its own files in (UPLOAD_LOCATION)." }
[void][IO.Directory]::CreateDirectory((Join-Path $Root $TrashDir)); [void][IO.Directory]::CreateDirectory((Join-Path $Root $DataDir))

''
'Checking what is needed...'
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) { $d = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'; if (Test-Path $d) { $docker = $d } }
if (-not $docker) { throw 'Docker was not found. Immich has to be running in Docker for the lists to be built.' }
"  Docker:  $docker"
. (Join-Path $PSScriptRoot '_settings.ps1')
"  ffmpeg:  $(Find-GRTool ffmpeg)"
"  ffprobe: $(Find-GRTool ffprobe)"

$settings = [ordered]@{ Root = $Root; PhotosDir = $PhotosDir; ImmichDir = $ImmichDir; TrashDir = $TrashDir; DataDir = $DataDir
  ContainerPhotos = $ContainerPhotos; ContainerData = $ContainerData; DbContainer = $DbContainer; DbUser = $DbUser; DbName = $DbName; Docker = $docker
  KeepOrder = @($old.KeepOrder | Where-Object { $_ }) }   # optional, edit by hand: folder patterns to prefer when two copies are otherwise equal
[IO.File]::WriteAllText($file, ($settings | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
$S = Get-GRSettings
$n = (Invoke-ImmichQuery $S 'COPY (SELECT count(*) AS n FROM asset WHERE "deletedAt" IS NULL) TO STDOUT WITH CSV HEADER').n
"  Immich:  $n photos and videos in its database"

# What the app needs to know, in a small file inside the library folder (the app looks for gallery-reducer/config.json).
$rel = { param($dir, $name) ConvertTo-Rel $dir $name }
$config = [ordered]@{
  rootPath = $Root; photosPrefix = (ConvertTo-Rel $PhotosDir '')
  groups = (& $rel $DataDir 'lookalike-groups.json'); videos = (& $rel $DataDir 'videos.json'); library = (& $rel $DataDir 'library.json')
  trims = (& $rel $DataDir 'video-trims.json'); videoThumbs = (& $rel $DataDir 'video-thumbs'); log = (& $rel $DataDir 'lookalikes-reduced.csv')
  trash = (& $rel $TrashDir 'photo-lookalikes'); videoTrash = (& $rel $TrashDir 'gallery-videos')
}
$cfgDir = Join-Path $Root 'gallery-reducer'; [void][IO.Directory]::CreateDirectory($cfgDir)
[IO.File]::WriteAllText((Join-Path $cfgDir 'config.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
"  Saved:   tools\settings.json and $(Join-Path $cfgDir 'config.json')"
if ($SkipBuild) { ''; 'Settings saved. Lists were not rebuilt (-SkipBuild).'; return }

''
'Building the lists (the first run can take several minutes)...'
foreach ($step in @(@('build-lookalikes.ps1', 'Look-alike photo groups'), @('build-videos.ps1', 'Videos'), @('build-video-thumbs.ps1', 'Video thumbnails'), @('build-library.ps1', 'Gallery (everything)'))) {
  ''; "== $($step[1])"
  & (Join-Path $PSScriptRoot $step[0])
}
''
'Done. Open the app in Chrome or Edge, click "Choose folder" and pick:'
"  $Root"
