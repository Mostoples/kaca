#!/usr/bin/env node
/* ==========================================================
   KACA — periksa rekonstruksi 3D pada seri volumetrik nyata
   ----------------------------------------------------------
   Jalankan: node tests/periksa-mesh.js
   Perlu:    node tools/buat-contoh.js  (untuk mengisi contoh-dicom/volume/)

   Bukan uji unit. Ini membuka seri volumetrik yang benar-benar
   ditulis ke disk, menyusun volume, mengekstraksi isosurface, dan
   merendernya — lalu mencetak ukuran dan waktunya. Gunanya menangkap
   hal yang tidak terlihat pada bola sintetis: jumlah segitiga yang
   sebenarnya, biaya render, dan apakah ambang bawaan menghasilkan
   permukaan yang berisi.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'contoh-dicom', 'volume');

const sandbox = {
  ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
  console, Math, JSON, Promise, Map, Date, URL,
  DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
  Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['assets/js/dicom.js', 'assets/js/volume.js', 'assets/js/mesh.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const D = sandbox.DICOM, V = sandbox.VOLUME, M = sandbox.MESH;

if (!fs.existsSync(DIR)) {
  console.error('contoh-dicom/volume/ belum ada.');
  console.error('Jalankan dulu: node tools/buat-contoh.js');
  process.exit(1);
}

let gagal = 0;
function periksa(ok, pesan) {
  if (!ok) { gagal++; console.log('        GAGAL: ' + pesan); }
}
function ms(t) { return Math.round(t) + ' ms'; }

function seriDariFolder(dir) {
  const berkas = fs.readdirSync(dir).filter((f) => /\.dcm$/i.test(f)).sort()
    .map((f) => path.join(dir, f));
  return {
    desc: path.basename(dir), number: 1, modality: '', count: berkas.length,
    getImage(i) {
      try {
        const raw = fs.readFileSync(berkas[i]);
        const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        return Promise.resolve(D.readPixels(D.parse(buf)));
      } catch (e) { return Promise.reject(e); }
    }
  };
}

(async function () {
  const folder = fs.readdirSync(DIR)
    .filter((f) => fs.statSync(path.join(DIR, f)).isDirectory()).sort();

  for (const nama of folder) {
    const dir = path.join(DIR, nama);
    console.log(nama);

    const t0 = Date.now();
    let vol;
    try {
      vol = await V.bangun(seriDariFolder(dir));
    } catch (err) {
      gagal++;
      console.log('        GAGAL menyusun volume: ' + err.message + '\n');
      continue;
    }
    console.log(`        volume  ${vol.info()}  (${ms(Date.now() - t0)})`);

    /* geometri harus terbaca dari ImagePositionPatient, bukan ditebak */
    periksa(vol.spacing[2] > 0.5 && vol.spacing[2] < 12,
      `jarak antar irisan wajar: ${vol.spacing[2]}`);
    periksa(vol.nz >= 32, `jumlah irisan cukup untuk 3D: ${vol.nz}`);

    /* MPR koronal harus punya tinggi = jumlah irisan */
    const kor = vol.irisan('coronal', Math.floor(vol.ny / 2));
    periksa(kor.rows === vol.nz, `MPR koronal setinggi ${vol.nz} baris`);

    /* isosurface pada ambang bawaan */
    const ambang = M.ambangSaran(vol);
    const t1 = Date.now();
    const mesh = M.dari(vol, { ambang });
    const tMesh = Date.now() - t1;
    console.log(`        permukaan  ambang ${ambang}  ${mesh.info()}  (${ms(tMesh)})`);

    periksa(!mesh.kosong(), `ambang bawaan ${ambang} menghasilkan permukaan`);
    if (mesh.kosong()) { console.log(''); continue; }

    /* semua indeks segitiga harus sah */
    const nTitik = mesh.jumlahTitik();
    let indeksBuruk = 0;
    for (let i = 0; i < mesh.tri.length; i++) if (mesh.tri[i] >= nTitik) indeksBuruk++;
    periksa(indeksBuruk === 0, `${indeksBuruk} indeks segitiga di luar jangkauan`);

    /* titik harus berada di dalam kotak volume */
    const mm = vol.ukuranMM();
    let luarKotak = 0;
    for (let i = 0; i < mesh.vert.length; i += 3) {
      if (Math.abs(mesh.vert[i]) > mm[0] / 2 + 1 ||
          Math.abs(mesh.vert[i + 1]) > mm[1] / 2 + 1 ||
          Math.abs(mesh.vert[i + 2]) > mm[2] / 2 + 1) luarKotak++;
    }
    periksa(luarKotak === 0, `${luarKotak} titik di luar kotak volume`);

    /* normal semuanya vektor satuan */
    let normBuruk = 0;
    for (let i = 0; i < mesh.norm.length; i += 3) {
      const p = Math.hypot(mesh.norm[i], mesh.norm[i + 1], mesh.norm[i + 2]);
      if (Math.abs(p - 1) > 1e-2) normBuruk++;
    }
    periksa(normBuruk === 0, `${normBuruk} normal bukan vektor satuan`);

    /* render dari empat sisi seperti pada panggung prisma */
    let totalRender = 0, minIsi = Infinity;
    for (const derajat of [0, 90, 180, 270]) {
      const t2 = Date.now();
      const img = mesh.render({ azimut: derajat * Math.PI / 180, ukuran: 256 });
      totalRender += Date.now() - t2;
      let isi = 0;
      for (let i = 0; i < img.pixels.length; i += 3) if (img.pixels[i] > 8) isi++;
      if (isi < minIsi) minIsi = isi;
      D.toImageData(img, {});
    }
    console.log(`        render     4 sudut 256²  ${ms(totalRender)}  ` +
      `(≥${minIsi} piksel terisi)`);
    periksa(minIsi > 800, `setiap sudut menghasilkan citra berisi (minimum ${minIsi} piksel)`);

    /* ekspor */
    const stl = mesh.stl(nama);
    periksa(stl.byteLength === 84 + mesh.jumlahSegitiga() * 50, 'ukuran STL benar');
    console.log(`        STL        ${(stl.byteLength / 1048576).toFixed(1)} MB`);
    console.log('');
  }

  console.log(gagal ? `${gagal} pemeriksaan gagal` : 'Semua pemeriksaan rekonstruksi 3D lolos');
  process.exit(gagal ? 1 : 0);
})();
