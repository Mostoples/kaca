#!/usr/bin/env node
/* ==========================================================
   KACA — pembangkit atlas anatomi contoh
   ----------------------------------------------------------
   Jalankan: node tools/buat-atlas.js

   Menulis satu berkas OBJ berisi sepuluh organ sebagai kelompok
   "o" terpisah, siap dimuat di mode Atlas pada prisma.html.

   MENGAPA DIBANGKITKAN, BUKAN DIUNDUH
   Berkas ini ada supaya fitur atlas bisa dicoba dan diuji tanpa
   bergantung pada unduhan pihak ketiga, dan tanpa pertanyaan
   lisensi sama sekali: bentuknya dihitung dari rumus di berkas
   ini, jadi tidak ada karya orang lain yang tersalin.

   INI BUKAN ANATOMI SUNGGUHAN. Bentuknya elipsoid yang
   dilengkungkan, letaknya kasar, dan tidak boleh dipakai untuk
   apa pun selain memeriksa jalannya perangkat lunak. Untuk atlas
   sungguhan, muat model berlisensi terbuka — lihat README.

   Deterministik: pembangkit acaknya berbenih tetap, jadi keluaran
   selalu identik. Hasilnya dikecualikan git.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const KELUARAN = path.join(__dirname, '..', 'contoh-dicom', 'atlas');

/* pembangkit acak berbenih — bentuk organ harus sama tiap dijalankan */
function acakBerbenih(benih) {
  let s = benih >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ----------------------------------------------------------
   Satu organ = bola UV yang diskalakan lalu dilengkungkan oleh
   beberapa gelombang sinus. Bola UV dipilih karena topologinya
   dijamin tertutup dan jumlah segitiganya bisa diatur persis.
   ---------------------------------------------------------- */
function organ(opsi) {
  const nSeg = opsi.seg || 28;          /* pembagian bujur */
  const nCin = opsi.cincin || 20;       /* pembagian lintang */
  const acak = acakBerbenih(opsi.benih || 1);

  /* tiga gelombang dengan fase acak; amplitudonya kecil supaya
     bentuknya tetap membulat, tidak berduri */
  const gel = [];
  for (let i = 0; i < 3; i++) {
    gel.push({
      a: (0.06 + acak() * 0.11) * (opsi.benjol === undefined ? 1 : opsi.benjol),
      fu: 1 + Math.floor(acak() * 3),
      fv: 1 + Math.floor(acak() * 3),
      pu: acak() * Math.PI * 2,
      pv: acak() * Math.PI * 2
    });
  }

  const vert = [];
  const tri = [];

  for (let j = 0; j <= nCin; j++) {
    const v = j / nCin;
    const theta = v * Math.PI;               /* 0..π dari kutub ke kutub */
    for (let i = 0; i <= nSeg; i++) {
      const u = i / nSeg;
      const phi = u * Math.PI * 2;

      let r = 1;
      for (const g of gel) r += g.a * Math.sin(g.fu * phi + g.pu) * Math.sin(g.fv * theta + g.pv);

      /* kutub dipaksa kembali ke radius 1 supaya tidak menganga */
      const dekatKutub = Math.min(v, 1 - v) * 2;
      if (dekatKutub < 0.25) r = 1 + (r - 1) * (dekatKutub / 0.25);

      let x = r * Math.sin(theta) * Math.cos(phi);
      let y = r * Math.sin(theta) * Math.sin(phi);
      let z = r * Math.cos(theta);

      x *= opsi.rx; y *= opsi.ry; z *= opsi.rz;

      /* lengkungan sepanjang z, untuk bentuk seperti lambung atau usus */
      if (opsi.lengkung) x += opsi.lengkung * (z / opsi.rz) * (z / opsi.rz);

      vert.push([x + opsi.px, y + opsi.py, z + opsi.pz]);
    }
  }

  const lebar = nSeg + 1;
  for (let j = 0; j < nCin; j++) {
    for (let i = 0; i < nSeg; i++) {
      const a = j * lebar + i;
      const b = a + 1;
      const c = a + lebar;
      const d = c + 1;
      /* putaran berlawanan arah jam dilihat dari luar */
      tri.push([a, c, d]);
      tri.push([a, d, b]);
    }
  }

  return { nama: opsi.nama, vert, tri };
}

/* ----------------------------------------------------------
   Susunan organ. Sumbu mengikuti kesepakatan DICOM di Kaca:
   +x kiri pasien, +y posterior, +z superior. Satuan milimeter.
   ---------------------------------------------------------- */
const ORGAN = [
  /* Otak dibuat cukup kecil dan mata cukup ke depan supaya keduanya TIDAK
     saling tembus. Versi pertama menaruh mata di dalam elipsoid otak:
     pemeriksa tetap lulus (mata memang terlihat di sudut tertentu) tetapi
     hasil gambarnya jelas salah. */
  { nama: 'otak',        rx: 60,  ry: 68,  rz: 48, px: 0,   py: -4,  pz: 302, benih: 11, benjol: 0.5, seg: 30, cincin: 22 },
  { nama: 'mata kanan',  rx: 12,  ry: 12,  rz: 12, px: -28, py: -92, pz: 254, benih: 23, benjol: 0.15, seg: 16, cincin: 12 },
  { nama: 'mata kiri',   rx: 12,  ry: 12,  rz: 12, px: 28,  py: -92, pz: 254, benih: 24, benjol: 0.15, seg: 16, cincin: 12 },
  { nama: 'paru kanan',  rx: 52,  ry: 46,  rz: 98, px: -66, py: 6,   pz: 120, benih: 31, benjol: 0.7 },
  { nama: 'paru kiri',   rx: 48,  ry: 44,  rz: 96, px: 66,  py: 6,   pz: 120, benih: 37, benjol: 0.7 },
  { nama: 'jantung',     rx: 44,  ry: 40,  rz: 56, px: 8,   py: -6,  pz: 96,  benih: 41, benjol: 0.8 },
  { nama: 'hati',        rx: 84,  ry: 52,  rz: 44, px: -34, py: -6,  pz: 20,  benih: 53, benjol: 0.9 },
  { nama: 'lambung',     rx: 40,  ry: 32,  rz: 46, px: 44,  py: -4,  pz: 16,  benih: 59, benjol: 1.0, lengkung: 22 },
  { nama: 'limpa',       rx: 26,  ry: 24,  rz: 38, px: 82,  py: 22,  pz: 22,  benih: 61, benjol: 0.6 },
  { nama: 'pankreas',    rx: 66,  ry: 16,  rz: 16, px: 6,   py: 18,  pz: -6,  benih: 67, benjol: 0.7 },
  { nama: 'ginjal kanan',rx: 24,  ry: 22,  rz: 38, px: -52, py: 40,  pz: -14, benih: 71, benjol: 0.5 },
  { nama: 'ginjal kiri', rx: 24,  ry: 22,  rz: 38, px: 52,  py: 40,  pz: -8,  benih: 73, benjol: 0.5 },
  { nama: 'usus',        rx: 78,  ry: 54,  rz: 62, px: 0,   py: -6,  pz: -84, benih: 79, benjol: 1.3, seg: 32, cincin: 24 }
];

function main() {
  fs.mkdirSync(KELUARAN, { recursive: true });

  const bagian = ORGAN.map(organ);
  const baris = [
    '# Kaca — atlas anatomi CONTOH, dibangkitkan oleh tools/buat-atlas.js',
    '# BUKAN anatomi sungguhan: bentuk elipsoid berlekuk, letak kasar.',
    '# Hanya untuk memeriksa jalannya perangkat lunak. Bukan untuk klinis,',
    '# bukan untuk pendidikan. Satuan: milimeter.',
    '# Sumbu: +x kiri pasien, +y posterior, +z superior.'
  ];

  let geser = 0;
  let totalTri = 0;
  for (const b of bagian) {
    baris.push('o ' + b.nama);
    for (const v of b.vert) {
      baris.push('v ' + v[0].toFixed(3) + ' ' + v[1].toFixed(3) + ' ' + v[2].toFixed(3));
    }
    for (const t of b.tri) {
      baris.push('f ' + (t[0] + 1 + geser) + ' ' + (t[1] + 1 + geser) + ' ' + (t[2] + 1 + geser));
    }
    geser += b.vert.length;
    totalTri += b.tri.length;
    console.log('  ' + b.nama.padEnd(14) + b.vert.length.toString().padStart(6) + ' titik  ' +
                b.tri.length.toString().padStart(6) + ' segitiga');
  }

  const berkas = path.join(KELUARAN, 'atlas-contoh.obj');
  fs.writeFileSync(berkas, baris.join('\n') + '\n');

  /* tiap organ juga ditulis sendiri-sendiri, untuk menguji pemuatan
     banyak berkas sekaligus di panel atlas */
  for (const b of bagian) {
    const l = ['# Kaca — organ contoh (bukan anatomi sungguhan)', 'o ' + b.nama];
    for (const v of b.vert) l.push('v ' + v[0].toFixed(3) + ' ' + v[1].toFixed(3) + ' ' + v[2].toFixed(3));
    for (const t of b.tri) l.push('f ' + (t[0] + 1) + ' ' + (t[1] + 1) + ' ' + (t[2] + 1));
    fs.writeFileSync(path.join(KELUARAN, b.nama.replace(/\s+/g, '-') + '.obj'), l.join('\n') + '\n');
  }

  const kb = Math.round(fs.statSync(berkas).size / 1024);
  console.log('');
  console.log(bagian.length + ' organ · ' + totalTri.toLocaleString('id-ID') + ' segitiga · ' + kb + ' KB');
  console.log('→ ' + path.relative(path.join(__dirname, '..'), berkas));
  console.log('');
  console.log('Muat berkas itu di prisma.html → mode Atlas → "Buka model OBJ/STL…".');
}

main();
