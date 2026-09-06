/* ==========================================================
   KACA — penulis DICOM minimal
   ----------------------------------------------------------
   Bukan bagian dari aplikasi. Dipakai dua hal:
     - tests/uji-dicom.js — uji round-trip parser
     - tools/buat-contoh.js — membuat berkas contoh volumetrik

   Tujuannya membuat berkas DICOM Part-10 sungguhan di memori
   sehingga assets/js/dicom.js bisa diuji lewat round-trip:
   encode → parse → bandingkan.

   Bukan encoder lengkap. Yang didukung persis apa yang diperlukan
   uji: Implicit VR LE, Explicit VR LE, Explicit VR BE, sequence
   dengan panjang tetap, pixel data native, dan pixel data
   terenkapsulasi (fragmen + Basic Offset Table).
   ========================================================== */
(function (global) {
  'use strict';

  var VR_LONG = { OB: 1, OW: 1, OF: 1, OD: 1, OL: 1, OV: 1, SQ: 1, UT: 1, UN: 1, UC: 1, UR: 1, SV: 1, UV: 1 };

  var TS = {
    IMPLICIT_LE: '1.2.840.10008.1.2',
    EXPLICIT_LE: '1.2.840.10008.1.2.1',
    DEFLATE_LE:  '1.2.840.10008.1.2.1.99',
    EXPLICIT_BE: '1.2.840.10008.1.2.2'
  };

  /* ---------- penulis byte yang bisa tumbuh ---------- */
  function Penulis(awal) {
    this.b = new Uint8Array(awal || 4096);
    this.n = 0;
  }
  Penulis.prototype.pastikan = function (tambah) {
    if (this.n + tambah <= this.b.length) return;
    var besar = this.b.length;
    while (besar < this.n + tambah) besar *= 2;
    var baru = new Uint8Array(besar);
    baru.set(this.b.subarray(0, this.n));
    this.b = baru;
  };
  Penulis.prototype.u8 = function (v) {
    this.pastikan(1); this.b[this.n++] = v & 0xFF;
  };
  Penulis.prototype.u16 = function (v, le) {
    this.pastikan(2);
    if (le === false) { this.b[this.n++] = (v >> 8) & 0xFF; this.b[this.n++] = v & 0xFF; }
    else { this.b[this.n++] = v & 0xFF; this.b[this.n++] = (v >> 8) & 0xFF; }
  };
  Penulis.prototype.u32 = function (v, le) {
    this.pastikan(4);
    var dv = new DataView(this.b.buffer, this.n, 4);
    dv.setUint32(0, v >>> 0, le !== false);
    this.n += 4;
  };
  Penulis.prototype.bytes = function (arr) {
    this.pastikan(arr.length);
    this.b.set(arr, this.n);
    this.n += arr.length;
  };
  Penulis.prototype.ascii = function (s) {
    this.pastikan(s.length);
    for (var i = 0; i < s.length; i++) this.b[this.n++] = s.charCodeAt(i) & 0xFF;
  };
  Penulis.prototype.hasil = function () {
    return this.b.slice(0, this.n).buffer;
  };

  /* ---------- pengubah nilai → byte ---------- */
  /* teks: panjang DICOM selalu genap, UI diisi \0 dan sisanya spasi */
  function teks(s, vr) {
    s = String(s);
    var isi = new Uint8Array(s.length + (s.length % 2));
    for (var i = 0; i < s.length; i++) isi[i] = s.charCodeAt(i) & 0xFF;
    if (s.length % 2) isi[s.length] = (vr === 'UI' || vr === 'OB') ? 0 : 0x20;
    return isi;
  }
  /* Menerima angka tunggal, Array biasa, maupun TypedArray.
     Catatan: [].concat(typedArray) TIDAK membentangkan isinya — ia
     menghasilkan array berisi satu elemen typed array itu sendiri. */
  function keDaftar(nilai) {
    if (nilai === null || nilai === undefined) return [];
    if (typeof nilai === 'number') return [nilai];
    return nilai;      /* Array atau TypedArray: sudah punya length & indeks */
  }

  function u16arr(nilai, le) {
    var a = keDaftar(nilai);
    var isi = new Uint8Array(a.length * 2), dv = new DataView(isi.buffer);
    for (var i = 0; i < a.length; i++) dv.setUint16(i * 2, a[i] & 0xFFFF, le !== false);
    return isi;
  }
  function i16arr(nilai, le) {
    var a = keDaftar(nilai);
    var isi = new Uint8Array(a.length * 2), dv = new DataView(isi.buffer);
    for (var i = 0; i < a.length; i++) dv.setInt16(i * 2, a[i] | 0, le !== false);
    return isi;
  }
  function u8arr(nilai) {
    var a = keDaftar(nilai);
    var isi = new Uint8Array(a.length + (a.length % 2));
    for (var i = 0; i < a.length; i++) isi[i] = a[i] & 0xFF;
    return isi;
  }

  /* piksel 8/16 bit, signed atau tidak, mengikuti endianness dataset */
  function piksel(nilai, bits, signed, le) {
    if (bits === 8) return u8arr(nilai);
    return signed ? i16arr(nilai, le) : u16arr(nilai, le);
  }

  /* ---------- satu elemen ----------
     undefLen: tulis panjang 0xFFFFFFFF. Dipakai pixel data terenkapsulasi
     dan sequence tanpa panjang tetap — isi harus sudah memuat delimiternya. */
  function tulisElemen(w, tag, vr, isi, explicit, le, undefLen) {
    var g = parseInt(tag.slice(0, 4), 16), e = parseInt(tag.slice(4), 16);
    var panjang = undefLen ? 0xFFFFFFFF : isi.length;
    w.u16(g, le); w.u16(e, le);
    if (explicit) {
      w.ascii(vr);
      if (VR_LONG[vr]) { w.u16(0, le); w.u32(panjang, le); }
      else w.u16(panjang, le);
    } else {
      w.u32(panjang, le);
    }
    w.bytes(isi);
  }

  /* ---------- sequence dengan panjang tetap ---------- */
  /* item: array of [tag, vr, isiUint8Array] */
  function sequence(items, explicit, le) {
    var w = new Penulis(256);
    items.forEach(function (item) {
      /* satu Item (FFFE,E000) berisi beberapa elemen */
      var dalam = new Penulis(128);
      item.forEach(function (el) { tulisElemen(dalam, el[0], el[1], el[2], explicit, le); });
      var isi = new Uint8Array(dalam.hasil());
      w.u16(0xFFFE, le); w.u16(0xE000, le); w.u32(isi.length, le);
      w.bytes(isi);
    });
    return new Uint8Array(w.hasil());
  }

  /* ---------- pixel data terenkapsulasi ---------- */
  /* fragmen: array Uint8Array. Item pertama adalah Basic Offset Table kosong. */
  function terenkapsulasi(fragmen, le) {
    var w = new Penulis(1024);
    w.u16(0xFFFE, le); w.u16(0xE000, le); w.u32(0, le);        /* BOT kosong */
    fragmen.forEach(function (f) {
      var isi = f.length % 2 ? (function () {
        var p = new Uint8Array(f.length + 1); p.set(f); return p;
      })() : f;
      w.u16(0xFFFE, le); w.u16(0xE000, le); w.u32(isi.length, le);
      w.bytes(isi);
    });
    w.u16(0xFFFE, le); w.u16(0xE0DD, le); w.u32(0, le);        /* Sequence Delimitation */
    return new Uint8Array(w.hasil());
  }

  /* ==========================================================
     buat(opsi) → ArrayBuffer berisi berkas DICOM Part-10

     opsi:
       ts          transfer syntax UID (default Explicit VR LE)
       elemen      array [tag, vr, isiUint8Array] untuk dataset
       preamble    false untuk membuat berkas tanpa preamble & "DICM"
       undefLenSQ  true untuk memakai sequence panjang undefined
     ========================================================== */
  function buat(opsi) {
    opsi = opsi || {};
    var ts = opsi.ts || TS.EXPLICIT_LE;
    var explicit = ts !== TS.IMPLICIT_LE;
    var le = ts !== TS.EXPLICIT_BE;

    /* --- dataset --- */
    /* DICOM mewajibkan elemen tersusun menaik menurut tag. Diurutkan di
       sini supaya pemanggil bebas menyusun daftarnya dengan urutan apa pun
       dan berkasnya tetap sah untuk perkakas DICOM lain. */
    var daftar = (opsi.elemen || []).slice().sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });

    var dw = new Penulis(8192);
    daftar.forEach(function (el) {
      tulisElemen(dw, el[0], el[1], el[2], explicit, le, el[3] && el[3].undefLen);
    });
    var dataset = new Uint8Array(dw.hasil());

    /* berkas tanpa preamble & tanpa header meta */
    if (opsi.preamble === false) return dataset.buffer;

    /* --- meta group (selalu Explicit VR LE) --- */
    var mw = new Penulis(512);
    tulisElemen(mw, '00020002', 'UI', teks('1.2.840.10008.5.1.4.1.1.2', 'UI'), true, true);
    tulisElemen(mw, '00020003', 'UI', teks('1.2.826.0.1.3680043.9.7.1', 'UI'), true, true);
    tulisElemen(mw, '00020010', 'UI', teks(ts, 'UI'), true, true);
    var meta = new Uint8Array(mw.hasil());

    var w = new Penulis(meta.length + dataset.length + 256);
    for (var i = 0; i < 128; i++) w.u8(0);        /* preamble */
    w.ascii('DICM');
    tulisElemen(w, '00020000', 'UL', (function () {
      var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, meta.length, true); return b;
    })(), true, true);
    w.bytes(meta);
    w.bytes(dataset);
    return w.hasil();
  }

  /* ==========================================================
     Pembantu tingkat tinggi: berkas citra grayscale lengkap
     ========================================================== */
  function citraGrayscale(o) {
    o = o || {};
    var ts = o.ts || TS.EXPLICIT_LE;
    var le = ts !== TS.EXPLICIT_BE;
    var bits = o.bits || 16;
    var signed = !!o.signed;
    var frames = o.frames || 1;

    var elemen = [
      ['00080008', 'CS', teks(o.imageType || 'DERIVED\\SECONDARY\\PHANTOM', 'CS')],
      ['00080016', 'UI', teks('1.2.840.10008.5.1.4.1.1.2', 'UI')],
      ['00080018', 'UI', teks(o.sopUID || '1.2.3.4.5.6.7.8.9', 'UI')],
      ['00080020', 'DA', teks(o.date || '20260101', 'DA')],
      ['00080030', 'TM', teks(o.time || '090000', 'TM')],
      ['00080050', 'SH', teks(o.accession || 'ACC0000001', 'SH')],
      ['00080060', 'CS', teks(o.modality || 'CT', 'CS')],
      ['00080070', 'LO', teks(o.manufacturer || 'Kaca Prototype', 'LO')],
      ['00080080', 'LO', teks(o.institution || 'RS Contoh Kaca', 'LO')],
      ['00081030', 'LO', teks(o.studyDesc || 'Studi phantom', 'LO')],
      ['0008103E', 'LO', teks(o.seriesDesc || 'Seri phantom', 'LO')],
      ['00081090', 'LO', teks(o.model || 'Phantom Generator 2.0', 'LO')],
      ['00100010', 'PN', teks(o.patient || 'Wijaya^Andi', 'PN')],
      ['00100020', 'LO', teks(o.patientId || 'RM-0092841', 'LO')],
      ['00100030', 'DA', teks(o.birth || '19740312', 'DA')],
      ['00100040', 'CS', teks(o.sex || 'M', 'CS')],
      ['00101010', 'AS', teks(o.age || '051Y', 'AS')],
      ['00180015', 'CS', teks(o.bodyPart || 'CHEST', 'CS')],
      ['0020000D', 'UI', teks(o.studyUID || '1.2.3.4.5', 'UI')],
      ['0020000E', 'UI', teks(o.seriesUID || '1.2.3.4.5.1', 'UI')],
      ['00200011', 'IS', teks(String(o.seriesNumber || 1), 'IS')],
      ['00200013', 'IS', teks(String(o.instance || 1), 'IS')],
      ['00280002', 'US', u16arr(o.spp || 1, le)],
      ['00280004', 'CS', teks(o.photometric || 'MONOCHROME2', 'CS')],
      ['00280010', 'US', u16arr(o.rows, le)],
      ['00280011', 'US', u16arr(o.cols, le)],
      ['00280030', 'DS', teks((o.spacing || [0.68, 0.68]).join('\\'), 'DS')],
      ['00280100', 'US', u16arr(bits, le)],
      ['00280101', 'US', u16arr(o.stored || bits, le)],
      ['00280103', 'US', u16arr(signed ? 1 : 0, le)]
    ];
    /* geometri irisan — inilah yang dipakai assets/js/volume.js untuk
       mengurutkan irisan dan menghitung jarak antar irisan */
    if (o.imagePosition) {
      elemen.push(['00200032', 'DS', teks(o.imagePosition.map(function (v) {
        return (Math.round(v * 1000) / 1000).toString();
      }).join('\\'), 'DS')]);
    }
    if (o.imageOrientation) {
      elemen.push(['00200037', 'DS', teks(o.imageOrientation.join('\\'), 'DS')]);
    }
    if (o.sliceLocation !== undefined) {
      elemen.push(['00201041', 'DS', teks((Math.round(o.sliceLocation * 1000) / 1000).toString(), 'DS')]);
    }
    if (o.spacingBetweenSlices !== undefined) {
      elemen.push(['00180088', 'DS', teks(String(o.spacingBetweenSlices), 'DS')]);
    }
    if (o.thickness !== undefined) {
      elemen.push(['00180050', 'DS', teks(String(o.thickness), 'DS')]);
    }
    if (frames > 1) elemen.push(['00280008', 'IS', teks(String(frames), 'IS')]);
    if (o.spp === 3) elemen.push(['00280006', 'US', u16arr(o.planar || 0, le)]);
    if (o.slope !== undefined) elemen.push(['00281053', 'DS', teks(String(o.slope), 'DS')]);
    if (o.intercept !== undefined) elemen.push(['00281052', 'DS', teks(String(o.intercept), 'DS')]);
    if (o.wc !== undefined) elemen.push(['00281050', 'DS', teks(String(o.wc), 'DS')]);
    if (o.ww !== undefined) elemen.push(['00281051', 'DS', teks(String(o.ww), 'DS')]);
    if (o.rescaleType) elemen.push(['00281054', 'LO', teks(o.rescaleType, 'LO')]);
    if (o.palette) {
      elemen.push(['00281101', 'US', u16arr(o.palette.desc, le)]);
      elemen.push(['00281102', 'US', u16arr(o.palette.desc, le)]);
      elemen.push(['00281103', 'US', u16arr(o.palette.desc, le)]);
      elemen.push(['00281201', 'OW', u16arr(o.palette.r, le)]);
      elemen.push(['00281202', 'OW', u16arr(o.palette.g, le)]);
      elemen.push(['00281203', 'OW', u16arr(o.palette.b, le)]);
    }
    (o.tambahan || []).forEach(function (el) { elemen.push(el); });

    if (o.encapsulated) {
      /* pixel data terenkapsulasi selalu memakai panjang undefined */
      elemen.push(['7FE00010', 'OB', o.encapsulated, { undefLen: true }]);
    } else {
      elemen.push([
        '7FE00010', bits === 8 ? 'OB' : 'OW',
        piksel(o.pixels, bits, signed, le)
      ]);
    }
    return buat({ ts: ts, elemen: elemen, preamble: o.preamble });
  }

  global.TULIS = {
    TS: TS,
    buat: buat,
    citraGrayscale: citraGrayscale,
    teks: teks,
    u16arr: u16arr,
    i16arr: i16arr,
    u8arr: u8arr,
    piksel: piksel,
    sequence: sequence,
    terenkapsulasi: terenkapsulasi
  };
})(window);
