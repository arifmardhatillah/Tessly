<p align="center">
  <img src="docs/banner.gif" alt="Tessly: Know every token you spend. Total hari ini naik setiap kali Claude Code selesai membalas." width="100%">
</p>

<p align="center">
  <a href="https://github.com/arifmardhatillah/Tessly/releases/latest"><img alt="Rilis terbaru" src="https://img.shields.io/github/v/release/arifmardhatillah/Tessly?color=ff6b5c&label=release"></a>
  <a href="https://github.com/arifmardhatillah/Tessly/releases"><img alt="Jumlah unduhan" src="https://img.shields.io/github/downloads/arifmardhatillah/Tessly/total?color=e8743b"></a>
  <img alt="Windows 10 dan 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4">
  <a href="LICENSE"><img alt="Lisensi MIT" src="https://img.shields.io/github/license/arifmardhatillah/Tessly?color=3fb950"></a>
</p>

<p align="center">
  <a href="https://github.com/arifmardhatillah/Tessly/releases/latest"><img alt="Unduh Tessly untuk Windows" src="docs/unduh.png" width="280"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Bahasa Indonesia</b></p>

<p align="center">
  <b>Tessly adalah aplikasi kecil di system tray Windows yang menjumlahkan token yang dipakai Claude Code di komputer Anda,<br>hari ini, bulan ini, dan tahun ini, dan langsung diperbarui begitu sebuah balasan selesai.</b>
</p>

## Kenapa Tessly

Claude Code melaporkan pemakaian per sesi. Tessly menjumlahkan semua sesi dan semua proyek, menyimpan riwayatnya, dan menampilkan bagaimana pemakaian Anda bertambah dari hari ke hari dan dari bulan ke bulan. Semua dibaca dari file yang sudah ada di komputer Anda, jadi tidak perlu akun, API key, atau pengaturan apa pun.

## Fitur

<table>
  <tr>
    <td width="33%" valign="top"><b>Total langsung</b><br>Hari ini, bulan ini, dan tahun ini, masing-masing dirinci menjadi input, output, cache tulis, dan cache baca.</td>
    <td width="33%" valign="top"><b>Grafik dan tren</b><br>Batang harian, bulanan, atau tahunan dengan garis rata-rata, sehingga minggu yang sibuk langsung terlihat.</td>
    <td width="33%" valign="top"><b>Kalender pemakaian</b><br>Kalender berwarna beberapa minggu terakhir menunjukkan hari tersibuk Anda sekilas.</td>
  </tr>
  <tr>
    <td valign="top"><b>Per model</b><br>Lihat pembagian token Anda di antara Opus, Sonnet, dan Haiku.</td>
    <td valign="top"><b>Privasi terjaga</b><br>Yang disimpan hanya jumlah token. Isi percakapan tidak pernah disimpan atau dikirim ke mana pun.</td>
    <td valign="top"><b>Selalu terbaru</b><br>Mode terang dan gelap, bahasa Indonesia dan Inggris, serta update satu klik dari dalam aplikasi.</td>
  </tr>
</table>

<p align="center"><img src="docs/tour.gif" alt="Tur Tessly: total hari ini naik saat ada balasan baru, grafik berganti harian, bulanan, tahunan, lalu aplikasi berganti ke mode terang dan kembali." width="100%"></p>
<p align="center"><sub>Spanduk dan tur memakai data contoh.</sub></p>

## Mulai memakai

1. Unduh `Tessly-Setup-x.y.z.exe` dari [rilis terbaru](https://github.com/arifmardhatillah/Tessly/releases/latest).
2. Jalankan. Pemasangan hanya untuk akun Windows Anda, tanpa hak admin.
3. Pakai Claude Code seperti biasa. Klik ikon Tessly di system tray untuk membuka dashboard.

**Syarat:** Windows 10 atau 11, dan [Claude Code](https://docs.anthropic.com/en/docs/claude-code) dipakai di komputer yang sama.

> [!NOTE]
> Installer belum ditandatangani (code signing), jadi Windows SmartScreen bisa menampilkan "Windows protected your PC" saat pertama kali dijalankan. Klik **More info**, lalu **Run anyway**. Setiap installer dibuat dari kode sumber di repo ini.

## Privasi

- **Hanya membaca file lokal.** Tessly membaca log sesi yang memang sudah ditulis Claude Code di `%USERPROFILE%\.claude\projects`.
- **Hanya menyimpan angka.** Yang disimpan hanya jumlah token per tanggal dan model, bukan isi percakapan, nama file, atau folder proyek.
- **Tidak mengirim apa pun.** Satu-satunya akses internet adalah mengecek rilis baru di repo ini.

## Tanya jawab

<details>
<summary><b>Kenapa cache baca jauh lebih besar daripada input dan output?</b></summary>
<br>
Claude Code mengirim ulang seluruh percakapan di setiap balasan, dan sebagian besarnya dibaca dari cache. Karena itu filter bawaan, "Input + output", hanya menghitung token baru. Filternya bisa diganti di bagian atas dashboard.
</details>

<details>
<summary><b>Apakah pemakaian di claude.ai ikut dihitung?</b></summary>
<br>
Tidak. Percakapan di claude.ai (web dan aplikasi desktop) hanya tersimpan di server Anthropic, jadi Tessly tidak bisa melihatnya.
</details>

<details>
<summary><b>Bagaimana kalau Claude Code menghapus log lama?</b></summary>
<br>
Secara bawaan Claude Code menghapus log yang lebih tua dari 30 hari. Tessly menyimpan totalnya sendiri di <code>%APPDATA%\Tessly\history.json</code>, jadi riwayat Anda tetap ada. Kalau log Claude Code juga ingin disimpan lebih lama, tambahkan <code>"cleanupPeriodDays": 365</code> di <code>~/.claude/settings.json</code>.
</details>

<details>
<summary><b>Bagaimana cara update-nya?</b></summary>
<br>
Tessly mengecek versi baru saat menyala, saat jendelanya dibuka, dan setiap 10 menit. Kalau ada, popup menawarkan untuk memasangnya, dan jendela progres tampil selama pemasangan. Bisa juga dicek dari Pengaturan.
</details>

<details>
<summary><b>Bagaimana cara menghapusnya?</b></summary>
<br>
Pengaturan Windows > Aplikasi > Aplikasi terinstal > Tessly > Uninstall. Untuk ikut menghapus riwayat yang tersimpan, hapus folder <code>%APPDATA%\Tessly</code>.
</details>

## Berkontribusi

Laporan bug dan ide sangat diterima di [Issues](https://github.com/arifmardhatillah/Tessly/issues). Untuk membangun Tessly sendiri atau mengirim perubahan, lihat [CONTRIBUTING.md](CONTRIBUTING.md) (bahasa Inggris).

## Lisensi

[MIT](LICENSE) © Arif Mardhatillah. Font Space Grotesk yang disertakan berlisensi [SIL Open Font License 1.1](renderer/fonts/OFL.txt).

<sub>Tessly adalah proyek independen, tidak berafiliasi dengan, tidak didukung, dan tidak disponsori oleh Anthropic. "Claude" dan "Claude Code" adalah merek dagang Anthropic, disebut di sini hanya untuk menjelaskan aplikasi apa yang dipantau.</sub>
