/* ==========================================================
   KACA — Data demo (phantom sintetis)
   Menghasilkan objek image yang bentuknya sama persis dengan
   hasil DICOM.readPixels(), sehingga viewer tidak perlu tahu
   apakah sumbernya file DICOM asli atau phantom demo.
   ========================================================== */
(function (global) {
  'use strict';

  /* PRNG deterministik supaya tampilan konsisten antar reload */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function blank(w, h, fill) {
    var a = new Int16Array(w * h);
    if (fill) a.fill(fill);
    return a;
  }

  function wrapImage(px, w, h, opt) {
    opt = opt || {};
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < px.length; i++) { var v = px[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return {
      rows: h, cols: w, frames: 1, frame: 0,
      samplesPerPixel: 1, bitsAllocated: 16, signed: true,
      photometric: 'MONOCHROME2',
      slope: 1, intercept: 0,
      windowCenter: opt.wc !== undefined ? opt.wc : (mx + mn) / 2,
      windowWidth: opt.ww !== undefined ? opt.ww : Math.max(1, mx - mn),
      pixelSpacing: opt.spacing || [0.68, 0.68],
      sliceThickness: opt.thickness || 3,
      pixels: px, min: mn, max: mx,
      encapsulated: false, synthetic: true
    };
  }

  /* ---------- primitif menggambar ---------- */
  function ellipse(px, w, h, cx, cy, rx, ry, value, soft, rand, noise) {
    if (rx <= 0 || ry <= 0) return;
    var x0 = Math.max(0, Math.floor(cx - rx - 2)), x1 = Math.min(w - 1, Math.ceil(cx + rx + 2));
    var y0 = Math.max(0, Math.floor(cy - ry - 2)), y1 = Math.min(h - 1, Math.ceil(cy + ry + 2));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry;
        var d = dx * dx + dy * dy;
        if (d <= 1) {
          var v = value;
          if (soft) v = value * (1 - 0.18 * d);
          if (noise && rand) v += (rand() - 0.5) * noise;
          px[y * w + x] = v;
        }
      }
    }
  }

  function ellipseRot(px, w, h, cx, cy, rx, ry, ang, value, rand, noise) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var R = Math.max(rx, ry) + 2;
    for (var y = Math.max(0, cy - R | 0); y <= Math.min(h - 1, cy + R | 0); y++) {
      for (var x = Math.max(0, cx - R | 0); x <= Math.min(w - 1, cx + R | 0); x++) {
        var ox = x - cx, oy = y - cy;
        var u = (ox * ca + oy * sa) / rx, v2 = (-ox * sa + oy * ca) / ry;
        if (u * u + v2 * v2 <= 1) {
          var val = value + (noise && rand ? (rand() - 0.5) * noise : 0);
          px[y * w + x] = val;
        }
      }
    }
  }

  /* ==========================================================
     CT TORAKS — axial, HU realistis
     ========================================================== */
  function ctThorax(w, h, slice, total, seed) {
    var rand = rng(seed + slice * 977);
    var px = blank(w, h, -1000);                      // udara
    var t = slice / Math.max(1, total - 1);           // 0 = apex, 1 = basis
    var cx = w / 2, cy = h / 2 + 6;
    var bodyRx = w * (0.34 + 0.045 * Math.sin(t * Math.PI));
    var bodyRy = h * (0.25 + 0.035 * Math.sin(t * Math.PI));

    ellipse(px, w, h, cx, cy, bodyRx, bodyRy, -95, false, rand, 26);          // lemak subkutan
    ellipse(px, w, h, cx, cy, bodyRx * 0.93, bodyRy * 0.9, 42, false, rand, 22); // otot / dinding dada

    /* paru kiri & kanan */
    var lungRx = bodyRx * 0.36, lungRy = bodyRy * 0.66;
    var lungH = -845 + 60 * Math.sin(t * Math.PI);
    ellipse(px, w, h, cx - bodyRx * 0.42, cy - bodyRy * 0.05, lungRx, lungRy, lungH, false, rand, 120);
    ellipse(px, w, h, cx + bodyRx * 0.42, cy - bodyRy * 0.05, lungRx * 0.97, lungRy, lungH, false, rand, 120);

    /* vaskular paru */
    for (var i = 0; i < 46; i++) {
      var side = rand() < 0.5 ? -1 : 1;
      var vx = cx + side * bodyRx * (0.22 + rand() * 0.42);
      var vy = cy - bodyRy * 0.4 + rand() * bodyRy * 0.9;
      ellipse(px, w, h, vx, vy, 1 + rand() * 2.4, 1 + rand() * 2.4, 20 + rand() * 90, false, rand, 40);
    }

    /* mediastinum + jantung (membesar ke arah basis) */
    var heart = 0.35 + 0.55 * Math.max(0, t - 0.25);
    ellipse(px, w, h, cx + 6, cy + bodyRy * 0.12, bodyRx * 0.20 * (0.7 + heart), bodyRy * 0.34 * (0.7 + heart), 45, false, rand, 14);
    ellipse(px, w, h, cx - 4, cy - bodyRy * 0.16, bodyRx * 0.10, bodyRy * 0.14, 38, false, rand, 12);   // aorta
    ellipse(px, w, h, cx - 2, cy - bodyRy * 0.30, 5, 5, -960, false, null, 0);                          // trakea

    /* vertebra + kanal spinalis */
    ellipse(px, w, h, cx, cy + bodyRy * 0.68, bodyRx * 0.14, bodyRy * 0.20, 340, false, rand, 90);
    ellipse(px, w, h, cx, cy + bodyRy * 0.70, bodyRx * 0.055, bodyRy * 0.075, 32, false, rand, 12);

    /* iga */
    for (var k = 0; k < 14; k++) {
      var a = (-0.42 + k / 13 * 1.84) * Math.PI;
      var rx2 = bodyRx * 0.94, ry2 = bodyRy * 0.93;
      var bx = cx + Math.cos(a) * rx2, by = cy + Math.sin(a) * ry2;
      ellipseRot(px, w, h, bx | 0, by | 0, 6, 3, a + Math.PI / 2, 620 + rand() * 260, rand, 120);
    }

    /* sternum */
    ellipse(px, w, h, cx, cy - bodyRy * 0.88, bodyRx * 0.09, 4, 520, false, rand, 90);

    /* nodul paru (temuan demo) pada irisan tengah */
    if (Math.abs(slice - Math.round(total * 0.45)) <= 2) {
      var f = 1 - Math.abs(slice - Math.round(total * 0.45)) / 3;
      ellipse(px, w, h, cx - bodyRx * 0.46, cy + bodyRy * 0.10, 5.5 * f + 1.5, 5.0 * f + 1.5, 30, true, rand, 30);
    }
    return wrapImage(px, w, h, { wc: -500, ww: 1500, spacing: [0.72, 0.72], thickness: 3 });
  }

  /* ==========================================================
     CT KEPALA — axial
     ========================================================== */
  function ctHead(w, h, slice, total, seed) {
    var rand = rng(seed + slice * 613);
    var px = blank(w, h, -1000);
    var t = slice / Math.max(1, total - 1);
    var cx = w / 2, cy = h / 2;
    var shrink = Math.sin(0.25 + t * 2.4) * 0.5 + 0.6;
    var rx = w * 0.31 * Math.max(0.3, shrink), ry = h * 0.38 * Math.max(0.3, shrink);

    ellipse(px, w, h, cx, cy, rx + 7, ry + 7, 30, false, rand, 20);        // kulit kepala
    ellipse(px, w, h, cx, cy, rx + 4, ry + 4, 1100, false, rand, 180);     // tulang tengkorak
    ellipse(px, w, h, cx, cy, rx, ry, 36, false, rand, 10);               // CSF ruang subarachnoid
    ellipse(px, w, h, cx, cy, rx * 0.94, ry * 0.94, 38, false, rand, 8);   // grey matter
    ellipse(px, w, h, cx, cy, rx * 0.78, ry * 0.80, 27, false, rand, 7);   // white matter

    /* ventrikel lateral */
    if (t > 0.25 && t < 0.85) {
      var vw = rx * 0.15 * Math.sin((t - 0.25) / 0.6 * Math.PI);
      ellipseRot(px, w, h, cx - rx * 0.22 | 0, cy - ry * 0.05 | 0, vw + 3, ry * 0.26, -0.24, 8, rand, 6);
      ellipseRot(px, w, h, cx + rx * 0.22 | 0, cy - ry * 0.05 | 0, vw + 3, ry * 0.26, 0.24, 8, rand, 6);
      ellipse(px, w, h, cx, cy + ry * 0.05, 3, ry * 0.10, 10, false, rand, 5);   // ventrikel III
    }
    /* falx cerebri */
    for (var y = cy - ry * 0.9; y < cy + ry * 0.9; y++) {
      var yy = y | 0; if (yy < 0 || yy >= h) continue;
      px[yy * w + (cx | 0)] = 52;
    }
    return wrapImage(px, w, h, { wc: 40, ww: 80, spacing: [0.45, 0.45], thickness: 5 });
  }

  /* ==========================================================
     MR OTAK — T1-weighted (nilai arbitrer, bukan HU)
     ========================================================== */
  function mrBrain(w, h, slice, total, seed) {
    var rand = rng(seed + slice * 337);
    var px = blank(w, h, 6);
    var t = slice / Math.max(1, total - 1);
    var cx = w / 2, cy = h / 2;
    var shrink = Math.sin(0.3 + t * 2.3) * 0.5 + 0.62;
    var rx = w * 0.30 * Math.max(0.28, shrink), ry = h * 0.36 * Math.max(0.28, shrink);

    ellipse(px, w, h, cx, cy, rx + 6, ry + 6, 620, false, rand, 90);   // lemak subkutan (terang di T1)
    ellipse(px, w, h, cx, cy, rx + 3, ry + 3, 60, false, rand, 30);    // tabula tulang (gelap)
    ellipse(px, w, h, cx, cy, rx, ry, 430, false, rand, 60);           // grey matter
    ellipse(px, w, h, cx, cy, rx * 0.80, ry * 0.82, 660, false, rand, 55); // white matter

    if (t > 0.25 && t < 0.85) {
      var vw = rx * 0.16 * Math.sin((t - 0.25) / 0.6 * Math.PI);
      ellipseRot(px, w, h, cx - rx * 0.23 | 0, cy - ry * 0.04 | 0, vw + 3, ry * 0.27, -0.22, 90, rand, 25);
      ellipseRot(px, w, h, cx + rx * 0.23 | 0, cy - ry * 0.04 | 0, vw + 3, ry * 0.27, 0.22, 90, rand, 25);
    }
    /* girus kortikal */
    for (var g = 0; g < 26; g++) {
      var a = g / 26 * Math.PI * 2;
      ellipse(px, w, h, cx + Math.cos(a) * rx * 0.88, cy + Math.sin(a) * ry * 0.88,
        rx * 0.07, ry * 0.07, 300 + rand() * 90, true, rand, 40);
    }
    return wrapImage(px, w, h, { wc: 380, ww: 760, spacing: [0.86, 0.86], thickness: 5 });
  }

  /* ==========================================================
     CR TORAKS — proyeksi PA
     ========================================================== */
  function crChest(w, h, seed) {
    var rand = rng(seed);
    var px = blank(w, h, 240);
    var cx = w / 2, cy = h / 2;

    ellipse(px, w, h, cx, cy + h * 0.02, w * 0.44, h * 0.46, 1500, false, rand, 60);     // jaringan lunak
    /* lapangan paru — memanjang vertikal seperti proyeksi PA */
    ellipse(px, w, h, cx - w * 0.185, cy - h * 0.10, w * 0.150, h * 0.33, 420, false, rand, 90);
    ellipse(px, w, h, cx + w * 0.185, cy - h * 0.10, w * 0.150, h * 0.33, 420, false, rand, 90);
    /* corak bronkovaskular */
    for (var i = 0; i < 260; i++) {
      var side = rand() < .5 ? -1 : 1;
      var a = rand(), rr = rand();
      var vx = cx + side * (w * 0.06 + a * w * 0.24);
      var vy = cy - h * 0.30 + rr * h * 0.58;
      ellipse(px, w, h, vx, vy, 1 + rand() * 2, 1 + rand() * 2, 700 + rand() * 500, false, rand, 100);
    }
    /* mediastinum + jantung */
    ellipse(px, w, h, cx, cy - h * 0.20, w * 0.052, h * 0.20, 2100, false, rand, 60);
    ellipse(px, w, h, cx - w * 0.050, cy + h * 0.07, w * 0.125, h * 0.155, 2050, false, rand, 50);
    /* kubah diafragma */
    ellipse(px, w, h, cx - w * 0.185, cy + h * 0.29, w * 0.185, h * 0.10, 2200, false, rand, 60);
    ellipse(px, w, h, cx + w * 0.185, cy + h * 0.32, w * 0.185, h * 0.10, 2200, false, rand, 60);
    /* iga */
    for (var k = 0; k < 9; k++) {
      for (var s = -1; s <= 1; s += 2) {
        var yy = cy - h * 0.30 + k * h * 0.072;
        for (var xx = 0; xx < w * 0.40; xx++) {
          var px2 = (cx + s * (w * 0.03 + xx)) | 0;
          var py2 = (yy + Math.pow(xx / (w * 0.40), 1.9) * h * 0.14) | 0;
          if (px2 < 1 || px2 >= w - 1 || py2 < 1 || py2 >= h - 1) continue;
          for (var d = -2; d <= 2; d++) {
            var idx = (py2 + d) * w + px2;
            px[idx] = Math.min(3400, px[idx] + 620 - Math.abs(d) * 130);
          }
        }
      }
    }
    /* klavikula */
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      for (var x2 = 0; x2 < w * 0.26; x2++) {
        var pxx = (cx + s2 * (w * 0.04 + x2)) | 0;
        var pyy = (cy - h * 0.38 + Math.pow(x2 / (w * 0.26), 2) * h * 0.05) | 0;
        for (var dd = -3; dd <= 3; dd++) {
          if (pyy + dd < 0 || pyy + dd >= h || pxx < 0 || pxx >= w) continue;
          px[(pyy + dd) * w + pxx] = 2900;
        }
      }
    }
    /* vertebra torakal */
    for (var v = 0; v < 11; v++) {
      ellipse(px, w, h, cx, cy - h * 0.36 + v * h * 0.068, w * 0.028, h * 0.024, 2600, false, rand, 90);
    }
    return wrapImage(px, w, h, { wc: 1400, ww: 2600, spacing: [0.14, 0.14], thickness: 0 });
  }

  /* ==========================================================
     US — sektor dengan speckle
     ========================================================== */
  function usSector(w, h, frame, seed) {
    var rand = rng(seed + frame * 131);
    var px = blank(w, h, 0);
    var apexX = w / 2, apexY = h * 0.06;
    var maxR = h * 0.9, half = 0.42;   // radian
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = x - apexX, dy = y - apexY;
        var r = Math.sqrt(dx * dx + dy * dy);
        if (r > maxR || r < h * 0.08) continue;
        var a = Math.atan2(dx, dy);
        if (Math.abs(a) > half) continue;
        var atten = Math.exp(-r / (maxR * 0.85));
        var speck = Math.pow(rand(), 2.1);
        var base = 40 + speck * 190 * atten;
        /* struktur: dua lesi anekoik yang bergerak antar frame */
        var lx = apexX + Math.sin(frame / 9) * 26 - 34, ly = h * 0.46;
        var lx2 = apexX + 40, ly2 = h * 0.60 + Math.cos(frame / 11) * 12;
        if (Math.hypot(x - lx, y - ly) < 26) base *= 0.12;
        if (Math.hypot(x - lx2, y - ly2) < 17) base *= 0.20;
        /* fascia terang */
        if (Math.abs(r - maxR * 0.55) < 2.2) base += 70;
        px[y * w + x] = base;
      }
    }
    return wrapImage(px, w, h, { wc: 128, ww: 256, spacing: [0.20, 0.20], thickness: 0 });
  }

  /* ==========================================================
     Katalog studi demo
     ========================================================== */
  var STUDIES = [
    {
      id: 'ST-2409-0143', accession: 'ACC0000143', urgent: true, status: 'Belum dibaca',
      patient: { name: 'Wijaya^Andi', id: 'RM-0092841', sex: 'M', birth: '19740312', age: '051Y' },
      modality: 'CT', desc: 'CT Toraks Kontras', bodyPart: 'CHEST',
      date: '20260901', time: '084215', institution: 'RS Harapan Medika',
      station: 'CT-SOMATOM-01', manufacturer: 'Siemens Healthineers', model: 'SOMATOM go.Top',
      referring: 'dr. Sari Puspita, Sp.P',
      series: [
        { desc: 'Axial Mediastinum 3mm', n: 24, gen: 'ctThorax', num: 2 },
        { desc: 'Axial Lung Window 3mm', n: 24, gen: 'ctThorax', num: 3, wc: -600, ww: 1600 },
        { desc: 'Topogram AP', n: 1, gen: 'crChest', num: 1 }
      ]
    },
    {
      id: 'ST-2409-0144', accession: 'ACC0000144', urgent: false, status: 'Sedang dibaca',
      patient: { name: 'Halim^Maria', id: 'RM-0113507', sex: 'F', birth: '19880725', age: '037Y' },
      modality: 'MR', desc: 'MRI Kepala Non-Kontras', bodyPart: 'HEAD',
      date: '20260901', time: '101340', institution: 'RS Harapan Medika',
      station: 'MR-VIDA-02', manufacturer: 'Siemens Healthineers', model: 'MAGNETOM Vida 3T',
      referring: 'dr. Bagus Nugroho, Sp.S',
      series: [
        { desc: 'AX T1 MPRAGE', n: 22, gen: 'mrBrain', num: 3 },
        { desc: 'AX T2 FLAIR', n: 22, gen: 'mrBrain', num: 4, invertish: true }
      ]
    },
    {
      id: 'ST-2409-0145', accession: 'ACC0000145', urgent: false, status: 'Selesai',
      patient: { name: 'Santoso^Budi', id: 'RM-0087320', sex: 'M', birth: '19601119', age: '065Y' },
      modality: 'CR', desc: 'Foto Toraks PA', bodyPart: 'CHEST',
      date: '20260831', time: '073055', institution: 'Klinik Sehat Bersama',
      station: 'DR-01', manufacturer: 'Fujifilm', model: 'FDR Smart X',
      referring: 'dr. Lina Kartika',
      series: [{ desc: 'PA Erect', n: 1, gen: 'crChest', num: 1 }]
    },
    {
      id: 'ST-2409-0146', accession: 'ACC0000146', urgent: true, status: 'Belum dibaca',
      patient: { name: 'Prasetyo^Dewi', id: 'RM-0129944', sex: 'F', birth: '19950203', age: '030Y' },
      modality: 'CT', desc: 'CT Kepala Tanpa Kontras', bodyPart: 'HEAD',
      date: '20260902', time: '025510', institution: 'RS Harapan Medika',
      station: 'CT-SOMATOM-01', manufacturer: 'Siemens Healthineers', model: 'SOMATOM go.Top',
      referring: 'dr. IGD Shift Malam',
      series: [{ desc: 'AX Brain 5mm', n: 20, gen: 'ctHead', num: 2 }]
    },
    {
      id: 'ST-2409-0147', accession: 'ACC0000147', urgent: false, status: 'Belum dibaca',
      patient: { name: 'Rahmawati^Siti', id: 'RM-0134002', sex: 'F', birth: '19910617', age: '034Y' },
      modality: 'US', desc: 'USG Abdomen Atas', bodyPart: 'ABDOMEN',
      date: '20260902', time: '134502', institution: 'Klinik Sehat Bersama',
      station: 'US-EPIQ-01', manufacturer: 'Philips', model: 'EPIQ Elite',
      referring: 'dr. Tono Wibisono, Sp.PD',
      series: [{ desc: 'Cine Hepar', n: 20, gen: 'usSector', num: 1, cine: true }]
    },
    {
      id: 'ST-2409-0148', accession: 'ACC0000148', urgent: false, status: 'Selesai',
      patient: { name: 'Kusuma^Rian', id: 'RM-0101288', sex: 'M', birth: '20010930', age: '024Y' },
      modality: 'MR', desc: 'MRI Kepala Follow-up', bodyPart: 'HEAD',
      date: '20260829', time: '155020', institution: 'RS Harapan Medika',
      station: 'MR-VIDA-02', manufacturer: 'Siemens Healthineers', model: 'MAGNETOM Vida 3T',
      referring: 'dr. Bagus Nugroho, Sp.S',
      series: [{ desc: 'AX T1 MPRAGE', n: 18, gen: 'mrBrain', num: 2 }]
    }
  ];

  var GEN = { ctThorax: ctThorax, ctHead: ctHead, mrBrain: mrBrain, crChest: crChest, usSector: usSector };

  /* Bangun gambar untuk satu seri (dipanggil lazy saat seri dibuka) */
  function buildSeriesImages(study, sIdx) {
    var s = study.series[sIdx];
    var seed = 0;
    for (var i = 0; i < study.id.length; i++) seed = (seed * 31 + study.id.charCodeAt(i)) >>> 0;
    seed += sIdx * 7919;

    var size = s.gen === 'crChest' ? 512 : s.gen === 'usSector' ? 384 : 320;
    var imgs = [];
    for (var k = 0; k < s.n; k++) {
      var img;
      if (s.gen === 'crChest') img = crChest(size, Math.round(size * 1.15), seed);
      else if (s.gen === 'usSector') img = usSector(size, Math.round(size * 0.95), k, seed);
      else img = GEN[s.gen](size, size, k, s.n, seed);

      if (s.wc !== undefined) { img.windowCenter = s.wc; img.windowWidth = s.ww; }
      /* modalitas dibawa di tingkat citra supaya satuan nilai piksel
         (HU atau tanpa satuan) bisa ditentukan per citra */
      img.modality = study.modality;
      img.rescaleType = study.modality === 'CT' ? 'HU' : '';
      img.instanceNumber = k + 1;
      img.sliceLocation = (k - s.n / 2) * (img.sliceThickness || 3);
      imgs.push(img);
    }
    return imgs;
  }

  /* Metadata mirip DICOM untuk panel tag (studi demo) */
  function fakeTags(study, sIdx, img, instance) {
    var s = study.series[sIdx], p = study.patient;
    var rows = [
      ['0008,0005', 'CS', 'SpecificCharacterSet', 'ISO_IR 100'],
      ['0008,0008', 'CS', 'ImageType', 'DERIVED\\SECONDARY\\PHANTOM'],
      ['0008,0016', 'UI', 'SOPClassUID', '1.2.840.10008.5.1.4.1.1.' + (study.modality === 'CT' ? '2' : study.modality === 'MR' ? '4' : '1.1')],
      ['0008,0018', 'UI', 'SOPInstanceUID', '1.2.826.0.1.3680043.8.498.' + study.id.replace(/\D/g, '') + '.' + (sIdx + 1) + '.' + instance],
      ['0008,0020', 'DA', 'StudyDate', study.date],
      ['0008,0030', 'TM', 'StudyTime', study.time],
      ['0008,0050', 'SH', 'AccessionNumber', study.accession],
      ['0008,0060', 'CS', 'Modality', study.modality],
      ['0008,0070', 'LO', 'Manufacturer', study.manufacturer],
      ['0008,0080', 'LO', 'InstitutionName', study.institution],
      ['0008,0090', 'PN', 'ReferringPhysicianName', study.referring],
      ['0008,1010', 'SH', 'StationName', study.station],
      ['0008,1030', 'LO', 'StudyDescription', study.desc],
      ['0008,103E', 'LO', 'SeriesDescription', s.desc],
      ['0008,1090', 'LO', 'ManufacturerModelName', study.model],
      ['0010,0010', 'PN', 'PatientName', p.name],
      ['0010,0020', 'LO', 'PatientID', p.id],
      ['0010,0030', 'DA', 'PatientBirthDate', p.birth],
      ['0010,0040', 'CS', 'PatientSex', p.sex],
      ['0010,1010', 'AS', 'PatientAge', p.age],
      ['0018,0015', 'CS', 'BodyPartExamined', study.bodyPart],
      ['0018,0050', 'DS', 'SliceThickness', String(img.sliceThickness || 0)],
      ['0020,000D', 'UI', 'StudyInstanceUID', '1.2.826.0.1.3680043.8.498.' + study.id.replace(/\D/g, '')],
      ['0020,000E', 'UI', 'SeriesInstanceUID', '1.2.826.0.1.3680043.8.498.' + study.id.replace(/\D/g, '') + '.' + (sIdx + 1)],
      ['0020,0011', 'IS', 'SeriesNumber', String(s.num)],
      ['0020,0013', 'IS', 'InstanceNumber', String(instance)],
      ['0020,1041', 'DS', 'SliceLocation', (img.sliceLocation || 0).toFixed(2)],
      ['0028,0002', 'US', 'SamplesPerPixel', '1'],
      ['0028,0004', 'CS', 'PhotometricInterpretation', 'MONOCHROME2'],
      ['0028,0010', 'US', 'Rows', String(img.rows)],
      ['0028,0011', 'US', 'Columns', String(img.cols)],
      ['0028,0030', 'DS', 'PixelSpacing', img.pixelSpacing[0] + '\\' + img.pixelSpacing[1]],
      ['0028,0100', 'US', 'BitsAllocated', '16'],
      ['0028,0101', 'US', 'BitsStored', '12'],
      ['0028,0103', 'US', 'PixelRepresentation', '1'],
      ['0028,1050', 'DS', 'WindowCenter', String(Math.round(img.windowCenter))],
      ['0028,1051', 'DS', 'WindowWidth', String(Math.round(img.windowWidth))],
      ['0028,1052', 'DS', 'RescaleIntercept', '0'],
      ['0028,1053', 'DS', 'RescaleSlope', '1'],
      ['7FE0,0010', 'OW', 'PixelData', '<' + (img.rows * img.cols * 2) + ' byte>']
    ];
    return rows.map(function (r) {
      return { tag: '(' + r[0] + ')', key: r[0].replace(',', ''), vr: r[1], name: r[2], value: r[3] };
    });
  }

  global.DEMO = {
    studies: STUDIES,
    buildSeriesImages: buildSeriesImages,
    fakeTags: fakeTags,
    generators: GEN,
    wrapImage: wrapImage
  };
})(window);
