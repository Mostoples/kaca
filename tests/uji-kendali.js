/* ==========================================================
   MEDIVOX — uji kendali gestur & suara
   ----------------------------------------------------------
   Kamera dan mikrofon tidak bisa diuji di Node, tetapi bagian
   yang paling mudah salah justru bukan I/O-nya:

     - lacakBingkai() : apakah wilayah tangan ditemukan di tempat
                        yang benar, luasnya benar, dan derau ditolak
     - petakan()      : apakah posisi tangan jadi rotasi & skala
                        yang benar, termasuk pencerminan kamera
     - bacaPerintah() : apakah ucapan jadi perintah yang benar,
                        termasuk saat kata pendek tertanam di kata
                        panjang ("cepat" di dalam "lebih cepat")

   Ketiganya fungsi murni, jadi diuji langsung di sini.
   ========================================================== */
(function (global) {
  'use strict';

  var KD = global.KENDALI;
  var uji = (global.UJI && global.UJI.daftar) || [];
  function it(nama, fn) { uji.push({ nama: nama, fn: fn }); }

  function gagal(p) { throw new Error(p); }
  function samaDengan(a, b, apa) { if (a !== b) gagal(apa + ': dapat ' + a + ', diharapkan ' + b); }
  function hampirSama(a, b, tol, apa) {
    if (Math.abs(a - b) > tol) gagal(apa + ': dapat ' + a + ', diharapkan ' + b + ' (±' + tol + ')');
  }
  function benar(v, apa) { if (!v) gagal(apa); }

  /* ---------- pembuat bingkai uji ---------- */
  var W = 64, H = 48;

  /* warna kulit yang lolos aturan YCbCr, dan warna latar yang tidak */
  var KULIT = [222, 168, 140];
  var LATAR = [24, 40, 90];        /* biru gelap: Cb tinggi, Cr rendah */

  function bingkai(gambar) {
    var d = new Uint8ClampedArray(W * H * 4);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var c = gambar(x, y) || LATAR;
        var o = (y * W + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    return { width: W, height: H, data: d };
  }

  function persegi(x0, y0, x1, y1, warna) {
    return function (x, y) {
      return (x >= x0 && x <= x1 && y >= y0 && y <= y1) ? (warna || KULIT) : LATAR;
    };
  }

  /* ==========================================================
     lacakBingkai
     ========================================================== */
  it('Gestur: wilayah kulit ditemukan di titik berat yang benar', function () {
    /* kotak 16×16 berpusat di (24, 20) */
    var f = bingkai(persegi(16, 12, 31, 27));
    var j = KD.lacakBingkai(f);
    benar(j, 'wilayah terdeteksi');
    /* titik berat kotak 16..31 adalah 23,5 → dinormalkan 23,5/64 */
    hampirSama(j.x, 23.5 / W, 0.01, 'titik berat x');
    hampirSama(j.y, 19.5 / H, 0.01, 'titik berat y');
    hampirSama(j.luas, (16 * 16) / (W * H), 0.005, 'luas wilayah');
    samaDengan(j.kotak.x0, 16, 'kotak x0');
    samaDengan(j.kotak.x1, 31, 'kotak x1');
  });

  it('Gestur: bingkai tanpa kulit tidak menghasilkan apa pun', function () {
    var f = bingkai(function () { return LATAR; });
    samaDengan(KD.lacakBingkai(f), null, 'tidak ada wilayah');
  });

  it('Gestur: bercak kecil ditolak sebagai derau', function () {
    /* 3×3 = 9 piksel dari 3072 = 0,29% — di bawah luasMin 0,4% */
    var f = bingkai(persegi(10, 10, 12, 12));
    samaDengan(KD.lacakBingkai(f), null, 'bercak kecil diabaikan');
  });

  it('Gestur: wilayah yang menutupi hampir seluruh bingkai ditolak', function () {
    /* melebihi luasMax 55% — biasanya berarti dinding sewarna kulit */
    var f = bingkai(persegi(0, 0, W - 1, H - 1));
    samaDengan(KD.lacakBingkai(f), null, 'wilayah terlalu besar diabaikan');
  });

  it('Gestur: dari dua wilayah, yang terbesar yang dipakai', function () {
    var f = bingkai(function (x, y) {
      /* kecil di kiri atas, besar di kanan bawah */
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) return KULIT;
      if (x >= 40 && x <= 59 && y >= 24 && y <= 43) return KULIT;
      return LATAR;
    });
    var j = KD.lacakBingkai(f);
    benar(j, 'ada wilayah');
    /* titik berat harus di kanan bawah, bukan di antara keduanya */
    benar(j.x > 0.6, 'titik berat mengikuti wilayah besar (x=' + j.x.toFixed(3) + ')');
    benar(j.y > 0.6, 'titik berat mengikuti wilayah besar (y=' + j.y.toFixed(3) + ')');
    hampirSama(j.luas, (20 * 20) / (W * H), 0.005, 'luas = wilayah besar saja');
  });

  it('Gestur: wilayah menyambung diagonal tetap dihitung terpisah', function () {
    /* dua kotak hanya bersentuhan di sudut; penelusuran empat arah
       harus menganggapnya dua wilayah, bukan satu */
    var f = bingkai(function (x, y) {
      if (x >= 10 && x <= 21 && y >= 10 && y <= 21) return KULIT;
      if (x >= 22 && x <= 33 && y >= 22 && y <= 33) return KULIT;
      return LATAR;
    });
    var j = KD.lacakBingkai(f);
    benar(j, 'ada wilayah');
    hampirSama(j.luas, (12 * 12) / (W * H), 0.004, 'hanya satu kotak yang dihitung');
  });

  it('Gestur: dengan acuan latar, kulit yang diam diabaikan', function () {
    var diam = persegi(16, 12, 31, 27);
    var f = bingkai(diam);
    var acuan = bingkai(diam);          /* identik: tidak ada gerak */
    samaDengan(KD.lacakBingkai(f, { acuan: acuan }), null,
      'wajah/objek diam yang sewarna kulit tidak ikut terlacak');
  });

  it('Gestur: dengan acuan latar, kulit yang bergerak tetap terlacak', function () {
    var acuan = bingkai(function () { return LATAR; });
    var f = bingkai(persegi(16, 12, 31, 27));
    var j = KD.lacakBingkai(f, { acuan: acuan });
    benar(j, 'tangan yang bergerak terlacak');
    hampirSama(j.x, 23.5 / W, 0.01, 'titik beratnya tetap benar');
  });

  it('Gestur: mode hanya-gerak mengabaikan warna sama sekali', function () {
    /* Benda terang yang BUKAN warna kulit, tetapi bergerak. Latar acuan
       harus sama dengan latar bingkai — kalau tidak, seluruh bingkai
       terhitung bergerak lalu ditolak karena melebihi batas luas. */
    var acuan = bingkai(function () { return LATAR; });
    var f = bingkai(persegi(20, 16, 39, 31, [240, 240, 240]));
    samaDengan(KD.lacakBingkai(f), null, 'tanpa mode gerak, benda ini bukan kulit');
    var j = KD.lacakBingkai(f, { acuan: acuan, hanyaGerak: true });
    benar(j, 'dengan mode gerak, benda ini terlacak');
    hampirSama(j.luas, (20 * 16) / (W * H), 0.006, 'luasnya benar');
  });

  /* ==========================================================
     petakan
     ========================================================== */
  it('Pemetaan: tangan di kiri bingkai jadi fase kanan (kamera mencerminkan)', function () {
    /* kamera menghadap pengguna, jadi x bingkai terbalik dari gerak nyata */
    var kiri = KD.petakan({ x: 0.02, y: 0.5, luas: 0.05 });
    var kanan = KD.petakan({ x: 0.98, y: 0.5, luas: 0.05 });
    hampirSama(kiri.fase, 0.98, 0.01, 'x kecil → fase besar');
    hampirSama(kanan.fase, 0.02, 0.01, 'x besar → fase kecil');
  });

  it('Pemetaan: pencerminan bisa dimatikan', function () {
    var j = { x: 0.25, y: 0.5, luas: 0.05 };
    hampirSama(KD.petakan(j, { balikX: false }).fase, 0.25, 0.01, 'tanpa cermin');
    hampirSama(KD.petakan(j, { balikX: true }).fase, 0.75, 0.01, 'dengan cermin');
  });

  it('Pemetaan: tangan lebih dekat (wilayah lebih luas) memperbesar skala', function () {
    var jauh = KD.petakan({ x: 0.5, y: 0.5, luas: 0.01 });
    var sedang = KD.petakan({ x: 0.5, y: 0.5, luas: 0.06 });
    var dekat = KD.petakan({ x: 0.5, y: 0.5, luas: 0.20 });
    benar(jauh.skala < sedang.skala, 'jauh < sedang');
    benar(sedang.skala < dekat.skala, 'sedang < dekat');
  });

  it('Pemetaan: skala selalu berada dalam batas yang diminta', function () {
    [0, 0.0001, 0.02, 0.3, 0.9, 1].forEach(function (luas) {
      var m = KD.petakan({ x: 0.5, y: 0.5, luas: luas }, { skalaMin: 0.2, skalaMax: 0.4 });
      benar(m.skala >= 0.2 - 1e-9 && m.skala <= 0.4 + 1e-9,
        'luas ' + luas + ' → skala ' + m.skala + ' harus di 0,2–0,4');
    });
  });

  it('Pemetaan: tanpa jejak, hasilnya null', function () {
    samaDengan(KD.petakan(null), null, 'null diteruskan');
  });

  it('Pemetaan: tinggi tangan dibalik agar atas = nilai besar', function () {
    var atas = KD.petakan({ x: 0.5, y: 0.05, luas: 0.05 });
    var bawah = KD.petakan({ x: 0.5, y: 0.95, luas: 0.05 });
    benar(atas.tinggi > bawah.tinggi, 'tangan di atas memberi nilai lebih besar');
    hampirSama(atas.tinggi, 0.95, 0.01, 'nilai tinggi');
  });

  /* ==========================================================
     Penghalus
     ========================================================== */
  it('Penghalus: nilai pertama dipakai apa adanya, lalu mendekat perlahan', function () {
    var h = new KD.Halus(0.5);
    samaDengan(h.masuk(10), 10, 'nilai pertama');
    samaDengan(h.masuk(20), 15, 'setengah jalan ke 20');
    samaDengan(h.masuk(20), 17.5, 'mendekat lagi');
    h.reset();
    samaDengan(h.masuk(3), 3, 'setelah reset, nilai pertama lagi');
  });

  it('Penghalus: nilai tidak sah tidak merusak keadaan', function () {
    var h = new KD.Halus(0.5);
    h.masuk(10);
    h.masuk(NaN);
    h.masuk(null);
    h.masuk(undefined);
    samaDengan(h.nilai, 10, 'nilai bertahan');
  });

  /* ==========================================================
     bacaPerintah
     ========================================================== */
  it('Suara: perintah dasar dikenali', function () {
    var kasus = [
      ['putar', 'putar'], ['berhenti', 'jeda'], ['stop', 'jeda'],
      ['perbesar', 'skala'], ['perkecil', 'skala'],
      ['cermin', 'cermin'], ['layar penuh', 'penuh'],
      ['atur ulang', 'reset'], ['balik arah', 'arah']
    ];
    kasus.forEach(function (k) {
      var p = KD.bacaPerintah(k[0]);
      benar(p, 'ucapan "' + k[0] + '" dikenali');
      samaDengan(p.perintah, k[1], 'perintah untuk "' + k[0] + '"');
    });
  });

  it('Suara: arah perbesar & perkecil terbedakan', function () {
    samaDengan(KD.bacaPerintah('perbesar').nilai, 1, 'perbesar = +1');
    samaDengan(KD.bacaPerintah('perkecil').nilai, -1, 'perkecil = -1');
    samaDengan(KD.bacaPerintah('lebih besar').nilai, 1, 'lebih besar = +1');
    samaDengan(KD.bacaPerintah('lebih kecil').nilai, -1, 'lebih kecil = -1');
  });

  it('Suara: kata panjang menang atas kata pendek yang tertanam', function () {
    /* "lebih lambat" memuat "lambat"; yang panjang harus menang, dan
       keduanya memang perintah 'cepat' dengan tanda berbeda */
    var lambat = KD.bacaPerintah('tolong lebih lambat sedikit');
    samaDengan(lambat.perintah, 'cepat', 'perintah');
    samaDengan(lambat.nilai, -1, 'lebih lambat = -1');
    samaDengan(lambat.cocok, 'lebih lambat', 'padanan terpanjang yang dipakai');

    var cepat = KD.bacaPerintah('lebih cepat');
    samaDengan(cepat.nilai, 1, 'lebih cepat = +1');
    samaDengan(cepat.cocok, 'lebih cepat', 'padanan terpanjang');
  });

  it('Suara: mode tampilan dikenali beserta nilainya', function () {
    samaDengan(KD.bacaPerintah('tampilkan tulang').nilai, 'permukaan', 'tulang → permukaan');
    samaDengan(KD.bacaPerintah('mode permukaan').nilai, 'permukaan', 'permukaan');
    samaDengan(KD.bacaPerintah('mip saja').nilai, 'maks', 'mip → maks');
    samaDengan(KD.bacaPerintah('lihat jaringan').nilai, 'komposit', 'jaringan → komposit');
    samaDengan(KD.bacaPerintah('seperti rontgen').nilai, 'rerata', 'rontgen → rerata');
  });

  it('Suara: perintah terselip di kalimat panjang tetap tertangkap', function () {
    var p = KD.bacaPerintah('oke sekarang tolong putar hologramnya ya');
    benar(p, 'dikenali di tengah kalimat');
    samaDengan(p.perintah, 'putar', 'perintah');
  });

  it('Suara: tanda baca dan huruf besar tidak berpengaruh', function () {
    samaDengan(KD.bacaPerintah('BERHENTI!').perintah, 'jeda', 'huruf besar + tanda seru');
    samaDengan(KD.bacaPerintah('  Cermin,  ').perintah, 'cermin', 'spasi & koma');
  });

  it('Suara: ucapan tanpa perintah menghasilkan null', function () {
    [null, undefined, '', '   ', 'selamat pagi semuanya', 'hmm apa ya'].forEach(function (t) {
      samaDengan(KD.bacaPerintah(t), null, 'tidak ada perintah pada ' + JSON.stringify(t));
    });
  });

  it('Suara: geser kiri & kanan terbedakan', function () {
    samaDengan(KD.bacaPerintah('ke kiri').nilai, -1, 'kiri = -1');
    samaDengan(KD.bacaPerintah('ke kanan').nilai, 1, 'kanan = +1');
  });

  it('Suara: setiap entri kosakata benar-benar bisa dipicu', function () {
    /* menjaga agar tidak ada padanan yang tertutup entri lain */
    KD.KOSAKATA.forEach(function (k) {
      k.kata.forEach(function (kata) {
        var p = KD.bacaPerintah(kata);
        benar(p, 'padanan "' + kata + '" menghasilkan perintah');
        samaDengan(p.perintah + '|' + p.nilai, k.perintah + '|' + k.nilai,
          'padanan "' + kata + '" memicu perintah yang benar');
      });
    });
  });

  it('Suara: normalkan membersihkan teks seperti yang diharapkan', function () {
    samaDengan(KD.normalkan('  Halo,   Dunia!  '), 'halo dunia', 'huruf kecil & spasi rapi');
    samaDengan(KD.normalkan(null), '', 'null jadi kosong');
  });

  global.UJI = { daftar: uji };
})(window);
