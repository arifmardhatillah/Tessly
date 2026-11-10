// Panggilan RPC ke Supabase lewat REST (tanpa library tambahan).
async function rpc(cfg, fn, body) {
  const base = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('URL Supabase tidak valid');
  const headers = { 'Content-Type': 'application/json', apikey: cfg.supabaseKey };
  // Kunci anon lama berbentuk JWT; kunci publishable baru (sb_publishable_...) cukup di header apikey.
  if (String(cfg.supabaseKey).startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseKey}`;

  let res;
  try {
    res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'Supabase tidak merespons (timeout)' : 'Tidak bisa terhubung ke Supabase');
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.message || j.hint || text;
    } catch {}
    if (res.status === 404) msg = 'Fungsi belum ada. Jalankan supabase/schema.sql di SQL Editor.';
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

module.exports = { rpc };
