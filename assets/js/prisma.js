/* ==========================================================
   KACA — proyeksi prisma hologram
   ----------------------------------------------------------
   Menyiapkan tampilan untuk piramida/prisma akrilik yang
   diletakkan di atas layar (efek Pepper's ghost): empat
   pandangan volume disusun mengelilingi satu titik pusat,
   masing-masing dengan sisi atas menghadap ke tengah, sehingga
   pantulan pada keempat bidang prisma bertemu sebagai satu citra
   yang tampak mengambang.

   Sudut pandang di-*prarender* sekali (ray-cast di CPU cukup
   berat), lalu animasi hanya memutar-ulang bingkai yang sudah
   ada — dengan begitu putarannya mulus di 60 fps.

   Karena keempat sisi selalu berjarak 90°, satu set N bingkai
   yang tersebar rata pada 360° cukup untuk semuanya: tiap sisi
   hanya membaca indeks yang bergeser N/4.
   ========================================================== */
(function () {
  'use strict';
  var K = window.KACA;

  var App = {
    vol: null,
    mesh: null,
    meshAmbang: null,
    seri: null,
    judul: '',
    imgs: [],          /* objek img hasil ray-cast per sudut */
    kanvas: [],        /* hasil window/level yang siap digambar */
    fase: 0,
    jalan: true,
    rafId: null,
    perluRender: false,
    opsi: {
      mode: 'maks',
      jumlah: 24,
      ukuran: 256,
      mutu: 1,
      elevasi: 0,
      colormap: '',
      invert: false,
      gamma: 1.6,
      kepadatan: 1,
      ww: null,
      wc: null,
      ambang: 300,
      /* tata letak prisma */
      skala: 0.36,
      jarak: 0.30,
      cermin: false,
      arah: 1,
      kecepatan: 6,
      pusat: true
    }
  };

  var kanvasUtama = document.getElementById('prismaCanvas');
  var ctx = kanvasUtama.getContext('2d');

  function el(id) { return document.getElementById(id); }
  function pesan(teks, sub) {
    el('statusTeks').textContent = teks;
    el('statusSub').textContent = sub || '';
    el('status').classList.remove('hide');
  }
  function tutupPesan() { el('status').classList.add('hide'); }

  /* ==========================================================
     Mengambil satu seri: demo atau berkas lokal
     ========================================================== */
  function ambilSeri() {
    var p = new URLSearchParams(location.search);
    var idxSeri = parseInt(p.get('seri') || '0', 10) || 0;

    if (p.get('local')) return seriLokal(p.get('local'), idxSeri);
    return Promise.resolve(seriDemo(p.get('demo'), idxSeri));
  }

  function seriDemo(id, idx) {
    var st = window.DEMO.studies.filter(function (s) { return s.id === id; })[0] || window.DEMO.studies[0];
    /* pilih seri dengan irisan terbanyak bila indeks tidak menunjuk tumpukan */
    var urut = st.series.map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) { return b.s.n - a.s.n; });
    var pilih = st.series[idx] && st.series[idx].n >= 4 ? idx : urut[0].i;
    var s = st.series[pilih];
    var cache = null;

    return {
      judul: K.fmtName(st.patient.name) + ' · ' + st.desc,
      sub: st.modality + ' · ' + s.desc + ' · ' + s.n + ' irisan',
      seri: {
        desc: s.desc, number: s.num, modality: st.modality, count: s.n,
        getImage: function (i) {
          if (!cache) cache = window.DEMO.buildSeriesImages(st, pilih);
          return Promise.resolve(cache[Math.max(0, Math.min(s.n - 1, i))]);
        }
      }
    };
  }

  function seriLokal(uid, idx) {
    if (!window.KDB) return Promise.reject(new Error('Penyimpanan lokal tidak tersedia.'));
    return window.KDB.byStudy(uid).then(function (recs) {
      if (!recs.length) throw new Error('Berkas lokal untuk studi ini tidak ada lagi di cache.');

      var perSeri = {};
      recs.forEach(function (r) { (perSeri[r.seriesUID || 'S1'] = perSeri[r.seriesUID || 'S1'] || []).push(r); });
      var kunci = Object.keys(perSeri).sort(function (a, b) { return perSeri[b].length - perSeri[a].length; });
      var pilih = perSeri[kunci[Math.min(idx, kunci.length - 1)]];
      if (pilih.length < 4) pilih = perSeri[kunci[0]];

      pilih.sort(function (a, b) { return (a.instance || 0) - (b.instance || 0); });
      var first = pilih[0];

      return {
        judul: (first.patient || '—') + ' · ' + (first.studyDesc || 'Studi lokal'),
        sub: (first.modality || '??') + ' · ' + (first.seriesDesc || 'Seri') + ' · ' + pilih.length + ' irisan',
        seri: {
          desc: first.seriesDesc || 'Seri lokal', number: first.seriesNumber || 1,
          modality: first.modality, count: pilih.length,
          getImage: function (i) {
            var r = pilih[Math.max(0, Math.min(pilih.length - 1, i))];
            return new Promise(function (res, rej) {
              try {
                if (!r._ds) r._ds = window.DICOM.parse(r.buf);
                res(window.DICOM.readPixels(r._ds, 0));
              } catch (e) { rej(e); }
            });
          }
        }
      };
    });
  }

  /* ==========================================================
     Prarender sudut
     ========================================================== */
  function prarender() {
    var o = App.opsi;
    /* slider mengembalikan angka pecahan; jumlah sudut harus bulat
       dan habis dibagi empat karena keempat sisi berjarak tepat 90° */
    var n = Math.max(4, Math.round(o.jumlah / 4) * 4);
    o.jumlah = n;
    App.imgs = new Array(n);
    App.kanvas = [];
    App.perluRender = false;
    el('btnRender').classList.remove('perlu');

    var i = 0;
    var mulai = performance.now();
    var permukaan = o.mode === 'permukaan';

    /* Mode permukaan perlu isosurface dulu. Jaringnya disimpan dan
       hanya dibangun ulang kalau ambangnya berubah — ekstraksi jauh
       lebih mahal daripada merender satu sudut. */
    if (permukaan) {
      if (!window.MESH) { pesan('Modul permukaan tidak termuat'); return Promise.resolve(); }
      if (!App.mesh || App.meshAmbang !== o.ambang) {
        pesan('Menelusuri isosurface…', 'ambang ' + Math.round(o.ambang));
        el('bar').style.width = '0%';
        App.mesh = App.vol ? window.MESH.dari(App.vol, { ambang: o.ambang }) : null;
        App.meshAmbang = o.ambang;
        var mi = el('meshInfo');
        if (mi) {
          mi.textContent = App.mesh && !App.mesh.kosong()
            ? App.mesh.info()
            : 'Tidak ada permukaan pada ambang ' + Math.round(o.ambang) + '.';
        }
      }
      if (!App.mesh || App.mesh.kosong()) {
        pesan('Tidak ada permukaan pada ambang itu',
          'Geser ambang lalu tekan "Render ulang".');
        return Promise.resolve();
      }
    }

    pesan('Merender ' + n + ' sudut…', '0 / ' + n);

    return new Promise(function (selesai) {
      function langkah() {
        var t0 = performance.now();
        /* render beberapa sudut per giliran, tetapi selalu lepaskan
           kendali sebelum 100 ms agar bilah kemajuan tetap bergerak */
        do {
          App.imgs[i] = permukaan
            ? App.mesh.render({
                azimut: i / n * Math.PI * 2,
                elevasi: o.elevasi * Math.PI / 180,
                ukuran: o.ukuran
              })
            : App.vol.proyeksi({
                azimut: i / n * Math.PI * 2,
                elevasi: o.elevasi * Math.PI / 180,
                mode: o.mode, ukuran: o.ukuran, mutu: o.mutu,
                windowCenter: o.wc, windowWidth: o.ww,
                colormap: o.colormap || null,
                gamma: o.gamma, kepadatan: o.kepadatan
              });
          i++;
        } while (i < n && performance.now() - t0 < 90);

        el('statusSub').textContent = i + ' / ' + n;
        el('bar').style.width = (i / n * 100) + '%';

        if (i < n) { setTimeout(langkah, 0); return; }

        siapkanKanvas();
        tutupPesan();
        el('renderInfo').textContent =
          n + ' sudut · ' + o.ukuran + '² px · ' +
          Math.round(performance.now() - mulai) + ' ms';
        selesai();
      }
      setTimeout(langkah, 0);
    });
  }

  /* img → canvas siap pakai (window/level & peta warna diterapkan di sini
     untuk mode skalar, sehingga penyetelan W/L tidak perlu ray-cast ulang) */
  function siapkanKanvas() {
    var o = App.opsi;
    App.kanvas = App.imgs.map(function (img) {
      var c = document.createElement('canvas');
      c.width = img.cols; c.height = img.rows;
      var cc = c.getContext('2d');
      var idata = window.DICOM.toImageData(img, {
        windowCenter: o.wc !== null ? o.wc : img.windowCenter,
        windowWidth: o.ww !== null ? o.ww : img.windowWidth,
        invert: o.invert,
        colormap: img.samplesPerPixel === 3 ? null : (o.colormap || null)
      });
      cc.putImageData(idata, 0, 0);
      return c;
    });
    gambar();
  }

  /* ==========================================================
     Menggambar tata letak prisma
     ========================================================== */
  function ukurKanvas() {
    var kotak = kanvasUtama.parentNode.getBoundingClientRect();
    var sisi = Math.max(160, Math.floor(Math.min(kotak.width, kotak.height)));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    kanvasUtama.style.width = sisi + 'px';
    kanvasUtama.style.height = sisi + 'px';
    kanvasUtama.width = Math.round(sisi * dpr);
    kanvasUtama.height = Math.round(sisi * dpr);
  }

  /* Empat sisi, masing-masing dengan tepi atas menghadap pusat.
     Sudut putar kanvas positif berarti searah jarum jam. */
  var SISI = [
    { nama: 'S', dx: 0,  dy: 1,  rot: 0 },
    { nama: 'W', dx: -1, dy: 0,  rot: Math.PI / 2 },
    { nama: 'N', dx: 0,  dy: -1, rot: Math.PI },
    { nama: 'E', dx: 1,  dy: 0,  rot: -Math.PI / 2 }
  ];

  function gambar() {
    var S = kanvasUtama.width, o = App.opsi;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, kanvasUtama.height);
    if (!App.kanvas.length) return;

    var n = App.kanvas.length;
    var cx = S / 2, cy = kanvasUtama.height / 2;
    var sisiPx = S * o.skala;
    var jarakPx = S * o.jarak;

    /* penanda pusat: membantu meletakkan puncak prisma */
    if (o.pusat) {
      ctx.strokeStyle = 'rgba(47,212,189,.28)';
      ctx.lineWidth = Math.max(1, S / 900);
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.02, cy); ctx.lineTo(cx + S * 0.02, cy);
      ctx.moveTo(cx, cy - S * 0.02); ctx.lineTo(cx, cy + S * 0.02);
      ctx.stroke();
    }

    SISI.forEach(function (s, k) {
      /* tiap sisi tertinggal 90° dari sisi sebelumnya */
      var idx = Math.round(App.fase + App.opsi.arah * k * n / 4);
      idx = ((idx % n) + n) % n;
      var src = App.kanvas[idx];
      if (!src) return;

      ctx.save();
      ctx.translate(cx + s.dx * jarakPx, cy + s.dy * jarakPx);
      ctx.rotate(s.rot);
      if (o.cermin) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      /* tepi atas citra menghadap pusat: setelah rotasi, gambar
         diletakkan pada -y sehingga sisi atasnya mengarah ke dalam */
      ctx.drawImage(src, -sisiPx / 2, -sisiPx, sisiPx, sisiPx);
      ctx.restore();
    });
  }

  /* ==========================================================
     Animasi
     ========================================================== */
  var terakhir = 0;
  function loop(ts) {
    App.rafId = requestAnimationFrame(loop);
    if (!terakhir) terakhir = ts;
    var dt = Math.min(0.1, (ts - terakhir) / 1000);
    terakhir = ts;
    if (!App.jalan || !App.kanvas.length) return;
    var n = App.kanvas.length;
    App.fase = (App.fase + App.opsi.kecepatan * dt * n / 60 + n) % n;
    gambar();
  }

  /* ==========================================================
     Kontrol
     ========================================================== */
  function tandaiPerluRender() {
    App.perluRender = true;
    el('btnRender').classList.add('perlu');
  }

  /* penyetelan yang cukup diterapkan ke kanvas hasil */
  function segarkanTampilan() {
    if (!App.imgs.length) return;
    siapkanKanvas();
  }

  function pasangSlider(id, kunci, format, aksi) {
    var s = el(id), out = el(id + 'Val');
    function terap() {
      App.opsi[kunci] = parseFloat(s.value);
      if (out) out.textContent = format ? format(App.opsi[kunci]) : s.value;
      if (aksi) aksi();
    }
    s.addEventListener('input', terap);
    terap();
  }

  function pasangKontrol() {
    /* mode proyeksi */
    K.qsa('#modeGrid button').forEach(function (b) {
      b.addEventListener('click', function () {
        K.qsa('#modeGrid button').forEach(function (x) {
          x.classList.remove('on'); x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
        App.opsi.mode = b.dataset.mode;
        el('barisKomposit').classList.toggle('hide', b.dataset.mode !== 'komposit');
        el('barisPermukaan').classList.toggle('hide', b.dataset.mode !== 'permukaan');
        tandaiPerluRender();
      });
    });

    pasangSlider('rAmbang', 'ambang', Math.round, tandaiPerluRender);

    /* peta warna */
    K.qsa('#cmapGrid button').forEach(function (b) {
      b.addEventListener('click', function () {
        K.qsa('#cmapGrid button').forEach(function (x) {
          x.classList.remove('on'); x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
        App.opsi.colormap = b.dataset.cmap || '';
        /* mode komposit memakai peta warna saat ray-cast, jadi harus dirender ulang */
        if (App.opsi.mode === 'komposit') tandaiPerluRender();
        else segarkanTampilan();
      });
    });

    pasangSlider('rWW', 'ww', Math.round, function () {
      if (App.opsi.mode === 'komposit') tandaiPerluRender(); else segarkanTampilan();
    });
    pasangSlider('rWL', 'wc', Math.round, function () {
      if (App.opsi.mode === 'komposit') tandaiPerluRender(); else segarkanTampilan();
    });
    pasangSlider('rElev', 'elevasi', function (v) { return v + '°'; }, tandaiPerluRender);
    pasangSlider('rSudut', 'jumlah', function (v) { return v + ' sudut'; }, tandaiPerluRender);
    pasangSlider('rUkuran', 'ukuran', function (v) { return v + ' px'; }, tandaiPerluRender);
    pasangSlider('rMutu', 'mutu', function (v) { return v.toFixed(2) + '×'; }, tandaiPerluRender);
    pasangSlider('rKepadatan', 'kepadatan', function (v) { return v.toFixed(2); }, tandaiPerluRender);
    pasangSlider('rGamma', 'gamma', function (v) { return v.toFixed(2); }, tandaiPerluRender);

    pasangSlider('rSkala', 'skala', function (v) { return Math.round(v * 100) + '%'; }, gambar);
    pasangSlider('rJarak', 'jarak', function (v) { return Math.round(v * 100) + '%'; }, gambar);
    pasangSlider('rKecepatan', 'kecepatan', function (v) { return v.toFixed(1) + ' rpm'; });

    el('swCermin').addEventListener('change', function (e) {
      App.opsi.cermin = e.target.checked; gambar();
    });
    el('swInvert').addEventListener('change', function (e) {
      App.opsi.invert = e.target.checked; segarkanTampilan();
    });
    el('swPusat').addEventListener('change', function (e) {
      App.opsi.pusat = e.target.checked; gambar();
    });
    el('swArah').addEventListener('change', function (e) {
      App.opsi.arah = e.target.checked ? -1 : 1; gambar();
    });

    el('btnPutar').addEventListener('click', function () {
      App.jalan = !App.jalan;
      this.textContent = App.jalan ? 'Jeda' : 'Putar';
      this.setAttribute('aria-pressed', App.jalan ? 'true' : 'false');
    });
    el('btnRender').addEventListener('click', function () {
      if (!App.vol) return;
      prarender();
    });
    el('btnPenuh').addEventListener('click', function () {
      var target = document.getElementById('panggung');
      if (document.fullscreenElement) document.exitFullscreen();
      else target.requestFullscreen().catch(function () {});
    });
    el('btnPanel').addEventListener('click', function () {
      var b = document.body.classList.toggle('tanpa-panel');
      this.setAttribute('aria-pressed', b ? 'true' : 'false');
      requestAnimationFrame(function () { ukurKanvas(); gambar(); });
    });

    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); el('btnPutar').click(); }
      if (e.key.toLowerCase() === 'f') el('btnPenuh').click();
      if (e.key.toLowerCase() === 'p') el('btnPanel').click();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        App.jalan = false;
        el('btnPutar').textContent = 'Putar';
        var n = App.kanvas.length || 1;
        App.fase = (App.fase + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
        gambar();
      }
    });

    window.addEventListener('resize', function () { ukurKanvas(); gambar(); });
    document.addEventListener('fullscreenchange', function () {
      requestAnimationFrame(function () { ukurKanvas(); gambar(); });
    });

    /* seret di panggung untuk memutar manual */
    var seret = null;
    kanvasUtama.addEventListener('pointerdown', function (e) {
      seret = { x: e.clientX, fase: App.fase };
      App.jalan = false;
      el('btnPutar').textContent = 'Putar';
      try { kanvasUtama.setPointerCapture(e.pointerId); } catch (err) {}
    });
    kanvasUtama.addEventListener('pointermove', function (e) {
      if (!seret || !App.kanvas.length) return;
      var n = App.kanvas.length;
      App.fase = (seret.fase + (e.clientX - seret.x) / 6 + n * 4) % n;
      gambar();
    });
    kanvasUtama.addEventListener('pointerup', function () { seret = null; });
    kanvasUtama.addEventListener('pointercancel', function () { seret = null; });
  }

  /* ==========================================================
     Boot
     ========================================================== */
  ukurKanvas();
  pasangKontrol();
  App.rafId = requestAnimationFrame(loop);

  pesan('Memeriksa sesi…');
  window.KAUTH.jaga().then(function (ses) {
    window.KAUTH.pasangChip(el('userChip'), ses.pembaca);
    pesan('Memuat seri…');
    return ambilSeri();
  }).then(function (hasil) {
    App.seri = hasil.seri;
    el('hJudul').textContent = hasil.judul;
    el('hSub').textContent = hasil.sub;
    document.title = hasil.judul + ' — Prisma Kaca';

    pesan('Menyusun volume…', 'membaca irisan');
    return window.VOLUME.bangun(hasil.seri, {
      lapor: function (n, total) {
        el('statusSub').textContent = n + ' / ' + total + ' irisan';
        el('bar').style.width = (n / total * 100) + '%';
      }
    });
  }).then(function (vol) {
    App.vol = vol;
    el('volInfo').textContent = vol.info();

    /* rentang W/L mengikuti nilai voxel yang sebenarnya ada */
    var rentang = Math.max(1, vol.max - vol.min);
    var sWW = el('rWW'), sWL = el('rWL');
    sWW.min = 1; sWW.max = Math.round(rentang * 2);
    sWL.min = Math.round(vol.min - rentang * 0.5);
    sWL.max = Math.round(vol.max + rentang * 0.5);
    App.opsi.ww = Math.round(vol.windowWidth);
    App.opsi.wc = Math.round(vol.windowCenter);
    sWW.value = App.opsi.ww; sWL.value = App.opsi.wc;
    el('rWWVal').textContent = App.opsi.ww;
    el('rWLVal').textContent = App.opsi.wc;

    /* ambang isosurface: rentangnya mengikuti nilai voxel yang ada */
    var sAmb = el('rAmbang');
    sAmb.min = Math.round(vol.min + 1);
    sAmb.max = Math.round(vol.max - 1);
    App.opsi.ambang = window.MESH ? window.MESH.ambangSaran(vol)
      : Math.round((vol.min + vol.max) / 2);
    sAmb.value = App.opsi.ambang;
    el('rAmbangVal').textContent = App.opsi.ambang;

    return prarender();
  }).catch(function (err) {
    var m = (err && err.message) ? err.message : String(err);
    pesan('Tidak bisa menyiapkan hologram', m);
    el('bar').style.width = '0%';
    el('statusAksi').classList.remove('hide');
    console.warn('Prisma:', err);
  });
})();
