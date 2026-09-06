#!/usr/bin/env node
/* ==========================================================
   KACA — tangkap tampilan setiap halaman untuk video
   ----------------------------------------------------------
   Jalankan: node video/tangkap.js [port]
   (perlu `node serve.js <port>` berjalan lebih dulu)

   Memakai **Microsoft Edge dalam mode headless**, bukan Chrome.
   Alasannya sederhana: pemilik proyek memakai Chrome untuk bekerja,
   dan Edge sudah ada di Windows sehingga tidak ada yang perlu
   dipasang. Prosesnya terpisah penuh dari peramban yang sedang
   dipakai — tidak ada tab, profil, atau sesi yang tersentuh.

   Yang ditangkap adalah HALAMAN SUNGGUHAN. Untuk keadaan yang perlu
   interaksi (volume 3D sudah dibangun, permukaan sudah direkonstruksi,
   panel disembunyikan), dipakai pembungkus di video/adegan/*.html yang
   menekan tombol asli di dalam iframe. Jadi tidak ada tampilan yang
   dikarang.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KELUAR = path.join(__dirname, 'tangkapan');
const PORT = process.argv[2] || '8123';
const DASAR = 'http://localhost:' + PORT;

const EDGE_KANDIDAT = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE = EDGE_KANDIDAT.filter((p) => fs.existsSync(p))[0];

const L = 1600, T = 1000;      /* 16:10 — dipotong ke 16:9 saat penyusunan */

/* nama, url, tunggu(ms). Tunggu panjang untuk halaman yang menghitung
   volume atau hologram; --virtual-time-budget mempercepat pewaktu, tetapi
   pekerjaan CPU tetap butuh waktu nyata. */
/* Halaman apps dijaga KAUTH.jaga(); tanpa sesi semuanya dialihkan ke
   masuk.html. Karena itu tujuannya dibungkus lewat tamu.html yang
   menyetel mode tamu lebih dulu — sama seperti pengguna menekan
   "Lanjut sebagai tamu". */
function tamu(ke) {
  return '/video/adegan/tamu.html?ke=' + encodeURIComponent(ke);
}

/* Halaman panjang ditangkap SEKALI dalam jendela tinggi, lalu bagiannya
   dipotong dan digeser oleh ffmpeg. Navigasi anchor (#bagian) di mode
   headless tidak bisa diandalkan — hasilnya sering kosong — dan satu
   tangkapan tinggi justru memberi gerakan pan vertikal yang bagus. */
const ADEGAN = [
  { n: '01-landing-hero',      u: '/index.html',                                w: 26000 },
  { n: '02-landing-penuh',     u: '/index.html',                                w: 30000, t: 7200 },
  { n: '03-masuk',             u: '/masuk.html',                                w: 10000 },
  { n: '04-studi',             u: tamu('/worklist.html'),                       w: 14000 },
  { n: '05-hologram-panel',    u: tamu('/prisma.html?demo=ST-2409-0143'),       w: 45000 },
  { n: '06-hologram-penuh',    u: tamu('/video/adegan/prisma-panggung.html'),   w: 50000 },
  { n: '07-hologram-permukaan',u: tamu('/video/adegan/prisma-permukaan.html'),  w: 85000 },
  { n: '08-viewer',            u: tamu('/viewer.html?demo=ST-2409-0143'),       w: 22000 },
  { n: '09-viewer-3d',         u: tamu('/video/adegan/viewer-3d.html'),         w: 95000 },
  { n: '10-uji',               u: '/tests/',                                    w: 30000 }
];

function tangkap(a) {
  const keluar = path.join(KELUAR, a.n + '.png');
  const tinggi = a.t || T;              /* a.t = jendela tinggi untuk halaman panjang */
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + L + ',' + tinggi,
    '--virtual-time-budget=' + a.w,
    '--screenshot=' + keluar,
    DASAR + a.u
  ];
  const t0 = Date.now();
  try {
    execFileSync(EDGE, args, { stdio: 'ignore', timeout: a.w + 90000 });
  } catch (e) { /* Edge kadang mengembalikan kode bukan-nol walau berhasil */ }

  if (!fs.existsSync(keluar)) return { ok: false, ms: Date.now() - t0 };
  const ukuran = fs.statSync(keluar).size;
  /* tangkapan yang hampir kosong biasanya berarti halaman gagal memuat */
  return { ok: ukuran > 12000, ms: Date.now() - t0, byte: ukuran };
}

/* ---------- jalan ---------- */
if (!EDGE) {
  console.error('Microsoft Edge tidak ditemukan. Dicari di:');
  EDGE_KANDIDAT.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

const http = require('http');
function serverHidup() {
  return new Promise((res) => {
    const r = http.get(DASAR + '/index.html', (x) => { x.resume(); res(x.statusCode === 200); });
    r.on('error', () => res(false));
    r.setTimeout(4000, () => { r.destroy(); res(false); });
  });
}

(async function () {
  if (!(await serverHidup())) {
    console.error(`Server tidak menjawab di ${DASAR}`);
    console.error('Jalankan dulu di terminal lain:  node serve.js ' + PORT);
    process.exit(1);
  }

  fs.mkdirSync(KELUAR, { recursive: true });
  console.log('Menangkap ' + ADEGAN.length + ' adegan lewat Edge headless');
  console.log('Ukuran jendela ' + L + '×' + T + ' (halaman panjang lebih tinggi)  ·  ' + DASAR);
  console.log('');

  let gagal = 0;
  for (const a of ADEGAN) {
    process.stdout.write('  ' + a.n.padEnd(22));
    const h = tangkap(a);
    if (h.ok) {
      console.log(`ok    ${String(Math.round(h.byte / 1024)).padStart(5)} KB   ${(h.ms / 1000).toFixed(1)} s`);
    } else {
      gagal++;
      console.log(`GAGAL ${h.byte ? Math.round(h.byte / 1024) + ' KB (terlalu kecil)' : 'tidak ada berkas'}`);
    }
  }

  console.log('');
  console.log(gagal ? `${gagal} adegan gagal` : 'Semua adegan tertangkap');
  console.log('Hasil di video/tangkapan/');
  process.exit(gagal ? 1 : 0);
})();
