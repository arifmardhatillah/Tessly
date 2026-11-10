# Tessly: AI Token Tracker

*Know every token you spend.*

Aplikasi desktop Windows untuk memantau pemakaian token **Claude Code** di semua komputer, per hari, per bulan, dan per tahun. Data diperbarui setiap 10 detik.

## Cara kerja

1. Tessly dipasang di setiap komputer dan berjalan di system tray.
2. Setiap 10 detik aplikasi membaca log Claude Code di `%USERPROFILE%\.claude\projects\**\*.jsonl`. Hanya bagian file yang baru yang dibaca.
3. Satu balasan model bisa tercatat beberapa kali di log, jadi setiap balasan dihitung satu kali berdasarkan `message.id` + `requestId`.
4. Total per (tanggal, model) dikirim ke Supabase. Isi percakapan, nama file, dan folder proyek **tidak pernah dikirim**, hanya angka token.
5. Dashboard menampilkan gabungan semua komputer. Dashboard memuat ulang data setiap 15 detik, dan langsung memuat ulang setiap kali ada pemakaian baru di komputer itu.

**Tidak termasuk:** pemakaian claude.ai (web dan aplikasi chat). Data itu hanya ada di server Anthropic dan tidak tercatat di komputer.

## Pemasangan

### 1. Supabase (sekali saja)

1. Buat proyek di https://supabase.com.
2. Buka **SQL Editor**, tempel seluruh isi [`supabase/schema.sql`](supabase/schema.sql).
3. Di baris paling bawah, ganti `GANTI-DENGAN-KUNCI-TIM` dengan kunci buatan Anda sendiri (disarankan 24 karakter atau lebih), lalu klik **Run**.
4. Buka **Project Settings > API** dan catat **Project URL** serta kunci **anon** atau **publishable**.

### 2. Setiap komputer

1. Jalankan `Tessly Setup x.y.z.exe` dari folder `dist`. Pemasangan per pengguna, tanpa hak admin.
2. Buka Tessly, klik **Pengaturan**, lalu isi URL, kunci API, dan kunci tim.
3. Klik **Uji koneksi**, lalu **Simpan**.

Aplikasi berjalan otomatis setiap Windows menyala (bisa dimatikan di Pengaturan). Menutup jendela hanya menyembunyikannya ke tray. Untuk benar-benar menghentikan aplikasi, klik kanan ikon tray lalu pilih **Keluar**.

Selama Supabase belum diatur, aplikasi menampilkan pemakaian komputer itu saja.

## Update aplikasi

Tessly mengecek GitHub Releases (`arifmardhatillah/Tessly`) saat dibuka dan setiap 4 jam. Kalau ada versi baru:

- Popup muncul di pojok kanan bawah: **Unduh dan pasang**, lalu **Pasang sekarang**. Aplikasi tertutup sebentar dan terbuka lagi dengan versi baru.
- Kalau jendela sedang tersembunyi di tray, muncul notifikasi Windows, dan menu tray mendapat item "Unduh update" atau "Pasang update".
- Pilih **Nanti** kalau tidak ingin sekarang. Update yang sudah terunduh otomatis dipasang saat aplikasi ditutup.
- Pengecekan manual: buka **Pengaturan**, lalu klik **Cek update**.

Nama lama aplikasi ini adalah TokenMeter. Kalau TokenMeter masih terpasang, uninstall lewat Settings > Apps. Pengaturannya disalin otomatis ke Tessly saat pertama dibuka.

### Menerbitkan versi baru

1. Naikkan `version` di `package.json`.
2. Tulis perubahan di `build/release-notes.md` (isinya tampil di popup).
3. Buat token GitHub (fine-grained) untuk repo Tessly dengan izin *Contents: Read and write*.
4. Di PowerShell, dari folder proyek:
   ```powershell
   $env:GH_TOKEN = "github_pat_..."
   .\release.ps1
   ```

Repo harus **publik** agar aplikasi bisa membaca rilis tanpa token. Kode tidak berisi rahasia: kunci Supabase dan kunci tim hanya ada di Pengaturan setiap komputer.

## Keamanan

- Tabel Supabase memakai RLS tanpa policy dan akses `anon` dicabut, jadi kunci API saja tidak cukup untuk membaca atau menulis data.
- Semua akses lewat fungsi `tm_push` / `tm_get` yang memeriksa hash SHA-256 kunci tim.
- Kunci API dan kunci tim disimpan terenkripsi di komputer (Windows DPAPI lewat Electron `safeStorage`).
- Untuk mengganti kunci tim, jalankan lagi bagian "KUNCI TIM" di `schema.sql` dengan kunci baru, lalu perbarui Pengaturan di setiap komputer.

## Catatan angka

- **Total tidak pernah turun.** Secara bawaan Claude Code menghapus log yang lebih tua dari 30 hari. Supabase menyimpan nilai tertinggi yang pernah dikirim, jadi riwayat tetap aman setelah log lokal terhapus. Pastikan Tessly sudah terpasang sebelum log lama terhapus. Kalau ingin log lokal disimpan lebih lama, tambahkan `"cleanupPeriodDays": 365` di `~/.claude/settings.json`.
- **Tanggal** mengikuti zona waktu komputer pengirim (WIB).
- **Cache baca** biasanya jauh lebih besar dari jenis token lain. Pilih "Input + output" di filter *Jenis token* untuk melihat token yang benar-benar baru.
- Satu perangkat = satu akun Windows di satu PC. Dua pengguna Windows di PC yang sama tercatat sebagai dua perangkat.

## Pengembangan

```bash
npm install
npm run test:scan   # uji pembaca log tanpa Electron
npm start           # jalankan aplikasi
npm run dist        # buat installer di folder dist/ (tanpa menerbitkan)
```

Kalau dijalankan dari terminal VS Code dan muncul error `requestSingleInstanceLock`, hapus dulu variabel `ELECTRON_RUN_AS_NODE` (Bash: `env -u ELECTRON_RUN_AS_NODE npm start`).

Struktur:

- `src/scanner.js`: membaca log secara bertahap, membuang duplikat, menjumlahkan per tanggal dan model
- `src/main.js`: tray, jendela, sinkronisasi ke Supabase, konfigurasi
- `src/updater.js`: cek dan pasang update dari GitHub Releases
- `src/cloud.js`: panggilan RPC Supabase (fetch, tanpa library tambahan)
- `renderer/`: dashboard (HTML/CSS/JS biasa, grafik SVG)
- `supabase/schema.sql`: tabel, fungsi, dan kunci tim
