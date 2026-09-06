/* ==========================================================
   KACA — rekonstruksi permukaan 3D dari volume
   ----------------------------------------------------------
   Dua bagian:

     1. Ekstraksi isosurface — mengubah volume voxel menjadi
        jaring segitiga pada satu nilai ambang (mis. 300 HU
        untuk tulang), memakai *marching tetrahedra*.

     2. Perender permukaan — rasterisasi perangkat lunak dengan
        z-buffer dan pencahayaan, tanpa WebGL.

   Kenapa marching TETRAHEDRA, bukan marching cubes: setiap kubus
   dipecah jadi 6 tetrahedron, dan satu tetrahedron hanya punya 16
   kemungkinan yang tabelnya beberapa baris — bukan tabel 256 kasus
   berisi ribuan angka tanpa makna yang bisa dibaca. Permukaannya
   juga selalu tertutup dan tidak punya kasus ambigu. Bayarannya
   jumlah segitiga sekitar dua kali lebih banyak; itu diimbangi
   dengan parameter langkah (stride) untuk mengatur kerapatan.

   Kenapa rasterisasi CPU, bukan WebGL: hasilnya berupa objek "img"
   yang sama dengan keluaran DICOM.readPixels() dan VOLUME.proyeksi(),
   jadi masuk ke viewer dan panggung prisma lewat jalur yang sudah
   ada — dan bisa diuji tanpa peramban.
   ========================================================== */
(function (global) {
  'use strict';

  /* Batas jumlah sel yang ditelusuri. Di atas ini volume dilangkahi
     (stride) supaya jumlah segitiga dan waktu render tetap wajar. */
  var MAKS_SEL = 1.2e6;
  var MAKS_SEGITIGA = 1.6e6;

  /* Enam tetrahedron yang berbagi diagonal utama kubus (0 → 7).
     Indeks sudut kubus: i + 2j + 4k untuk i,j,k ∈ {0,1}. */
  var TET = [
    [0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7],
    [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]
  ];

  /* Rusuk tetrahedron: pasangan sudut lokal. */
  var RUSUK = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  /* Segitiga per kasus. Bit ke-n menyala berarti sudut ke-n berada
     DI DALAM permukaan (nilai >= ambang). Isinya indeks rusuk.
     Arah putaran tidak perlu tepat di sini: setiap segitiga nanti
     diarahkan ulang memakai gradien volume, yang jauh lebih andal
     daripada mengandalkan tabel ditulis tanpa salah. */
  var KASUS = [
    [],                       /* 0000 */
    [0, 1, 2],                /* 0001 — sudut 0 */
    [0, 3, 4],                /* 0010 — sudut 1 */
    [1, 3, 4, 1, 4, 2],       /* 0011 — sudut 0,1 */
    [1, 3, 5],                /* 0100 — sudut 2 */
    [0, 3, 5, 0, 5, 2],       /* 0101 — sudut 0,2 */
    [0, 1, 5, 0, 5, 4],       /* 0110 — sudut 1,2 */
    [2, 4, 5],                /* 0111 — sudut 3 di luar */
    [2, 4, 5],                /* 1000 — sudut 3 */
    [0, 1, 5, 0, 5, 4],       /* 1001 — sudut 0,3 */
    [0, 3, 5, 0, 5, 2],       /* 1010 — sudut 1,3 */
    [1, 3, 5],                /* 1011 — sudut 2 di luar */
    [1, 3, 4, 1, 4, 2],       /* 1100 — sudut 2,3 */
    [0, 3, 4],                /* 1101 — sudut 1 di luar */
    [0, 1, 2],                /* 1110 — sudut 0 di luar */
    []                        /* 1111 */
  ];

  function klem(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ==========================================================
     Ambang yang masuk akal untuk sebuah volume
     ========================================================== */
  function ambangSaran(vol) {
    var mod = (vol.modality || '').toUpperCase();
    /* CT berskala HU: 300 HU memisahkan tulang kortikal dari
       jaringan lunak dengan baik pada hampir semua pemeriksaan */
    if (mod === 'CT' && vol.min < 0 && vol.max > 400) return 300;
    /* modalitas lain tidak berskala tetap: ambil sepertiga atas rentang */
    return Math.round(vol.min + (vol.max - vol.min) * 0.45);
  }

  /* ==========================================================
     Ekstraksi isosurface
     ========================================================== */
  function dari(vol, opsi) {
    opsi = opsi || {};
    var ambang = opsi.ambang !== undefined && opsi.ambang !== null
      ? opsi.ambang : ambangSaran(vol);
    var lapor = opsi.lapor || function () {};

    var nx = vol.nx, ny = vol.ny, nz = vol.nz, data = vol.data;
    var sx = vol.spacing[0], sy = vol.spacing[1], sz = vol.spacing[2];

    /* langkah dipilih supaya jumlah sel di bawah batas */
    var langkah = Math.max(1, Math.round(opsi.langkah || 0));
    if (!langkah) langkah = 1;
    while (Math.ceil((nx - 1) / langkah) * Math.ceil((ny - 1) / langkah) *
           Math.ceil((nz - 1) / langkah) > MAKS_SEL) {
      langkah++;
    }

    var nxny = nx * ny;
    function nilai(x, y, z) { return data[z * nxny + y * nx + x]; }

    /* gradien beda tengah, dalam satuan per-mm supaya anisotropi
       jarak irisan tidak memiringkan arah normal */
    function grad(x, y, z, keluar) {
      var xa = x > 0 ? x - 1 : x, xb = x < nx - 1 ? x + 1 : x;
      var ya = y > 0 ? y - 1 : y, yb = y < ny - 1 ? y + 1 : y;
      var za = z > 0 ? z - 1 : z, zb = z < nz - 1 ? z + 1 : z;
      keluar[0] = (nilai(xb, y, z) - nilai(xa, y, z)) / ((xb - xa) * sx || 1);
      keluar[1] = (nilai(x, yb, z) - nilai(x, ya, z)) / ((yb - ya) * sy || 1);
      keluar[2] = (nilai(x, y, zb) - nilai(x, y, za)) / ((zb - za) * sz || 1);
    }

    /* pusat volume dalam mm, supaya jaring berpusat di titik asal —
       sama seperti kesepakatan di VOLUME.proyeksi() */
    var ex = nx * sx, ey = ny * sy, ez = nz * sz;
    function posX(x) { return (x + 0.5) * sx - ex / 2; }
    function posY(y) { return (y + 0.5) * sy - ey / 2; }
    function posZ(z) { return (z + 0.5) * sz - ez / 2; }

    var vert = [];         /* x,y,z berulang */
    var norm = [];         /* nx,ny,nz berulang */
    var tri = [];          /* indeks titik, tiga-tiga */
    var petaRusuk = new Map();

    var gA = [0, 0, 0], gB = [0, 0, 0];

    /* titik pada rusuk antara dua sudut voxel, dibagi bersama oleh
       semua tetrahedron yang menyentuh rusuk itu */
    /* Kunci rusuk memakai jumlah voxel sebagai pengali, bukan 2^32:
       dengan volume besar, ia * 2^32 + ib melewati 2^53 dan kehilangan
       ketelitian, sehingga dua rusuk berbeda bisa dianggap sama. */
    var totalVoxel = nx * ny * nz;

    function titikRusuk(ax, ay, az, bx, by, bz) {
      var ia = az * nxny + ay * nx + ax;
      var ib = bz * nxny + by * nx + bx;
      var kunci = ia < ib ? ia * totalVoxel + ib : ib * totalVoxel + ia;
      var ada = petaRusuk.get(kunci);
      if (ada !== undefined) return ada;

      var va = data[ia], vb = data[ib];
      var t = (vb === va) ? 0.5 : (ambang - va) / (vb - va);
      t = klem(t, 0, 1);

      var px = posX(ax) + (posX(bx) - posX(ax)) * t;
      var py = posY(ay) + (posY(by) - posY(ay)) * t;
      var pz = posZ(az) + (posZ(bz) - posZ(az)) * t;

      grad(ax, ay, az, gA);
      grad(bx, by, bz, gB);
      /* gradien menunjuk ke arah nilai membesar, yaitu ke DALAM benda,
         jadi normal permukaan yang menghadap keluar adalah negatifnya */
      var gx = -(gA[0] + (gB[0] - gA[0]) * t);
      var gy = -(gA[1] + (gB[1] - gA[1]) * t);
      var gz = -(gA[2] + (gB[2] - gA[2]) * t);
      var p = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;

      var idx = vert.length / 3;
      vert.push(px, py, pz);
      norm.push(gx / p, gy / p, gz / p);
      petaRusuk.set(kunci, idx);
      return idx;
    }

    /* sudut kubus: koordinat voxel per indeks 0..7 */
    var cX = new Int32Array(8), cY = new Int32Array(8), cZ = new Int32Array(8);
    var cV = new Float64Array(8);
    var tIdx = new Int32Array(6);
    var terpotong = false;

    var totalZ = Math.max(1, nz - 1);
    for (var z = 0; z < nz - 1; z += langkah) {
      var z1 = Math.min(z + langkah, nz - 1);
      for (var y = 0; y < ny - 1; y += langkah) {
        var y1 = Math.min(y + langkah, ny - 1);
        for (var x = 0; x < nx - 1; x += langkah) {
          var x1 = Math.min(x + langkah, nx - 1);

          for (var c = 0; c < 8; c++) {
            cX[c] = (c & 1) ? x1 : x;
            cY[c] = (c & 2) ? y1 : y;
            cZ[c] = (c & 4) ? z1 : z;
            cV[c] = data[cZ[c] * nxny + cY[c] * nx + cX[c]];
          }

          /* lewati sel yang seluruhnya di dalam atau di luar */
          var adaDalam = false, adaLuar = false;
          for (var q = 0; q < 8; q++) {
            if (cV[q] >= ambang) adaDalam = true; else adaLuar = true;
          }
          if (!adaDalam || !adaLuar) continue;

          for (var t4 = 0; t4 < 6; t4++) {
            var tet = TET[t4];
            var mask = 0;
            for (var v = 0; v < 4; v++) if (cV[tet[v]] >= ambang) mask |= (1 << v);
            var kasus = KASUS[mask];
            if (!kasus.length) continue;

            for (var e = 0; e < 6; e++) tIdx[e] = -1;

            for (var s = 0; s < kasus.length; s += 3) {
              var a = kasus[s], b = kasus[s + 1], cc = kasus[s + 2];
              var ii = [a, b, cc];
              for (var m = 0; m < 3; m++) {
                var ei = ii[m];
                if (tIdx[ei] === -1) {
                  var r = RUSUK[ei];
                  var k0 = tet[r[0]], k1 = tet[r[1]];
                  tIdx[ei] = titikRusuk(cX[k0], cY[k0], cZ[k0], cX[k1], cY[k1], cZ[k1]);
                }
              }
              var i0 = tIdx[a], i1 = tIdx[b], i2 = tIdx[cc];
              if (i0 === i1 || i1 === i2 || i0 === i2) continue;   /* segitiga runtuh */

              /* Arahkan putaran segitiga agar normal geometrisnya searah
                 dengan normal gradien. Dengan begitu tabel kasus tidak
                 perlu menyimpan arah putaran yang benar. */
              var ax = vert[i0 * 3], ay = vert[i0 * 3 + 1], az = vert[i0 * 3 + 2];
              var bx = vert[i1 * 3] - ax, by = vert[i1 * 3 + 1] - ay, bz = vert[i1 * 3 + 2] - az;
              var dx = vert[i2 * 3] - ax, dy = vert[i2 * 3 + 1] - ay, dz = vert[i2 * 3 + 2] - az;
              var gxx = by * dz - bz * dy, gyy = bz * dx - bx * dz, gzz = bx * dy - by * dx;
              var rata = (norm[i0 * 3] + norm[i1 * 3] + norm[i2 * 3]) * gxx +
                         (norm[i0 * 3 + 1] + norm[i1 * 3 + 1] + norm[i2 * 3 + 1]) * gyy +
                         (norm[i0 * 3 + 2] + norm[i1 * 3 + 2] + norm[i2 * 3 + 2]) * gzz;
              if (rata < 0) tri.push(i0, i2, i1); else tri.push(i0, i1, i2);
            }
          }

          if (tri.length / 3 > MAKS_SEGITIGA) { terpotong = true; break; }
        }
        if (terpotong) break;
      }
      lapor(Math.min(z + langkah, totalZ), totalZ);
      if (terpotong) break;
    }

    petaRusuk.clear();

    return new Mesh({
      vert: new Float32Array(vert),
      norm: new Float32Array(norm),
      tri: (vert.length / 3) > 65535 ? new Uint32Array(tri) : new Uint16Array(tri),
      ambang: ambang, langkah: langkah, terpotong: terpotong,
      ukuranMM: [ex, ey, ez],
      modality: vol.modality, desc: vol.desc
    });
  }

  /* ==========================================================
     Mesh
     ========================================================== */
  function Mesh(o) {
    this.vert = o.vert;
    this.norm = o.norm;
    this.tri = o.tri;
    this.ambang = o.ambang;
    this.langkah = o.langkah;
    this.terpotong = !!o.terpotong;
    this.ukuranMM = o.ukuranMM;
    this.modality = o.modality || '';
    this.desc = o.desc || '';
  }

  Mesh.prototype.jumlahTitik = function () { return this.vert.length / 3; };
  Mesh.prototype.jumlahSegitiga = function () { return this.tri.length / 3; };
  Mesh.prototype.kosong = function () { return this.tri.length === 0; };

  Mesh.prototype.info = function () {
    var dasar = this.jumlahSegitiga().toLocaleString('id-ID') + ' segitiga · ' +
      this.jumlahTitik().toLocaleString('id-ID') + ' titik';
    /* mesh yang DIMUAT dari berkas luar tidak punya ambang isosurface —
       menampilkan "ambang 0" hanya akan menyesatkan */
    if (this.dimuat) {
      return dasar + (this.sumberBerkas ? ' · ' + this.sumberBerkas : '') +
        (this.terpotong ? ' · DIPOTONG (batas segitiga)' : '');
    }
    return dasar + ' · ambang ' + Math.round(this.ambang) +
      (this.langkah > 1 ? ' · langkah ' + this.langkah : '') +
      (this.terpotong ? ' · DIPOTONG (batas segitiga)' : '');
  };

  /* Kotak pembatas — dipakai untuk menentukan bidang pandang */
  Mesh.prototype.kotak = function () {
    if (this._kotak) return this._kotak;
    var v = this.vert;
    if (!v.length) return (this._kotak = { min: [0, 0, 0], max: [0, 0, 0], r: 1 });
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < v.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (v[i + k] < mn[k]) mn[k] = v[i + k];
        if (v[i + k] > mx[k]) mx[k] = v[i + k];
      }
    }
    var r = 0.5 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    return (this._kotak = { min: mn, max: mx, r: r || 1 });
  };

  /* ==========================================================
     Perender: rasterisasi z-buffer
     ----------------------------------------------------------
     Kamera memakai kesepakatan yang sama dengan VOLUME.proyeksi()
     supaya permukaan dan MIP bisa ditumpuk atau dibandingkan.
     ========================================================== */
  function silangi(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalkan(v) {
    var p = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / p, v[1] / p, v[2] / p];
  }

  Mesh.prototype.render = function (o) {
    o = o || {};
    var ukuran = Math.max(32, Math.round(o.ukuran || 256));
    var az = o.azimut || 0, el = o.elevasi || 0;

    var d = normalkan([Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)]);
    var kanan = silangi([0, 0, 1], d);
    if (Math.hypot(kanan[0], kanan[1], kanan[2]) < 1e-6) kanan = [1, 0, 0];
    kanan = normalkan(kanan);
    var atas = normalkan(silangi(d, kanan));

    var kotak = this.kotak();
    var fov = o.fov || Math.max(
      this.ukuranMM ? Math.max(this.ukuranMM[0], this.ukuranMM[1], this.ukuranMM[2]) : 0,
      kotak.r * 2) * 1.06;

    var warna = o.warna || [232, 222, 205];        /* putih tulang kehangatan */
    var latar = o.latar || [0, 0, 0];
    var ambien = o.ambien !== undefined ? o.ambien : 0.22;
    var kilau = o.kilau !== undefined ? o.kilau : 0.35;
    var tepi = o.tepi !== undefined ? o.tepi : 0.30;   /* penguatan tepi (rim) */

    var lebar = ukuran, tinggi = ukuran;
    var piksel = new Uint8Array(lebar * tinggi * 3);
    var zbuf = new Float32Array(lebar * tinggi);
    for (var i = 0; i < zbuf.length; i++) zbuf[i] = Infinity;
    for (var b = 0; b < piksel.length; b += 3) {
      piksel[b] = latar[0]; piksel[b + 1] = latar[1]; piksel[b + 2] = latar[2];
    }

    var vert = this.vert, norm = this.norm, tri = this.tri;
    var n = vert.length / 3;
    if (!tri.length) return jadikanImg(piksel, lebar, tinggi, fov / ukuran, this);

    /* titik ditransformasi sekali per bingkai, bukan per segitiga */
    var sxArr = new Float32Array(n), syArr = new Float32Array(n), szArr = new Float32Array(n);
    var nxArr = new Float32Array(n), nyArr = new Float32Array(n), nzArr = new Float32Array(n);
    var skala = ukuran / fov;

    for (var v = 0; v < n; v++) {
      var px = vert[v * 3], py = vert[v * 3 + 1], pz = vert[v * 3 + 2];
      var u = px * kanan[0] + py * kanan[1] + pz * kanan[2];
      var w = px * atas[0] + py * atas[1] + pz * atas[2];
      sxArr[v] = u * skala + lebar / 2;
      syArr[v] = tinggi / 2 - w * skala;
      szArr[v] = px * d[0] + py * d[1] + pz * d[2];

      var mx = norm[v * 3], my = norm[v * 3 + 1], mz = norm[v * 3 + 2];
      nxArr[v] = mx * kanan[0] + my * kanan[1] + mz * kanan[2];
      nyArr[v] = mx * atas[0] + my * atas[1] + mz * atas[2];
      nzArr[v] = mx * d[0] + my * d[1] + mz * d[2];
    }

    for (var t = 0; t < tri.length; t += 3) {
      var a = tri[t], c = tri[t + 1], e = tri[t + 2];
      var x0 = sxArr[a], y0 = syArr[a], x1 = sxArr[c], y1 = syArr[c], x2 = sxArr[e], y2 = syArr[e];

      /* luas bertanda: nol berarti segitiga menghadap tepat ke samping */
      var luas = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (luas === 0) continue;

      var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      var maksX = Math.min(lebar - 1, Math.ceil(Math.max(x0, x1, x2)));
      var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      var maksY = Math.min(tinggi - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maksX || minY > maksY) continue;

      var inv = 1 / luas;
      var z0 = szArr[a], z1 = szArr[c], z2 = szArr[e];

      for (var yy = minY; yy <= maksY; yy++) {
        var pyc = yy + 0.5;
        for (var xx = minX; xx <= maksX; xx++) {
          var pxc = xx + 0.5;
          /* koordinat barisentrik */
          var l0 = ((x1 - pxc) * (y2 - pyc) - (x2 - pxc) * (y1 - pyc)) * inv;
          if (l0 < 0) continue;
          var l1 = ((x2 - pxc) * (y0 - pyc) - (x0 - pxc) * (y2 - pyc)) * inv;
          if (l1 < 0) continue;
          var l2 = 1 - l0 - l1;
          if (l2 < 0) continue;

          var zz = l0 * z0 + l1 * z1 + l2 * z2;
          var pi = yy * lebar + xx;
          if (zz >= zbuf[pi]) continue;
          zbuf[pi] = zz;

          /* normal diinterpolasi → bayangan mulus tanpa terlihat sisi datar */
          var mnx = l0 * nxArr[a] + l1 * nxArr[c] + l2 * nxArr[e];
          var mny = l0 * nyArr[a] + l1 * nyArr[c] + l2 * nyArr[e];
          var mnz = l0 * nzArr[a] + l1 * nzArr[c] + l2 * nzArr[e];
          var pj = Math.sqrt(mnx * mnx + mny * mny + mnz * mnz) || 1;
          mnx /= pj; mny /= pj; mnz /= pj;

          /* lampu kepala: searah pandangan, jadi -z pada ruang kamera */
          var lamb = -mnz;
          if (lamb < 0) lamb = -lamb;         /* dua sisi: permukaan dalam ikut terang */

          /* sorot spekular sederhana di sekitar arah pandang */
          var spek = kilau ? Math.pow(lamb, 22) * kilau : 0;
          /* penguatan tepi supaya bentuk 3D terbaca meski tanpa gerakan */
          var rim = tepi ? Math.pow(1 - lamb, 2.2) * tepi : 0;

          var g = ambien + (1 - ambien) * lamb;
          var o3 = pi * 3;
          var r = warna[0] * g + 255 * spek + warna[0] * rim * 0.35;
          var gg = warna[1] * g + 255 * spek + warna[1] * rim * 0.45;
          var bb = warna[2] * g + 255 * spek + warna[2] * rim * 0.65;
          piksel[o3] = r > 255 ? 255 : r;
          piksel[o3 + 1] = gg > 255 ? 255 : gg;
          piksel[o3 + 2] = bb > 255 ? 255 : bb;
        }
      }
    }

    return jadikanImg(piksel, lebar, tinggi, fov / ukuran, this);
  };

  function jadikanImg(piksel, lebar, tinggi, mmPerPx, mesh) {
    return {
      rows: tinggi, cols: lebar, frames: 1, frame: 0,
      samplesPerPixel: 3, bitsAllocated: 8, signed: false,
      photometric: 'RGB', planar: 0, slope: 1, intercept: 0,
      modality: mesh.modality, rescaleType: '',
      windowCenter: 128, windowWidth: 256,
      pixelSpacing: [mmPerPx, mmPerPx], sliceThickness: 0,
      pixels: piksel, min: 0, max: 255,
      encapsulated: false, mime: null, blobBytes: null,
      derived: 'Rekonstruksi permukaan 3D'
    };
  }

  /* ==========================================================
     Ekspor
     ========================================================== */
  /* STL biner: 80 byte judul + 4 byte jumlah + 50 byte per segitiga */
  Mesh.prototype.stl = function (judul) {
    var jml = this.jumlahSegitiga();
    var buf = new ArrayBuffer(84 + jml * 50);
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);

    var kepala = 'Kaca — rekonstruksi permukaan DICOM (phantom/prototipe). ' + (judul || '');
    for (var i = 0; i < 80; i++) u8[i] = i < kepala.length ? kepala.charCodeAt(i) & 0x7F : 0x20;
    dv.setUint32(80, jml, true);

    var vert = this.vert, norm = this.norm, tri = this.tri;
    var pos = 84;
    for (var t = 0; t < tri.length; t += 3) {
      var a = tri[t], b = tri[t + 1], c = tri[t + 2];
      /* STL memakai normal per-facet; dihitung dari titiknya */
      var ax = vert[a * 3], ay = vert[a * 3 + 1], az = vert[a * 3 + 2];
      var ux = vert[b * 3] - ax, uy = vert[b * 3 + 1] - ay, uz = vert[b * 3 + 2] - az;
      var vx = vert[c * 3] - ax, vy = vert[c * 3 + 1] - ay, vz = vert[c * 3 + 2] - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var p = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      dv.setFloat32(pos, nx / p, true);
      dv.setFloat32(pos + 4, ny / p, true);
      dv.setFloat32(pos + 8, nz / p, true);
      pos += 12;
      [a, b, c].forEach(function (idx) {
        dv.setFloat32(pos, vert[idx * 3], true);
        dv.setFloat32(pos + 4, vert[idx * 3 + 1], true);
        dv.setFloat32(pos + 8, vert[idx * 3 + 2], true);
        pos += 12;
      });
      dv.setUint16(pos, 0, true);
      pos += 2;
    }
    return buf;
  };

  /* OBJ teks, lengkap dengan normal per titik */
  Mesh.prototype.obj = function (judul) {
    var baris = [
      '# Kaca — rekonstruksi permukaan dari volume DICOM',
      '# ' + (judul || this.desc),
      '# ambang ' + Math.round(this.ambang) + ', ' + this.jumlahSegitiga() + ' segitiga',
      '# satuan: milimeter',
      '# PROTOTIPE — bukan untuk penggunaan klinis'
    ];
    var vert = this.vert, norm = this.norm, tri = this.tri, i;
    for (i = 0; i < vert.length; i += 3) {
      baris.push('v ' + vert[i].toFixed(3) + ' ' + vert[i + 1].toFixed(3) + ' ' + vert[i + 2].toFixed(3));
    }
    for (i = 0; i < norm.length; i += 3) {
      baris.push('vn ' + norm[i].toFixed(4) + ' ' + norm[i + 1].toFixed(4) + ' ' + norm[i + 2].toFixed(4));
    }
    for (i = 0; i < tri.length; i += 3) {
      var a = tri[i] + 1, b = tri[i + 1] + 1, c = tri[i + 2] + 1;
      baris.push('f ' + a + '//' + a + ' ' + b + '//' + b + ' ' + c + '//' + c);
    }
    return baris.join('\n') + '\n';
  };

  /* ==========================================================
     Pembungkus seri — masuk ke viewer lewat jalur yang sudah ada
     ========================================================== */
  Mesh.prototype.seriPermukaan = function (o) {
    o = o || {};
    var self = this;
    var jml = o.jumlah || 24;
    var cache = {};
    return {
      desc: 'Permukaan 3D (' + jml + ' sudut)',
      number: 930, modality: this.modality, count: jml,
      key: 'SURF#' + Math.round(this.ambang) + '#' + jml + '#' + (o.ukuran || 256),
      derived: true,
      getImage: function (i) {
        i = klem(Math.round(i), 0, jml - 1);
        if (cache[i]) return Promise.resolve(cache[i]);
        var img;
        try {
          img = self.render({
            azimut: i / jml * Math.PI * 2,
            elevasi: o.elevasi || 0,
            ukuran: o.ukuran || 256,
            warna: o.warna, ambien: o.ambien, kilau: o.kilau, tepi: o.tepi
          });
        } catch (e) { return Promise.reject(e); }
        cache[i] = img;
        return Promise.resolve(img);
      },
      getTags: function () {
        return [
          { tag: '(0008,0008)', key: '00080008', vr: 'CS', name: 'ImageType',
            value: 'DERIVED\\SECONDARY\\SURFACE RENDERING' },
          { tag: '(0008,2111)', key: '00082111', vr: 'ST', name: 'DerivationDescription',
            value: 'Isosurface marching tetrahedra pada ambang ' + Math.round(self.ambang) +
                   ', ' + self.jumlahSegitiga() + ' segitiga, dihitung di peramban' },
          { tag: '(0028,0002)', key: '00280002', vr: 'US', name: 'SamplesPerPixel', value: '3' },
          { tag: '(0028,0004)', key: '00280004', vr: 'CS', name: 'PhotometricInterpretation', value: 'RGB' }
        ];
      }
    };
  };

  global.MESH = {
    dari: dari,
    ambangSaran: ambangSaran,
    Mesh: Mesh,
    MAKS_SEL: MAKS_SEL
  };
})(window);
