/* ==========================================================
   MEDIVOX — uji round-trip parser DICOM
   ----------------------------------------------------------
   Setiap uji membuat berkas DICOM sungguhan lewat tests/tulis-dicom.js,
   mengurainya kembali dengan assets/js/dicom.js, lalu membandingkan
   nilai piksel dan metadata satu per satu.

   Dijalankan dari tests/index.html (buka lewat `node serve.js`).
   ========================================================== */
(function (global) {
  'use strict';

  var D = global.DICOM, T = global.TULIS;
  var uji = [];

  function it(nama, fn) { uji.push({ nama: nama, fn: fn }); }

  /* ---------- assertion ---------- */
  function gagal(pesan) { throw new Error(pesan); }

  function samaDengan(dapat, harap, apa) {
    if (dapat !== harap) gagal(apa + ': dapat ' + dapat + ', diharapkan ' + harap);
  }
  function hampirSama(dapat, harap, toleransi, apa) {
    if (Math.abs(dapat - harap) > (toleransi || 1e-6)) {
      gagal(apa + ': dapat ' + dapat + ', diharapkan ' + harap + ' (±' + toleransi + ')');
    }
  }
  function benar(nilai, apa) { if (!nilai) gagal(apa); }

  /* bandingkan seluruh nilai piksel, laporkan indeks pertama yang beda */
  function pikselSama(dapat, harap, apa) {
    samaDengan(dapat.length, harap.length, apa + ' — jumlah piksel');
    for (var i = 0; i < harap.length; i++) {
      if (dapat[i] !== harap[i]) {
        gagal(apa + ' — piksel ke-' + i + ': dapat ' + dapat[i] + ', diharapkan ' + harap[i]);
      }
    }
  }

  /* ---------- data uji ---------- */
  /* pola deterministik yang memuat nilai negatif, nol, dan nilai besar */
  function polaSigned(w, h, geser) {
    var px = new Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        px[y * w + x] = ((x * 37 + y * 91 + (geser || 0) * 613) % 4096) - 2048;
      }
    }
    return px;
  }
  function polaUnsigned(w, h, maks) {
    var px = new Array(w * h);
    for (var i = 0; i < px.length; i++) px[i] = (i * 17) % (maks + 1);
    return px;
  }

  var W = 32, H = 24;

  /* ==========================================================
     1–3. Round-trip pada tiga transfer syntax
     ========================================================== */
  [
    ['Implicit VR Little Endian', T.TS.IMPLICIT_LE],
    ['Explicit VR Little Endian', T.TS.EXPLICIT_LE],
    ['Explicit VR Big Endian', T.TS.EXPLICIT_BE]
  ].forEach(function (par) {
    it('Round-trip 16 bit signed — ' + par[0], function () {
      var px = polaSigned(W, H);
      var buf = T.citraGrayscale({
        ts: par[1], rows: H, cols: W, bits: 16, signed: true, pixels: px,
        slope: 1, intercept: -1024, wc: 40, ww: 400, spacing: [0.72, 0.72],
        patient: 'Prasetyo^Dewi', modality: 'CT', rescaleType: 'HU'
      });

      var ds = D.parse(buf);
      samaDengan(ds.transferSyntax, par[1], 'transfer syntax terbaca');
      samaDengan(ds.string('00100010'), 'Prasetyo^Dewi', 'PatientName');
      samaDengan(ds.int('00280010'), H, 'Rows');
      samaDengan(ds.int('00280011'), W, 'Columns');

      var img = D.readPixels(ds);
      samaDengan(img.rows, H, 'img.rows');
      samaDengan(img.cols, W, 'img.cols');
      samaDengan(img.signed, true, 'img.signed');
      samaDengan(img.bitsAllocated, 16, 'img.bitsAllocated');
      samaDengan(img.modality, 'CT', 'img.modality');
      samaDengan(img.rescaleType, 'HU', 'img.rescaleType');
      hampirSama(img.slope, 1, 1e-9, 'RescaleSlope');
      hampirSama(img.intercept, -1024, 1e-9, 'RescaleIntercept');
      hampirSama(img.windowCenter, 40, 1e-9, 'WindowCenter');
      hampirSama(img.windowWidth, 400, 1e-9, 'WindowWidth');
      hampirSama(img.pixelSpacing[0], 0.72, 1e-9, 'PixelSpacing[0]');
      pikselSama(img.pixels, px, 'piksel');
    });
  });

  /* ==========================================================
     4. 8 bit unsigned
     ========================================================== */
  it('Round-trip 8 bit unsigned', function () {
    var px = polaUnsigned(W, H, 255);
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: H, cols: W, bits: 8, signed: false, pixels: px, modality: 'CR'
    });
    var img = D.readPixels(D.parse(buf));
    samaDengan(img.bitsAllocated, 8, 'bitsAllocated');
    pikselSama(img.pixels, px, 'piksel 8 bit');
    samaDengan(img.min, 0, 'min');
    samaDengan(img.max, 255, 'max');
  });

  /* ==========================================================
     5. Multi-frame — tiap frame harus diambil dari offset benar
     ========================================================== */
  it('Multi-frame (0028,0008) mengambil frame yang tepat', function () {
    var f0 = polaSigned(W, H, 0), f1 = polaSigned(W, H, 1), f2 = polaSigned(W, H, 2);
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: H, cols: W, bits: 16, signed: true,
      frames: 3, pixels: f0.concat(f1, f2)
    });
    var ds = D.parse(buf);
    samaDengan(D.readPixels(ds, 0).frames, 3, 'jumlah frame');
    pikselSama(D.readPixels(ds, 0).pixels, f0, 'frame 0');
    pikselSama(D.readPixels(ds, 1).pixels, f1, 'frame 1');
    pikselSama(D.readPixels(ds, 2).pixels, f2, 'frame 2');
  });

  /* ==========================================================
     6. Berkas tanpa preamble / tanpa meta group
     ========================================================== */
  it('Dataset tanpa preamble dideteksi otomatis', function () {
    var px = polaUnsigned(W, H, 4000);
    ['implicit', 'explicit'].forEach(function (mode) {
      var buf = T.citraGrayscale({
        ts: mode === 'implicit' ? T.TS.IMPLICIT_LE : T.TS.EXPLICIT_LE,
        rows: H, cols: W, bits: 16, signed: false, pixels: px, preamble: false
      });
      var ds = D.parse(buf);
      samaDengan(ds.int('00280010'), H, 'Rows (' + mode + ' tanpa preamble)');
      pikselSama(D.readPixels(ds).pixels, px, 'piksel (' + mode + ' tanpa preamble)');
    });
  });

  /* ==========================================================
     7. PALETTE COLOR — indeks → RGB lewat LUT
     ========================================================== */
  it('PALETTE COLOR dipetakan lewat LUT, bukan dirender abu-abu', function () {
    var n = 256;
    var r = [], g = [], b = [];
    for (var i = 0; i < n; i++) {
      /* LUT 16 bit: byte tinggi yang dipakai untuk tampilan 8 bit */
      r.push((i) << 8);
      g.push((255 - i) << 8);
      b.push(((i * 3) % 256) << 8);
    }
    var px = [];
    for (var k = 0; k < W * H; k++) px.push(k % n);

    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: H, cols: W, bits: 8, signed: false,
      photometric: 'PALETTE COLOR', pixels: px,
      palette: { desc: [n, 0, 16], r: r, g: g, b: b }
    });

    var img = D.readPixels(D.parse(buf));
    benar(img.palette, 'img.palette terbaca');
    samaDengan(img.palette.count, n, 'jumlah entri LUT');
    samaDengan(img.palette.bits, 16, 'bit per entri LUT');
    samaDengan(img.photometric, 'PALETTE COLOR', 'photometric tetap PALETTE COLOR');

    var idata = D.toImageData(img, {});
    for (var t = 0; t < 5; t++) {
      var pos = t * 37;
      var idx = px[pos];
      samaDengan(idata.data[pos * 4], idx, 'R piksel ' + pos);
      samaDengan(idata.data[pos * 4 + 1], 255 - idx, 'G piksel ' + pos);
      samaDengan(idata.data[pos * 4 + 2], (idx * 3) % 256, 'B piksel ' + pos);
      samaDengan(idata.data[pos * 4 + 3], 255, 'alpha piksel ' + pos);
    }
  });

  it('PALETTE COLOR tanpa LUT lengkap turun ke grayscale, bukan galat', function () {
    var px = polaUnsigned(W, H, 255);
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: H, cols: W, bits: 8, signed: false,
      photometric: 'PALETTE COLOR', pixels: px      /* tanpa opsi palette */
    });
    var img = D.readPixels(D.parse(buf));
    benar(!img.palette, 'palette tidak dibuat saat LUT hilang');
    samaDengan(img.photometric, 'MONOCHROME2', 'jatuh ke MONOCHROME2');
    D.toImageData(img, {});     /* tidak boleh melempar */
  });

  /* ==========================================================
     8–9. RGB planar & interleaved
     ========================================================== */
  it('RGB interleaved (PlanarConfiguration 0)', function () {
    var w = 4, h = 3, n = w * h, px = [];
    for (var i = 0; i < n; i++) { px.push(i * 3 % 256, (i * 7) % 256, (i * 11) % 256); }
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: h, cols: w, bits: 8, signed: false,
      spp: 3, planar: 0, photometric: 'RGB', pixels: px
    });
    var img = D.readPixels(D.parse(buf));
    samaDengan(img.planar, 0, 'PlanarConfiguration');
    var d = D.toImageData(img, {}).data;
    for (var k = 0; k < n; k++) {
      samaDengan(d[k * 4], px[k * 3], 'R piksel ' + k);
      samaDengan(d[k * 4 + 1], px[k * 3 + 1], 'G piksel ' + k);
      samaDengan(d[k * 4 + 2], px[k * 3 + 2], 'B piksel ' + k);
    }
  });

  it('RGB planar (PlanarConfiguration 1) tidak mengacaukan kanal', function () {
    var w = 4, h = 3, n = w * h;
    var R = [], G = [], B = [];
    for (var i = 0; i < n; i++) { R.push(i * 3 % 256); G.push((i * 7) % 256); B.push((i * 11) % 256); }
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: h, cols: w, bits: 8, signed: false,
      spp: 3, planar: 1, photometric: 'RGB', pixels: R.concat(G, B)
    });
    var img = D.readPixels(D.parse(buf));
    samaDengan(img.planar, 1, 'PlanarConfiguration');
    /* toImageData harus memakai img.planar tanpa perlu diberi tahu lagi */
    var d = D.toImageData(img, {}).data;
    for (var k = 0; k < n; k++) {
      samaDengan(d[k * 4], R[k], 'R piksel ' + k);
      samaDengan(d[k * 4 + 1], G[k], 'G piksel ' + k);
      samaDengan(d[k * 4 + 2], B[k], 'B piksel ' + k);
    }
  });

  /* ==========================================================
     10. Deflated Explicit VR LE lewat parseAsync
     ========================================================== */
  it('Deflated Explicit VR LE dibuka oleh parseAsync', function () {
    if (typeof CompressionStream === 'undefined') {
      return { lewat: 'CompressionStream tidak tersedia di peramban ini' };
    }
    var px = polaSigned(W, H, 5);

    /* buat berkas Explicit VR LE biasa, lalu kompres bagian datasetnya */
    var polos = T.citraGrayscale({
      ts: T.TS.DEFLATE_LE, rows: H, cols: W, bits: 16, signed: true, pixels: px
    });

    /* parse() harus menandainya sebagai deflated dan tidak membaca sampah */
    var mentah = D.parse(polos);
    benar(mentah.deflated, 'parse() menandai ds.deflated');
    var meledak = false;
    try { D.readPixels(mentah); } catch (e) { meledak = true; }
    benar(meledak, 'readPixels() menolak dataset yang masih terkompresi');

    /* dataset di berkas di atas belum dikompresi, jadi susun ulang:
       ambil bagian setelah meta group dan kompres dengan deflate mentah */
    var mulai = mentah.dataStart;
    var isi = new Uint8Array(polos, mulai, polos.byteLength - mulai);
    var aliran = new Blob([isi]).stream().pipeThrough(new CompressionStream('deflate-raw'));

    return new Response(aliran).arrayBuffer().then(function (kompres) {
      var gabung = new Uint8Array(mulai + kompres.byteLength);
      gabung.set(new Uint8Array(polos, 0, mulai), 0);
      gabung.set(new Uint8Array(kompres), mulai);

      return D.parseAsync(gabung.buffer).then(function (ds) {
        benar(!ds.deflated, 'ds.deflated hilang setelah dikembangkan');
        samaDengan(ds.originalTransferSyntax, T.TS.DEFLATE_LE, 'transfer syntax asli dicatat');
        samaDengan(ds.int('00280010'), H, 'Rows setelah inflate');
        pikselSama(D.readPixels(ds).pixels, px, 'piksel setelah inflate');
      });
    });
  });

  /* ==========================================================
     11. Sequence tidak menimpa elemen tingkat atas
     ========================================================== */
  it('Tag di dalam sequence tidak menimpa tag tingkat atas', function () {
    [T.TS.IMPLICIT_LE, T.TS.EXPLICIT_LE].forEach(function (ts) {
      var explicit = ts !== T.TS.IMPLICIT_LE;
      var isiSQ = T.sequence([[
        ['00080018', 'UI', T.teks('9.9.9.9.DALAM.SEQUENCE', 'UI')],
        ['00081150', 'UI', T.teks('1.2.840.10008.5.1.4.1.1.2', 'UI')]
      ]], explicit, true);

      var buf = T.citraGrayscale({
        ts: ts, rows: 4, cols: 4, bits: 8, signed: false,
        pixels: polaUnsigned(4, 4, 200),
        sopUID: '1.1.1.1.TINGKAT.ATAS',
        tambahan: [['00081140', 'SQ', isiSQ]]
      });

      var ds = D.parse(buf);
      samaDengan(ds.string('00080018'), '1.1.1.1.TINGKAT.ATAS',
        'SOPInstanceUID tingkat atas bertahan (' + ts + ')');
      samaDengan(ds.int('00280010'), 4, 'Rows tetap terbaca setelah sequence (' + ts + ')');
      benar(D.readPixels(ds).pixels.length === 16, 'piksel tetap terbaca (' + ts + ')');
    });
  });

  /* ==========================================================
     11b. Sequence tanpa panjang tetap, berisi banyak item
     ----------------------------------------------------------
     Ini regresi dari bug sungguhan: parser berhenti di Item
     Delimitation yang PERTAMA, padahal setiap item punya satu.
     Akibatnya sisa berkas dibaca dari posisi yang salah dan tag
     sesudah sequence — termasuk Rows/Columns — tidak pernah
     ditemukan. Berkas sintetis lama tidak menangkapnya karena
     hanya memakai sequence berpanjang tetap.
     ========================================================== */
  it('Sequence tanpa panjang tetap dengan banyak item tidak merusak sinkronisasi', function () {
    [T.TS.IMPLICIT_LE, T.TS.EXPLICIT_LE, T.TS.EXPLICIT_BE].forEach(function (ts) {
      var explicit = ts !== T.TS.IMPLICIT_LE;
      var le = ts !== T.TS.EXPLICIT_BE;

      /* tiga item, masing-masing tanpa panjang tetap dan diakhiri
         Item Delimitation, lalu ditutup Sequence Delimitation */
      var w = [];
      function u16(v) { w.push(le ? (v & 0xFF) : (v >> 8) & 0xFF, le ? (v >> 8) & 0xFF : v & 0xFF); }
      function u32(v) {
        var b = [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
        if (!le) b.reverse();
        w.push(b[0], b[1], b[2], b[3]);
      }
      function elemen(tag, vr, isi) {
        u16(parseInt(tag.slice(0, 4), 16)); u16(parseInt(tag.slice(4), 16));
        if (explicit) { w.push(vr.charCodeAt(0), vr.charCodeAt(1)); u16(isi.length); }
        else u32(isi.length);
        for (var i = 0; i < isi.length; i++) w.push(isi[i]);
      }
      for (var k = 0; k < 3; k++) {
        u16(0xFFFE); u16(0xE000); u32(0xFFFFFFFF);              /* Item, tanpa panjang */
        elemen('00081150', 'UI', T.teks('1.2.840.10008.5.1.4.1.1.' + (k + 1), 'UI'));
        elemen('00081155', 'UI', T.teks('9.9.' + k, 'UI'));
        u16(0xFFFE); u16(0xE00D); u32(0);                       /* Item Delimitation */
      }
      u16(0xFFFE); u16(0xE0DD); u32(0);                          /* Sequence Delimitation */

      var px = polaUnsigned(8, 6, 300);
      var buf = T.citraGrayscale({
        ts: ts, rows: 6, cols: 8, bits: 16, signed: false, pixels: px,
        patient: 'Sesudah^Sequence',
        /* SQ tanpa panjang tetap: isi sudah memuat delimiternya sendiri */
        tambahan: [['00081140', 'SQ', new Uint8Array(w), { undefLen: true }]]
      });

      var ds = D.parse(buf);
      /* inilah intinya: tag SESUDAH sequence harus tetap terbaca */
      samaDengan(ds.int('00280010'), 6, 'Rows terbaca setelah sequence (' + ts + ')');
      samaDengan(ds.int('00280011'), 8, 'Columns terbaca setelah sequence (' + ts + ')');
      samaDengan(ds.string('00100010'), 'Sesudah^Sequence', 'PatientName (' + ts + ')');
      pikselSama(D.readPixels(ds).pixels, px, 'piksel setelah sequence (' + ts + ')');
      /* isi item tetap ikut tercatat untuk inspektur tag */
      benar(ds.has('00081150'), 'tag di dalam item tercatat (' + ts + ')');
    });
  });

  it('Item berpanjang tetap di dalam sequence tanpa panjang tetap', function () {
    var w = [];
    function u16(v) { w.push(v & 0xFF, (v >> 8) & 0xFF); }
    function u32(v) { w.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF); }

    var isiItem = [];
    (function () {
      var t = T.teks('1.2.3.4', 'UI');
      isiItem.push(0x08, 0x00, 0x50, 0x11);              /* (0008,1150) */
      isiItem.push(0x55, 0x49);                          /* VR 'UI' */
      isiItem.push(t.length & 0xFF, (t.length >> 8) & 0xFF);
      for (var i = 0; i < t.length; i++) isiItem.push(t[i]);
    })();

    /* dua item berpanjang tetap, ditutup Sequence Delimitation */
    for (var k = 0; k < 2; k++) {
      u16(0xFFFE); u16(0xE000); u32(isiItem.length);
      for (var i = 0; i < isiItem.length; i++) w.push(isiItem[i]);
    }
    u16(0xFFFE); u16(0xE0DD); u32(0);

    var px = polaUnsigned(8, 6, 300);
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: 6, cols: 8, bits: 16, signed: false, pixels: px,
      tambahan: [['00081140', 'SQ', new Uint8Array(w), { undefLen: true }]]
    });
    var ds = D.parse(buf);
    samaDengan(ds.int('00280010'), 6, 'Rows terbaca');
    pikselSama(D.readPixels(ds).pixels, px, 'piksel terbaca');
  });

  it('Piksel 1 bit terkemas (objek Segmentation) dibongkar per bit', function () {
    /* 16 piksel: pola bergantian, dikemas jadi 2 byte, LSB lebih dulu */
    var pola = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1];
    var byte0 = 0, byte1 = 0;
    for (var i = 0; i < 8; i++) { if (pola[i]) byte0 |= 1 << i; }
    for (var j = 0; j < 8; j++) { if (pola[8 + j]) byte1 |= 1 << j; }

    var buf = T.buat({
      ts: T.TS.EXPLICIT_LE,
      elemen: [
        ['00080060', 'CS', T.teks('SEG', 'CS')],
        ['00280002', 'US', T.u16arr(1, true)],
        ['00280004', 'CS', T.teks('MONOCHROME2', 'CS')],
        ['00280010', 'US', T.u16arr(4, true)],
        ['00280011', 'US', T.u16arr(4, true)],
        ['00280100', 'US', T.u16arr(1, true)],
        ['00280101', 'US', T.u16arr(1, true)],
        ['00280103', 'US', T.u16arr(0, true)],
        ['7FE00010', 'OW', T.u8arr([byte0, byte1])]
      ]
    });

    var img = D.readPixels(D.parse(buf));
    samaDengan(img.bitsAllocated, 1, 'BitsAllocated');
    samaDengan(img.pixels.length, 16, 'jumlah piksel');
    for (var k = 0; k < 16; k++) samaDengan(img.pixels[k], pola[k], 'bit ke-' + k);
    samaDengan(img.min, 0, 'min');
    samaDengan(img.max, 1, 'max');
    /* harus bisa dirender tanpa melempar */
    D.toImageData(img, {});
  });

  /* ==========================================================
     12. Transfer syntax terenkapsulasi
     ========================================================== */
  it('JPEG baseline ditandai untuk didekode peramban', function () {
    /* panjang fragmen harus genap, jadi contoh ini sengaja 12 byte */
    var jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    var buf = T.citraGrayscale({
      ts: '1.2.840.10008.1.2.4.50', rows: H, cols: W, bits: 8, signed: false,
      encapsulated: T.terenkapsulasi([jpeg], true)
    });
    var img = D.readPixels(D.parse(buf));
    sameMime(img);
    function sameMime(im) {
      samaDengan(im.encapsulated, true, 'encapsulated');
      samaDengan(im.mime, 'image/jpeg', 'mime');
      benar(!im.unsupported, 'tidak ditandai unsupported');
      benar(im.blobBytes && im.blobBytes.length === jpeg.length, 'fragmen pertama diambil, bukan BOT');
      for (var i = 0; i < jpeg.length; i++) {
        samaDengan(im.blobBytes[i], jpeg[i], 'byte JPEG ke-' + i);
      }
    }
  });

  it('JPEG 2000 dan RLE ditandai perlu dekoder tambahan', function () {
    ['1.2.840.10008.1.2.4.90', '1.2.840.10008.1.2.4.80', '1.2.840.10008.1.2.5'].forEach(function (ts) {
      var buf = T.citraGrayscale({
        ts: ts, rows: H, cols: W, bits: 8, signed: false,
        encapsulated: T.terenkapsulasi([new Uint8Array([1, 2, 3, 4])], true)
      });
      var img = D.readPixels(D.parse(buf));
      samaDengan(img.unsupported, ts, 'unsupported ditandai untuk ' + ts);
      benar(!img.mime, 'tidak diberi mime untuk ' + ts);
    });
  });

  /* ==========================================================
     13. Window/level & rescale
     ========================================================== */
  it('Window/level memetakan nilai HU ke 0–255 sesuai rumus', function () {
    /* satu baris nilai yang mudah diperiksa manual */
    var nilai = [0, 250, 500, 750, 1000, 1024, 1500, 2000, 4095, 4095, 0, 0];
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: 1, cols: nilai.length, bits: 16, signed: false,
      pixels: nilai, slope: 1, intercept: -1024
    });
    var img = D.readPixels(D.parse(buf));
    hampirSama(img.min, -1024, 1e-9, 'min setelah rescale');
    hampirSama(img.max, 4095 - 1024, 1e-9, 'max setelah rescale');

    var ww = 400, wc = 40, lo = wc - ww / 2, skala = 255 / ww;
    var d = D.toImageData(img, { windowCenter: wc, windowWidth: ww }).data;
    for (var i = 0; i < nilai.length; i++) {
      var hu = nilai[i] - 1024;
      var harap = Math.max(0, Math.min(255, (hu - lo) * skala));
      /* Uint8ClampedArray membulatkan ke terdekat */
      hampirSama(d[i * 4], Math.round(harap), 1, 'abu-abu piksel ' + i);
      samaDengan(d[i * 4], d[i * 4 + 1], 'kanal R=G piksel ' + i);
      samaDengan(d[i * 4 + 1], d[i * 4 + 2], 'kanal G=B piksel ' + i);
    }
  });

  it('MONOCHROME1 dirender terbalik terhadap MONOCHROME2', function () {
    var nilai = [0, 64, 128, 192, 255, 255, 0, 0];
    /* WW 255 / WL 127.5 membuat skala tepat 1 abu-abu per nilai piksel,
       sehingga perbandingan terbalik bisa diperiksa tanpa galat pembulatan */
    function render(photometric, invert) {
      var buf = T.citraGrayscale({
        ts: T.TS.EXPLICIT_LE, rows: 1, cols: nilai.length, bits: 8, signed: false,
        photometric: photometric, pixels: nilai
      });
      var img = D.readPixels(D.parse(buf));
      return D.toImageData(img, { windowCenter: 127.5, windowWidth: 255, invert: invert }).data;
    }
    var m2 = render('MONOCHROME2', false), m1 = render('MONOCHROME1', false);
    for (var i = 0; i < nilai.length; i++) {
      samaDengan(m1[i * 4], 255 - m2[i * 4], 'piksel ' + i + ' terbalik');
    }
    /* invert pada MONOCHROME1 membatalkan pembalikannya */
    var m1inv = render('MONOCHROME1', true);
    for (var j = 0; j < nilai.length; j++) {
      samaDengan(m1inv[j * 4], m2[j * 4], 'piksel ' + j + ' kembali normal saat invert');
    }
  });

  it('Window/level tanpa header memakai rentang nilai citra', function () {
    var nilai = [100, 200, 300, 400];
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: 1, cols: 4, bits: 16, signed: false, pixels: nilai
    });
    var img = D.readPixels(D.parse(buf));
    hampirSama(img.windowWidth, 300, 1e-9, 'WindowWidth otomatis');
    hampirSama(img.windowCenter, 250, 1e-9, 'WindowCenter otomatis');
  });

  /* ==========================================================
     14. Jalur cepat 16 bit vs jalur DataView
     ========================================================== */
  it('Jalur cepat 16 bit LE memberi hasil sama dengan Big Endian', function () {
    var px = polaSigned(W, H, 9);
    function baca(ts) {
      return D.readPixels(D.parse(T.citraGrayscale({
        ts: ts, rows: H, cols: W, bits: 16, signed: true, pixels: px
      })));
    }
    var le = baca(T.TS.EXPLICIT_LE), be = baca(T.TS.EXPLICIT_BE);
    pikselSama(le.pixels, px, 'jalur cepat LE');
    pikselSama(be.pixels, px, 'jalur DataView BE');
    pikselSama(le.pixels, be.pixels, 'kedua jalur identik');
    samaDengan(le.pixels.constructor, Int16Array, 'LE memakai Int16Array');
  });

  /* ==========================================================
     15. Inspektur tag
     ========================================================== */
  it('DataSet.list() menyusun tag terurut dan menyembunyikan data besar', function () {
    var buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE, rows: H, cols: W, bits: 16, signed: false,
      pixels: polaUnsigned(W, H, 3000), patient: 'Rahmawati^Siti'
    });
    var daftar = D.parse(buf).list();
    benar(daftar.length > 10, 'daftar tag tidak kosong');
    for (var i = 1; i < daftar.length; i++) {
      benar(daftar[i - 1].key <= daftar[i].key, 'urutan tag naik di indeks ' + i);
    }
    var nama = daftar.filter(function (t) { return t.key === '00100010'; })[0];
    benar(nama, 'PatientName ada di daftar');
    samaDengan(nama.name, 'PatientName', 'nama atribut dari kamus');
    samaDengan(nama.value, 'Rahmawati^Siti', 'nilai PatientName');
    var pd = daftar.filter(function (t) { return t.key === '7FE00010'; })[0];
    benar(pd && /byte/.test(pd.value), 'PixelData ditampilkan sebagai ukuran, bukan isi');
  });

  it('Berkas rusak melempar galat yang bisa dibaca, bukan diam', function () {
    var buf = T.buat({
      ts: T.TS.EXPLICIT_LE,
      elemen: [['00100010', 'PN', T.teks('Tanpa^Citra', 'PN')]]
    });
    var ds = D.parse(buf);
    samaDengan(ds.string('00100010'), 'Tanpa^Citra', 'metadata tetap terbaca');
    var pesan = null;
    try { D.readPixels(ds); } catch (e) { pesan = e.message; }
    benar(pesan && pesan.length > 5, 'readPixels melempar galat berpesan');
  });

  /* uji-volume.js menambah ke daftar yang sama */
  global.UJI = { daftar: uji };
})(window);
