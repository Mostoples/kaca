#!/usr/bin/env node
/* ==========================================================
   KACA — unduh berkas DICOM contoh dari internet
   ----------------------------------------------------------
   Jalankan:
     node tools/unduh-contoh.js             # set inti (~1,8 MB)
     node tools/unduh-contoh.js --lengkap   # tambah berkas besar (~7 MB)
     node tools/unduh-contoh.js --daftar    # tampilkan daftar tanpa mengunduh

   Sumber: pydicom-data <https://github.com/pydicom/pydicom-data>
   Lisensi: MIT — Copyright (c) 2020 Dicom in Python.
   MIT mengizinkan penggunaan dan redistribusi asalkan pemberitahuan
   hak ciptanya disertakan; skrip ini menuliskannya ke SUMBER.md di
   folder tujuan.

   Meski begitu, berkas hasil unduhan TIDAK dilacak git (lihat
   .gitignore). Alasannya bukan lisensi, tetapi supaya repo ini tidak
   ikut menjadi tempat redistribusi biner milik proyek lain, dan supaya
   ukurannya tetap kecil. Semua bisa diambil ulang kapan saja.

   Berkas-berkas ini sengaja dipilih untuk MENEKAN parser dari dua sisi:
   yang seharusnya terbaca (deflate, palette, planar RGB, big endian,
   multi-frame, sequence rusak) dan yang seharusnya ditolak dengan
   pesan jelas (JPEG 2000, JPEG-LS, RLE, JPEG lossless).
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TUJUAN = path.join(ROOT, 'contoh-dicom', 'unduhan');
const DASAR = 'https://raw.githubusercontent.com/pydicom/pydicom-data/master/data_store/data/';

const SUMBER = {
  nama: 'pydicom-data',
  url: 'https://github.com/pydicom/pydicom-data',
  lisensi: 'MIT',
  hakCipta: 'Copyright (c) 2020 Dicom in Python'
};

/* harap: 'baca' = harus terurai & terender,
          'tolak' = harus ditandai perlu dekoder tambahan */
const BERKAS = [
  /* --- yang seharusnya terbaca --- */
  { n: 'liver.dcm', harap: 'baca', ket: 'CT hati, Explicit VR LE — acuan dasar' },
  { n: 'liver_expb.dcm', harap: 'baca', ket: 'sama, Explicit VR Big Endian' },
  { n: 'liver_deflate.dcm', harap: 'tolak',
    ket: 'Deflated Image Frame Compression (1.2.8.1) — BUKAN Deflated Explicit VR LE' },
  { n: 'liver_nonbyte_aligned.dcm', harap: 'baca', ket: 'BitsStored bukan kelipatan 8' },
  { n: 'OT-PAL-8-face.dcm', harap: 'baca', ket: 'PALETTE COLOR dengan LUT sungguhan' },
  { n: 'color-px.dcm', harap: 'baca', ket: 'RGB pixel-interleaved (PlanarConfiguration 0)' },
  { n: 'color-pl.dcm', harap: 'baca', ket: 'RGB planar (PlanarConfiguration 1)' },
  { n: 'emri_small.dcm', harap: 'baca', ket: 'MR multi-frame, 10 frame' },
  { n: 'emri_small_big_endian.dcm', harap: 'baca', ket: 'multi-frame Big Endian' },
  { n: 'SC_rgb.dcm', harap: 'baca', ket: 'Secondary Capture RGB 8 bit' },
  { n: 'SC_rgb_16bit.dcm', harap: 'baca', ket: 'Secondary Capture RGB 16 bit' },
  { n: 'explicit_VR-UN.dcm', harap: 'tolak', ket: 'elemen ber-VR UN, piksel JPEG 2000' },
  { n: 'bad_sequence.dcm', harap: 'tolak',
    ket: 'sequence rusak — harus tetap terurai; pikselnya JPEG Lossless' },
  { n: 'mlut_18.dcm', harap: 'baca', ket: 'Modality LUT (belum dipakai, harus tetap terbaca)' },
  { n: 'vlut_04.dcm', harap: 'baca', ket: 'VOI LUT Sequence (belum dipakai)' },

  /* --- yang seharusnya ditolak dengan pesan jelas --- */
  { n: 'liver_rle.dcm', harap: 'tolak', ket: 'RLE' },
  { n: 'liver_j2k.dcm', harap: 'tolak', ket: 'JPEG 2000' },
  { n: 'emri_small_jpeg_ls_lossless.dcm', harap: 'tolak', ket: 'JPEG-LS lossless' },
  { n: 'JPEG-LL.dcm', harap: 'tolak', ket: 'JPEG Lossless' },
  { n: 'JLSL_16_15_1_1F.dcm', harap: 'tolak', ket: 'JPEG-LS 16 bit' },

  /* --- besar, hanya dengan --lengkap --- */
  { n: 'color3d_jpeg_baseline.dcm', harap: 'baca', besar: true,
    ket: 'JPEG baseline multi-frame — didekode peramban lewat <img>' },
  { n: 'US1_UNCR.dcm', harap: 'baca', besar: true, ket: 'USG multi-frame tanpa kompresi' }
];

/* ==========================================================
   Unduh
   ========================================================== */
function unduh(url, tujuan, sisaAlih) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'kaca-unduh-contoh' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if ((sisaAlih || 0) >= 5) return rej(new Error('terlalu banyak pengalihan'));
        const berikut = new URL(r.headers.location, url).toString();
        if (!berikut.startsWith('https://')) return rej(new Error('pengalihan bukan HTTPS'));
        return unduh(berikut, tujuan, (sisaAlih || 0) + 1).then(res, rej);
      }
      if (r.statusCode !== 200) {
        r.resume();
        return rej(new Error('HTTP ' + r.statusCode));
      }
      const potongan = [];
      r.on('data', (d) => potongan.push(d));
      r.on('end', () => {
        const isi = Buffer.concat(potongan);
        fs.writeFileSync(tujuan, isi);
        res(isi.length);
      });
      r.on('error', rej);
    }).on('error', rej);
  });
}

/* ==========================================================
   Periksa hasil unduhan dengan parser sendiri
   ========================================================== */
function muatParser() {
  const s = {
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    console, Math, JSON, Promise, Map, Date, URL,
    DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
    Float32Array, Int32Array, Uint32Array, ArrayBuffer,
    Blob: global.Blob, Response: global.Response,
    DecompressionStream: global.DecompressionStream
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/dicom.js'), 'utf8'), s);
  return s.DICOM;
}

async function periksa(D, berkas) {
  const raw = fs.readFileSync(berkas);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const ds = await D.parseAsync(buf);
  if (!ds.has('00280010')) return { catatan: 'bukan citra (tanpa Rows)', status: 'lain' };

  const img = D.readPixels(ds);
  const mod = (ds.string('00080060') || '??').trim();
  const dim = `${img.cols}×${img.rows}` + (img.frames > 1 ? `×${img.frames}f` : '');

  if (img.unsupported) {
    return { status: 'tolak', catatan: `${mod} ${dim} — ${img.unsupported}` };
  }
  if (img.mime) {
    return { status: 'baca', catatan: `${mod} ${dim} — ${img.mime} (didekode peramban)` };
  }
  D.toImageData(img, { windowCenter: img.windowCenter, windowWidth: img.windowWidth });
  const rentang = img.pixels ? `nilai ${Math.round(img.min)}…${Math.round(img.max)}` : '';
  const tambahan = [
    img.palette ? 'PALETTE' : '',
    img.samplesPerPixel === 3 ? (img.planar === 1 ? 'RGB planar' : 'RGB') : '',
    ds.originalTransferSyntax ? 'deflate' : ''
  ].filter(Boolean).join(' ');
  return { status: 'baca', catatan: `${mod} ${dim} ${rentang} ${tambahan}`.trim() };
}

/* ==========================================================
   Jalan
   ========================================================== */
const arg = process.argv.slice(2);
const lengkap = arg.includes('--lengkap');
const hanyaDaftar = arg.includes('--daftar');
const daftar = BERKAS.filter((b) => lengkap || !b.besar);

if (hanyaDaftar) {
  console.log(`Sumber: ${SUMBER.nama} (${SUMBER.lisensi}) — ${SUMBER.url}\n`);
  for (const b of daftar) {
    console.log(`  ${b.harap === 'baca' ? '+' : '-'} ${b.n.padEnd(34)} ${b.ket}`);
  }
  console.log(`\n  ${daftar.length} berkas. + = harus terbaca, - = harus ditolak dengan pesan jelas.`);
  process.exit(0);
}

(async function () {
  fs.mkdirSync(TUJUAN, { recursive: true });
  console.log(`Sumber: ${SUMBER.nama} (${SUMBER.lisensi}) — ${SUMBER.url}`);
  console.log(`Tujuan: contoh-dicom/unduhan/  (dikecualikan dari git)\n`);

  const D = muatParser();
  let ok = 0, gagalUnduh = 0, salahDuga = 0, byte = 0;

  for (const b of daftar) {
    const tujuan = path.join(TUJUAN, b.n);
    let ukuran;
    try {
      if (fs.existsSync(tujuan)) {
        ukuran = fs.statSync(tujuan).size;
        process.stdout.write(`  ${b.n.padEnd(34)} (sudah ada) `);
      } else {
        ukuran = await unduh(DASAR + encodeURIComponent(b.n), tujuan);
        process.stdout.write(`  ${b.n.padEnd(34)} ${String(Math.round(ukuran / 1024)).padStart(5)} KB `);
      }
      byte += ukuran;
    } catch (err) {
      gagalUnduh++;
      console.log(`  ${b.n.padEnd(34)} GAGAL UNDUH: ${err.message}`);
      continue;
    }

    try {
      const hasil = await periksa(D, tujuan);
      const cocok = hasil.status === b.harap;
      if (cocok) ok++; else salahDuga++;
      console.log(`${cocok ? 'ok  ' : 'BEDA'} ${hasil.catatan}`);
      if (!cocok) console.log(`       diharapkan "${b.harap}", dapat "${hasil.status}"`);
    } catch (err) {
      salahDuga++;
      console.log(`GALAT ${err.message}`);
    }
  }

  /* pemberitahuan hak cipta wajib disertakan untuk lisensi MIT */
  fs.writeFileSync(path.join(TUJUAN, 'SUMBER.md'),
    `# Sumber berkas DICOM di folder ini\n\n` +
    `Berkas \`.dcm\` di folder ini **bukan** buatan proyek Kaca. Semuanya diunduh\n` +
    `oleh \`tools/unduh-contoh.js\` dari:\n\n` +
    `- **${SUMBER.nama}** — <${SUMBER.url}>\n` +
    `- Lisensi: **${SUMBER.lisensi}**\n` +
    `- ${SUMBER.hakCipta}\n\n` +
    `Lisensi MIT mengizinkan penggunaan, penyalinan, dan redistribusi asalkan\n` +
    `pemberitahuan hak cipta di atas disertakan. Berkas ini tidak dilacak git\n` +
    `dan tidak ikut ter-deploy; jalankan skripnya lagi untuk mendapatkannya.\n\n` +
    `## Daftar berkas\n\n` +
    `| Berkas | Dugaan | Keterangan |\n|---|---|---|\n` +
    daftar.map((b) => `| \`${b.n}\` | ${b.harap === 'baca' ? 'terbaca' : 'ditolak dengan pesan'} | ${b.ket} |`).join('\n') +
    `\n\n_Dibuat ulang otomatis setiap kali \`tools/unduh-contoh.js\` dijalankan._\n`);

  console.log('');
  console.log(`${ok} sesuai dugaan, ${salahDuga} tidak sesuai, ${gagalUnduh} gagal diunduh ` +
    `· ${(byte / 1048576).toFixed(1)} MB`);
  console.log('Atribusi ditulis ke contoh-dicom/unduhan/SUMBER.md');
  process.exit(gagalUnduh || salahDuga ? 1 : 0);
})();
