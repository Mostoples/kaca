/* ==========================================================
   MEDIVOX — volume 3D: MPR, MIP, dan proyeksi ray-cast
   ----------------------------------------------------------
   Menyusun tumpukan irisan 2D menjadi satu volume, lalu
   menyediakan tiga hal:

     1. MPR   — potongan aksial / koronal / sagital
     2. MIP   — proyeksi intensitas maksimum pada slab setebal
                n milimeter
     3. Proyeksi — ray-cast dari arah bebas (azimut & elevasi),
                dipakai tampilan 3D dan halaman prisma hologram

   Yang dikembalikan selalu berbentuk objek "img" yang sama
   dengan keluaran DICOM.readPixels(), sehingga viewer bisa
   merendernya tanpa jalur khusus: window/level, peta warna,
   pengukuran dalam mm, dan cine semuanya berlaku apa adanya.

   Nilai voxel disimpan sebagai Int16Array berisi nilai yang
   SUDAH direscale (mis. HU untuk CT), dibulatkan ke bilangan
   bulat. Itu memangkas memori setengah dibanding Float32 dan
   cukup untuk semua modalitas yang ditangani aplikasi ini.
   ========================================================== */
(function (global) {
  'use strict';

  /* Batas aman voxel. Di atas ini volume dikecilkan di bidang
     irisan (bukan pada arah z, karena resolusi z justru yang
     paling menentukan mutu MPR). 40 juta voxel ≈ 80 MB. */
  var MAKS_VOXEL = 40e6;

  var BIDANG = ['axial', 'coronal', 'sagittal'];
  var NAMA_BIDANG = { axial: 'Aksial', coronal: 'Koronal', sagittal: 'Sagital' };

  function klem(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ==========================================================
     Menyusun volume
     ========================================================== */
  function bangun(series, opsi) {
    opsi = opsi || {};
    var lapor = opsi.lapor || function () {};

    if (!series) return Promise.reject(new Error('Seri tidak ada.'));
    if (series.count < 4) {
      return Promise.reject(new Error(
        'Seri ini hanya punya ' + series.count + ' citra — volume butuh setidaknya 4 irisan.'));
    }

    var irisan = [];
    var i = 0;

    /* Dimuat berurutan, bukan paralel: untuk berkas lokal setiap
       getImage() mengurai berkas baru, jadi urutan menjaga pemakaian
       memori tetap dapat diperkirakan dan kemajuannya bisa dilaporkan. */
    function berikut() {
      if (i >= series.count) return Promise.resolve();
      var k = i++;
      return series.getImage(k).then(function (img) {
        if (img && img.pixels && !img.unsupported && img.samplesPerPixel === 1) {
          irisan.push({ img: img, urutan: k });
        }
        lapor(k + 1, series.count);
        return berikut();
      }, function () { lapor(k + 1, series.count); return berikut(); });
    }

    return berikut().then(function () { return susun(irisan, series); });
  }

  /* posisi irisan sepanjang normal bidang citra, dalam mm */
  function posisiIrisan(img) {
    if (img.imagePosition && img.imageOrientation) {
      var o = img.imageOrientation, p = img.imagePosition;
      /* normal = baris × kolom */
      var n = [
        o[1] * o[5] - o[2] * o[4],
        o[2] * o[3] - o[0] * o[5],
        o[0] * o[4] - o[1] * o[3]
      ];
      var d = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
      if (isFinite(d)) return d;
    }
    if (img.sliceLocation !== undefined && isFinite(img.sliceLocation)) return img.sliceLocation;
    return null;
  }

  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function susun(irisan, series) {
    if (irisan.length < 4) {
      throw new Error('Hanya ' + irisan.length + ' irisan yang bisa dibaca — tidak cukup untuk volume. ' +
        'Seri terkompresi (JPEG 2000 / RLE) dan seri berwarna belum bisa dijadikan volume.');
    }

    /* buang irisan yang matriksnya berbeda dari mayoritas */
    var acuan = irisan[0].img;
    irisan = irisan.filter(function (s) {
      return s.img.rows === acuan.rows && s.img.cols === acuan.cols;
    });
    if (irisan.length < 4) throw new Error('Matriks citra tidak seragam di seri ini.');

    /* urutkan: posisi geometris bila ada, kalau tidak nomor instance */
    var adaPosisi = irisan.every(function (s) { return posisiIrisan(s.img) !== null; });
    if (adaPosisi) {
      irisan.forEach(function (s) { s.pos = posisiIrisan(s.img); });
      irisan.sort(function (a, b) { return a.pos - b.pos; });
    } else {
      irisan.sort(function (a, b) {
        var ia = a.img.instanceNumber, ib = b.img.instanceNumber;
        if (ia !== undefined && ib !== undefined && ia !== ib) return ia - ib;
        return a.urutan - b.urutan;
      });
    }

    /* jarak antar irisan */
    var sz;
    if (adaPosisi) {
      var beda = [];
      for (var j = 1; j < irisan.length; j++) {
        var d = Math.abs(irisan[j].pos - irisan[j - 1].pos);
        if (d > 1e-4) beda.push(d);
      }
      sz = median(beda);
    }
    if (!sz || !isFinite(sz)) sz = acuan.spacingBetweenSlices || acuan.sliceThickness || 0;
    if (!sz || !isFinite(sz)) sz = acuan.pixelSpacing && acuan.pixelSpacing[0] ? acuan.pixelSpacing[0] : 1;

    var sy = (acuan.pixelSpacing && acuan.pixelSpacing[0]) || 1;
    var sx = (acuan.pixelSpacing && acuan.pixelSpacing[1]) || sy;

    /* kecilkan di bidang irisan bila volumenya terlalu besar */
    var langkah = 1;
    while ((Math.ceil(acuan.cols / langkah) * Math.ceil(acuan.rows / langkah) * irisan.length) > MAKS_VOXEL) {
      langkah++;
    }
    var nx = Math.ceil(acuan.cols / langkah);
    var ny = Math.ceil(acuan.rows / langkah);
    var nz = irisan.length;

    var data = new Int16Array(nx * ny * nz);
    var min = Infinity, maks = -Infinity;

    for (var z = 0; z < nz; z++) {
      var img = irisan[z].img;
      var px = img.pixels, slope = img.slope, inter = img.intercept;
      var cols = img.cols;
      var dasar = z * nx * ny;
      for (var y = 0; y < ny; y++) {
        var srcY = y * langkah;
        var barisSrc = srcY * cols;
        var barisDst = dasar + y * nx;
        for (var x = 0; x < nx; x++) {
          var v = px[barisSrc + x * langkah] * slope + inter;
          v = v < -32768 ? -32768 : v > 32767 ? 32767 : Math.round(v);
          data[barisDst + x] = v;
          if (v < min) min = v;
          if (v > maks) maks = v;
        }
      }
      irisan[z].img = null;      /* lepaskan rujukan; volume sudah punya datanya */
    }
    if (min === Infinity) { min = 0; maks = 1; }

    return new Volume({
      data: data, nx: nx, ny: ny, nz: nz,
      spacing: [sx * langkah, sy * langkah, sz],
      min: min, max: maks,
      windowCenter: acuan.windowCenter, windowWidth: acuan.windowWidth,
      modality: acuan.modality, rescaleType: acuan.rescaleType,
      desc: (series.desc || 'Seri') , seriesNumber: series.number || 1,
      turun: langkah
    });
  }

  /* ==========================================================
     Volume
     ========================================================== */
  function Volume(o) {
    this.data = o.data;
    this.nx = o.nx; this.ny = o.ny; this.nz = o.nz;
    /* spacing dalam mm: [x (kolom), y (baris), z (antar irisan)] */
    this.spacing = o.spacing;
    this.min = o.min; this.max = o.max;
    this.modality = o.modality || '';
    this.rescaleType = o.rescaleType || '';
    this.desc = o.desc;
    this.seriesNumber = o.seriesNumber;
    this.turun = o.turun || 1;

    var lebar = o.windowWidth, pusat = o.windowCenter;
    if (!lebar || !isFinite(lebar) || lebar <= 0) {
      lebar = Math.max(1, this.max - this.min);
      pusat = (this.max + this.min) / 2;
    }
    this.windowWidth = lebar;
    this.windowCenter = pusat;
  }

  Volume.prototype.voxel = function () { return this.nx * this.ny * this.nz; };
  Volume.prototype.ukuranMM = function () {
    return [this.nx * this.spacing[0], this.ny * this.spacing[1], this.nz * this.spacing[2]];
  };
  Volume.prototype.info = function () {
    var mm = this.ukuranMM();
    return this.nx + '×' + this.ny + '×' + this.nz + ' voxel · ' +
      mm.map(function (v) { return Math.round(v); }).join(' × ') + ' mm · ' +
      this.spacing.map(function (v) { return v.toFixed(2); }).join(' / ') + ' mm' +
      (this.turun > 1 ? ' · dikecilkan ' + this.turun + '×' : '');
  };

  /* jumlah potongan yang tersedia pada satu bidang */
  Volume.prototype.jumlah = function (bidang) {
    return bidang === 'coronal' ? this.ny : bidang === 'sagittal' ? this.nx : this.nz;
  };

  /* bentuk keluaran satu bidang: [kolom, baris, spacing baris, spacing kolom] */
  Volume.prototype.bentuk = function (bidang) {
    var s = this.spacing;
    if (bidang === 'coronal')  return { cols: this.nx, rows: this.nz, sRow: s[2], sCol: s[0] };
    if (bidang === 'sagittal') return { cols: this.ny, rows: this.nz, sRow: s[2], sCol: s[1] };
    return { cols: this.nx, rows: this.ny, sRow: s[1], sCol: s[0] };
  };

  /* objek img-like supaya viewer bisa langsung merendernya */
  Volume.prototype.jadikanImg = function (bentuk, pixels, label, tebalMM) {
    return {
      rows: bentuk.rows, cols: bentuk.cols, frames: 1, frame: 0,
      samplesPerPixel: 1, bitsAllocated: 16, signed: true,
      photometric: 'MONOCHROME2',
      modality: this.modality, rescaleType: this.rescaleType,
      planar: 0, slope: 1, intercept: 0,
      windowCenter: this.windowCenter, windowWidth: this.windowWidth,
      pixelSpacing: [bentuk.sRow, bentuk.sCol],
      sliceThickness: tebalMM || this.spacing[2],
      pixels: pixels, min: this.min, max: this.max,
      encapsulated: false, mime: null, blobBytes: null,
      derived: label
    };
  };

  /* ----------------------------------------------------------
     MPR — satu potongan tipis
     ----------------------------------------------------------
     Untuk koronal dan sagital, arah z dibalik supaya bagian
     superior berada di atas gambar seperti kebiasaan pembacaan.
     ---------------------------------------------------------- */
  Volume.prototype.irisan = function (bidang, indeks) {
    return this.slab(bidang, indeks, indeks, 'tengah');
  };

  /* ----------------------------------------------------------
     Slab: gabungkan beberapa potongan dengan satu operasi
     mode: 'maks' (MIP) · 'min' (MinIP) · 'rerata' · 'tengah'
     ---------------------------------------------------------- */
  Volume.prototype.slab = function (bidang, dari, sampai, mode) {
    var nx = this.nx, ny = this.ny, nz = this.nz, data = this.data;
    var nxny = nx * ny;
    var batas = this.jumlah(bidang) - 1;
    dari = klem(Math.round(dari), 0, batas);
    sampai = klem(Math.round(sampai), 0, batas);
    if (sampai < dari) { var t = dari; dari = sampai; sampai = t; }

    var b = this.bentuk(bidang);
    var keluar = new Int16Array(b.cols * b.rows);
    var jml = sampai - dari + 1;
    var tengah = (dari + sampai) >> 1;
    var maksMode = mode === 'maks', minMode = mode === 'min', rerataMode = mode === 'rerata';

    var x, y, z, r, c, akum, nilai, i;

    if (bidang === 'axial') {
      for (r = 0; r < b.rows; r++) {
        for (c = 0; c < b.cols; c++) {
          if (mode === 'tengah') { keluar[r * b.cols + c] = data[tengah * nxny + r * nx + c]; continue; }
          akum = maksMode ? -32768 : minMode ? 32767 : 0;
          for (z = dari; z <= sampai; z++) {
            nilai = data[z * nxny + r * nx + c];
            if (maksMode) { if (nilai > akum) akum = nilai; }
            else if (minMode) { if (nilai < akum) akum = nilai; }
            else akum += nilai;
          }
          keluar[r * b.cols + c] = rerataMode ? Math.round(akum / jml) : akum;
        }
      }
    } else if (bidang === 'coronal') {
      for (r = 0; r < b.rows; r++) {
        z = nz - 1 - r;                       /* superior di atas */
        for (c = 0; c < b.cols; c++) {
          if (mode === 'tengah') { keluar[r * b.cols + c] = data[z * nxny + tengah * nx + c]; continue; }
          akum = maksMode ? -32768 : minMode ? 32767 : 0;
          for (y = dari; y <= sampai; y++) {
            nilai = data[z * nxny + y * nx + c];
            if (maksMode) { if (nilai > akum) akum = nilai; }
            else if (minMode) { if (nilai < akum) akum = nilai; }
            else akum += nilai;
          }
          keluar[r * b.cols + c] = rerataMode ? Math.round(akum / jml) : akum;
        }
      }
    } else {                                  /* sagittal */
      for (r = 0; r < b.rows; r++) {
        z = nz - 1 - r;
        for (c = 0; c < b.cols; c++) {        /* c = y, anterior → posterior */
          if (mode === 'tengah') { keluar[r * b.cols + c] = data[z * nxny + c * nx + tengah]; continue; }
          akum = maksMode ? -32768 : minMode ? 32767 : 0;
          for (x = dari; x <= sampai; x++) {
            nilai = data[z * nxny + c * nx + x];
            if (maksMode) { if (nilai > akum) akum = nilai; }
            else if (minMode) { if (nilai < akum) akum = nilai; }
            else akum += nilai;
          }
          keluar[r * b.cols + c] = rerataMode ? Math.round(akum / jml) : akum;
        }
      }
    }

    var tebalVoxel = bidang === 'coronal' ? this.spacing[1]
                   : bidang === 'sagittal' ? this.spacing[0] : this.spacing[2];
    return this.jadikanImg(b, keluar,
      (mode === 'tengah' ? 'MPR ' : mode === 'maks' ? 'MIP ' : mode === 'min' ? 'MinIP ' : 'Rerata ') +
      NAMA_BIDANG[bidang].toLowerCase(), jml * tebalVoxel);
  };

  /* tebal slab dalam mm → jumlah potongan pada bidang tertentu */
  Volume.prototype.potonganUntukMM = function (bidang, mm) {
    var s = bidang === 'coronal' ? this.spacing[1]
          : bidang === 'sagittal' ? this.spacing[0] : this.spacing[2];
    return Math.max(1, Math.round((mm || 10) / (s || 1)));
  };

  /* ==========================================================
     Proyeksi ray-cast
     ----------------------------------------------------------
     Kamera mengorbit sumbu panjang tubuh (z). azimut memutar
     mengelilingi pasien, elevasi menaik-turunkan pandangan.

     mode:
       'maks'     MIP — nilai tertinggi sepanjang sinar (Int16)
       'rerata'   mirip radiograf digital (Int16)
       'komposit' volume rendering dengan opasitas (RGB 8 bit)
     ========================================================== */
  function silangi(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalkan(v) {
    var p = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / p, v[1] / p, v[2] / p];
  }

  Volume.prototype.proyeksi = function (o) {
    o = o || {};
    var ukuran = Math.max(32, Math.round(o.ukuran || 256));
    var az = o.azimut || 0, el = o.elevasi || 0;
    var mode = o.mode || 'maks';
    var mutu = klem(o.mutu || 1, 0.25, 3);

    var nx = this.nx, ny = this.ny, nz = this.nz, data = this.data;
    var sx = this.spacing[0], sy = this.spacing[1], sz = this.spacing[2];
    var nxny = nx * ny;
    var ex = nx * sx, ey = ny * sy, ez = nz * sz;

    /* arah pandang, kanan, dan atas dalam koordinat pasien (LPS) */
    var d = normalkan([Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)]);
    var kanan = silangi([0, 0, 1], d);
    if (Math.hypot(kanan[0], kanan[1], kanan[2]) < 1e-6) kanan = [1, 0, 0];
    kanan = normalkan(kanan);
    /* z pasien mengarah ke superior, jadi cross(d, kanan) sudah
       menghasilkan "atas" = superior. Pada azimut 0 hasilnya adalah
       pandangan koronal dari depan dengan sisi kiri pasien di kanan
       gambar — sesuai kebiasaan pembacaan. */
    var atas = normalkan(silangi(d, kanan));

    var R = 0.5 * Math.sqrt(ex * ex + ey * ey + ez * ez);
    var fov = o.fov || Math.max(ex, ey, ez) * 1.06;
    var langkahMM = Math.min(sx, sy, sz) / mutu;

    /* semua perhitungan sinar dilakukan di ruang voxel supaya
       tidak ada pembagian di dalam loop terdalam */
    function keVoxel(w) {
      return [(w[0] + ex / 2) / sx - 0.5, (w[1] + ey / 2) / sy - 0.5, (w[2] + ez / 2) / sz - 0.5];
    }
    var dv = [d[0] * langkahMM / sx, d[1] * langkahMM / sy, d[2] * langkahMM / sz];

    var komposit = mode === 'komposit';
    var keluar = komposit ? new Uint8Array(ukuran * ukuran * 3) : new Int16Array(ukuran * ukuran);
    var latar = this.min;
    if (!komposit) keluar.fill(latar);

    /* transfer function untuk mode komposit */
    var ww = o.windowWidth || this.windowWidth, wc = o.windowCenter || this.windowCenter;
    var lo = wc - ww / 2, skala = 1 / (ww || 1);
    var gamma = o.gamma || 1.6;
    var kepadatan = (o.kepadatan || 1) * langkahMM / Math.max(sx, sy, sz);
    var cmap = (o.colormap && global.DICOM && global.DICOM.colormaps[o.colormap]) || null;

    for (var j = 0; j < ukuran; j++) {
      var py = (0.5 - (j + 0.5) / ukuran) * fov;
      for (var i = 0; i < ukuran; i++) {
        var px = ((i + 0.5) / ukuran - 0.5) * fov;

        var w0 = [
          px * kanan[0] + py * atas[0] - R * d[0],
          px * kanan[1] + py * atas[1] - R * d[1],
          px * kanan[2] + py * atas[2] - R * d[2]
        ];
        var p = keVoxel(w0);

        /* potong sinar pada kotak volume dulu (metode slab) supaya
           ruang kosong di luar volume tidak ditelusuri sama sekali */
        var t0 = 0, t1 = Math.ceil(2 * R / langkahMM);
        var lolos = true;
        for (var k = 0; k < 3; k++) {
          var n = k === 0 ? nx : k === 1 ? ny : nz;
          var lo_ = -0.5, hi_ = n - 0.5;
          if (Math.abs(dv[k]) < 1e-12) {
            if (p[k] < lo_ || p[k] > hi_) { lolos = false; break; }
            continue;
          }
          var ta = (lo_ - p[k]) / dv[k], tb = (hi_ - p[k]) / dv[k];
          if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { lolos = false; break; }
        }
        if (!lolos) continue;

        t0 = Math.max(0, Math.floor(t0));
        t1 = Math.ceil(t1);

        var cx = p[0] + dv[0] * t0, cy = p[1] + dv[1] * t0, cz = p[2] + dv[2] * t0;

        if (komposit) {
          var Ar = 0, Ag = 0, Ab = 0, A = 0;
          for (var t = t0; t <= t1 && A < 0.985; t++, cx += dv[0], cy += dv[1], cz += dv[2]) {
            var xi = cx + 0.5 | 0, yi = cy + 0.5 | 0, zi = cz + 0.5 | 0;
            if (xi < 0 || yi < 0 || zi < 0 || xi >= nx || yi >= ny || zi >= nz) continue;
            var v = data[zi * nxny + yi * nx + xi];
            var norm = (v - lo) * skala;
            if (norm <= 0) continue;
            if (norm > 1) norm = 1;
            var a = Math.pow(norm, gamma) * kepadatan;
            if (a <= 0) continue;
            if (a > 1) a = 1;
            var cr, cg, cb;
            if (cmap) { var w = cmap[(norm * 255) | 0]; cr = w[0]; cg = w[1]; cb = w[2]; }
            else { cr = cg = cb = norm * 255; }
            var sisa = (1 - A) * a;
            Ar += sisa * cr; Ag += sisa * cg; Ab += sisa * cb;
            A += sisa;
          }
          var o3 = (j * ukuran + i) * 3;
          keluar[o3] = Ar > 255 ? 255 : Ar;
          keluar[o3 + 1] = Ag > 255 ? 255 : Ag;
          keluar[o3 + 2] = Ab > 255 ? 255 : Ab;
        } else if (mode === 'rerata') {
          var jumlah = 0, n2 = 0;
          for (var t2 = t0; t2 <= t1; t2++, cx += dv[0], cy += dv[1], cz += dv[2]) {
            var xa = cx + 0.5 | 0, ya = cy + 0.5 | 0, za = cz + 0.5 | 0;
            if (xa < 0 || ya < 0 || za < 0 || xa >= nx || ya >= ny || za >= nz) continue;
            jumlah += data[za * nxny + ya * nx + xa]; n2++;
          }
          keluar[j * ukuran + i] = n2 ? Math.round(jumlah / n2) : latar;
        } else {
          var maks = -32768, ada = false;
          for (var t3 = t0; t3 <= t1; t3++, cx += dv[0], cy += dv[1], cz += dv[2]) {
            var xb = cx + 0.5 | 0, yb = cy + 0.5 | 0, zb = cz + 0.5 | 0;
            if (xb < 0 || yb < 0 || zb < 0 || xb >= nx || yb >= ny || zb >= nz) continue;
            var vb = data[zb * nxny + yb * nx + xb];
            if (vb > maks) maks = vb;
            ada = true;
          }
          keluar[j * ukuran + i] = ada ? maks : latar;
        }
      }
    }

    var pxmm = fov / ukuran;
    if (komposit) {
      return {
        rows: ukuran, cols: ukuran, frames: 1, frame: 0,
        samplesPerPixel: 3, bitsAllocated: 8, signed: false,
        photometric: 'RGB', planar: 0, slope: 1, intercept: 0,
        modality: this.modality, rescaleType: '',
        windowCenter: 128, windowWidth: 256,
        pixelSpacing: [pxmm, pxmm], sliceThickness: 0,
        pixels: keluar, min: 0, max: 255,
        encapsulated: false, mime: null, blobBytes: null,
        derived: 'Volume rendering'
      };
    }
    return this.jadikanImg({ rows: ukuran, cols: ukuran, sRow: pxmm, sCol: pxmm }, keluar,
      mode === 'maks' ? 'MIP 3D' : 'Proyeksi rerata', 0);
  };

  /* ==========================================================
     Pembungkus "series" — bentuknya sama dengan seri DICOM biasa
     sehingga panel seri, viewport, cine, dan pengukuran di viewer
     bisa memakainya tanpa perubahan apa pun.
     ========================================================== */
  function bungkus(o) {
    var cache = {};
    return {
      desc: o.desc, number: o.number, modality: o.modality,
      count: o.count, key: o.key, derived: true,
      getImage: function (i) {
        i = klem(Math.round(i), 0, o.count - 1);
        if (cache[i]) return Promise.resolve(cache[i]);
        var img;
        try { img = o.buat(i); } catch (e) { return Promise.reject(e); }
        cache[i] = img;
        return Promise.resolve(img);
      },
      getTags: function () { return o.tags || []; }
    };
  }

  /* MPR satu-satu potongan */
  Volume.prototype.seriMPR = function (bidang) {
    var self = this;
    return bungkus({
      desc: 'MPR ' + NAMA_BIDANG[bidang], number: 900 + BIDANG.indexOf(bidang),
      modality: this.modality, count: this.jumlah(bidang),
      key: 'MPR#' + bidang,
      buat: function (i) { return self.irisan(bidang, i); },
      tags: this.tagsTurunan('MPR ' + NAMA_BIDANG[bidang])
    });
  };

  /* MIP slab yang meluncur sepanjang bidang */
  Volume.prototype.seriMIP = function (bidang, tebalMM) {
    var self = this;
    var tebal = this.potonganUntukMM(bidang, tebalMM || 20);
    var total = this.jumlah(bidang);
    return bungkus({
      desc: 'MIP ' + NAMA_BIDANG[bidang] + ' ' + Math.round(tebalMM || 20) + 'mm',
      number: 910 + BIDANG.indexOf(bidang),
      modality: this.modality, count: total,
      key: 'MIP#' + bidang + '#' + tebal,
      buat: function (i) {
        var setengah = tebal >> 1;
        return self.slab(bidang, i - setengah, i - setengah + tebal - 1, 'maks');
      },
      tags: this.tagsTurunan('MIP ' + NAMA_BIDANG[bidang] + ' ' + Math.round(tebalMM || 20) + ' mm')
    });
  };

  /* Proyeksi berputar: indeks = sudut. Cine memutar volumenya. */
  Volume.prototype.seriProyeksi = function (o) {
    o = o || {};
    var self = this;
    var jml = o.jumlah || 36;
    var mode = o.mode || 'maks';
    var nama = mode === 'komposit' ? 'Volume 3D' : mode === 'rerata' ? 'Proyeksi rerata 3D' : 'MIP 3D';
    return bungkus({
      desc: nama + ' (' + jml + ' sudut)', number: 920,
      modality: this.modality, count: jml,
      key: 'VR#' + mode + '#' + jml + '#' + (o.ukuran || 256),
      buat: function (i) {
        return self.proyeksi({
          azimut: i / jml * Math.PI * 2,
          elevasi: o.elevasi || 0,
          mode: mode, ukuran: o.ukuran || 256, mutu: o.mutu || 1,
          windowCenter: o.windowCenter, windowWidth: o.windowWidth,
          colormap: o.colormap, gamma: o.gamma, kepadatan: o.kepadatan
        });
      },
      tags: this.tagsTurunan(nama)
    });
  };

  /* tag buatan untuk inspektur — ditandai jelas sebagai turunan */
  Volume.prototype.tagsTurunan = function (label) {
    var mm = this.ukuranMM();
    return [
      { tag: '(0008,0008)', key: '00080008', vr: 'CS', name: 'ImageType', value: 'DERIVED\\SECONDARY\\' + label.toUpperCase() },
      { tag: '(0008,2111)', key: '00082111', vr: 'ST', name: 'DerivationDescription',
        value: label + ' dihitung di peramban dari ' + this.nz + ' irisan seri "' + this.desc + '"' },
      { tag: '(0018,0050)', key: '00180050', vr: 'DS', name: 'SliceThickness', value: String(this.spacing[2]) },
      { tag: '(0028,0010)', key: '00280010', vr: 'US', name: 'Rows', value: String(this.ny) },
      { tag: '(0028,0011)', key: '00280011', vr: 'US', name: 'Columns', value: String(this.nx) },
      { tag: '(0028,0030)', key: '00280030', vr: 'DS', name: 'PixelSpacing',
        value: this.spacing[1] + '\\' + this.spacing[0] },
      { tag: '(0054,0410)', key: '00544010', vr: 'ST', name: 'VolumeDimensions',
        value: this.nx + '\\' + this.ny + '\\' + this.nz + ' voxel — ' +
               mm.map(function (v) { return v.toFixed(1); }).join('\\') + ' mm' }
    ];
  };

  global.VOLUME = {
    bangun: bangun,
    Volume: Volume,
    BIDANG: BIDANG,
    NAMA_BIDANG: NAMA_BIDANG
  };
})(window);
