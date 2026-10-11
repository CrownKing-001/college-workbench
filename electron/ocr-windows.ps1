# OCR via Windows built-in Windows.Media.Ocr.
# Invoked with env vars OCR_IMG (input image path) and OCR_LANG (e.g. zh-Hans-CN).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:OCR_IMG)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

# Try the requested language first, then fall back to the system profile language.
$engine = $null
if ($env:OCR_LANG) {
  try {
    $langObj = [Windows.Globalization.Language]::new($env:OCR_LANG)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($langObj)
  } catch { $engine = $null }
}
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if ($null -eq $engine) { Write-Error 'No OCR engine available'; exit 3 }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

# Emit one line per text line with its bounding box (x,y,w,h) so the caller can
# reconstruct the table layout. Comma-separated to avoid escaping issues.
# NOTE: WinRT Words is an IVectorView; indexing it directly yields Object[],
# so it must be materialized with @() before indexing.
#
# OCR_MODE=words 时改为逐词输出：课表里相邻格子常被 OCR 连成一行（例如
# 「高 级 语 高 等 数 学 术 英」其实是 3 个格子），只有词级包围盒才能按
# x 坐标把文字重新拆回各自的列。默认仍输出行级，保持校历抽取的既有行为。
if ($env:OCR_MODE -eq 'words') {
  foreach ($line in $result.Lines) {
    foreach ($word in @($line.Words)) {
      $r = $word.BoundingRect
      $wx = [int][double]$r.X
      $wy = [int][double]$r.Y
      $ww = [int][double]$r.Width
      $wh = [int][double]$r.Height
      Write-Output ("$wx,$wy,$ww,$wh," + $word.Text)
    }
  }
} else {
  foreach ($line in $result.Lines) {
    $words = @($line.Words)
    if ($words.Count -eq 0) { continue }
    $first = $words[0]
    $last = $words[$words.Count - 1]
    $x = [int][double]$first.BoundingRect.X
    $y = [int][double]$first.BoundingRect.Y
    $w = [int]([double]$last.BoundingRect.X + [double]$last.BoundingRect.Width - $x)
    $h = [int][double]$first.BoundingRect.Height
    Write-Output ("$x,$y,$w,$h," + $line.Text)
  }
}
