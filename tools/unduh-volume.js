#!/usr/bin/env node
/* ==========================================================
   MEDIVOX — unduh seri DICOM volumetrik dari TCIA
   ----------------------------------------------------------
   Jalankan:
     node tools/unduh-volume.js              # hanya seri phantom (~40 MB)
     node tools/unduh-volume.js --semua      # termasuk CT pasien nyata (~90 MB)
     node tools/unduh-volume.js --daftar     # lihat daftarnya tanpa mengunduh

   Sumber: The Cancer Imaging Archive (TCIA), <https://www.cancerimagingarchive.net>
   Diakses lewat REST API publik NBIA — tidak perlu akun.

   Kenapa TCIA: ini satu-satunya sumber besar yang sekaligus (a) berisi
   seri volumetrik sungguhan ratusan irisan, (b) sudah de-identifikasi
   oleh penerbitnya, dan (c) melampirkan lisensi yang jelas per koleksi.
   Lisensi TIDAK ditulis tangan di berkas ini — diambil dari API saat
   mengunduh lalu dicatat ke SUMBER.md, supaya tidak pernah salah.

   PERHATIAN soal isi datanya:
   - "phantom" = objek uji buatan, bukan manusia. Ini yang diunduh secara
     bawaan karena paling sejalan dengan proyek ini yang seluruh datanya
     memang bukan pasien.
   - "pasien" = citra manusia sungguhan, sudah de-identifikasi dan
     dipublikasikan resmi, tetapi tetap data medis orang lain. Hanya
     terunduh bila Anda menambahkan --semua.

   Hasil unduhan TIDAK dilacak git dan tidak ikut ter-deploy.
   Lisensi CC BY mewajibkan atribusi bila Anda menyebarkannya kembali;
   atribusinya sudah disiapkan di contoh-dicom/tcia/SUMBER.md.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TUJUAN = path.join(ROOT, 'contoh-dicom', 'tcia');
const API = 'https://services.cancerimagingarchive.net/nbia-api/services/v1/';

/* Seri dipilih dengan UID tetap supaya hasilnya bisa diulang. Metadatanya
   (lisensi, jumlah irisan, deskripsi) diambil dari API, bukan ditulis di sini. */
const SERI = [
  {
    nama: 'ct-phantom-toraks',
    uid: '1.3.6.1.4.1.14519.5.2.1.329084730054548979029758794636987310879',
    jenis: 'phantom',
    ket: 'CT phantom toraks, Siemens SOMATOM Definition Edge, ~172 irisan'
  },
  {
    nama: 'ct-pankreas',
    uid: '1.2.826.0.1.3680043.2.1125.1.78610388862462472334572127709527599',
    jenis: 'pasien',
    ket: 'CT abdomen fase vena porta, ~186 irisan — bagus untuk tulang & pembuluh'
  },
  {
    nama: 'ct-toraks-pasien',
    uid: '1.3.6.1.4.1.14519.5.2.1.6450.9002.126074909814792771812500124918',
    jenis: 'pasien',
    ket: 'CT toraks, ~60 irisan — paling cepat diunduh'
  }
];

/* ==========================================================
   HTTP
   ========================================================== */
function ambil(url, sisaAlih) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'kaca-unduh-volume' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if ((sisaAlih || 0) >= 5) return rej(new Error('terlalu banyak pengalihan'));
        const berikut = new URL(r.headers.location, url).toString();
        if (!berikut.startsWith('https://')) return rej(new Error('pengalihan bukan HTTPS'));
        return ambil(berikut, (sisaAlih || 0) + 1).then(res, rej);
      }
      if (r.statusCode !== 200) {
        r.resume();
        return rej(new Error('HTTP ' + r.statusCode));
      }
      const potongan = [];
      let sudah = 0;
      const total = +r.headers['content-length'] || 0;
      r.on('data', (d) => {
        potongan.push(d);
        sudah += d.length;
        if (total) {
          process.stdout.write(`\r    mengunduh ${(sudah / 1048576).toFixed(1)}/` +
            `${(total / 1048576).toFixed(1)} MB`);
        }
      });
      r.on('end', () => res(Buffer.concat(potongan)));
      r.on('error', rej);
    }).on('error', rej);
  });
}

/* ==========================================================
   Pembaca ZIP minimal
   ----------------------------------------------------------
   TCIA mengirim satu seri sebagai arsip ZIP. Cukup dua metode:
   0 (disimpan apa adanya) dan 8 (deflate) — zlib sudah ada di Node,
   jadi tidak perlu dependensi apa pun.
   ========================================================== */
function bacaZip(buf) {
  /* End of Central Directory dicari dari belakang; komentar arsip
     panjangnya bisa sampai 64 KB, jadi jangkauan pencariannya dibatasi */
  const TANDA_EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === TANDA_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('bukan berkas ZIP yang sah (EOCD tidak ditemukan)');

  const jumlah = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);

  const isi = [];
  for (let n = 0; n < jumlah; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;      /* Central Directory Header */
    const metode = buf.readUInt16LE(pos + 10);
    const ukuranTerkompresi = buf.readUInt32LE(pos + 20);
    const panjangNama = buf.readUInt16LE(pos + 28);
    const panjangExtra = buf.readUInt16LE(pos + 30);
    const panjangKomentar = buf.readUInt16LE(pos + 32);
    const offsetLokal = buf.readUInt32LE(pos + 42);
    const nama = buf.toString('utf8', pos + 46, pos + 46 + panjangNama);
    pos += 46 + panjangNama + panjangExtra + panjangKomentar;

    /* header lokal menentukan di mana data sebenarnya dimulai */
    if (buf.readUInt32LE(offsetLokal) !== 0x04034b50) continue;
    const namaLokal = buf.readUInt16LE(offsetLokal + 26);
    const extraLokal = buf.readUInt16LE(offsetLokal + 28);
    const mulai = offsetLokal + 30 + namaLokal + extraLokal;
    const mentah = buf.slice(mulai, mulai + ukuranTerkompresi);

    let data;
    if (metode === 0) data = mentah;
    else if (metode === 8) data = zlib.inflateRawSync(mentah);
    else continue;                                        /* metode lain dilewati */

    isi.push({ nama, data });
  }
  return isi;
}

/* ==========================================================
   Verifikasi dengan parser & penyusun volume sendiri
   ========================================================== */
function muatModul() {
  const s = {
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    console, Math, JSON, Promise, Map, Date, URL,
    DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
    Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer,
    setTimeout, clearTimeout
  };
  s.window = s;
  vm.createContext(s);
  for (const f of ['assets/js/dicom.js', 'assets/js/volume.js', 'assets/js/mesh.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
  }
  return s;
}

async function periksaSeri(mod, dir) {
  const D = mod.DICOM, V = mod.VOLUME, M = mod.MESH;
  const berkas = fs.readdirSync(dir).filter((f) => /\.dcm$/i.test(f)).sort()
    .map((f) => path.join(dir, f));

  const seri = {
    desc: path.basename(dir), number: 1, modality: '', count: berkas.length,
    getImage(i) {
      try {
        const raw = fs.readFileSync(berkas[i]);
        const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        return Promise.resolve(D.readPixels(D.parse(buf)));
      } catch (e) { return Promise.reject(e); }
    }
  };

  const vol = await V.bangun(seri);
  const ambang = M.ambangSaran(vol);
  const mesh = M.dari(vol, { ambang });
  return {
    irisan: berkas.length,
    volume: vol.info(),
    ambang,
    segitiga: mesh.jumlahSegitiga()
  };
}

/* ==========================================================
   Jalan
   ========================================================== */
const arg = process.argv.slice(2);
const semua = arg.includes('--semua');
const hanyaDaftar = arg.includes('--daftar');
const pilihan = SERI.filter((s) => semua || s.jenis === 'phantom');

(async function () {
  console.log('Sumber: The Cancer Imaging Archive (TCIA) — https://www.cancerimagingarchive.net');
  console.log('Tujuan: contoh-dicom/tcia/  (dikecualikan dari git)');
  console.log('');

  if (!semua) {
    console.log('Bawaan: hanya seri PHANTOM (objek uji, bukan manusia).');
    console.log('Tambahkan --semua untuk ikut mengunduh CT pasien nyata yang sudah');
    console.log('de-identifikasi dan dipublikasikan resmi oleh TCIA.');
    console.log('');
  }

  /* metadata diambil lebih dulu supaya lisensi & ukurannya diketahui
     sebelum satu byte citra pun diunduh */
  console.log('Mengambil metadata dari TCIA…');
  const meta = [];
  for (const s of pilihan) {
    try {
      const j = JSON.parse((await ambil(API + 'getSeriesMetaData?SeriesInstanceUID=' +
        encodeURIComponent(s.uid))).toString('utf8'));
      meta.push(Object.assign({}, s, { api: j[0] || null }));
    } catch (err) {
      meta.push(Object.assign({}, s, { api: null, galat: err.message }));
    }
  }

  console.log('');
  for (const m of meta) {
    const a = m.api || {};
    console.log(`  ${m.nama}  [${m.jenis}]`);
    console.log(`    ${m.ket}`);
    if (m.api) {
      console.log(`    koleksi  : ${a.Collection}   subjek ${a['Subject ID'] || '?'}`);
      console.log(`    alat     : ${[a.Manufacturer, a['Manufacturer Model Name']].filter(Boolean).join(' ') || '?'}`);
      console.log(`    irisan   : ${a['Number of Images'] || '?'}   ${a['Body Part Examined'] || ''}`);
      console.log(`    ukuran   : ${a['File Size'] ? (a['File Size'] / 1048576).toFixed(1) + ' MB' : '?'}`);
      console.log(`    lisensi  : ${a['License Name'] || '?'}`);
      console.log(`    DOI      : ${a['Data Description URI'] || '(tidak tercantum)'}`);
    } else {
      console.log(`    metadata tidak terbaca: ${m.galat}`);
    }
    console.log('');
  }

  if (hanyaDaftar) {
    console.log('(--daftar: tidak ada yang diunduh)');
    return;
  }

  fs.mkdirSync(TUJUAN, { recursive: true });
  const hasil = [];
  const mod = muatModul();

  for (const m of meta) {
    const dir = path.join(TUJUAN, m.nama);
    console.log(`${m.nama}:`);

    const sudahAda = fs.existsSync(dir) &&
      fs.readdirSync(dir).filter((f) => /\.dcm$/i.test(f)).length > 0;

    if (sudahAda) {
      console.log(`    sudah ada, tidak diunduh ulang`);
    } else {
      let zip;
      try {
        zip = await ambil(API + 'getImage?SeriesInstanceUID=' + encodeURIComponent(m.uid));
        process.stdout.write('\n');
      } catch (err) {
        console.log(`    GAGAL mengunduh: ${err.message}\n`);
        continue;
      }
      let isi;
      try {
        isi = bacaZip(zip).filter((e) => /\.dcm$/i.test(e.nama));
      } catch (err) {
        console.log(`    GAGAL membuka ZIP: ${err.message}\n`);
        continue;
      }
      if (!isi.length) { console.log('    ZIP tidak memuat berkas .dcm\n'); continue; }

      fs.mkdirSync(dir, { recursive: true });
      isi.forEach((e, i) => {
        /* nama diseragamkan; urutan sebenarnya ditentukan geometri, bukan nama */
        const nama = `${m.nama}-${String(i + 1).padStart(4, '0')}.dcm`;
        fs.writeFileSync(path.join(dir, nama), e.data);
      });
      console.log(`    ${isi.length} berkas .dcm diekstraksi`);
    }

    /* verifikasi: harus bisa jadi volume dan permukaan */
    try {
      const p = await periksaSeri(mod, dir);
      console.log(`    volume     ${p.volume}`);
      console.log(`    permukaan  ambang ${p.ambang} → ${p.segitiga.toLocaleString('id-ID')} segitiga`);
      hasil.push(Object.assign({}, m, p));
    } catch (err) {
      console.log(`    GAGAL diverifikasi: ${err.message}`);
    }
    console.log('');
  }

  /* atribusi — diwajibkan lisensi CC BY */
  const baris = [
    '# Sumber berkas DICOM di folder ini',
    '',
    'Berkas `.dcm` di folder ini **bukan** buatan proyek Medivox. Semuanya diunduh oleh',
    '`tools/unduh-volume.js` dari **The Cancer Imaging Archive (TCIA)**,',
    '<https://www.cancerimagingarchive.net>, lewat REST API publik NBIA.',
    '',
    'Lisensi Creative Commons Attribution mewajibkan atribusi bila data ini',
    'disebarkan kembali. Rincian per seri ada di tabel di bawah, diambil langsung',
    'dari API TCIA saat pengunduhan — bukan ditulis tangan.',
    '',
    'Kutipan yang diminta TCIA untuk arsipnya sendiri:',
    '',
    '> Clark K, Vendt B, Smith K, Freymann J, Kirby J, Koppel P, Moore S, Phillips S,',
    '> Maffitt D, Pringle M, Tarbox L, Prior F. The Cancer Imaging Archive (TCIA):',
    '> Maintaining and Operating a Public Information Repository. Journal of Digital',
    '> Imaging, 2013; 26(6): 1045-1057. doi:10.1007/s10278-013-9622-6',
    '',
    'Setiap koleksi punya kutipan sendiri — pakai tautan DOI pada masing-masing seri',
    'di bawah, bukan hanya kutipan TCIA di atas.',
    '',
    '## Seri yang terunduh',
    ''
  ];
  for (const h of hasil) {
    const a = h.api || {};
    baris.push(`### \`${h.nama}\` — ${h.jenis === 'phantom' ? 'phantom (objek uji)' : 'pasien (de-identifikasi)'}`);
    baris.push('');
    baris.push(`- Koleksi: **${a.Collection || '?'}** · subjek \`${a['Subject ID'] || '?'}\``);
    baris.push(`- Lisensi: **${a['License Name'] || '?'}** — ${a['License URL'] || ''}`);
    baris.push(`- DOI koleksi (kutip ini): ${a['Data Description URI'] || '(tidak tercantum di API)'}`);
    baris.push(`- Alat: ${[a.Manufacturer, a['Manufacturer Model Name'], a['Software Versions']]
      .filter(Boolean).join(' · ') || '?'}`);
    baris.push(`- Pemeriksaan: ${[a['Study Description'], a['Series Description'],
      a['Body Part Examined']].filter(Boolean).join(' · ') || '?'}`);
    baris.push(`- SeriesInstanceUID: \`${h.uid}\``);
    baris.push(`- ${h.irisan} irisan · ${h.volume}`);
    baris.push('');
  }
  baris.push('_Berkas ini dibuat ulang otomatis setiap kali `tools/unduh-volume.js` dijalankan._');
  baris.push('');

  fs.mkdirSync(TUJUAN, { recursive: true });
  fs.writeFileSync(path.join(TUJUAN, 'SUMBER.md'), baris.join('\n'));

  console.log(`${hasil.length} seri siap dipakai.`);
  console.log('Atribusi ditulis ke contoh-dicom/tcia/SUMBER.md');
  console.log('');
  console.log('Buka lewat tombol "Buka Folder" di worklist, arahkan ke salah satu');
  console.log('folder di contoh-dicom/tcia/, lalu di viewer tekan "Bangun 3D & MPR"');
  console.log('dan "Rekonstruksi permukaan".');
  process.exit(hasil.length ? 0 : 1);
})();
