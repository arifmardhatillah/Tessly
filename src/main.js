const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Scanner } = require('./scanner');
const { History } = require('./history');
const updater = require('./updater');

const FULL_SCAN_MS = 30_000; // cadangan; perubahan log biasanya sudah tertangkap lewat fs.watch
const WATCH_DEBOUNCE_MS = 200; // Claude Code menulis beberapa baris sekaligus; tunggu sebentar lalu baca sekali

let win = null;
let tray = null;
let cfg = null;
let history = null;
let quitting = false;
let scanned = false; // pembacaan log pertama sudah selesai
let snapshotCache = null;
const scanner = new Scanner();

// Mode tangkap layar pengembangan memakai folder data sendiri agar tidak bentrok dengan versi terpasang.
if (!app.isPackaged && process.env.TM_SHOT) app.setPath('userData', path.join(os.tmpdir(), 'tessly-dev'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

// ---------- pengaturan ----------
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
  } catch {
    /* belum ada pengaturan: pakai bawaan */
  }
  return { autostart: raw.autostart !== false };
}

function saveConfig(c) {
  fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
  fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 2));
}

function applyAutostart() {
  if (!app.isPackaged) return; // saat pengembangan jangan daftarkan electron.exe
  app.setLoginItemSettings({ openAtLogin: cfg.autostart, args: ['--hidden'] });
}

// ---------- data untuk dashboard ----------
function isoDay(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Total per hari dan per bulan (per model). Dihitung ulang hanya bila riwayat berubah.
function snapshot() {
  if (snapshotCache) return snapshotCache;
  const daily = history.rows();
  const months = new Map();
  for (const r of daily) {
    const k = `${r.d.slice(0, 7)}|${r.mo}`;
    const a = months.get(k) || { d: r.d.slice(0, 7), mo: r.mo, i: 0, o: 0, cw: 0, cr: 0, n: 0 };
    for (const f of ['i', 'o', 'cw', 'cr', 'n']) a[f] += r[f];
    months.set(k, a);
  }
  snapshotCache = { ready: scanned || history.size > 0, daily, monthly: [...months.values()] };
  return snapshotCache;
}

function publish() {
  snapshotCache = null;
  if (win && !win.isDestroyed()) win.webContents.send('data', snapshot());
  updateTrayTooltip();
}

// ---------- membaca log ----------
const pending = new Set(); // file log yang baru berubah menurut fs.watch
let scanning = false;
let fullAgain = false;
let watchTimer = null;

async function scan(full) {
  if (scanning) {
    fullAgain = fullAgain || full;
    return;
  }
  scanning = true;
  try {
    let changed;
    if (full) {
      pending.clear();
      changed = await scanner.scan();
    } else {
      const files = [...pending];
      pending.clear();
      changed = await scanner.scanFiles(files);
    }
    const first = !scanned;
    scanned = true;
    if ((changed && history.merge(scanner.aggregate())) || first) publish();
  } catch (e) {
    console.error(e);
  } finally {
    scanning = false;
  }
  if (fullAgain || pending.size) {
    const f = fullAgain;
    fullAgain = false;
    scan(f);
  }
}

// Claude Code menulis log tiap kali membalas; fs.watch memberi tahu saat itu juga, jadi angka langsung naik.
function watchLogs() {
  for (const root of scanner.roots) {
    try {
      fs.watch(root, { recursive: true }, (_event, file) => {
        if (!file || !file.endsWith('.jsonl')) return;
        pending.add(path.join(root, file));
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => scan(false), WATCH_DEBOUNCE_MS);
      }).on('error', () => {
        /* folder dihapus atau tidak bisa dipantau: pembacaan berkala tetap berjalan */
      });
    } catch {
      /* folder log belum ada: pembacaan berkala tetap berjalan */
    }
  }
}

// ---------- IPC ----------
ipcMain.handle('get-data', () => snapshot());

ipcMain.handle('get-settings', () => ({
  autostart: cfg.autostart,
  hostname: os.hostname(),
  user: os.userInfo().username,
  version: app.getVersion(),
  logFolders: scanner.roots,
}));

ipcMain.handle('save-settings', (_e, s) => {
  cfg = { ...cfg, autostart: Boolean(s && s.autostart) };
  saveConfig(cfg);
  applyAutostart();
  return true;
});

ipcMain.handle('update-get', () => updater.getState());
ipcMain.handle('update-check', () => updater.check(true));
ipcMain.handle('update-download', () => updater.download());
ipcMain.handle('update-install', () => updater.install());

// ---------- jendela & tray ----------
function createWindow(show) {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Tessly: AI Token Tracker',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#f5f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => show && win.show());
  // Khusus pengembangan: TM_SHOT=file.png -> simpan tangkapan layar lalu keluar.
  if (!app.isPackaged && process.env.TM_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      // TM_JS: skrip yang dijalankan di halaman sebelum dipotret, misal untuk mengklik tab atau membuka dialog
      if (process.env.TM_JS) {
        await win.webContents.executeJavaScript(process.env.TM_JS, true);
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!process.env.TM_DELAY) {
        win.setContentSize(1180, 1250);
        await new Promise((r) => setTimeout(r, 800));
      }
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.TM_SHOT, img.toPNG());
      quitting = true;
      app.quit();
    }, Number(process.env.TM_DELAY) || 4000));
  }
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

const trayFmt = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
function updateTrayTooltip() {
  if (!tray) return;
  const today = isoDay(Date.now());
  const t = snapshot().daily.filter((r) => r.d === today).reduce((a, r) => a + r.i + r.o, 0); // sama dengan angka utama di dashboard
  tray.setToolTip(`Tessly: ${trayFmt.format(t)} token hari ini`);
}

function buildTrayMenu() {
  if (!tray) return;
  const u = updater.getState();
  const updItems = [];
  if (u.status === 'available') updItems.push({ label: `Unduh update ${u.version}`, click: () => { showWindow(); updater.download(); } });
  if (u.status === 'downloading') updItems.push({ label: `Mengunduh update ${u.percent}%`, enabled: false });
  if (u.status === 'ready') updItems.push({ label: `Pasang update ${u.version} dan mulai ulang`, click: () => updater.install() });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Buka Tessly', click: showWindow },
      ...(updItems.length ? [{ type: 'separator' }, ...updItems] : []),
      { type: 'separator' },
      {
        label: 'Keluar',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  buildTrayMenu();
  tray.on('click', showWindow);
  updateTrayTooltip();
}

app.whenReady().then(() => {
  cfg = loadConfig();
  history = new History(path.join(app.getPath('userData'), 'history.json'));
  applyAutostart();
  createTray();
  createWindow(!process.argv.includes('--hidden'));
  updater.init({
    send: (st) => win && !win.isDestroyed() && win.webContents.send('update-state', st),
    isWindowVisible: () => Boolean(win && !win.isDestroyed() && win.isVisible()),
    showWindow,
    refreshTray: buildTrayMenu,
    beforeQuit: () => { quitting = true; },
  });
  watchLogs();
  scan(true);
  setInterval(() => scan(true), FULL_SCAN_MS);
});

app.on('before-quit', () => {
  quitting = true;
  if (history) history.save();
});
app.on('window-all-closed', () => {
  /* tetap jalan di tray */
});
