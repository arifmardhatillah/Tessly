// Uji pembaca log tanpa Electron: `npm run test:scan`
const { Scanner } = require('./scanner');

(async () => {
  const s = new Scanner();
  const t0 = Date.now();
  await s.scan();
  const rows = s.aggregate();
  const sum = (f) => rows.reduce((a, r) => a + r[f], 0);
  console.log(`Folder : ${s.roots.join(', ')}`);
  console.log(`File   : ${s.files.size}, balasan unik: ${s.msgs.size}, waktu: ${Date.now() - t0} ms`);
  console.table(rows.slice(-10));
  console.log({ input: sum('i'), output: sum('o'), cache_tulis: sum('cw'), cache_baca: sum('cr'), pesan: sum('n') });
  const again = await s.scan();
  console.log(`Scan ulang tanpa perubahan -> changed=${again}`);
})();
