/* ==========================================================
   MEDIVOX — uji volume 3D (MPR, MIP, proyeksi ray-cast)
   ----------------------------------------------------------
   Volume uji dibuat dari seri sintetis yang nilai voxel-nya
   diketahui persis, sehingga setiap potongan, slab, dan sinar
   bisa dibandingkan dengan jawaban yang dihitung terpisah.

   Yang paling penting diperiksa di sini adalah geometri:
   urutan irisan, jarak antar irisan, pixel spacing per bidang,
   arah superior/inferior pada MPR, dan letak objek di layar
   pada berbagai azimut.
   ========================================================== */
(function (global) {
  'use strict';

  var V = global.VOLUME, D = global.DICOM;
  var uji = (global.UJI && global.UJI.daftar) || [];
  function it(nama, fn) { uji.push({ nama: nama, fn: fn }); }

  function gagal(p) { throw new Error(p); }
  function samaDengan(dapat, harap, apa) {
    if (dapat !== harap) gagal(apa + ': dapat ' + dapat + ', diharapkan ' + harap);
  }
  function hampirSama(dapat, harap, tol, apa) {
    if (Math.abs(dapat - harap) > tol) {
      gagal(apa + ': dapat ' + dapat + ', diharapkan ' + harap + ' (±' + tol + ')');
    }
  }
  function benar(v, apa) { if (!v) gagal(apa); }

  /* ----------------------------------------------------------
     Seri sintetis. nilai(x, y, z) menentukan isi voxel, jadi
     hasil ekstraksi bisa diperiksa tanpa menebak.
     ---------------------------------------------------------- */
  function seriUji(o) {
    var nx = o.nx, ny = o.ny, nz = o.nz;
    var sx = o.sx || 1, sy = o.sy || 1, sz = o.sz || 1;

    var urut = [];
    for (var z = 0; z < nz; z++) urut.push(z);
    if (o.balik) urut.reverse();

    return {
      desc: 'Seri uji', number: 1, modality: o.modality || 'CT', count: nz,
      getImage: function (i) {
        var zz = urut[i];
        var px = new Int16Array(nx * ny);
        for (var y = 0; y < ny; y++) {
          for (var x = 0; x < nx; x++) px[y * nx + x] = o.nilai(x, y, zz);
        }
        return Promise.resolve({
          rows: ny, cols: nx, frames: 1, frame: 0,
          samplesPerPixel: 1, bitsAllocated: 16, signed: true,
          photometric: 'MONOCHROME2', modality: o.modality || 'CT', rescaleType: 'HU',
          planar: 0, slope: o.slope || 1, intercept: o.intercept || 0,
          windowCenter: o.wc, windowWidth: o.ww,
          pixelSpacing: [sy, sx], sliceThickness: sz, spacingBetweenSlices: sz,
          sliceLocation: o.tanpaPosisi ? undefined : zz * sz,
          instanceNumber: zz + 1,
          imagePosition: null, imageOrientation: null,
          pixels: px, min: 0, max: 0, encapsulated: false, mime: null, blobBytes: null
        });
      }
    };
  }

  /* kode posisi: satu bilangan yang memuat x, y, dan z */
  function kode(x, y, z) { return z * 100 + y * 10 + x; }

  var NX = 6, NY = 5, NZ = 8;
  function volKode(extra) {
    var o = { nx: NX, ny: NY, nz: NZ, sx: 0.5, sy: 0.5, sz: 2, nilai: kode };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return V.bangun(seriUji(o));
  }

  /* ==========================================================
     Penyusunan volume
     ========================================================== */
  it('Volume: dimensi, jarak voxel, dan nilai tersusun benar', function () {
    return volKode().then(function (vol) {
      samaDengan(vol.nx, NX, 'nx');
      samaDengan(vol.ny, NY, 'ny');
      samaDengan(vol.nz, NZ, 'nz');
      hampirSama(vol.spacing[0], 0.5, 1e-9, 'spacing x (kolom)');
      hampirSama(vol.spacing[1], 0.5, 1e-9, 'spacing y (baris)');
      hampirSama(vol.spacing[2], 2, 1e-9, 'spacing z (antar irisan)');
      samaDengan(vol.turun, 1, 'tidak dikecilkan');

      for (var z = 0; z < NZ; z++) {
        for (var y = 0; y < NY; y++) {
          for (var x = 0; x < NX; x++) {
            samaDengan(vol.data[z * NX * NY + y * NX + x], kode(x, y, z),
              'voxel (' + x + ',' + y + ',' + z + ')');
          }
        }
      }
    });
  });

  it('Volume: irisan diurutkan ulang memakai SliceLocation', function () {
    /* seri diberikan dalam urutan terbalik — hasilnya harus tetap sama */
    return volKode({ balik: true }).then(function (vol) {
      hampirSama(vol.spacing[2], 2, 1e-9, 'jarak antar irisan tetap terbaca');
      for (var z = 0; z < NZ; z++) {
        samaDengan(vol.data[z * NX * NY], kode(0, 0, z), 'irisan ke-' + z + ' pada posisi benar');
      }
    });
  });

  it('Volume: tanpa geometri, urutan jatuh ke InstanceNumber', function () {
    return volKode({ balik: true, tanpaPosisi: true }).then(function (vol) {
      samaDengan(vol.nz, NZ, 'nz');
      hampirSama(vol.spacing[2], 2, 1e-9, 'jarak diambil dari SpacingBetweenSlices');
      for (var z = 0; z < NZ; z++) {
        samaDengan(vol.data[z * NX * NY], kode(0, 0, z), 'irisan ke-' + z + ' pada posisi benar');
      }
    });
  });

  it('Volume: rescale slope & intercept diterapkan saat penyusunan', function () {
    return V.bangun(seriUji({
      nx: 4, ny: 4, nz: 5, nilai: function (x, y, z) { return x + y + z; },
      slope: 2, intercept: -10
    })).then(function (vol) {
      samaDengan(vol.data[0], -10, 'voxel (0,0,0) = 0*2-10');
      samaDengan(vol.data[4 * 4 * 4 + 3 * 4 + 3], (3 + 3 + 4) * 2 - 10, 'voxel sudut');
      samaDengan(vol.min, -10, 'min');
      samaDengan(vol.max, (3 + 3 + 4) * 2 - 10, 'max');
    });
  });

  it('Volume: seri terlalu pendek ditolak dengan pesan jelas', function () {
    return V.bangun(seriUji({ nx: 4, ny: 4, nz: 3, nilai: kode })).then(function () {
      gagal('seharusnya ditolak');
    }, function (err) {
      benar(/4 irisan|setidaknya/i.test(err.message), 'pesan menyebut kebutuhan minimal: ' + err.message);
    });
  });

  /* ==========================================================
     MPR
     ========================================================== */
  it('MPR aksial mengembalikan irisan asli apa adanya', function () {
    return volKode().then(function (vol) {
      var img = vol.irisan('axial', 3);
      samaDengan(img.cols, NX, 'kolom');
      samaDengan(img.rows, NY, 'baris');
      hampirSama(img.pixelSpacing[0], 0.5, 1e-9, 'spacing baris');
      hampirSama(img.pixelSpacing[1], 0.5, 1e-9, 'spacing kolom');
      for (var y = 0; y < NY; y++) {
        for (var x = 0; x < NX; x++) {
          samaDengan(img.pixels[y * NX + x], kode(x, y, 3), 'piksel (' + x + ',' + y + ')');
        }
      }
    });
  });

  it('MPR koronal: nx × nz, superior di atas, spacing z × x', function () {
    return volKode().then(function (vol) {
      var Y = 2;
      var img = vol.irisan('coronal', Y);
      samaDengan(img.cols, NX, 'kolom = nx');
      samaDengan(img.rows, NZ, 'baris = nz');
      hampirSama(img.pixelSpacing[0], 2, 1e-9, 'spacing baris = jarak antar irisan');
      hampirSama(img.pixelSpacing[1], 0.5, 1e-9, 'spacing kolom = spacing x');
      for (var r = 0; r < NZ; r++) {
        for (var c = 0; c < NX; c++) {
          /* baris 0 harus irisan paling superior, yaitu z = nz-1 */
          samaDengan(img.pixels[r * NX + c], kode(c, Y, NZ - 1 - r),
            'piksel koronal (' + c + ',' + r + ')');
        }
      }
    });
  });

  it('MPR sagital: ny × nz, anterior di kiri, spacing z × y', function () {
    return volKode().then(function (vol) {
      var X = 4;
      var img = vol.irisan('sagittal', X);
      samaDengan(img.cols, NY, 'kolom = ny');
      samaDengan(img.rows, NZ, 'baris = nz');
      hampirSama(img.pixelSpacing[0], 2, 1e-9, 'spacing baris = jarak antar irisan');
      hampirSama(img.pixelSpacing[1], 0.5, 1e-9, 'spacing kolom = spacing y');
      for (var r = 0; r < NZ; r++) {
        for (var c = 0; c < NY; c++) {
          samaDengan(img.pixels[r * NY + c], kode(X, c, NZ - 1 - r),
            'piksel sagital (' + c + ',' + r + ')');
        }
      }
    });
  });

  it('MPR menghasilkan objek img yang bisa dirender DICOM.toImageData', function () {
    return volKode().then(function (vol) {
      V.BIDANG.forEach(function (bidang) {
        var img = vol.irisan(bidang, 1);
        samaDengan(img.samplesPerPixel, 1, 'samplesPerPixel (' + bidang + ')');
        samaDengan(img.slope, 1, 'slope sudah 1 karena nilai sudah direscale');
        samaDengan(img.intercept, 0, 'intercept 0');
        benar(img.derived, 'ditandai sebagai turunan (' + bidang + ')');
        var d = D.toImageData(img, { windowCenter: 400, windowWidth: 800 }).data;
        samaDengan(d.length, img.cols * img.rows * 4, 'ukuran ImageData (' + bidang + ')');
      });
    });
  });

  /* ==========================================================
     Slab: MIP, MinIP, rerata
     ========================================================== */
  it('MIP slab aksial mengambil nilai tertinggi pada rentangnya', function () {
    return volKode().then(function (vol) {
      var img = vol.slab('axial', 2, 5, 'maks');
      for (var y = 0; y < NY; y++) {
        for (var x = 0; x < NX; x++) {
          var maks = -Infinity;
          for (var z = 2; z <= 5; z++) maks = Math.max(maks, kode(x, y, z));
          samaDengan(img.pixels[y * NX + x], maks, 'MIP (' + x + ',' + y + ')');
        }
      }
      hampirSama(img.sliceThickness, 4 * 2, 1e-9, 'tebal slab = 4 irisan × 2 mm');
    });
  });

  it('MinIP dan rerata memakai rentang yang sama', function () {
    return volKode().then(function (vol) {
      var mn = vol.slab('axial', 1, 3, 'min');
      var rr = vol.slab('axial', 1, 3, 'rerata');
      for (var y = 0; y < NY; y++) {
        for (var x = 0; x < NX; x++) {
          var kecil = Infinity, jumlah = 0;
          for (var z = 1; z <= 3; z++) { kecil = Math.min(kecil, kode(x, y, z)); jumlah += kode(x, y, z); }
          samaDengan(mn.pixels[y * NX + x], kecil, 'MinIP (' + x + ',' + y + ')');
          samaDengan(rr.pixels[y * NX + x], Math.round(jumlah / 3), 'rerata (' + x + ',' + y + ')');
        }
      }
    });
  });

  it('Slab koronal & sagital meruntuhkan sumbu yang benar', function () {
    return volKode().then(function (vol) {
      var kor = vol.slab('coronal', 0, NY - 1, 'maks');
      samaDengan(kor.cols, NX, 'kolom koronal');
      samaDengan(kor.rows, NZ, 'baris koronal');
      for (var r = 0; r < NZ; r++) {
        for (var c = 0; c < NX; c++) {
          var maks = -Infinity;
          for (var y = 0; y < NY; y++) maks = Math.max(maks, kode(c, y, NZ - 1 - r));
          samaDengan(kor.pixels[r * NX + c], maks, 'MIP koronal (' + c + ',' + r + ')');
        }
      }

      var sag = vol.slab('sagittal', 0, NX - 1, 'maks');
      samaDengan(sag.cols, NY, 'kolom sagital');
      samaDengan(sag.rows, NZ, 'baris sagital');
      for (var r2 = 0; r2 < NZ; r2++) {
        for (var c2 = 0; c2 < NY; c2++) {
          var m2 = -Infinity;
          for (var x = 0; x < NX; x++) m2 = Math.max(m2, kode(x, c2, NZ - 1 - r2));
          samaDengan(sag.pixels[r2 * NY + c2], m2, 'MIP sagital (' + c2 + ',' + r2 + ')');
        }
      }
    });
  });

  it('Rentang slab di luar batas dijepit, bukan melempar', function () {
    return volKode().then(function (vol) {
      var a = vol.slab('axial', -50, 500, 'maks');
      var b = vol.slab('axial', 0, NZ - 1, 'maks');
      for (var i = 0; i < a.pixels.length; i++) {
        samaDengan(a.pixels[i], b.pixels[i], 'piksel ke-' + i + ' setelah dijepit');
      }
      /* urutan terbalik juga harus ditukar sendiri */
      var c = vol.slab('axial', 5, 2, 'maks');
      var d = vol.slab('axial', 2, 5, 'maks');
      for (var j = 0; j < c.pixels.length; j++) samaDengan(c.pixels[j], d.pixels[j], 'rentang terbalik');
    });
  });

  it('potonganUntukMM menerjemahkan tebal mm ke jumlah potongan', function () {
    return volKode().then(function (vol) {
      samaDengan(vol.potonganUntukMM('axial', 20), 10, '20 mm / 2 mm = 10 potongan');
      samaDengan(vol.potonganUntukMM('coronal', 5), 10, '5 mm / 0,5 mm = 10 potongan');
      samaDengan(vol.potonganUntukMM('axial', 0.1), 1, 'minimal satu potongan');
    });
  });

  /* ==========================================================
     Proyeksi ray-cast
     ========================================================== */
  /* volume kubus berisi satu voxel terang — letaknya di layar bisa
     dihitung terpisah, jadi matematika kameranya benar-benar diuji */
  function volTitik(x0, y0, z0, n) {
    n = n || 24;
    return V.bangun(seriUji({
      nx: n, ny: n, nz: n, sx: 1, sy: 1, sz: 1,
      nilai: function (x, y, z) { return (x === x0 && y === y0 && z === z0) ? 1000 : 0; }
    }));
  }

  /* Titik pusat dari SEMUA piksel bernilai maksimum.
     Satu voxel 1 mm menutupi beberapa piksel layar saat resolusi layar
     lebih halus daripada volume, jadi mengambil piksel maksimum yang
     pertama ditemukan akan bergeser ke tepi blok. Titik beratnya yang
     sebanding dengan posisi voxel yang diproyeksikan. */
  function puncak(img) {
    var terbaik = -Infinity, i;
    for (i = 0; i < img.pixels.length; i++) {
      if (img.pixels[i] > terbaik) terbaik = img.pixels[i];
    }
    var jx = 0, jy = 0, n = 0;
    for (i = 0; i < img.pixels.length; i++) {
      if (img.pixels[i] === terbaik) { jx += i % img.cols; jy += (i / img.cols) | 0; n++; }
    }
    return { nilai: terbaik, x: jx / n, y: jy / n, jumlah: n };
  }

  it('Proyeksi MIP menemukan nilai tertinggi di volume', function () {
    return volTitik(6, 9, 15).then(function (vol) {
      var img = vol.proyeksi({ azimut: 0, elevasi: 0, mode: 'maks', ukuran: 64, mutu: 2 });
      samaDengan(img.cols, 64, 'lebar');
      samaDengan(img.rows, 64, 'tinggi');
      samaDengan(puncak(img).nilai, 1000, 'voxel terang tertembus sinar');
    });
  });

  it('Proyeksi: letak voxel di layar sesuai hitungan kamera', function () {
    var n = 24, x0 = 5, y0 = 17, z0 = 19;
    return volTitik(x0, y0, z0, n).then(function (vol) {
      /* posisi voxel dalam mm, relatif pusat volume */
      var w = [x0 + 0.5 - n / 2, y0 + 0.5 - n / 2, z0 + 0.5 - n / 2];
      var fov = n * 1.06;
      var ukuran = 96;

      [0, 45, 90, 137, 180, 250, 300].forEach(function (derajat) {
        var az = derajat * Math.PI / 180;
        var d = [Math.sin(az), -Math.cos(az), 0];
        var kanan = [Math.cos(az), Math.sin(az), 0];      /* cross((0,0,1), d) */
        var atas = [0, 0, 1];                             /* cross(d, kanan) */

        var px = w[0] * kanan[0] + w[1] * kanan[1] + w[2] * kanan[2];
        var py = w[0] * atas[0] + w[1] * atas[1] + w[2] * atas[2];
        var iHarap = (px / fov + 0.5) * ukuran - 0.5;
        var jHarap = (0.5 - py / fov) * ukuran - 0.5;

        var img = vol.proyeksi({ azimut: az, elevasi: 0, mode: 'maks', ukuran: ukuran, mutu: 2 });
        var p = puncak(img);
        samaDengan(p.nilai, 1000, 'voxel terang terlihat pada azimut ' + derajat + '°');
        hampirSama(p.x, iHarap, 1, 'kolom pada azimut ' + derajat + '°');
        hampirSama(p.y, jHarap, 1, 'baris pada azimut ' + derajat + '°');
      });
    });
  });

  it('Proyeksi azimut 0 = pandangan koronal: superior di atas, kiri pasien di kanan', function () {
    var n = 24;
    /* voxel di sisi kiri pasien (x besar) dan superior (z besar) */
    return volTitik(20, 12, 21, n).then(function (vol) {
      var img = vol.proyeksi({ azimut: 0, elevasi: 0, mode: 'maks', ukuran: 64, mutu: 2 });
      var p = puncak(img);
      benar(p.x > 32, 'sisi kiri pasien tampil di separuh kanan gambar (x=' + p.x + ')');
      benar(p.y < 32, 'bagian superior tampil di separuh atas gambar (y=' + p.y + ')');
    });
  });

  it('Proyeksi azimut 90° = pandangan sagital kanan: posterior di kanan', function () {
    var n = 24;
    /* voxel di posterior (y besar) dan inferior (z kecil) */
    return volTitik(12, 20, 3, n).then(function (vol) {
      var img = vol.proyeksi({ azimut: Math.PI / 2, elevasi: 0, mode: 'maks', ukuran: 64, mutu: 2 });
      var p = puncak(img);
      benar(p.x > 32, 'posterior tampil di separuh kanan gambar (x=' + p.x + ')');
      benar(p.y > 32, 'bagian inferior tampil di separuh bawah gambar (y=' + p.y + ')');
    });
  });

  it('Proyeksi MIP penuh setara MIP slab pada bidang yang sama', function () {
    /* Volume isotropik dengan fov = jumlah voxel dan layar = jumlah voxel:
       pusat piksel jatuh tepat di pusat voxel, jadi hasilnya bisa
       dibandingkan langsung. 32 karena proyeksi() menjepit ukuran minimum
       layar ke 32 piksel. */
    var n = 32;
    return V.bangun(seriUji({
      nx: n, ny: n, nz: n, sx: 1, sy: 1, sz: 1,
      nilai: function (x, y, z) { return (x * 7 + y * 13 + z * 3) % 500; }
    })).then(function (vol) {
      var proj = vol.proyeksi({ azimut: 0, elevasi: 0, mode: 'maks', ukuran: n, fov: n, mutu: 2 });
      var slab = vol.slab('coronal', 0, n - 1, 'maks');
      samaDengan(proj.cols, slab.cols, 'lebar sama');
      samaDengan(proj.rows, slab.rows, 'tinggi sama');
      var beda = 0;
      for (var i = 0; i < slab.pixels.length; i++) {
        if (proj.pixels[i] !== slab.pixels[i]) beda++;
      }
      /* toleransi kecil: sinar disampel titik demi titik, jadi beberapa
         piksel di tepi bisa melewatkan satu voxel */
      benar(beda <= slab.pixels.length * 0.03,
        'proyeksi cocok dengan MIP koronal (' + beda + '/' + slab.pixels.length + ' piksel berbeda)');
    });
  });

  it('Proyeksi rerata berada di antara nilai minimum dan maksimum volume', function () {
    var n = 16;
    return V.bangun(seriUji({
      nx: n, ny: n, nz: n, sx: 1, sy: 1, sz: 1,
      nilai: function (x, y, z) { return 100 + ((x + y + z) % 40); }
    })).then(function (vol) {
      var img = vol.proyeksi({ azimut: 0.7, elevasi: 0.2, mode: 'rerata', ukuran: 48, mutu: 1 });
      var adaIsi = false;
      for (var i = 0; i < img.pixels.length; i++) {
        var v = img.pixels[i];
        benar(v >= vol.min && v <= vol.max, 'nilai ' + v + ' di luar rentang volume');
        if (v > vol.min) adaIsi = true;
      }
      benar(adaIsi, 'ada piksel yang benar-benar menembus volume');
    });
  });

  it('Mode komposit menghasilkan citra RGB, bukan skalar', function () {
    var n = 20;
    return V.bangun(seriUji({
      nx: n, ny: n, nz: n, sx: 1, sy: 1, sz: 1,
      nilai: function (x, y, z) {
        var dx = x - n / 2, dy = y - n / 2, dz = z - n / 2;
        return (dx * dx + dy * dy + dz * dz) < 36 ? 900 : 0;   /* bola padat */
      }
    })).then(function (vol) {
      var img = vol.proyeksi({
        azimut: 0.4, elevasi: 0.1, mode: 'komposit', ukuran: 64, mutu: 1,
        windowCenter: 450, windowWidth: 900, kepadatan: 1.5
      });
      samaDengan(img.samplesPerPixel, 3, 'samplesPerPixel');
      samaDengan(img.photometric, 'RGB', 'photometric');
      samaDengan(img.pixels.length, 64 * 64 * 3, 'panjang buffer RGB');

      var terang = 0;
      for (var i = 0; i < img.pixels.length; i += 3) if (img.pixels[i] > 20) terang++;
      benar(terang > 100, 'bola terlihat pada hasil komposit (' + terang + ' piksel terang)');

      /* harus bisa dirender lewat jalur RGB yang sudah ada */
      var d = D.toImageData(img, {}).data;
      samaDengan(d.length, 64 * 64 * 4, 'ImageData RGBA');
    });
  });

  it('Peta warna komposit menghasilkan piksel berwarna', function () {
    var n = 20;
    /* bola bergradasi: intensitas harus bervariasi, kalau semuanya
       bernilai puncak maka peta warna "hot" pun menghasilkan putih */
    return V.bangun(seriUji({
      nx: n, ny: n, nz: n, sx: 1, sy: 1, sz: 1,
      nilai: function (x, y, z) {
        var dx = x - n / 2, dy = y - n / 2, dz = z - n / 2;
        var r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return r < 8 ? Math.round(900 * (1 - r / 8)) : 0;
      }
    })).then(function (vol) {
      var img = vol.proyeksi({
        azimut: 0, elevasi: 0, mode: 'komposit', ukuran: 48, mutu: 1,
        windowCenter: 450, windowWidth: 900, kepadatan: 2, colormap: 'hot'
      });
      var berwarna = 0;
      for (var i = 0; i < img.pixels.length; i += 3) {
        if (img.pixels[i] !== img.pixels[i + 1] || img.pixels[i + 1] !== img.pixels[i + 2]) berwarna++;
      }
      benar(berwarna > 50, 'peta warna hot menghasilkan kanal yang berbeda (' + berwarna + ' piksel)');
    });
  });

  /* ==========================================================
     Pembungkus seri
     ========================================================== */
  it('Seri turunan berbentuk sama dengan seri DICOM biasa', function () {
    return volKode().then(function (vol) {
      var mpr = vol.seriMPR('coronal');
      samaDengan(mpr.count, NY, 'jumlah potongan MPR koronal');
      benar(mpr.derived, 'ditandai turunan');
      benar(mpr.key && mpr.key.indexOf('MPR') === 0, 'punya kunci stabil: ' + mpr.key);
      benar(typeof mpr.getImage === 'function' && typeof mpr.getTags === 'function',
        'antarmuka getImage/getTags ada');

      var mip = vol.seriMIP('axial', 8);
      samaDengan(mip.count, NZ, 'jumlah posisi MIP');

      var pro = vol.seriProyeksi({ jumlah: 12, ukuran: 48 });
      samaDengan(pro.count, 12, 'jumlah sudut proyeksi');

      return Promise.all([mpr.getImage(1), mip.getImage(3), pro.getImage(0)]).then(function (h) {
        samaDengan(h[0].cols, NX, 'MPR koronal lebar');
        samaDengan(h[1].cols, NX, 'MIP aksial lebar');
        samaDengan(h[2].cols, 48, 'proyeksi lebar');
        benar(vol.seriMPR('coronal').getTags().length > 3, 'tag turunan terisi');
      });
    });
  });

  it('Seri turunan menyimpan hasil di cache, bukan menghitung dua kali', function () {
    return volKode().then(function (vol) {
      var s = vol.seriMPR('axial');
      return s.getImage(2).then(function (a) {
        return s.getImage(2).then(function (b) {
          benar(a === b, 'objek img yang sama dikembalikan pada permintaan kedua');
        });
      });
    });
  });

  it('MIP slab dari seri turunan tebalnya sesuai permintaan mm', function () {
    return volKode().then(function (vol) {
      /* jarak antar irisan 2 mm, minta 8 mm → 4 potongan */
      return vol.seriMIP('axial', 8).getImage(4).then(function (img) {
        hampirSama(img.sliceThickness, 8, 1e-9, 'tebal slab dalam mm');
      });
    });
  });

  global.UJI = { daftar: uji };
})(window);
