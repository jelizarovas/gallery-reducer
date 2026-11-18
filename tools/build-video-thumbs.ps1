# Makes a small picture for every video (video-thumbs\<id>.jpg in the data folder), taken a fifth of the way in.
# Immich's own thumbnail is the very first frame, which is often black or blurred, and some videos have none.
# Pictures that already exist are skipped, so this can be re-run any time. Rotation flags are respected.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_settings.ps1'); $S = Get-GRSettings
$ffmpeg = Find-GRTool ffmpeg
$dest = Get-DataPath $S 'video-thumbs'; [void][IO.Directory]::CreateDirectory($dest)
$list = Get-Content -LiteralPath (Get-DataPath $S 'videos.json') -Raw | ConvertFrom-Json
$root = $S.Root
$todo = @($list | Where-Object { -not [IO.File]::Exists((Join-Path $dest "$($_.id).jpg")) })
"videos: $($list.Count); thumbnails to make: $($todo.Count)"
$todo | ForEach-Object -ThrottleLimit 10 -Parallel {
  $src = Join-Path $using:root ($_.path -replace '/', '\'); $out = Join-Path $using:dest "$($_.id).jpg"
  $at = [math]::Min([math]::Max([double]$_.seconds * 0.2, 0), 60).ToString('0.##', [Globalization.CultureInfo]::InvariantCulture)
  & $using:ffmpeg -hide_banner -loglevel quiet -y -ss $at -i $src -frames:v 1 -vf 'scale=360:-2' -q:v 5 -- $out 2>$null
  if (-not [IO.File]::Exists($out)) { & $using:ffmpeg -hide_banner -loglevel quiet -y -i $src -frames:v 1 -vf 'scale=360:-2' -q:v 5 -- $out 2>$null }   # very short clips: take the first frame
}
$made = @(Get-ChildItem -LiteralPath $dest -Filter *.jpg)
"thumbnails in place: $($made.Count) of $($list.Count) ({0:N0} MB); could not be made: $($list.Count - $made.Count)" -f (($made | Measure-Object Length -Sum).Sum / 1MB)
