# Builds the full list for the Gallery (library.json in the data folder): every photo and video Immich knows about,
# newest first. Kept compact (one array per item) because it can hold tens of thousands of entries. Thumbnail and
# preview paths are derived from the id:  <thumbs>/<id[0..1]>/<id[2..3]>/<id>_thumbnail.webp  and  ..._preview.jpeg
# Run build-videos.ps1 first: video sizes and lengths are taken from its list.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_settings.ps1'); $S = Get-GRSettings
$q = @'
COPY (SELECT a.id, a.type, a."originalPath", a."localDateTime", a.duration, e."exifImageWidth" AS w, e."exifImageHeight" AS h, e."fileSizeInByte" AS bytes, e."dateTimeOriginal" AS taken,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='thumbnail' LIMIT 1) AS thumb,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='encoded_video' LIMIT 1) AS encoded
 FROM asset a LEFT JOIN asset_exif e ON e."assetId"=a.id WHERE a."deletedAt" IS NULL AND a.type IN ('IMAGE','VIDEO') ORDER BY a."localDateTime" DESC) TO STDOUT WITH CSV HEADER
'@
$direct = '.mp4', '.mov', '.m4v', '.webm'
$vid = @{}; $vfile = Get-DataPath $S 'videos.json'
if (Test-Path -LiteralPath $vfile) { foreach ($v in (Get-Content -LiteralPath $vfile -Raw | ConvertFrom-Json)) { $vid[$v.id] = $v } }
$base = ''; $thumbExt = '_thumbnail.webp'; $missing = 0
$items = foreach ($r in (Invoke-ImmichQuery $S $q)) {
  $rel = Convert-ImmichPath $S $r.originalPath -Original; if (-not $rel) { continue }
  if (-not [IO.File]::Exists((Get-FullPath $S $rel))) { $missing++; continue }
  if (-not $base -and $r.thumb -match '^(.*)/[^/]+/[^/]+/[^/]+(_thumbnail\.\w+)$') { $base = Convert-ImmichPath $S ($Matches[1] + '/x'); $base = $base.Substring(0, $base.Length - 2); $thumbExt = $Matches[2] }
  $v = $vid[$r.id]
  $sec = if ($v) { [double]$v.seconds } else { ConvertTo-Seconds $r.duration }
  $video = 0   # 0 = cannot play in a browser, 1 = play the original, otherwise the path of Immich's converted copy
  if ($r.type -eq 'VIDEO') { $video = if ($r.encoded) { Convert-ImmichPath $S $r.encoded } elseif ([IO.Path]::GetExtension($rel).ToLower() -in $direct) { 1 } else { 0 } }
  , @($r.id, $(if ($r.type -eq 'VIDEO') { 'V' } else { 'I' }), $rel, [int]$(if ($v) { $v.w } elseif ($r.w) { $r.w } else { 0 }), [int]$(if ($v) { $v.h } elseif ($r.h) { $r.h } else { 0 }),
    [int64]$(if ($r.bytes) { $r.bytes } else { 0 }), $(if ($r.taken) { $r.localDateTime.Substring(0, 19) } else { '' }), $sec, $video)
}
$doc = [ordered]@{ thumbs = $base; thumbExt = $thumbExt; fields = @('id', 'type', 'path', 'w', 'h', 'bytes', 'taken', 'seconds', 'video'); items = @($items) }
$dest = Get-DataPath $S 'library.json'; Write-Json $dest $doc 4
"items: $(@($items).Count) (photos $(@($items | Where-Object { $_[1] -eq 'I' }).Count), videos $(@($items | Where-Object { $_[1] -eq 'V' }).Count)); skipped (file gone): $missing"
"written: $dest ({0:N1} MB)" -f ((Get-Item -LiteralPath $dest).Length / 1MB)
