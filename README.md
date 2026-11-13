# Tessly: AI Token Tracker

*Know every token you spend.*

Aplikasi desktop Windows untuk memantau pemakaian token **Claude Code** di komputer ini, per hari, per bulan, dan per tahun. Angka naik begitu Claude Code selesai membalas.

## Cara kerja

1. Tessly berjalan di system tray dan memantau log Claude Code di `%USERPROFILE%\.claude\projects\**\*.jsonl`.
2. Begitu Claude Code menulis log, Windows memberi tahu Tessly (`fs.watch`), lalu hanya bagian file yang baru yang dibaca. Sebagai cadangan, semua log diperiksa ulang tiap 30 detik.
3. Satu balasan model bisa tercatat beberapa kali di log, jadi setiap balasan dihitung satu kali berdasarkan `message.id` + `requestId`.
4. Total per (tanggal, model) disimpan di `history.json` di folder data aplikasi (`%APPDATA%\Tessly`). Isi percakapan, nama file, dan folder proyek tidak disimpan, hanya angka token. Tidak ada data yang dikirim ke internet.
5. Dashboard menerima angka baru langsung dari proses utama, tanpa memuat ulang berkala.

**Tidak termasuk:** pemakaian claude.ai (web dan aplikasi chat). Data itu hanya ada di server Anthropic dan tidak tercatat di komputer.

## Pemasangan

Jalankan `Tessly Setup x.y.z.exe` dari folder `dist`. Pemasangan per pengguna, tanpa hak admin.

Tampilan tersedia dalam bahasa Indonesia dan Inggris (Pengaturan > Bahasa); menu tray dan notifikasi ikut berganti.

Aplikasi berjalan otomatis setiap Windows menyala (bisa dimatikan di Pengaturan). Menutup jendela hanya menyembunyikannya ke tray. Untuk benar-benar menghentikan aplikasi, klik kanan ikon tray lalu pilih **Keluar**.

## Update aplikasi

Tessly mengecek GitHub Releases (`arifmardhatillah/Tessly`) saat dibuka dan setiap 4 jam. Kalau ada versi baru:

- Popup muncul di pojok kanan bawah: **Unduh dan pasang**, lalu **Pasang sekarang**. Aplikasi tertutup sebentar dan terbuka lagi dengan versi baru.
- Kalau jendela sedang tersembunyi di tray, muncul notifikasi Windows, dan menu tray mendapat item "Unduh update" atau "Pasang update".
- Pilih **Nanti** kalau tidak ingin sekarang. Update yang sudah terunduh otomatis dipasang saat aplikasi ditutup.
- Pengecekan manual: buka **Pengaturan**, lalu klik **Cek update**.

### Menerbitkan versi baru

1. Naikkan `version` di `package.json`.
2. Tulis perubahan di `build/release-notes.md` (isinya tampil di popup).
3. Buat token GitHub (fine-grained) untuk repo Tessly dengan izin *Contents: Read and write*.
4. Di PowerShell, dari folder proyek:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\release.ps1
   ```
   Skrip akan meminta token. Tempel dengan klik kanan, lalu tekan Enter. Token tidak terlihat saat ditempel, itu normal.

Repo harus **publik** agar aplikasi bisa membaca rilis tanpa token. Kode tidak berisi rahasia.

## Catatan angka

- **Total tidak pernah turun.** Secara bawaan Claude Code menghapus log yang lebih tua dari 30 hari. `history.json` menyimpan nilai tertinggi yang pernah terbaca, jadi riwayat tetap aman setelah log terhapus. Riwayat hanya mencakup hari-hari sejak Tessly terpasang (ditambah log yang masih ada saat itu). Kalau ingin log Claude Code disimpan lebih lama, tambahkan `"cleanupPeriodDays": 365` di `~/.claude/settings.json`.
- **Tanggal** mengikuti zona waktu komputer (WIB).
- **Cache baca** biasanya jauh lebih besar dari jenis token lain. Pilih "Input + output" di filter jenis token untuk melihat token yang benar-benar baru.

## Pengembangan

```bash
npm install
npm run test:scan   # uji pembaca log tanpa Electron
npm start           # jalankan aplikasi
npm run dist        # buat installer di folder dist/ (tanpa menerbitkan)
```

Kalau dijalankan dari terminal VS Code dan muncul error `requestSingleInstanceLock`, hapus dulu variabel `ELECTRON_RUN_AS_NODE` (Bash: `env -u ELECTRON_RUN_AS_NODE npm start`).

Tangkapan layar tanpa membuka jendela: `TM_SHOT=hasil.png npm start`. Tambahkan `TM_JS="..."` untuk menjalankan skrip di halaman sebelum dipotret (misalnya mengklik tab), dan `CLAUDE_CONFIG_DIR=folder` untuk membaca log uji alih-alih log asli.

Struktur:

- `src/scanner.js`: membaca log secara bertahap, membuang duplikat, menjumlahkan per tanggal dan model
- `src/history.js`: riwayat total per tanggal dan model di `history.json`
- `src/main.js`: tray, jendela, pemantauan log, pengaturan
- `src/updater.js`: cek dan pasang update dari GitHub Releases
- `renderer/`: dashboard (HTML/CSS/JS biasa, grafik SVG); semua teks antarmuka ada di `renderer/i18n.js`
