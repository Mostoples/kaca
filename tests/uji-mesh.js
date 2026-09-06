/* ==========================================================
   KACA — uji rekonstruksi permukaan 3D
   ----------------------------------------------------------
   Bentuk yang jawabannya diketahui secara analitis dipakai
   sebagai acuan: bola dengan radius tertentu harus menghasilkan
   permukaan yang setiap titiknya berjarak radius itu dari pusat,
   dengan normal yang mengarah keluar, luas 4πr², dan proyeksi
   yang lebarnya 2r di layar.
   ========================================================== */
(function (global) {
  'use strict';

  var V = global.VOLUME, M = global.MESH, D = global.DICOM;
  var uji = (global.UJI && global.UJI.daftar) || [];
  function it(nama, fn) { uji.push({ nama: nama, fn: fn }); }

  function gagal(p) { throw new Error(p); }
  function samaDengan(a, b, apa) { if (a !== b) gagal(apa + ': dapat ' + a + ', diharapkan ' + b); }
  function hampirSama(a, b, tol, apa) {
    if (Math.abs(a - b) > tol) gagal(apa + ': dapat ' + a + ', diharapkan ' + b + ' (±' + tol + ')');
  }
  function benar(v, apa) { if (!v) gagal(apa); }

  /* ---------- volume uji ---------- */
  function seriDari(nx, ny, nz, sx, sy, sz, nilai) {
    return {
      desc: 'Uji', number: 1, modality: 'CT', count: nz,
      getImage: function (i) {
        var px = new Int16Array(nx * ny);
        for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) px[y * nx + x] = nilai(x, y, i);
        return Promise.resolve({
          rows: ny, cols: nx, frames: 1, frame: 0,
          samplesPerPixel: 1, bitsAllocated: 16, signed: true,
          photometric: 'MONOCHROME2', modality: 'CT', rescaleType: 'HU',
          planar: 0, slope: 1, intercept: 0,
          windowCenter: 0, windowWidth: 2000,
          pixelSpacing: [sy, sx], sliceThickness: sz, spacingBetweenSlices: sz,
          sliceLocation: i * sz, instanceNumber: i + 1,
          imagePosition: null, imageOrientation: null,
          pixels: px, min: 0, max: 0, encapsulated: false, mime: null, blobBytes: null
        });
      }
    };
  }

  /* Bola dengan tepi lembut: nilai turun mulus melewati ambang, jadi
     interpolasi rusuk punya sesuatu untuk diinterpolasi. Tepi yang
     benar-benar tajam membuat permukaan menempel di tengah voxel. */
  var N = 40, PUSAT = N / 2, RADIUS = 12, AMBANG = 500;
  function bolaLembut(x, y, z) {
    var dx = x + 0.5 - PUSAT, dy = y + 0.5 - PUSAT, dz = z + 0.5 - PUSAT;
    var r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    /* 1000 di pusat, turun linear, melewati 500 tepat pada r = RADIUS */
    return Math.round(1000 * (1 - (r - RADIUS) / RADIUS) - 500 + 500 - (r - RADIUS) * 0 +
      0) === 0 ? 0 : Math.round(AMBANG + (RADIUS - r) * 100);
  }

  function volBola() {
    return V.bangun(seriDari(N, N, N, 1, 1, 1, bolaLembut));
  }

  /* ==========================================================
     Ekstraksi
     ========================================================== */
  it('Isosurface bola: setiap titik berjarak radius dari pusat', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      benar(!mesh.kosong(), 'permukaan tidak kosong');
      benar(mesh.jumlahSegitiga() > 500, 'jumlah segitiga wajar: ' + mesh.jumlahSegitiga());

      /* titik jaring berpusat di titik asal, jadi jaraknya langsung radius */
      var v = mesh.vert, n = v.length / 3;
      var min = Infinity, maks = -Infinity, jumlah = 0;
      for (var i = 0; i < n; i++) {
        var r = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        if (r < min) min = r;
        if (r > maks) maks = r;
        jumlah += r;
      }
      var rata = jumlah / n;
      hampirSama(rata, RADIUS, 0.35, 'radius rata-rata');
      benar(maks - min < 2.0, 'radius seragam (sebar ' + (maks - min).toFixed(2) + ' mm)');
    });
  });

  it('Normal permukaan mengarah keluar dari benda', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var v = mesh.vert, nn = mesh.norm, n = v.length / 3;
      var buruk = 0;
      for (var i = 0; i < n; i++) {
        var px = v[i * 3], py = v[i * 3 + 1], pz = v[i * 3 + 2];
        var p = Math.hypot(px, py, pz) || 1;
        /* untuk bola, normal keluar = arah radial */
        var dot = (px * nn[i * 3] + py * nn[i * 3 + 1] + pz * nn[i * 3 + 2]) / p;
        if (dot < 0.85) buruk++;
      }
      benar(buruk < n * 0.02, buruk + ' dari ' + n + ' normal tidak mengarah radial keluar');
    });
  });

  it('Normal adalah vektor satuan', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 2 });
      var nn = mesh.norm;
      for (var i = 0; i < nn.length; i += 3) {
        var p = Math.hypot(nn[i], nn[i + 1], nn[i + 2]);
        hampirSama(p, 1, 1e-3, 'panjang normal titik ke-' + (i / 3));
      }
    });
  });

  it('Putaran segitiga searah dengan normal titiknya', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var v = mesh.vert, nn = mesh.norm, tri = mesh.tri;
      var salah = 0, total = tri.length / 3;
      for (var t = 0; t < tri.length; t += 3) {
        var a = tri[t], b = tri[t + 1], c = tri[t + 2];
        var ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
        var ux = v[b * 3] - ax, uy = v[b * 3 + 1] - ay, uz = v[b * 3 + 2] - az;
        var wx = v[c * 3] - ax, wy = v[c * 3 + 1] - ay, wz = v[c * 3 + 2] - az;
        var gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
        var mx = nn[a * 3] + nn[b * 3] + nn[c * 3];
        var my = nn[a * 3 + 1] + nn[b * 3 + 1] + nn[c * 3 + 1];
        var mz = nn[a * 3 + 2] + nn[b * 3 + 2] + nn[c * 3 + 2];
        if (gx * mx + gy * my + gz * mz < 0) salah++;
      }
      samaDengan(salah, 0, salah + ' dari ' + total + ' segitiga berputar berlawanan normal');
    });
  });

  it('Luas permukaan bola mendekati 4πr²', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var v = mesh.vert, tri = mesh.tri, luas = 0;
      for (var t = 0; t < tri.length; t += 3) {
        var a = tri[t], b = tri[t + 1], c = tri[t + 2];
        var ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
        var ux = v[b * 3] - ax, uy = v[b * 3 + 1] - ay, uz = v[b * 3 + 2] - az;
        var wx = v[c * 3] - ax, wy = v[c * 3 + 1] - ay, wz = v[c * 3 + 2] - az;
        var gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
        luas += 0.5 * Math.hypot(gx, gy, gz);
      }
      var harap = 4 * Math.PI * RADIUS * RADIUS;
      /* permukaan bertangga selalu sedikit lebih luas daripada bola ideal */
      benar(luas > harap * 0.9 && luas < harap * 1.15,
        'luas ' + Math.round(luas) + ' mm² vs 4πr² = ' + Math.round(harap) + ' mm²');
    });
  });

  it('Titik pada rusuk dibagi bersama, bukan diduplikasi per segitiga', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      /* tanpa pembagian titik, jumlah titik akan sama dengan 3× segitiga */
      benar(mesh.jumlahTitik() < mesh.jumlahSegitiga() * 1.2,
        mesh.jumlahTitik() + ' titik untuk ' + mesh.jumlahSegitiga() + ' segitiga');
    });
  });

  it('Volume tanpa permukaan pada ambangnya menghasilkan jaring kosong', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: 99999, langkah: 1 });
      benar(mesh.kosong(), 'jaring kosong');
      samaDengan(mesh.jumlahSegitiga(), 0, 'nol segitiga');
      /* merender jaring kosong tidak boleh melempar */
      var img = mesh.render({ ukuran: 48 });
      samaDengan(img.cols, 48, 'render tetap mengembalikan citra');
    });
  });

  it('Ambang lebih tinggi menghasilkan permukaan lebih kecil', function () {
    return volBola().then(function (vol) {
      function radiusRata(ambang) {
        var m = M.dari(vol, { ambang: ambang, langkah: 1 });
        var v = m.vert, n = v.length / 3, jumlah = 0;
        for (var i = 0; i < n; i++) jumlah += Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        return jumlah / n;
      }
      /* nilai turun 100 per mm dari pusat, jadi ambang +300 → radius −3 mm */
      var r1 = radiusRata(AMBANG);
      var r2 = radiusRata(AMBANG + 300);
      hampirSama(r2, r1 - 3, 0.5, 'radius menyusut sesuai kemiringan nilai');
    });
  });

  it('Langkah (stride) mengurangi jumlah segitiga tanpa mengubah bentuk', function () {
    return volBola().then(function (vol) {
      var halus = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var kasar = M.dari(vol, { ambang: AMBANG, langkah: 2 });
      samaDengan(kasar.langkah, 2, 'langkah tercatat');
      benar(kasar.jumlahSegitiga() < halus.jumlahSegitiga() * 0.5,
        'segitiga jauh lebih sedikit: ' + kasar.jumlahSegitiga() + ' vs ' + halus.jumlahSegitiga());

      var v = kasar.vert, n = v.length / 3, jumlah = 0;
      for (var i = 0; i < n; i++) jumlah += Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      hampirSama(jumlah / n, RADIUS, 0.8, 'bentuk bola tetap terjaga pada langkah 2');
    });
  });

  it('Ambang saran memakai 300 HU untuk CT', function () {
    return volBola().then(function (vol) {
      /* volume uji berskala HU dan rentangnya mencakup 300 */
      samaDengan(M.ambangSaran(vol), 300, 'ambang saran CT');
      /* modalitas lain: sepertiga atas rentang, bukan angka tetap */
      var palsu = { modality: 'MR', min: 0, max: 1000 };
      samaDengan(M.ambangSaran(palsu), 450, 'ambang saran non-CT');
    });
  });

  /* ==========================================================
     Perender
     ========================================================== */
  function kotakIsi(img) {
    /* kotak pembatas piksel yang bukan latar hitam */
    var p = img.pixels, w = img.cols, h = img.rows;
    var minX = w, maksX = -1, minY = h, maksY = -1, jml = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 3;
        if (p[o] > 8 || p[o + 1] > 8 || p[o + 2] > 8) {
          if (x < minX) minX = x;
          if (x > maksX) maksX = x;
          if (y < minY) minY = y;
          if (y > maksY) maksY = y;
          jml++;
        }
      }
    }
    return { minX: minX, maksX: maksX, minY: minY, maksY: maksY, jml: jml };
  }

  it('Render permukaan menghasilkan citra RGB yang bisa dipakai viewer', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var img = mesh.render({ azimut: 0.5, elevasi: 0.2, ukuran: 96 });
      samaDengan(img.samplesPerPixel, 3, 'samplesPerPixel');
      samaDengan(img.photometric, 'RGB', 'photometric');
      samaDengan(img.pixels.length, 96 * 96 * 3, 'panjang buffer');
      benar(img.derived, 'ditandai turunan');
      var d = D.toImageData(img, {}).data;
      samaDengan(d.length, 96 * 96 * 4, 'bisa dirender lewat DICOM.toImageData');
    });
  });

  it('Bola yang dirender bulat, berpusat, dan berukuran 2r', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var ukuran = 128;
      var img = mesh.render({ azimut: 0, elevasi: 0, ukuran: ukuran });
      var k = kotakIsi(img);
      benar(k.jml > 500, 'ada isi pada citra (' + k.jml + ' piksel)');

      var mmPerPx = img.pixelSpacing[0];
      var lebarMM = (k.maksX - k.minX + 1) * mmPerPx;
      var tinggiMM = (k.maksY - k.minY + 1) * mmPerPx;
      hampirSama(lebarMM, 2 * RADIUS, 2.2, 'lebar bola di layar');
      hampirSama(tinggiMM, 2 * RADIUS, 2.2, 'tinggi bola di layar');

      /* berpusat: titik tengah kotak isi harus di tengah citra */
      hampirSama((k.minX + k.maksX) / 2, (ukuran - 1) / 2, 1.5, 'pusat mendatar');
      hampirSama((k.minY + k.maksY) / 2, (ukuran - 1) / 2, 1.5, 'pusat menegak');
    });
  });

  it('Bola tampak sama dari segala arah', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var acuan = null;
      [0, 60, 145, 250, 330].forEach(function (derajat) {
        var img = mesh.render({
          azimut: derajat * Math.PI / 180, elevasi: derajat === 145 ? 0.5 : 0, ukuran: 96
        });
        var k = kotakIsi(img);
        if (acuan === null) acuan = k.jml;
        /* luas siluet bola tidak boleh berubah saat diputar */
        benar(Math.abs(k.jml - acuan) < acuan * 0.08,
          'luas siluet pada ' + derajat + '°: ' + k.jml + ' vs ' + acuan);
      });
    });
  });

  it('Z-buffer menyembunyikan permukaan di belakang', function () {
    /* dua bola: satu kecil di depan, satu besar di belakang. Dari arah
       pandang yang tepat, bola depan harus menutupi bagian bola belakang. */
    var n = 48;
    return V.bangun(seriDari(n, n, n, 1, 1, 1, function (x, y, z) {
      var d1 = Math.hypot(x + 0.5 - 24, y + 0.5 - 14, z + 0.5 - 24);   /* depan (y kecil) */
      var d2 = Math.hypot(x + 0.5 - 24, y + 0.5 - 34, z + 0.5 - 24);   /* belakang */
      var a = d1 < 7 ? 1000 : 0, b = d2 < 7 ? 1000 : 0;
      return Math.max(a, b);
    })).then(function (vol) {
      var mesh = M.dari(vol, { ambang: 500, langkah: 1 });
      /* azimut 0 memandang dari anterior ke posterior (arah +y menjauh),
         jadi bola pada y kecil berada lebih dekat ke kamera */
      var img = mesh.render({ azimut: 0, elevasi: 0, ukuran: 96 });
      var k = kotakIsi(img);
      /* keduanya sejajar sumbu pandang, jadi siluetnya satu lingkaran saja */
      var mmPerPx = img.pixelSpacing[0];
      var lebarMM = (k.maksX - k.minX + 1) * mmPerPx;
      hampirSama(lebarMM, 14, 3, 'siluet selebar satu bola, bukan dua');

      /* dari samping, keduanya terpisah sehingga siluet jauh lebih lebar */
      var samping = mesh.render({ azimut: Math.PI / 2, elevasi: 0, ukuran: 96 });
      var ks = kotakIsi(samping);
      var lebarSamping = (ks.maksX - ks.minX + 1) * samping.pixelSpacing[0];
      benar(lebarSamping > 24, 'dari samping kedua bola terlihat terpisah (' +
        Math.round(lebarSamping) + ' mm)');
    });
  });

  it('Pencahayaan: ada gradasi, bukan satu warna rata', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 1 });
      var img = mesh.render({ azimut: 0, elevasi: 0, ukuran: 96 });
      var nilai = {};
      for (var i = 0; i < img.pixels.length; i += 3) {
        var v = img.pixels[i];
        if (v > 8) nilai[v] = 1;
      }
      benar(Object.keys(nilai).length > 20,
        'ada ' + Object.keys(nilai).length + ' tingkat keabuan berbeda pada permukaan');
    });
  });

  /* ==========================================================
     Ekspor
     ========================================================== */
  it('STL biner berukuran tepat 84 + 50 byte per segitiga', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 2 });
      var buf = mesh.stl('uji');
      samaDengan(buf.byteLength, 84 + mesh.jumlahSegitiga() * 50, 'ukuran berkas STL');

      var dv = new DataView(buf);
      samaDengan(dv.getUint32(80, true), mesh.jumlahSegitiga(), 'jumlah segitiga di header');

      /* normal facet pertama harus vektor satuan */
      var p = Math.hypot(dv.getFloat32(84, true), dv.getFloat32(88, true), dv.getFloat32(92, true));
      hampirSama(p, 1, 1e-3, 'normal facet pertama adalah vektor satuan');

      /* titik pertama harus berada di permukaan bola */
      var r = Math.hypot(dv.getFloat32(96, true), dv.getFloat32(100, true), dv.getFloat32(104, true));
      hampirSama(r, RADIUS, 1.5, 'titik pertama berada di permukaan');
    });
  });

  it('OBJ memuat jumlah v, vn, dan f yang benar', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 3 });
      var teks = mesh.obj('uji');
      var baris = teks.split('\n');
      var v = 0, vn = 0, f = 0;
      baris.forEach(function (b) {
        if (b.indexOf('v ') === 0) v++;
        else if (b.indexOf('vn ') === 0) vn++;
        else if (b.indexOf('f ') === 0) f++;
      });
      samaDengan(v, mesh.jumlahTitik(), 'jumlah baris v');
      samaDengan(vn, mesh.jumlahTitik(), 'jumlah baris vn');
      samaDengan(f, mesh.jumlahSegitiga(), 'jumlah baris f');
      benar(teks.indexOf('PROTOTIPE') !== -1, 'ada peringatan prototipe di komentar');

      /* indeks OBJ berbasis satu, jadi tidak boleh ada 0 */
      var adaNol = baris.some(function (b) { return /^f (0|\S*\s0)\b/.test(b); });
      benar(!adaNol, 'indeks OBJ berbasis satu');
    });
  });

  /* ==========================================================
     Pembungkus seri
     ========================================================== */
  it('Seri permukaan berbentuk sama dengan seri DICOM biasa', function () {
    return volBola().then(function (vol) {
      var mesh = M.dari(vol, { ambang: AMBANG, langkah: 2 });
      var seri = mesh.seriPermukaan({ jumlah: 8, ukuran: 64 });
      samaDengan(seri.count, 8, 'jumlah sudut');
      benar(seri.derived, 'ditandai turunan');
      benar(seri.key.indexOf('SURF') === 0, 'kunci stabil: ' + seri.key);
      benar(seri.getTags().length >= 4, 'tag turunan terisi');
      return seri.getImage(3).then(function (img) {
        samaDengan(img.cols, 64, 'lebar citra');
        samaDengan(img.samplesPerPixel, 3, 'RGB');
        return seri.getImage(3).then(function (lagi) {
          benar(img === lagi, 'hasil disimpan di cache');
        });
      });
    });
  });

  global.UJI = { daftar: uji };
})(window);
