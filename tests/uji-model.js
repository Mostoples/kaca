/* ==========================================================
   KACA — uji pemuat model & adegan atlas
   ----------------------------------------------------------
   Acuannya kubus: jumlah titik, jumlah segitiga, arah normal,
   dan letak di layar semuanya bisa dihitung dengan tangan.

   Kubus juga menguji hal yang bola tidak bisa: pelasan titik.
   Delapan sudut kubus dipakai berulang oleh tiga sisi masing-
   masing, jadi STL yang menulis 36 titik harus kembali menjadi
   8 titik unik setelah dilas.
   ========================================================== */
(function (global) {
  'use strict';

  var MO = global.MODEL, ME = global.MESH;
  var uji = (global.UJI && global.UJI.daftar) || [];
  function it(nama, fn) { uji.push({ nama: nama, fn: fn }); }

  function gagal(p) { throw new Error(p); }
  function samaDengan(a, b, apa) { if (a !== b) gagal(apa + ': dapat ' + a + ', diharapkan ' + b); }
  function hampirSama(a, b, tol, apa) {
    if (Math.abs(a - b) > tol) gagal(apa + ': dapat ' + a + ', diharapkan ' + b + ' (±' + tol + ')');
  }
  function benar(v, apa) { if (!v) gagal(apa); }

  /* ---------- pembangkit OBJ kubus ----------
     Delapan sudut, urutan sisi dipilih supaya putarannya berlawanan
     arah jam dilihat DARI LUAR, sehingga normal hasil hitungan
     menunjuk keluar. Kalau urutan ini dibalik, uji arah normal
     di bawah akan langsung gagal — memang itu gunanya. */
  var SISI = [
    [5, 6, 7, 8],   /* z = +h */
    [1, 4, 3, 2],   /* z = -h */
    [1, 2, 6, 5],   /* y = -h */
    [4, 8, 7, 3],   /* y = +h */
    [1, 5, 8, 4],   /* x = -h */
    [2, 3, 7, 6]    /* x = +h */
  ];

  function titikKubus(cx, cy, cz, s) {
    var h = s / 2;
    return [
      [cx - h, cy - h, cz - h], [cx + h, cy - h, cz - h],
      [cx + h, cy + h, cz - h], [cx - h, cy + h, cz - h],
      [cx - h, cy - h, cz + h], [cx + h, cy - h, cz + h],
      [cx + h, cy + h, cz + h], [cx - h, cy + h, cz + h]
    ];
  }

  /* segiempat = true → sisi ditulis sebagai poligon 4 titik */
  function objKubus(cx, cy, cz, s, nama, segiempat) {
    var t = titikKubus(cx, cy, cz, s);
    var b = ['# kubus uji'];
    if (nama) b.push('o ' + nama);
    for (var i = 0; i < 8; i++) b.push('v ' + t[i][0] + ' ' + t[i][1] + ' ' + t[i][2]);
    for (var f = 0; f < 6; f++) {
      var q = SISI[f];
      if (segiempat) {
        b.push('f ' + q[0] + ' ' + q[1] + ' ' + q[2] + ' ' + q[3]);
      } else {
        b.push('f ' + q[0] + ' ' + q[1] + ' ' + q[2]);
        b.push('f ' + q[0] + ' ' + q[2] + ' ' + q[3]);
      }
    }
    return b.join('\n') + '\n';
  }

  /* ---------- OBJ ---------- */

  it('OBJ: kubus segitiga → 8 titik, 12 segitiga', function () {
    var h = MO.dariOBJ(objKubus(0, 0, 0, 10, 'kubus', false));
    samaDengan(h.bagian.length, 1, 'jumlah bagian');
    var m = h.bagian[0].mesh;
    samaDengan(m.jumlahTitik(), 8, 'jumlah titik');
    samaDengan(m.jumlahSegitiga(), 12, 'jumlah segitiga');
    samaDengan(h.format, 'OBJ', 'format');
  });

  it('OBJ: poligon 4 titik dipecah jadi 2 segitiga', function () {
    var h = MO.dariOBJ(objKubus(0, 0, 0, 10, 'kubus', true));
    samaDengan(h.bagian[0].mesh.jumlahSegitiga(), 12, 'segitiga hasil kipas');
    benar(h.catatan.join(' ').indexOf('Poligon dipecah') >= 0, 'catatan poligon tidak muncul');
  });

  it('OBJ: indeks negatif dibaca relatif dari akhir', function () {
    /* satu segitiga dengan indeks -3 -2 -1 */
    var teks = 'v 0 0 0\nv 10 0 0\nv 0 10 0\nf -3 -2 -1\n';
    var h = MO.dariOBJ(teks);
    var m = h.bagian[0].mesh;
    samaDengan(m.jumlahSegitiga(), 1, 'jumlah segitiga');
    samaDengan(m.jumlahTitik(), 3, 'jumlah titik');
    samaDengan(m.tri[0], 0, 'indeks 0');
    samaDengan(m.tri[2], 2, 'indeks 2');
  });

  it('OBJ: dua kelompok "o" jadi dua bagian bernama', function () {
    var a = objKubus(-20, 0, 0, 10, 'jantung', false);
    var b = objKubus(20, 0, 0, 10, 'hati', false);
    /* gabungkan: indeks kubus kedua harus digeser karena kolam titik global */
    var barisB = b.split('\n').map(function (l) {
      if (l.charAt(0) !== 'f') return l;
      return 'f ' + l.slice(2).split(' ').map(function (n) { return (+n) + 8; }).join(' ');
    }).join('\n');
    var h = MO.dariOBJ(a + barisB);
    samaDengan(h.bagian.length, 2, 'jumlah bagian');
    samaDengan(h.bagian[0].nama, 'jantung', 'nama bagian 1');
    samaDengan(h.bagian[1].nama, 'hati', 'nama bagian 2');
    samaDengan(h.bagian[0].mesh.jumlahTitik(), 8, 'titik bagian 1');
    samaDengan(h.bagian[1].mesh.jumlahTitik(), 8, 'titik bagian 2');
  });

  it('OBJ: pecah=false menyatukan semua kelompok', function () {
    var teks = objKubus(0, 0, 0, 10, 'satu', false) + objKubus(0, 0, 0, 10, 'dua', false)
      .split('\n').map(function (l) {
        if (l.charAt(0) !== 'f') return l;
        return 'f ' + l.slice(2).split(' ').map(function (n) { return (+n) + 8; }).join(' ');
      }).join('\n');
    var h = MO.dariOBJ(teks, { pecah: false });
    samaDengan(h.bagian.length, 1, 'jumlah bagian');
    samaDengan(h.bagian[0].mesh.jumlahSegitiga(), 24, 'segitiga gabungan');
  });

  it('OBJ: normal dari berkas dipakai apa adanya', function () {
    var teks = 'v 0 0 0\nv 10 0 0\nv 0 10 0\n' +
               'vn 0 0 1\nvn 0 0 1\nvn 0 0 1\n' +
               'f 1//1 2//2 3//3\n';
    var h = MO.dariOBJ(teks);
    var n = h.bagian[0].mesh.norm;
    hampirSama(n[2], 1, 1e-6, 'nz titik 0');
    benar(h.catatan.join(' ').indexOf('dihitung dari geometri') < 0, 'seharusnya tidak menghitung ulang');
  });

  it('OBJ: tanpa vn, normal kubus menunjuk keluar', function () {
    var h = MO.dariOBJ(objKubus(0, 0, 0, 10, 'kubus', false));
    var m = h.bagian[0].mesh;
    /* untuk kubus berpusat di titik asal, normal tiap sudut harus
       searah dengan vektor pusat→sudut */
    for (var v = 0; v < m.jumlahTitik(); v++) {
      var px = m.vert[v * 3], py = m.vert[v * 3 + 1], pz = m.vert[v * 3 + 2];
      var dot = px * m.norm[v * 3] + py * m.norm[v * 3 + 1] + pz * m.norm[v * 3 + 2];
      benar(dot > 0, 'normal titik ' + v + ' menunjuk ke dalam (dot ' + dot.toFixed(3) + ')');
    }
  });

  it('OBJ: berkas tanpa titik ditolak dengan pesan jelas', function () {
    try {
      MO.dariOBJ('# kosong\n');
      gagal('seharusnya melempar');
    } catch (e) {
      benar(/tidak memuat satu pun titik/.test(e.message), 'pesan galat: ' + e.message);
    }
  });

  /* ---------- STL ---------- */

  it('STL biner: bolak-balik lewat Mesh.stl() dan titik terlas', function () {
    var m = MO.dariOBJ(objKubus(0, 0, 0, 10, 'kubus', false)).bagian[0].mesh;
    var buf = m.stl('uji');
    var h = MO.dariSTL(buf, { nama: 'kubus' });
    samaDengan(h.format, 'STL biner', 'format');
    var m2 = h.bagian[0].mesh;
    samaDengan(m2.jumlahSegitiga(), 12, 'segitiga setelah dibaca ulang');
    /* 12 segitiga × 3 = 36 titik tertulis, harus dilas kembali jadi 8 */
    samaDengan(m2.jumlahTitik(), 8, 'titik setelah dilas');
  });

  it('STL biner: kotak pembatas bertahan setelah bolak-balik', function () {
    var m = MO.dariOBJ(objKubus(5, -3, 2, 10, 'k', false)).bagian[0].mesh;
    var h = MO.dariSTL(m.stl(), {});
    var k = h.bagian[0].mesh.kotak();
    hampirSama(k.min[0], 0, 1e-3, 'min x');
    hampirSama(k.max[0], 10, 1e-3, 'maks x');
    hampirSama(k.min[1], -8, 1e-3, 'min y');
    hampirSama(k.max[2], 7, 1e-3, 'maks z');
  });

  it('STL teks: "vertex" dibaca, nama solid dipakai', function () {
    var teks = [
      'solid jantung',
      'facet normal 0 0 1',
      '  outer loop',
      '    vertex 0 0 0',
      '    vertex 10 0 0',
      '    vertex 0 10 0',
      '  endloop',
      'endfacet',
      'endsolid jantung'
    ].join('\n');
    var h = MO.dariSTL(teks, {});
    samaDengan(h.format, 'STL teks', 'format');
    samaDengan(h.bagian[0].mesh.jumlahSegitiga(), 1, 'jumlah segitiga');
    samaDengan(h.bagian[0].nama, 'jantung', 'nama dari solid');
  });

  it('STL: biner dikenali dari panjang berkas, bukan kata "solid"', function () {
    /* judul 80 byte yang diawali "solid" tetapi isinya biner */
    var m = MO.dariOBJ(objKubus(0, 0, 0, 4, 'k', false)).bagian[0].mesh;
    var buf = m.stl();
    var u8 = new Uint8Array(buf);
    var kata = 'solid ';
    for (var i = 0; i < kata.length; i++) u8[i] = kata.charCodeAt(i);
    var h = MO.dariSTL(u8, {});
    samaDengan(h.format, 'STL biner', 'format harus tetap biner');
    samaDengan(h.bagian[0].mesh.jumlahSegitiga(), 12, 'jumlah segitiga');
  });

  it('muat(): memilih pengurai dari ekstensi', function () {
    var objTeks = objKubus(0, 0, 0, 10, 'k', false);
    samaDengan(MO.muat('organ.obj', objTeks).format, 'OBJ', 'ekstensi .obj');
    var m = MO.dariOBJ(objTeks).bagian[0].mesh;
    samaDengan(MO.muat('organ.stl', m.stl()).format, 'STL biner', 'ekstensi .stl');
  });

  it('muat(): glb ditolak dengan alasan yang menyebut WASM', function () {
    try {
      MO.muat('heart.glb', new Uint8Array(8));
      gagal('seharusnya melempar');
    } catch (e) {
      benar(/WASM/.test(e.message), 'pesan galat: ' + e.message);
      benar(/OBJ atau STL/.test(e.message), 'pesan harus menyarankan konversi');
    }
  });

  it('muat(): nama berkas jadi nama bagian yang bersih', function () {
    var m = MO.dariOBJ(objKubus(0, 0, 0, 6, '', false)).bagian[0].mesh;
    var h = MO.muat('model/anatomical+heart+3d.stl', m.stl());
    /* judul STL dari Mesh.stl() menang; yang diuji: tidak melempar
       dan nama tidak kosong */
    benar(h.bagian[0].nama.length > 0, 'nama bagian kosong');
  });

  /* ---------- warna ---------- */

  it('warnaOrgan(): nama dikenali, sisanya tetap berbeda', function () {
    var j = MO.warnaOrgan('Jantung', 0);
    benar(j[0] > j[1] && j[0] > j[2], 'jantung seharusnya kemerahan');
    var a = MO.warnaOrgan('entah apa', 0), b = MO.warnaOrgan('entah apa lain', 1);
    benar(a.join() !== b.join(), 'dua nama tak dikenal mendapat warna kembar');
  });

  /* ---------- adegan ---------- */

  function adeganDuaKubus() {
    var a = MO.dariOBJ(objKubus(-30, 0, 0, 20, 'kiri', false)).bagian[0];
    var b = MO.dariOBJ(objKubus(30, 0, 0, 20, 'kanan', false)).bagian[0];
    a.nama = 'kiri'; b.nama = 'kanan';
    return new MO.Adegan([a, b]);
  }

  it('Adegan: kotak gabungan mencakup semua bagian', function () {
    var ad = adeganDuaKubus();
    var k = ad.kotak();
    hampirSama(k.min[0], -40, 1e-3, 'min x');
    hampirSama(k.max[0], 40, 1e-3, 'maks x');
    hampirSama(k.pusat[0], 0, 1e-3, 'pusat x');
    samaDengan(ad.jumlahSegitiga(), 24, 'jumlah segitiga');
  });

  it('Adegan: ledak() menggeser menjauhi pusat, kembalikan() membatalkan', function () {
    var ad = adeganDuaKubus();
    ad.ledak(0.5);
    benar(ad.bagian[0].geser[0] < -1, 'bagian kiri harus bergeser ke -x');
    benar(ad.bagian[1].geser[0] > 1, 'bagian kanan harus bergeser ke +x');
    /* memanggil dua kali tidak boleh menumpuk */
    var g = ad.bagian[1].geser[0];
    ad.ledak(0.5);
    hampirSama(ad.bagian[1].geser[0], g, 1e-6, 'ledak() menumpuk');
    ad.kembalikan();
    hampirSama(ad.bagian[1].geser[0], 0, 1e-9, 'geser setelah kembalikan()');
  });

  it('Adegan: isolasi() memudarkan yang lain tanpa menyembunyikan', function () {
    var ad = adeganDuaKubus();
    ad.isolasi(1);
    samaDengan(ad.bagian[1].alfa, 1, 'alfa terpilih');
    benar(ad.bagian[0].alfa > 0 && ad.bagian[0].alfa < 0.3, 'alfa bagian lain');
    benar(ad.bagian[0].tampil, 'bagian lain tidak boleh disembunyikan');
    samaDengan(ad.pilih, 1, 'indeks terpilih');
  });

  it('Adegan: indeksNama() cocok tepat lalu sebagian', function () {
    var ad = adeganDuaKubus();
    samaDengan(ad.indeksNama('kanan'), 1, 'cocok tepat');
    samaDengan(ad.indeksNama('KIRI'), 0, 'tidak peka huruf besar');
    samaDengan(ad.indeksNama('kan'), 1, 'cocok sebagian');
    samaDengan(ad.indeksNama('limpa'), -1, 'tidak ada');
  });

  it('Adegan: render menghasilkan img RGB berukuran benar', function () {
    var img = adeganDuaKubus().render({ ukuran: 96 });
    samaDengan(img.cols, 96, 'lebar');
    samaDengan(img.rows, 96, 'tinggi');
    samaDengan(img.samplesPerPixel, 3, 'samplesPerPixel');
    samaDengan(img.photometric, 'RGB', 'photometric');
    samaDengan(img.pixels.length, 96 * 96 * 3, 'panjang piksel');
    benar(/Atlas anatomi/.test(img.derived), 'penanda derived: ' + img.derived);
  });

  it('Adegan: bagian +x tampil di paruh kanan layar', function () {
    /* azimut 0 → kanan layar = +x pasien (sama dengan VOLUME.proyeksi) */
    var ad = adeganDuaKubus();
    var img = ad.render({ ukuran: 96, azimut: 0 });
    var lebar = 96, kiriTerang = 0, kananTerang = 0;
    for (var y = 0; y < 96; y++) {
      for (var x = 0; x < lebar; x++) {
        var p = (y * lebar + x) * 3;
        var t = img.pixels[p] + img.pixels[p + 1] + img.pixels[p + 2];
        if (t > 30) { if (x < lebar / 2) kiriTerang++; else kananTerang++; }
      }
    }
    benar(kiriTerang > 50, 'paruh kiri kosong (' + kiriTerang + ')');
    benar(kananTerang > 50, 'paruh kanan kosong (' + kananTerang + ')');
    /* buffer ID: klik di tengah paruh kanan harus mengenai bagian "kanan" */
    var idKanan = ad.pilihDi(Math.round(lebar * 0.75), 48);
    samaDengan(idKanan, ad.indeksNama('kanan'), 'ID di paruh kanan');
    var idKiri = ad.pilihDi(Math.round(lebar * 0.25), 48);
    samaDengan(idKiri, ad.indeksNama('kiri'), 'ID di paruh kiri');
  });

  it('Adegan: pilihDi() di latar mengembalikan -1', function () {
    var ad = adeganDuaKubus();
    ad.render({ ukuran: 96 });
    samaDengan(ad.pilihDi(0, 0, 0), -1, 'sudut layar harus latar');
    samaDengan(ad.pilihDi(-5, -5, 0), -1, 'di luar layar');
  });

  it('Adegan: radius pilihDi() menangkap sasaran di dekatnya', function () {
    var ad = adeganDuaKubus();
    ad.render({ ukuran: 96 });
    /* cari satu piksel milik bagian 0, lalu klik 3 px di luarnya */
    var lebar = 96, tepiX = -1, tepiY = -1;
    for (var y = 0; y < 96 && tepiX < 0; y++) {
      for (var x = 0; x < lebar; x++) {
        if (ad.pilihDi(x, y, 0) === 0) { tepiX = x; tepiY = y; break; }
      }
    }
    benar(tepiX >= 0, 'tidak menemukan piksel bagian 0');
    samaDengan(ad.pilihDi(tepiX - 3, tepiY, 0), -1, 'tanpa radius harus -1');
    samaDengan(ad.pilihDi(tepiX - 3, tepiY, 6), 0, 'dengan radius harus 0');
  });

  it('Adegan: bagian tersembunyi tidak muncul di buffer ID', function () {
    var ad = adeganDuaKubus();
    ad.bagian[1].tampil = false;
    ad.render({ ukuran: 96 });
    var ada = false;
    for (var i = 0; i < ad._id.length; i++) if (ad._id[i] === 1) { ada = true; break; }
    benar(!ada, 'bagian tersembunyi masih tertulis di buffer ID');
  });

  it('Adegan: bagian sangat pudar tidak menangkap klik', function () {
    var ad = adeganDuaKubus();
    ad.isolasi(0);                                /* bagian 1 jadi alfa 0,12 */
    ad.render({ ukuran: 96 });
    var ada = false;
    for (var i = 0; i < ad._id.length; i++) if (ad._id[i] === 1) { ada = true; break; }
    benar(!ada, 'bagian beralfa 0,12 seharusnya tidak menulis ID');
  });

  it('Adegan: alfa mencampur warna, bukan menimpa', function () {
    var ad = adeganDuaKubus();
    ad.bagian[0].warna = [255, 255, 255];
    var penuh = ad.render({ ukuran: 96, azimut: 0 });
    ad.bagian[0].alfa = 0.4;
    var pudar = ad.render({ ukuran: 96, azimut: 0 });
    /* jumlahkan paruh kiri saja: harus jelas lebih gelap saat pudar */
    function terang(img) {
      var s = 0;
      for (var y = 0; y < 96; y++) {
        for (var x = 0; x < 48; x++) {
          var p = (y * 96 + x) * 3;
          s += img.pixels[p] + img.pixels[p + 1] + img.pixels[p + 2];
        }
      }
      return s;
    }
    benar(terang(pudar) < terang(penuh) * 0.7,
      'alfa tidak memudarkan (penuh ' + terang(penuh) + ', pudar ' + terang(pudar) + ')');
  });

  it('Adegan: sorot mencerahkan bagian terpilih', function () {
    var ad = adeganDuaKubus();
    function terangKanan(o) {
      var img = ad.render(o), s = 0;
      for (var y = 0; y < 96; y++) {
        for (var x = 48; x < 96; x++) {
          var p = (y * 96 + x) * 3;
          s += img.pixels[p] + img.pixels[p + 1] + img.pixels[p + 2];
        }
      }
      return s;
    }
    var biasa = terangKanan({ ukuran: 96, azimut: 0, sorot: -1 });
    var disorot = terangKanan({ ukuran: 96, azimut: 0, sorot: 1 });
    benar(disorot > biasa, 'sorot tidak mencerahkan (' + biasa + ' → ' + disorot + ')');
  });

  it('Adegan: geser bagian menggeser piksel di layar', function () {
    var ad = adeganDuaKubus();
    ad.bagian[1].tampil = false;                  /* sisakan kubus kiri saja */
    function pusatX(img) {
      var jml = 0, total = 0;
      for (var y = 0; y < 96; y++) {
        for (var x = 0; x < 96; x++) {
          var p = (y * 96 + x) * 3;
          if (img.pixels[p] + img.pixels[p + 1] + img.pixels[p + 2] > 30) { total += x; jml++; }
        }
      }
      return jml ? total / jml : -1;
    }
    /* pusat & fov dipatok supaya perbandingan tidak terganggu
       perubahan kotak pembatas */
    var tetap = { ukuran: 96, azimut: 0, pusat: [0, 0, 0], fov: 200 };
    var sebelum = pusatX(ad.render(tetap));
    ad.bagian[0].geser = [40, 0, 0];
    var sesudah = pusatX(ad.render(tetap));
    benar(sesudah > sebelum + 5,
      'geser +x harus memindahkan ke kanan (' + sebelum.toFixed(1) + ' → ' + sesudah.toFixed(1) + ')');
  });

  it('Adegan: adegan kosong tidak melempar', function () {
    var ad = new MO.Adegan([]);
    var img = ad.render({ ukuran: 48 });
    samaDengan(img.cols, 48, 'lebar');
    samaDengan(ad.pilihDi(24, 24), -1, 'pilih di adegan kosong');
    samaDengan(ad.jumlahSegitiga(), 0, 'jumlah segitiga');
  });

  /* ---------- pembungkus seri ---------- */

  it('seriAtlas(): mengikuti bentuk seri DICOM', function () {
    var ad = adeganDuaKubus();
    var seri = ad.seriAtlas({ jumlah: 8, ukuran: 64 });
    samaDengan(seri.count, 8, 'count');
    samaDengan(seri.derived, true, 'derived');
    benar(/^ATLAS#/.test(seri.key), 'key: ' + seri.key);
    return seri.getImage(3).then(function (img) {
      samaDengan(img.cols, 64, 'lebar img');
      samaDengan(img.photometric, 'RGB', 'photometric');
      var tag = seri.getTags();
      benar(tag.some(function (t) { return t.name === 'ImageType'; }), 'ImageType hilang');
      benar(tag.some(function (t) { return /kiri/.test(t.value); }), 'nama bagian tidak masuk tag');
    });
  });

  it('seriAtlas(): indeks di luar rentang dijepit', function () {
    var seri = adeganDuaKubus().seriAtlas({ jumlah: 4, ukuran: 48 });
    return seri.getImage(99).then(function (img) {
      samaDengan(img.cols, 48, 'lebar img');
    });
  });

  /* ---------- integrasi dengan mesh.js ---------- */

  it('Mesh.info(): mesh yang dimuat tidak menyebut ambang', function () {
    var m = MO.dariOBJ(objKubus(0, 0, 0, 10, 'k', false), { sumber: 'ginjal.obj' }).bagian[0].mesh;
    var s = m.info();
    benar(s.indexOf('ambang') < 0, 'info mesh dimuat tidak boleh menyebut ambang: ' + s);
    benar(s.indexOf('ginjal.obj') >= 0, 'info harus menyebut sumber: ' + s);
    benar(!!ME, 'MESH harus tersedia');
  });

  it('Mesh.obj() dari model yang dimuat bisa dibaca ulang', function () {
    var m = MO.dariOBJ(objKubus(0, 0, 0, 10, 'k', false)).bagian[0].mesh;
    var h = MO.dariOBJ(m.obj('putaran'));
    samaDengan(h.bagian[0].mesh.jumlahSegitiga(), 12, 'segitiga setelah bolak-balik OBJ');
    samaDengan(h.bagian[0].mesh.jumlahTitik(), 8, 'titik setelah bolak-balik OBJ');
  });

  global.UJI = global.UJI || {};
  global.UJI.daftar = uji;
})(window);
