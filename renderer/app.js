'use strict';

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
  total: { label: 'Semua token', get: (r) => r.i + r.o + r.cw + r.cr },
  io: { label: 'Input + output', get: (r) => r.i + r.o },
  i: { label: 'Input', get: (r) => r.i },
  o: { label: 'Output', get: (r) => r.o },
  cw: { label: 'Cache tulis', get: (r) => r.cw },
  cr: { label: 'Cache baca', get: (r) => r.cr },
};

const state = { view: 'day', metric: 'total', machine: 'all', year: new Date().getFullYear(), data: null };
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
  if (reduceMotion || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(from + (to - from) * easeOut(k));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
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
  b.textContent = `+${fmtC.format(n)} token`;
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
  $('source').textContent = d.source === 'cloud'
    ? `Gabungan ${d.machines.length} perangkat dari Supabase`
    : 'Hanya komputer ini (data lokal)';

  let dot = '', txt = '';
  if (!s.configured) txt = 'Belum terhubung ke Supabase';
  else if (d.cloudError) { dot = 'err'; txt = 'Gagal memuat data pusat'; }
  else if (s.lastError) { dot = 'err'; txt = 'Gagal mengirim data'; }
  else if (s.lastOk) { dot = 'ok'; txt = `Tersinkron pukul ${timeFmt.format(new Date(s.lastOk))}`; }
  else txt = 'Menyinkronkan…';
  const pill = $('syncState');
  pill.innerHTML = `<span class="dot ${dot}"></span>${esc(txt)}`;
  if (s.lastOk && lastSyncOk && s.lastOk !== lastSyncOk) {
    pill.classList.add('flash');
    setTimeout(() => pill.classList.remove('flash'), 900);
  }
  lastSyncOk = s.lastOk;

  const b = $('banner');
  let html = '';
  if (!s.configured) {
    html = '<span>Supabase belum diatur, jadi yang tampil baru pemakaian komputer ini. Isi pengaturan agar semua komputer terkumpul di sini.</span><button class="btn" data-open-settings>Atur Supabase</button>';
  } else if (d.cloudError || s.lastError) {
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
  const sel = $('fMachine');
  const machines = [...d.machines].sort((a, b) => a.name.localeCompare(b.name));
  if (state.machine !== 'all' && !machines.some((m) => m.id === state.machine)) state.machine = 'all';
  const html = ['<option value="all">Semua perangkat</option>']
    .concat(machines.map((m) => `<option value="${esc(m.id)}">${esc(machineLabel(m))}</option>`)).join('');
  if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
  sel.value = state.machine;
  sel.disabled = d.source !== 'cloud';
}

const BRK = [['Input', 'i'], ['Output', 'o'], ['Cache tulis', 'cw'], ['Cache baca', 'cr']];
const fmtCompact = (v) => fmtC.format(Math.round(v));
const fmtInt = (v) => fmtFull.format(Math.round(v));

function fillCard(id, when, s, isToday) {
  const card = $(id);
  const brk = card.querySelector('.brk');
  if (!brk.children.length) {
    brk.innerHTML = BRK.map(([k]) => `<div><dt>${k}</dt><dd>0</dd></div>`).join('');
  }
  card.querySelector('.when').textContent = when;
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
    return { out, title: 'Token per hari', range: '30 hari terakhir' };
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
    return { out, title: 'Token per bulan', range: `Tahun ${state.year}` };
  }
  const years = new Map();
  for (const [k, s] of map) groupInto(years, k.slice(0, 4), s);
  const ys = [...years.keys()].map(Number);
  const first = Math.min(now.getFullYear(), ...(ys.length ? ys : [now.getFullYear()]));
  const out = [];
  for (let y = first; y <= now.getFullYear(); y++) {
    out.push({ key: String(y), s: years.get(String(y)) || emptySum(), tick: String(y), title: `Tahun ${y}`, now: y === now.getFullYear() });
  }
  return { out, title: 'Token per tahun', range: 'Semua tahun' };
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

let lastBuckets = [];
let chartKey = '';
// mode: 'grow' (batang tumbuh dari nol), 'update' (berpindah halus ke nilai baru), 'instant'
function renderChart(mode = 'update') {
  const { out, title, range } = buckets();
  lastBuckets = out;
  $('chartTitle').textContent = title;
  $('chartSub').textContent = `${METRICS[state.metric].label}, ${range.toLowerCase()}`;
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
  const W = Math.max(320, el.clientWidth), H = el.clientHeight || 290;
  const L = 56, R = 6, T = 12, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const base = T + ph;
  const vals = out.map((b) => metricOf(b.s));
  const max = niceMax(Math.max(0, ...vals));
  const step = pw / out.length;
  const bw = Math.max(3, Math.min(52, step * 0.64));

  const key = `${state.view}|${state.year}|${out.length}|${W}|${H}`;
  let svg = el.querySelector('svg');
  const rebuild = !svg || key !== chartKey;
  if (rebuild) {
    if (mode === 'update') mode = 'grow';
    chartKey = key;
    el.textContent = '';
    svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    const defs = svgEl('defs', {}, svg);
    const clip = svgEl('clipPath', { id: 'plotClip' }, defs);
    svgEl('rect', { x: 0, y: 0, width: W, height: base }, clip);
    svgEl('g', { class: 'grid' }, svg);
    svgEl('line', { class: 'base', x1: L, x2: W - R, y1: base, y2: base }, svg);
    const xg = svgEl('g', {}, svg);
    const every = Math.ceil(out.length / Math.max(1, Math.floor(pw / 64)));
    out.forEach((b, i) => {
      if (i % every === 0) {
        const t = svgEl('text', { class: 'ax', x: L + step * i + step / 2, y: H - 8, 'text-anchor': 'middle' }, xg);
        t.textContent = b.tick;
      }
    });
    const bars = svgEl('g', { 'clip-path': 'url(#plotClip)', class: 'bars' }, svg);
    svgEl('rect', { class: 'cursor', x: L, y: T, width: step, height: ph, rx: 4 }, svg);
    const hits = svgEl('g', { class: 'hits' }, svg);
    out.forEach((b, i) => {
      const r = svgEl('rect', { class: 'bar', x: L + step * i + (step - bw) / 2, width: bw, rx: Math.min(4, bw / 2) }, bars);
      r.style.y = `${base}px`;
      r.style.height = '0px';
      svgEl('rect', { class: 'hit', 'data-i': i, x: L + step * i, y: T, width: step, height: ph }, hits);
    });
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
  const zero = svgEl('text', { class: 'ax', x: L - 10, y: base + 4, 'text-anchor': 'end' }, grid);
  zero.textContent = '0';

  const bars = svg.querySelectorAll('.bar');
  bars.forEach((r, i) => {
    const v = vals[i];
    const h = v > 0 ? Math.max(2, (v / max) * ph) : 0;
    const instant = mode === 'instant' || reduceMotion;
    r.style.transition = instant ? 'none' : '';
    r.style.transitionDelay = mode === 'grow' && !instant ? `${i * (360 / out.length)}ms` : '0ms';
    r.style.y = `${base - h}px`;
    r.style.height = `${h > 0 ? h + 6 : 0}px`; // +6 disembunyikan clip agar dasar tetap rata
    r.classList.toggle('today', Boolean(out[i].now));
  });
  svg.querySelector('.empty').textContent = vals.every((v) => v === 0) ? 'Belum ada pemakaian pada periode ini' : '';
}

function showTip(i, evt) {
  const b = lastBuckets[i];
  if (!b) return;
  const tip = $('tip');
  const s = b.s;
  tip.innerHTML = `<b>${esc(b.title)}</b>
    <div class="row main"><span>${esc(METRICS[state.metric].label)}</span><span>${fmtFull.format(metricOf(s))}</span></div>
    <div class="row"><span>Input</span><span>${fmtFull.format(s.i)}</span></div>
    <div class="row"><span>Output</span><span>${fmtFull.format(s.o)}</span></div>
    <div class="row"><span>Cache tulis</span><span>${fmtFull.format(s.cw)}</span></div>
    <div class="row"><span>Cache baca</span><span>${fmtFull.format(s.cr)}</span></div>
    <div class="row"><span>Balasan</span><span>${fmtFull.format(s.n)}</span></div>`;
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
  chart.querySelectorAll('.bar').forEach((n, k) => n.classList.toggle('on', k === i));
}

function hideTip() {
  $('tip').classList.remove('show');
  const chart = $('chart');
  chart.classList.remove('hovering');
  chart.querySelectorAll('.bar.on').forEach((n) => n.classList.remove('on'));
}

// ---------- daftar perangkat & model ----------
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
function fillList(el, html) {
  if (el.dataset.html === html) return;
  const prevW = {};
  el.querySelectorAll('[data-k] .track i').forEach((n) => { prevW[n.closest('[data-k]').dataset.k] = n.style.width; });
  el.innerHTML = html;
  el.dataset.html = html;
  const tracks = el.querySelectorAll('.track i');
  tracks.forEach((n) => {
    n.style.transition = 'none';
    n.style.width = prevW[n.closest('[data-k]').dataset.k] || '0%';
  });
  void el.offsetWidth;
  tracks.forEach((n) => { n.style.transition = ''; n.style.width = `${n.dataset.w}%`; });
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
  const topM = Math.max(1, ...ms.map((x) => metricOf(x.s)));
  fillList($('listMachines'), ms.length ? ms.map(({ m, s }) => {
    const rel = relTime(m.last_seen);
    const v = metricOf(s);
    return `<div class="item" data-k="${esc(m.id)}">
      <div>
        <div class="name"><span>${esc(m.name)}</span>${m.id === self ? '<em class="you">komputer ini</em>' : ''}</div>
        <div class="meta"><span class="dot ${rel ? '' : 'ok pulse'}"></span>${rel ? 'Terakhir aktif ' + rel : 'Online'}<span>${esc(m.user)}</span></div>
      </div>
      <div class="val" title="${fmtFull.format(v)}">${fmtC.format(v)}<small>${fmtFull.format(s.n)} balasan</small></div>
      <div class="track"><i data-w="${((v / topM) * 100).toFixed(1)}"></i></div>
    </div>`;
  }).join('') : '<p class="empty-list">Belum ada perangkat yang mengirim data.</p>');

  // Model: mengikuti filter perangkat.
  const byMo = new Map();
  for (const r of inRange(rows(kind))) groupInto(byMo, r.mo, r);
  const mos = [...byMo.entries()].map(([mo, s]) => ({ mo, s })).filter((x) => x.s.n > 0).sort((a, b) => metricOf(b.s) - metricOf(a.s));
  const total = mos.reduce((a, x) => a + metricOf(x.s), 0) || 1;
  fillList($('listModels'), mos.length ? mos.map(({ mo, s }) => {
    const v = metricOf(s);
    const pct = (v / total) * 100;
    const pctTxt = pct > 0 && pct < 0.1 ? '<0,1%' : `${pct.toFixed(1).replace('.', ',')}%`;
    return `<div class="item" data-k="${esc(mo)}">
      <div>
        <div class="name"><span>${esc(mo)}</span></div>
        <div class="meta">${fmtFull.format(s.n)} balasan, ${pctTxt}</div>
      </div>
      <div class="val" title="${fmtFull.format(v)}">${fmtC.format(v)}</div>
      <div class="track"><i data-w="${pct.toFixed(1)}"></i></div>
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
$('fMachine').addEventListener('change', (e) => { state.machine = e.target.value; render('update'); });
$('fMetric').addEventListener('change', (e) => { state.metric = e.target.value; render('update'); });
$('yPrev').addEventListener('click', () => { state.year--; render('grow'); });
$('yNext').addEventListener('click', () => { state.year++; render('grow'); });

$('chart').addEventListener('mousemove', (e) => {
  const t = e.target.closest('[data-i]');
  if (t) showTip(+t.dataset.i, e); else hideTip();
});
$('chart').addEventListener('mouseleave', hideTip);

document.addEventListener('click', (e) => { if (e.target.closest('[data-open-settings]')) openSettings(); });
$('btnSettings').addEventListener('click', openSettings);
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
