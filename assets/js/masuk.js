/* ==========================================================
   MEDIVOX — script halaman masuk / daftar
   ========================================================== */
(function () {
  'use strict';
  var K = window.MEDIVOX;
  var mode = 'masuk';           /* 'masuk' | 'daftar' */
  var params = new URLSearchParams(location.search);
  /* Tujuan bawaan setelah masuk adalah panggung hologram — itulah inti
     sistem ini. Halaman lain tetap dihormati bila diminta lewat next=. */
  var BAWAAN = 'prisma.html';
  var next = params.get('next') || BAWAAN;
  /* hanya izinkan pengalihan ke halaman internal */
  if (!/^[a-z0-9_-]+\.html(\?.*)?$/i.test(next)) next = BAWAAN;

  var elAlert = document.getElementById('alert');
  var elKirim = document.getElementById('btnKirim');

  function alertPesan(teks, ok) {
    elAlert.textContent = teks;
    elAlert.classList.toggle('ok', !!ok);
    elAlert.classList.remove('hide');
  }
  function bersihkanAlert() { elAlert.classList.add('hide'); }

  function sibuk(on, teks) {
    elKirim.disabled = on;
    document.getElementById('btnGoogle').disabled = on;
    elKirim.textContent = on ? (teks || 'Memproses…') : (mode === 'masuk' ? 'Masuk' : 'Buat akun');
  }

  /* ---------- ganti mode masuk / daftar ---------- */
  function setMode(m) {
    mode = m;
    var daftar = m === 'daftar';
    document.getElementById('judulMasuk').textContent = daftar ? 'Buat akun baru' : 'Masuk ke ruang baca';
    document.getElementById('subJudul').textContent = daftar
      ? 'Akun dipakai untuk menyimpan status baca dan laporan Anda.'
      : 'Gunakan akun Anda untuk menyimpan status baca dan laporan lintas perangkat.';
    document.getElementById('rowNama').classList.toggle('hide', !daftar);
    document.getElementById('swapTeks').textContent = daftar ? 'Sudah punya akun?' : 'Belum punya akun?';
    document.getElementById('btnSwap').textContent = daftar ? 'Masuk di sini' : 'Daftar sekarang';
    document.getElementById('btnLupa').classList.toggle('hide', daftar);
    document.getElementById('inSandi').setAttribute('autocomplete', daftar ? 'new-password' : 'current-password');
    elKirim.textContent = daftar ? 'Buat akun' : 'Masuk';
    bersihkanAlert();
  }
  document.getElementById('btnSwap').addEventListener('click', function () {
    setMode(mode === 'masuk' ? 'daftar' : 'masuk');
    document.getElementById(mode === 'daftar' ? 'inNama' : 'inEmail').focus();
  });

  /* ---------- lihat kata sandi ---------- */
  document.getElementById('btnLihatSandi').addEventListener('click', function () {
    var f = document.getElementById('inSandi');
    var tampil = f.type === 'password';
    f.type = tampil ? 'text' : 'password';
    this.setAttribute('aria-label', tampil ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
  });

  /* ---------- kirim formulir ---------- */
  document.getElementById('formAuth').addEventListener('submit', function (e) {
    e.preventDefault();
    bersihkanAlert();
    var email = document.getElementById('inEmail').value.trim();
    var sandi = document.getElementById('inSandi').value;
    var nama = document.getElementById('inNama').value.trim();

    if (!email) return alertPesan('Email belum diisi.');
    if (sandi.length < 6) return alertPesan('Kata sandi minimal 6 karakter.');
    if (!window.KFB) return alertPesan('Firebase belum termuat. Periksa koneksi internet Anda.');

    sibuk(true);
    var p = mode === 'daftar'
      ? window.KFB.daftarEmail(email, sandi, nama)
      : window.KFB.masukEmail(email, sandi);

    p.then(function () {
      window.KAUTH.setTamu(false);
      location.href = next;
    }).catch(function (err) {
      sibuk(false);
      alertPesan(window.KFB.pesanGalat(err));
    });
  });

  /* ---------- Google ---------- */
  document.getElementById('btnGoogle').addEventListener('click', function () {
    bersihkanAlert();
    if (!window.KFB) return alertPesan('Firebase belum termuat. Periksa koneksi internet Anda.');
    sibuk(true, 'Membuka Google…');
    window.KFB.masukGoogle().then(function () {
      window.KAUTH.setTamu(false);
      location.href = next;
    }).catch(function (err) {
      sibuk(false);
      alertPesan(window.KFB.pesanGalat(err));
    });
  });

  /* ---------- lupa sandi ---------- */
  document.getElementById('btnLupa').addEventListener('click', function () {
    var email = document.getElementById('inEmail').value.trim();
    if (!email) { alertPesan('Isi alamat email dulu, lalu tekan "Lupa kata sandi?".'); return; }
    if (!window.KFB) return alertPesan('Firebase belum termuat.');
    window.KFB.resetSandi(email).then(function () {
      alertPesan('Tautan penyetelan ulang sudah dikirim ke ' + email + '.', true);
    }).catch(function (err) { alertPesan(window.KFB.pesanGalat(err)); });
  });

  /* ---------- mode tamu ---------- */
  document.getElementById('btnTamu').addEventListener('click', function () {
    window.KAUTH.setTamu(true);
    location.href = next;
  });

  /* ---------- kalau sudah masuk, langsung teruskan ---------- */
  window.KAUTH.siap(4000).then(function (fb) {
    if (fb && fb.user) location.replace(next);
  });

  /* ---------- pratinjau phantom di kolom kanan ---------- */
  (function preview() {
    var cv = document.getElementById('authCanvas');
    if (!cv || !window.DEMO || !window.DICOM) return;
    var ctx = cv.getContext('2d'), off = document.createElement('canvas');
    var octx = off.getContext('2d');
    var total = 24, cur = 6, dir = 1, cache = [];

    function gambar() {
      var img = cache[cur] || (cache[cur] = window.DEMO.generators.ctThorax(320, 320, cur, total, 4242));
      var idata = window.DICOM.toImageData(img, { windowCenter: -500, windowWidth: 1500 });
      off.width = img.cols; off.height = img.rows;
      octx.putImageData(idata, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
      var s = Math.min(cv.width / img.cols, cv.height / img.rows) * 0.95;
      ctx.drawImage(off, (cv.width - img.cols * s) / 2, (cv.height - img.rows * s) / 2,
        img.cols * s, img.rows * s);
    }
    gambar();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setInterval(function () {
      cur += dir;
      if (cur >= total - 1) dir = -1;
      if (cur <= 0) dir = 1;
      gambar();
    }, 260);
  })();

  setMode('masuk');
  document.getElementById('inEmail').focus();
})();
