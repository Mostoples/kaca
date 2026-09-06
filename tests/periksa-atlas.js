#!/usr/bin/env node
/* ==========================================================
   KACA — pemeriksa atlas contoh
   ----------------------------------------------------------
   Jalankan: node tools/buat-atlas.js  lalu
             node tests/periksa-atlas.js

   Memuat berkas OBJ yang benar-benar ada di disk lewat MODEL,
   lalu memeriksa hal-hal yang tidak bisa dipalsukan uji sintetis:
   nama kelompok terbaca, normal menunjuk keluar, setiap organ
   benar-benar muncul di buffer ID (jadi bisa diklik), dan
   pemisahan organ betul-betul memindahkannya.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BERKAS = path.join(ROOT, 'contoh-dicom', 'atlas', 'atlas-contoh.obj');

if (!fs.existsSync(BERKAS)) {
  console.error('Berkas atlas belum ada. Jalankan dulu: node tools/buat-atlas.js');
  process.exit(1);
}

/* ---------- lingkungan tiruan (sama seperti node-runner) ---------- */
const sandbox = {
  DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
  Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer, Map, Promise,
  TextDecoder, TextEncoder, console, Math, JSON, Date, setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const konteks = vm.createContext(sandbox);
for (const rel of ['assets/js/mesh.js', 'assets/js/model.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), konteks, { filename: rel });
}
const MODEL = sandbox.MODEL;

const HIJAU = '\x1b[32m', MERAH = '\x1b[31m', ABU = '\x1b[90m', NOL = '\x1b[0m';
let gagal = 0;
function periksa(nama, ok, catatan) {
  if (ok) console.log(`  ${HIJAU}ok${NOL}   ${nama}${catatan ? `  ${ABU}${catatan}${NOL}` : ''}`);
  else { gagal++; console.log(`  ${MERAH}GAGAL${NOL} ${nama}${catatan ? `  ${MERAH}${catatan}${NOL}` : ''}`); }
}

const t0 = Date.now();
const teks = fs.readFileSync(BERKAS, 'utf8');
console.log(`\natlas-contoh.obj — ${Math.round(teks.length / 1024)} KB`);

const hasil = MODEL.muat('atlas-contoh.obj', teks);
periksa('OBJ terurai', hasil.bagian.length > 0, `${hasil.bagian.length} bagian`);
periksa('setiap organ jadi kelompok terpisah', hasil.bagian.length === 13,
  hasil.bagian.map((b) => b.nama).join(', '));

const wajib = ['jantung', 'hati', 'paru kiri', 'paru kanan', 'ginjal kiri', 'otak', 'usus'];
const hilang = wajib.filter((n) => !hasil.bagian.some((b) => b.nama === n));
periksa('nama organ terbaca dari penanda "o"', hilang.length === 0, hilang.join(', ') || 'lengkap');

/* warna harus berbeda antar organ yang berbeda jenis */
const jantung = hasil.bagian.find((b) => b.nama === 'jantung');
const hati = hasil.bagian.find((b) => b.nama === 'hati');
periksa('warna organ diambil dari palet',
  jantung.warna.join() !== hati.warna.join(),
  `jantung ${jantung.warna.join(',')} · hati ${hati.warna.join(',')}`);

/* normal harus menunjuk keluar: untuk bentuk mirip bola, normal di
   sebuah titik harus searah dengan vektor pusat organ → titik itu */
let salahArah = 0, dicoba = 0;
for (const b of hasil.bagian) {
  const k = b.mesh.kotak();
  const c = [(k.min[0] + k.max[0]) / 2, (k.min[1] + k.max[1]) / 2, (k.min[2] + k.max[2]) / 2];
  const n = b.mesh.jumlahTitik();
  for (let v = 0; v < n; v += Math.max(1, Math.floor(n / 40))) {
    const dx = b.mesh.vert[v * 3] - c[0];
    const dy = b.mesh.vert[v * 3 + 1] - c[1];
    const dz = b.mesh.vert[v * 3 + 2] - c[2];
    const dot = dx * b.mesh.norm[v * 3] + dy * b.mesh.norm[v * 3 + 1] + dz * b.mesh.norm[v * 3 + 2];
    dicoba++;
    if (dot <= 0) salahArah++;
  }
}
periksa('normal menunjuk keluar', salahArah === 0, `${salahArah} dari ${dicoba} titik salah arah`);

/* ---------- adegan ---------- */
const ad = new MODEL.Adegan(hasil.bagian);
const kotak = ad.kotak();
periksa('kotak pembatas masuk akal untuk tubuh manusia',
  kotak.max[2] - kotak.min[2] > 400 && kotak.max[2] - kotak.min[2] < 900,
  `tinggi ${Math.round(kotak.max[2] - kotak.min[2])} mm · lebar ${Math.round(kotak.max[0] - kotak.min[0])} mm`);

const img = ad.render({ ukuran: 256, azimut: 0 });
let terang = 0;
for (let i = 0; i < img.pixels.length; i += 3) if (img.pixels[i] + img.pixels[i + 1] + img.pixels[i + 2] > 30) terang++;
periksa('adegan benar-benar tergambar', terang > 3000, `${terang} piksel berisi`);

/* setiap organ harus bisa diklik pada setidaknya satu sudut, kalau tidak
   organ itu selalu tertutup organ lain dan mekanisme pilih jadi bohong */
const terlihat = new Set();
const SUDUT = 8;
for (let s = 0; s < SUDUT; s++) {
  ad.render({ ukuran: 256, azimut: s / SUDUT * Math.PI * 2 });
  for (const v of ad._id) if (v >= 0) terlihat.add(v);
}
const takTerlihat = ad.bagian.map((b, i) => [b.nama, i]).filter(([, i]) => !terlihat.has(i));
periksa(`setiap organ terlihat di salah satu dari ${SUDUT} sudut`,
  takTerlihat.length === 0, takTerlihat.map(([n]) => n).join(', ') || 'semua terlihat');

/* isolasi: hanya organ terpilih yang boleh menulis ID */
ad.isolasi(ad.indeksNama('jantung'));
ad.render({ ukuran: 256, azimut: 0 });
const idLain = new Set();
for (const v of ad._id) if (v >= 0) idLain.add(v);
periksa('isolasi menyisakan satu organ yang bisa diklik',
  idLain.size <= 1, `${idLain.size} organ menulis ID`);

/* pisahkan: kotak pembatas harus membesar */
ad.kembalikan();
const rSebelum = ad.kotak().r;
ad.ledak(0.8);
const rSesudah = ad.kotak().r;
periksa('pisahkan memperbesar sebaran organ',
  rSesudah > rSebelum * 1.2,
  `radius ${Math.round(rSebelum)} → ${Math.round(rSesudah)} mm`);

/* bolak-balik STL untuk satu organ */
const stl = jantung.mesh.stl('jantung');
const ulang = MODEL.dariSTL(stl, { nama: 'jantung' });
periksa('organ bisa diekspor ke STL lalu dibaca ulang',
  ulang.bagian[0].mesh.jumlahSegitiga() === jantung.mesh.jumlahSegitiga(),
  `${ulang.bagian[0].mesh.jumlahSegitiga()} segitiga`);

console.log('');
console.log(gagal ? `${MERAH}${gagal} pemeriksaan gagal${NOL}` :
  `${HIJAU}semua pemeriksaan lulus${NOL} ${ABU}· ${((Date.now() - t0) / 1000).toFixed(1)} s${NOL}`);
process.exit(gagal ? 1 : 0);
