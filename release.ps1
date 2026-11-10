# Membuat installer lalu menerbitkannya ke GitHub Releases (arifmardhatillah/Tessly).
# Sebelum menjalankan:
#   1. Naikkan "version" di package.json (misal 1.0.0 -> 1.0.1).
#   2. Tulis perubahan di build/release-notes.md (tampil di popup update).
# Lalu: powershell -ExecutionPolicy Bypass -File .\release.ps1
# Skrip akan meminta token GitHub (fine-grained, repo Tessly, izin Contents: Read and write).

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

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$v"
$repo = 'arifmardhatillah/Tessly'
$h = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = 'application/vnd.github+json' }

if (git status --porcelain) {
  Write-Host 'Ada perubahan yang belum di-commit. Commit dan push dulu, lalu jalankan lagi.' -ForegroundColor Red
  exit 1
}

# 1. Tag dibuat lebih dulu: GitHub menolak menerbitkan rilis yang tag-nya belum ada.
Write-Host "Membuat tag $tag ..." -ForegroundColor Cyan
git tag $tag 2>$null
git push origin $tag
if ($LASTEXITCODE -ne 0) { Write-Host 'Gagal push tag.' -ForegroundColor Red; exit 1 }

# 2. Build dan unggah ke rilis draft.
Write-Host "Membuat installer Tessly $v dan mengunggahnya ..." -ForegroundColor Cyan
npm run release
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Rilis gagal. Salin pesan error di atas (tanpa token) dan kirim ke Claude.' -ForegroundColor Red
  exit 1
}

# 3. Terbitkan draft agar terlihat oleh aplikasi.
$rel = Invoke-RestMethod -Headers $h "https://api.github.com/repos/$repo/releases?per_page=30" | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
if (-not $rel) { Write-Host "Rilis $tag tidak ditemukan di GitHub." -ForegroundColor Red; exit 1 }
$body = @{ draft = $false; name = "Tessly $v" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Headers $h -ContentType 'application/json' -Body $body "https://api.github.com/repos/$repo/releases/$($rel.id)" | Out-Null
Write-Host "Selesai. Tessly $v sudah terbit. PC yang menjalankan Tessly akan melihat popup update saat dibuka atau dalam 4 jam." -ForegroundColor Green
