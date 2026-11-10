# Membuat installer lalu menerbitkannya ke GitHub Releases (arifmardhatillah/Tessly).
# Sebelum menjalankan:
#   1. Naikkan "version" di package.json (misal 1.2.0 -> 1.3.0).
#   2. Tulis perubahan di build/release-notes.md (tampil di popup update).
#   3. $env:GH_TOKEN = '<token GitHub>'   (fine-grained, repo Tessly, izin Contents: Read and write)
# Lalu: .\release.ps1
if (-not $env:GH_TOKEN) {
  Write-Host 'GH_TOKEN belum diisi. Contoh: $env:GH_TOKEN = "github_pat_..."' -ForegroundColor Red
  exit 1
}
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Menerbitkan Tessly $v ..." -ForegroundColor Cyan
npm run release
if ($LASTEXITCODE -eq 0) {
  Write-Host "Selesai. Semua PC yang menjalankan Tessly akan melihat popup update $v dalam 4 jam (atau saat dibuka)." -ForegroundColor Green
}
