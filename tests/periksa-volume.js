#!/usr/bin/env node
/* ==========================================================
   KACA — periksa volume 3D dari data sungguhan
   ----------------------------------------------------------
   Jalankan: node tests/periksa-volume.js

   Bukan uji unit. Ini membangun volume dari data yang benar-
   benar dipakai aplikasi — studi demo dan berkas .dcm di
   contoh-dicom/ — lalu merender MPR, MIP, dan proyeksi 3D.
   Gunanya menangkap masalah yang tidak muncul pada volume
   sintetis: urutan irisan, jarak irisan tidak seragam, dan
   waktu render yang sebenarnya.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

class ImageDataTiruan {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
}
const sandbox = {
  ImageData: ImageDataTiruan, console, Math, JSON, Promise, Map, Date, URL,
  DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function muat(rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}
muat('assets/js/dicom.js');
muat('assets/js/volume.js');
muat('assets/js/demo.js');

const D = sandbox.DICOM, V = sandbox.VOLUME, DEMO = sandbox.DEMO;

let gagal = 0;
function periksa(syarat, pesan) {
  if (!syarat) { gagal++; console.log('        GAGAL: ' + pesan); }
}

function ms(t) { return Math.round(t) + ' ms'; }

/* ---------- uji satu volume secara menyeluruh ---------- */
async function ujiVolume(nama, seri) {
  const t0 = Date.now();
  let vol;
  try {
    vol = await V.bangun(seri);
  } catch (err) {
    console.log(`  ${nama}\n        GAGAL: ${err.message}`);
    gagal++;
    return;
  }
  const tBangun = Date.now() - t0;

  console.log(`  ${nama}`);
  console.log(`        ${vol.info()}  (bangun ${ms(tBangun)})`);

  periksa(vol.nz >= 4, 'volume punya minimal 4 irisan');
  periksa(vol.spacing.every((s) => s > 0 && isFinite(s)), 'semua jarak voxel positif dan berhingga');
  periksa(vol.max > vol.min, `rentang nilai tidak kosong (${vol.min}…${vol.max})`);

  /* MPR ketiga bidang */
  for (const bidang of V.BIDANG) {
    const t = Date.now();
    const img = vol.irisan(bidang, Math.floor(vol.jumlah(bidang) / 2));
    const b = vol.bentuk(bidang);
    periksa(img.cols === b.cols && img.rows === b.rows, `dimensi MPR ${bidang}`);
    periksa(img.pixels.length === b.cols * b.rows, `panjang buffer MPR ${bidang}`);
    periksa(img.pixelSpacing[0] > 0 && img.pixelSpacing[1] > 0, `pixel spacing MPR ${bidang}`);
    D.toImageData(img, { windowCenter: vol.windowCenter, windowWidth: vol.windowWidth });
    console.log(`        MPR ${bidang.padEnd(9)} ${img.cols}×${img.rows}  ${ms(Date.now() - t)}`);
  }

  /* MIP slab 20 mm */
  for (const bidang of V.BIDANG) {
    const t = Date.now();
    const tebal = vol.potonganUntukMM(bidang, 20);
    const tengah = Math.floor(vol.jumlah(bidang) / 2);
    const img = vol.slab(bidang, tengah - (tebal >> 1), tengah - (tebal >> 1) + tebal - 1, 'maks');
    /* MIP tidak boleh lebih redup daripada potongan tunggal di tengahnya */
    const satu = vol.irisan(bidang, tengah);
    let lebihTerang = 0;
    for (let i = 0; i < img.pixels.length; i++) if (img.pixels[i] >= satu.pixels[i]) lebihTerang++;
    periksa(lebihTerang === img.pixels.length, `MIP ${bidang} tidak lebih redup dari irisan tunggal`);
    console.log(`        MIP ${bidang.padEnd(9)} ${tebal} potongan  ${ms(Date.now() - t)}`);
  }

  /* proyeksi tiga mode */
  for (const mode of ['maks', 'rerata', 'komposit']) {
    const t = Date.now();
    const img = vol.proyeksi({
      azimut: 0.6, elevasi: 0.15, mode, ukuran: 256, mutu: 1,
      windowCenter: vol.windowCenter, windowWidth: vol.windowWidth
    });
    let isi = 0;
    if (mode === 'komposit') {
      for (let i = 0; i < img.pixels.length; i += 3) if (img.pixels[i] > 8) isi++;
      periksa(img.samplesPerPixel === 3, 'proyeksi komposit berupa RGB');
    } else {
      for (let i = 0; i < img.pixels.length; i++) if (img.pixels[i] > vol.min) isi++;
    }
    periksa(isi > 200, `proyeksi ${mode} menghasilkan citra berisi (${isi} piksel)`);
    D.toImageData(img, { windowCenter: vol.windowCenter, windowWidth: vol.windowWidth });
    console.log(`        proyeksi ${mode.padEnd(9)} 256²  ${isi} px isi  ${ms(Date.now() - t)}`);
  }

  /* biaya satu putaran penuh seperti di halaman prisma */
  const tPutar = Date.now();
  const sudut = 24;
  for (let i = 0; i < sudut; i++) {
    vol.proyeksi({ azimut: i / sudut * Math.PI * 2, mode: 'maks', ukuran: 256, mutu: 1 });
  }
  console.log(`        prarender ${sudut} sudut 256²  ${ms(Date.now() - tPutar)}`);
  console.log('');
}

/* ---------- studi demo ---------- */
function seriDemo(st, idx) {
  const s = st.series[idx];
  let cache = null;
  return {
    desc: s.desc, number: s.num, modality: st.modality, count: s.n,
    getImage(i) {
      if (!cache) cache = DEMO.buildSeriesImages(st, idx);
      return Promise.resolve(cache[Math.max(0, Math.min(s.n - 1, i))]);
    }
  };
}

/* ---------- berkas nyata di contoh-dicom/ ---------- */
function seriBerkas(berkas) {
  const recs = berkas.map((f) => {
    const raw = fs.readFileSync(f);
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  });
  return {
    desc: path.basename(berkas[0]).replace(/-\d+\.dcm$/i, ''), number: 1, modality: '',
    count: recs.length,
    getImage(i) {
      try { return Promise.resolve(D.readPixels(D.parse(recs[i]))); }
      catch (e) { return Promise.reject(e); }
    }
  };
}

(async function () {
  console.log('Studi demo (phantom sintetis)');
  console.log('');
  for (const st of DEMO.studies) {
    /* ambil seri dengan irisan terbanyak */
    let idx = 0;
    st.series.forEach((s, i) => { if (s.n > st.series[idx].n) idx = i; });
    if (st.series[idx].n < 4) continue;
    await ujiVolume(`${st.id} — ${st.modality} ${st.desc} / ${st.series[idx].desc}`, seriDemo(st, idx));
  }

  const DIR = path.join(ROOT, 'contoh-dicom');
  if (fs.existsSync(DIR)) {
    console.log('Berkas nyata di contoh-dicom/');
    console.log('');
    const semua = fs.readdirSync(DIR).filter((f) => /\.dcm$/i.test(f)).sort();
    const grup = {};
    semua.forEach((f) => {
      const g = f.replace(/-\d+\.dcm$/i, '');
      (grup[g] = grup[g] || []).push(path.join(DIR, f));
    });
    for (const g of Object.keys(grup)) {
      if (grup[g].length < 4) {
        console.log(`  ${g} — dilewati, hanya ${grup[g].length} berkas\n`);
        continue;
      }
      await ujiVolume(`${g} (${grup[g].length} berkas)`, seriBerkas(grup[g]));
    }
  }

  console.log(gagal ? `${gagal} pemeriksaan gagal` : 'Semua pemeriksaan volume lolos');
  process.exit(gagal ? 1 : 0);
})();
