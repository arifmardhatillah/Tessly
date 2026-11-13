'use strict';
// Dropdown pengganti <select>. Daftar bawaan Windows tidak bisa diberi gaya maupun animasi,
// jadi <select> asli disembunyikan dan tetap menyimpan nilai serta memicu event 'change'.

const CHEVRON = '<svg class="dd-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
const CHECK = '<svg class="dd-check" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4 5.8 10 11 4.2"/></svg>';
const dropdowns = [];
let ddSeq = 0;

function makeDropdown(sel) {
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  // label aksesibilitas pindah ke tombol, termasuk penanda terjemahannya
  for (const a of ['aria-label', 'aria-labelledby', 'data-i18n-aria']) {
    if (sel.hasAttribute(a)) { btn.setAttribute(a, sel.getAttribute(a)); sel.removeAttribute(a); }
  }
  btn.innerHTML = `<span class="dd-val"></span>${CHEVRON}`;
  const list = document.createElement('ul');
  list.className = 'dd-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.id = `dd${++ddSeq}`;
  btn.setAttribute('aria-controls', list.id);
  sel.before(wrap);
  wrap.append(btn, list, sel);
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  let active = -1;
  const items = () => [...list.children];

  function sync() {
    // semua pilihan ditumpuk di tombol (yang tidak terpilih tak terlihat) supaya lebar tombol tidak melompat
    const val = btn.firstElementChild;
    val.replaceChildren(...[...sel.options].map((o) => {
      const s = document.createElement('span');
      s.textContent = o.textContent;
      if (o.selected) s.className = 'on';
      return s;
    }));
    list.replaceChildren(...[...sel.options].map((o, i) => {
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(o.selected));
      li.style.setProperty('--i', i);
      li.innerHTML = CHECK;
      li.prepend(o.textContent);
      return li;
    }));
  }

  function setActive(i) {
    const all = items();
    if (!all.length) return;
    active = (i + all.length) % all.length;
    all.forEach((li, k) => li.classList.toggle('act', k === active));
    list.setAttribute('aria-activedescendant', all[active].id);
    all[active].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (wrap.classList.contains('open')) return;
    dropdowns.forEach((d) => d !== api && d.close(false));
    sync();
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    setActive(Math.max(0, sel.selectedIndex));
    list.focus({ preventScroll: true });
  }

  function close(refocus = true) {
    if (!wrap.classList.contains('open')) return;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    if (refocus) btn.focus({ preventScroll: true });
  }

  function choose(i) {
    const changed = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    sync();
    close();
    if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  btn.addEventListener('click', () => (wrap.classList.contains('open') ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('li');
    if (li) setActive(items().indexOf(li));
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) choose(items().indexOf(li));
  });
  list.addEventListener('keydown', (e) => {
    const n = items().length;
    const keys = {
      ArrowDown: () => setActive(active + 1),
      ArrowUp: () => setActive(active - 1),
      Home: () => setActive(0),
      End: () => setActive(n - 1),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => close(), // preventDefault di bawah: Esc menutup daftar saja, bukan dialog Pengaturan
    };
    if (keys[e.key]) { e.preventDefault(); e.stopPropagation(); keys[e.key](); return; }
    if (e.key === 'Tab') { close(false); return; }
    // ketik huruf awal untuk lompat ke pilihan
    if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const all = items();
      for (let s = 1; s <= n; s++) {
        const j = (active + s) % n;
        if (all[j].textContent.trim().toLowerCase().startsWith(k)) { setActive(j); break; }
      }
    }
  });
  list.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) close(false); });

  const api = { wrap, sync, close };
  sync();
  return api;
}

document.querySelectorAll('select').forEach((s) => dropdowns.push(makeDropdown(s)));
document.addEventListener('pointerdown', (e) => {
  dropdowns.forEach((d) => { if (!d.wrap.contains(e.target)) d.close(false); });
});
window.addEventListener('blur', () => dropdowns.forEach((d) => d.close(false)));

// Dipanggil setelah nilai <select> diubah lewat kode atau teksnya diterjemahkan.
function syncDropdowns() { dropdowns.forEach((d) => d.sync()); }
