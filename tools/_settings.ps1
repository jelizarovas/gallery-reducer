# Shared by every script in this folder: reads tools\settings.json (written by setup.ps1) and offers a few helpers.
# Nothing here is specific to one computer; all machine details live in settings.json, which is not part of the repository.

function Get-GRSettings {
  $file = Join-Path $PSScriptRoot 'settings.json'
  if (-not (Test-Path -LiteralPath $file)) { throw "Gallery Reducer has not been set up on this computer yet. Run setup.cmd in this folder first." }
  $s = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  foreach ($need in 'Root', 'PhotosDir', 'ImmichDir', 'TrashDir', 'DataDir') { if (-not $s.$need) { throw "settings.json is missing '$need'. Run setup.cmd again." } }
  $s
}

# forward-slash path relative to the library root, as the app wants it
function ConvertTo-Rel([string]$dir, [string]$rest) { (($dir -replace '\\', '/').Trim('/') + '/' + $rest.TrimStart('/')) }

# A path as Immich stores it (inside its container) -> path relative to the library root, or $null if it lies elsewhere.
# -Original: the file must be in the photo library itself. Files Immich manages on its own (uploads, and the video
# halves it extracts from motion photos) are left out: the app must never move those behind Immich's back.
function Convert-ImmichPath($S, [string]$p, [switch]$Original) {
  if (-not $p) { return $null }
  if ($p.StartsWith($S.ContainerPhotos.TrimEnd('/') + '/')) { return ConvertTo-Rel $S.PhotosDir $p.Substring($S.ContainerPhotos.TrimEnd('/').Length) }
  if (-not $Original -and $p.StartsWith($S.ContainerData.TrimEnd('/') + '/')) { return ConvertTo-Rel $S.ImmichDir $p.Substring($S.ContainerData.TrimEnd('/').Length) }
  $null
}
function Get-FullPath($S, [string]$rel) { Join-Path $S.Root ($rel -replace '/', '\') }
function Get-DataPath($S, [string]$name) { $d = Join-Path $S.Root $S.DataDir; [void][IO.Directory]::CreateDirectory($d); Join-Path $d $name }

# Runs a "COPY (...) TO STDOUT WITH CSV HEADER" query against Immich's database and returns the rows as objects.
function Invoke-ImmichQuery($S, [string]$sql) {
  $out = & $S.Docker exec $S.DbContainer psql -U $S.DbUser -d $S.DbName -c $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not read Immich's database (container '$($S.DbContainer)'). Is Docker running and Immich started?`n$out" }
  $out | ConvertFrom-Csv
}

function Find-GRTool([string]$name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue; if ($c) { return $c.Source }
  $w = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($w) { return $w.FullName }
  throw "$name was not found. Install ffmpeg (for example: winget install Gyan.FFmpeg) and run this again."
}

# Immich stores a video's length in milliseconds; older versions used HH:MM:SS.mmm
function ConvertTo-Seconds([string]$duration) {
  if ($duration -match '^\d+$') { return [math]::Round([double]$duration / 1000, 1) }
  if ($duration -match '^(\d+):(\d+):([\d.]+)') { return [math]::Round([int]$Matches[1] * 3600 + [int]$Matches[2] * 60 + [double]$Matches[3], 1) }
  0.0
}

function Write-Json([string]$path, $value, [int]$depth = 6) { [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $value -Depth $depth -Compress), (New-Object Text.UTF8Encoding($false))) }
