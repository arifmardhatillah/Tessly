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
Write-Host "Menerbitkan Tessly $v ..." -ForegroundColor Cyan
npm run release
if ($LASTEXITCODE -eq 0) {
  Write-Host "Selesai. Tessly $v sudah terbit. PC yang menjalankan Tessly akan melihat popup update saat dibuka atau dalam 4 jam." -ForegroundColor Green
} else {
  Write-Host 'Rilis gagal. Salin pesan error di atas (tanpa token) dan kirim ke Claude.' -ForegroundColor Red
}
