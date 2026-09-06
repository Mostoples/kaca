/* ==========================================================
   KACA — script halaman web (landing)
   ========================================================== */
(function () {
  'use strict';
  var K = window.KACA;

  /* ---------- menu mobile ---------- */
  var tg = document.getElementById('navToggle'), nav = document.getElementById('nav');
  if (tg && nav) tg.addEventListener('click', function () { nav.classList.toggle('open'); });
  K.qsa('#nav a').forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); });
  });

  /* ---------- kartu fitur ---------- */
  var FEATURES = [
    ['inbox', 'Worklist terpusat', 'Antrian baca dengan filter modalitas, status, dan tanggal. Penanda cito naik ke atas otomatis.'],
    ['layers', 'Viewer multi-seri', 'Bandingkan seri berdampingan pada tata letak 1×2 atau 2×2, dengan viewport aktif yang jelas.'],
    ['ruler', 'Pengukuran presisi', 'Panjang, sudut, ROI elips dan persegi lengkap dengan rerata serta simpangan baku nilai piksel.'],
    ['brain', 'Preset window klinis', 'Preset paru, mediastinum, tulang, otak, dan abdomen siap pakai — atau atur W/L dengan seret tetikus.'],
    ['file', 'Inspektur tag DICOM', 'Telusuri seluruh elemen header, cari berdasarkan nomor tag atau nama atribut.'],
    ['lock', 'Aman secara bawaan', 'Berkas diurai di browser. Tidak ada unggahan, tidak ada salinan sementara di server.']
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

  var G = window.DEMO ? window.DEMO.generators : null;
  if (G) {
    mountPreview('heroCanvas', 'heroIm', {
      total: 24, start: 11, wc: -500, ww: 1500, speed: 240,
      make: function (i) { return G.ctThorax(320, 320, i, 24, 4242); }
    });
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
