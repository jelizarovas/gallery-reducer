# Builds the look-alike groups the app reviews (lookalike-groups.json in the data folder).
#
# Immich's duplicate detection groups pictures that LOOK alike, which includes different shots of the same scene.
# This script works out which of them are truly the same picture, and suggests which copy to keep:
#   1. every picture in a group gets a 256-bit "difference hash" of its Immich preview (kept in a cache file, so
#      re-runs only fingerprint new pictures);
#   2. two pictures count as the same picture only if their fingerprints differ by at most -Threshold bits, they
#      have the same shape, and (when both are dated) they were taken in the same second;
#   3. within each set of same pictures the keeper is the one with the most pixels, then a real date, then the
#      larger file, then one not in a "Copy" folder, then your own folder preference (KeepOrder in settings.json);
#      the others are marked suggestRemove.
# Google's "-edited" versions and burst frames are never suggested for removal. Nothing is moved by this script.
param([int]$Threshold = 8)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_settings.ps1'); $S = Get-GRSettings

$q = @'
COPY (SELECT a.id, a."duplicateId", a.type, a."originalPath", a."localDateTime", a.duration, e."exifImageWidth" AS w, e."exifImageHeight" AS h, e."fileSizeInByte" AS bytes, e."dateTimeOriginal" AS taken,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='preview' LIMIT 1) AS preview,
 (SELECT f.path FROM asset_file f WHERE f."assetId"=a.id AND f.type='encoded_video' LIMIT 1) AS encoded
 FROM asset a LEFT JOIN asset_exif e ON e."assetId"=a.id WHERE a."duplicateId" IS NOT NULL AND a."deletedAt" IS NULL ORDER BY a."duplicateId") TO STDOUT WITH CSV HEADER
'@
$direct = '.mp4', '.mov', '.m4v', '.webm'
$missing = 0
$items = foreach ($r in (Invoke-ImmichQuery $S $q)) {
  $rel = Convert-ImmichPath $S $r.originalPath -Original; if (-not $rel) { continue }
  $win = Get-FullPath $S $rel; if (-not [IO.File]::Exists($win)) { $missing++; continue }
  $preview = Convert-ImmichPath $S $r.preview
  $video = ''; if ($r.type -eq 'VIDEO') { $video = if ($r.encoded) { Convert-ImmichPath $S $r.encoded } elseif ([IO.Path]::GetExtension($rel).ToLower() -in $direct) { $rel } else { '' } }
  [pscustomobject]@{ id = $r.id; grp = $r.duplicateId; type = $r.type; rel = $rel; win = $win; preview = $preview; previewWin = $(if ($preview) { Get-FullPath $S $preview }); video = $video
    w = [int]$(if ($r.w) { $r.w } else { 0 }); h = [int]$(if ($r.h) { $r.h } else { 0 }); bytes = [int64]$(if ($r.bytes) { $r.bytes } else { 0 })
    taken = $r.taken; shown = $(if ($r.taken) { $r.localDateTime.Substring(0, 19) } else { '' }); sec = (ConvertTo-Seconds $r.duration)
    edited = ($rel -match '-edited(\(\d+\))?\.[^./]+$'); burst = ($rel -match 'BURST|_COVER'); hash = ''; ar = 0.0 }
}
$items = @($items)
if ($items.Count -eq 0) { 'Immich has not grouped any look-alikes yet. In Immich, open Administration > Jobs and run "Duplicate Detection", then run this again.'; Write-Json (Get-DataPath $S 'lookalike-groups.json') @(); return }
"look-alike pictures in Immich: $($items.Count) in $(@($items | Group-Object grp).Count) groups (skipped $missing whose file is gone)"

# ---- fingerprints (cached) ----------------------------------------------------------------------------------------
$cacheFile = Get-DataPath $S 'lookalike-fingerprints.csv'
$cache = @{}; if (Test-Path -LiteralPath $cacheFile) { foreach ($c in Import-Csv -LiteralPath $cacheFile) { $cache[$c.id] = $c } }
$todo = @($items | Where-Object { -not $cache.ContainsKey($_.id) -and $_.previewWin })
if ($todo.Count) {
  "fingerprinting $($todo.Count) new pictures..."
  $new = $todo | ForEach-Object -ThrottleLimit 10 -Parallel {
    Add-Type -AssemblyName System.Drawing
    $hash = ''; $pw = 0; $ph = 0
    try {
      $img = [System.Drawing.Image]::FromFile($_.previewWin)
      try {
        $bmp = [System.Drawing.Bitmap]::new(17, 16, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $ia = [System.Drawing.Imaging.ImageAttributes]::new(); $ia.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $g.DrawImage($img, [System.Drawing.Rectangle]::new(0, 0, 17, 16), 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia); $g.Dispose()
        $sb = [System.Text.StringBuilder]::new(256)
        for ($y = 0; $y -lt 16; $y++) { $prev = $null; for ($x = 0; $x -lt 17; $x++) { $c = $bmp.GetPixel($x, $y); $l = $c.R * 299 + $c.G * 587 + $c.B * 114; if ($x -gt 0) { [void]$sb.Append($(if ($l -gt $prev) { '1' } else { '0' })) }; $prev = $l } }
        $hash = $sb.ToString(); $pw = $img.Width; $ph = $img.Height; $bmp.Dispose()
      } finally { $img.Dispose() }
    } catch { }
    [pscustomobject]@{ id = $_.id; hash = $hash; pw = $pw; ph = $ph }
  }
  foreach ($n in $new) { $cache[$n.id] = $n }
  $cache.Values | Export-Csv -LiteralPath $cacheFile -Encoding utf8
}
foreach ($i in $items) { $c = $cache[$i.id]; if ($c -and $c.hash) { $i.hash = $c.hash; if ([int]$c.ph) { $i.ar = [double]$c.pw / [double]$c.ph } } }

# ---- which copies are the same picture, and which one to keep --------------------------------------------------------
function Ham($a, $b) { $d = 0; for ($k = 0; $k -lt 256; $k++) { if ($a[$k] -ne $b[$k]) { $d++ } }; $d }
function Same($a, $b) {
  if ($a.type -ne $b.type -or -not $a.hash -or -not $b.hash) { return $false }
  if ($a.ar -eq 0 -or [math]::Abs($a.ar - $b.ar) / $a.ar -gt 0.015) { return $false }
  if ($a.type -eq 'VIDEO' -and ($a.sec -eq 0 -or [math]::Abs($a.sec - $b.sec) -gt 1.0)) { return $false }
  # dated pictures must share the second they were taken (whole-hour time-zone shifts allowed): keeps stop-motion frames and rapid sequences apart
  if ($a.taken -and $b.taken) { $s = [math]::Abs(([datetimeoffset]$a.taken - [datetimeoffset]$b.taken).TotalSeconds); if ($s -gt 14 * 3600 -or ($s % 3600) -gt 1) { return $false } }
  (Ham $a.hash $b.hash) -le $Threshold
}
# Optional "KeepOrder" in settings.json: folder patterns, most-preferred first, that break ties between otherwise equal copies
# (for example: keep the copy in an albums folder over the one in an old export).
$keepOrder = @($S.KeepOrder | Where-Object { $_ })
function KeepRank([string]$rel) { for ($k = 0; $k -lt $keepOrder.Count; $k++) { if ($rel -match $keepOrder[$k]) { return $k } }; $keepOrder.Count }
$remove = [System.Collections.Generic.HashSet[string]]::new()
foreach ($g in ($items | Group-Object grp)) {
  $m = @($g.Group | Where-Object { -not $_.edited -and -not $_.burst }); $done = @{}
  foreach ($seed in $m) {
    if ($done[$seed.id]) { continue }
    $cl = [System.Collections.Generic.List[object]]::new(); $cl.Add($seed)       # a set whose members all match each other
    foreach ($o in $m) { if ($o.id -eq $seed.id -or $done[$o.id]) { continue }; $ok = $true; foreach ($c in $cl) { if (-not (Same $c $o)) { $ok = $false; break } }; if ($ok) { $cl.Add($o) } }
    foreach ($c in $cl) { $done[$c.id] = $true }
    if ($cl.Count -lt 2) { continue }
    $sorted = @($cl | Sort-Object @{e = { [int64]$_.w * $_.h }; Descending = $true }, @{e = { [bool]$_.taken }; Descending = $true },
      @{e = { if ($_.bytes -gt 0) { [math]::Floor([math]::Log($_.bytes) / [math]::Log(1.03)) } else { 0 } }; Descending = $true },
      @{e = { [int]($_.rel -match '(?i)( - copy|copy of |\(\d+\)\.[^./]+$|/copy/)') } }, @{e = { KeepRank $_.rel } }, rel)
    foreach ($x in $sorted[1..($sorted.Count - 1)]) { [void]$remove.Add($x.id) }
  }
}

# ---- the list the app reads ------------------------------------------------------------------------------------------
$groups = foreach ($g in ($items | Group-Object grp)) {
  $list = @($g.Group | ForEach-Object { [ordered]@{ id = $_.id; type = $_.type; path = $_.rel; preview = $_.preview; video = $_.video; w = $_.w; h = $_.h; bytes = $_.bytes; taken = $_.shown; seconds = $_.sec; duration = ''; suggestRemove = $remove.Contains($_.id) } } |
    Sort-Object { $_.suggestRemove }, { - ([int64]$_.w * $_.h) }, { - $_.bytes })
  if ($list.Count -lt 2) { continue }
  [ordered]@{ id = $g.Name; suggested = @($list | Where-Object { $_.suggestRemove }).Count; items = $list }
}
$groups = @($groups | Sort-Object { - [math]::Sign($_.suggested) }, { - $_.suggested }, { $_.items[0].path })   # groups with true copies first
$dest = Get-DataPath $S 'lookalike-groups.json'; Write-Json $dest $groups
"groups: $($groups.Count); with a suggestion: $(@($groups | Where-Object { $_.suggested -gt 0 }).Count); pictures: $(($groups | ForEach-Object { $_.items.Count } | Measure-Object -Sum).Sum); suggested for trash: $($remove.Count)"
"written: $dest"
