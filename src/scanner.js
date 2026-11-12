// Membaca log sesi Claude Code (~/.claude/projects/**/*.jsonl) secara bertahap.
// Satu balasan model bisa tertulis berkali-kali (satu baris per blok konten),
// jadi setiap balasan diidentifikasi dengan message.id + requestId dan hanya dihitung sekali.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

function defaultRoots() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  const bases = env
    ? env.split(',').map((s) => s.trim()).filter(Boolean)
    : [path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.config', 'claude')];
  return bases.map((b) => path.join(b, 'projects'));
}

const pad = (n) => String(n).padStart(2, '0');

// Tanggal menurut zona waktu komputer ini (WIB di kantor), bukan UTC.
function localDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

class Scanner {
  constructor(roots = defaultRoots()) {
    this.roots = roots;
    this.files = new Map(); // path -> byte offset yang sudah dibaca
    this.msgs = new Map(); // id balasan -> { d, mo, i, o, cw, cr }
  }

  // Baca semua file log (saat mulai dan sebagai cadangan berkala).
  async scan() {
    const list = [];
    for (const r of this.roots) await walk(r, list);
    return this.scanFiles(list);
  }

  // Baca hanya file tertentu, misalnya file yang baru saja ditulis Claude Code.
  async scanFiles(files) {
    let changed = false;
    for (const f of files) {
      if (await this.readFile(f)) changed = true;
    }
    return changed;
  }

  async readFile(file) {
    let st;
    try {
      st = await fsp.stat(file);
    } catch {
      return false;
    }
    let offset = this.files.get(file) || 0;
    if (st.size < offset) offset = 0; // file ditulis ulang
    if (st.size === offset) {
      this.files.set(file, offset);
      return false;
    }
    let buf;
    const fh = await fsp.open(file, 'r');
    try {
      buf = Buffer.alloc(st.size - offset);
      await fh.read(buf, 0, buf.length, offset);
    } finally {
      await fh.close();
    }
    // Hanya proses sampai baris lengkap terakhir; sisanya dibaca pada putaran berikutnya.
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl < 0) return false;
    this.files.set(file, offset + lastNl + 1);

    let changed = false;
    const text = buf.toString('utf8', 0, lastNl);
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      if (this.ingest(line)) changed = true;
    }
    return changed;
  }

  ingest(line) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      return false;
    }
    const m = o.message;
    const u = m && m.usage;
    if (!u || !m.model || m.model === '<synthetic>') return false;
    const d = localDay(o.timestamp);
    if (!d) return false;
    const key = m.id && o.requestId ? `${m.id}:${o.requestId}` : m.id || o.uuid;
    if (!key) return false;

    const rec = {
      d,
      mo: m.model,
      i: u.input_tokens || 0,
      o: u.output_tokens || 0,
      cw: u.cache_creation_input_tokens || 0,
      cr: u.cache_read_input_tokens || 0,
    };
    const prev = this.msgs.get(key);
    if (!prev) {
      this.msgs.set(key, rec);
      return true;
    }
    // Baris duplikat: ambil nilai terbesar (baris akhir streaming membawa jumlah output final).
    let changed = false;
    for (const k of ['i', 'o', 'cw', 'cr']) {
      if (rec[k] > prev[k]) {
        prev[k] = rec[k];
        changed = true;
      }
    }
    return changed;
  }

  // Total per (tanggal, model).
  aggregate() {
    const map = new Map();
    for (const r of this.msgs.values()) {
      const k = `${r.d}|${r.mo}`;
      let a = map.get(k);
      if (!a) {
        a = { d: r.d, mo: r.mo, i: 0, o: 0, cw: 0, cr: 0, n: 0 };
        map.set(k, a);
      }
      a.i += r.i;
      a.o += r.o;
      a.cw += r.cw;
      a.cr += r.cr;
      a.n += 1;
    }
    return [...map.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }
}

module.exports = { Scanner, defaultRoots, localDay };
