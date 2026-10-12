<#
.SYNOPSIS
  用自签名证书给打包好的 exe 签名，消除 SmartScreen 的「Windows 已保护你的电脑」拦截。

.DESCRIPTION
  为什么需要这个：
    未签名的程序，Windows SmartScreen 无法核验发布者，第一次运行一定会弹蓝色的
    「Windows 已保护你的电脑」。这不是配置问题，改 electron-builder 的任何选项都没用 ——
    唯一的解法是让 exe 带上一个 Windows 认得的签名。

    买代码签名证书要钱、要企业资质；但如果这个程序主要给**你自己**用，
    自签名证书就够了：把证书装进「受信任的根证书颁发机构」+「受信任的发布者」，
    本机就会把这个 exe 当作已签名且发布者可信的程序，不再拦截。

  证书装在哪里（都不需要管理员权限）：
    · Cert:\CurrentUser\My               —— 私钥（用来签名）
    · Cert:\CurrentUser\Root             —— 受信任的根（让签名链可被验证）
    · Cert:\CurrentUser\TrustedPublisher —— 受信任的发布者（关键：直接放行这个签名者）

  换一台电脑要重新跑一次 -Setup 并导入证书，否则那台机器仍然会拦。

  用法：
    powershell -ExecutionPolicy Bypass -File tools/codesign.ps1 -Setup    # 建证书 + 装信任
    powershell -ExecutionPolicy Bypass -File tools/codesign.ps1 -Sign     # 给 release/ 下的 exe 签名
    powershell -ExecutionPolicy Bypass -File tools/codesign.ps1 -Status   # 查看状态
    powershell -ExecutionPolicy Bypass -File tools/codesign.ps1 -Remove   # 撤销：删证书与信任
#>
[CmdletBinding()]
param(
  [switch]$Setup,
  [switch]$Sign,
  [switch]$Status,
  [switch]$Remove,
  [string]$Subject = 'CN=CollegeDesk Local Signing',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $root 'release' }
$cerDir = Join-Path $root 'electron\build'
$cerPath = Join-Path $cerDir 'codesign.cer'

function Get-SigningCert {
  Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $Subject } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
}

function Install-Trust([System.Security.Cryptography.X509Certificates.X509Certificate2]$cert) {
  foreach ($storeName in @('TrustedPublisher', 'Root')) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'CurrentUser')
    $store.Open('ReadWrite')
    # 已经装过就不重复加，避免堆一堆重复项
    $exists = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if (-not $exists) { $store.Add($cert) }
    $store.Close()
    Write-Host "  已加入 CurrentUser\$storeName"
  }
}

function Invoke-Setup {
  Write-Host '=== 准备自签名代码签名证书 ==='
  $cert = Get-SigningCert
  if ($cert) {
    Write-Host "  复用已有证书：$($cert.Thumbprint)"
  } else {
    $cert = New-SelfSignedCertificate `
      -Type CodeSigningCert `
      -Subject $Subject `
      -KeyUsage DigitalSignature `
      -KeyExportPolicy Exportable `
      -CertStoreLocation 'Cert:\CurrentUser\My' `
      -NotAfter (Get-Date).AddYears(10)
    Write-Host "  已创建证书：$($cert.Thumbprint)"
  }

  New-Item -ItemType Directory -Force -Path $cerDir | Out-Null
  # 导出公钥证书，方便拷到别的机器导入信任
  Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT -Force | Out-Null
  Write-Host "  公钥证书已导出：$cerPath"

  Install-Trust $cert
  Write-Host ''
  Write-Host '✅ 完成。之后用 -Sign 签名，或直接 npm run dist（已自动接上签名步骤）。'
  Write-Host '   别的电脑要用：把上面那个 .cer 拷过去，双击 → 安装证书 → 本地计算机 →'
  Write-Host '   放到「受信任的根证书颁发机构」和「受信任的发布者」。'
}

function Invoke-Sign {
  $cert = Get-SigningCert
  if (-not $cert) {
    Write-Warning "没有找到证书（$Subject）。先跑一次：npm run sign:setup"
    exit 1
  }

  # 只签「用户会双击的那个 exe」：便携 exe、解包目录里的主程序、免安装版里的主程序。
  # locales/ 里那堆小 exe 不需要签，签了只是浪费时间。
  $targets = @()
  $targets += Get-ChildItem -Path $OutDir -Filter '*.exe' -File -ErrorAction SilentlyContinue
  $targets += Get-ChildItem -Path (Join-Path $OutDir 'win-unpacked') -Filter '*.exe' -File -ErrorAction SilentlyContinue
  foreach ($d in Get-ChildItem -Path $OutDir -Directory -ErrorAction SilentlyContinue) {
    $targets += Get-ChildItem -Path $d.FullName -Filter '*.exe' -File -ErrorAction SilentlyContinue
  }
  $targets = $targets | Sort-Object FullName -Unique

  if (-not $targets) {
    Write-Warning "在 $OutDir 下没找到 exe，先打包：npm run dist"
    exit 1
  }

  Write-Host '=== 签名 ==='
  $ok = 0; $bad = 0
  foreach ($f in $targets) {
    try {
      $r = Set-AuthenticodeSignature -FilePath $f.FullName -Certificate $cert -HashAlgorithm SHA256
      if ($r.Status -eq 'Valid') {
        Write-Host "  OK   $($f.Name)"
        $ok++
      } else {
        Write-Host "  FAIL $($f.Name) → $($r.Status)"
        $bad++
      }
    } catch {
      Write-Host "  FAIL $($f.Name) → $_"
      $bad++
    }
  }
  Write-Host ''
  Write-Host "签名完成：成功 $ok，失败 $bad"
  if ($bad -gt 0) { exit 1 }
}

function Invoke-Status {
  Write-Host '=== 证书状态 ==='
  $cert = Get-SigningCert
  if ($cert) {
    Write-Host "  签名证书   : $($cert.Thumbprint)"
    Write-Host "  主题       : $($cert.Subject)"
    Write-Host "  有效期至   : $($cert.NotAfter)"
  } else {
    Write-Host '  签名证书   : 未创建'
  }
  foreach ($storeName in @('TrustedPublisher', 'Root')) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'CurrentUser')
    $store.Open('ReadOnly')
    $hit = $store.Certificates | Where-Object { $_.Subject -eq $Subject }
    $store.Close()
    Write-Host ("  {0,-16}: {1}" -f $storeName, $(if ($hit) { '已安装' } else { '未安装' }))
  }
  Write-Host ''
  Write-Host '=== 产物签名状态 ==='
  if (Test-Path $OutDir) {
    Get-ChildItem -Path $OutDir -Filter '*.exe' -File -ErrorAction SilentlyContinue | ForEach-Object {
      $s = Get-AuthenticodeSignature $_.FullName
      Write-Host ("  {0,-8} {1}" -f $s.Status, $_.Name)
    }
  } else {
    Write-Host "  （$OutDir 不存在，还没打包过）"
  }
}

function Invoke-Remove {
  Write-Host '=== 撤销自签名证书与信任 ==='
  $certs = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $Subject }
  foreach ($storeName in @('TrustedPublisher', 'Root')) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'CurrentUser')
    $store.Open('ReadWrite')
    foreach ($c in $certs) {
      $hit = $store.Certificates | Where-Object { $_.Thumbprint -eq $c.Thumbprint }
      if ($hit) { $store.Remove($c); Write-Host "  已从 $storeName 移除 $($c.Thumbprint)" }
    }
    $store.Close()
  }
  foreach ($c in $certs) {
    Remove-Item "Cert:\CurrentUser\My\$($c.Thumbprint)" -Force
    Write-Host "  已删除私钥证书 $($c.Thumbprint)"
  }
  if (Test-Path $cerPath) { Remove-Item $cerPath -Force; Write-Host "  已删除 $cerPath" }
  Write-Host '完成。已签名的 exe 仍带着旧签名，但本机不再信任它。'
}

if ($Setup) { Invoke-Setup }
elseif ($Sign) { Invoke-Sign }
elseif ($Status) { Invoke-Status }
elseif ($Remove) { Invoke-Remove }
else {
  Write-Host '请指定一个动作：-Setup / -Sign / -Status / -Remove'
  Write-Host '  例：powershell -ExecutionPolicy Bypass -File tools/codesign.ps1 -Setup'
  exit 2
}
