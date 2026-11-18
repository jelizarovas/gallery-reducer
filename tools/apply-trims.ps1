# Performs the cuts noted in Gallery Reducer (video-trims.json in the data folder).
# For each video: cut with ffmpeg (stream copy, no re-encoding), check the result, move the ORIGINAL to
# trash\video-trims (same folder structure, never overwritten), and put the cut version in its place under the
# original name with the original dates. Nothing is deleted. A cut that fails its check leaves the original alone.
#   -Reencode   exact cut points (re-encodes video to H.264 / audio to AAC; slower, slight quality cost)
#   -WhatIf     list what would be done
param(
  [string]$Root, [string]$Trims, [string]$TrashDir, [string]$Log, [string]$PhotosDir,   # all default to what setup saved in settings.json
  [switch]$Reencode,
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
if (-not $Root) {
  . (Join-Path $PSScriptRoot '_settings.ps1'); $S = Get-GRSettings
  $Root = $S.Root; $PhotosDir = $S.PhotosDir; $Trims = Join-Path $S.DataDir 'video-trims.json'; $TrashDir = Join-Path $S.TrashDir 'video-trims'; $Log = Join-Path $S.DataDir 'video-trims-applied.csv'
}
if (-not $PhotosDir) { $PhotosDir = 'photos' }; if (-not $Trims) { $Trims = 'gallery-reducer\video-trims.json' }; if (-not $TrashDir) { $TrashDir = 'trash\video-trims' }; if (-not $Log) { $Log = 'gallery-reducer\video-trims-applied.csv' }
$photoPrefix = ($PhotosDir -replace '\\', '/').Trim('/') + '/'
function Find-Tool($name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue; if ($c) { return $c.Source }
  $w = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($w) { return $w.FullName }; throw "$name not found. Install ffmpeg (winget install Gyan.FFmpeg) and run this again."
}
$ffmpeg = Find-Tool ffmpeg; $ffprobe = Find-Tool ffprobe
$file = Join-Path $Root $Trims
if (-not (Test-Path -LiteralPath $file)) { 'No cuts are waiting (no trims file).'; return }
$list = @(Get-Content -LiteralPath $file -Raw | ConvertFrom-Json)
if ($list.Count -eq 0) { 'No cuts are waiting.'; return }
function Unique($path) { if (-not (Test-Path -LiteralPath $path)) { return $path }; $d = Split-Path $path; $b = [IO.Path]::GetFileNameWithoutExtension($path); $e = [IO.Path]::GetExtension($path); for ($i = 2; ; $i++) { $c = Join-Path $d "$b ($i)$e"; if (-not (Test-Path -LiteralPath $c)) { return $c } } }
function Seconds($path) { $o = & $ffprobe -v error -show_entries format=duration -of csv=p=0 -- $path 2>$null; $v = 0.0; [void][double]::TryParse(("$o").Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$v); $v }
$inv = [Globalization.CultureInfo]::InvariantCulture
$left = [System.Collections.Generic.List[object]]::new(); $done = 0; $freed = 0L
foreach ($t in $list) {
  $src = Join-Path $Root ($t.path -replace '/', '\')
  # one slice (older files: start/end) or several, which are joined into one video in order
  $segs = @(if ($t.segments) { $t.segments } else { [pscustomobject]@{ start = $t.start; end = $t.end } })
  $want = ($segs | ForEach-Object { [double]$_.end - [double]$_.start } | Measure-Object -Sum).Sum
  if (-not (Test-Path -LiteralPath $src)) { "skipped (file not found): $($t.path)"; continue }
  if ($want -lt 0.5) { "skipped (cut shorter than half a second): $($t.path)"; $left.Add($t); continue }
  if ($WhatIf) { "would cut $($t.path): keep {0:N1}s of {1:N1}s in $($segs.Count) slice(s)$(if ($t.removeAudio) { ', without sound' })$(if ($t.rotate) { ", turned $($t.rotate) degrees" })" -f $want, [double]$t.duration; $left.Add($t); continue }
  $item = Get-Item -LiteralPath $src
  $tmp = Unique (Join-Path $item.DirectoryName ($item.BaseName + '.cutting' + $item.Extension))
  [string[]]$codec = if ($Reencode) { @('-c:v', 'libx264', '-crf', '18', '-preset', 'medium') + $(if ($t.removeAudio) { @() } else { @('-c:a', 'aac', '-b:a', '192k') }) } else { @('-c', 'copy') }
  [string[]]$audio = if ($t.removeAudio) { @('-an') } else { @('-map', '0:a?') }
  $failed = $false
  # Turning a video filmed sideways or upside down ($t.rotate = degrees clockwise).
  #   .mp4 / .mov / .m4v : only the "display rotation" flag is changed, so the picture itself is untouched (lossless)
  #   .avi / .mts / .3gp / .mkv : these have no such flag, so the picture is re-encoded (H.264, high quality)
  #   anything else (.mpg, .wmv ...) : cannot be turned here; the entry is left waiting
  $turn = ((([int]$t.rotate) % 360) + 360) % 360
  [string[]]$rotIn = @(); [string[]]$rotOut = @()
  if ($turn) {
    $ext = $item.Extension.ToLower()
    if ($ext -in '.mp4', '.mov', '.m4v') {
      $s = (& $ffprobe -v error -select_streams v:0 -show_entries 'stream_side_data=rotation:stream_tags=rotate' -of json -- $src | ConvertFrom-Json).streams[0]
      $now = 0; if ($s.tags.rotate) { $now = [int]$s.tags.rotate }; foreach ($sd in @($s.side_data_list)) { if ($null -ne $sd.rotation) { $now = - [int]$sd.rotation } }   # clockwise degrees already flagged
      $total = ((($now + $turn) % 360) + 360) % 360
      $rotIn = @('-display_rotation:v:0', ([string](- $total)))                    # the option counts counter-clockwise
    } elseif ($ext -in '.avi', '.mts', '.m2ts', '.3gp', '.mkv') {
      $vf = switch ($turn) { 90 { 'transpose=1' } 180 { 'hflip,vflip' } 270 { 'transpose=2' } }
      $rotOut = @('-vf', $vf, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium') + $(if ($t.removeAudio) { @() } else { @('-c:a', 'copy') })
    } else { "skipped (a $ext file cannot be turned): $($t.path)"; $left.Add($t); continue }
  }
  if ($segs.Count -eq 1) {
    $ss = ([double]$segs[0].start).ToString('0.###', $inv); $len = $want.ToString('0.###', $inv)
    [string[]]$one = if ($rotOut.Count) { $rotOut } else { $codec }
    & $ffmpeg -hide_banner -loglevel error -y -ss $ss @rotIn -i $src -t $len -map 0:v:0 @audio @one -map_metadata 0 -avoid_negative_ts make_zero -- $tmp
    $failed = $LASTEXITCODE -ne 0
  } else {
    # working pieces are written inside the trash folder, so nothing ever needs deleting
    $work = Join-Path $Root (Join-Path $TrashDir (Join-Path '_work' ([guid]::NewGuid().ToString('N')))); [void][IO.Directory]::CreateDirectory($work)
    $n = 0; $lines = foreach ($g in $segs) {
      $n++; $part = Join-Path $work ("part{0:000}{1}" -f $n, $item.Extension)
      $ss = ([double]$g.start).ToString('0.###', $inv); $len = ([double]$g.end - [double]$g.start).ToString('0.###', $inv)
      & $ffmpeg -hide_banner -loglevel error -y -ss $ss -i $src -t $len -map 0:v:0 @audio @codec -avoid_negative_ts make_zero -- $part
      if ($LASTEXITCODE -ne 0) { $failed = $true }
      "file '" + ($part -replace "'", "'\''") + "'"
    }
    $listFile = Join-Path $work 'parts.txt'; [IO.File]::WriteAllLines($listFile, $lines, (New-Object Text.UTF8Encoding($false)))
    [string[]]$join = if ($rotOut.Count) { $rotOut } else { @('-c', 'copy') }
    if (-not $failed) { & $ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 @rotIn -i $listFile @join -- $tmp; $failed = $LASTEXITCODE -ne 0 }
  }
  $got = if (Test-Path -LiteralPath $tmp) { Seconds $tmp } else { 0 }
  # stream copy starts each slice on the keyframe before its mark, so the result may run a little long; it must never be much short
  $ok = -not $failed -and $got -ge ($want - 1.5) -and $got -le ($want + 20 * $segs.Count) -and (Get-Item -LiteralPath $tmp).Length -gt 0
  if (-not $ok) {
    "FAILED, original untouched: $($t.path)  (wanted {0:N1}s, got {1:N1}s)" -f $want, $got
    if (Test-Path -LiteralPath $tmp) { $f = Unique (Join-Path $Root (Join-Path $TrashDir (Join-Path 'failed' $item.Name))); [void][IO.Directory]::CreateDirectory((Split-Path $f)); [IO.File]::Move($tmp, $f) }
    $left.Add($t); continue
  }
  $rel = $(if ($t.path.StartsWith($photoPrefix)) { $t.path.Substring($photoPrefix.Length) } else { $t.path }) -replace '/', '\'
  $bin = Unique (Join-Path $Root (Join-Path $TrashDir $rel)); [void][IO.Directory]::CreateDirectory((Split-Path $bin))
  $created = $item.CreationTime; $written = $item.LastWriteTime; $before = $item.Length
  [IO.File]::Move($src, $bin)              # original goes to trash first...
  [IO.File]::Move($tmp, $src)              # ...then the cut takes its name
  $new = Get-Item -LiteralPath $src; $new.CreationTime = $created; $new.LastWriteTime = $written
  $done++; $freed += ($before - $new.Length)
  $line = [pscustomobject]@{ Time = (Get-Date).ToString('s'); File = $src; OriginalMovedTo = $bin; Slices = (($segs | ForEach-Object { "$($_.start)-$($_.end)" }) -join ' '); Sound = $(if ($t.removeAudio) { 'removed' } else { 'kept' }); Turned = [int]$t.rotate; SecondsBefore = $t.duration; SecondsAfter = [math]::Round($got, 2); BytesBefore = $before; BytesAfter = $new.Length; Mode = $(if ($Reencode) { 'reencode' } else { 'copy' }) }
  $line | Export-Csv -LiteralPath (Join-Path $Root $Log) -Append -Encoding utf8
  "cut: $($t.path)  {0:N1}s -> {1:N1}s, {2:N1} MB -> {3:N1} MB" -f [double]$t.duration, $got, ($before / 1MB), ($new.Length / 1MB)
}
if (-not $WhatIf) { [IO.File]::WriteAllText($file, (ConvertTo-Json -InputObject @($left) -Depth 4), (New-Object Text.UTF8Encoding($false))) }
"done: $done cut, {0:N1} MB freed, $($left.Count) still waiting" -f ($freed / 1MB)
