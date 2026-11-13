// Cek update dari GitHub Releases (arifmardhatillah/Tessly).
// Alur: cek -> popup "versi baru tersedia" -> pengguna klik unduh -> progres -> "pasang sekarang".
const { app, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');

// Rilis baru cepat ketahuan: cek tiap 10 menit, dan langsung saat jendela dibuka atau diklik.
// Pengecekan hanya membaca daftar rilis GitHub (beberapa KB), jadi ringan.
const CHECK_EVERY_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = process.env.TM_FAKE_UPDATE ? 500 : 3 * 1000;
const MIN_GAP_MS = 60 * 1000; // jarak minimal antar-pengecekan saat jendela berkali-kali diklik

const state = { status: 'idle', version: null, notes: '', percent: 0, error: null, current: app.getVersion() };
let hooks = { send: () => {}, isWindowVisible: () => false, showWindow: () => {}, refreshTray: () => {}, beforeQuit: () => {}, text: (k) => k };
let notifiedVersion = null;
let lastCheck = 0;

function plainNotes(n) {
  if (!n) return '';
  const text = Array.isArray(n) ? n.map((x) => x.note || '').join('\n') : String(n);
  return text.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
}

function set(patch) {
  Object.assign(state, patch);
  hooks.send(getState());
  hooks.refreshTray();
}

const getState = () => ({ ...state });

function notifyDesktop() {
  if (notifiedVersion === state.version || hooks.isWindowVisible() || !Notification.isSupported()) return;
  notifiedVersion = state.version;
  const n = new Notification({
    title: hooks.text('notifyTitle', { v: state.version }),
    body: hooks.text('notifyBody'),
  });
  n.on('click', () => hooks.showWindow());
  n.show();
}

async function check(manual = false) {
  if (!app.isPackaged) {
    // Khusus pengembangan: TM_FAKE_UPDATE=1.9.0 [TM_FAKE_STATUS=downloading|ready|installing] untuk melihat popup.
    if (process.env.TM_FAKE_UPDATE) {
      set({
        status: process.env.TM_FAKE_STATUS || 'available', version: process.env.TM_FAKE_UPDATE, percent: 62, error: null,
        notes: 'Notifikasi update langsung di aplikasi.\nKartu ringkasan dengan animasi hitung naik.',
      });
    } else {
      set({ status: 'dev', error: null });
    }
    return getState();
  }
  if (['downloading', 'ready', 'installing'].includes(state.status)) return getState();
  lastCheck = Date.now();
  // pengecekan otomatis tidak mengubah status, supaya popup yang sedang tampil tidak berkedip
  if (manual) set({ status: 'checking', error: null });
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ status: manual ? 'error' : 'idle', error: e.message });
  }
  return getState();
}

async function download() {
  if (state.status !== 'available' && state.status !== 'error') return getState();
  set({ status: 'downloading', percent: 0, error: null });
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    set({ status: 'error', error: e.message });
  }
  return getState();
}

function install() {
  if (state.status !== 'ready') return;
  set({ status: 'installing' }); // pesan "Memasang..." sempat terbaca sebelum jendela tertutup
  hooks.beforeQuit();
  // isSilent=false: jendela installer menampilkan progres pemasangan; isForceRunAfter=true: buka lagi setelah terpasang
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 1500);
}

function init(h) {
  hooks = { ...hooks, ...h };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true; // kalau sudah terunduh tapi belum dipasang, pasang saat keluar
  autoUpdater.logger = null;

  autoUpdater.on('update-available', (info) => {
    set({ status: 'available', version: info.version, notes: plainNotes(info.releaseNotes), error: null });
    notifyDesktop();
  });
  autoUpdater.on('update-not-available', () => set({ status: 'latest', version: null }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', (e) => {
    if (state.status === 'downloading') set({ status: 'error', error: e.message });
  });

  setTimeout(() => check(false), FIRST_CHECK_MS);
  setInterval(() => check(false), CHECK_EVERY_MS);
}

// Dipanggil saat jendela tampil atau mendapat fokus.
function checkSoon() {
  if (Date.now() - lastCheck >= MIN_GAP_MS) check(false);
}

module.exports = { init, check, checkSoon, download, install, getState };
