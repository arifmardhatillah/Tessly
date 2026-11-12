const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, safeStorage, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { Scanner } = require('./scanner');
const cloud = require('./cloud');
const updater = require('./updater');

const SCAN_MS = 10_000; // baca log tiap 10 detik
const HEARTBEAT_MS = 60_000; // lapor "masih hidup" ke Supabase tiap menit
const RETRY_MS = 30_000;
const DAILY_DAYS = 62;

let win = null;
let tray = null;
let cfg = null;
let quitting = false;
let tickBusy = false;
let firstScan = Promise.resolve(); // dashboard menunggu pembacaan log pertama selesai
const scanner = new Scanner();
const sync = { lastOk: null, lastError: null, lastAttempt: 0, pushed: new Map() };

// Mode tangkap layar pengembangan memakai folder data sendiri agar tidak bentrok dengan versi terpasang.
if (!app.isPackaged && process.env.TM_SHOT) app.setPath('userData', path.join(os.tmpdir(), 'tessly-dev'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

// ---------- konfigurasi ----------
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

function enc(s) {
  if (!s) return '';
  return safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : s;
}
function dec(s) {
  if (!s) return '';
  if (!s.startsWith('enc:')) return s;
  try {
    return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
  } catch {
    return '';
  }
}

// Pengaturan dari nama lama (TokenMeter) disalin sekali agar ID perangkat tetap sama.
function migrateOldConfig() {
  if (fs.existsSync(cfgPath())) return;
  const old = path.join(app.getPath('appData'), 'tokenmeter', 'config.json');
  try {
    if (fs.existsSync(old)) {
      fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
      fs.copyFileSync(old, cfgPath());
    }
  } catch (e) {
    console.error('Gagal menyalin pengaturan lama:', e);
  }
}

function loadConfig() {
  migrateOldConfig();
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
  } catch {}
  const c = {
    machineId: raw.machineId || crypto.randomUUID(),
    supabaseUrl: raw.supabaseUrl || '',
    supabaseKey: dec(raw.supabaseKey),
    teamKey: dec(raw.teamKey),
    displayName: raw.displayName || '',
    autostart: raw.autostart !== false,
  };
  if (!raw.machineId) saveConfig(c);
  return c;
}

function saveConfig(c) {
  fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
  const out = { ...c, supabaseKey: enc(c.supabaseKey), teamKey: enc(c.teamKey) };
  fs.writeFileSync(cfgPath(), JSON.stringify(out, null, 2));
}

const cloudReady = (c = cfg) => Boolean(c.supabaseUrl && c.supabaseKey && c.teamKey);

function machineInfo() {
  return {
    id: cfg.machineId,
    name: cfg.displayName.trim() || os.hostname(),
    user: os.userInfo().username,
    version: app.getVersion(),
  };
}

function applyAutostart() {
  if (!app.isPackaged) return; // saat pengembangan jangan daftarkan electron.exe
  app.setLoginItemSettings({ openAtLogin: cfg.autostart, args: ['--hidden'] });
}

// ---------- sinkronisasi ----------
const rowKey = (r) => `${r.d}|${r.mo}`;
const rowSig = (r) => `${r.i},${r.o},${r.cw},${r.cr},${r.n}`;

async function push(force = false) {
  if (!cloudReady()) return;
  const now = Date.now();
  if (sync.lastError && !force && now - sync.lastAttempt < RETRY_MS) return;

  const due = scanner.aggregate().filter((r) => sync.pushed.get(rowKey(r)) !== rowSig(r));
  if (!due.length && !force && now - sync.lastAttempt < HEARTBEAT_MS) return;

  sync.lastAttempt = now;
  try {
    const batches = [];
    for (let i = 0; i < due.length; i += 500) batches.push(due.slice(i, i + 500));
    if (!batches.length) batches.push([]); // heartbeat saja
    for (const b of batches) {
      await cloud.rpc(cfg, 'tm_push', { p_key: cfg.teamKey, p_machine: machineInfo(), p_rows: b });
      for (const r of b) sync.pushed.set(rowKey(r), rowSig(r));
    }
    sync.lastOk = new Date().toISOString();
    sync.lastError = null;
  } catch (e) {
    sync.lastError = e.message;
  }
  notify();
}

async function tick() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    if (await scanner.scan()) notify();
    await push();
  } catch (e) {
    console.error(e);
  } finally {
    tickBusy = false;
  }
}

function notify() {
  if (win && !win.isDestroyed()) win.webContents.send('updated');
  updateTrayTooltip();
}

// ---------- data untuk dashboard ----------
function isoDay(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localData() {
  const me = machineInfo();
  const daily = scanner.aggregate().map((r) => ({ m: me.id, ...r }));
  const months = new Map();
  for (const r of daily) {
    const k = `${r.d.slice(0, 7)}|${r.mo}`;
    const a = months.get(k) || { m: me.id, d: r.d.slice(0, 7), mo: r.mo, i: 0, o: 0, cw: 0, cr: 0, n: 0 };
    for (const f of ['i', 'o', 'cw', 'cr', 'n']) a[f] += r[f];
    months.set(k, a);
  }
  return {
    machines: [{ id: me.id, name: me.name, user: me.user, version: me.version, last_seen: new Date().toISOString() }],
    daily,
    monthly: [...months.values()],
  };
}

const syncStatus = () => ({
  configured: cloudReady(),
  lastOk: sync.lastOk,
  lastError: sync.lastError,
  self: cfg.machineId,
});

ipcMain.handle('get-data', async () => {
  await firstScan;
  if (!cloudReady()) return { source: 'local', ...localData(), sync: syncStatus() };
  try {
    const r = await cloud.rpc(cfg, 'tm_get', {
      p_key: cfg.teamKey,
      p_daily_since: isoDay(Date.now() - DAILY_DAYS * 86_400_000),
    });
    return { source: 'cloud', machines: r.machines, daily: r.daily, monthly: r.monthly, sync: syncStatus() };
  } catch (e) {
    return { source: 'local', ...localData(), cloudError: e.message, sync: syncStatus() };
  }
});

ipcMain.handle('get-settings', () => ({
  supabaseUrl: cfg.supabaseUrl,
  supabaseKey: cfg.supabaseKey,
  teamKey: cfg.teamKey,
  displayName: cfg.displayName,
  autostart: cfg.autostart,
  hostname: os.hostname(),
  user: os.userInfo().username,
  machineId: cfg.machineId,
  version: app.getVersion(),
  logFolders: scanner.roots,
}));

function cleanSettings(s) {
  return {
    supabaseUrl: String(s.supabaseUrl || '').trim(),
    supabaseKey: String(s.supabaseKey || '').trim(),
    teamKey: String(s.teamKey || '').trim(),
    displayName: String(s.displayName || '').trim().slice(0, 60),
    autostart: Boolean(s.autostart),
  };
}

ipcMain.handle('test-connection', async (_e, s) => {
  const c = { ...cfg, ...cleanSettings(s) };
  if (!cloudReady(c)) return { ok: false, message: 'Isi URL, kunci API, dan kunci tim.' };
  try {
    await cloud.rpc(c, 'tm_get', { p_key: c.teamKey, p_daily_since: isoDay(Date.now()) });
    return { ok: true, message: 'Terhubung. Kunci tim cocok.' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('save-settings', async (_e, s) => {
  const before = cfg.supabaseUrl + cfg.teamKey;
  cfg = { ...cfg, ...cleanSettings(s) };
  saveConfig(cfg);
  applyAutostart();
  if (before !== cfg.supabaseUrl + cfg.teamKey) sync.pushed.clear(); // tujuan baru: kirim ulang semua
  sync.lastError = null;
  await push(true);
  return syncStatus();
});

ipcMain.handle('sync-now', async () => {
  await scanner.scan();
  await push(true);
  return syncStatus();
});

ipcMain.handle('remove-machine', async (_e, id) => {
  await cloud.rpc(cfg, 'tm_remove_machine', { p_key: cfg.teamKey, p_machine_id: String(id) });
  return true;
});

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
    backgroundColor: require('electron').nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#f5f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

function updateTrayTooltip() {
  if (!tray) return;
  const today = isoDay(Date.now());
  const t = scanner.aggregate().filter((r) => r.d === today).reduce((a, r) => a + r.i + r.o, 0); // input + output, sama dengan angka utama di dashboard
  const fmt = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(t);
  const st = !cloudReady() ? 'mode lokal' : sync.lastError ? 'gagal sinkron' : 'tersinkron';
  tray.setToolTip(`Tessly: ${fmt} token hari ini (${st})`);
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
      { label: 'Sinkron sekarang', click: () => scanner.scan().then(() => push(true)) },
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

// ---------- update aplikasi ----------
ipcMain.handle('update-get', () => updater.getState());
ipcMain.handle('update-check', () => updater.check(true));
ipcMain.handle('update-download', () => updater.download());
ipcMain.handle('update-install', () => updater.install());

app.whenReady().then(async () => {
  cfg = loadConfig();
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
  firstScan = scanner.scan().catch((e) => console.error(e)); // tanpa menunggu kiriman ke Supabase
  await firstScan;
  await tick();
  setInterval(tick, SCAN_MS);
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {
  /* tetap jalan di tray */
});
