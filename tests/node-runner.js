#!/usr/bin/env node
/* ==========================================================
   KACA — penjalan uji parser DICOM tanpa peramban
   ----------------------------------------------------------
   Jalankan: node tests/node-runner.js

   Uji yang sama dengan tests/index.html, hanya saja dijalankan
   di Node. Yang perlu ditiru hanya ImageData; sisanya (DataView,
   Blob, Response, DecompressionStream) sudah ada di Node 18+.

   Keluar dengan kode 1 bila ada uji yang gagal, sehingga bisa
   dipakai langsung di pipeline.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- lingkungan tiruan ---------- */
class ImageDataTiruan {
  constructor(data, width, height) {
    if (typeof data === 'number') {           /* new ImageData(w, h) */
      this.width = data; this.height = width;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }
    this.data = data; this.width = width; this.height = height;
  }
}

const sandbox = {
  ImageData: ImageDataTiruan,
  DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array, Map, Promise,
  Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer,
  Blob: global.Blob,
  Response: global.Response,
  CompressionStream: global.CompressionStream,
  DecompressionStream: global.DecompressionStream,
  console, Math, JSON, Date, URL,
  TextDecoder, TextEncoder,
  setTimeout, clearTimeout
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const konteks = vm.createContext(sandbox);

function muat(rel) {
  const kode = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(kode, konteks, { filename: rel });
}

muat('assets/js/dicom.js');
muat('assets/js/volume.js');
muat('assets/js/mesh.js');
muat('assets/js/model.js');
muat('assets/js/kendali.js');
muat('tools/tulis-dicom.js');
muat('tests/uji-dicom.js');
muat('tests/uji-volume.js');
muat('tests/uji-mesh.js');
muat('tests/uji-model.js');
muat('tests/uji-kendali.js');

/* ---------- jalankan ---------- */
const daftar = (sandbox.UJI && sandbox.UJI.daftar) || [];
if (!daftar.length) {
  console.error('Tidak ada uji yang termuat.');
  process.exit(1);
}

const HIJAU = '\x1b[32m', MERAH = '\x1b[31m', KUNING = '\x1b[33m', ABU = '\x1b[90m', NOL = '\x1b[0m';

(async function () {
  let lulus = 0, gagal = 0, lewat = 0;

  for (const u of daftar) {
    try {
      const hasil = await u.fn();
      if (hasil && hasil.lewat) {
        lewat++;
        console.log(`${KUNING}lewat${NOL} ${u.nama}\n      ${ABU}${hasil.lewat}${NOL}`);
      } else {
        lulus++;
        console.log(`${HIJAU}lulus${NOL} ${u.nama}`);
      }
    } catch (err) {
      gagal++;
      console.log(`${MERAH}gagal${NOL} ${u.nama}\n      ${MERAH}${err && err.message}${NOL}`);
    }
  }

  console.log('');
  console.log(`${lulus} lulus, ${gagal} gagal${lewat ? ', ' + lewat + ' dilewati' : ''} ` +
              `dari ${daftar.length} uji`);
  process.exit(gagal ? 1 : 0);
})();
