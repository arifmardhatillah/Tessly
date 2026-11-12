// Riwayat total per (tanggal, model), disimpan di komputer ini (history.json di folder data aplikasi).
// Claude Code menghapus log lama (bawaan 30 hari). Riwayat menyimpan nilai tertinggi yang pernah terbaca,
// jadi total bulan dan tahun tidak turun saat log lama terhapus. Riwayat juga membuat dashboard
// langsung tampil saat aplikasi dibuka, sebelum semua log selesai dibaca ulang.
const fs = require('fs');
const path = require('path');

const FIELDS = ['i', 'o', 'cw', 'cr', 'n'];
const SAVE_DELAY_MS = 2000;

class History {
  constructor(file) {
    this.file = file;
    this.map = new Map(); // "tanggal|model" -> { d, mo, i, o, cw, cr, n }
    this.saveTimer = null;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const r of saved.rows || []) this.map.set(`${r.d}|${r.mo}`, r);
    } catch {
      /* belum ada riwayat */
    }
  }

  get size() {
    return this.map.size;
  }

  // Gabungkan hasil baca log. Mengembalikan true bila ada angka yang berubah.
  merge(rows) {
    let changed = false;
    for (const r of rows) {
      const k = `${r.d}|${r.mo}`;
      const prev = this.map.get(k);
      if (!prev) {
        this.map.set(k, { d: r.d, mo: r.mo, i: r.i, o: r.o, cw: r.cw, cr: r.cr, n: r.n });
        changed = true;
        continue;
      }
      for (const f of FIELDS) {
        if (r[f] > prev[f]) {
          prev[f] = r[f];
          changed = true;
        }
      }
    }
    if (changed) {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
    }
    return changed;
  }

  rows() {
    return [...this.map.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  // Tulis ke file sementara lalu ganti nama, supaya riwayat tidak rusak bila komputer mati saat menyimpan.
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, rows: this.rows() }));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('Gagal menyimpan riwayat:', e);
    }
  }
}

module.exports = { History };
