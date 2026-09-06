/* ==========================================================
   KACA — mesin Viewer DICOM
   ========================================================== */
(function () {
  'use strict';
  var K = window.KACA;

  /* ==========================================================
     State global
     ========================================================== */
  var App = {
    study: null,
    layout: '1x1',
    viewports: [],
    active: 0,
    tool: 'wwwc',
    sync: false,
    smooth: true,
    showOverlay: true,
    cine: { playing: false, fps: 10, timer: null }
  };

  /* Preset CT memakai nilai HU absolut; modalitas lain memakai fraksi dari
     rentang nilai piksel citra, karena nilainya tidak berskala HU. */
  var PRESETS_CT = [
    { n: 'Otomatis',    wc: null, ww: null },
    { n: 'Paru',        wc: -600, ww: 1600 },
    { n: 'Mediastinum', wc: 50,   ww: 400 },
    { n: 'Abdomen',     wc: 60,   ww: 400 },
    { n: 'Hati',        wc: 90,   ww: 150 },
    { n: 'Tulang',      wc: 400,  ww: 1800 },
    { n: 'Otak',        wc: 40,   ww: 80 },
    { n: 'Angio',       wc: 300,  ww: 600 }
  ];
  var PRESETS_REL = [
    { n: 'Otomatis',       rel: null },
    { n: 'Lembut',         rel: 1.30, note: 'kontras rendah' },
    { n: 'Standar',        rel: 1.00, note: 'rentang penuh' },
    { n: 'Kontras sedang', rel: 0.65 },
    { n: 'Kontras tinggi', rel: 0.40 },
    { n: 'Terang',         rel: 0.85, shift: -0.18 },
    { n: 'Gelap',          rel: 0.85, shift: 0.18 }
  ];

  function presetsFor(modality) {
    return (modality || '').toUpperCase() === 'CT' ? PRESETS_CT : PRESETS_REL;
  }
  var CMAPS = [
    { n: 'Abu-abu', v: null }, { n: 'Hot', v: 'hot' },
    { n: 'Bone', v: 'bone' }, { n: 'Jet', v: 'jet' }, { n: 'PET', v: 'pet' }
  ];
  var MEAS_COLORS = ['#2fd4bd', '#f5b942', '#8ab8ff', '#ff8b90', '#c79bff', '#5ce7a8'];

  function loader(on, msg) {
    var l = document.getElementById('loader');
    l.classList.toggle('hide', !on);
    if (msg) document.getElementById('loaderMsg').textContent = msg;
  }

  /* ==========================================================
     Viewport
     ========================================================== */
  function Viewport(index) {
    var self = this;
    this.i = index;
    this.series = null;
    this.index = 0;
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.ww = 400; this.wc = 40;
    this.invert = false; this.rot = 0; this.flipH = false; this.flipV = false;
    this.colormap = null;
    this.meas = [];
    this.img = null;
    this.probe = null;
    this.preset = 'Otomatis';

    var el = document.createElement('div');
    el.className = 'viewport';
    el.tabIndex = 0;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Viewport citra ' + (index + 1));
    el.innerHTML =
      '<canvas class="img"></canvas><canvas class="ann"></canvas>' +
      '<div class="vp-empty">Viewport kosong — klik seri di panel kiri</div>' +
      '<div class="vp-ovl tl"></div><div class="vp-ovl tr"></div>' +
      '<div class="vp-ovl bl"></div><div class="vp-ovl br"></div>' +
      '<div class="orient o-t"></div><div class="orient o-b"></div>' +
      '<div class="orient o-l"></div><div class="orient o-r"></div>' +
      '<div class="frame-bar"><i></i></div>';
    this.el = el;
    this.cv = el.querySelector('canvas.img');
    this.ctx = this.cv.getContext('2d');
    this.ann = el.querySelector('canvas.ann');
    this.actx = this.ann.getContext('2d');
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d');

    /* Pointer Events dipakai agar tetikus, pena, dan layar sentuh
       ditangani lewat jalur yang sama. */
    this.pointers = new Map();

    el.addEventListener('pointerdown', function (e) {
      setActive(self.i);
      self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch (err) {}

      if (self.pointers.size === 2) {
        batalDrag();                       /* dua jari → cubit, bukan alat */
        self.pinch = pinchState(self);
        return;
      }
      if (self.pointers.size === 1) onDown(self, e);
    });

    el.addEventListener('pointermove', function (e) {
      if (self.pointers.has(e.pointerId)) {
        self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (self.pointers.size === 2 && self.pinch) { onPinch(self); return; }
      onHover(self, e);
    });

    function lepas(e) {
      self.pointers.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      if (self.pointers.size < 2) self.pinch = null;
      if (self.pointers.size === 0) onUp();
    }
    el.addEventListener('pointerup', lepas);
    el.addEventListener('pointercancel', lepas);

    el.addEventListener('wheel', function (e) { onWheel(self, e); }, { passive: false });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('dblclick', function () {
      App.layout = App.layout === '1x1' ? '2x2' : '1x1';
      applyLayout();
    });
  }

  /* ---------- cubit dua jari: perbesar + geser ---------- */
  function pinchState(vp) {
    var p = Array.from(vp.pointers.values());
    var r = vp.el.getBoundingClientRect();
    return {
      jarak: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
      cx: (p[0].x + p[1].x) / 2 - r.left,
      cy: (p[0].y + p[1].y) / 2 - r.top,
      zoom0: vp.zoom, panX0: vp.panX, panY0: vp.panY
    };
  }
  function onPinch(vp) {
    var p = Array.from(vp.pointers.values());
    if (p.length < 2 || !vp.img) return;
    var r = vp.el.getBoundingClientRect();
    var jarak = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
    var cx = (p[0].x + p[1].x) / 2 - r.left;
    var cy = (p[0].y + p[1].y) / 2 - r.top;
    var s = vp.pinch;

    vp.zoom = Math.max(0.08, Math.min(24, s.zoom0 * (jarak / s.jarak)));
    vp.panX = s.panX0 + (cx - s.cx) * vp.dpr;
    vp.panY = s.panY0 + (cy - s.cy) * vp.dpr;
    vp.draw();
    syncPanels();
  }

  Viewport.prototype.resize = function () {
    var r = this.el.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [this.cv, this.ann].forEach(function (c) {
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    });
    this.dpr = dpr;
    this.cw = this.cv.width; this.ch = this.cv.height;
  };

  Viewport.prototype.base = function () {
    if (!this.img) return 1;
    return Math.min(this.cw / this.img.cols, this.ch / this.img.rows);
  };

  /* koordinat gambar → kanvas (dalam piksel kanvas ber-dpr) */
  Viewport.prototype.toScreen = function (px, py) {
    var img = this.img; if (!img) return [0, 0];
    var s = this.base() * this.zoom;
    var dx = (px - img.cols / 2) * (this.flipH ? -1 : 1) * s;
    var dy = (py - img.rows / 2) * (this.flipV ? -1 : 1) * s;
    var a = this.rot * Math.PI / 2, c = Math.cos(a), si = Math.sin(a);
    return [this.cw / 2 + this.panX + dx * c - dy * si,
            this.ch / 2 + this.panY + dx * si + dy * c];
  };
  Viewport.prototype.toImage = function (sx, sy) {
    var img = this.img; if (!img) return [0, 0];
    var s = this.base() * this.zoom;
    var rx = sx - this.cw / 2 - this.panX, ry = sy - this.ch / 2 - this.panY;
    var a = this.rot * Math.PI / 2, c = Math.cos(a), si = Math.sin(a);
    var dx = rx * c + ry * si, dy = -rx * si + ry * c;
    dx = dx / s * (this.flipH ? -1 : 1);
    dy = dy / s * (this.flipV ? -1 : 1);
    return [dx + img.cols / 2, dy + img.rows / 2];
  };
  /* posisi mouse → koordinat kanvas */
  Viewport.prototype.evPos = function (e) {
    var r = this.el.getBoundingClientRect();
    return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr];
  };

  Viewport.prototype.fit = function () {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.draw();
  };
  Viewport.prototype.reset = function () {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.rot = 0; this.flipH = this.flipV = false; this.invert = false;
    this.colormap = null;
    if (this.img) { this.ww = this.img.windowWidth; this.wc = this.img.windowCenter; }
    this.draw();
  };

  /* ---------- muat citra ke viewport ---------- */
  Viewport.prototype.load = function (series, index, keepView) {
    var self = this;
    if (!series) return Promise.resolve();
    this.series = series;
    this.index = Math.max(0, Math.min(series.count - 1, index || 0));
    return series.getImage(this.index).then(function (img) {
      var first = !keepView || !self.img;
      self.img = img;
      if (first) {
        self.ww = img.windowWidth; self.wc = img.windowCenter;
        self.zoom = 1; self.panX = 0; self.panY = 0;
      }
      self.el.querySelector('.vp-empty').style.display = 'none';
      self.draw();
      if (self.i === App.active) syncPanels();
      return img;
    }).catch(function (err) {
      self.el.querySelector('.vp-empty').style.display = '';
      self.el.querySelector('.vp-empty').textContent = 'Gagal memuat: ' + err.message;
      self.img = null;
    });
  };

  /* ---------- render ---------- */
  Viewport.prototype.draw = function () {
    var ctx = this.ctx;
    if (!this.cw) this.resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.cw, this.ch);
    var img = this.img;
    if (!img) { this.drawAnn(); this.overlay(); return; }

    if (img.unsupported) {
      ctx.fillStyle = '#93a9be';
      ctx.font = (13 * this.dpr) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Transfer syntax belum didukung:', this.cw / 2, this.ch / 2 - 12 * this.dpr);
      ctx.fillText(img.unsupported, this.cw / 2, this.ch / 2 + 10 * this.dpr);
      this.drawAnn(); this.overlay(); return;
    }

    /* gambar terenkapsulasi (JPEG) — dekode lewat <img> */
    if (img.mime) {
      if (!img._el) {
        if (!img._loading) {
          img._loading = true;
          var self = this;
          var blob = new Blob([img.blobBytes], { type: img.mime });
          var im = new Image();
          im.onload = function () { img._el = im; img.cols = im.naturalWidth; img.rows = im.naturalHeight; self.draw(); };
          im.onerror = function () { img.unsupported = 'JPEG gagal didekode'; self.draw(); };
          im.src = URL.createObjectURL(blob);
        }
        this.drawAnn(); this.overlay(); return;
      }
      this.blit(img._el, img.cols, img.rows);
      this.drawAnn(); this.overlay(); return;
    }

    /* Hasil window/level di-cache: geser, perbesar, putar, dan cermin
       cukup menggambar ulang kanvas luring tanpa menghitung LUT lagi. */
    var kunci = Math.round(this.ww) + '|' + Math.round(this.wc) + '|' +
                (this.invert ? 1 : 0) + '|' + (this.colormap || '');
    if (this._cImg !== img || this._cKey !== kunci) {
      var idata = window.DICOM.toImageData(img, {
        windowCenter: this.wc, windowWidth: this.ww,
        invert: this.invert, colormap: this.colormap
      });
      this.off.width = img.cols; this.off.height = img.rows;
      this.octx.putImageData(idata, 0, 0);
      this._cImg = img; this._cKey = kunci;
    }
    this.blit(this.off, img.cols, img.rows);
    this.drawAnn();
    this.overlay();
  };

  Viewport.prototype.blit = function (src, iw, ih) {
    var ctx = this.ctx, s = this.base() * this.zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = App.smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(this.cw / 2 + this.panX, this.ch / 2 + this.panY);
    ctx.rotate(this.rot * Math.PI / 2);
    ctx.scale(s * (this.flipH ? -1 : 1), s * (this.flipV ? -1 : 1));
    ctx.drawImage(src, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  };

  /* ---------- anotasi & pengukuran ---------- */
  Viewport.prototype.drawAnn = function () {
    var ctx = this.actx, self = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.ann.width, this.ann.height);
    if (!this.img || !App.showOverlay) return;
    var d = this.dpr;

    this.meas.forEach(function (m, mi) {
      if (m.slice !== undefined && m.slice !== self.index) return;   /* hanya pada irisannya */
      ctx.strokeStyle = m.color; ctx.fillStyle = m.color;
      ctx.lineWidth = 1.6 * d;
      ctx.font = (11.5 * d) + 'px "JetBrains Mono",monospace';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 3 * d;

      var p = m.pts.map(function (pt) { return self.toScreen(pt[0], pt[1]); });

      if (m.type === 'length') {
        line(ctx, p[0], p[1]); handle(ctx, p[0], d); handle(ctx, p[1], d);
        label(ctx, mid(p[0], p[1]), m.label, d);
      } else if (m.type === 'angle') {
        line(ctx, p[0], p[1]); line(ctx, p[1], p[2]);
        p.forEach(function (q) { handle(ctx, q, d); });
        label(ctx, p[1], m.label, d);
      } else if (m.type === 'rect') {
        var x = Math.min(p[0][0], p[1][0]), y = Math.min(p[0][1], p[1][1]);
        ctx.strokeRect(x, y, Math.abs(p[1][0] - p[0][0]), Math.abs(p[1][1] - p[0][1]));
        label(ctx, [x, y - 6 * d], m.label, d);
      } else if (m.type === 'ellipse') {
        var cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2;
        var rx = Math.abs(p[1][0] - p[0][0]) / 2, ry = Math.abs(p[1][1] - p[0][1]) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2); ctx.stroke();
        label(ctx, [cx - rx, cy - ry - 6 * d], m.label, d);
      } else if (m.type === 'probe') {
        handle(ctx, p[0], d);
        ctx.beginPath();
        ctx.moveTo(p[0][0] - 8 * d, p[0][1]); ctx.lineTo(p[0][0] + 8 * d, p[0][1]);
        ctx.moveTo(p[0][0], p[0][1] - 8 * d); ctx.lineTo(p[0][0], p[0][1] + 8 * d);
        ctx.stroke();
        label(ctx, [p[0][0] + 10 * d, p[0][1] - 4 * d], m.label, d);
      } else if (m.type === 'note') {
        handle(ctx, p[0], d);
        label(ctx, [p[0][0] + 9 * d, p[0][1]], m.text, d);
      }
      ctx.shadowBlur = 0;
    });

    /* skala referensi */
    if (this.img.pixelSpacing && this.img.pixelSpacing[0]) {
      var s = this.base() * this.zoom;
      var mmPer = this.img.pixelSpacing[0];
      var target = 90 * d;
      var mm = Math.max(1, Math.round((target / s) * mmPer / 10) * 10);
      var pxLen = mm / mmPer * s;
      if (pxLen > 20 * d && pxLen < this.cw * 0.6) {
        /* diletakkan di atas overlay kanan-bawah agar tidak bertabrakan */
        var x0 = this.cw - pxLen - 16 * d, y0 = this.ch - 72 * d;
        ctx.strokeStyle = 'rgba(200,230,240,.85)'; ctx.lineWidth = 1.4 * d;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 4 * d); ctx.lineTo(x0, y0 + 4 * d);
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + pxLen, y0);
        ctx.moveTo(x0 + pxLen, y0 - 4 * d); ctx.lineTo(x0 + pxLen, y0 + 4 * d);
        ctx.stroke();
        ctx.fillStyle = 'rgba(200,230,240,.85)';
        ctx.font = (10.5 * d) + 'px "JetBrains Mono",monospace';
        ctx.textAlign = 'center';
        ctx.fillText(mm >= 10 ? (mm / 10) + ' cm' : mm + ' mm', x0 + pxLen / 2, y0 - 8 * d);
        ctx.textAlign = 'left';
      }
    }
  };

  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function handle(ctx, p, d) { ctx.beginPath(); ctx.arc(p[0], p[1], 3 * d, 0, Math.PI * 2); ctx.fill(); }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function label(ctx, p, text, d) {
    if (!text) return;
    var lines = String(text).split('\n');
    ctx.textBaseline = 'bottom';
    lines.forEach(function (ln, i) {
      ctx.fillText(ln, p[0] + 5 * d, p[1] - 4 * d + i * 13 * d);
    });
  }

  /* ---------- overlay teks DICOM ---------- */
  Viewport.prototype.overlay = function () {
    var q = this.el.querySelectorAll('.vp-ovl');
    var vis = App.showOverlay;
    q.forEach(function (n) { n.classList.toggle('hidden', !vis); });
    this.el.querySelectorAll('.orient').forEach(function (n) { n.classList.toggle('hidden', !vis); });
    if (!vis || !this.img || !this.series) return;

    var st = App.study || {}, p = st.patient || {}, s = this.series;
    var img = this.img;
    q[0].innerHTML = '<span class="hl">' + esc(p.name || '—') + '</span><br>' +
      esc(p.id || '') + (p.sex ? ' · ' + p.sex : '') + (p.age ? ' · ' + esc(p.age) : '') + '<br>' +
      esc(st.institution || '');
    q[1].innerHTML = esc(st.modality || s.modality || '') + ' · ' + esc(st.model || '') + '<br>' +
      '<span class="hl">' + esc(s.desc) + '</span><br>' +
      'Seri ' + s.number + ' · ' + K.fmtDate(st.date) + ' ' + K.fmtTime(st.time);
    q[2].innerHTML = 'W: ' + Math.round(this.ww) + '  L: ' + Math.round(this.wc) + '<br>' +
      'Zoom: ' + Math.round(this.zoom * 100) + '%' + (this.invert ? ' · INV' : '') +
      (this.colormap ? ' · ' + this.colormap.toUpperCase() : '');
    q[3].innerHTML = 'Im: ' + (this.index + 1) + '/' + s.count + '<br>' +
      (img.sliceThickness ? img.sliceThickness + ' mm<br>' : '') +
      img.cols + '×' + img.rows;

    /* penanda orientasi (untuk citra aksial) */
    var o = this.el.querySelectorAll('.orient');
    var mods = (st.modality || '').toUpperCase();
    var lbl = (mods === 'CR' || mods === 'DX') ? ['', '', 'R', 'L'] : ['A', 'P', 'R', 'L'];
    var order = [0, 1, 2, 3];
    /* sesuaikan dengan rotasi & flip */
    var rotMap = [[0,1,2,3],[2,3,1,0],[1,0,3,2],[3,2,0,1]];
    order = rotMap[this.rot % 4];
    var labels = [lbl[order[0]], lbl[order[1]], lbl[order[2]], lbl[order[3]]];
    if (this.flipH) { var t = labels[2]; labels[2] = labels[3]; labels[3] = t; }
    if (this.flipV) { var t2 = labels[0]; labels[0] = labels[1]; labels[1] = t2; }
    o[0].textContent = labels[0]; o[1].textContent = labels[1];
    o[2].textContent = labels[2]; o[3].textContent = labels[3];

    /* bar posisi irisan */
    var bar = this.el.querySelector('.frame-bar');
    var knob = bar.querySelector('i');
    if (s.count > 1) {
      bar.style.display = '';
      var h = bar.clientHeight, kh = Math.max(12, h / s.count);
      knob.style.height = kh + 'px';
      knob.style.top = ((h - kh) * (this.index / (s.count - 1))) + 'px';
    } else bar.style.display = 'none';
  };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==========================================================
     Interaksi mouse
     ========================================================== */
  var drag = null;

  function onDown(vp, e) {
    if (!vp.img) return;
    e.preventDefault();
    var pos = vp.evPos(e);
    var tool = App.tool;
    if (e.button === 1) tool = 'pan';
    if (e.button === 2) tool = 'zoom';
    if (e.button === 0 && e.shiftKey) tool = 'pan';
    if (e.button === 0 && e.ctrlKey) tool = 'zoom';

    drag = {
      vp: vp, tool: tool, x0: pos[0], y0: pos[1], lx: pos[0], ly: pos[1],
      ww0: vp.ww, wc0: vp.wc, panX0: vp.panX, panY0: vp.panY, zoom0: vp.zoom, idx0: vp.index,
      meas: null
    };

    var ip = vp.toImage(pos[0], pos[1]);
    if (tool === 'length' || tool === 'rect' || tool === 'ellipse') {
      drag.meas = newMeas(vp, tool, [[ip[0], ip[1]], [ip[0], ip[1]]]);
    } else if (tool === 'angle') {
      /* sudut dibuat dengan tiga klik: ujung 1 → titik sudut → ujung 2 */
      var pa = App.pendingAngle;
      if (!pa || pa.vp !== vp) {
        var m2 = newMeas(vp, 'angle', [[ip[0], ip[1]], [ip[0], ip[1]], [ip[0], ip[1]]]);
        App.pendingAngle = { vp: vp, m: m2, step: 1 };
        K.toast('Klik titik sudut, lalu ujung kedua.');
      } else if (pa.step === 1) {
        pa.m.pts[1] = [ip[0], ip[1]]; pa.step = 2;
      } else {
        pa.m.pts[2] = [ip[0], ip[1]];
        updateMeas(vp, pa.m);
        App.pendingAngle = null;
        refreshMeasList();
      }
      vp.drawAnn();
      drag = null;
      return;
    } else if (tool === 'probe') {
      drag.meas = newMeas(vp, 'probe', [[ip[0], ip[1]]]);
    } else if (tool === 'note') {
      var txt = prompt('Teks anotasi:', '');
      if (txt) { var m = newMeas(vp, 'note', [[ip[0], ip[1]]]); m.text = txt; updateMeas(vp, m); }
      drag = null; vp.drawAnn(); refreshMeasList(); return;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /* dipakai saat jari kedua menyentuh: batalkan aksi alat yang sedang jalan */
  function batalDrag() {
    if (!drag) return;
    if (drag.meas) {
      var i = drag.vp.meas.indexOf(drag.meas);
      if (i !== -1) drag.vp.meas.splice(i, 1);
      drag.vp.drawAnn();
    }
    drag = null;
    lepasListenerDrag();
  }
  function lepasListenerDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }

  function onMove(e) {
    if (!drag) return;
    var vp = drag.vp, pos = vp.evPos(e);
    var dx = pos[0] - drag.lx, dy = pos[1] - drag.ly;
    var tdx = pos[0] - drag.x0, tdy = pos[1] - drag.y0;
    drag.lx = pos[0]; drag.ly = pos[1];

    switch (drag.tool) {
      case 'wwwc':
        vp.ww = Math.max(1, drag.ww0 + tdx * (vp.img.max - vp.img.min > 500 ? 4 : 1.2) / vp.dpr);
        vp.wc = drag.wc0 + tdy * (vp.img.max - vp.img.min > 500 ? 4 : 1.2) / vp.dpr;
        vp.preset = 'Manual';
        if (App.sync) App.viewports.forEach(function (o) { if (o !== vp && o.img) { o.ww = vp.ww; o.wc = vp.wc; o.draw(); } });
        vp.draw(); syncPanels();
        break;
      case 'pan':
        vp.panX = drag.panX0 + (pos[0] - drag.x0);
        vp.panY = drag.panY0 + (pos[1] - drag.y0);
        vp.draw();
        break;
      case 'zoom':
        vp.zoom = Math.max(0.08, Math.min(24, drag.zoom0 * Math.exp(-tdy / (180 * vp.dpr))));
        vp.draw(); syncPanels();
        break;
      case 'stack': {
        var step = Math.round(tdy / (6 * vp.dpr));
        var ni = Math.max(0, Math.min(vp.series.count - 1, drag.idx0 + step));
        if (ni !== vp.index) gotoIndex(vp, ni);
        break;
      }
      case 'length': case 'rect': case 'ellipse': {
        var ip = vp.toImage(pos[0], pos[1]);
        drag.meas.pts[1] = [ip[0], ip[1]];
        updateMeas(vp, drag.meas);
        vp.drawAnn();
        break;
      }
      case 'probe': {
        var ip3 = vp.toImage(pos[0], pos[1]);
        drag.meas.pts[0] = [ip3[0], ip3[1]];
        updateMeas(vp, drag.meas);
        vp.drawAnn();
        break;
      }
    }
  }

  function onUp() {
    if (drag && drag.meas) {
      var m = drag.meas, vp = drag.vp;
      /* buang pengukuran yang terlalu kecil (klik tanpa geser) */
      if (m.type !== 'note' && m.type !== 'probe') {
        var a = m.pts[0], b = m.pts[m.pts.length - 1];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 3) {
          vp.meas.splice(vp.meas.indexOf(m), 1);
          vp.drawAnn();
        }
      }
      refreshMeasList();
    }
    drag = null;
    lepasListenerDrag();
  }

  function onHover(vp, e) {
    if (!vp.img) return;
    var pos = vp.evPos(e), ip = vp.toImage(pos[0], pos[1]);

    /* pratinjau alat sudut yang sedang dibuat */
    var pa = App.pendingAngle;
    if (pa && pa.vp === vp) {
      pa.m.pts[pa.step] = [ip[0], ip[1]];
      if (pa.step === 1) pa.m.pts[2] = [ip[0], ip[1]];
      updateMeas(vp, pa.m);
      vp.drawAnn();
    }

    if (vp.img.mime) return;
    var x = Math.floor(ip[0]), y = Math.floor(ip[1]);
    var out = document.getElementById('fPix'), posOut = document.getElementById('fPos');
    if (x >= 0 && y >= 0 && x < vp.img.cols && y < vp.img.rows && vp.img.pixels) {
      var raw = vp.img.pixels[y * vp.img.cols + x];
      var val = raw * vp.img.slope + vp.img.intercept;
      out.textContent = Math.round(val) + unitOf(vp.img);
      posOut.textContent = 'x:' + x + ' y:' + y;
    } else { out.textContent = '—'; posOut.textContent = '—'; }
  }

  function unitOf(img) {
    return (App.study && (App.study.modality === 'CT')) ? ' HU' : '';
  }

  function onWheel(vp, e) {
    e.preventDefault();
    if (!vp.img) return;
    if (e.ctrlKey) {
      var f = Math.exp(-e.deltaY / 500);
      vp.zoom = Math.max(0.08, Math.min(24, vp.zoom * f));
      vp.draw(); syncPanels();
      return;
    }
    if (!vp.series || vp.series.count < 2) return;
    var dir = e.deltaY > 0 ? 1 : -1;
    gotoIndex(vp, Math.max(0, Math.min(vp.series.count - 1, vp.index + dir)));
  }

  /* ==========================================================
     Pengukuran
     ========================================================== */
  function newMeas(vp, type, pts) {
    var m = {
      id: Date.now() + Math.random(), type: type, pts: pts,
      color: MEAS_COLORS[vp.meas.length % MEAS_COLORS.length],
      slice: vp.index, label: '', text: ''
    };
    vp.meas.push(m);
    return m;
  }

  function updateMeas(vp, m) {
    var img = vp.img; if (!img) return;
    var sp = img.pixelSpacing && img.pixelSpacing[0] ? img.pixelSpacing : null;
    var mmX = sp ? sp[1] || sp[0] : 1, mmY = sp ? sp[0] : 1;
    var unit = sp ? ' mm' : ' px';

    if (m.type === 'length') {
      var dx = (m.pts[1][0] - m.pts[0][0]) * mmX, dy = (m.pts[1][1] - m.pts[0][1]) * mmY;
      m.value = Math.hypot(dx, dy);
      m.label = m.value.toFixed(1) + unit;
    } else if (m.type === 'angle') {
      var v1 = [m.pts[0][0] - m.pts[1][0], m.pts[0][1] - m.pts[1][1]];
      var v2 = [m.pts[2][0] - m.pts[1][0], m.pts[2][1] - m.pts[1][1]];
      var a1 = Math.atan2(v1[1], v1[0]), a2 = Math.atan2(v2[1], v2[0]);
      var deg = Math.abs((a1 - a2) * 180 / Math.PI);
      if (deg > 180) deg = 360 - deg;
      m.value = deg;
      m.label = deg.toFixed(1) + '°';
    } else if (m.type === 'probe') {
      var x = Math.round(m.pts[0][0]), y = Math.round(m.pts[0][1]);
      if (x >= 0 && y >= 0 && x < img.cols && y < img.rows && img.pixels) {
        var v = img.pixels[y * img.cols + x] * img.slope + img.intercept;
        m.value = v;
        m.label = Math.round(v) + unitOf(img) + '  (' + x + ',' + y + ')';
      } else m.label = '—';
    } else if (m.type === 'rect' || m.type === 'ellipse') {
      var st = roiStats(img, m);
      m.stats = st;
      var areaMM = st.count * mmX * mmY;
      m.value = st.mean;
      m.label = 'x̄ ' + st.mean.toFixed(1) + unitOf(img) +
                '\nσ ' + st.sd.toFixed(1) +
                '\nA ' + (sp ? (areaMM / 100).toFixed(2) + ' cm²' : st.count + ' px');
    }
  }

  function roiStats(img, m) {
    var x0 = Math.round(Math.min(m.pts[0][0], m.pts[1][0])), x1 = Math.round(Math.max(m.pts[0][0], m.pts[1][0]));
    var y0 = Math.round(Math.min(m.pts[0][1], m.pts[1][1])), y1 = Math.round(Math.max(m.pts[0][1], m.pts[1][1]));
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(img.cols - 1, x1); y1 = Math.min(img.rows - 1, y1);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
    var sum = 0, sum2 = 0, n = 0, mn = Infinity, mx = -Infinity;
    if (!img.pixels) return { mean: 0, sd: 0, count: 0, min: 0, max: 0 };
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (m.type === 'ellipse') {
          var ddx = (x - cx) / rx, ddy = (y - cy) / ry;
          if (ddx * ddx + ddy * ddy > 1) continue;
        }
        var v = img.pixels[y * img.cols + x] * img.slope + img.intercept;
        sum += v; sum2 += v * v; n++;
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
    }
    if (!n) return { mean: 0, sd: 0, count: 0, min: 0, max: 0 };
    var mean = sum / n;
    return { mean: mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), count: n, min: mn, max: mx };
  }

  function refreshMeasList() {
    var vp = App.viewports[App.active];
    var host = document.getElementById('measList');
    if (!vp || !vp.meas.length) {
      host.innerHTML = '<p style="color:var(--muted);font-size:12.5px">Belum ada pengukuran pada viewport aktif.</p>';
      return;
    }
    host.innerHTML = vp.meas.map(function (m, i) {
      var nama = { length: 'Panjang', angle: 'Sudut', rect: 'ROI persegi', ellipse: 'ROI elips', probe: 'Probe', note: 'Anotasi' }[m.type];
      var val = m.type === 'note' ? m.text : String(m.label || '').replace(/\n/g, ' · ');
      return '<div class="meas-item" data-mi="' + i + '">' +
        '<span class="sw" style="background:' + m.color + '"></span>' +
        '<span class="txt"><b>' + nama + '</b><span>' + esc(val) + '  · irisan ' + (m.slice + 1) + '</span></span>' +
        '<button class="x" title="Hapus">×</button></div>';
    }).join('');
    K.qsa('#measList .meas-item .x').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.closest('.meas-item').dataset.mi;
        vp.meas.splice(i, 1); vp.drawAnn(); refreshMeasList();
      });
    });
    K.qsa('#measList .meas-item').forEach(function (n) {
      n.addEventListener('click', function (e) {
        if (e.target.classList.contains('x')) return;
        var m = vp.meas[+n.dataset.mi];
        if (m && m.slice !== vp.index) gotoIndex(vp, m.slice);
      });
    });
  }

  /* ==========================================================
     Navigasi irisan & cine
     ========================================================== */
  function gotoIndex(vp, i) {
    if (!vp.series) return;
    i = Math.max(0, Math.min(vp.series.count - 1, i));
    if (i === vp.index && vp.img) return;
    vp.index = i;
    vp.series.getImage(i).then(function (img) {
      vp.img = img;
      vp.draw();
      if (vp.i === App.active) { syncFrameUI(); syncPanels(); }
    });
    if (App.sync) {
      App.viewports.forEach(function (o) {
        if (o !== vp && o.series && o.series.count > 1) {
          var ratio = vp.series.count > 1 ? i / (vp.series.count - 1) : 0;
          var ti = Math.round(ratio * (o.series.count - 1));
          if (ti !== o.index) {
            o.index = ti;
            o.series.getImage(ti).then(function (im) { o.img = im; o.draw(); });
          }
        }
      });
    }
  }

  function cineToggle(on) {
    var c = App.cine;
    c.playing = on === undefined ? !c.playing : on;
    if (c.timer) { clearInterval(c.timer); c.timer = null; }
    if (c.playing) {
      c.timer = setInterval(function () {
        var vp = App.viewports[App.active];
        if (!vp || !vp.series || vp.series.count < 2) return;
        gotoIndex(vp, (vp.index + 1) % vp.series.count);
      }, 1000 / c.fps);
    }
    document.getElementById('cinePlay').innerHTML = c.playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  }

  function syncFrameUI() {
    var vp = App.viewports[App.active];
    var sl = document.getElementById('frameSlider');
    if (!vp || !vp.series) { sl.max = 0; sl.value = 0; document.getElementById('frameLbl').textContent = '0/0'; return; }
    sl.max = vp.series.count - 1;
    sl.value = vp.index;
    document.getElementById('frameLbl').textContent = (vp.index + 1) + '/' + vp.series.count;
  }

  /* ==========================================================
     Panel kanan
     ========================================================== */
  function syncPanels() {
    var vp = App.viewports[App.active];
    if (!vp) return;
    document.getElementById('fWW').textContent = vp.img ? Math.round(vp.ww) : '—';
    document.getElementById('fWL').textContent = vp.img ? Math.round(vp.wc) : '—';
    document.getElementById('fZoom').textContent = vp.img ? Math.round(vp.zoom * 100) + '%' : '—';

    buildPresets(App.study && App.study.modality);

    var rWW = document.getElementById('rWW'), rWL = document.getElementById('rWL');
    if (vp.img) {
      /* rentang slider mengikuti rentang nilai citra yang sedang dibuka */
      var span = Math.max(1, vp.img.max - vp.img.min);
      rWW.min = 1; rWW.max = Math.round(span * 2);
      rWL.min = Math.round(vp.img.min - span); rWL.max = Math.round(vp.img.max + span);
      rWW.value = Math.max(+rWW.min, Math.min(+rWW.max, Math.round(vp.ww)));
      rWL.value = Math.max(+rWL.min, Math.min(+rWL.max, Math.round(vp.wc)));
      document.getElementById('vWW').textContent = Math.round(vp.ww);
      document.getElementById('vWL').textContent = Math.round(vp.wc);
    }
    document.getElementById('swInvert').checked = vp.invert;

    K.qsa('#presets .preset').forEach(function (b) { b.classList.toggle('on', b.dataset.p === vp.preset); });
    K.qsa('#cmaps .preset').forEach(function (b) { b.classList.toggle('on', (b.dataset.c || '') === (vp.colormap || '')); });

    syncFrameUI();
    fillInfo();
    fillTags();
    refreshMeasList();
  }

  function tRow(k, v) {
    return '<tr><td style="padding:5px 0;color:var(--muted);width:44%;vertical-align:top">' + esc(k) +
      '</td><td style="padding:5px 0;word-break:break-word">' + esc(v === undefined || v === '' ? '—' : v) + '</td></tr>';
  }

  function fillInfo() {
    var st = App.study, vp = App.viewports[App.active];
    if (!st) return;
    var p = st.patient || {};
    document.getElementById('tblPatient').innerHTML =
      tRow('Nama', p.name) + tRow('No. RM', p.id) + tRow('Jenis kelamin', p.sex === 'M' ? 'Laki-laki' : p.sex === 'F' ? 'Perempuan' : p.sex) +
      tRow('Tanggal lahir', K.fmtDate(p.birth)) + tRow('Usia', p.age);
    document.getElementById('tblStudy').innerHTML =
      tRow('Deskripsi', st.desc) + tRow('Modalitas', st.modality) + tRow('Regio', st.bodyPart) +
      tRow('Tanggal', K.fmtDate(st.date) + ' ' + K.fmtTime(st.time)) +
      tRow('Accession', st.accession) + tRow('Institusi', st.institution) +
      tRow('Alat', st.model) + tRow('Perujuk', st.referring);
    var s = vp && vp.series, img = vp && vp.img;
    document.getElementById('tblImage').innerHTML = s ? (
      tRow('Seri', s.number + ' — ' + s.desc) +
      tRow('Jumlah citra', s.count) +
      tRow('Citra aktif', (vp.index + 1)) +
      (img ? tRow('Matriks', img.cols + ' × ' + img.rows) +
        tRow('Bit', img.bitsAllocated + ' bit' + (img.signed ? ' (signed)' : '')) +
        tRow('Photometric', img.photometric) +
        tRow('Pixel spacing', img.pixelSpacing && img.pixelSpacing[0]
          ? img.pixelSpacing[0].toFixed(3) + ' × ' + (img.pixelSpacing[1] || img.pixelSpacing[0]).toFixed(3) + ' mm' : '—') +
        tRow('Tebal irisan', img.sliceThickness ? img.sliceThickness + ' mm' : '—') +
        tRow('Rescale', 'slope ' + img.slope + ', intercept ' + img.intercept) : '')
    ) : tRow('Seri', '—');
  }

  var tagCache = null;
  function fillTags() {
    var vp = App.viewports[App.active];
    if (!vp || !vp.series) { document.getElementById('tagTable').innerHTML = ''; return; }
    tagCache = vp.series.getTags(vp.index) || [];
    renderTags();
  }
  function renderTags() {
    var q = (document.getElementById('tagQ').value || '').toLowerCase();
    var rows = (tagCache || []).filter(function (t) {
      if (!q) return true;
      return (t.tag + ' ' + t.name + ' ' + t.value).toLowerCase().indexOf(q) !== -1;
    });
    document.getElementById('tagTable').innerHTML = rows.map(function (t) {
      return '<tr><td class="tg">' + esc(t.tag) + '</td><td class="nm">' + esc(t.name || t.vr) +
        '</td><td class="vl">' + esc(t.value) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" style="color:var(--muted);padding:10px 4px">Tidak ada tag yang cocok.</td></tr>';
  }
  document.getElementById('tagQ').addEventListener('input', renderTags);

  /* ==========================================================
     Layout & viewport aktif
     ========================================================== */
  function applyLayout() {
    var grid = document.getElementById('grid');
    grid.className = 'vp-grid l' + App.layout;
    var n = { '1x1': 1, '1x2': 2, '2x2': 4, '1x3': 3 }[App.layout];
    grid.innerHTML = '';
    while (App.viewports.length < n) App.viewports.push(new Viewport(App.viewports.length));
    App.viewports.slice(0, n).forEach(function (vp, i) { vp.i = i; grid.appendChild(vp.el); });
    if (App.active >= n) App.active = 0;

    K.qsa('.app-bar [data-layout]').forEach(function (b) {
      b.classList.toggle('btn-primary', b.dataset.layout === App.layout);
    });

    requestAnimationFrame(function () {
      App.viewports.slice(0, n).forEach(function (vp, i) {
        vp.resize();
        /* viewport yang baru muncul diisi seri berikutnya dari studi ini */
        if (!vp.series && App.study && App.study.series.length) {
          var s = App.study.series[Math.min(i, App.study.series.length - 1)];
          vp.load(s, Math.floor(s.count / 2));
        } else {
          vp.draw();
        }
      });
      setActive(App.active);
    });
    K.store.set('vw.layout', App.layout);
  }

  function setActive(i) {
    App.active = i;
    App.viewports.forEach(function (vp, k) { vp.el.classList.toggle('active', k === i); });
    syncPanels();
  }

  function visibleCount() { return { '1x1': 1, '1x2': 2, '2x2': 4, '1x3': 3 }[App.layout]; }

  window.addEventListener('resize', function () {
    App.viewports.slice(0, visibleCount()).forEach(function (vp) { vp.resize(); vp.draw(); });
  });

  /* ==========================================================
     Panel seri
     ========================================================== */
  function renderSeries() {
    var host = document.getElementById('seriesList');
    var st = App.study;
    document.getElementById('serCount').textContent = st ? st.series.length : 0;
    if (!st) { host.innerHTML = ''; return; }

    host.innerHTML = st.series.map(function (s, i) {
      return '<div class="series-item" data-si="' + i + '">' +
        '<canvas class="thumb" width="120" height="120"></canvas>' +
        '<div class="meta"><b>' + esc(s.desc) + '</b>' +
        '<span>#' + s.number + ' · ' + s.count + ' citra</span></div></div>';
    }).join('');

    st.series.forEach(function (s, i) {
      var node = host.querySelector('[data-si="' + i + '"]');
      node.addEventListener('click', function () {
        var vp = App.viewports[App.active];
        loader(true, 'Memuat seri…');
        vp.load(s, Math.floor(s.count / 2)).then(function () {
          loader(false);
          markSeries();
          syncPanels();
        });
      });
    });

    /* thumbnail dibangun bertahap agar antarmuka tetap responsif */
    var qi = 0;
    (function nextThumb() {
      if (qi >= st.series.length) return;
      var i = qi++, s = st.series[i];
      var node = host.querySelector('[data-si="' + i + '"]');
      if (!node) return nextThumb();
      s.getImage(Math.floor(s.count / 2)).then(function (img) {
        var cv = node.querySelector('canvas'), c = cv.getContext('2d');
        c.fillStyle = '#05080c'; c.fillRect(0, 0, cv.width, cv.height);
        if (img.mime || img.unsupported || !img.pixels) {
          c.fillStyle = '#3d4c5e'; c.font = '11px system-ui'; c.textAlign = 'center';
          c.fillText(img.unsupported ? '?' : 'JPEG', cv.width / 2, cv.height / 2);
        } else {
          var idata = window.DICOM.toImageData(img, {});
          var off = document.createElement('canvas');
          off.width = img.cols; off.height = img.rows;
          off.getContext('2d').putImageData(idata, 0, 0);
          var sc = Math.min(cv.width / img.cols, cv.height / img.rows);
          c.drawImage(off, (cv.width - img.cols * sc) / 2, (cv.height - img.rows * sc) / 2,
            img.cols * sc, img.rows * sc);
        }
        setTimeout(nextThumb, 16);
      }).catch(function () { setTimeout(nextThumb, 16); });
    })();

    markSeries();
  }

  function markSeries() {
    var vp = App.viewports[App.active];
    K.qsa('#seriesList .series-item').forEach(function (n) {
      var s = App.study.series[+n.dataset.si];
      n.classList.toggle('active', vp && vp.series === s);
    });
  }

  /* ==========================================================
     Sumber data: demo & lokal
     ========================================================== */
  function buildDemoStudy(id) {
    var st = window.DEMO.studies.filter(function (s) { return s.id === id; })[0] || window.DEMO.studies[0];
    var cacheImgs = {};
    var series = st.series.map(function (s, si) {
      return {
        desc: s.desc, number: s.num, modality: st.modality, count: s.n,
        getImage: function (i) {
          if (!cacheImgs[si]) cacheImgs[si] = window.DEMO.buildSeriesImages(st, si);
          return Promise.resolve(cacheImgs[si][Math.max(0, Math.min(s.n - 1, i))]);
        },
        getTags: function (i) {
          if (!cacheImgs[si]) return [];
          var img = cacheImgs[si][Math.max(0, Math.min(s.n - 1, i))];
          return window.DEMO.fakeTags(st, si, img, i + 1);
        }
      };
    });
    return {
      id: st.id, patient: { name: K.fmtName(st.patient.name), id: st.patient.id, sex: st.patient.sex,
        age: fmtAge(st.patient.age), birth: st.patient.birth },
      desc: st.desc, modality: st.modality, bodyPart: st.bodyPart, date: st.date, time: st.time,
      accession: st.accession, institution: st.institution, model: st.model, referring: st.referring,
      series: series, source: 'demo'
    };
  }

  function fmtAge(a) {
    var m = /^(\d+)([YMD])$/.exec(a || '');
    return m ? parseInt(m[1], 10) + (m[2] === 'Y' ? ' Th' : m[2] === 'M' ? ' Bln' : ' Hr') : (a || '');
  }

  /* bangun studi dari kumpulan record berkas lokal */
  function buildLocalStudy(recs) {
    if (!recs.length) return null;
    /* kelompokkan per seri */
    var bySeries = {};
    recs.forEach(function (r) {
      var k = r.seriesUID || 'S1';
      (bySeries[k] = bySeries[k] || []).push(r);
    });
    var first = recs[0];

    var series = Object.keys(bySeries).map(function (k) {
      var items = bySeries[k].sort(function (a, b) { return (a.instance || 0) - (b.instance || 0); });
      /* buka dataset & hitung total frame */
      var slots = [];   /* {rec, frame} */
      items.forEach(function (r) {
        if (!r._ds) { try { r._ds = window.DICOM.parse(r.buf); } catch (e) { r._ds = null; } }
        var nf = 1;
        if (r._ds) nf = parseInt(r._ds.string('00280008') || '1', 10) || 1;
        for (var f = 0; f < nf; f++) slots.push({ rec: r, frame: f });
      });
      var imgCache = {};
      return {
        desc: items[0].seriesDesc || ('Seri ' + (items[0].seriesNumber || 1)),
        number: items[0].seriesNumber || 1,
        modality: items[0].modality,
        count: slots.length,
        getImage: function (i) {
          i = Math.max(0, Math.min(slots.length - 1, i));
          if (imgCache[i]) return Promise.resolve(imgCache[i]);
          return new Promise(function (res, rej) {
            var sl = slots[i];
            if (!sl.rec._ds) return rej(new Error('berkas tidak terbaca'));
            try {
              var img = window.DICOM.readPixels(sl.rec._ds, sl.frame);
              imgCache[i] = img;
              res(img);
            } catch (e) { rej(e); }
          });
        },
        getTags: function (i) {
          var sl = slots[Math.max(0, Math.min(slots.length - 1, i))];
          return sl && sl.rec._ds ? sl.rec._ds.list() : [];
        }
      };
    }).sort(function (a, b) { return a.number - b.number; });

    return {
      id: first.studyUID,
      patient: { name: first.patient, id: first.patientId, sex: first.sex, age: fmtAge(first.age), birth: '' },
      desc: first.studyDesc, modality: first.modality, bodyPart: first.bodyPart,
      date: first.date, time: first.time, accession: first.accession,
      institution: '', model: '', referring: '',
      series: series, source: 'local'
    };
  }

  function mountStudy(study) {
    if (!study || !study.series.length) { K.toast('Studi kosong atau tidak terbaca.', 'err'); return; }
    App.study = study;
    document.getElementById('hPatient').textContent = study.patient.name || '—';
    document.getElementById('hStudy').textContent =
      study.modality + ' · ' + study.desc + ' · ' + K.fmtDate(study.date) + ' · ' + study.series.length + ' seri';
    document.title = (study.patient.name || 'Studi') + ' — Kaca Viewer';
    renderSeries();
    loadReport();

    var vp = App.viewports[0];
    loader(true, 'Menyiapkan citra…');
    vp.load(study.series[0], Math.floor(study.series[0].count / 2)).then(function () {
      loader(false);
      setActive(0);
      markSeries();
      /* isi viewport lain bila layout lebih dari satu */
      var n = visibleCount();
      for (var i = 1; i < n; i++) {
        var s = study.series[Math.min(i, study.series.length - 1)];
        App.viewports[i].load(s, Math.floor(s.count / 2));
      }
    });
  }

  /* ==========================================================
     Kontrol UI
     ========================================================== */
  /* alat */
  K.qsa('#toolrail [data-tool]').forEach(function (b) {
    b.addEventListener('click', function () {
      K.qsa('#toolrail [data-tool]').forEach(function (x) {
        x.classList.remove('on');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('on');
      b.setAttribute('aria-pressed', 'true');
      App.tool = b.dataset.tool;
      cancelPendingAngle();
      document.getElementById('measHint').textContent = 'Alat aktif: ' + b.dataset.tip.split(' (')[0] + '.';
    });
  });

  function withActive(fn) {
    var vp = App.viewports[App.active];
    if (!vp || !vp.img) { K.toast('Belum ada citra pada viewport aktif.', 'warn'); return; }
    fn(vp);
  }

  document.getElementById('btnInvert').addEventListener('click', function () {
    withActive(function (vp) { vp.invert = !vp.invert; vp.draw(); syncPanels(); });
  });
  document.getElementById('btnRotate').addEventListener('click', function () {
    withActive(function (vp) { vp.rot = (vp.rot + 1) % 4; vp.draw(); });
  });
  document.getElementById('btnFlipH').addEventListener('click', function () {
    withActive(function (vp) { vp.flipH = !vp.flipH; vp.draw(); });
  });
  document.getElementById('btnFit').addEventListener('click', function () { withActive(function (vp) { vp.fit(); syncPanels(); }); });
  document.getElementById('btnReset').addEventListener('click', function () { withActive(function (vp) { vp.reset(); syncPanels(); }); });
  document.getElementById('btnClearMeas').addEventListener('click', clearMeas);
  document.getElementById('btnMeasClear').addEventListener('click', clearMeas);
  function clearMeas() {
    var vp = App.viewports[App.active];
    if (!vp) return;
    App.pendingAngle = null;
    vp.meas = []; vp.drawAnn(); refreshMeasList();
    K.toast('Pengukuran dihapus.');
  }

  /* batalkan sudut yang belum selesai dibuat */
  function cancelPendingAngle() {
    var pa = App.pendingAngle;
    if (!pa) return;
    var i = pa.vp.meas.indexOf(pa.m);
    if (i !== -1) pa.vp.meas.splice(i, 1);
    App.pendingAngle = null;
    pa.vp.drawAnn();
    refreshMeasList();
  }
  document.getElementById('btnHideOvl').addEventListener('click', function () {
    App.showOverlay = !App.showOverlay;
    document.getElementById('btnHideOvl').classList.toggle('on', !App.showOverlay);
    App.viewports.forEach(function (vp) { vp.overlay(); vp.drawAnn(); });
  });
  document.getElementById('btnSnap').addEventListener('click', function () {
    withActive(function (vp) {
      var out = document.createElement('canvas');
      out.width = vp.cv.width; out.height = vp.cv.height;
      var c = out.getContext('2d');
      c.drawImage(vp.cv, 0, 0);
      c.drawImage(vp.ann, 0, 0);
      out.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kaca-' + (App.study ? App.study.id : 'citra') + '-' + (vp.index + 1) + '.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      });
      K.toast('Gambar disimpan sebagai PNG.');
    });
  });
  document.getElementById('btnFull').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  });

  /* layout */
  K.qsa('.app-bar [data-layout]').forEach(function (b) {
    b.addEventListener('click', function () { App.layout = b.dataset.layout; applyLayout(); });
  });

  /* ---------- laci seri & panel untuk layar sempit ---------- */
  (function laci() {
    var scrim = document.getElementById('scrim');
    var pasangan = [
      [document.getElementById('btnSeries'), document.getElementById('seriesPanel')],
      [document.getElementById('btnPanel'), document.getElementById('sidePanel')]
    ];
    function tutupSemua() {
      pasangan.forEach(function (p) {
        if (p[1]) p[1].classList.remove('open');
        if (p[0]) p[0].setAttribute('aria-expanded', 'false');
      });
      if (scrim) scrim.hidden = true;
    }
    pasangan.forEach(function (p) {
      var btn = p[0], panel = p[1];
      if (!btn || !panel) return;
      btn.addEventListener('click', function () {
        var buka = !panel.classList.contains('open');
        tutupSemua();
        if (buka) {
          panel.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          if (scrim) scrim.hidden = false;
        }
      });
    });
    if (scrim) scrim.addEventListener('click', tutupSemua);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupSemua(); });
    /* memilih seri di ponsel langsung menutup laci */
    var sl = document.getElementById('seriesList');
    if (sl) sl.addEventListener('click', function () {
      if (window.matchMedia('(max-width:900px)').matches) tutupSemua();
    });
    App.tutupLaci = tutupSemua;
  })();

  /* ---------- aksesibilitas: label untuk tombol berikon ---------- */
  K.qsa('#toolrail .trbtn').forEach(function (b) {
    if (b.dataset.tip && !b.getAttribute('aria-label')) b.setAttribute('aria-label', b.dataset.tip);
    if (b.dataset.tool) b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
  });
  K.qsa('.iconbtn[title]').forEach(function (b) {
    if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.getAttribute('title'));
  });
  K.qsa('.tabbar button').forEach(function (b) {
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', b.classList.contains('on') ? 'true' : 'false');
  });
  var tb = document.querySelector('.tabbar');
  if (tb) tb.setAttribute('role', 'tablist');

  /* tab panel kanan */
  K.qsa('.tabbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      K.qsa('.tabbar button').forEach(function (x) {
        x.classList.remove('on');
        x.setAttribute('aria-selected', 'false');
      });
      K.qsa('.tabpane').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      b.setAttribute('aria-selected', 'true');
      document.getElementById('tab-' + b.dataset.tab).classList.add('on');
    });
  });

  /* preset W/L — daftarnya menyesuaikan modalitas yang sedang dibuka */
  var presetHost = document.getElementById('presets');
  var presetMode = null;

  function buildPresets(modality) {
    var mode = (modality || '').toUpperCase() === 'CT' ? 'CT' : 'REL';
    if (mode === presetMode) return;
    presetMode = mode;
    var list = presetsFor(modality);
    presetHost.innerHTML = list.map(function (p) {
      var sub = p.wc !== undefined && p.wc !== null ? 'C ' + p.wc + ' / W ' + p.ww
        : p.rel ? (p.note || Math.round(p.rel * 100) + '% rentang')
        : 'dari header';
      return '<button class="preset" data-p="' + p.n + '"><b>' + p.n + '</b><span>' + sub + '</span></button>';
    }).join('');
    K.qsa('#presets .preset').forEach(function (b) {
      b.addEventListener('click', function () {
        withActive(function (vp) {
          var p = presetsFor(App.study && App.study.modality)
            .filter(function (x) { return x.n === b.dataset.p; })[0];
          if (!p) return;
          vp.preset = p.n;
          if (p.wc !== undefined && p.wc !== null) {
            vp.ww = p.ww; vp.wc = p.wc;
          } else if (p.rel) {
            var span = Math.max(1, vp.img.max - vp.img.min);
            vp.ww = span * p.rel;
            vp.wc = (vp.img.max + vp.img.min) / 2 + span * (p.shift || 0);
          } else {
            vp.ww = vp.img.windowWidth; vp.wc = vp.img.windowCenter;
          }
          vp.draw(); syncPanels();
        });
      });
    });
  }
  buildPresets('CT');

  /* colormap */
  var cmapHost = document.getElementById('cmaps');
  cmapHost.innerHTML = CMAPS.map(function (c) {
    return '<button class="preset" data-c="' + (c.v || '') + '"><b>' + c.n + '</b></button>';
  }).join('');
  K.qsa('#cmaps .preset').forEach(function (b) {
    b.addEventListener('click', function () {
      withActive(function (vp) { vp.colormap = b.dataset.c || null; vp.draw(); syncPanels(); });
    });
  });

  /* slider */
  document.getElementById('rWW').addEventListener('input', function (e) {
    withActive(function (vp) { vp.ww = +e.target.value; vp.preset = 'Manual'; vp.draw(); syncPanels(); });
  });
  document.getElementById('rWL').addEventListener('input', function (e) {
    withActive(function (vp) { vp.wc = +e.target.value; vp.preset = 'Manual'; vp.draw(); syncPanels(); });
  });
  document.getElementById('swInvert').addEventListener('change', function (e) {
    withActive(function (vp) { vp.invert = e.target.checked; vp.draw(); });
  });
  document.getElementById('swSmooth').addEventListener('change', function (e) {
    App.smooth = e.target.checked;
    App.viewports.forEach(function (vp) { vp.draw(); });
  });
  document.getElementById('swSync').addEventListener('change', function (e) { App.sync = e.target.checked; });
  document.getElementById('rFps').addEventListener('input', function (e) {
    App.cine.fps = +e.target.value;
    document.getElementById('vFps').textContent = e.target.value;
    if (App.cine.playing) cineToggle(true);
  });

  /* cine */
  document.getElementById('cinePlay').addEventListener('click', function () { cineToggle(); });
  document.getElementById('cinePrev').addEventListener('click', function () {
    withActive(function (vp) { gotoIndex(vp, vp.index - 1); });
  });
  document.getElementById('cineNext').addEventListener('click', function () {
    withActive(function (vp) { gotoIndex(vp, vp.index + 1); });
  });
  document.getElementById('frameSlider').addEventListener('input', function (e) {
    withActive(function (vp) { gotoIndex(vp, +e.target.value); });
  });

  /* buka berkas langsung dari viewer */
  document.getElementById('btnOpenLocal').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    loader(true, 'Membaca ' + files.length + ' berkas…');
    var recs = [], done = 0;
    files.forEach(function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var ds = window.DICOM.parse(fr.result);
          if (ds.has('00280010')) {
            recs.push({
              studyUID: ds.string('0020000D') || 'LOCAL',
              seriesUID: ds.string('0020000E') || 'S1',
              instance: parseInt(ds.string('00200013') || '0', 10) || 0,
              seriesNumber: parseInt(ds.string('00200011') || '0', 10) || 0,
              seriesDesc: ds.string('0008103E') || '',
              patient: K.fmtName(ds.string('00100010')),
              patientId: ds.string('00100020') || '—',
              sex: ds.string('00100040') || '', age: ds.string('00101010') || '',
              modality: (ds.string('00080060') || '??').trim(),
              studyDesc: ds.string('00081030') || 'Studi lokal',
              bodyPart: ds.string('00180015') || '—',
              date: ds.string('00080020') || '', time: ds.string('00080030') || '',
              accession: ds.string('00080050') || '—',
              buf: fr.result, _ds: ds
            });
          }
        } catch (err) {}
        if (++done === files.length) finish();
      };
      fr.onerror = function () { if (++done === files.length) finish(); };
      fr.readAsArrayBuffer(f);
    });
    function finish() {
      loader(false);
      if (!recs.length) { K.toast('Tidak ada berkas DICOM valid yang bisa dibaca.', 'err'); return; }
      App.viewports.forEach(function (vp) { vp.series = null; vp.img = null; vp.meas = []; });
      mountStudy(buildLocalStudy(recs));
      K.toast(recs.length + ' citra dimuat dari berkas lokal.');
    }
  });

  /* ==========================================================
     Laporan
     ========================================================== */
  var CHIPS = ['Tidak tampak kelainan', 'Corakan bronkovaskular normal', 'Sinus costophrenicus lancip',
    'Cor tidak membesar (CTR < 50%)', 'Tidak tampak infiltrat', 'Sistem ventrikel normal',
    'Tidak tampak lesi fokal', 'Tulang intak'];
  var chipHost = document.getElementById('chipFindings');
  chipHost.innerHTML = CHIPS.map(function (c) { return '<span class="chip">' + c + '</span>'; }).join('');
  K.qsa('#chipFindings .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var ta = document.getElementById('repFindings');
      ta.value = (ta.value ? ta.value.replace(/\s*$/, '') + '\n' : '') + '- ' + c.textContent;
      ta.focus();
    });
  });

  function reportKey() { return 'report.' + (App.study ? App.study.id : 'none'); }
  function studyId() { return App.study ? String(App.study.id).replace(/[/\\]/g, '_') : 'none'; }

  function isiFormLaporan(r) {
    document.getElementById('repClinical').value = (r && r.clinical) || '';
    document.getElementById('repFindings').value = (r && r.findings) || '';
    document.getElementById('repImpression').value = (r && r.impression) || '';
    document.getElementById('repStatus').value = (r && r.status) || 'Draf';
  }

  /* Muat laporan: dari Firestore bila memakai akun, jika tidak dari peramban.
     Salinan lokal tetap ditulis agar laporan bisa dibuka saat luring. */
  function loadReport() {
    isiFormLaporan(K.store.get(reportKey(), null));
    var fb = App.sesi && App.sesi.fb;
    if (!fb || !fb.user || !App.study) { tandaiLaporan(null); return; }
    fb.ambilLaporan(studyId()).then(function (r) {
      if (r) { isiFormLaporan(r); K.store.set(reportKey(), r); }
      tandaiLaporan(true, r && r.updatedAt ? r : null);
    }).catch(function (err) {
      tandaiLaporan(false, null, fb.pesanGalat(err));
    });
  }

  function tandaiLaporan(ok, data, pesan) {
    var el = document.getElementById('repSync');
    if (!el) return;
    if (ok === null) {
      el.className = 'sync-dot off';
      el.innerHTML = '<i></i>Mode tamu — laporan hanya di peramban ini';
    } else if (ok) {
      el.className = 'sync-dot on';
      el.innerHTML = '<i></i>Tersinkron' + (data && data.by ? ' · terakhir oleh ' + esc(data.by) : '');
    } else {
      el.className = 'sync-dot off';
      el.innerHTML = '<i></i>Gagal sinkron: ' + esc(pesan || '');
    }
  }

  document.getElementById('btnSaveRep').addEventListener('click', function () {
    if (!App.study) return;
    var data = {
      clinical: document.getElementById('repClinical').value,
      findings: document.getElementById('repFindings').value,
      impression: document.getElementById('repImpression').value,
      status: document.getElementById('repStatus').value,
      patient: (App.study.patient && App.study.patient.name) || '',
      savedAt: new Date().toISOString(),
      by: namaPembaca()
    };
    K.store.set(reportKey(), data);

    var fb = App.sesi && App.sesi.fb;
    if (fb && fb.user) {
      var btn = this;
      btn.disabled = true; btn.textContent = 'Menyimpan…';
      fb.simpanLaporan(studyId(), data).then(function () {
        K.toast('Laporan tersimpan dan tersinkron ke akun Anda.');
        tandaiLaporan(true, data);
      }).catch(function (err) {
        K.toast('Tersimpan lokal, gagal sinkron: ' + fb.pesanGalat(err), 'warn');
        tandaiLaporan(false, null, fb.pesanGalat(err));
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Simpan Laporan';
      });
    } else {
      K.toast('Laporan tersimpan di peramban ini.');
    }
  });

  function namaPembaca() {
    return (App.sesi && App.sesi.pembaca && !App.sesi.pembaca.tamu)
      ? App.sesi.pembaca.nama : 'Mode tamu';
  }
  document.getElementById('btnCopyRep').addEventListener('click', function () {
    var st = App.study || {};
    var txt = [
      'LAPORAN RADIOLOGI (PROTOTIPE — BUKAN DOKUMEN MEDIS)',
      '===================================================',
      'Pasien   : ' + (st.patient ? st.patient.name : '—') + '  (' + (st.patient ? st.patient.id : '—') + ')',
      'Studi    : ' + (st.desc || '—') + ' [' + (st.modality || '') + ']',
      'Tanggal  : ' + K.fmtDate(st.date) + ' ' + K.fmtTime(st.time),
      'Accession: ' + (st.accession || '—'),
      '',
      'KLINIS:', document.getElementById('repClinical').value || '—',
      '', 'TEMUAN:', document.getElementById('repFindings').value || '—',
      '', 'KESAN:', document.getElementById('repImpression').value || '—',
      '', 'Status: ' + document.getElementById('repStatus').value,
      'Pembaca: ' + namaPembaca()
    ].join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () { K.toast('Teks laporan disalin.'); },
        function () { K.toast('Gagal menyalin.', 'err'); });
    } else K.toast('Clipboard tidak tersedia di peramban ini.', 'warn');
  });

  /* ==========================================================
     Papan ketik
     ========================================================== */
  document.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var vp = App.viewports[App.active];
    var map = { w: 'wwwc', p: 'pan', z: 'zoom', s: 'stack', l: 'length', a: 'angle', r: 'rect', e: 'ellipse', d: 'probe', t: 'note' };
    var k = e.key.toLowerCase();
    if (map[k]) {
      var b = document.querySelector('#toolrail [data-tool="' + map[k] + '"]');
      if (b) b.click();
      return;
    }
    if (k === 'i') { document.getElementById('btnInvert').click(); return; }
    if (k === 'f') { document.getElementById('btnFit').click(); return; }
    if (k === 'h') { document.getElementById('btnHideOvl').click(); return; }
    if (k === '0') { document.getElementById('btnReset').click(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (vp) gotoIndex(vp, vp.index + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (vp) gotoIndex(vp, vp.index - 1); }
    if (e.key === ' ') { e.preventDefault(); cineToggle(); }
    if (e.key === 'Escape') {
      cancelPendingAngle();
      if (document.fullscreenElement) document.exitFullscreen();
    }
    if (['1', '2', '3', '4'].indexOf(e.key) !== -1) {
      var L = { '1': '1x1', '2': '1x2', '3': '1x3', '4': '2x2' }[e.key];
      App.layout = L; applyLayout();
    }
  });

  /* ==========================================================
     Boot
     ========================================================== */
  App.layout = K.store.get('vw.layout', '1x1');
  applyLayout();
  document.getElementById('measHint').textContent = 'Alat aktif: Window / Level.';

  var params = new URLSearchParams(location.search);
  var demoId = params.get('demo'), localUid = params.get('local');

  loader(true, 'Memeriksa sesi…');
  window.KAUTH.jaga().then(function (ses) {
    App.sesi = ses;
    window.KAUTH.pasangChip(document.getElementById('userChip'), ses.pembaca);

    if (localUid && window.KDB) {
      loader(true, 'Memuat berkas lokal…');
      return window.KDB.byStudy(localUid).then(function (recs) {
        loader(false);
        if (!recs.length) {
          K.toast('Berkas lokal tidak ditemukan, memuat studi demo.', 'warn');
          mountStudy(buildDemoStudy(null));
          return;
        }
        mountStudy(buildLocalStudy(recs));
      }).catch(function () {
        loader(false);
        mountStudy(buildDemoStudy(null));
      });
    }
    loader(false);
    mountStudy(buildDemoStudy(demoId));
  }).catch(function (err) {
    loader(false);
    console.warn('Init viewer:', err);
    mountStudy(buildDemoStudy(demoId));
  });
})();
