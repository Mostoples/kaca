/* ==========================================================
   KACA — pemuat model permukaan (OBJ / STL) + adegan atlas
   ----------------------------------------------------------
   Dua hal yang dikerjakan berkas ini:

   1. MEMUAT mesh dari berkas luar. Sampai sekarang `mesh.js` hanya
      bisa MENGEKSPOR (STL/OBJ) dan membuat permukaan dari volume
      DICOM. Di sini arah sebaliknya: berkas OBJ/STL dibaca menjadi
      objek MESH.Mesh yang sama, sehingga seluruh jalur render yang
      sudah ada langsung berlaku.

   2. ADEGAN banyak bagian. Satu atlas anatomi terdiri dari banyak
      organ yang harus bisa dinyalakan, dipudarkan, digeser, dan
      DIKLIK satu per satu. Rasteriser di `mesh.js` hanya melayani
      satu mesh dengan satu z-buffer, jadi di sini ada perender
      adegan: satu z-buffer bersama untuk semua bagian, ditambah
      satu buffer ID per piksel.

   Buffer ID itulah kunci mekanisme "menggerakkan organ": memilih
   organ tidak perlu ray-casting sama sekali — cukup baca ID di
   piksel yang diklik. Rasterisasi perangkat lunak sudah berjalan,
   jadi informasinya tinggal disimpan, bukan dihitung ulang.

   Bebas DOM sepenuhnya, jadi bisa diuji di Node seperti
   volume.js dan mesh.js.

   Format sengaja dibatasi pada OBJ dan STL. glTF/GLB modern
   memakai EXT_meshopt_compression dan KHR_mesh_quantization yang
   butuh dekoder WASM — itu melanggar aturan tanpa dependensi.
   ========================================================== */
(function (global) {
  'use strict';

  var MAKS_SEGITIGA = 2500000;    /* pagar agar tab tidak mati */

  function klem(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ==========================================================
     Warna organ
     ----------------------------------------------------------
     Dipakai bila berkas tidak membawa material. Bukan pewarnaan
     ilmiah — hanya supaya organ bisa dibedakan mata.
     ========================================================== */
  var PALET = [
    [/jantung|heart|cardi/i, [196, 62, 58]],
    [/paru|lung|pulmo/i, [214, 138, 148]],
    [/hati|liver|hepat/i, [140, 84, 62]],
    [/ginjal|kidney|ren(al)?\b/i, [158, 82, 74]],
    [/otak|brain|cereb/i, [206, 176, 170]],
    [/usus|intestine|colon|bowel/i, [204, 150, 116]],
    [/pankreas|pancrea/i, [206, 172, 108]],
    [/lambung|stomach|gastr/i, [198, 132, 106]],
    [/limpa|spleen/i, [128, 74, 96]],
    [/mata|eye|ocul/i, [232, 232, 228]],
    [/tulang|bone|skelet|vertebra|rib|femur|crani|skull/i, [232, 226, 208]],
    [/otot|muscle|muscul/i, [178, 74, 68]],
    [/pembuluh|arteri|artery|aorta/i, [188, 58, 58]],
    [/vena|vein/i, [82, 96, 168]],
    [/saraf|nerve|neur/i, [222, 208, 140]],
    [/kulit|skin|derm/i, [226, 190, 164]],
    [/kandung|bladder|gall/i, [148, 168, 108]],
    [/trakea|trachea|bronkus|bronch/i, [180, 190, 200]]
  ];

  /* Warna cadangan bila nama tidak dikenali: sebar merata di lingkaran
     warna supaya dua organ berdekatan tidak pernah kembar. */
  function warnaCadangan(i) {
    var h = (i * 0.618033988749895) % 1;          /* rasio emas */
    return hsvKeRgb(h, 0.38, 0.86);
  }

  function hsvKeRgb(h, s, v) {
    var i = Math.floor(h * 6), f = h * 6 - i;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function warnaOrgan(nama, urutan) {
    for (var i = 0; i < PALET.length; i++) {
      if (PALET[i][0].test(nama || '')) return PALET[i][1].slice();
    }
    return warnaCadangan(urutan || 0);
  }

  /* ==========================================================
     Normal per titik
     ----------------------------------------------------------
     Dijumlahkan dari normal segitiga TANPA dinormalkan lebih dulu,
     sehingga besar vektor silang (= 2× luas) berlaku sebagai bobot.
     Segitiga besar jadi lebih menentukan daripada serpihan kecil.
     ========================================================== */
  function hitungNormal(vert, tri) {
    var n = vert.length;
    var norm = new Float32Array(n);
    for (var t = 0; t < tri.length; t += 3) {
      var a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
      var ux = vert[b] - vert[a], uy = vert[b + 1] - vert[a + 1], uz = vert[b + 2] - vert[a + 2];
      var vx = vert[c] - vert[a], vy = vert[c + 1] - vert[a + 1], vz = vert[c + 2] - vert[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      norm[a] += nx; norm[a + 1] += ny; norm[a + 2] += nz;
      norm[b] += nx; norm[b + 1] += ny; norm[b + 2] += nz;
      norm[c] += nx; norm[c + 1] += ny; norm[c + 2] += nz;
    }
    for (var i = 0; i < n; i += 3) {
      var p = Math.sqrt(norm[i] * norm[i] + norm[i + 1] * norm[i + 1] + norm[i + 2] * norm[i + 2]);
      if (p > 1e-12) { norm[i] /= p; norm[i + 1] /= p; norm[i + 2] /= p; }
      else { norm[i] = 0; norm[i + 1] = 0; norm[i + 2] = 1; }
    }
    return norm;
  }

  function bikinMesh(vert, norm, tri, o) {
    var m = new global.MESH.Mesh({
      vert: vert,
      norm: norm || hitungNormal(vert, tri),
      tri: (vert.length / 3) > 65535 ? new Uint32Array(tri) : new Uint16Array(tri),
      ambang: 0, langkah: 1, terpotong: !!(o && o.terpotong),
      ukuranMM: null,
      modality: '', desc: (o && o.desc) || ''
    });
    m.dimuat = true;
    m.sumberBerkas = (o && o.sumber) || '';
    var k = m.kotak();
    m.ukuranMM = [k.max[0] - k.min[0], k.max[1] - k.min[1], k.max[2] - k.min[2]];
    return m;
  }

  /* ==========================================================
     OBJ
     ----------------------------------------------------------
     Indeks OBJ bersifat GLOBAL untuk seluruh berkas, sedangkan
     tiap bagian butuh array titiknya sendiri. Jadi wajah
     dikumpulkan per kelompok dulu, lalu titiknya dipadatkan dan
     indeksnya dipetakan ulang per bagian.

     Nama bagian diambil dari `o`/`g`, dan `usemtl` dipakai bila
     berkas tidak punya keduanya — atlas anatomi sering hanya
     membedakan organ lewat material.
     ========================================================== */
  function dariOBJ(teks, opsi) {
    opsi = opsi || {};
    if (typeof teks !== 'string') teks = keTeks(teks);

    var vx = [], vn = [];           /* kolam titik & normal global */
    var kelompok = {};              /* kunci → { nama, wajah: [] } */
    var urutanKunci = [];
    var namaObjek = '', namaMaterial = '';
    var catatan = [];
    var adaPoligon = false;
    var pecah = opsi.pecah !== false;

    function kunciAktif() {
      if (!pecah) return 'model';
      return namaObjek || namaMaterial || 'model';
    }
    function kelompokAktif() {
      var k = kunciAktif();
      if (!kelompok[k]) {
        kelompok[k] = { nama: k, wajah: [] };
        urutanKunci.push(k);
      }
      return kelompok[k];
    }

    var baris = teks.split('\n');
    for (var i = 0; i < baris.length; i++) {
      var b = baris[i];
      if (!b) continue;
      /* buang \r dan spasi tepi tanpa regex per baris (lebih cepat) */
      var c0 = b.charCodeAt(0);
      if (c0 === 35 /* # */) continue;
      b = b.trim();
      if (!b || b.charAt(0) === '#') continue;

      var sp = b.indexOf(' ');
      var kata = sp < 0 ? b : b.slice(0, sp);
      var sisa = sp < 0 ? '' : b.slice(sp + 1);

      if (kata === 'v') {
        var pv = pisah(sisa);
        vx.push(+pv[0], +pv[1], +pv[2]);
      } else if (kata === 'vn') {
        var pn = pisah(sisa);
        vn.push(+pn[0], +pn[1], +pn[2]);
      } else if (kata === 'f') {
        var sudut = pisah(sisa);
        if (sudut.length < 3) continue;
        if (sudut.length > 3) adaPoligon = true;
        var g = kelompokAktif();
        /* kipas dari titik pertama */
        for (var s = 1; s + 1 < sudut.length; s++) {
          g.wajah.push(
            uraiSudut(sudut[0], vx.length / 3, vn.length / 3),
            uraiSudut(sudut[s], vx.length / 3, vn.length / 3),
            uraiSudut(sudut[s + 1], vx.length / 3, vn.length / 3)
          );
        }
      } else if (kata === 'o' || kata === 'g') {
        namaObjek = sisa.trim();
      } else if (kata === 'usemtl') {
        namaMaterial = sisa.trim();
        /* material baru dianggap batas bagian hanya bila belum ada nama objek */
        if (!namaObjek) kelompokAktif();
      }
    }

    if (adaPoligon) catatan.push('Poligon dipecah menjadi segitiga (kipas).');
    if (!vx.length) throw new Error('OBJ tidak memuat satu pun titik (v).');

    var punyaNormal = vn.length > 0;
    var bagian = [];
    var totalTri = 0;

    for (var q = 0; q < urutanKunci.length; q++) {
      var kel = kelompok[urutanKunci[q]];
      if (!kel.wajah.length) continue;

      var peta = new Map();
      var vertB = [], normB = [], triB = [];

      for (var w = 0; w < kel.wajah.length; w++) {
        var su = kel.wajah[w];
        var kunci = su.v + (punyaNormal && su.n >= 0 ? ':' + su.n : '');
        var idx = peta.get(kunci);
        if (idx === undefined) {
          idx = vertB.length / 3;
          peta.set(kunci, idx);
          vertB.push(vx[su.v * 3], vx[su.v * 3 + 1], vx[su.v * 3 + 2]);
          if (punyaNormal && su.n >= 0) {
            normB.push(vn[su.n * 3], vn[su.n * 3 + 1], vn[su.n * 3 + 2]);
          }
        }
        triB.push(idx);
      }

      totalTri += triB.length / 3;
      if (totalTri > MAKS_SEGITIGA) {
        catatan.push('Model dipotong pada ' + MAKS_SEGITIGA.toLocaleString('id-ID') + ' segitiga.');
        break;
      }

      var vertA = new Float32Array(vertB);
      var normA = (punyaNormal && normB.length === vertB.length) ? new Float32Array(normB) : null;
      if (punyaNormal && !normA) catatan.push('Normal berkas tidak lengkap; dihitung ulang.');

      bagian.push(bagianBaru(kel.nama, bikinMesh(vertA, normA, triB, {
        sumber: opsi.sumber || '', desc: kel.nama
      }), bagian.length));
    }

    if (!bagian.length) throw new Error('OBJ tidak memuat satu pun wajah (f).');
    if (!punyaNormal) catatan.push('Berkas tanpa vn; normal per titik dihitung dari geometri.');

    return { bagian: bagian, format: 'OBJ', catatan: catatan };
  }

  /* Pisah berdasarkan spasi/tab beruntun tanpa membuat elemen kosong */
  function pisah(s) {
    var keluar = [], mulai = -1;
    for (var i = 0; i <= s.length; i++) {
      var c = i < s.length ? s.charCodeAt(i) : 32;
      if (c === 32 || c === 9 || c === 13) {
        if (mulai >= 0) { keluar.push(s.slice(mulai, i)); mulai = -1; }
      } else if (mulai < 0) mulai = i;
    }
    return keluar;
  }

  /* "12", "12/3", "12//4", "12/3/4", dan indeks negatif (relatif) */
  function uraiSudut(s, jmlV, jmlN) {
    var g1 = s.indexOf('/');
    var v, n = -1;
    if (g1 < 0) {
      v = parseInt(s, 10);
    } else {
      v = parseInt(s.slice(0, g1), 10);
      var g2 = s.indexOf('/', g1 + 1);
      if (g2 >= 0 && g2 + 1 < s.length) n = parseInt(s.slice(g2 + 1), 10);
    }
    v = v < 0 ? jmlV + v : v - 1;                 /* negatif = relatif dari akhir */
    if (n !== -1 && !isNaN(n)) n = n < 0 ? jmlN + n : n - 1; else n = -1;
    return { v: v, n: n };
  }

  /* ==========================================================
     STL
     ----------------------------------------------------------
     STL tidak punya titik bersama: setiap segitiga menulis ulang
     tiga titiknya. Kalau dibiarkan, render terlihat berfaset dan
     memori tiga kali lebih besar. Jadi titik DILAS berdasarkan
     posisi (dibulatkan ke mikrometer), lalu normal dihitung ulang
     per titik. Normal facet dari berkas sengaja diabaikan karena
     tidak bisa menghasilkan bayangan mulus.
     ========================================================== */
  function dariSTL(data, opsi) {
    opsi = opsi || {};
    var u8 = keU8(data);
    var biner = stlBiner(u8);
    var hasil = biner ? stlDariBiner(u8, opsi) : stlDariTeks(keTeks(u8), opsi);
    hasil.format = biner ? 'STL biner' : 'STL teks';
    return hasil;
  }

  /* Penentu biner/teks: panjang berkas harus tepat 84 + n*50.
     Mengandalkan kata "solid" tidak aman — STL biner boleh saja
     memulai 80 byte judulnya dengan kata itu. */
  function stlBiner(u8) {
    if (u8.length < 84) return false;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var jml = dv.getUint32(80, true);
    return 84 + jml * 50 === u8.length;
  }

  function stlDariBiner(u8, opsi) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var jml = dv.getUint32(80, true);
    var catatan = [];
    var terpotong = false;
    if (jml > MAKS_SEGITIGA) { jml = MAKS_SEGITIGA; terpotong = true; }

    var las = new Las();
    var tri = [];
    var pos = 84;
    for (var t = 0; t < jml; t++) {
      pos += 12;                                   /* normal facet dilewati */
      for (var k = 0; k < 3; k++) {
        tri.push(las.tambah(
          dv.getFloat32(pos, true),
          dv.getFloat32(pos + 4, true),
          dv.getFloat32(pos + 8, true)));
        pos += 12;
      }
      pos += 2;                                    /* atribut */
    }
    if (terpotong) catatan.push('STL dipotong pada ' + MAKS_SEGITIGA.toLocaleString('id-ID') + ' segitiga.');
    catatan.push('Titik dilas (' + las.jumlah().toLocaleString('id-ID') +
                 ' unik dari ' + (jml * 3).toLocaleString('id-ID') + '); normal dihitung ulang.');

    var nama = judulSTL(u8) || opsi.nama || 'model';
    return {
      bagian: [bagianBaru(nama, bikinMesh(las.selesai(), null, tri, {
        sumber: opsi.sumber || '', desc: nama, terpotong: terpotong
      }), 0)],
      catatan: catatan
    };
  }

  function judulSTL(u8) {
    var s = '';
    for (var i = 0; i < 80; i++) {
      var c = u8[i];
      if (c === 0) break;
      if (c >= 32 && c < 127) s += String.fromCharCode(c);
    }
    return s.trim();
  }

  function stlDariTeks(teks, opsi) {
    var las = new Las();
    var tri = [];
    var nama = opsi.nama || '';
    var catatan = [];
    var baris = teks.split('\n');
    for (var i = 0; i < baris.length; i++) {
      var b = baris[i].trim();
      if (!b) continue;
      if (b.charCodeAt(0) === 115 /* s */ && b.slice(0, 5) === 'solid') {
        if (!nama) nama = b.slice(5).trim();
        continue;
      }
      if (b.charCodeAt(0) !== 118 /* v */ || b.slice(0, 6) !== 'vertex') continue;
      var p = pisah(b.slice(6));
      tri.push(las.tambah(+p[0], +p[1], +p[2]));
    }
    if (tri.length % 3 !== 0) {
      catatan.push('Jumlah titik bukan kelipatan tiga; sisa dibuang.');
      tri.length -= tri.length % 3;
    }
    if (!tri.length) throw new Error('STL teks tidak memuat satu pun "vertex".');
    catatan.push('Titik dilas (' + las.jumlah().toLocaleString('id-ID') + ' unik); normal dihitung ulang.');
    nama = nama || 'model';
    return {
      bagian: [bagianBaru(nama, bikinMesh(las.selesai(), null, tri, {
        sumber: opsi.sumber || '', desc: nama
      }), 0)],
      catatan: catatan
    };
  }

  /* Pengelas titik. Kunci dibulatkan ke mikrometer: cukup rapat untuk
     data anatomi bersatuan milimeter, cukup kasar untuk memaafkan
     galat float32 di berkas STL. */
  function Las() {
    this.peta = new Map();
    this.v = [];
  }
  Las.prototype.tambah = function (x, y, z) {
    var k = Math.round(x * 1000) + '|' + Math.round(y * 1000) + '|' + Math.round(z * 1000);
    var i = this.peta.get(k);
    if (i !== undefined) return i;
    i = this.v.length / 3;
    this.peta.set(k, i);
    this.v.push(x, y, z);
    return i;
  };
  Las.prototype.jumlah = function () { return this.v.length / 3; };
  Las.prototype.selesai = function () {
    var a = new Float32Array(this.v);
    this.peta.clear();
    this.v = null;
    return a;
  };

  /* ==========================================================
     Pemuat serba bisa
     ========================================================== */
  function muat(nama, data, opsi) {
    opsi = opsi || {};
    opsi.sumber = opsi.sumber || nama || '';
    opsi.nama = opsi.nama || bersihkanNama(nama);
    var n = (nama || '').toLowerCase();

    if (/\.obj$/.test(n)) return dariOBJ(data, opsi);
    if (/\.stl$/.test(n)) return dariSTL(data, opsi);
    if (/\.(glb|gltf)$/.test(n)) {
      throw new Error('glTF/GLB belum didukung: berkas modern memakai ' +
        'EXT_meshopt_compression / KHR_mesh_quantization yang butuh dekoder WASM. ' +
        'Konversikan ke OBJ atau STL terlebih dahulu.');
    }
    /* tanpa ekstensi: tebak dari isi */
    var u8 = typeof data === 'string' ? null : keU8(data);
    if (u8 && stlBiner(u8)) return dariSTL(u8, opsi);
    var teks = typeof data === 'string' ? data : keTeks(u8);
    if (/^\s*solid\b/.test(teks.slice(0, 200))) return dariSTL(teks, opsi);
    return dariOBJ(teks, opsi);
  }

  function bersihkanNama(nama) {
    if (!nama) return '';
    var s = String(nama).replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');
    return s.replace(/[_+]+/g, ' ').trim();
  }

  function keU8(d) {
    if (!d) throw new Error('Data model kosong.');
    if (d instanceof Uint8Array) return d;
    if (typeof ArrayBuffer !== 'undefined' && d instanceof ArrayBuffer) return new Uint8Array(d);
    if (d.buffer) return new Uint8Array(d.buffer, d.byteOffset || 0, d.byteLength);
    if (typeof d === 'string') {
      var u = new Uint8Array(d.length);
      for (var i = 0; i < d.length; i++) u[i] = d.charCodeAt(i) & 0xFF;
      return u;
    }
    throw new Error('Bentuk data model tidak dikenali.');
  }

  function keTeks(d) {
    if (typeof d === 'string') return d;
    var u8 = keU8(d);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    var s = '';
    for (var i = 0; i < u8.length; i += 8192) {
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 8192, u8.length)));
    }
    return s;
  }

  /* ==========================================================
     Bagian
     ========================================================== */
  function bagianBaru(nama, mesh, urutan) {
    return {
      nama: nama || ('bagian ' + (urutan + 1)),
      mesh: mesh,
      warna: warnaOrgan(nama, urutan),
      tampil: true,
      alfa: 1,
      geser: [0, 0, 0],
      skala: 1
    };
  }

  /* ==========================================================
     Adegan
     ----------------------------------------------------------
     Satu z-buffer bersama untuk semua bagian, plus satu buffer ID
     per piksel. Bagian buram digambar lebih dulu (tulis z), bagian
     tembus cahaya menyusul diurutkan dari jauh ke dekat dan hanya
     MENGUJI z tanpa menulisnya — tanpa itu dua lapis transparan
     saling menghapus tergantung urutan gambar.
     ========================================================== */
  function Adegan(bagian, opsi) {
    this.bagian = bagian || [];
    this.opsi = opsi || {};
    this.pilih = -1;
    this._id = null;
    this._lebar = 0;
    this._tinggi = 0;
  }

  Adegan.prototype.jumlahSegitiga = function () {
    var j = 0;
    for (var i = 0; i < this.bagian.length; i++) j += this.bagian[i].mesh.jumlahSegitiga();
    return j;
  };

  Adegan.prototype.info = function () {
    return this.bagian.length + ' bagian · ' +
      this.jumlahSegitiga().toLocaleString('id-ID') + ' segitiga';
  };

  /* Kotak pembatas gabungan, sudah memperhitungkan geser & skala */
  Adegan.prototype.kotak = function () {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    var ada = false;
    for (var i = 0; i < this.bagian.length; i++) {
      var b = this.bagian[i];
      var k = b.mesh.kotak();
      for (var t = 0; t < 3; t++) {
        var lo = k.min[t] * b.skala + b.geser[t];
        var hi = k.max[t] * b.skala + b.geser[t];
        if (lo < mn[t]) mn[t] = lo;
        if (hi > mx[t]) mx[t] = hi;
      }
      ada = true;
    }
    if (!ada) return { min: [0, 0, 0], max: [0, 0, 0], r: 1, pusat: [0, 0, 0] };
    return {
      min: mn, max: mx,
      pusat: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
      r: 0.5 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1
    };
  };

  /* Titik berat kotak satu bagian, dalam koordinat model (tanpa geser) */
  function pusatBagian(b) {
    var k = b.mesh.kotak();
    return [(k.min[0] + k.max[0]) / 2, (k.min[1] + k.max[1]) / 2, (k.min[2] + k.max[2]) / 2];
  }

  /* ----------------------------------------------------------
     Ledakkan: geser tiap bagian menjauhi pusat adegan.
     Arahnya dari pusat adegan ke pusat bagian, jadi organ yang
     memang di tepi bergerak lebih jauh — susunannya tetap terbaca
     sebagai tubuh, bukan berhamburan acak.
     ---------------------------------------------------------- */
  Adegan.prototype.ledak = function (faktor) {
    var k = this.kotakAsli();
    for (var i = 0; i < this.bagian.length; i++) {
      var b = this.bagian[i];
      var p = pusatBagian(b);
      var dx = p[0] - k.pusat[0], dy = p[1] - k.pusat[1], dz = p[2] - k.pusat[2];
      var j = Math.hypot(dx, dy, dz);
      if (j < 1e-6) { b.geser = [0, 0, 0]; continue; }
      b.geser = [dx / j * faktor * k.r, dy / j * faktor * k.r, dz / j * faktor * k.r];
    }
    return this;
  };

  /* Kotak tanpa geser — acuan tetap supaya ledak() tidak menumpuk */
  Adegan.prototype.kotakAsli = function () {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < this.bagian.length; i++) {
      var k = this.bagian[i].mesh.kotak(), s = this.bagian[i].skala;
      for (var t = 0; t < 3; t++) {
        if (k.min[t] * s < mn[t]) mn[t] = k.min[t] * s;
        if (k.max[t] * s > mx[t]) mx[t] = k.max[t] * s;
      }
    }
    if (!isFinite(mn[0])) return { min: [0, 0, 0], max: [0, 0, 0], pusat: [0, 0, 0], r: 1 };
    return {
      min: mn, max: mx,
      pusat: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
      r: 0.5 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1
    };
  };

  Adegan.prototype.kembalikan = function () {
    for (var i = 0; i < this.bagian.length; i++) {
      this.bagian[i].geser = [0, 0, 0];
      this.bagian[i].tampil = true;
      this.bagian[i].alfa = 1;
    }
    this.pilih = -1;
    return this;
  };

  /* Sorot satu organ: yang lain jadi tembus cahaya, tidak disembunyikan,
     supaya posisi organ terpilih di dalam tubuh tetap terbaca. */
  Adegan.prototype.isolasi = function (idx, alfaLain) {
    var a = alfaLain === undefined ? 0.12 : alfaLain;
    for (var i = 0; i < this.bagian.length; i++) {
      this.bagian[i].tampil = true;
      this.bagian[i].alfa = (i === idx) ? 1 : a;
    }
    this.pilih = idx;
    return this;
  };

  Adegan.prototype.indeksNama = function (nama) {
    var n = String(nama || '').toLowerCase();
    if (!n) return -1;
    var i;
    for (i = 0; i < this.bagian.length; i++) {
      if (this.bagian[i].nama.toLowerCase() === n) return i;
    }
    for (i = 0; i < this.bagian.length; i++) {
      if (this.bagian[i].nama.toLowerCase().indexOf(n) >= 0) return i;
    }
    return -1;
  };

  /* ----------------------------------------------------------
     Render
     ---------------------------------------------------------- */
  function silangi(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalkan(v) {
    var p = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / p, v[1] / p, v[2] / p];
  }

  Adegan.prototype.render = function (o) {
    o = o || {};
    var ukuran = Math.max(32, Math.round(o.ukuran || 256));
    var lebar = ukuran, tinggi = ukuran;
    var az = o.azimut || 0, el = o.elevasi || 0;

    /* kesepakatan kamera sama dengan VOLUME.proyeksi() dan Mesh.render() */
    var d = normalkan([Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)]);
    var kanan = silangi([0, 0, 1], d);
    if (Math.hypot(kanan[0], kanan[1], kanan[2]) < 1e-6) kanan = [1, 0, 0];
    kanan = normalkan(kanan);
    var atas = normalkan(silangi(d, kanan));

    var kotak = this.kotak();
    var fov = o.fov || kotak.r * 2 * 1.08;
    var pusat = o.pusat || kotak.pusat;
    var skalaLayar = ukuran / fov;

    var latar = o.latar || [0, 0, 0];
    var ambien = o.ambien !== undefined ? o.ambien : 0.22;
    var kilau = o.kilau !== undefined ? o.kilau : 0.32;
    var tepi = o.tepi !== undefined ? o.tepi : 0.34;
    var sorotIdx = o.sorot !== undefined ? o.sorot : this.pilih;

    var piksel = new Uint8Array(lebar * tinggi * 3);
    var zbuf = new Float32Array(lebar * tinggi);
    var idbuf = new Int32Array(lebar * tinggi);
    var i;
    for (i = 0; i < zbuf.length; i++) { zbuf[i] = Infinity; idbuf[i] = -1; }
    for (i = 0; i < piksel.length; i += 3) {
      piksel[i] = latar[0]; piksel[i + 1] = latar[1]; piksel[i + 2] = latar[2];
    }

    /* urutkan: buram dulu, lalu tembus cahaya dari jauh ke dekat */
    var buram = [], tembus = [];
    for (i = 0; i < this.bagian.length; i++) {
      var b = this.bagian[i];
      if (!b.tampil || b.alfa <= 0.004 || b.mesh.kosong()) continue;
      var p = pusatBagian(b);
      var kedalaman =
        (p[0] * b.skala + b.geser[0] - pusat[0]) * d[0] +
        (p[1] * b.skala + b.geser[1] - pusat[1]) * d[1] +
        (p[2] * b.skala + b.geser[2] - pusat[2]) * d[2];
      (b.alfa >= 0.996 ? buram : tembus).push({ idx: i, z: kedalaman });
    }
    tembus.sort(function (a, c) { return c.z - a.z; });

    var ctx = {
      lebar: lebar, tinggi: tinggi, piksel: piksel, zbuf: zbuf, idbuf: idbuf,
      d: d, kanan: kanan, atas: atas, pusat: pusat, skala: skalaLayar,
      ambien: ambien, kilau: kilau, tepi: tepi
    };

    for (i = 0; i < buram.length; i++) {
      gambarBagian(ctx, this.bagian[buram[i].idx], buram[i].idx, true, sorotIdx === buram[i].idx);
    }
    for (i = 0; i < tembus.length; i++) {
      gambarBagian(ctx, this.bagian[tembus[i].idx], tembus[i].idx, false, sorotIdx === tembus[i].idx);
    }

    this._id = idbuf;
    this._lebar = lebar;
    this._tinggi = tinggi;

    return jadikanImg(piksel, lebar, tinggi, fov / ukuran, this);
  };

  function gambarBagian(ctx, b, id, tulisZ, disorot) {
    var mesh = b.mesh;
    var vert = mesh.vert, norm = mesh.norm, tri = mesh.tri;
    var n = vert.length / 3;
    if (!tri.length) return;

    var lebar = ctx.lebar, tinggi = ctx.tinggi;
    var d = ctx.d, kanan = ctx.kanan, atas = ctx.atas, pusat = ctx.pusat, sk = ctx.skala;
    var s = b.skala, gx = b.geser[0], gy = b.geser[1], gz = b.geser[2];

    var sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
    var nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);

    for (var v = 0; v < n; v++) {
      var px = vert[v * 3] * s + gx - pusat[0];
      var py = vert[v * 3 + 1] * s + gy - pusat[1];
      var pz = vert[v * 3 + 2] * s + gz - pusat[2];
      sx[v] = (px * kanan[0] + py * kanan[1] + pz * kanan[2]) * sk + lebar / 2;
      sy[v] = tinggi / 2 - (px * atas[0] + py * atas[1] + pz * atas[2]) * sk;
      sz[v] = px * d[0] + py * d[1] + pz * d[2];

      var mx = norm[v * 3], my = norm[v * 3 + 1], mz = norm[v * 3 + 2];
      nx[v] = mx * kanan[0] + my * kanan[1] + mz * kanan[2];
      ny[v] = mx * atas[0] + my * atas[1] + mz * atas[2];
      nz[v] = mx * d[0] + my * d[1] + mz * d[2];
    }

    var warna = b.warna;
    var wr = warna[0], wg = warna[1], wb = warna[2];
    if (disorot) {                                  /* organ terpilih dicerahkan */
      wr = Math.min(255, wr * 1.25 + 26);
      wg = Math.min(255, wg * 1.25 + 26);
      wb = Math.min(255, wb * 1.25 + 26);
    }
    var alfa = b.alfa;
    var ambien = ctx.ambien, kilau = ctx.kilau;
    var tepi = ctx.tepi * (disorot ? 1.7 : 1);
    var piksel = ctx.piksel, zbuf = ctx.zbuf, idbuf = ctx.idbuf;
    /* piksel ID hanya ditulis oleh permukaan yang cukup pekat, supaya
       klik tidak menangkap organ yang sedang dipudarkan */
    var bolehID = alfa >= 0.5;

    for (var t = 0; t < tri.length; t += 3) {
      var a = tri[t], c = tri[t + 1], e = tri[t + 2];
      var x0 = sx[a], y0 = sy[a], x1 = sx[c], y1 = sy[c], x2 = sx[e], y2 = sy[e];
      var luas = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (luas === 0) continue;

      var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      var maksX = Math.min(lebar - 1, Math.ceil(Math.max(x0, x1, x2)));
      var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      var maksY = Math.min(tinggi - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maksX || minY > maksY) continue;

      var inv = 1 / luas;
      var z0 = sz[a], z1 = sz[c], z2 = sz[e];

      for (var yy = minY; yy <= maksY; yy++) {
        var pyc = yy + 0.5;
        for (var xx = minX; xx <= maksX; xx++) {
          var pxc = xx + 0.5;
          var l0 = ((x1 - pxc) * (y2 - pyc) - (x2 - pxc) * (y1 - pyc)) * inv;
          if (l0 < 0) continue;
          var l1 = ((x2 - pxc) * (y0 - pyc) - (x0 - pxc) * (y2 - pyc)) * inv;
          if (l1 < 0) continue;
          var l2 = 1 - l0 - l1;
          if (l2 < 0) continue;

          var zz = l0 * z0 + l1 * z1 + l2 * z2;
          var pi = yy * lebar + xx;
          if (zz >= zbuf[pi]) continue;
          if (tulisZ) zbuf[pi] = zz;

          var mnx = l0 * nx[a] + l1 * nx[c] + l2 * nx[e];
          var mny = l0 * ny[a] + l1 * ny[c] + l2 * ny[e];
          var mnz = l0 * nz[a] + l1 * nz[c] + l2 * nz[e];
          var pj = Math.sqrt(mnx * mnx + mny * mny + mnz * mnz) || 1;
          mnz /= pj;

          var lamb = mnz < 0 ? -mnz : mnz;
          var spek = kilau ? Math.pow(lamb, 22) * kilau : 0;
          var rim = tepi ? Math.pow(1 - lamb, 2.2) * tepi : 0;
          var g = ambien + (1 - ambien) * lamb;

          var r = wr * g + 255 * spek + wr * rim * 0.35;
          var gg = wg * g + 255 * spek + wg * rim * 0.45;
          var bb = wb * g + 255 * spek + wb * rim * 0.65;
          if (r > 255) r = 255;
          if (gg > 255) gg = 255;
          if (bb > 255) bb = 255;

          var o3 = pi * 3;
          if (alfa >= 0.996) {
            piksel[o3] = r; piksel[o3 + 1] = gg; piksel[o3 + 2] = bb;
          } else {
            var ia = 1 - alfa;
            piksel[o3] = r * alfa + piksel[o3] * ia;
            piksel[o3 + 1] = gg * alfa + piksel[o3 + 1] * ia;
            piksel[o3 + 2] = bb * alfa + piksel[o3 + 2] * ia;
          }
          if (bolehID) idbuf[pi] = id;
        }
      }
    }
  }

  /* ----------------------------------------------------------
     Pemilihan organ dari koordinat piksel render.
     Radius dipakai karena organ kecil (pankreas, mata) sulit
     dikenai tepat, terlebih dengan gerakan tangan.
     ---------------------------------------------------------- */
  Adegan.prototype.pilihDi = function (x, y, radius) {
    if (!this._id) return -1;
    x = Math.round(x); y = Math.round(y);
    var lebar = this._lebar, tinggi = this._tinggi, id = this._id;
    if (x >= 0 && y >= 0 && x < lebar && y < tinggi) {
      var langsung = id[y * lebar + x];
      if (langsung >= 0) return langsung;
    }
    var r = radius === undefined ? 6 : radius;
    if (r <= 0) return -1;
    /* cincin membesar: yang paling dekat menang */
    for (var d = 1; d <= r; d++) {
      for (var dy = -d; dy <= d; dy++) {
        for (var dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          var px = x + dx, py = y + dy;
          if (px < 0 || py < 0 || px >= lebar || py >= tinggi) continue;
          var v = id[py * lebar + px];
          if (v >= 0) return v;
        }
      }
    }
    return -1;
  };

  function jadikanImg(piksel, lebar, tinggi, mmPerPx, adegan) {
    return {
      rows: tinggi, cols: lebar, frames: 1, frame: 0,
      samplesPerPixel: 3, bitsAllocated: 8, signed: false,
      photometric: 'RGB', planar: 0, slope: 1, intercept: 0,
      modality: '', rescaleType: '',
      windowCenter: 128, windowWidth: 256,
      pixelSpacing: [mmPerPx, mmPerPx], sliceThickness: 0,
      pixels: piksel, min: 0, max: 255,
      encapsulated: false, mime: null, blobBytes: null,
      derived: 'Atlas anatomi 3D (' + adegan.bagian.length + ' bagian)'
    };
  }

  /* ==========================================================
     Pembungkus seri — pola yang sama dengan volume.js & mesh.js,
     jadi atlas bisa dibuka di viewer 2D tanpa jalur render baru.
     ========================================================== */
  Adegan.prototype.seriAtlas = function (o) {
    o = o || {};
    var self = this;
    var jml = o.jumlah || 24;
    var cache = {};
    return {
      desc: 'Atlas anatomi (' + jml + ' sudut)',
      number: 940, modality: '', count: jml,
      key: 'ATLAS#' + this.bagian.length + '#' + jml + '#' + (o.ukuran || 256),
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
            latar: o.latar, ambien: o.ambien, kilau: o.kilau, tepi: o.tepi
          });
        } catch (e) { return Promise.reject(e); }
        cache[i] = img;
        return Promise.resolve(img);
      },
      getTags: function () {
        var nama = self.bagian.map(function (b) { return b.nama; }).join('\\');
        return [
          { tag: '(0008,0008)', key: '00080008', vr: 'CS', name: 'ImageType',
            value: 'DERIVED\\SECONDARY\\SURFACE RENDERING' },
          { tag: '(0008,2111)', key: '00082111', vr: 'ST', name: 'DerivationDescription',
            value: 'Atlas anatomi dari model permukaan luar, ' +
                   self.jumlahSegitiga() + ' segitiga, dirender di peramban' },
          { tag: '(0028,0002)', key: '00280002', vr: 'US', name: 'SamplesPerPixel', value: '3' },
          { tag: '(0028,0004)', key: '00280004', vr: 'CS', name: 'PhotometricInterpretation', value: 'RGB' },
          { tag: '(0062,0002)', key: '00620002', vr: 'SQ', name: 'SegmentSequence', value: nama }
        ];
      }
    };
  };

  global.MODEL = {
    muat: muat,
    dariOBJ: dariOBJ,
    dariSTL: dariSTL,
    Adegan: Adegan,
    bagianBaru: bagianBaru,
    warnaOrgan: warnaOrgan,
    hitungNormal: hitungNormal,
    MAKS_SEGITIGA: MAKS_SEGITIGA
  };
})(window);
