#!/usr/bin/env node
/* ==========================================================
   KACA — penyusun video promo & tutorial
   ----------------------------------------------------------
   Jalankan: node video/susun.js [promo|tutorial]

   Bahannya sudah ada lebih dulu:
     video/potongan/*.mp4    klip yang dirender NATIVE dari data
                             TCIA sungguhan (video/render-adegan.js)
     video/tangkapan/*.png   tangkapan halaman sungguhan lewat Edge
                             headless (video/tangkap.js)

   CARA KERJANYA
   Tiap ruas disusun jadi berkas mp4 tersendiri lebih dulu, lalu
   semuanya disambung dengan concat demuxer. Sengaja begitu:
   satu filter_complex raksasa untuk 12 ruas hampir mustahil
   ditelusuri kalau ada yang salah, sedangkan begini setiap ruas
   bisa diperiksa satu-satu.

   Peralihannya berupa fade masuk/keluar per ruas, bukan xfade.
   xfade menuntut seluruh ruas masuk ke satu graf sekaligus, dan
   itu mengembalikan masalah yang baru saja dihindari.

   Teks selalu lewat `textfile=`, tidak pernah ditanam langsung di
   string filter. Tanda titik dua, koma, dan apostrof di dalam teks
   Indonesia akan mengacaukan pengurai filter ffmpeg kalau ditanam.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AKAR = __dirname;
const TANGKAP = path.join(AKAR, 'tangkapan');
const POTONG = path.join(AKAR, 'potongan');
const TMP = path.join(AKAR, 'tmp', 'susun');

const L = 1920, T = 1080, FPS = 30;
const LATAR = '0x06090c';          /* sama dengan --bg proyek */
const AKSEN = '0x2fd4bd';          /* --accent */

/* ----------------------------------------------------------
   Jalur di DALAM string filter
   ----------------------------------------------------------
   Jalur Windows mutlak tidak bisa dipakai di dalam filter ffmpeg.
   "C:/x" akan diurai dua kali — sekali oleh pengurai filtergraph,
   sekali oleh pengurai opsi filter — sehingga titik dua tetap
   terbaca sebagai pemisah opsi betapa pun di-escape.

   Jalan keluarnya bukan menambah backslash, tetapi menghilangkan
   titik duanya: ffmpeg dijalankan dengan cwd di folder kerja, dan
   di dalam filter hanya ada nama berkas polos. Font pun disalin ke
   situ lebih dulu. Jalur mutlak tetap dipakai untuk -i dan keluaran,
   karena argumen tidak melewati pengurai filter.
   ---------------------------------------------------------- */
const FONT = 'f-tebal.ttf';
const FONT_R = 'f-biasa.ttf';
const FONT_M = 'f-mono.ttf';
const FONT_ASAL = {
  [FONT]: 'C:/Windows/Fonts/segoeuib.ttf',
  [FONT_R]: 'C:/Windows/Fonts/segoeui.ttf',
  [FONT_M]: 'C:/Windows/Fonts/consola.ttf'
};

function siapkanKerja() {
  fs.mkdirSync(TMP, { recursive: true });
  for (const [nama, asal] of Object.entries(FONT_ASAL)) {
    if (!fs.existsSync(asal)) throw new Error('Font tidak ada: ' + asal);
    fs.copyFileSync(asal, path.join(TMP, nama));
  }
}

let nomor = 0;
function berkasTeks(teks) {
  const nama = 't' + (++nomor) + '.txt';
  fs.writeFileSync(path.join(TMP, nama), teks, 'utf8');
  return nama;
}

function ff(args, apa) {
  try {
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 600000, cwd: TMP });
  } catch (e) {
    const err = e.stderr ? e.stderr.toString() : (e.message || '');
    throw new Error('ffmpeg gagal pada ' + apa + '\n' + err.trim().split('\n').slice(-8).join('\n'));
  }
}

function durasi(berkas) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', berkas]).toString().trim();
  return parseFloat(out) || 0;
}

/* ==========================================================
   Gaya "futuristik"
   ----------------------------------------------------------
   Ditahan supaya tetap terbaca: kontras & saturasi naik sedikit,
   vignette, dan satu garis pindai tipis yang berjalan turun.
   Garis pindai itu drawbox dengan y sebagai fungsi waktu — jauh
   lebih murah daripada overlay bertekstur, dan tidak menutupi UI.
   Koma di dalam ekspresi WAJIB di-escape jadi \, .
   ========================================================== */
const GAYA = [
  'eq=contrast=1.05:saturation=1.06',
  'vignette=PI/5',
  `drawbox=x=0:y='mod(t*300\\,${T + 40})-20':w=iw:h=2:color=${AKSEN}@0.13:t=fill`,
  `drawbox=x=0:y='mod(t*300\\,${T + 40})-14':w=iw:h=6:color=${AKSEN}@0.05:t=fill`
].join(',');

/* fade masuk/keluar seragam untuk setiap ruas */
function fade(d) {
  const f = 0.42;
  return `fade=t=in:st=0:d=${f},fade=t=out:st=${(d - f).toFixed(2)}:d=${f}`;
}

const SANDI = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
  '-pix_fmt', 'yuv420p', '-r', String(FPS)];

/* ----------------------------------------------------------
   Keterangan bawah (lower third)
   ---------------------------------------------------------- */
function keterangan(teks, kecil) {
  if (!teks) return null;
  const f = berkasTeks(teks);
  const y = kecil ? T - 148 : T - 156;
  const bagian = [
    /* palang aksen di kiri teks */
    `drawbox=x=88:y=${y - 6}:w=4:h=52:color=${AKSEN}@0.95:t=fill`,
    `drawtext=textfile=${f}:fontfile=${FONT}:fontsize=42:fontcolor=white@0.96` +
      `:x=112:y=${y}:shadowcolor=black@0.75:shadowx=0:shadowy=2`
  ];
  if (kecil) {
    const g = berkasTeks(kecil);
    bagian.push(`drawtext=textfile=${g}:fontfile=${FONT_M}:fontsize=25:fontcolor=${AKSEN}@0.85` +
      `:x=112:y=${y + 54}:shadowcolor=black@0.75:shadowx=0:shadowy=2`);
  }
  return bagian.join(',');
}

/* ----------------------------------------------------------
   Ruas 1: kartu judul
   ---------------------------------------------------------- */
function kartu(o) {
  const keluar = path.join(TMP, o.nama + '.mp4');
  const d = o.durasi;
  const fJudul = berkasTeks(o.judul);
  const bagian = [
    `drawtext=textfile=${fJudul}:fontfile=${FONT}:fontsize=${o.besar || 128}` +
      `:fontcolor=white:x=(w-tw)/2:y=(h-th)/2-${o.sub ? 62 : 20}` +
      `:alpha='min(1\\,max(0\\,(t-0.25)*1.6))'`
  ];
  if (o.sub) {
    const fSub = berkasTeks(o.sub);
    bagian.push(`drawtext=textfile=${fSub}:fontfile=${FONT_R}:fontsize=44:fontcolor=${AKSEN}@0.92` +
      `:x=(w-tw)/2:y=(h-th)/2+56:alpha='min(1\\,max(0\\,(t-0.7)*1.6))'`);
  }
  if (o.kaki) {
    const fKaki = berkasTeks(o.kaki);
    bagian.push(`drawtext=textfile=${fKaki}:fontfile=${FONT_M}:fontsize=27:fontcolor=white@0.55` +
      `:x=(w-tw)/2:y=h-140:alpha='min(1\\,max(0\\,(t-1.1)*1.6))'`);
  }
  /* garis aksen yang melebar dari tengah */
  bagian.push(`drawbox=x='(iw-min(iw*0.34\\,t*420))/2':y=${o.sub ? 'ih/2-2' : 'ih/2+72'}` +
    `:w='min(iw*0.34\\,t*420)':h=3:color=${AKSEN}@0.8:t=fill`);

  const vf = [bagian.join(','), GAYA, fade(d)].join(',');
  ff(['-f', 'lavfi', '-i', `color=c=${LATAR}:s=${L}x${T}:r=${FPS}:d=${d}`,
    '-vf', vf, ...SANDI, keluar], 'kartu ' + o.nama);
  return keluar;
}

/* ----------------------------------------------------------
   Ruas 2: tangkapan diam + Ken Burns
   ----------------------------------------------------------
   Tangkapan 1600x1000 (16:10) dipasang ke 1920x1080 (16:9) dengan
   PAD, bukan crop. Memotong akan membuang bilah kepala atau kaki
   halaman, dan pada video tutorial justru bagian itu yang dirujuk.
   ---------------------------------------------------------- */
function gambar(o) {
  const masuk = path.join(TANGKAP, o.png + '.png');
  if (!fs.existsSync(masuk)) throw new Error('tangkapan tidak ada: ' + masuk);
  const keluar = path.join(TMP, o.nama + '.mp4');
  const d = o.durasi;
  const zoomAkhir = o.zoom === undefined ? 1.14 : o.zoom;
  const laju = ((zoomAkhir - 1) / (d * FPS)).toFixed(6);

  /* arah zoom: 0 = tengah, 1 = ke panel kanan, 2 = ke tengah panggung */
  let x = 'iw/2-(iw/zoom/2)', y = 'ih/2-(ih/zoom/2)';
  if (o.ke === 'kanan') x = 'iw-(iw/zoom)';
  if (o.ke === 'kiri') x = '0';

  const bagian = [
    `scale=${L}:${T}:force_original_aspect_ratio=decrease`,
    `pad=${L}:${T}:(ow-iw)/2:(oh-ih)/2:color=${LATAR}`,
    `zoompan=z='min(1+${laju}*on\\,${zoomAkhir})':d=1:x='${x}':y='${y}':s=${L}x${T}:fps=${FPS}`
  ];
  const ket = keterangan(o.teks, o.sub);
  if (ket) bagian.push(ket);
  bagian.push(GAYA, fade(d));

  ff(['-loop', '1', '-t', String(d), '-i', masuk,
    '-vf', bagian.join(','), ...SANDI, keluar], 'gambar ' + o.nama);
  return keluar;
}

/* ----------------------------------------------------------
   Ruas 3: geser tegak pada tangkapan halaman panjang
   ---------------------------------------------------------- */
function geserTegak(o) {
  const masuk = path.join(TANGKAP, o.png + '.png');
  if (!fs.existsSync(masuk)) throw new Error('tangkapan tidak ada: ' + masuk);
  const keluar = path.join(TMP, o.nama + '.mp4');
  const d = o.durasi;

  const bagian = [
    `scale=${L}:-2`,
    `crop=${L}:${T}:0:'min((ih-${T})*(t/${d})\\,ih-${T})'`
  ];
  const ket = keterangan(o.teks, o.sub);
  if (ket) bagian.push(ket);
  bagian.push(GAYA, fade(d));

  ff(['-loop', '1', '-t', String(d), '-i', masuk,
    '-vf', bagian.join(','), ...SANDI, keluar], 'geserTegak ' + o.nama);
  return keluar;
}

/* ----------------------------------------------------------
   Ruas 4: klip yang sudah dirender native
   ---------------------------------------------------------- */
function klip(o) {
  const masuk = path.join(POTONG, o.mp4 + '.mp4');
  if (!fs.existsSync(masuk)) throw new Error('klip tidak ada: ' + masuk);
  const keluar = path.join(TMP, o.nama + '.mp4');
  const asli = durasi(masuk);
  const d = Math.min(o.durasi || asli, asli);

  const bagian = [
    `scale=${L}:${T}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${L}:${T}:(ow-iw)/2:(oh-ih)/2:color=${LATAR}`
  ];
  const ket = keterangan(o.teks, o.sub);
  if (ket) bagian.push(ket);
  bagian.push(GAYA, fade(d));

  ff(['-t', String(d), '-i', masuk, '-vf', bagian.join(','),
    '-an', ...SANDI, keluar], 'klip ' + o.nama);
  return keluar;
}

/* ----------------------------------------------------------
   Sambung semua ruas + tambahkan jalur audio senyap
   ----------------------------------------------------------
   Audio senyap ditambahkan karena beberapa pemutar dan pengunggah
   (termasuk pengimpor CapCut) memperlakukan berkas tanpa jalur audio
   secara aneh. Tidak ada musik: tidak ada yang berlisensi jelas.
   ---------------------------------------------------------- */
function gabung(ruas, keluar) {
  const daftar = path.join(TMP, 'daftar-' + path.basename(keluar, '.mp4') + '.txt');
  fs.writeFileSync(daftar,
    ruas.map((r) => "file '" + r.replace(/\\/g, '/') + "'").join('\n') + '\n', 'utf8');

  ff(['-f', 'concat', '-safe', '0', '-i', daftar,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart', keluar], 'gabung ' + path.basename(keluar));
  return keluar;
}

/* ==========================================================
   Susunan PROMO — cepat, tanpa penjelasan, mengandalkan gerak
   ========================================================== */
function promo() {
  const r = [];
  r.push(kartu({
    nama: 'p00', durasi: 3.4, besar: 170,
    judul: 'KACA', sub: 'viewer hologram prisma untuk citra DICOM',
    kaki: 'kaca-id.web.app'
  }));
  r.push(klip({ nama: 'p01', mp4: 'prisma-mip', durasi: 5.5,
    teks: 'Empat pandangan, satu hologram', sub: 'CT toraks · TCIA' }));
  r.push(gambar({ nama: 'p02', png: '06-hologram-penuh', durasi: 3.6, zoom: 1.18,
    teks: 'Puncak prisma di titik tengah' }));
  r.push(klip({ nama: 'p03', mp4: 'prisma-volume', durasi: 5.0,
    teks: 'Volume rendering', sub: 'opasitas sebagai transfer function' }));
  r.push(klip({ nama: 'p04', mp4: 'prisma-permukaan', durasi: 5.5,
    teks: 'Isosurface', sub: 'marching tetrahedra di CPU' }));
  r.push(gambar({ nama: 'p05', png: '09-atlas-hologram', durasi: 4.0, zoom: 1.2,
    teks: 'Atlas anatomi', sub: '13 organ dari berkas OBJ' }));
  r.push(gambar({ nama: 'p06', png: '08-atlas-panel', durasi: 4.0, zoom: 1.16, ke: 'kanan',
    teks: 'Sorot organ dengan klik atau suara' }));
  r.push(klip({ nama: 'p07', mp4: 'mpr-koronal', durasi: 4.2,
    teks: 'MPR koronal & sagital', sub: 'dari satu tumpukan irisan aksial' }));
  r.push(klip({ nama: 'p08', mp4: 'mip-tunggal', durasi: 4.2,
    teks: 'MIP', sub: 'ray-cast di peramban' }));
  r.push(gambar({ nama: 'p09', png: '11-viewer-3d', durasi: 3.8, zoom: 1.16,
    teks: 'Semuanya di dalam peramban' }));
  r.push(kartu({
    nama: 'p10', durasi: 4.2, besar: 96,
    judul: 'kaca-id.web.app',
    sub: 'tanpa framework, tanpa bundler, tanpa dependensi',
    kaki: 'prototipe antarmuka, bukan perangkat medis'
  }));
  return gabung(r, path.join(AKAR, 'kaca-promo.mp4'));
}

/* ==========================================================
   Susunan TUTORIAL — berurutan, satu langkah satu ruas
   ========================================================== */
function tutorial() {
  const r = [];
  r.push(kartu({
    nama: 't00', durasi: 3.6, besar: 108,
    judul: 'Cara pakai Kaca', sub: 'dari membuka situs sampai hologram menyala',
    kaki: 'kaca-id.web.app'
  }));
  r.push(geserTegak({ nama: 't01', png: '02-landing-penuh', durasi: 8.5,
    teks: '1 · Buka kaca-id.web.app', sub: 'tidak ada yang perlu dipasang' }));
  r.push(gambar({ nama: 't02', png: '03-masuk', durasi: 5.0, zoom: 1.1,
    teks: '2 · Masuk, atau lanjut sebagai tamu', sub: 'mode tamu tidak menunggu jaringan' }));
  r.push(gambar({ nama: 't03', png: '04-studi', durasi: 5.5, zoom: 1.12,
    teks: '3 · Pilih studi di daftar', sub: 'atau jatuhkan folder DICOM ke halaman' }));
  r.push(gambar({ nama: 't04', png: '05-hologram-panel', durasi: 6.0, zoom: 1.14, ke: 'kanan',
    teks: '4 · Panggung hologram terbuka', sub: 'panel kanan mengatur semuanya' }));
  r.push(gambar({ nama: 't05', png: '06-hologram-penuh', durasi: 5.5, zoom: 1.16,
    teks: '5 · Tekan P untuk sembunyikan panel', sub: 'letakkan puncak prisma di penanda tengah' }));
  r.push(gambar({ nama: 't06', png: '07-hologram-permukaan', durasi: 5.5, zoom: 1.14,
    teks: '6 · Mode Permukaan', sub: 'geser Ambang lalu Render ulang' }));
  r.push(gambar({ nama: 't07', png: '08-atlas-panel', durasi: 6.5, zoom: 1.14, ke: 'kanan',
    teks: '7 · Mode Atlas', sub: 'Buka model OBJ atau STL' }));
  r.push(gambar({ nama: 't08', png: '09-atlas-hologram', durasi: 5.5, zoom: 1.16,
    teks: '8 · Klik organ untuk menyorotnya', sub: 'atau sebut namanya dengan suara' }));
  r.push(gambar({ nama: 't09', png: '10-viewer', durasi: 5.5, zoom: 1.12,
    teks: '9 · Viewer 2D untuk mengukur & membaca', sub: 'W/L, zoom, jarak, sudut, ROI' }));
  r.push(gambar({ nama: 't10', png: '11-viewer-3d', durasi: 5.5, zoom: 1.12,
    teks: '10 · Bangun 3D & MPR', sub: 'tujuh seri turunan sekali tekan' }));
  r.push(gambar({ nama: 't11', png: '12-uji', durasi: 4.5, zoom: 1.1,
    teks: '11 · Ujinya bisa Anda jalankan sendiri', sub: 'kaca-id.web.app/tests/' }));
  r.push(kartu({
    nama: 't12', durasi: 5.0, besar: 74,
    judul: 'Matikan lampu ruangan',
    sub: 'layar mendatar memberi pantulan paling baik',
    kaki: 'nyalakan Cermin bila citranya terbaca terbalik'
  }));
  return gabung(r, path.join(AKAR, 'kaca-tutorial.mp4'));
}

/* ==========================================================
   Jalan
   ========================================================== */
function periksaAlat() {
  for (const alat of ['ffmpeg', 'ffprobe']) {
    try { execFileSync(alat, ['-version'], { stdio: 'ignore' }); }
    catch (e) { console.error(alat + ' tidak ditemukan di PATH.'); process.exit(1); }
  }
}

function main() {
  periksaAlat();
  const mau = (process.argv[2] || '').toLowerCase();
  siapkanKerja();

  const kerja = [];
  if (!mau || mau === 'promo') kerja.push(['promo', promo]);
  if (!mau || mau === 'tutorial') kerja.push(['tutorial', tutorial]);
  if (!kerja.length) {
    console.error('Pilihan: promo | tutorial | (kosong = keduanya)');
    process.exit(1);
  }

  for (const [nama, fn] of kerja) {
    const t0 = Date.now();
    process.stdout.write('Menyusun ' + nama + '… ');
    const keluar = fn();
    const d = durasi(keluar);
    const mb = (fs.statSync(keluar).size / 1048576).toFixed(1);
    console.log(`selesai  ${d.toFixed(1)} s  ${mb} MB  ${((Date.now() - t0) / 1000).toFixed(0)} s render`);
    console.log('  → ' + path.relative(path.join(AKAR, '..'), keluar));
  }

  /* ruas sementara dibuang; berkas akhir yang tinggal */
  fs.rmSync(TMP, { recursive: true, force: true });
}

main();
