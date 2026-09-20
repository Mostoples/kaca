#!/usr/bin/env node
/* ==========================================================
   MEDIVOX — pembuat berkas DICOM contoh yang volumetrik
   ----------------------------------------------------------
   Jalankan:
     node tools/buat-contoh.js            # resolusi sedang, ditulis ke contoh-dicom/
     node tools/buat-contoh.js --besar    # resolusi tinggi, ke contoh-dicom/volume/
     node tools/buat-contoh.js --daftar   # hanya tampilkan apa yang akan dibuat

   Kenapa dibuat, bukan diunduh: berkas contoh yang sudah ada di repo
   ini semuanya phantom sintetis (ImageType DERIVED\SECONDARY\PHANTOM,
   pasien CONTOH^PASIEN) — tidak ada data pasien sungguhan, dan itu
   disengaja. Yang kurang dari berkas lama adalah JUMLAH IRISAN: 6–8
   irisan tidak cukup untuk MPR, MIP, apalagi rekonstruksi permukaan.
   Skrip ini membuat tumpukan 60+ irisan dengan geometri yang benar.

   Strukturnya dibentuk sebagai medan 3D, bukan gambar per irisan,
   jadi bentuknya benar-benar menyambung antar irisan — itulah syarat
   supaya isosurface dan MPR menghasilkan sesuatu yang masuk akal.

   Bukan data medis. Seluruh nilainya dikarang; nilai HU dipilih agar
   berada di rentang yang wajar supaya preset window klinis terlihat
   bedanya, bukan supaya akurat secara anatomis.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* penulis DICOM dimuat lewat vm karena ditulis sebagai IIFE peramban */
const sandbox = {
  DataView, Uint8Array, Uint16Array, Int16Array, Int8Array, ArrayBuffer,
  Math, JSON, console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'tulis-dicom.js'), 'utf8'), sandbox);
const T = sandbox.TULIS;

/* ==========================================================
   Primitif medan 3D. Semua koordinat dalam milimeter, titik asal
   di tengah volume.
   ========================================================== */
function acakan(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* jarak ternormalkan ke pusat elipsoid: <1 berarti di dalam */
function elips(x, y, z, cx, cy, cz, rx, ry, rz) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
  return dx * dx + dy * dy + dz * dz;
}

/* jarak titik ke segmen garis a→b, dipakai untuk tulang & pembuluh */
function keSegmen(x, y, z, ax, ay, az, bx, by, bz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const pjg = ux * ux + uy * uy + uz * uz;
  let t = pjg ? ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / pjg : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (ax + ux * t), dy = y - (ay + uy * t), dz = z - (az + uz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* ==========================================================
   Phantom: CT kepala
   ----------------------------------------------------------
   Kulit → tengkorak → cairan → otak → ventrikel, ditambah orbita,
   rongga sinus, dan foramen magnum. Isosurface pada 300 HU akan
   mengeluarkan kalvaria; MPR koronal memperlihatkan ventrikel.
   ========================================================== */
function ctKepala(x, y, z, rnd) {
  const HU_UDARA = -1000, HU_LEMAK = -90, HU_OTOT = 45,
        HU_TULANG = 950, HU_DIPLOE = 380, HU_CSF = 8,
        HU_ABU = 38, HU_PUTIH = 28;

  /* kepala memanjang antero-posterior, mengecil ke arah verteks */
  const kerucut = 1 - Math.max(0, z - 20) / 130;
  const rx = 74 * kerucut, ry = 92 * kerucut, rz = 96;

  const luar = elips(x, y, z, 0, 4, 8, rx, ry, rz);
  if (luar > 1) return HU_UDARA;

  /* kulit + lemak subkutan */
  if (luar > 0.93) return HU_LEMAK + rnd() * 22;
  if (luar > 0.88) return HU_OTOT + rnd() * 16;

  /* tengkorak: cangkang dengan diploe (spongiosa) di tengahnya */
  const dalamTengkorak = elips(x, y, z, 0, 4, 8, rx - 7.5, ry - 7.5, rz - 7.5);
  if (dalamTengkorak > 1) {
    const tengah = elips(x, y, z, 0, 4, 8, rx - 4, ry - 4, rz - 4);
    return (tengah > 1 ? HU_TULANG : HU_DIPLOE) + rnd() * 90;
  }

  /* dasar tengkorak: pelat tebal di bawah, plus foramen magnum */
  if (z < -62) {
    const fm = elips(x, y, z, 0, 26, -74, 17, 17, 12);
    if (fm > 1) return HU_TULANG * 0.92 + rnd() * 110;
  }

  /* orbita: dua rongga berisi udara + bola mata, di depan bawah */
  for (const sisi of [-1, 1]) {
    const orb = elips(x, y, z, sisi * 27, -66, -34, 17, 20, 16);
    if (orb < 1) {
      const bola = elips(x, y, z, sisi * 27, -70, -34, 11, 11, 11);
      return bola < 1 ? HU_CSF + 22 + rnd() * 10 : HU_LEMAK + rnd() * 20;
    }
  }
  /* sinus maksila & sfenoid */
  if (elips(x, y, z, 0, -50, -56, 22, 26, 15) < 1) return HU_UDARA + rnd() * 60;

  /* ruang subaraknoid */
  const otak = elips(x, y, z, 0, 4, 10, rx - 13, ry - 13, rz - 14);
  if (otak > 1) return HU_CSF + rnd() * 10;

  /* ventrikel lateral: sepasang bentuk mirip huruf C */
  for (const sisi of [-1, 1]) {
    const d = keSegmen(x, y, z, sisi * 11, -26, 16, sisi * 17, 26, 6);
    if (d < 8.5 - Math.abs(z - 12) * 0.05) return HU_CSF + rnd() * 8;
  }
  /* ventrikel ke-3 & ke-4 di garis tengah */
  if (Math.abs(x) < 3.5 && elips(x, y, z, 0, 2, -6, 6, 26, 22) < 1) return HU_CSF + rnd() * 8;

  /* substansi putih di dalam, abu-abu di tepi (korteks) */
  const putih = elips(x, y, z, 0, 4, 12, rx - 26, ry - 26, rz - 28);
  const dasar = putih < 1 ? HU_PUTIH : HU_ABU;

  /* girus: riak halus di kulit otak supaya MPR tidak terlihat rata */
  const riak = Math.sin(x * 0.42) * Math.sin(y * 0.38) * Math.sin(z * 0.33) * 5;
  return dasar + riak + rnd() * 5;
}

/* ==========================================================
   Phantom: CT toraks
   ----------------------------------------------------------
   Paru, mediastinum, jantung, aorta, trakea-bronkus, korpus
   vertebra, dan 10 pasang kosta yang melingkar. Kosta inilah yang
   membuat rekonstruksi permukaan terlihat jelas.
   ========================================================== */
function ctToraks(x, y, z, rnd) {
  const HU_UDARA = -1000, HU_PARU = -830, HU_LEMAK = -95,
        HU_OTOT = 48, HU_TULANG = 780, HU_SPONGIOSA = 210,
        HU_DARAH = 58, HU_KONTRAS = 300;

  const badan = elips(x, y, z, 0, 0, 0, 152, 108, 200);
  if (badan > 1) return HU_UDARA;
  if (badan > 0.95) return HU_LEMAK + rnd() * 26;
  if (badan > 0.88) return HU_OTOT + rnd() * 18;

  /* korpus vertebra + kanalis spinalis, di posterior garis tengah */
  const vert = keSegmen(x, y, z, 0, 72, -200, 0, 78, 200);
  if (vert < 19) {
    const kanal = keSegmen(x, y, z, 0, 86, -200, 0, 92, 200);
    if (kanal < 9) return HU_OTOT + rnd() * 14;
    /* diskus intervertebralis: sela lebih lunak setiap 26 mm */
    const sela = Math.abs(((z + 300) % 26) - 13);
    if (sela < 2.6) return HU_OTOT + 30 + rnd() * 30;
    return (vert < 13 ? HU_SPONGIOSA : HU_TULANG) + rnd() * 120;
  }
  /* prosesus spinosus */
  if (keSegmen(x, y, z, 0, 88, -200, 0, 104, 200) < 6.5) return HU_TULANG * 0.8 + rnd() * 90;

  /* kosta: sepuluh pasang busur, miring ke bawah ke arah anterior */
  for (let i = 0; i < 10; i++) {
    const zc = 150 - i * 30;
    for (const sisi of [-1, 1]) {
      /* busur digambar sebagai rangkaian segmen agar melengkung */
      let dekat = 1e9;
      for (let s = 0; s < 8; s++) {
        const a1 = (s / 8) * Math.PI * 0.92, a2 = ((s + 1) / 8) * Math.PI * 0.92;
        const p1 = [sisi * Math.cos(a1) * 132, 74 - Math.sin(a1) * 150, zc - a1 * 11];
        const p2 = [sisi * Math.cos(a2) * 132, 74 - Math.sin(a2) * 150, zc - a2 * 11];
        const d = keSegmen(x, y, z, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        if (d < dekat) dekat = d;
      }
      if (dekat < 6) return HU_TULANG + rnd() * 130;
    }
  }
  /* sternum */
  if (z > -40 && z < 170 && keSegmen(x, y, z, 0, -100, -40, 0, -96, 170) < 11) {
    return HU_TULANG * 0.85 + rnd() * 90;
  }

  /* mediastinum: jantung, aorta, trakea */
  if (elips(x, y, z, -18, -14, -76, 58, 52, 62) < 1) {
    /* ruang jantung diisi darah berkontras */
    const ruang = elips(x, y, z, -24, -24, -80, 34, 30, 40);
    return (ruang < 1 ? HU_KONTRAS : HU_DARAH) + rnd() * 22;
  }
  /* arkus & aorta desendens */
  const aorta = Math.min(
    keSegmen(x, y, z, 8, 10, 60, 8, 14, -200),
    keSegmen(x, y, z, 8, 10, 60, -14, -30, 74)
  );
  if (aorta < 15) return HU_KONTRAS + rnd() * 28;

  /* trakea lalu bercabang jadi dua bronkus utama */
  const trakea = keSegmen(x, y, z, 0, -6, 200, 0, -2, 40);
  const bronkusKa = keSegmen(x, y, z, 0, -2, 40, -34, 8, 6);
  const bronkusKi = keSegmen(x, y, z, 0, -2, 40, 32, 10, 12);
  if (trakea < 11 || bronkusKa < 8 || bronkusKi < 8) return HU_UDARA + 60 + rnd() * 80;

  /* paru dengan corakan bronkovaskular yang mengecil ke perifer */
  for (const sisi of [-1, 1]) {
    if (elips(x, y, z, sisi * 74, -6, 10, 62, 82, 168) < 1) {
      let hu = HU_PARU + rnd() * 55;
      /* pembuluh: percabangan sederhana dari hilus */
      const hilus = [sisi * 34, 8, 0];
      for (let c = 0; c < 6; c++) {
        const a = (c / 6) * Math.PI * 2;
        const ujung = [
          sisi * (34 + Math.cos(a) * 62), 8 + Math.sin(a) * 58, Math.sin(a * 1.7) * 120
        ];
        const d = keSegmen(x, y, z, hilus[0], hilus[1], hilus[2], ujung[0], ujung[1], ujung[2]);
        /* radius menyempit menjauh dari hilus */
        const jauh = keSegmen(x, y, z, hilus[0], hilus[1], hilus[2], hilus[0], hilus[1], hilus[2]);
        if (d < 5.5 - jauh * 0.018) hu = HU_DARAH + rnd() * 30;
      }
      return hu;
    }
  }

  return HU_OTOT + rnd() * 20;
}

/* ==========================================================
   Phantom: CT angiografi
   ----------------------------------------------------------
   Pohon pembuluh berkontras terang di latar jaringan lunak.
   Dibuat khusus untuk MIP dan rekonstruksi permukaan pembuluh.
   ========================================================== */
function ctAngio(x, y, z, rnd) {
  const HU_UDARA = -1000, HU_LUNAK = 42, HU_KONTRAS = 420, HU_TULANG = 800;

  const badan = elips(x, y, z, 0, 0, 0, 108, 92, 150);
  if (badan > 1) return HU_UDARA;

  /* vertebra sebagai penanda anatomis */
  if (keSegmen(x, y, z, 0, 62, -150, 0, 66, 150) < 16) return HU_TULANG + rnd() * 120;

  /* aorta di tengah, lalu bercabang berulang jadi pohon */
  const cabang = [];
  cabang.push({ a: [0, 6, 150], b: [0, 10, -20], r: 15 });
  cabang.push({ a: [0, 10, -20], b: [-38, 16, -92], r: 10 });
  cabang.push({ a: [0, 10, -20], b: [38, 16, -92], r: 10 });
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const zc = 120 - i * 34;
    const sisi = i % 2 ? 1 : -1;
    cabang.push({ a: [0, 8, zc], b: [sisi * (46 + t * 34), 14 + t * 26, zc - 20], r: 6.5 - t * 2 });
    cabang.push({
      a: [sisi * (46 + t * 34), 14 + t * 26, zc - 20],
      b: [sisi * (72 + t * 22), -16 - t * 18, zc - 44], r: 4 - t * 1.4
    });
  }
  for (const c of cabang) {
    if (c.r <= 0.6) continue;
    const d = keSegmen(x, y, z, c.a[0], c.a[1], c.a[2], c.b[0], c.b[1], c.b[2]);
    if (d < c.r) return HU_KONTRAS + rnd() * 55;
  }

  if (badan > 0.94) return -95 + rnd() * 25;
  return HU_LUNAK + rnd() * 18;
}

/* ==========================================================
   Phantom: MR otak (T1)
   ----------------------------------------------------------
   Nilainya BUKAN HU — MR tidak punya satuan tetap. Rentangnya
   dipilih 0–900 seperti sinyal sewenang-wenang pada MR sungguhan.
   ========================================================== */
function mrOtak(x, y, z, rnd) {
  const kerucut = 1 - Math.max(0, z - 20) / 140;
  const rx = 72 * kerucut, ry = 90 * kerucut, rz = 94;

  const luar = elips(x, y, z, 0, 4, 8, rx, ry, rz);
  if (luar > 1) return 4 + rnd() * 10;
  if (luar > 0.93) return 620 + rnd() * 90;          /* lemak subkutan terang di T1 */
  const dalamTengkorak = elips(x, y, z, 0, 4, 8, rx - 7, ry - 7, rz - 7);
  if (dalamTengkorak > 1) return 90 + rnd() * 60;    /* tulang gelap */

  const otak = elips(x, y, z, 0, 4, 10, rx - 12, ry - 12, rz - 13);
  if (otak > 1) return 120 + rnd() * 40;             /* CSF gelap di T1 */

  for (const sisi of [-1, 1]) {
    const d = keSegmen(x, y, z, sisi * 11, -26, 16, sisi * 17, 26, 6);
    if (d < 8.5 - Math.abs(z - 12) * 0.05) return 130 + rnd() * 35;
  }

  const putih = elips(x, y, z, 0, 4, 12, rx - 25, ry - 25, rz - 27);
  const dasar = putih < 1 ? 780 : 560;               /* putih > abu di T1 */
  const riak = Math.sin(x * 0.4) * Math.sin(y * 0.36) * Math.sin(z * 0.31) * 40;
  return dasar + riak + rnd() * 40;
}

/* ==========================================================
   Daftar seri yang dibuat
   ========================================================== */
const STUDI = [
  {
    nama: 'ct-kepala-3d',
    medan: ctKepala, modality: 'CT', bodyPart: 'HEAD',
    studyDesc: 'CT Kepala Volumetrik Phantom', seriesDesc: 'AX Helical 1.5mm',
    patient: 'CONTOH^KEPALA', patientId: 'DEMO-3D-01', sex: 'M', age: '048Y',
    wc: 40, ww: 90,
    sedang: { n: 64, mat: 192, mmXY: 1.15, mmZ: 2.4 },
    besar: { n: 160, mat: 320, mmXY: 0.70, mmZ: 1.0 }
  },
  {
    nama: 'ct-toraks-3d',
    medan: ctToraks, modality: 'CT', bodyPart: 'CHEST',
    studyDesc: 'CT Toraks Volumetrik Phantom', seriesDesc: 'AX Helical 2mm',
    patient: 'CONTOH^TORAKS', patientId: 'DEMO-3D-02', sex: 'F', age: '056Y',
    wc: -500, ww: 1500,
    sedang: { n: 64, mat: 192, mmXY: 1.75, mmZ: 5.0 },
    besar: { n: 180, mat: 320, mmXY: 1.05, mmZ: 1.8 }
  },
  {
    nama: 'ct-angio-3d',
    medan: ctAngio, modality: 'CT', bodyPart: 'ABDOMEN',
    studyDesc: 'CT Angiografi Volumetrik Phantom', seriesDesc: 'AX Arterial 1mm',
    patient: 'CONTOH^ANGIO', patientId: 'DEMO-3D-03', sex: 'M', age: '061Y',
    wc: 200, ww: 700,
    sedang: { n: 64, mat: 192, mmXY: 1.25, mmZ: 4.0 },
    besar: { n: 160, mat: 320, mmXY: 0.75, mmZ: 1.6 }
  },
  {
    nama: 'mr-otak-3d',
    medan: mrOtak, modality: 'MR', bodyPart: 'HEAD',
    studyDesc: 'MRI Kepala Volumetrik Phantom', seriesDesc: 'SAG T1 MPRAGE',
    patient: 'CONTOH^OTAK', patientId: 'DEMO-3D-04', sex: 'F', age: '034Y',
    wc: 420, ww: 820, huRange: false,
    sedang: { n: 64, mat: 192, mmXY: 1.15, mmZ: 2.4 },
    besar: { n: 160, mat: 320, mmXY: 0.72, mmZ: 1.0 }
  }
];

/* UID dibuat tetap (bukan acak) supaya menjalankan ulang skrip ini
   menghasilkan berkas yang identik — bisa diperiksa dengan git. */
const AKAR_UID = '1.2.826.0.1.3680043.8.498.9100';

function buatSeri(st, ukuran, tujuan) {
  const { n, mat, mmXY, mmZ } = ukuran;
  const rnd = acakan(0x9E3779B9 ^ (st.nama.length * 2654435761));

  fs.mkdirSync(tujuan, { recursive: true });

  const idx = STUDI.indexOf(st) + 1;
  const studyUID = `${AKAR_UID}.${idx}`;
  const seriesUID = `${AKAR_UID}.${idx}.1`;

  const setengahXY = (mat * mmXY) / 2;
  const setengahZ = (n * mmZ) / 2;

  let byteTotal = 0;
  const px = new Int16Array(mat * mat);

  for (let k = 0; k < n; k++) {
    /* z bertambah ke arah superior; irisan 0 paling inferior */
    const z = (k + 0.5) * mmZ - setengahZ;

    for (let j = 0; j < mat; j++) {
      /* y bertambah ke arah posterior (kesepakatan LPS DICOM) */
      const y = (j + 0.5) * mmXY - setengahXY;
      for (let i = 0; i < mat; i++) {
        const x = (i + 0.5) * mmXY - setengahXY;
        let v = st.medan(x, y, z, rnd);
        v = v < -32768 ? -32768 : v > 32767 ? 32767 : Math.round(v);
        px[j * mat + i] = v;
      }
    }

    const buf = T.citraGrayscale({
      ts: T.TS.EXPLICIT_LE,
      rows: mat, cols: mat, bits: 16, signed: true, pixels: px,
      spacing: [mmXY, mmXY],
      thickness: mmZ, spacingBetweenSlices: mmZ,
      slope: 1, intercept: 0, wc: st.wc, ww: st.ww,
      rescaleType: st.modality === 'CT' ? 'HU' : undefined,
      modality: st.modality, bodyPart: st.bodyPart,
      studyDesc: st.studyDesc, seriesDesc: st.seriesDesc,
      patient: st.patient, patientId: st.patientId, sex: st.sex, age: st.age,
      birth: '19700101', date: '20260901', time: '101500',
      accession: 'ACC91' + String(idx).padStart(2, '0'),
      institution: 'RS Contoh Medivox', manufacturer: 'Medivox Prototype',
      model: 'Phantom Generator 2.0',
      imageType: 'DERIVED\\SECONDARY\\PHANTOM\\VOLUMETRIC',
      studyUID, seriesUID, seriesNumber: 1,
      instance: k + 1,
      sopUID: `${seriesUID}.${k + 1}`,
      /* baris sepanjang +x (kiri pasien), kolom sepanjang +y (posterior):
         inilah orientasi aksial baku, dan volume.js memakainya untuk
         menghitung normal bidang lalu mengurutkan irisan */
      imageOrientation: [1, 0, 0, 0, 1, 0],
      imagePosition: [-setengahXY, -setengahXY, z],
      sliceLocation: z
    });

    const nama = `${st.nama}-${String(k + 1).padStart(3, '0')}.dcm`;
    fs.writeFileSync(path.join(tujuan, nama), Buffer.from(buf));
    byteTotal += buf.byteLength;

    if ((k + 1) % 16 === 0 || k === n - 1) {
      process.stdout.write(`\r  ${st.nama}: ${k + 1}/${n} irisan`);
    }
  }

  const mb = (byteTotal / 1048576).toFixed(1);
  process.stdout.write(`\r  ${st.nama}: ${n} irisan · ${mat}×${mat} · ` +
    `${mmXY.toFixed(2)}×${mmXY.toFixed(2)}×${mmZ.toFixed(1)} mm · ${mb} MB\n`);
  return byteTotal;
}

/* ==========================================================
   Jalan
   ========================================================== */
const arg = process.argv.slice(2);
const besar = arg.includes('--besar');
const hanyaDaftar = arg.includes('--daftar');
const kunci = besar ? 'besar' : 'sedang';
const tujuanDasar = path.join(ROOT, 'contoh-dicom', 'volume');

console.log(besar
  ? 'Membuat seri volumetrik resolusi TINGGI'
  : 'Membuat seri volumetrik resolusi sedang');
console.log('Tujuan: contoh-dicom/volume/  (dikecualikan dari git —');
console.log('        ukurannya puluhan MB dan bisa dibuat ulang kapan saja,');
console.log('        hasilnya identik karena UID dan acakannya tetap)');
console.log('');

if (hanyaDaftar) {
  let perkiraan = 0;
  for (const st of STUDI) {
    const u = st[kunci];
    const b = u.n * u.mat * u.mat * 2;
    perkiraan += b;
    console.log(`  ${st.nama.padEnd(16)} ${u.n} irisan · ${u.mat}×${u.mat} · ` +
      `${(b / 1048576).toFixed(1)} MB`);
  }
  console.log(`\n  total perkiraan ${(perkiraan / 1048576).toFixed(1)} MB`);
  process.exit(0);
}

const t0 = Date.now();
let total = 0;
for (const st of STUDI) {
  total += buatSeri(st, st[kunci], path.join(tujuanDasar, st.nama));
}

console.log('');
console.log(`Selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} s · ` +
  `${(total / 1048576).toFixed(1)} MB`);
console.log('');
console.log('Buka lewat tombol "Buka Folder" di worklist, lalu tekan');
console.log('"Bangun 3D & MPR" dan "Rekonstruksi permukaan" di viewer.');
