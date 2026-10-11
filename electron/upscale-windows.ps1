# Upscale an image before OCR. Dense tables (like school calendars) OCR poorly
# at small sizes, so we enlarge and boost contrast first.
# Invoked with env vars OCR_IMG (source), OCR_OUT (dest png), OCR_SCALE (multiplier).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($env:OCR_IMG)
$scale = [double]$env:OCR_SCALE

# 限制最长边，避免放大后超出 Windows OCR 的 MaxImageDimension（实测大图会报
# "Image dimensions are too large"）。目标最长边 4000px，既保证小字清晰，又不越界。
$maxSide = 4000.0
$long = [double][Math]::Max($src.Width, $src.Height)
$effective = $scale
if (($long * $scale) -gt $maxSide) { $effective = $maxSide / $long }

$nw = [int][Math]::Round($src.Width * $effective)
$nh = [int][Math]::Round($src.Height * $effective)
if ($nw -lt 1) { $nw = 1 }
if ($nh -lt 1) { $nh = 1 }

$bmp = New-Object System.Drawing.Bitmap($nw, $nh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, $nw, $nh)
$g.Dispose()

# Grayscale + contrast stretch (1.35x around 128) to make strokes crisper.
$rect = New-Object System.Drawing.Rectangle(0, 0, $nw, $nh)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $nh)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
for ($i = 0; $i -lt $bytes.Length; $i += 4) {
  $b = $bytes[$i]; $gg = $bytes[$i + 1]; $r = $bytes[$i + 2]
  $lum = [int](0.299 * $r + 0.587 * $gg + 0.114 * $b)
  $v = [int](($lum - 128) * 1.35 + 128)
  if ($v -lt 0) { $v = 0 } elseif ($v -gt 255) { $v = 255 }
  $bytes[$i] = $v; $bytes[$i + 1] = $v; $bytes[$i + 2] = $v
}
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

$bmp.Save($env:OCR_OUT, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()
Write-Output "Upscaled to ${nw}x${nh} -> $env:OCR_OUT"
