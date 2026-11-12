# Membuat installer lalu menerbitkannya ke GitHub Releases (arifmardhatillah/Tessly).
# Sebelum menjalankan:
#   1. Naikkan "version" di package.json (misal 1.0.0 -> 1.0.1).
#   2. Tulis perubahan di build/release-notes.md (tampil di popup update).
# Lalu: powershell -ExecutionPolicy Bypass -File .\release.ps1
# Skrip akan meminta token GitHub (fine-grained, repo Tessly, izin Contents: Read and write).
# Aman dijalankan ulang: file yang sudah terunggah dilewati, yang belum akan diunggah.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$token = $env:GH_TOKEN
if (-not $token -or -not ($token -match '^(github_pat_|ghp_)')) {
  Write-Host ''
  Write-Host 'Tempel token GitHub Anda (diawali github_pat_), lalu tekan Enter.' -ForegroundColor Yellow
  Write-Host 'Klik kanan di jendela ini untuk menempel. Token tidak terlihat saat ditempel, itu normal.' -ForegroundColor DarkGray
  $secure = Read-Host 'Token' -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not ($token -match '^(github_pat_|ghp_)')) {
    Write-Host 'Token tidak dikenali. Token GitHub diawali github_pat_ atau ghp_.' -ForegroundColor Red
    exit 1
  }
  $env:GH_TOKEN = $token
}

function Fail($msg) {
  Write-Host $msg -ForegroundColor Red
  Write-Host 'Kirim pesan merah di atas ke Claude (tanpa token).' -ForegroundColor DarkGray
  exit 1
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$v"
$repo = 'arifmardhatillah/Tessly'
$api = "https://api.github.com/repos/$repo"
$h = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = 'application/vnd.github+json' }

if (git status --porcelain) { Fail 'Ada perubahan yang belum di-commit. Commit dan push dulu, lalu jalankan lagi.' }

# 1. Tag dibuat lebih dulu: GitHub menolak menerbitkan rilis yang tag-nya belum ada.
Write-Host "[1/4] Tag $tag ..." -ForegroundColor Cyan
$ErrorActionPreference = 'Continue'
git tag $tag 2>$null
git push origin $tag 2>$null
if ($LASTEXITCODE -ne 0) { Fail 'Gagal push tag.' }

# 2. Build, kecuali installer versi ini sudah ada (supaya file yang sudah terunggah tetap cocok).
$exe = "dist\Tessly Setup $v.exe"
$yml = 'dist\latest.yml'
$needBuild = -not (Test-Path $exe) -or -not (Test-Path "$exe.blockmap") -or -not (Test-Path $yml) -or
  -not ((Get-Content $yml -Raw) -match "(?m)^version: $([regex]::Escape($v))\s*$")
if ($needBuild) {
  Write-Host "[2/4] Membuat installer Tessly $v (beberapa menit) ..." -ForegroundColor Cyan
  npm run dist
  if ($LASTEXITCODE -ne 0) { Fail 'Build gagal.' }
} else {
  Write-Host "[2/4] Installer Tessly $v sudah ada, build dilewati." -ForegroundColor Cyan
}
$ErrorActionPreference = 'Stop'

# latest.yml harus cocok dengan installer, kalau tidak update akan ditolak aplikasi.
$sha = [Convert]::ToBase64String([byte[]]((Get-FileHash $exe -Algorithm SHA512).Hash -split '(..)' -ne '' | ForEach-Object { [Convert]::ToByte($_, 16) }))
if (-not (Get-Content $yml -Raw).Contains($sha)) { Fail "latest.yml tidak cocok dengan installer. Hapus folder dist lalu jalankan lagi." }

# 3. Cari rilisnya, atau buat sebagai draft.
Write-Host '[3/4] Mengunggah ke GitHub ...' -ForegroundColor Cyan
try {
  $rel = Invoke-RestMethod -Headers $h "$api/releases?per_page=30" | ForEach-Object { $_ } | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
  if (-not $rel) {
    $body = @{ tag_name = $tag; name = "Tessly $v"; draft = $true } | ConvertTo-Json
    $rel = Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/json' -Body $body "$api/releases"
  }
} catch { Fail "Tidak bisa membuka rilis di GitHub: $($_.Exception.Message)" }

$files = @(
  @{ path = "$exe.blockmap"; name = "Tessly-Setup-$v.exe.blockmap" },
  @{ path = $exe;            name = "Tessly-Setup-$v.exe" },
  @{ path = $yml;            name = 'latest.yml' }
)
foreach ($f in $files) {
  $size = (Get-Item $f.path).Length
  $old = $rel.assets | Where-Object { $_.name -eq $f.name } | Select-Object -First 1
  if ($old -and $old.size -eq $size -and $old.state -eq 'uploaded') {
    Write-Host "      $($f.name): sudah ada, dilewati."
    continue
  }
  try {
    if ($old) { Invoke-RestMethod -Method Delete -Headers $h "$api/releases/assets/$($old.id)" | Out-Null }
    Write-Host "      $($f.name): mengunggah $([math]::Round($size / 1MB, 1)) MB ..."
    $u = "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$([uri]::EscapeDataString($f.name))"
    Invoke-RestMethod -Method Post -Headers $h -ContentType 'application/octet-stream' -InFile $f.path -TimeoutSec 3600 $u | Out-Null
  } catch { Fail "Gagal mengunggah $($f.name): $($_.Exception.Message). Jalankan skrip ini lagi untuk melanjutkan." }
}

# 4. Periksa kelengkapan, baru terbitkan.
try {
  $rel = Invoke-RestMethod -Headers $h "$api/releases/$($rel.id)"
  foreach ($f in $files) {
    $a = $rel.assets | Where-Object { $_.name -eq $f.name }
    if (-not $a -or $a.size -ne (Get-Item $f.path).Length) { Fail "$($f.name) belum lengkap di GitHub. Jalankan skrip ini lagi." }
  }
  Write-Host '[4/4] Menerbitkan ...' -ForegroundColor Cyan
  $body = @{ draft = $false; name = "Tessly $v" } | ConvertTo-Json
  Invoke-RestMethod -Method Patch -Headers $h -ContentType 'application/json' -Body $body "$api/releases/$($rel.id)" | Out-Null
} catch { Fail "Gagal menerbitkan: $($_.Exception.Message)" }

Write-Host "Selesai. Tessly $v sudah terbit lengkap. PC yang menjalankan Tessly akan melihat popup update saat dibuka atau dalam 4 jam." -ForegroundColor Green
