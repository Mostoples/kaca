/* ==========================================================
   MEDIVOX — script halaman web (landing)
   ========================================================== */
(function () {
  'use strict';
  var K = window.MEDIVOX;

  /* ---------- menu mobile ---------- */
  var tg = document.getElementById('navToggle'), nav = document.getElementById('nav');
  if (tg && nav) tg.addEventListener('click', function () { nav.classList.toggle('open'); });
  K.qsa('#nav a').forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); });
  });

  /* ---------- kartu fitur ---------- */
  var FEATURES = [
    ['layers', 'Panggung hologram prisma', 'Empat pandangan mengelilingi satu titik pusat, siap dipantulkan prisma kaca. Sudut diprarender lalu diputar mulus 60 fps.'],
    ['brain', 'Rekonstruksi permukaan 3D', 'Isosurface marching tetrahedra pada ambang pilihan Anda, dinaungi cahaya, bisa diunduh sebagai STL atau OBJ.'],
    ['zap', 'MIP & volume rendering', 'Intensitas maksimum untuk tulang dan pembuluh, atau ray-cast beropasitas dengan kepadatan dan gamma yang bisa disetel.'],
    ['ruler', 'MPR & pengukuran', 'Potongan koronal dan sagital dengan proporsi milimeter yang benar, lengkap dengan alat panjang, sudut, dan ROI.'],
    ['file', 'Parser DICOM sendiri', 'Ditulis dari nol: tiga transfer syntax utama, deflate, palette color, multi-frame, sampai Segmentation 1 bit.'],
    ['lock', 'Berkas tidak pernah diunggah', 'Volume dan hologram dihitung di CPU perangkat Anda. Yang tersimpan ke akun hanya teks laporan.']
  ];
  var grid = document.getElementById('featGrid');
  if (grid) {
    FEATURES.forEach(function (f) {
      grid.insertAdjacentHTML('beforeend',
        '<article class="feature">' +
          '<div class="ico">' + K.icon(f[0]) + '</div>' +
          '<h3>' + f[1] + '</h3><p>' + f[2] + '</p>' +
        '</article>');
    });
  }

  /* ==========================================================
     Animasi mock viewer di hero: render phantom yang menggulir
     ========================================================== */
  function mountPreview(canvasId, labelId, opts) {
    var cv = document.getElementById(canvasId);
    if (!cv || !window.DEMO || !window.DICOM) return;
    var ctx = cv.getContext('2d');
    var total = opts.total, cur = opts.start || 0, dir = 1;
    var cache = [];

    function frame(i) {
      if (!cache[i]) cache[i] = opts.make(i);
      return cache[i];
    }

    var off = document.createElement('canvas');
    var octx = off.getContext('2d');

    function draw() {
      var img = frame(cur);
      var idata = window.DICOM.toImageData(img, {
        windowCenter: opts.wc, windowWidth: opts.ww
      });
      off.width = img.cols; off.height = img.rows;
      octx.putImageData(idata, 0, 0);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      var s = Math.min(cv.width / img.cols, cv.height / img.rows) * 0.94;
      var w = img.cols * s, h = img.rows * s;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, (cv.width - w) / 2, (cv.height - h) / 2, w, h);

      var lab = document.getElementById(labelId);
      if (lab) lab.textContent = cur + 1;
    }

    draw();
    var timer = null;
    function tick() {
      cur += dir;
      if (cur >= total - 1) { cur = total - 1; dir = -1; }
      if (cur <= 0) { cur = 0; dir = 1; }
      draw();
    }
    /* jalan hanya saat terlihat, hemat CPU */
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting && !timer) timer = setInterval(tick, opts.speed || 260);
        else if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
      });
    }, { threshold: .15 });
    io.observe(cv);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      io.disconnect();
      if (timer) { clearInterval(timer); timer = null; }
    }
  }

  /* ==========================================================
     Pratinjau hologram prisma di hero
     ----------------------------------------------------------
     Inti sistem ini adalah hologram, jadi hero-nya menampilkan
     susunan empat sisi yang sebenarnya — bukan tangkapan layar.
     Volume disusun dari phantom demo, sudutnya diprarender satu per
     satu di dalam requestAnimationFrame supaya halaman tidak pernah
     membeku, lalu diputar-ulang seperti di panggung sungguhan.
     ========================================================== */
  var SISI = [
    { dx: 0, dy: 1, rot: 0 },
    { dx: -1, dy: 0, rot: Math.PI / 2 },
    { dx: 0, dy: -1, rot: Math.PI },
    { dx: 1, dy: 0, rot: -Math.PI / 2 }
  ];

  function mountHologram(canvasId, opsi) {
    var cv = document.getElementById(canvasId);
    if (!cv || !window.DEMO || !window.DICOM || !window.VOLUME) return;
    var ctx = cv.getContext('2d');

    var SUDUT = opsi.sudut || 16;         /* harus habis dibagi 4 */
    var PX = opsi.px || 132;
    var bingkai = [], vol = null, fase = 0, siap = false, mulaiRender = false;

    function latar() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    function tulisKemajuan(n) {
      latar();
      ctx.fillStyle = '#5ec9f2';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('menyusun hologram… ' + n + '/' + SUDUT, cv.width / 2, cv.height / 2);
      /* bilah kemajuan tipis */
      var w = cv.width * 0.34, x = (cv.width - w) / 2, y = cv.height / 2 + 16;
      ctx.fillStyle = 'rgba(47,212,189,.22)';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = '#5ec9f2';
      ctx.fillRect(x, y, w * (n / SUDUT), 2);
      ctx.textAlign = 'left';
    }

    function gambar() {
      latar();
      if (!siap) return;
      var S = cv.width, cx = S / 2, cy = cv.height / 2;
      var sisiPx = S * 0.30, jarakPx = S * 0.255;

      /* penanda pusat: tempat puncak prisma diletakkan */
      ctx.strokeStyle = 'rgba(47,212,189,.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.018, cy); ctx.lineTo(cx + S * 0.018, cy);
      ctx.moveTo(cx, cy - S * 0.018); ctx.lineTo(cx, cy + S * 0.018);
      ctx.stroke();

      var n = bingkai.length;
      SISI.forEach(function (s, k) {
        var idx = ((Math.round(fase + k * n / 4) % n) + n) % n;
        var src = bingkai[idx];
        if (!src) return;
        ctx.save();
        ctx.translate(cx + s.dx * jarakPx, cy + s.dy * jarakPx);
        ctx.rotate(s.rot);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(src, -sisiPx / 2, -sisiPx, sisiPx, sisiPx);
        ctx.restore();
      });
    }

    /* render satu sudut per bingkai animasi */
    function renderBertahap() {
      if (bingkai.length >= SUDUT) {
        siap = true;
        putar();
        return;
      }
      var i = bingkai.length;
      var img = vol.proyeksi({
        azimut: i / SUDUT * Math.PI * 2,
        elevasi: opsi.elevasi || 0,
        mode: 'maks', ukuran: PX, mutu: 0.6
      });
      var c = document.createElement('canvas');
      c.width = img.cols; c.height = img.rows;
      c.getContext('2d').putImageData(window.DICOM.toImageData(img, {
        windowCenter: opsi.wc, windowWidth: opsi.ww, colormap: opsi.colormap || null
      }), 0, 0);
      bingkai.push(c);
      tulisKemajuan(bingkai.length);
      requestAnimationFrame(renderBertahap);
    }

    var timer = null;
    function putar() {
      if (timer) return;
      timer = setInterval(function () {
        fase = (fase + 1) % bingkai.length;
        gambar();
      }, opsi.jeda || 110);
    }
    function henti() { if (timer) { clearInterval(timer); timer = null; } }

    function mulai() {
      if (mulaiRender) { if (siap) putar(); return; }
      mulaiRender = true;
      tulisKemajuan(0);
      var st = window.DEMO.studies.filter(function (s) { return s.id === opsi.studi; })[0]
        || window.DEMO.studies[0];
      var idx = 0;
      st.series.forEach(function (s, i) { if (s.n > st.series[idx].n) idx = i; });
      var s = st.series[idx];
      var cache = null;

      window.VOLUME.bangun({
        desc: s.desc, number: s.num, modality: st.modality, count: s.n,
        getImage: function (i) {
          if (!cache) cache = window.DEMO.buildSeriesImages(st, idx);
          return Promise.resolve(cache[Math.max(0, Math.min(s.n - 1, i))]);
        }
      }).then(function (v) {
        vol = v;
        requestAnimationFrame(renderBertahap);
      }).catch(function () {
        latar();
        ctx.fillStyle = '#7e8fa3';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Pratinjau tidak tersedia', cv.width / 2, cv.height / 2);
      });
    }

    latar();
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) mulai();
        else henti();
      });
    }, { threshold: .2 });
    io.observe(cv);
  }

  var G = window.DEMO ? window.DEMO.generators : null;

  /* hero: hologram sungguhan */
  mountHologram('heroCanvas', {
    studi: 'ST-2409-0146', sudut: 16, px: 132,
    wc: 300, ww: 900, elevasi: 0.18, jeda: 110
  });

  /* bagian viewer 2D di bawah tetap memakai pratinjau irisan */
  if (G) {
    mountPreview('heroCanvas2', 'heroIm2', {
      total: 22, start: 8, wc: 380, ww: 760, speed: 300,
      make: function (i) { return G.mrBrain(300, 300, i, 22, 991); }
    });
  }

  /* ---------- smooth scroll ---------- */
  K.qsa('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' });
    });
  });
})();
