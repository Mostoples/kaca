/* ==========================================================
   MEDIVOX — sesi & penjaga halaman
   Dipakai oleh worklist.html dan viewer.html. Bergantung pada
   window.KFB (assets/js/firebase-init.js) dan window.MEDIVOX.
   ========================================================== */
(function (global) {
  'use strict';
  var K = global.MEDIVOX;

  var TAMU = 'sesi.tamu';

  function modeTamu() { return K.store.get(TAMU, false) === true; }
  function setTamu(on) { K.store.set(TAMU, !!on); }

  /* Menunggu Firebase siap; menyerah setelah beberapa detik agar
     halaman tetap bisa dipakai walau CDN terblokir. */
  function siap(timeoutMs) {
    if (!global.KFB) {
      return new Promise(function (res) {
        var sudah = false;
        function selesai(v) { if (!sudah) { sudah = true; res(v); } }
        global.addEventListener('kfb-ready', function (e) { selesai(e.detail); });
        setTimeout(function () { selesai(null); }, timeoutMs || 6000);
      });
    }
    return Promise.race([
      global.KFB.ready,
      new Promise(function (res) { setTimeout(function () { res(global.KFB); }, timeoutMs || 6000); })
    ]);
  }

  /* Identitas pembaca yang sedang aktif */
  function pembaca(fb) {
    var u = fb && fb.user;
    if (u) {
      return {
        nama: u.displayName || (u.email ? u.email.split('@')[0] : 'Pengguna'),
        email: u.email || '',
        peran: 'Radiolog',
        uid: u.uid,
        tamu: false
      };
    }
    return { nama: 'Mode Tamu', email: '', peran: 'Tanpa akun', uid: null, tamu: true };
  }

  function inisial(nama) {
    var p = String(nama || '?').replace(/^dr\.?\s*/i, '').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  /* Penjaga: kembalikan Promise berisi {fb, pembaca}.
     Bila belum masuk dan bukan mode tamu → dialihkan ke halaman masuk.

     Mode tamu tidak menunggu Firebase sama sekali, supaya halaman
     tetap tampil seketika walaupun CDN lambat atau diblokir. */
  function jaga() {
    if (modeTamu()) {
      var langsung = { fb: global.KFB || null, pembaca: pembaca(null) };
      /* bila ternyata ada sesi akun, perbarui identitas begitu diketahui */
      siap(4000).then(function (fb) {
        if (fb && fb.user) {
          langsung.fb = fb;
          global.dispatchEvent(new CustomEvent('kaca-pembaca', { detail: pembaca(fb) }));
        }
      });
      return Promise.resolve(langsung);
    }
    return siap(4000).then(function (fb) {
      if (!fb || !fb.user) {
        var next = location.pathname.split('/').pop() + location.search;
        location.replace('masuk.html?next=' + encodeURIComponent(next));
        return new Promise(function () {});   /* hentikan rantai selama pengalihan */
      }
      return { fb: fb, pembaca: pembaca(fb) };
    });
  }

  /* Isi elemen .user-chip dengan identitas + menu keluar */
  function pasangChip(el, info) {
    if (!el) return;
    el.innerHTML =
      '<span class="avatar" aria-hidden="true">' + esc(inisial(info.nama)) + '</span>' +
      '<span class="who"><span class="nm">' + esc(info.nama) + '</span>' +
      '<span class="rl">' + esc(info.peran) + '</span></span>' +
      '<svg class="cev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-haspopup', 'menu');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-label', 'Menu pengguna: ' + info.nama);

    var menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.innerHTML =
      '<div class="um-head">' + esc(info.email || 'Tidak masuk dengan akun') + '</div>' +
      (info.tamu
        ? '<button role="menuitem" data-act="masuk">Masuk dengan akun</button>'
        : '<button role="menuitem" data-act="keluar">Keluar</button>') +
      '<button role="menuitem" data-act="bantuan">Pintasan papan ketik</button>';
    el.parentNode.insertBefore(menu, el.nextSibling);

    function toggle(on) {
      var buka = on === undefined ? menu.hidden : on;
      menu.hidden = !buka;
      el.setAttribute('aria-expanded', buka ? 'true' : 'false');
    }
    el.addEventListener('click', function () { toggle(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') toggle(false);
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !el.contains(e.target)) toggle(false);
    });

    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      toggle(false);
      if (b.dataset.act === 'keluar') keluar();
      if (b.dataset.act === 'masuk') { setTamu(false); location.href = 'masuk.html'; }
      if (b.dataset.act === 'bantuan') {
        if (global.MEDIVOX_BANTUAN) global.MEDIVOX_BANTUAN();
        else K.toast('Pintasan lengkap ada di README.');
      }
    });
  }

  function keluar() {
    setTamu(false);
    var p = (global.KFB && global.KFB.user) ? global.KFB.keluar() : Promise.resolve();
    p.catch(function () {}).then(function () { location.href = 'masuk.html'; });
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.KAUTH = {
    siap: siap, jaga: jaga, pembaca: pembaca, pasangChip: pasangChip,
    keluar: keluar, modeTamu: modeTamu, setTamu: setTamu, inisial: inisial
  };
})(window);
