#!/usr/bin/env node
/* ==========================================================
   KACA — uji asap skrip halaman, tanpa peramban
   ----------------------------------------------------------
   Jalankan: node tests/asap-halaman.js

   Memuat berkas HTML sungguhan ke dalam tiruan DOM (tests/dom-tiruan.js),
   menjalankan semua <script> lokal apa adanya, lalu menekan tombol dan
   memicu pintasan seperti pengguna. Yang dicari:

     - galat saat inisialisasi skrip halaman
     - getElementById yang mengembalikan null lalu meledak
     - pengendali klik/keydown yang melempar
     - alur volume 3D → MPR → permukaan → ekspor yang putus

   Yang TIDAK diperiksa: hasil gambar, tata letak, dan gaya. Untuk itu
   tetap perlu dilihat mata di peramban.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buatLingkungan, Peristiwa } = require('./dom-tiruan.js');

const ROOT = path.join(__dirname, '..');

const HIJAU = '\x1b[32m', MERAH = '\x1b[31m', KUNING = '\x1b[33m', ABU = '\x1b[90m', NOL = '\x1b[0m';
let lulus = 0, gagal = 0;

function periksa(nama, ok, catatan) {
  if (ok) { lulus++; console.log(`  ${HIJAU}ok${NOL}   ${nama}${catatan ? ABU + '  ' + catatan + NOL : ''}`); }
  else { gagal++; console.log(`  ${MERAH}GAGAL${NOL} ${nama}${catatan ? '  ' + MERAH + catatan + NOL : ''}`); }
}

/* ==========================================================
   Muat satu halaman + skripnya
   ========================================================== */
function muatHalaman(namaHtml, opsi) {
  opsi = opsi || {};
  const html = fs.readFileSync(path.join(ROOT, namaHtml), 'utf8');
  const lingk = buatLingkungan(html, Object.assign({ halaman: namaHtml }, opsi));
  const { win, dok } = lingk;

  vm.createContext(win);

  /* skrip diambil dari markup, jadi urutan muatnya sama dengan peramban.
     Modul ES (firebase-init.js) dilewati: tidak ada jaringan di sini, dan
     mode tamu memang dirancang untuk jalan tanpa Firebase. */
  const skrip = [];
  for (const s of dok.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (!src) continue;
    if (s.getAttribute('type') === 'module') { skrip.push({ src, dilewati: true }); continue; }
    skrip.push({ src, dilewati: false });
  }

  const galat = [];
  for (const s of skrip) {
    if (s.dilewati) continue;
    const berkas = path.join(ROOT, path.dirname(namaHtml), s.src);
    let kode;
    try { kode = fs.readFileSync(berkas, 'utf8'); }
    catch (e) { galat.push(`${s.src}: berkas tidak ada`); continue; }
    try {
      vm.runInContext(kode, win, { filename: s.src });
    } catch (e) {
      galat.push(`${s.src}: ${e.message}`);
    }
  }

  return { lingk, win, dok, skrip, galat };
}

/* jalankan tugas asinkron yang tertunda (Promise + setTimeout + rAF) */
function tunggu(win, putaran) {
  return new Promise((res) => {
    let n = 0;
    (function langkah() {
      win._jalankanFrame(2);
      if (++n >= (putaran || 12)) return res();
      setTimeout(langkah, 12);
    })();
  });
}

function tekanTombol(dok, id) {
  const el = dok.getElementById(id);
  if (!el) throw new Error(`tombol #${id} tidak ada`);
  if (el.disabled) throw new Error(`tombol #${id} sedang nonaktif`);
  el.click();
  return el;
}

function tekanKunci(dok, key) {
  dok.dispatchEvent(new Peristiwa('keydown', {
    key, target: dok.body, tagName: 'BODY'
  }));
}

/* ==========================================================
   1. Worklist
   ========================================================== */
async function ujiWorklist() {
  console.log('\nworklist.html');
  const { win, dok, skrip, galat } = muatHalaman('worklist.html', {
    localStorage: { 'kaca.sesi.tamu': 'true' }
  });

  periksa('semua skrip dimuat tanpa galat', galat.length === 0, galat.join(' | '));
  periksa('skrip halaman terdaftar di markup', skrip.length >= 6, `${skrip.length} <script>`);
  /* worklist sengaja TIDAK memuat volume.js & mesh.js — tidak dipakai di sini */
  periksa('global yang dibutuhkan worklist tersedia',
    !!(win.KACA && win.DICOM && win.DEMO && win.KDB && win.KAUTH),
    Object.keys({ KACA: 1, DICOM: 1, DEMO: 1, KDB: 1, KAUTH: 1 })
      .filter((k) => !win[k]).join(', ') || 'semua ada');
  periksa('worklist tidak memuat modul 3D yang tak dipakainya',
    !win.VOLUME && !win.MESH);
  periksa('KACA_BANTUAN terdefinisi', typeof win.KACA_BANTUAN === 'function');

  await tunggu(win);

  const baris = dok.querySelectorAll('#rows tr');
  periksa('tabel worklist terisi dari data demo', baris.length >= 5, `${baris.length} baris`);

  const jumlahSemua = dok.getElementById('c-all');
  periksa('penghitung "semua studi" terisi',
    jumlahSemua && +jumlahSemua.textContent >= 5, jumlahSemua && jumlahSemua.textContent);

  /* filter */
  const filterBelum = dok.querySelector('.wl-side .side-item[data-filter="unread"]');
  filterBelum.click();
  periksa('filter "belum dibaca" bisa diklik tanpa galat',
    filterBelum.classList.contains('active'));

  dok.querySelector('.wl-side .side-item[data-filter="all"]').click();

  /* pilih baris lalu urutkan kolom */
  const tr = dok.querySelectorAll('#rows tr')[0];
  tr.dispatchEvent(new Peristiwa('click', { target: tr }));
  periksa('tombol hologram & viewer 2D aktif setelah baris dipilih',
    !dok.getElementById('btnOpen').disabled && !dok.getElementById('btnOpen2D').disabled);
  periksa('tombol utama mengarah ke hologram',
    /hologram/i.test(dok.getElementById('btnOpen').textContent),
    dok.getElementById('btnOpen').textContent);

  const th = dok.querySelector('table.wl thead th[data-sort="patient"]');
  th.click(); th.click();
  periksa('pengurutan kolom pasien tidak melempar',
    dok.querySelectorAll('#rows tr').length === baris.length);

  const panah = dok.querySelectorAll('table.wl thead th .arw');
  periksa('penanda arah urut hanya satu', panah.length === 1, `${panah.length} penanda`);

  /* dialog pintasan */
  win.KACA_BANTUAN();
  const dialog = dok.querySelector('.modal-back');
  periksa('dialog pintasan terbuka', !!dialog);
  if (dialog) {
    const kbd = dialog.querySelectorAll('kbd');
    periksa('dialog memuat daftar tombol', kbd.length >= 6, `${kbd.length} <kbd>`);
    dialog.querySelector('[data-tutup]').click();
    periksa('dialog tertutup lagi', !dok.querySelector('.modal-back'));
  }

  /* cache lokal: tanpa IndexedDB harus melapor rapi, bukan meledak */
  const info = dok.getElementById('cacheInfo');
  periksa('info cache terisi walau IndexedDB tidak ada',
    info && info.textContent.length > 0, info && info.textContent);
}

/* ==========================================================
   2. Viewer — termasuk volume 3D dan rekonstruksi permukaan
   ========================================================== */
async function ujiViewer() {
  console.log('\nviewer.html');
  const { win, dok, galat } = muatHalaman('viewer.html', {
    localStorage: { 'kaca.sesi.tamu': 'true' },
    search: '?demo=ST-2409-0146'
  });

  periksa('semua skrip dimuat tanpa galat', galat.length === 0, galat.join(' | '));
  periksa('global 3D tersedia di viewer',
    !!(win.VOLUME && win.MESH),
    ['VOLUME', 'MESH'].filter((k) => !win[k]).join(', ') || 'VOLUME + MESH ada');
  await tunggu(win, 20);

  const judul = dok.getElementById('hPatient');
  periksa('studi demo termuat', judul && judul.textContent.length > 1, judul && judul.textContent);

  const seri = dok.querySelectorAll('#seriesList .series-item');
  periksa('panel seri terisi', seri.length >= 1, `${seri.length} seri`);

  /* alat */
  for (const alat of ['length', 'angle', 'rect', 'ellipse', 'probe', 'pan', 'zoom', 'stack', 'wwwc']) {
    const b = dok.querySelector(`#toolrail [data-tool="${alat}"]`);
    if (b) b.click();
  }
  periksa('semua alat bisa dipilih tanpa galat',
    dok.querySelector('#toolrail [data-tool="wwwc"]').classList.contains('on'));

  /* tombol tampilan */
  let tampilanGalat = null;
  for (const id of ['btnInvert', 'btnRotate', 'btnFlipH', 'btnFlipV', 'btnFit', 'btnReset', 'btnHideOvl']) {
    try { tekanTombol(dok, id); } catch (e) { tampilanGalat = `${id}: ${e.message}`; break; }
  }
  periksa('tombol tampilan (termasuk cermin vertikal) bekerja', !tampilanGalat, tampilanGalat);

  /* tata letak */
  let letakGalat = null;
  for (const l of ['1x2', '2x2', '1x3', '1x1']) {
    try { dok.querySelector(`.app-bar [data-layout="${l}"]`).click(); win._jalankanFrame(2); }
    catch (e) { letakGalat = `${l}: ${e.message}`; break; }
  }
  periksa('semua tata letak bisa dipasang', !letakGalat, letakGalat);
  await tunggu(win, 6);

  /* tab panel kanan */
  let tabGalat = null;
  for (const t of ['info', 'wl', 'meas', 'tags', 'rep']) {
    try { dok.querySelector(`.tabbar button[data-tab="${t}"]`).click(); }
    catch (e) { tabGalat = `${t}: ${e.message}`; break; }
  }
  periksa('semua tab panel kanan bisa dibuka', !tabGalat, tabGalat);

  /* pintasan papan ketik */
  let kunciGalat = null;
  for (const k of ['w', 'p', 'z', 's', 'l', 'a', 'r', 'e', 'd', 'i', 'v', 'f', 'h', '0', '1', '2', '3', '4']) {
    try { tekanKunci(dok, k); } catch (e) { kunciGalat = `${k}: ${e.message}`; break; }
  }
  periksa('semua pintasan papan ketik tidak melempar', !kunciGalat, kunciGalat);
  await tunggu(win, 6);

  /* ---------- volume 3D ---------- */
  let volGalat = null;
  try { tekanTombol(dok, 'btnBangun3D'); } catch (e) { volGalat = e.message; }
  periksa('tombol "Bangun 3D & MPR" bisa ditekan', !volGalat, volGalat);

  await tunggu(win, 60);

  const volInfo = dok.getElementById('volInfo');
  periksa('info volume terisi',
    volInfo && /voxel/.test(volInfo.textContent), volInfo && volInfo.textContent);

  const seriSetelah = dok.querySelectorAll('#seriesList .series-item');
  periksa('seri turunan ditambahkan ke panel seri',
    seriSetelah.length >= seri.length + 7, `${seri.length} → ${seriSetelah.length} seri`);

  const turunan = dok.querySelectorAll('#seriesList .series-item.derived');
  periksa('seri turunan ditandai khusus', turunan.length >= 7, `${turunan.length} turunan`);

  periksa('tombol prisma jadi aktif', !dok.getElementById('btnPrisma').disabled);
  periksa('panel permukaan muncul', !dok.getElementById('surfBox').classList.contains('hide'));

  const ambang = dok.getElementById('inAmbang');
  periksa('ambang bawaan terisi', ambang && +ambang.value === 300, ambang && ambang.value);

  /* buka salah satu seri MPR */
  let mprGalat = null;
  try {
    const mpr = dok.querySelectorAll('#seriesList .series-item.derived')[0];
    mpr.click();
    await tunggu(win, 20);
  } catch (e) { mprGalat = e.message; }
  periksa('seri MPR bisa dibuka di viewport', !mprGalat, mprGalat);

  /* ---------- rekonstruksi permukaan ---------- */
  let permGalat = null;
  try { tekanTombol(dok, 'btnPermukaan'); } catch (e) { permGalat = e.message; }
  periksa('tombol "Rekonstruksi permukaan" bisa ditekan', !permGalat, permGalat);

  await tunggu(win, 60);

  const meshInfo = dok.getElementById('meshInfo');
  periksa('info permukaan terisi',
    meshInfo && /segitiga/.test(meshInfo.textContent), meshInfo && meshInfo.textContent);

  periksa('tombol ekspor STL & OBJ jadi aktif',
    !dok.getElementById('btnStl').disabled && !dok.getElementById('btnObj').disabled);

  /* ekspor benar-benar dijalankan */
  let eksporGalat = null;
  try { tekanTombol(dok, 'btnStl'); tekanTombol(dok, 'btnObj'); }
  catch (e) { eksporGalat = e.message; }
  periksa('ekspor STL & OBJ berjalan tanpa galat', !eksporGalat, eksporGalat);

  /* laporan */
  dok.getElementById('repFindings').value = 'Tidak tampak kelainan.';
  dok.getElementById('repStatus').value = 'Final';
  let repGalat = null;
  try { tekanTombol(dok, 'btnSaveRep'); } catch (e) { repGalat = e.message; }
  periksa('menyimpan laporan tidak melempar', !repGalat, repGalat);

  const status = JSON.parse(win.localStorage.getItem('kaca.wl.status') || '{}');
  periksa('status "Final" menandai studi Selesai di antrian',
    Object.values(status).includes('Selesai'), JSON.stringify(status));

  /* pengukuran tersimpan? tekan hapus lalu pastikan tidak melempar */
  let ukurGalat = null;
  try { tekanTombol(dok, 'btnMeasClear'); } catch (e) { ukurGalat = e.message; }
  periksa('menghapus pengukuran tidak melempar', !ukurGalat, ukurGalat);
}

/* ----------------------------------------------------------
   Atlas anatomi di panggung prisma
   ----------------------------------------------------------
   Berkas dipalsukan pada tingkat `input.files`, bukan lewat DOM
   sungguhan: yang perlu diuji adalah rantai muatModel → MODEL.muat
   → Adegan → daftar organ → prarender, dan rantai itu hanya butuh
   objek dengan .name dan .text().
   ---------------------------------------------------------- */
async function ujiAtlas(win, dok) {
  periksa('MODEL tersedia di prisma', !!win.MODEL);

  /* dua kubus sebagai dua organ dalam satu OBJ */
  const kubus = (cx, nama, geser) => {
    const h = 8, t = [
      [cx - h, -h, -h], [cx + h, -h, -h], [cx + h, h, -h], [cx - h, h, -h],
      [cx - h, -h, h], [cx + h, -h, h], [cx + h, h, h], [cx - h, h, h]
    ];
    const sisi = [[5, 6, 7, 8], [1, 4, 3, 2], [1, 2, 6, 5], [4, 8, 7, 3], [1, 5, 8, 4], [2, 3, 7, 6]];
    const b = [`o ${nama}`];
    t.forEach((p) => b.push(`v ${p[0]} ${p[1]} ${p[2]}`));
    sisi.forEach((q) => {
      b.push(`f ${q[0] + geser} ${q[1] + geser} ${q[2] + geser}`);
      b.push(`f ${q[0] + geser} ${q[2] + geser} ${q[3] + geser}`);
    });
    return b.join('\n');
  };
  const objTeks = kubus(-20, 'jantung', 0) + '\n' + kubus(20, 'hati', 8) + '\n';

  const masukan = dok.getElementById('modelInput');
  masukan.files = [{ name: 'organ.obj', text: () => Promise.resolve(objTeks) }];
  masukan.dispatchEvent(new win.Event('change'));
  await tunggu(win, 600);

  const info = dok.getElementById('atlasInfo');
  periksa('atlas termuat dari OBJ',
    info && /2 bagian/.test(info.textContent), info && info.textContent);

  periksa('mode berpindah ke atlas',
    dok.querySelector('#modeGrid button[data-mode="atlas"]').classList.contains('on'));

  periksa('panel kendali atlas terbuka',
    !dok.getElementById('atlasKendali').classList.contains('hide'));

  const daftar = dok.querySelectorAll('#daftarOrgan [data-organ]');
  periksa('daftar organ terisi', daftar.length === 2, `${daftar.length} entri`);
  periksa('nama organ terbaca dari kelompok OBJ',
    /jantung/.test(dok.getElementById('daftarOrgan').innerHTML));

  const render = dok.getElementById('renderInfo');
  periksa('atlas ikut diprarender',
    render && /sudut/.test(render.textContent), render && render.textContent);

  /* memilih organ → tersorot, dan yang lain dipudarkan */
  dok.querySelector('#daftarOrgan [data-organ="1"]').click();
  await tunggu(win, 600);
  periksa('organ terpilih ditandai',
    dok.querySelector('#daftarOrgan [data-organ="1"]').getAttribute('aria-pressed') === 'true');

  /* mata → sembunyikan */
  dok.querySelector('#daftarOrgan [data-mata="0"]').click();
  await tunggu(win, 600);
  periksa('organ bisa disembunyikan dari daftar',
    dok.querySelector('#daftarOrgan [data-organ="0"]').classList.contains('mati'));

  dok.getElementById('btnAtlasSemua').click();
  await tunggu(win, 600);
  periksa('tampilkan semua mengembalikan organ',
    !dok.querySelector('#daftarOrgan [data-organ="0"]').classList.contains('mati'));

  /* pisahkan lalu atur ulang */
  const sLedak = dok.getElementById('rLedak');
  sLedak.value = '0.6';
  sLedak.dispatchEvent(new win.Event('input'));
  dok.getElementById('btnRender').click();
  await tunggu(win, 600);
  periksa('penggeser pisahkan tidak melempar',
    dok.getElementById('rLedakVal').textContent === '60%',
    dok.getElementById('rLedakVal').textContent);

  dok.getElementById('btnAtlasUlang').click();
  await tunggu(win, 600);
  periksa('atur ulang atlas mengembalikan penggeser',
    dok.getElementById('rLedakVal').textContent === '0%');
}

/* ==========================================================
   3. Prisma
   ========================================================== */
async function ujiPrisma() {
  console.log('\nprisma.html');
  const { win, dok, galat } = muatHalaman('prisma.html', {
    localStorage: { 'kaca.sesi.tamu': 'true' },
    search: '?demo=ST-2409-0146'
  });

  periksa('semua skrip dimuat tanpa galat', galat.length === 0, galat.join(' | '));
  periksa('global 3D tersedia di prisma',
    !!(win.VOLUME && win.MESH),
    ['VOLUME', 'MESH'].filter((k) => !win[k]).join(', ') || 'VOLUME + MESH ada');

  /* prarender memakan waktu: 24 sudut ray-cast */
  await tunggu(win, 140);

  /* halaman prisma harus berdiri sendiri: punya pemilih studi & seri */
  const selStudi = dok.getElementById('pilihStudi');
  const selSeri = dok.getElementById('pilihSeri');
  periksa('pemilih studi terisi',
    selStudi && selStudi.querySelectorAll('option').length >= 5,
    selStudi && `${selStudi.querySelectorAll('option').length} pilihan`);
  periksa('pemilih seri terisi',
    selSeri && selSeri.querySelectorAll('option').length >= 1,
    selSeri && `${selSeri.querySelectorAll('option').length} pilihan`);
  periksa('studi dari parameter URL yang dipakai',
    selStudi && selStudi.value === 'demo:ST-2409-0146', selStudi && selStudi.value);
  periksa('asal data dijelaskan ke pengguna',
    dok.getElementById('studiInfo').textContent.length > 10);

  const info = dok.getElementById('volInfo');
  periksa('volume tersusun di halaman prisma',
    info && /voxel/.test(info.textContent), info && info.textContent);

  const render = dok.getElementById('renderInfo');
  periksa('prarender sudut selesai',
    render && /sudut/.test(render.textContent), render && render.textContent);

  const status = dok.getElementById('status');
  periksa('lapisan status disembunyikan setelah selesai',
    status && status.classList.contains('hide'));

  const kanvas = dok.getElementById('prismaCanvas');
  const ctx = kanvas && kanvas.getContext('2d');
  periksa('kanvas prisma benar-benar digambar',
    ctx && ctx._catatan.perNama.drawImage >= 4,
    ctx && `drawImage ×${ctx._catatan.perNama.drawImage || 0}`);

  /* empat sisi harus digambar setiap bingkai */
  const sebelum = ctx._catatan.perNama.drawImage || 0;
  win._jalankanFrame(1);
  const sesudah = ctx._catatan.perNama.drawImage || 0;
  periksa('setiap bingkai menggambar empat sisi',
    sesudah - sebelum === 4, `+${sesudah - sebelum} gambar`);

  /* kontrol */
  let modeGalat = null;
  for (const m of ['rerata', 'komposit', 'permukaan', 'atlas', 'maks']) {
    try { dok.querySelector(`#modeGrid button[data-mode="${m}"]`).click(); }
    catch (e) { modeGalat = `${m}: ${e.message}`; break; }
  }
  periksa('semua mode proyeksi bisa dipilih', !modeGalat, modeGalat);

  periksa('tombol render ulang ditandai perlu',
    dok.getElementById('btnRender').classList.contains('perlu'));

  let cmapGalat = null;
  for (const c of ['hot', 'bone', 'jet', 'pet', '']) {
    try { dok.querySelector(`#cmapGrid button[data-cmap="${c}"]`).click(); }
    catch (e) { cmapGalat = `${c || 'abu'}: ${e.message}`; break; }
  }
  periksa('semua peta warna bisa dipilih', !cmapGalat, cmapGalat);

  /* sakelar & penggeser */
  let setelGalat = null;
  try {
    for (const id of ['swCermin', 'swInvert', 'swPusat', 'swArah']) {
      const el = dok.getElementById(id);
      el.checked = true;
      el.dispatchEvent(new Peristiwa('change', { target: el }));
    }
    for (const id of ['rSkala', 'rJarak', 'rKecepatan', 'rElev', 'rSudut', 'rUkuran', 'rMutu', 'rAmbang']) {
      const el = dok.getElementById(id);
      el.value = el.getAttribute('min') || '1';
      el.dispatchEvent(new Peristiwa('input', { target: el }));
    }
  } catch (e) { setelGalat = e.message; }
  periksa('semua sakelar & penggeser bekerja', !setelGalat, setelGalat);

  /* pintasan */
  let kunciGalat = null;
  try {
    for (const k of [' ', 'ArrowLeft', 'ArrowRight', 'f', 'p']) tekanKunci(dok, k);
  } catch (e) { kunciGalat = e.message; }
  periksa('pintasan panggung tidak melempar', !kunciGalat, kunciGalat);

  /* Kendali tanpa sentuh: di Node tidak ada kamera maupun mikrofon,
     jadi ini menguji jalur kegagalannya — harus melapor rapi, mematikan
     sakelarnya sendiri, dan tidak melempar. */
  let kendaliGalat = null;
  try {
    for (const id of ['swGestur', 'swSuara']) {
      const s = dok.getElementById(id);
      s.checked = true;
      s.dispatchEvent(new Peristiwa('change', { target: s }));
    }
  } catch (e) { kendaliGalat = e.message; }
  periksa('menyalakan gestur & suara tanpa perangkat tidak melempar', !kendaliGalat, kendaliGalat);
  periksa('sakelar dimatikan sendiri saat perangkat tidak ada',
    !dok.getElementById('swGestur').checked && !dok.getElementById('swSuara').checked);
  periksa('alasannya dijelaskan ke pengguna',
    /tidak menyediakan|gagal/i.test(dok.getElementById('kendaliStatus').textContent),
    dok.getElementById('kendaliStatus').textContent);

  let matiGalat = null;
  try {
    for (const id of ['swGestur', 'swSuara', 'swGesturSkala', 'swGerakSaja']) {
      const s = dok.getElementById(id);
      s.checked = false;
      s.dispatchEvent(new Peristiwa('change', { target: s }));
    }
    const h = dok.getElementById('rHalus');
    h.value = '0.5';
    h.dispatchEvent(new Peristiwa('input', { target: h }));
  } catch (e) { matiGalat = e.message; }
  periksa('mematikan kendali & menggeser kehalusan tidak melempar', !matiGalat, matiGalat);

  /* berpindah studi lewat pemilih harus menyusun ulang volume */
  const kunciLain = Array.from(selStudi.querySelectorAll('option'))
    .map((o) => o.getAttribute('value'))
    .filter((v) => v !== 'demo:ST-2409-0146')[0];
  let pindahGalat = null;
  try {
    selStudi.value = kunciLain;
    selStudi.dispatchEvent(new Peristiwa('change', { target: selStudi }));
    await tunggu(win, 140);
  } catch (e) { pindahGalat = e.message; }
  periksa('berpindah studi lewat pemilih menyusun ulang hologram',
    !pindahGalat && /voxel/.test(dok.getElementById('volInfo').textContent),
    pindahGalat || `${kunciLain} → ${dok.getElementById('hJudul').textContent}`);

  /* mode permukaan benar-benar dirender ulang */
  dok.querySelector('#modeGrid button[data-mode="permukaan"]').click();
  /* set ambang yang masuk akal sebelum render */
  const sAmb = dok.getElementById('rAmbang');
  if (sAmb) {
    sAmb.value = '300';
    sAmb.dispatchEvent(new Peristiwa('input', { target: sAmb }));
  }
  let ulangGalat = null;
  try { tekanTombol(dok, 'btnRender'); } catch (e) { ulangGalat = e.message; }
  await tunggu(win, 140);
  const mesh = dok.getElementById('meshInfo');
  periksa('mode permukaan menghasilkan isosurface', !ulangGalat &&
    mesh && /segitiga/.test(mesh.textContent), ulangGalat || (mesh && mesh.textContent));

  /* atlas dijalankan paling akhir: memuat model berpindah mode dan
     mengosongkan tanda "perlu render", jadi kalau ditaruh di tengah ia
     akan merusak pemeriksaan di atasnya */
  await ujiAtlas(win, dok);
}

/* ==========================================================
   4. Halaman masuk & landing
   ========================================================== */
async function ujiLain() {
  console.log('\nmasuk.html & index.html');

  const masuk = muatHalaman('masuk.html', {});
  periksa('masuk.html: skrip dimuat tanpa galat',
    masuk.galat.length === 0, masuk.galat.join(' | '));
  await tunggu(masuk.win, 6);

  /* tanpa Firebase, mencoba masuk harus memberi pesan, bukan meledak */
  let masukGalat = null;
  try {
    masuk.dok.getElementById('inEmail').value = 'uji@contoh.id';
    masuk.dok.getElementById('inSandi').value = 'rahasia123';
    masuk.dok.querySelector('form').dispatchEvent(
      new Peristiwa('submit', { target: masuk.dok.querySelector('form') }));
  } catch (e) { masukGalat = e.message; }
  periksa('kirim formulir tanpa Firebase melapor rapi', !masukGalat, masukGalat);

  let tamuGalat = null;
  try { masuk.dok.getElementById('btnTamu').click(); } catch (e) { tamuGalat = e.message; }
  periksa('tombol mode tamu bekerja', !tamuGalat, tamuGalat);

  const landing = muatHalaman('index.html', {});
  periksa('index.html: skrip dimuat tanpa galat',
    landing.galat.length === 0, landing.galat.join(' | '));
  await tunggu(landing.win, 6);
  periksa('landing menggambar kanvas hero',
    landing.dok.querySelectorAll('canvas').length >= 1);
}

/* ==========================================================
   Jalan
   ========================================================== */
(async function () {
  console.log('Uji asap skrip halaman — tanpa peramban, tanpa jaringan');
  const t0 = Date.now();
  try {
    await ujiWorklist();
    await ujiViewer();
    await ujiPrisma();
    await ujiLain();
  } catch (err) {
    gagal++;
    console.log(`\n${MERAH}GALAT TAK TERTANGANI${NOL} ${err && err.stack ? err.stack : err}`);
  }
  console.log('');
  console.log(`${lulus} lulus, ${gagal} gagal · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (gagal) console.log(`${KUNING}Catatan: uji ini tidak memeriksa hasil gambar, hanya bahwa kodenya jalan.${NOL}`);
  process.exit(gagal ? 1 : 0);
})();
