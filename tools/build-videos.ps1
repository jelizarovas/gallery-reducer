# Builds the video list the app reads (videos.json in the data folder) from Immich's database, largest first.
# Each video is also measured with ffprobe: Immich records the stored frame size, which ignores rotation (a phone
# video shot upright is still "1920x1080"), and it has no length for some files.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_settings.ps1'); $S = Get-GRSettings
$ffprobe = Find-GRTool ffprobe
$q = @'
COPY (SELECT a.id, a."originalPath", a."localDateTime", a.duration, e."exifImageWidth" AS w, e."exifImageHeight" AS h, e."dateTimeOriginal" AS taken,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='preview' LIMIT 1) AS preview,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='encoded_video' LIMIT 1) AS encoded
 FROM asset a LEFT JOIN asset_exif e ON e."assetId"=a.id WHERE a.type='VIDEO' AND a."deletedAt" IS NULL) TO STDOUT WITH CSV HEADER
'@
$missing = 0
$rows = foreach ($r in (Invoke-ImmichQuery $S $q)) {
  $rel = Convert-ImmichPath $S $r.originalPath -Original; if (-not $rel) { continue }
  $win = Get-FullPath $S $rel; if (-not [IO.File]::Exists($win)) { $missing++; continue }
  $r | Add-Member -NotePropertyMembers @{ rel = $rel; win = $win } -PassThru
}
$rows = @($rows)

# size as displayed (rotation applied) and length, straight from the file
$shown = @{}
$probed = $rows | ForEach-Object -ThrottleLimit 12 -Parallel {
  try {
    $j = & $using:ffprobe -v error -select_streams v:0 -show_entries 'stream=width,height:stream_side_data=rotation:stream_tags=rotate:format=duration' -of json -- $_.win 2>$null | ConvertFrom-Json
    $s = $j.streams[0]; $len = 0.0; [void][double]::TryParse("$($j.format.duration)", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$len)
    $rot = 0; if ($s.tags.rotate) { $rot = [int]$s.tags.rotate }; foreach ($sd in @($s.side_data_list)) { if ($null -ne $sd.rotation) { $rot = [int]$sd.rotation } }
    $turned = ([math]::Abs($rot) % 180) -eq 90
    [pscustomobject]@{ id = $_.id; w = $(if ($turned) { $s.height } else { $s.width }); h = $(if ($turned) { $s.width } else { $s.height }); len = $len }
  } catch { }
}
foreach ($p in $probed) { if ($p.w -and $p.h) { $shown[$p.id] = $p } }

$direct = '.mp4', '.mov', '.m4v', '.webm'   # containers a browser can usually play as they are
$items = foreach ($r in $rows) {
  $sec = ConvertTo-Seconds $r.duration; if ($sec -le 0 -and $shown[$r.id].len) { $sec = [math]::Round([double]$shown[$r.id].len, 1) }
  $video = if ($r.encoded) { Convert-ImmichPath $S $r.encoded } elseif ([IO.Path]::GetExtension($r.rel).ToLower() -in $direct) { $r.rel } else { '' }
  [ordered]@{ id = $r.id; type = 'VIDEO'; path = $r.rel; preview = "$(Convert-ImmichPath $S $r.preview)"; video = "$video"
    w = [int]$(if ($shown[$r.id]) { $shown[$r.id].w } elseif ($r.w) { $r.w } else { 0 }); h = [int]$(if ($shown[$r.id]) { $shown[$r.id].h } elseif ($r.h) { $r.h } else { 0 })
    bytes = [int64]([IO.FileInfo]$r.win).Length; taken = $(if ($r.taken) { $r.localDateTime.Substring(0, 19) } else { '' }); seconds = $sec }
}
$items = @($items | Sort-Object { - $_.bytes })
$dest = Get-DataPath $S 'videos.json'; Write-Json $dest $items 4
"videos: $($items.Count), {0:N1} GB, {1:N1} hours; playable in the browser: $(@($items | Where-Object { $_.video }).Count); unreadable: $($items.Count - $shown.Count); skipped (file gone): $missing" -f (($items | ForEach-Object { $_.bytes } | Measure-Object -Sum).Sum / 1GB), (($items | ForEach-Object { $_.seconds } | Measure-Object -Sum).Sum / 3600)
"written: $dest"
