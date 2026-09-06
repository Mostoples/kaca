/* ==========================================================
   KACA — kendali gestur tangan & suara untuk panggung hologram
   ----------------------------------------------------------
   Dua sumber kendali yang berdiri sendiri:

     KENDALI.Gerak  — kamera → posisi & kedekatan tangan
     KENDALI.Suara  — mikrofon → perintah kata

   Rancangannya sengaja memisahkan LOGIKA dari I/O:

     - lacakBingkai()  : ImageData → {x, y, luas} — fungsi murni
     - bacaPerintah()  : teks → {perintah, nilai} — fungsi murni
     - Gerak / Suara   : pembungkus yang menyentuh kamera & mikrofon

   Dengan begitu bagian yang paling mudah salah bisa diuji di Node
   tanpa perangkat apa pun (lihat tests/uji-kendali.js).

   ----------------------------------------------------------
   BATAS YANG PERLU DIKETAHUI

   1. Ini BUKAN pelacakan kerangka tangan. Tidak ada sendi, tidak ada
      jari. Yang dilacak hanya titik berat wilayah warna kulit terbesar
      dan luasnya. Cukup untuk memutar dan mengubah ukuran secara
      halus; tidak cukup untuk membedakan kepalan dari telapak terbuka.
      Landmark sungguhan butuh MediaPipe/TensorFlow.js — beberapa MB
      model dari CDN — dan itu dependensi yang proyek ini hindari.

   2. Deteksi warna kulit peka pada cahaya. Ruangan gelap (yang justru
      dibutuhkan prisma) membuatnya lemah, jadi tersedia mode gerak
      sebagai cadangan dan ambang yang bisa disetel.

   3. Citra kamera TIDAK PERNAH keluar dari perangkat — diproses di
      canvas lokal lalu dibuang. Tetapi Web Speech API di Chrome
      MENGIRIM AUDIO KE SERVER peramban. Karena itu suara mati secara
      bawaan dan pemanggil wajib memberi tahu pengguna.
   ========================================================== */
(function (global) {
  'use strict';

  function klem(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ==========================================================
     1. Deteksi wilayah tangan pada satu bingkai
     ----------------------------------------------------------
     Warna kulit dipisahkan di ruang YCbCr, bukan RGB: luma (Y)
     dibuang dari keputusan sehingga terang-gelapnya cahaya tidak
     terlalu berpengaruh, dan yang dipakai hanya krominansinya.
     Rentang Cb/Cr di bawah adalah rentang klasik yang mencakup
     rentang warna kulit yang lebar.
     ========================================================== */
  var AMBANG_BAWAAN = {
    cbMin: 77, cbMax: 133,
    crMin: 133, crMax: 180,
    yMin: 40, yMax: 250,
    /* wilayah harus cukup besar agar tidak memburu derau */
    luasMin: 0.004,
    /* dan cukup kecil agar wajah/dinding sewarna kulit tidak lolos */
    luasMax: 0.55
  };

  function kulit(r, g, b, t) {
    /* Y, Cb, Cr menurut BT.601 */
    var y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < t.yMin || y > t.yMax) return false;
    var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return cb >= t.cbMin && cb <= t.cbMax && cr >= t.crMin && cr <= t.crMax;
  }

  /* ----------------------------------------------------------
     lacakBingkai(imageData, opsi) → null | {x, y, luas, kotak}

     x, y  : titik berat wilayah, ternormalkan 0..1
     luas  : bagian bingkai yang ditempati wilayah, 0..1
     kotak : {x0,y0,x1,y1} dalam piksel

     opsi.ambang     — timpa AMBANG_BAWAAN
     opsi.acuan      — ImageData latar; bila ada, dipakai sebagai
                       pembanding gerak dan digabung dengan warna kulit
     opsi.bedaMin    — selisih luma minimum agar dianggap bergerak
     opsi.hanyaGerak — abaikan warna kulit, pakai gerak saja
     ---------------------------------------------------------- */
  function lacakBingkai(imageData, opsi) {
    opsi = opsi || {};
    var t = Object.create(AMBANG_BAWAAN);
    if (opsi.ambang) Object.keys(opsi.ambang).forEach(function (k) { t[k] = opsi.ambang[k]; });

    var w = imageData.width, h = imageData.height, px = imageData.data;
    var n = w * h;
    var acuan = opsi.acuan ? opsi.acuan.data : null;
    var bedaMin = opsi.bedaMin === undefined ? 26 : opsi.bedaMin;
    var hanyaGerak = !!opsi.hanyaGerak;

    /* --- topeng biner --- */
    var topeng = new Uint8Array(n);
    var jumlahTopeng = 0;
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      var r = px[o], g = px[o + 1], b = px[o + 2];
      var lolos;

      if (hanyaGerak) {
        if (!acuan) { lolos = false; }
        else {
          var dy = Math.abs((0.299 * r + 0.587 * g + 0.114 * b) -
            (0.299 * acuan[o] + 0.587 * acuan[o + 1] + 0.114 * acuan[o + 2]));
          lolos = dy >= bedaMin;
        }
      } else {
        lolos = kulit(r, g, b, t);
        /* bila ada acuan, warna kulit yang tidak bergerak diabaikan —
           ini yang menyingkirkan wajah yang diam dan perabot sewarna kulit */
        if (lolos && acuan) {
          var dy2 = Math.abs((0.299 * r + 0.587 * g + 0.114 * b) -
            (0.299 * acuan[o] + 0.587 * acuan[o + 1] + 0.114 * acuan[o + 2]));
          if (dy2 < bedaMin) lolos = false;
        }
      }
      if (lolos) { topeng[i] = 1; jumlahTopeng++; }
    }

    if (jumlahTopeng / n < t.luasMin) return null;

    /* --- komponen terhubung terbesar, flood fill iteratif --- */
    var label = new Int32Array(n);      /* 0 = belum, -1 = bukan topeng */
    var tumpukan = new Int32Array(n);
    var terbaik = null;

    for (var s = 0; s < n; s++) {
      if (!topeng[s] || label[s]) continue;
      var atas = 0;
      tumpukan[atas++] = s;
      label[s] = 1;

      var jml = 0, sumX = 0, sumY = 0;
      var x0 = w, y0 = h, x1 = 0, y1 = 0;

      while (atas > 0) {
        var p = tumpukan[--atas];
        var pxx = p % w, pyy = (p / w) | 0;
        jml++; sumX += pxx; sumY += pyy;
        if (pxx < x0) x0 = pxx;
        if (pxx > x1) x1 = pxx;
        if (pyy < y0) y0 = pyy;
        if (pyy > y1) y1 = pyy;

        /* empat arah cukup; delapan arah tidak mengubah hasil berarti */
        if (pxx > 0 && topeng[p - 1] && !label[p - 1]) { label[p - 1] = 1; tumpukan[atas++] = p - 1; }
        if (pxx < w - 1 && topeng[p + 1] && !label[p + 1]) { label[p + 1] = 1; tumpukan[atas++] = p + 1; }
        if (pyy > 0 && topeng[p - w] && !label[p - w]) { label[p - w] = 1; tumpukan[atas++] = p - w; }
        if (pyy < h - 1 && topeng[p + w] && !label[p + w]) { label[p + w] = 1; tumpukan[atas++] = p + w; }
      }

      if (!terbaik || jml > terbaik.jml) {
        terbaik = { jml: jml, sumX: sumX, sumY: sumY, x0: x0, y0: y0, x1: x1, y1: y1 };
      }
    }

    if (!terbaik) return null;
    var luas = terbaik.jml / n;
    if (luas < t.luasMin || luas > t.luasMax) return null;

    return {
      x: terbaik.sumX / terbaik.jml / w,
      y: terbaik.sumY / terbaik.jml / h,
      luas: luas,
      kotak: { x0: terbaik.x0, y0: terbaik.y0, x1: terbaik.x1, y1: terbaik.y1 }
    };
  }

  /* ==========================================================
     2. Penghalus
     ----------------------------------------------------------
     Titik berat wilayah selalu bergetar beberapa piksel. Tanpa
     penghalusan, hologram akan bergetar ikut tangan. Rata-rata
     bergerak eksponensial: murah dan tidak menambah lag terasa.
     ========================================================== */
  function Halus(bobot) {
    this.bobot = bobot === undefined ? 0.25 : bobot;
    this.nilai = null;
  }
  Halus.prototype.masuk = function (v) {
    if (v === null || v === undefined || !isFinite(v)) return this.nilai;
    this.nilai = this.nilai === null ? v : this.nilai + (v - this.nilai) * this.bobot;
    return this.nilai;
  };
  Halus.prototype.reset = function () { this.nilai = null; };

  /* ==========================================================
     3. Pemeta gestur → kendali hologram
     ----------------------------------------------------------
     Dipisahkan supaya pemetaannya bisa diuji tanpa kamera.

     Rotasi memakai pemetaan MUTLAK: menyapukan tangan dari tepi kiri
     ke tepi kanan bingkai memutar volume satu putaran penuh. Ini lebih
     mudah dipelajari daripada pemetaan kecepatan, dan tidak menumpuk
     galat ketika tangan hilang lalu muncul lagi.

     Skala memakai luas wilayah: tangan didekatkan ke kamera → wilayah
     melebar → sisi hologram membesar. Yang dipakai akar luas, karena
     luas tumbuh kuadratik terhadap kedekatan.
     ========================================================== */
  function petakan(jejak, opsi) {
    opsi = opsi || {};
    if (!jejak) return null;

    var balik = opsi.balikX === undefined ? true : opsi.balikX;   /* kamera mencerminkan */
    var x = balik ? 1 - jejak.x : jejak.x;

    var sudutPenuh = opsi.sudutPenuh === undefined ? 1 : opsi.sudutPenuh;
    var fase = klem(x, 0, 1) * sudutPenuh;      /* 0..1 = satu putaran */

    var akar = Math.sqrt(klem(jejak.luas, 0, 1));
    var aMin = opsi.akarMin === undefined ? 0.08 : opsi.akarMin;
    var aMax = opsi.akarMax === undefined ? 0.42 : opsi.akarMax;
    var bagian = klem((akar - aMin) / Math.max(1e-6, aMax - aMin), 0, 1);

    var sMin = opsi.skalaMin === undefined ? 0.16 : opsi.skalaMin;
    var sMax = opsi.skalaMax === undefined ? 0.46 : opsi.skalaMax;

    return {
      fase: fase,
      skala: sMin + bagian * (sMax - sMin),
      /* tinggi tangan bisa dipakai elevasi bila pemanggil mau */
      tinggi: klem(1 - jejak.y, 0, 1),
      luas: jejak.luas
    };
  }

  /* ==========================================================
     4. Kamera
     ========================================================== */
  function Gerak(opsi) {
    opsi = opsi || {};
    this.lebar = opsi.lebar || 160;
    this.tinggi = opsi.tinggi || 120;
    this.opsiLacak = opsi.lacak || {};
    this.jalan = false;
    this.aliran = null;
    this.video = null;
    this.acuan = null;
    this.umurAcuan = 0;
    this.onJejak = opsi.onJejak || function () {};
    this.onGalat = opsi.onGalat || function () {};
    this.onStatus = opsi.onStatus || function () {};

    this.kanvas = global.document ? global.document.createElement('canvas') : null;
    if (this.kanvas) {
      this.kanvas.width = this.lebar;
      this.kanvas.height = this.tinggi;
      this.ctx = this.kanvas.getContext('2d');
    }
    this._timer = null;
    this._fps = opsi.fps || 15;
  }

  Gerak.prototype.dukung = function () {
    return !!(global.navigator && global.navigator.mediaDevices &&
      global.navigator.mediaDevices.getUserMedia);
  };

  Gerak.prototype.mulai = function () {
    var self = this;
    if (this.jalan) return Promise.resolve();
    if (!this.dukung()) {
      var e = new Error('Peramban ini tidak menyediakan akses kamera.');
      this.onGalat(e);
      return Promise.reject(e);
    }
    this.onStatus('meminta izin kamera');
    return global.navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false
    }).then(function (aliran) {
      self.aliran = aliran;
      var v = global.document.createElement('video');
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.srcObject = aliran;
      self.video = v;
      return v.play ? v.play().catch(function () {}) : null;
    }).then(function () {
      self.jalan = true;
      self.acuan = null;
      self.onStatus('kamera aktif');
      self._timer = global.setInterval(function () { self.langkah(); }, 1000 / self._fps);
    }).catch(function (err) {
      self.onGalat(err);
      throw err;
    });
  };

  Gerak.prototype.henti = function () {
    if (this._timer) { global.clearInterval(this._timer); this._timer = null; }
    if (this.aliran) {
      this.aliran.getTracks().forEach(function (t) { t.stop(); });
      this.aliran = null;
    }
    this.video = null;
    this.acuan = null;
    this.jalan = false;
    this.onStatus('kamera mati');
  };

  Gerak.prototype.langkah = function () {
    if (!this.jalan || !this.video || !this.ctx) return;
    try {
      this.ctx.drawImage(this.video, 0, 0, this.lebar, this.tinggi);
    } catch (e) { return; }

    var bingkai;
    try { bingkai = this.ctx.getImageData(0, 0, this.lebar, this.tinggi); }
    catch (e) { this.onGalat(e); this.henti(); return; }

    var opsi = Object.create(null);
    Object.keys(this.opsiLacak).forEach(function (k) { opsi[k] = this.opsiLacak[k]; }, this);
    opsi.acuan = this.acuan;

    var jejak = lacakBingkai(bingkai, opsi);
    this.onJejak(jejak, bingkai);

    /* Latar diperbarui perlahan supaya perubahan cahaya ikut terserap,
       tetapi tangan yang bergerak tidak larut ke dalamnya. */
    if (!this.acuan || ++this.umurAcuan > this._fps * 2) {
      this.acuan = bingkai;
      this.umurAcuan = 0;
    }
  };

  /* ==========================================================
     5. Perintah suara
     ----------------------------------------------------------
     bacaPerintah() murni: teks masuk, perintah keluar. Kosakatanya
     bahasa Indonesia dengan beberapa padanan Inggris yang sering
     terucap. Dicocokkan dari yang paling khusus ke paling umum,
     supaya "lebih cepat" tidak tertangkap sebagai "cepat" saja
     ketika keduanya berbeda arti.
     ========================================================== */
  var KOSAKATA = [
    /* mode tampilan */
    { perintah: 'mode', nilai: 'permukaan', kata: ['permukaan', 'tulang', 'surface', 'kerangka'] },
    { perintah: 'mode', nilai: 'komposit', kata: ['volume', 'komposit', 'jaringan'] },
    { perintah: 'mode', nilai: 'rerata', kata: ['rerata', 'rontgen', 'radiograf'] },
    { perintah: 'mode', nilai: 'maks', kata: ['mip', 'maksimum', 'intensitas'] },

    /* putaran */
    { perintah: 'jeda', kata: ['berhenti', 'stop', 'jeda', 'diam', 'tahan'] },
    { perintah: 'putar', kata: ['putar', 'jalan', 'mulai', 'lanjut'] },
    { perintah: 'arah', kata: ['balik arah', 'balik', 'sebaliknya', 'putar balik'] },
    { perintah: 'cepat', nilai: 1, kata: ['lebih cepat', 'percepat', 'cepat'] },
    { perintah: 'cepat', nilai: -1, kata: ['lebih lambat', 'perlambat', 'lambat'] },

    /* ukuran */
    { perintah: 'skala', nilai: 1, kata: ['perbesar', 'besarkan', 'lebih besar', 'besar', 'zoom in'] },
    { perintah: 'skala', nilai: -1, kata: ['perkecil', 'kecilkan', 'lebih kecil', 'kecil', 'zoom out'] },

    /* rotasi bertahap */
    { perintah: 'geser', nilai: -1, kata: ['ke kiri', 'kiri'] },
    { perintah: 'geser', nilai: 1, kata: ['ke kanan', 'kanan'] },

    /* tampilan */
    { perintah: 'cermin', kata: ['cermin', 'mirror', 'terbalik'] },
    { perintah: 'penuh', kata: ['layar penuh', 'penuh', 'fullscreen'] },
    { perintah: 'panel', kata: ['sembunyikan panel', 'tampilkan panel', 'panel'] },
    { perintah: 'reset', kata: ['atur ulang', 'setel ulang', 'reset', 'kembalikan'] },

    /* ----------------------------------------------------------
       Atlas anatomi
       ----------------------------------------------------------
       Nama organ ditulis tetap, bukan diambil dari model yang
       sedang dimuat: pengenal suara bekerja jauh lebih baik pada
       kosakata tertutup, dan nama bagian di berkas OBJ sering
       berupa kode ("FJ6297") yang tidak mungkin diucapkan.
       Nilainya dicocokkan ke nama bagian oleh Adegan.indeksNama().

       'tulang' sengaja TIDAK dipakai di sini — kata itu sudah
       menjadi padanan mode permukaan di atas, dan yang lebih dulu
       terdaftar yang menang bila panjang katanya sama.
       ---------------------------------------------------------- */
    { perintah: 'organ', nilai: 'jantung', kata: ['jantung', 'heart'] },
    { perintah: 'organ', nilai: 'paru', kata: ['paru paru', 'paru', 'lung'] },
    { perintah: 'organ', nilai: 'hati', kata: ['hati', 'liver'] },
    { perintah: 'organ', nilai: 'ginjal', kata: ['ginjal', 'kidney'] },
    { perintah: 'organ', nilai: 'otak', kata: ['otak', 'brain'] },
    { perintah: 'organ', nilai: 'usus', kata: ['usus', 'intestine'] },
    { perintah: 'organ', nilai: 'pankreas', kata: ['pankreas', 'pancreas'] },
    { perintah: 'organ', nilai: 'lambung', kata: ['lambung', 'stomach'] },
    { perintah: 'organ', nilai: 'limpa', kata: ['limpa', 'spleen'] },
    { perintah: 'organ', nilai: 'mata', kata: ['mata', 'bola mata', 'eyeball'] },
    { perintah: 'organ', nilai: 'kulit', kata: ['kulit', 'skin'] },

    { perintah: 'pisah', kata: ['pisahkan', 'uraikan', 'ledakkan', 'pisah', 'urai'] },
    { perintah: 'satukan', kata: ['satukan', 'rapatkan', 'gabungkan', 'kumpulkan'] },
    /* Pemicunya wajib dua kata. 'semuanya' sendirian pernah dicoba dan
       membuat "selamat pagi semuanya" ikut tertangkap sebagai perintah. */
    { perintah: 'semua', kata: ['tampilkan semua', 'semua organ'] }
  ];

  function normalkan(teks) {
    return String(teks || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function bacaPerintah(teks) {
    var t = normalkan(teks);
    if (!t) return null;

    /* Semua padanan dikumpulkan lalu yang paling panjang dimenangkan.
       Tanpa ini, "lebih cepat" bisa cocok dengan "cepat" yang lebih
       pendek dan artinya jadi berbeda. */
    var menang = null;
    for (var i = 0; i < KOSAKATA.length; i++) {
      var k = KOSAKATA[i];
      for (var j = 0; j < k.kata.length; j++) {
        var kata = k.kata[j];
        if (t.indexOf(kata) === -1) continue;
        if (!menang || kata.length > menang.panjang) {
          menang = { perintah: k.perintah, nilai: k.nilai, panjang: kata.length, cocok: kata };
        }
      }
    }
    if (!menang) return null;
    return { perintah: menang.perintah, nilai: menang.nilai, cocok: menang.cocok };
  }

  /* ==========================================================
     6. Mikrofon
     ----------------------------------------------------------
     PERHATIAN PRIVASI: di Chrome, Web Speech API mengunggah audio ke
     server peramban untuk dikenali. Itu satu-satunya bagian sistem ini
     yang mengirim apa pun keluar dari perangkat. Karena itu kelas ini
     tidak pernah menyalakan diri sendiri, dan pemanggil wajib
     memberitahu pengguna.
     ========================================================== */
  function Suara(opsi) {
    opsi = opsi || {};
    this.bahasa = opsi.bahasa || 'id-ID';
    this.onPerintah = opsi.onPerintah || function () {};
    this.onDengar = opsi.onDengar || function () {};
    this.onGalat = opsi.onGalat || function () {};
    this.onStatus = opsi.onStatus || function () {};
    this.jalan = false;
    this._sr = null;
    this._sengajaHenti = false;
  }

  Suara.prototype.dukung = function () {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  };

  Suara.prototype.mulai = function () {
    var self = this;
    if (this.jalan) return;
    if (!this.dukung()) {
      this.onGalat(new Error('Peramban ini tidak menyediakan pengenalan suara.'));
      return;
    }
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    var sr = new SR();
    sr.lang = this.bahasa;
    sr.continuous = true;
    sr.interimResults = true;
    sr.maxAlternatives = 1;

    sr.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var hasil = ev.results[i];
        var teks = hasil[0] ? hasil[0].transcript : '';
        self.onDengar(teks, hasil.isFinal);
        if (!hasil.isFinal) continue;
        var p = bacaPerintah(teks);
        if (p) self.onPerintah(p, teks);
      }
    };
    sr.onerror = function (ev) {
      /* 'no-speech' dan 'aborted' wajar terjadi, bukan kegagalan */
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      self.onGalat(new Error('Pengenalan suara: ' + ev.error));
    };
    sr.onend = function () {
      /* Chrome memutus sesi sendiri setiap beberapa puluh detik;
         disambung ulang selama pengguna belum mematikannya */
      if (self._sengajaHenti) { self.jalan = false; self.onStatus('mikrofon mati'); return; }
      try { sr.start(); } catch (e) { self.jalan = false; self.onStatus('mikrofon mati'); }
    };

    this._sr = sr;
    this._sengajaHenti = false;
    try {
      sr.start();
      this.jalan = true;
      this.onStatus('mendengarkan');
    } catch (e) {
      this.onGalat(e);
    }
  };

  Suara.prototype.henti = function () {
    this._sengajaHenti = true;
    if (this._sr) { try { this._sr.stop(); } catch (e) {} }
    this.jalan = false;
    this.onStatus('mikrofon mati');
  };

  global.KENDALI = {
    lacakBingkai: lacakBingkai,
    bacaPerintah: bacaPerintah,
    petakan: petakan,
    normalkan: normalkan,
    Halus: Halus,
    Gerak: Gerak,
    Suara: Suara,
    AMBANG_BAWAAN: AMBANG_BAWAAN,
    KOSAKATA: KOSAKATA
  };
})(window);
