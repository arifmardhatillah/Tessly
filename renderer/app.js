'use strict';

// Tema: mengikuti Windows sampai pengguna menekan tombol tema, lalu pilihannya diingat.
try {
  const t = localStorage.getItem('tessly.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* tanpa penyimpanan: ikut Windows */ }

const REFRESH_MS = 15000;
const ONLINE_MS = 3 * 60 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmtFull = new Intl.NumberFormat('id-ID');
const fmtC = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumSignificantDigits: 3 });
const monthShort = new Intl.DateTimeFormat('id-ID', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
const dayLong = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

const METRICS = {
  io: { label: 'Input + output', unit: 'token input + output', parts: ['i', 'o'], get: (r) => r.i + r.o },
  total: { label: 'Semua token, termasuk cache', unit: 'token, termasuk cache', parts: ['i', 'o', 'cw', 'cr'], get: (r) => r.i + r.o + r.cw + r.cr },
  i: { label: 'Input', unit: 'token input', parts: ['i'], get: (r) => r.i },
  o: { label: 'Output', unit: 'token output', parts: ['o'], get: (r) => r.o },
  cw: { label: 'Cache tulis', unit: 'token cache tulis', parts: ['cw'], get: (r) => r.cw },
  cr: { label: 'Cache baca', unit: 'token cache baca', parts: ['cr'], get: (r) => r.cr },
};

// Pilihan jenis token diingat per komputer. Bawaan: input + output (token baru, tanpa cache).
function savedMetric() {
  try { const m = localStorage.getItem('tessly.metric'); return METRICS[m] ? m : 'io'; } catch { return 'io'; }
}

const state = { view: 'day', metric: savedMetric(), machine: 'all', year: new Date().getFullYear(), data: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const metricOf = (r) => METRICS[state.metric].get(r);

const emptySum = () => ({ i: 0, o: 0, cw: 0, cr: 0, n: 0 });
function addTo(a, r) { a.i += +r.i || 0; a.o += +r.o || 0; a.cw += +r.cw || 0; a.cr += +r.cr || 0; a.n += +r.n || 0; return a; }
const sumRows = (rows) => rows.reduce(addTo, emptySum());
function groupInto(map, key, r) { let a = map.get(key); if (!a) map.set(key, (a = emptySum())); return addTo(a, r); }

function rows(kind) {
  const all = (state.data && state.data[kind]) || [];
  return state.machine === 'all' ? all : all.filter((r) => r.m === state.machine);
}

// ---------- angka yang menghitung naik ----------
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Menganimasikan teks angka dari nilai sebelumnya ke nilai baru.
function tween(el, to, fmt, ms = 900) {
  const from = el._v ?? 0;
  el._v = to;
  el.title = `${fmtFull.format(to)}`;
  cancelAnimationFrame(el._raf);
  if (reduceMotion || from === to) { paint(el, fmt(to)); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    paint(el, fmt(from + (to - from) * easeOut(k)));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// Angka besar di kartu: satuan (rb, jt, M) ditulis lebih kecil dari angkanya.
function paint(el, text) {
  if (!el.classList.contains('num')) { el.textContent = text; return; }
  if (!el._n) {
    el.textContent = '';
    el._n = el.appendChild(document.createTextNode(''));
    el._s = el.appendChild(document.createElement('small'));
  }
  const m = /^([\d.,]+)\s*(.*)$/.exec(text) || [0, text, ''];
  el._n.nodeValue = m[1];
  el._s.textContent = m[2];
}

function bump(card) {
  if (reduceMotion) return;
  card.classList.remove('bump');
  void card.offsetWidth;
  card.classList.add('bump');
}

let lastToday = null;
function showDelta(n) {
  if (reduceMotion || n <= 0) return;
  const layer = document.querySelector('#kToday .delta-layer');
  const b = document.createElement('span');
  b.className = 'delta';
  b.textContent = `+${fmtC.format(n)}`;
  layer.append(b);
  b.addEventListener('animationend', () => b.remove());
}

// ---------- data ----------
async function refresh() {
  try {
    state.data = await window.api.getData();
  } catch (e) {
    console.error(e);
    return;
  }
  render('update');
}

function render(mode) {
  const d = state.data;
  if (!d) return;
  renderHeader(d);
  renderMachineFilter(d);
  renderKpis();
  renderChart(mode);
  renderLists();
}

let lastSyncOk = null;
function renderHeader(d) {
  const s = d.sync || {};
  const picked = state.machine !== 'all' && d.machines.find((m) => m.id === state.machine);
  $('pageTitle').textContent = picked ? `Pemakaian token ${picked.name}` : 'Pemakaian token';
  $('source').textContent = picked ? `Hanya perangkat ini, pengguna ${picked.user}`
    : d.source === 'cloud' ? `Gabungan ${d.machines.length} perangkat dari Supabase`
      : 'Hanya komputer ini';

  let dot = '', txt = '';
  if (!s.configured) txt = 'Belum terhubung ke Supabase';
  else if (d.cloudError) { dot = 'err'; txt = 'Gagal memuat data pusat'; }
  else if (s.lastError) { dot = 'err'; txt = 'Gagal mengirim data'; }
  else if (s.lastOk) { dot = 'ok'; txt = `Tersinkron pukul ${timeFmt.format(new Date(s.lastOk))}`; }
  else txt = 'Menyinkronkan…';
  const pill = $('syncState');
  pill.hidden = !s.configured;
  $('btnConnect').hidden = Boolean(s.configured);
  pill.innerHTML = `<span class="dot ${dot}"></span>${esc(txt)}`;
  if (s.lastOk && lastSyncOk && s.lastOk !== lastSyncOk) {
    pill.classList.add('flash');
    setTimeout(() => pill.classList.remove('flash'), 900);
  }
  lastSyncOk = s.lastOk;

  const b = $('banner');
  let html = '';
  if (s.configured && (d.cloudError || s.lastError)) {
    html = `<span>${esc(d.cloudError ? 'Data pusat tidak bisa dimuat, sementara menampilkan data lokal. ' + d.cloudError : 'Pengiriman ke Supabase gagal. ' + s.lastError)}</span><button class="btn" data-open-settings>Periksa pengaturan</button>`;
  }
  if (b.dataset.html !== html) {
    b.innerHTML = html;
    b.dataset.html = html;
    b.hidden = !html;
  }
}

function machineLabel(m) { return m.user ? `${m.name} (${m.user})` : m.name; }

function renderMachineFilter(d) {
  if (state.machine !== 'all' && !d.machines.some((m) => m.id === state.machine)) state.machine = 'all';
}

const BRK = [['Input', 'i'], ['Output', 'o'], ['Cache tulis', 'cw'], ['Cache baca', 'cr']];
const fmtCompact = (v) => fmtC.format(Math.round(v));
const fmtInt = (v) => fmtFull.format(Math.round(v));

function fillCard(id, when, s, isToday) {
  const card = $(id);
  const brk = card.querySelector('.brk');
  if (!brk.children.length) {
    brk.innerHTML = BRK.map(([label, k]) => `<div data-k="${k}"><dt>${label}</dt><dd>0</dd></div>`).join('');
  }
  card.title = `${when}, ${METRICS[state.metric].unit}`;
  const num = card.querySelector('.num');
  const v = metricOf(s);
  const grew = num._v !== undefined && v > num._v;
  tween(num, v, fmtCompact, num._v === undefined ? 1100 : 900);
  tween(card.querySelector('.msgs'), s.n, fmtInt);
  brk.querySelectorAll('dd').forEach((dd, i) => tween(dd, s[BRK[i][1]], fmtCompact));
  card.classList.remove('loading');
  if (grew && isToday) bump(card);
}

function renderKpis() {
  const now = new Date();
  const today = dayKey(now);
  const month = today.slice(0, 7);
  const year = String(now.getFullYear());
  const t = sumRows(rows('daily').filter((r) => r.d === today));
  const m = sumRows(rows('monthly').filter((r) => r.d === month));
  const y = sumRows(rows('monthly').filter((r) => r.d.startsWith(year)));

  const tv = metricOf(t);
  if (lastToday && lastToday.metric === state.metric && lastToday.machine === state.machine && lastToday.day === today) {
    showDelta(tv - lastToday.v);
  }
  lastToday = { v: tv, metric: state.metric, machine: state.machine, day: today };

  fillCard('kToday', dayLong.format(now), t, true);
  fillCard('kMonth', monthLong.format(now), m, false);
  fillCard('kYear', year, y, false);
}

// ---------- grafik ----------
function buckets() {
  const now = new Date();
  if (state.view === 'day') {
    const map = new Map();
    for (const r of rows('daily')) groupInto(map, r.d, r);
    const out = [];
    for (let k = 29; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
      const key = dayKey(d);
      out.push({ key, s: map.get(key) || emptySum(), tick: `${d.getDate()} ${monthShort.format(d)}`, title: dayLong.format(d), now: k === 0 });
    }
    // 6 hari sebelum jendela, supaya rata-rata 7 hari sudah utuh sejak hari pertama grafik
    const pre = [];
    for (let k = 35; k >= 30; k--) pre.push(map.get(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - k))) || emptySum());
    return { out, pre, win: 7, unit: 'hari', title: 'Token per hari', range: '30 hari terakhir' };
  }
  const map = new Map();
  for (const r of rows('monthly')) groupInto(map, r.d, r);
  if (state.view === 'month') {
    const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const out = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(state.year, m, 1);
      const key = `${state.year}-${pad(m + 1)}`;
      out.push({ key, s: map.get(key) || emptySum(), tick: monthShort.format(d), title: monthLong.format(d), now: key === cur });
    }
    const pre = [`${state.year - 1}-11`, `${state.year - 1}-12`].map((k) => map.get(k) || emptySum());
    return { out, pre, win: 3, unit: 'bulan', title: 'Token per bulan', range: `Tahun ${state.year}` };
  }
  const years = new Map();
  for (const [k, s] of map) groupInto(years, k.slice(0, 4), s);
  const ys = [...years.keys()].map(Number);
  const first = Math.min(now.getFullYear(), ...(ys.length ? ys : [now.getFullYear()]));
  const out = [];
  for (let y = first; y <= now.getFullYear(); y++) {
    out.push({ key: String(y), s: years.get(String(y)) || emptySum(), tick: String(y), title: `Tahun ${y}`, now: y === now.getFullYear() });
  }
  return { out, pre: [], win: 0, unit: 'tahun', title: 'Token per tahun', range: 'Semua tahun' };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function svgEl(tag, attrs, parent) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.append(n);
  return n;
}

// Urutan tumpukan dari bawah ke atas. Warnanya sama dengan kotak kecil di kartu ringkasan.
const STACK = ['o', 'i', 'cw', 'cr'];
const PART_LABEL = { i: 'Input', o: 'Output', cw: 'Cache tulis', cr: 'Cache baca' };
const PER = { day: 'hari', month: 'bulan', year: 'tahun' };

function renderChartMeta(out, vals, tr) {
  const counted = METRICS[state.metric].parts;
  const total = vals.reduce((a, v) => a + v, 0);
  const nowIdx = out.findIndex((b) => b.now);
  const n = nowIdx >= 0 ? nowIdx + 1 : out.length; // periode yang belum terjadi tidak ikut dirata-rata
  let top = 0;
  vals.forEach((v, i) => { if (v > vals[top]) top = i; });
  const stat = (k, v, extra = '') => `<div><dt>${k}</dt><dd>${v}${extra ? `<small>${esc(extra)}</small>` : ''}</dd></div>`;
  const html = stat('Total', fmtC.format(total))
    + stat(`Rata-rata per ${PER[state.view]}`, fmtC.format(Math.round(total / Math.max(1, n))))
    + stat('Tertinggi', fmtC.format(vals[top] || 0), total > 0 ? out[top].tick : '')
    + (tr ? stat(`Rata-rata ${tr.win} ${tr.unit} terakhir`, fmtC.format(Math.round(tr.v)), tr.dir) : '');
  const st = $('chartStats');
  if (st.dataset.html !== html) { st.innerHTML = html; st.dataset.html = html; }
  const lg = BRK.filter(([, k]) => counted.includes(k)).map(([label, k]) => `<span data-k="${k}"><i></i>${label}</span>`).join('');
  const le = $('chartLegend');
  if (le && le.dataset.html !== lg) { le.innerHTML = lg; le.dataset.html = lg; }
}

let lastBuckets = [];
let chartKey = '';
// mode: 'grow' (batang tumbuh dari nol), 'update' (berpindah halus ke nilai baru), 'instant'
function renderChart(mode = 'update') {
  const { out, pre, win, unit, title, range } = buckets();
  lastBuckets = out;
  $('chartTitle').textContent = title;
  $('chartSub').textContent = `${METRICS[state.metric].label}, ${range.toLowerCase()}`
    + (win ? `. Garis = rata-rata ${win} ${unit} terakhir` : '');
  $('rangeLabel1').textContent = range;
  $('rangeLabel2').textContent = range;
  $('yearNav').hidden = state.view !== 'month';
  const yl = $('yLabel');
  if (yl.textContent !== String(state.year)) {
    yl.textContent = state.year;
    yl.classList.remove('flip'); void yl.offsetWidth; yl.classList.add('flip');
  }
  $('yNext').disabled = state.year >= new Date().getFullYear();

  const el = $('chart');
  const W = Math.max(320, el.clientWidth), H = el.clientHeight || 250;
  const L = 46, R = 2, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const base = T + ph;
  const vals = out.map((b) => metricOf(b.s));
  const nowIdx = out.findIndex((b) => b.now);
  const last = nowIdx >= 0 ? nowIdx : out.length - 1; // garis tren berhenti di periode sekarang
  // rata-rata berjalan: tiap titik = rata-rata `win` periode yang berakhir di titik itu
  const all = pre.map(metricOf).concat(vals);
  const ma = win ? vals.map((_, i) => {
    const j = i + pre.length;
    const w = all.slice(Math.max(0, j - win + 1), j + 1);
    return w.reduce((a, v) => a + v, 0) / w.length;
  }) : [];
  const hasTrend = win > 0 && out.length > 2 && ma.slice(0, last + 1).some((v) => v > 0);
  let tr = null;
  if (hasTrend) {
    const prev = last - win >= 0 ? ma[last - win] : null;
    const dir = prev === null ? '' : ma[last] > prev * 1.05 ? 'naik' : ma[last] < prev * 0.95 ? 'turun' : 'stabil';
    tr = { win, unit, v: ma[last], dir };
  }
  renderChartMeta(out, vals, tr);
  const max = niceMax(Math.max(0, ...vals));
  const step = pw / out.length;
  const bw = Math.max(4, Math.min(44, step * 0.62));
  const rx = Math.min(7, bw / 2);

  const key = `${state.view}|${state.year}|${out.length}|${W}|${H}`;
  let svg = el.querySelector('svg');
  const rebuild = !svg || key !== chartKey;
  if (rebuild) {
    if (mode === 'update') mode = 'grow';
    chartKey = key;
    hideTip(); // grafik digambar ulang (mis. jendela diubah ukurannya): sorotan lama tidak berlaku lagi
    el.textContent = '';
    svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    const defs = svgEl('defs', {}, svg);
    const grad = svgEl('linearGradient', { id: 'barGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgEl('stop', { offset: 0, class: 'g1' }, grad);
    svgEl('stop', { offset: 1, class: 'g2' }, grad);
    // userSpaceOnUse: tetap berwarna walau garisnya datar (kotak batas setinggi nol)
    const lg = svgEl('linearGradient', { id: 'lineGrad', gradientUnits: 'userSpaceOnUse', x1: L, y1: 0, x2: W - R, y2: 0 }, defs);
    svgEl('stop', { offset: 0, class: 'g1' }, lg);
    svgEl('stop', { offset: 1, class: 'g2' }, lg);
    svgEl('g', { class: 'grid' }, svg);
    svgEl('rect', { class: 'cursor', x: L, y: T, width: step, height: ph + 4, rx: 8 }, svg);
    const xg = svgEl('g', {}, svg);
    const every = Math.ceil(out.length / Math.max(1, Math.floor(pw / 70)));
    out.forEach((b, i) => {
      if (i % every === 0) {
        const t = svgEl('text', { class: b.now ? 'ax now' : 'ax', x: L + step * i + step / 2, y: H - 7, 'text-anchor': 'middle' }, xg);
        t.textContent = b.tick;
      }
    });
    const bars = svgEl('g', { class: 'bars' }, svg);
    out.forEach((b, i) => {
      const x = L + step * i + (step - bw) / 2;
      svgEl('rect', { class: 'stub', x, y: base - 4, width: bw, height: 4, rx: 2 }, bars); // penanda periode tanpa pemakaian
      const r = svgEl('rect', { class: b.now ? 'bar now' : 'bar', 'data-b': i, x, width: bw, rx }, bars);
      r.style.y = `${base}px`;
      r.style.height = '0px';
    });
    svgEl('path', { class: 'trend' }, svg);
    svgEl('circle', { class: 'tdot', r: 5 }, svg);
    const hits = svgEl('g', { class: 'hits' }, svg);
    out.forEach((b, i) => svgEl('rect', { class: 'hit', 'data-i': i, x: L + step * i, y: 0, width: step, height: H }, hits));
    svgEl('text', { class: 'empty', x: L + pw / 2, y: T + ph / 2, 'text-anchor': 'middle' }, svg);
    el.append(svg);
    void el.offsetWidth;
  }
  svg.setAttribute('aria-label', `${title}, ${METRICS[state.metric].label}`);

  // garis bantu dan label sumbu Y mengikuti skala terbaru
  const grid = svg.querySelector('.grid');
  grid.textContent = '';
  for (let g = 0; g < 4; g++) {
    const gy = T + (ph * g) / 4;
    svgEl('line', { class: 'gl', x1: L, x2: W - R, y1: gy, y2: gy }, grid);
    const t = svgEl('text', { class: 'ax', x: L - 10, y: gy + 4, 'text-anchor': 'end' }, grid);
    t.textContent = fmtC.format(max - (max * g) / 4);
  }

  const instant = mode === 'instant' || reduceMotion;

  // garis tren rata-rata berjalan
  const trend = svg.querySelector('.trend');
  const dot = svg.querySelector('.tdot');
  trend.style.transition = dot.style.transition = instant ? 'none' : '';
  if (hasTrend) {
    const pts = ma.slice(0, last + 1).map((v, i) => [L + step * i + step / 2, base - (v / max) * ph]);
    const curve = (P) => {
      let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i], cx = ((a[0] + b[0]) / 2).toFixed(1);
        d += ` C${cx} ${a[1].toFixed(1)} ${cx} ${b[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      }
      return `path("${d}")`;
    };
    const end = pts[pts.length - 1];
    if (mode === 'grow' && !instant) { // garis naik dari dasar bersama batang
      trend.style.d = curve(pts.map((p) => [p[0], base]));
      dot.style.cx = `${end[0]}px`; dot.style.cy = `${base}px`;
      getComputedStyle(trend).d; getComputedStyle(dot).cy;
    }
    trend.style.d = curve(pts);
    dot.style.cx = `${end[0]}px`; dot.style.cy = `${end[1]}px`;
    trend.style.opacity = dot.style.opacity = '1';
  } else {
    trend.style.opacity = dot.style.opacity = '0';
  }
  svg.querySelectorAll('.bar').forEach((r) => {
    const i = +r.dataset.b;
    const v = vals[i];
    const h = v > 0 ? Math.max(rx * 2, (v / max) * ph) : 0;
    r.style.transition = instant ? 'none' : '';
    r.style.transitionDelay = mode === 'grow' && !instant ? `${i * (360 / out.length)}ms` : '0ms';
    r.style.y = `${base - h}px`;
    r.style.height = `${h}px`;
  });
  svg.querySelector('.empty').textContent = vals.every((v) => v === 0) ? 'Belum ada pemakaian pada periode ini' : '';
  renderHeat(out, vals, nowIdx);
}

// Kalender warna di bawah grafik: hari (Harian) atau bulan (Bulanan), makin pekat makin banyak token.
function heatLevel(v, max) {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(Math.pow(v / max, 0.55) * 4)));
}

function renderHeat(out, vals, nowIdx) {
  const el = $('heat');
  if (state.view === 'year' || out.length < 3) { el.hidden = true; return; }
  el.hidden = false;
  const key = `${state.view}|${state.year}|${out[0].key}`;
  if (el.dataset.key !== key) {
    let html = '';
    if (state.view === 'day') {
      html += ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((w) => `<span class="wd" aria-hidden="true">${w}</span>`).join('');
      const first = new Date(`${out[0].key}T00:00`);
      html += '<span aria-hidden="true"></span>'.repeat((first.getDay() + 6) % 7);
    }
    html += out.map((b, i) => `<div class="hc${b.now ? ' now' : ''}" role="listitem" data-i="${i}"><span>${esc(b.tick)}</span><b></b></div>`).join('');
    html += '<p class="heat-lg" aria-hidden="true">Sedikit <i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i> Banyak</p>';
    el.className = `heat ${state.view}`;
    el.innerHTML = html;
    el.dataset.key = key;
  }
  const max = Math.max(0, ...vals);
  el.querySelectorAll('.hc').forEach((c) => {
    const i = +c.dataset.i;
    const v = vals[i];
    c.dataset.l = heatLevel(v, max);
    c.querySelector('b').textContent = v > 0 ? fmtC.format(v) : '';
    c.classList.toggle('future', nowIdx >= 0 && i > nowIdx);
    c.setAttribute('aria-label', `${out[i].title}: ${fmtFull.format(v)} token`);
  });
}

function showTip(i, evt) {
  const b = lastBuckets[i];
  if (!b) return;
  const tip = $('tip');
  const s = b.s;
  tip.innerHTML = `<b>${esc(b.title)}</b>
    <div class="tr main"><span>${esc(METRICS[state.metric].label)}</span><span>${fmtFull.format(metricOf(s))}</span></div>
    <div class="tr"><span>Input</span><span>${fmtFull.format(s.i)}</span></div>
    <div class="tr"><span>Output</span><span>${fmtFull.format(s.o)}</span></div>
    <div class="tr"><span>Cache tulis</span><span>${fmtFull.format(s.cw)}</span></div>
    <div class="tr"><span>Cache baca</span><span>${fmtFull.format(s.cr)}</span></div>
    <div class="tr"><span>Balasan</span><span>${fmtFull.format(s.n)}</span></div>`;
  const card = tip.parentElement.getBoundingClientRect();
  let x = evt.clientX - card.left + 16;
  const y = Math.max(8, evt.clientY - card.top - 20);
  if (x + tip.offsetWidth > card.width - 8) x = evt.clientX - card.left - tip.offsetWidth - 16;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
  tip.classList.add('show');
  const chart = $('chart');
  chart.classList.add('hovering');
  const cur = chart.querySelector('.cursor');
  if (cur) cur.style.x = `${+chart.querySelector(`.hit[data-i="${i}"]`).getAttribute('x')}px`;
  chart.querySelectorAll('.bar').forEach((n) => n.classList.toggle('on', +n.dataset.b === i));
  $('heat').querySelectorAll('.hc').forEach((n) => n.classList.toggle('on', +n.dataset.i === i));
}

function hideTip() {
  $('tip').classList.remove('show');
  const chart = $('chart');
  chart.classList.remove('hovering');
  chart.querySelectorAll('.bar.on').forEach((n) => n.classList.remove('on'));
  $('heat').querySelectorAll('.hc.on').forEach((n) => n.classList.remove('on'));
}

// ---------- daftar perangkat & model ----------
// Bilah porsi baris: lebarnya = porsi baris ini (0-100).
function trackHtml(w) {
  return `<span class="pb"><i data-w="${w}"></i></span>`;
}

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < ONLINE_MS) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

// Isi ulang daftar hanya bila berubah, lalu animasikan lebar bar porsi.
// Isi ulang daftar hanya bila berubah, lalu animasikan lebar bilah dari nilai sebelumnya.
function fillList(el, html) {
  if (el.dataset.html === html) return;
  const prev = {};
  el.querySelectorAll('[data-k] .pb i').forEach((n) => { prev[n.closest('[data-k]').dataset.k] = n.style.width; });
  el.innerHTML = html;
  el.dataset.html = html;
  // CSP melarang atribut style di HTML, jadi lebar bilah dipasang lewat skrip
  const bars = el.querySelectorAll('.pb i');
  bars.forEach((n) => { n.style.transition = 'none'; n.style.width = prev[n.closest('[data-k]').dataset.k] || '0%'; });
  void el.offsetWidth;
  bars.forEach((n) => { n.style.transition = ''; n.style.width = `${n.dataset.w}%`; });
}

function inRange(list) {
  const keys = new Set(lastBuckets.map((b) => b.key));
  return list.filter((r) => keys.has(state.view === 'year' ? r.d.slice(0, 4) : r.d));
}

function renderLists() {
  const d = state.data;
  const self = d.sync && d.sync.self;
  const kind = state.view === 'day' ? 'daily' : 'monthly';

  // Perangkat: selalu semua perangkat agar bisa dibandingkan.
  const byM = new Map();
  for (const r of inRange(d[kind] || [])) groupInto(byM, r.m, r);
  const ms = d.machines.map((m) => ({ m, s: byM.get(m.id) || emptySum() })).sort((a, b) => metricOf(b.s) - metricOf(a.s));
  const all = ms.reduce((a, x) => addTo(a, x.s), emptySum());
  const topAll = Math.max(1, metricOf(all));
  const dev = (id, name, meta, s, tag = '') => `<button class="row dev${state.machine === id ? ' on' : ''}" data-k="${esc(id)}" data-m="${esc(id)}" aria-pressed="${state.machine === id}">
      <span class="name"><span>${esc(name)}</span>${tag}</span>
      <span class="val" title="${fmtFull.format(metricOf(s))}">${fmtC.format(metricOf(s))}</span>
      <span class="meta">${meta}</span>
      ${trackHtml(((metricOf(s) / topAll) * 100).toFixed(1), s)}
    </button>`;
  const devRows = ms.map(({ m, s }) => {
    const rel = relTime(m.last_seen);
    return dev(m.id, m.name, `<span class="dot ${rel ? '' : 'ok'}"></span>${rel ? 'Terakhir aktif ' + rel : 'Online'}, ${esc(m.user)}, ${fmtFull.format(s.n)} balasan`, s,
      m.id === self ? '<em class="you">komputer ini</em>' : '');
  }).join('');
  // "Semua perangkat" hanya berguna sebagai pilihan bila perangkatnya lebih dari satu
  fillList($('listMachines'), ms.length > 1
    ? dev('all', 'Semua perangkat', `${ms.length} perangkat, ${fmtFull.format(all.n)} balasan`, all) + devRows
    : devRows || '<p class="empty-list">Belum ada perangkat yang mengirim data.</p>');

  // Model: mengikuti filter perangkat.
  const byMo = new Map();
  for (const r of inRange(rows(kind))) groupInto(byMo, r.mo, r);
  const mos = [...byMo.entries()].map(([mo, s]) => ({ mo, s })).filter((x) => x.s.n > 0).sort((a, b) => metricOf(b.s) - metricOf(a.s));
  const total = mos.reduce((a, x) => a + metricOf(x.s), 0) || 1;
  fillList($('listModels'), mos.length ? mos.map(({ mo, s }) => {
    const v = metricOf(s);
    const pct = (v / total) * 100;
    const pctTxt = pct > 0 && pct < 0.1 ? '<0,1%' : `${pct.toFixed(1).replace('.', ',')}%`;
    return `<div class="row" data-k="${esc(mo)}">
      <span class="name"><span>${esc(mo)}</span></span>
      <span class="val" title="${fmtFull.format(v)}">${fmtC.format(v)}</span>
      <span class="meta">${fmtFull.format(s.n)} balasan, ${pctTxt}</span>
      ${trackHtml(pct.toFixed(1), s)}
    </div>`;
  }).join('') : '<p class="empty-list">Belum ada pemakaian pada periode ini.</p>');
}

// ---------- kontrol periode ----------
function moveSegIndicator(animate) {
  const active = document.querySelector('.seg button[aria-selected="true"]');
  const ind = document.querySelector('.seg-ind');
  if (!active) return;
  ind.style.transition = animate ? '' : 'none';
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}

// ---------- pengaturan ----------
async function openSettings() {
  const s = await window.api.getSettings();
  const f = $('frm');
  f.supabaseUrl.value = s.supabaseUrl;
  f.supabaseKey.value = s.supabaseKey;
  f.teamKey.value = s.teamKey;
  f.displayName.value = s.displayName;
  f.displayName.placeholder = s.hostname;
  f.autostart.checked = s.autostart;
  $('devInfo').textContent = `Komputer ini: ${s.hostname}, pengguna ${s.user}, versi ${s.version}`;
  setMsg('', '');
  $('verNow').textContent = s.version;
  $('verMsg').textContent = '';
  $('dlg').showModal();
}

function formValues() {
  const f = $('frm');
  return {
    supabaseUrl: f.supabaseUrl.value, supabaseKey: f.supabaseKey.value, teamKey: f.teamKey.value,
    displayName: f.displayName.value, autostart: f.autostart.checked,
  };
}

function setMsg(text, cls) { const m = $('testMsg'); m.textContent = text; m.className = `msg ${cls}`; }

// ---------- event ----------
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  if (state.view === b.dataset.view) return;
  state.view = b.dataset.view;
  document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  moveSegIndicator(true);
  hideTip();
  render('grow');
}));
$('listMachines').addEventListener('click', (e) => {
  const b = e.target.closest('.dev');
  if (!b) return;
  // klik perangkat yang sedang dipilih = kembali ke semua perangkat
  state.machine = state.machine === b.dataset.m ? 'all' : b.dataset.m;
  render('update');
});
$('fMetric').value = state.metric;
$('fMetric').addEventListener('change', (e) => {
  state.metric = e.target.value;
  try { localStorage.setItem('tessly.metric', state.metric); } catch { /* tanpa penyimpanan: pilihan berlaku sampai aplikasi ditutup */ }
  render('update');
});
$('yPrev').addEventListener('click', () => { state.year--; render('grow'); });
$('yNext').addEventListener('click', () => { state.year++; render('grow'); });

$('chart').addEventListener('mousemove', (e) => {
  const t = e.target.closest('[data-i]');
  if (t) showTip(+t.dataset.i, e); else hideTip();
});
$('chart').addEventListener('mouseleave', hideTip);
$('heat').addEventListener('mousemove', (e) => {
  const t = e.target.closest('.hc');
  if (t) showTip(+t.dataset.i, e); else hideTip();
});
$('heat').addEventListener('mouseleave', hideTip);

document.addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) openSettings(); });
$('btnSettings').addEventListener('click', openSettings);
$('btnTheme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('tessly.theme', root.dataset.theme); } catch { /* berlaku sampai aplikasi ditutup */ }
});
$('btnCancel').addEventListener('click', () => $('dlg').close());
$('btnTest').addEventListener('click', async () => {
  setMsg('Menguji koneksi…', '');
  const r = await window.api.testConnection(formValues());
  setMsg(r.message, r.ok ? 'ok' : 'err');
});
$('frm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btnSave').disabled = true;
  setMsg('Menyimpan dan mengirim data…', '');
  try {
    const st = await window.api.saveSettings(formValues());
    if (st.lastError) setMsg(`Tersimpan, tapi pengiriman gagal: ${st.lastError}`, 'err');
    else $('dlg').close();
  } finally {
    $('btnSave').disabled = false;
    refresh();
  }
});
$('btnSync').addEventListener('click', async () => {
  const b = $('btnSync');
  b.disabled = true;
  b.classList.add('busy');
  const started = Date.now();
  try {
    await window.api.syncNow();
    await refresh();
  } finally {
    setTimeout(() => { b.disabled = false; b.classList.remove('busy'); }, Math.max(0, 600 - (Date.now() - started)));
  }
});

// ---------- popup update ----------
let upd = { status: 'idle' };
let dismissedKey = null;

function updKey(u) { return `${u.status}|${u.version}`; }

function hideUpd() {
  const box = $('upd');
  if (box.hidden || box.classList.contains('out')) return;
  box.classList.add('out');
  box.addEventListener('animationend', () => { box.hidden = true; box.classList.remove('out'); }, { once: true });
}

function renderUpd(u) {
  upd = u;
  if (u.current) $('appVer').textContent = `Tessly ${u.current}`;
  const box = $('upd');
  const show = ['available', 'downloading', 'ready'].includes(u.status) || (u.status === 'error' && u.version);
  if (!show || dismissedKey === updKey(u)) { hideUpd(); return; }

  const go = $('updGo'), later = $('updLater'), bar = $('updBar'), notes = $('updNotes');
  box.dataset.status = u.status;
  later.hidden = false;
  go.hidden = false;
  go.disabled = false;
  bar.hidden = true;
  notes.hidden = true;

  if (u.status === 'available') {
    $('updTitle').textContent = `Versi ${u.version} tersedia`;
    $('updText').textContent = `Anda memakai versi ${u.current}.`;
    if (u.notes) { notes.textContent = u.notes; notes.hidden = false; }
    go.textContent = 'Unduh dan pasang';
    later.textContent = 'Nanti';
  } else if (u.status === 'downloading') {
    $('updTitle').textContent = `Mengunduh versi ${u.version}`;
    $('updText').textContent = `${u.percent}% selesai. Anda tetap bisa memakai aplikasi.`;
    bar.hidden = false;
    bar.firstElementChild.style.width = `${u.percent}%`;
    go.hidden = true;
    later.textContent = 'Sembunyikan';
  } else if (u.status === 'ready') {
    $('updTitle').textContent = `Versi ${u.version} siap dipasang`;
    $('updText').textContent = 'Tessly akan tertutup sebentar, lalu terbuka lagi dengan versi baru.';
    go.textContent = 'Pasang sekarang';
    later.textContent = 'Saat keluar saja';
  } else {
    $('updTitle').textContent = 'Unduhan update gagal';
    $('updText').textContent = u.error || 'Periksa koneksi internet, lalu coba lagi.';
    go.textContent = 'Coba lagi';
    later.textContent = 'Tutup';
  }
  if (box.hidden) { box.classList.remove('out'); box.hidden = false; }
}

$('updGo').addEventListener('click', async () => {
  $('updGo').disabled = true;
  if (upd.status === 'ready') await window.api.update.install();
  else await window.api.update.download();
});
$('updLater').addEventListener('click', () => {
  dismissedKey = updKey(upd);
  hideUpd();
});
$('updClose').addEventListener('click', () => $('updLater').click());

window.api.update.onState((u) => {
  // popup "sedang mengunduh" yang disembunyikan muncul lagi begitu unduhan selesai
  if (dismissedKey && dismissedKey.startsWith('downloading|') && u.status !== 'downloading') dismissedKey = null;
  renderUpd(u);
  renderVerMsg(u);
});
window.api.update.get().then(renderUpd);

function renderVerMsg(u) {
  const m = $('verMsg');
  $('verNow').textContent = u.current || '';
  const map = {
    checking: ['Memeriksa…', ''],
    latest: ['Sudah versi terbaru', 'ok'],
    available: [`Versi ${u.version} tersedia`, 'ok'],
    downloading: [`Mengunduh ${u.percent}%`, ''],
    ready: [`Versi ${u.version} siap dipasang`, 'ok'],
    dev: ['Mode pengembangan: cek update hanya berjalan di aplikasi terpasang', ''],
    error: [u.error ? `Gagal memeriksa: ${u.error}` : 'Gagal memeriksa update', 'err'],
  };
  const r = map[u.status];
  if (!r) return;
  m.textContent = r[0];
  m.className = `sub ${r[1]}`;
}

$('btnCheckUpd').addEventListener('click', async () => {
  const b = $('btnCheckUpd');
  b.disabled = true;
  renderVerMsg({ status: 'checking' });
  try {
    const u = await window.api.update.check();
    dismissedKey = null;
    renderVerMsg(u);
    renderUpd(u);
  } finally {
    b.disabled = false;
  }
});

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { renderChart('instant'); moveSegIndicator(false); }, 80);
});

let updT;
window.api.onUpdated(() => { clearTimeout(updT); updT = setTimeout(refresh, 1500); });
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

document.fonts.ready.then(() => moveSegIndicator(false));
moveSegIndicator(false);
refresh();
