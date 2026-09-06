#!/usr/bin/env node
/* ==========================================================
   KACA — perender adegan hologram untuk video
   ----------------------------------------------------------
   Jalankan: node video/render-adegan.js [--cepat]

   Menghasilkan potongan video dari MESIN YANG SAMA dengan yang
   dipakai aplikasi: assets/js/volume.js dan assets/js/mesh.js
   dimuat apa adanya, lalu bingkainya dipipa mentah (rgb24) ke
   ffmpeg. Tidak ada peramban, tidak ada tangkapan layar — apa yang
   terlihat di video benar-benar keluaran asli sistem.

   Susunan empat sisi memakai kesepakatan yang sama dengan
   assets/js/prisma.js: tepi atas setiap sisi menghadap pusat, dan
   sisi berikutnya tertinggal 90°. Karena rotasinya tepat kelipatan
   90° dan ukuran sisi dibuat pas, penempelannya cuma pemetaan
   indeks — tidak ada penskalaan ulang, jadi tidak ada kekaburan.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KELUAR = path.join(__dirname, 'potongan');
const CEPAT = process.argv.includes('--cepat');

/* ---------- muat mesin aplikasi ---------- */
function muatMesin() {
  const s = {
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    console, Math, JSON, Promise, Map, Date, URL,
    DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
    Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer,
    setTimeout, clearTimeout
  };
  s.window = s;
  vm.createContext(s);
  for (const f of ['assets/js/dicom.js', 'assets/js/volume.js',
                   'assets/js/mesh.js', 'assets/js/demo.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
  }
  return s;
}
const M = muatMesin();

/* ==========================================================
   Kanvas RGB sederhana
   ========================================================== */
function kanvas(w, h) {
  return { w, h, d: Buffer.alloc(w * h * 3) };
}
function bersih(c) { c.d.fill(0); }

/* img (dari DICOM/VOLUME/MESH) → buffer RGB w×h */
function keRGB(img, opsi) {
  const idata = M.DICOM.toImageData(img, opsi || {});
  const n = img.cols * img.rows;
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = idata.data[i * 4];
    out[i * 3 + 1] = idata.data[i * 4 + 1];
    out[i * 3 + 2] = idata.data[i * 4 + 2];
  }
  return out;
}

/* Tempel satu sisi. sisi: 0=selatan 1=barat 2=utara 3=timur.
   Rotasi kelipatan 90°, jadi pemetaan indeksnya tepat. */
function tempel(dst, src, P, sisi, cx, cy, jarak) {
  const S = dst.w, H = dst.h;
  const tx = cx + (sisi === 1 ? -jarak : sisi === 3 ? jarak : 0);
  const ty = cy + (sisi === 0 ? jarak : sisi === 2 ? -jarak : 0);
  const half = P / 2;

  for (let sy = 0; sy < P; sy++) {
    const ly = sy - P;                  /* -P .. -1 : tepi atas citra = -P */
    for (let sx = 0; sx < P; sx++) {
      const lx = sx - half;
      let gx, gy;
      switch (sisi) {
        case 0: gx = tx + lx; gy = ty + ly; break;          /* 0°   */
        case 1: gx = tx - ly; gy = ty + lx; break;          /* 90°  */
        case 2: gx = tx - lx; gy = ty - ly; break;          /* 180° */
        default: gx = tx + ly; gy = ty - lx; break;         /* -90° */
      }
      gx |= 0; gy |= 0;
      if (gx < 0 || gy < 0 || gx >= S || gy >= H) continue;
      const so = (sy * P + sx) * 3, dofs = (gy * S + gx) * 3;
      /* sisi ditumpuk dengan mode "lighten" supaya tumpang tindih
         tepi tidak saling menghapus, seperti pantulan yang menjumlah */
      if (src[so] > dst.d[dofs]) dst.d[dofs] = src[so];
      if (src[so + 1] > dst.d[dofs + 1]) dst.d[dofs + 1] = src[so + 1];
      if (src[so + 2] > dst.d[dofs + 2]) dst.d[dofs + 2] = src[so + 2];
    }
  }
}

/* penanda pusat: tempat puncak prisma diletakkan */
function penandaPusat(c, kuat) {
  const cx = c.w >> 1, cy = c.h >> 1;
  const r = Math.round(c.w * 0.016);
  const warna = [47, 212, 189];
  const tulis = (x, y) => {
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
    const o = (y * c.w + x) * 3;
    for (let k = 0; k < 3; k++) {
      const v = c.d[o + k] + warna[k] * kuat;
      c.d[o + k] = v > 255 ? 255 : v;
    }
  };
  for (let i = -r; i <= r; i++) { tulis(cx + i, cy); tulis(cx, cy + i); }
}

/* ==========================================================
   Pipa ke ffmpeg
   ========================================================== */
function mulaiFfmpeg(nama, w, h, fps) {
  fs.mkdirSync(KELUAR, { recursive: true });
  const keluar = path.join(KELUAR, nama + '.mp4');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24',
    '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0',
    '-an',
    '-c:v', 'libx264', '-preset', CEPAT ? 'veryfast' : 'slow',
    '-crf', CEPAT ? '26' : '18',
    '-pix_fmt', 'yuv420p',
    keluar
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  return { ff, keluar };
}

function tulis(ff, buf) {
  return new Promise((res) => {
    if (ff.stdin.write(buf)) res();
    else ff.stdin.once('drain', res);
  });
}

function tutup(ff) {
  return new Promise((res, rej) => {
    ff.on('close', (kode) => (kode === 0 ? res() : rej(new Error('ffmpeg keluar ' + kode))));
    ff.stdin.end();
  });
}

/* ==========================================================
   Sumber volume
   ========================================================== */
function seriDemo(idStudi) {
  const st = M.DEMO.studies.filter((s) => s.id === idStudi)[0] || M.DEMO.studies[0];
  let idx = 0;
  st.series.forEach((s, i) => { if (s.n > st.series[idx].n) idx = i; });
  const s = st.series[idx];
  let cache = null;
  return {
    label: st.desc,
    seri: {
      desc: s.desc, number: s.num, modality: st.modality, count: s.n,
      getImage(i) {
        if (!cache) cache = M.DEMO.buildSeriesImages(st, idx);
        return Promise.resolve(cache[Math.max(0, Math.min(s.n - 1, i))]);
      }
    }
  };
}

/* seri volumetrik dari disk, jauh lebih tebal — dipakai bila ada */
function seriDisk(dir) {
  const berkas = fs.readdirSync(dir).filter((f) => /\.dcm$/i.test(f)).sort()
    .map((f) => path.join(dir, f));
  if (berkas.length < 8) return null;
  return {
    label: path.basename(dir),
    seri: {
      desc: path.basename(dir), number: 1, modality: '', count: berkas.length,
      getImage(i) {
        try {
          const raw = fs.readFileSync(berkas[i]);
          const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
          return Promise.resolve(M.DICOM.readPixels(M.DICOM.parse(buf)));
        } catch (e) { return Promise.reject(e); }
      }
    }
  };
}

function pilihSumber() {
  /* seri volumetrik nyata memberi hasil paling meyakinkan; kalau belum
     diunduh/dibuat, phantom demo tetap dipakai supaya skrip ini selalu jalan */
  const kandidat = [
    path.join(ROOT, 'contoh-dicom', 'tcia', 'ct-toraks-pasien'),
    path.join(ROOT, 'contoh-dicom', 'tcia', 'ct-phantom-toraks'),
    path.join(ROOT, 'contoh-dicom', 'volume', 'ct-kepala-3d')
  ];
  for (const k of kandidat) {
    if (fs.existsSync(k)) {
      const s = seriDisk(k);
      if (s) { console.log('  sumber: ' + path.relative(ROOT, k).replace(/\\/g, '/')); return s; }
    }
  }
  console.log('  sumber: phantom demo (jalankan tools/buat-contoh.js untuk hasil lebih baik)');
  return seriDemo('ST-2409-0146');
}

/* ==========================================================
   Adegan
   ========================================================== */
const LEBAR = CEPAT ? 720 : 1080;
const FPS = 30;

async function adeganPrisma(vol, nama, opsiProyeksi, putaran) {
  const S = LEBAR;
  /* jarak = P membuat tepi atas keempat sisi bertemu TEPAT di titik pusat.
     Kalau jarak < P sisi-sisinya saling tindih dan tengahnya jadi keruh —
     di prisma sungguhan itu tidak terlihat, tetapi di video sangat terlihat. */
  const P = Math.round(S * 0.30);
  const jarak = P;
  const sudut = CEPAT ? 32 : 64;
  const bingkaiTotal = Math.round(FPS * (putaran || 6));

  process.stdout.write(`  ${nama}: prarender ${sudut} sudut @ ${P}px…`);
  const muka = [];
  for (let i = 0; i < sudut; i++) {
    const img = vol.proyeksi(Object.assign({
      azimut: i / sudut * Math.PI * 2,
      ukuran: P, mutu: CEPAT ? 0.7 : 1.1
    }, opsiProyeksi));
    muka.push(keRGB(img, {
      windowCenter: opsiProyeksi.windowCenter !== undefined ? opsiProyeksi.windowCenter : vol.windowCenter,
      windowWidth: opsiProyeksi.windowWidth !== undefined ? opsiProyeksi.windowWidth : vol.windowWidth,
      colormap: opsiProyeksi.colormap || null
    }));
  }
  process.stdout.write(' selesai\n');

  const { ff, keluar } = mulaiFfmpeg(nama, S, S, FPS);
  const c = kanvas(S, S);
  const cx = S >> 1, cy = S >> 1;

  for (let f = 0; f < bingkaiTotal; f++) {
    bersih(c);
    const fase = f / bingkaiTotal * sudut;
    for (let sisi = 0; sisi < 4; sisi++) {
      const idx = (Math.round(fase + sisi * sudut / 4) % sudut + sudut) % sudut;
      tempel(c, muka[idx], P, sisi, cx, cy, jarak);
    }
    penandaPusat(c, 0.55);
    await tulis(ff, c.d);
  }
  await tutup(ff);
  console.log(`  ${nama}: ${bingkaiTotal} bingkai → ${path.relative(ROOT, keluar).replace(/\\/g, '/')}`);
}

async function adeganPermukaan(mesh, nama, putaran) {
  const S = LEBAR;
  const P = Math.round(S * 0.30);
  const jarak = P;                    /* bertemu tepat di pusat, lihat catatan di atas */
  const sudut = CEPAT ? 32 : 64;
  const bingkaiTotal = Math.round(FPS * (putaran || 6));

  process.stdout.write(`  ${nama}: render ${sudut} sudut permukaan @ ${P}px…`);
  const muka = [];
  for (let i = 0; i < sudut; i++) {
    const img = mesh.render({
      azimut: i / sudut * Math.PI * 2, elevasi: 0.12, ukuran: P,
      warna: [226, 232, 240], tepi: 0.42, kilau: 0.30
    });
    muka.push(keRGB(img, {}));
  }
  process.stdout.write(' selesai\n');

  const { ff, keluar } = mulaiFfmpeg(nama, S, S, FPS);
  const c = kanvas(S, S);
  const cx = S >> 1, cy = S >> 1;
  for (let f = 0; f < bingkaiTotal; f++) {
    bersih(c);
    const fase = f / bingkaiTotal * sudut;
    for (let sisi = 0; sisi < 4; sisi++) {
      const idx = (Math.round(fase + sisi * sudut / 4) % sudut + sudut) % sudut;
      tempel(c, muka[idx], P, sisi, cx, cy, jarak);
    }
    penandaPusat(c, 0.55);
    await tulis(ff, c.d);
  }
  await tutup(ff);
  console.log(`  ${nama}: ${bingkaiTotal} bingkai → ${path.relative(ROOT, keluar).replace(/\\/g, '/')}`);
}

/* satu pandangan besar yang berputar — bukan susunan prisma */
async function adeganTunggal(nama, buat, jumlah, putaran) {
  const S = LEBAR;
  const bingkaiTotal = Math.round(FPS * (putaran || 5));
  process.stdout.write(`  ${nama}: render ${jumlah} sudut @ ${S}px…`);
  const bidang = [];
  for (let i = 0; i < jumlah; i++) bidang.push(buat(i, jumlah, S));
  process.stdout.write(' selesai\n');

  const { ff, keluar } = mulaiFfmpeg(nama, S, S, FPS);
  for (let f = 0; f < bingkaiTotal; f++) {
    const idx = Math.min(bidang.length - 1, Math.floor(f / bingkaiTotal * bidang.length));
    await tulis(ff, bidang[idx]);
  }
  await tutup(ff);
  console.log(`  ${nama}: ${bingkaiTotal} bingkai → ${path.relative(ROOT, keluar).replace(/\\/g, '/')}`);
}

/* ==========================================================
   Jalan
   ========================================================== */
(async function () {
  console.log('Render adegan hologram' + (CEPAT ? ' (mode cepat)' : '') + `  ${LEBAR}px @ ${FPS}fps`);
  const sumber = pilihSumber();

  process.stdout.write('  menyusun volume…');
  const t0 = Date.now();
  const vol = await M.VOLUME.bangun(sumber.seri);
  console.log(` ${vol.info()}  (${Date.now() - t0} ms)`);

  const ct = (vol.modality || '').toUpperCase() === 'CT';

  /* 1. MIP dalam susunan prisma — adegan utama */
  await adeganPrisma(vol, 'prisma-mip', {
    mode: 'maks', elevasi: 0.16,
    windowCenter: ct ? 300 : vol.windowCenter,
    windowWidth: ct ? 900 : vol.windowWidth
  }, 6);

  /* 2. Volume rendering berwarna, elevasi lebih tinggi */
  await adeganPrisma(vol, 'prisma-volume', {
    mode: 'komposit', elevasi: 0.30, kepadatan: 1.6, gamma: 1.5,
    windowCenter: ct ? 250 : vol.windowCenter,
    windowWidth: ct ? 800 : vol.windowWidth,
    colormap: 'bone'
  }, 5);

  /* 3. Permukaan hasil isosurface */
  process.stdout.write('  menelusuri isosurface…');
  const ambang = M.MESH.ambangSaran(vol);
  const mesh = M.MESH.dari(vol, { ambang });
  console.log(` ${mesh.info()}`);
  if (!mesh.kosong()) await adeganPermukaan(mesh, 'prisma-permukaan', 5);

  /* 4. Satu pandangan MIP besar, untuk potongan pembuka */
  await adeganTunggal('mip-tunggal', (i, n, S) => {
    const img = vol.proyeksi({
      azimut: i / n * Math.PI * 2, elevasi: 0.1, mode: 'maks',
      ukuran: S, mutu: CEPAT ? 0.6 : 0.9,
      windowCenter: ct ? 300 : vol.windowCenter,
      windowWidth: ct ? 900 : vol.windowWidth
    });
    return keRGB(img, {
      windowCenter: ct ? 300 : vol.windowCenter,
      windowWidth: ct ? 900 : vol.windowWidth
    });
  }, CEPAT ? 24 : 48, 5);

  /* 5. Sapuan MPR koronal — memperlihatkan bahwa datanya volume sungguhan */
  const nKor = vol.jumlah('coronal');
  await adeganTunggal('mpr-koronal', (i, n, S) => {
    const idx = Math.round(i / (n - 1) * (nKor - 1));
    const img = vol.irisan('coronal', idx);
    /* MPR koronal biasanya jauh lebih pendek daripada lebar; disisipkan
       ke dalam bingkai bujur sangkar tanpa diregangkan */
    const src = keRGB(img, {
      windowCenter: ct ? 60 : vol.windowCenter,
      windowWidth: ct ? 500 : vol.windowWidth
    });
    const out = Buffer.alloc(S * S * 3);
    const sk = Math.min(S / img.cols, S / (img.rows * (img.pixelSpacing[0] / img.pixelSpacing[1])));
    const dw = Math.max(1, Math.round(img.cols * sk));
    const dh = Math.max(1, Math.round(img.rows * sk * (img.pixelSpacing[0] / img.pixelSpacing[1])));
    const ox = (S - dw) >> 1, oy = (S - dh) >> 1;
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(img.rows - 1, Math.floor(y / dh * img.rows));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(img.cols - 1, Math.floor(x / dw * img.cols));
        const so = (sy * img.cols + sx) * 3, dofs = ((oy + y) * S + ox + x) * 3;
        out[dofs] = src[so]; out[dofs + 1] = src[so + 1]; out[dofs + 2] = src[so + 2];
      }
    }
    return out;
  }, CEPAT ? 24 : 40, 4);

  console.log('');
  console.log('Selesai. Potongan ada di video/potongan/');
})().catch((err) => {
  console.error('GAGAL: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
