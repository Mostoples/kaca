#!/usr/bin/env node
/* ==========================================================
   KACA — periksa berkas contoh di contoh-dicom/
   ----------------------------------------------------------
   Jalankan: node tests/periksa-contoh.js

   Bukan uji unit: ini memastikan parser masih membuka 20 berkas
   .dcm sungguhan di repo, dan mencetak ringkasan tiap berkas
   (modalitas, matriks, bit, rentang nilai piksel). Berguna untuk
   menangkap regresi yang tidak terlihat pada berkas sintetis.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'contoh-dicom');

class ImageDataTiruan {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
}
const sandbox = { ImageData: ImageDataTiruan, console, Math, JSON, Promise, Map, DataView, URL };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/dicom.js'), 'utf8'), sandbox);
const D = sandbox.DICOM;

if (!fs.existsSync(DIR)) {
  console.error('Folder contoh-dicom/ tidak ditemukan.');
  process.exit(1);
}

const berkas = fs.readdirSync(DIR).filter((f) => /\.dcm$/i.test(f)).sort();
let ok = 0, gagal = 0;

for (const nama of berkas) {
  try {
    const raw = fs.readFileSync(path.join(DIR, nama));
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const ds = D.parse(buf);
    const img = D.readPixels(ds);

    if (!img.rows || !img.cols) throw new Error('dimensi kosong');
    if (!img.unsupported && !img.mime && !img.pixels) throw new Error('piksel tidak terbaca');

    /* render sekali untuk memastikan LUT tidak melempar */
    if (img.pixels) D.toImageData(img, { windowCenter: img.windowCenter, windowWidth: img.windowWidth });

    ok++;
    console.log(
      nama.padEnd(22) +
      (ds.string('00080060') || '??').padEnd(4) +
      `${img.cols}×${img.rows}`.padEnd(11) +
      `${img.bitsAllocated} bit${img.signed ? ' signed' : ''}`.padEnd(15) +
      (img.pixels ? `nilai ${Math.round(img.min)}…${Math.round(img.max)}` : `(${img.mime || img.unsupported})`) +
      (img.frames > 1 ? `  ${img.frames} frame` : '')
    );
  } catch (err) {
    gagal++;
    console.log(nama.padEnd(22) + 'GAGAL: ' + err.message);
  }
}

console.log('');
console.log(`${ok} berkas terbaca, ${gagal} gagal dari ${berkas.length}`);
process.exit(gagal ? 1 : 0);
