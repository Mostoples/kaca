# Kaca — Platform Inspeksi Citra DICOM

**Live: <https://kaca-id.web.app>**

Web apps dengan **HTML, CSS, dan JavaScript native** — tanpa framework, tanpa bundler,
tanpa proses build. Terdiri dari halaman web (landing), halaman masuk, dan halaman
aplikasi (worklist + viewer DICOM). Satu-satunya dependensi eksternal adalah SDK Firebase
yang dimuat langsung dari CDN untuk autentikasi dan penyimpanan laporan.

## Menjalankan secara lokal

```bash
node serve.js          # http://localhost:8080
node serve.js 3000     # port lain
```

Gunakan `serve.js`, **bukan** `python -m http.server`. Berkas `assets/js/firebase-init.js`
adalah ES module, dan `http.server` bawaan Python di Windows mengirimkannya sebagai
`text/plain` sehingga peramban menolak memuatnya.

## Struktur

```
index.html              Halaman web (landing/marketing)
masuk.html              Halaman masuk / daftar / mode tamu
worklist.html           Halaman apps — antrian baca
viewer.html             Halaman apps — viewer & inspeksi citra
serve.js                Server statis untuk pengembangan lokal

assets/css/base.css     Design token + komponen dasar
assets/css/site.css     Gaya halaman web
assets/css/auth.css     Gaya halaman masuk
assets/css/app.css      Gaya halaman apps (termasuk tata letak ponsel)

assets/js/dicom.js      Parser DICOM Part-10 (ditulis dari nol)
assets/js/demo.js       Generator phantom sintetis untuk data demo
assets/js/firebase-init.js  Jembatan Firebase (satu-satunya ES module)
assets/js/auth.js       Sesi, penjaga halaman, menu pengguna
assets/js/idb.js        Penyimpanan berkas lokal (IndexedDB)
assets/js/common.js     Utilitas bersama (toast, storage, ikon)
assets/js/site.js       Script landing
assets/js/masuk.js      Script halaman masuk
assets/js/worklist.js   Script worklist
assets/js/viewer.js     Mesin viewer (render, alat, pengukuran)

firebase.json           Konfigurasi Hosting + Firestore
firestore.rules         Aturan keamanan Firestore
contoh-dicom/           20 berkas .dcm asli untuk dicoba
```

## Parser DICOM

`assets/js/dicom.js` mengurai berkas DICOM sungguhan, bukan sekadar menampilkan gambar:

| Kemampuan | Status |
|---|---|
| Preamble 128 byte + magic `DICM` | ✅ |
| Dataset tanpa preamble | ✅ (dideteksi otomatis) |
| Implicit VR Little Endian | ✅ |
| Explicit VR Little Endian | ✅ |
| Explicit VR Big Endian | ✅ |
| Sequence (SQ), panjang eksplisit & undefined | ✅ |
| Pixel data native 8/16 bit, signed & unsigned | ✅ |
| Multi-frame (`0028,0008`) | ✅ |
| MONOCHROME1 / MONOCHROME2 / RGB | ✅ |
| Rescale slope & intercept → nilai HU | ✅ |
| Pixel data terenkapsulasi JPEG baseline | ✅ (didekode peramban) |
| JPEG 2000 / JPEG-LS / RLE | dikenali, ditandai perlu dekoder tambahan |

Diverifikasi lewat uji round-trip: berkas di-*encode*, diurai kembali, dan nilai pikselnya
dibandingkan byte per byte pada ketiga transfer syntax di atas.

## Firebase

Project: **kaca-id**. Firestore berada di region `asia-southeast2` (Jakarta).

### Autentikasi

Tiga jalur masuk di `masuk.html`:

1. **Email & kata sandi** — aktif dan siap dipakai.
2. **Google** — tombolnya sudah ada; aktifkan dulu di
   *Firebase Console → Authentication → Sign-in method → Google*. Sebelum diaktifkan,
   aplikasi menampilkan pesan yang menjelaskan langkah itu, bukan galat mentah.
3. **Mode tamu** — tanpa akun. Status baca dan laporan disimpan di peramban itu saja.

Mode tamu tidak menunggu Firebase sama sekali, sehingga aplikasi tetap terbuka seketika
walau CDN lambat atau diblokir jaringan rumah sakit.

### Data yang disimpan

Hanya teks. **Piksel DICOM tidak pernah dikirim ke mana pun** — berkas dibaca lewat File
API dan diurai di memori peramban.

```
users/{uid}/worklist/{studyId}   → { status, updatedAt }
users/{uid}/reports/{studyId}    → { clinical, findings, impression, status, by, patient, updatedAt }
```

`firestore.rules` mengunci setiap dokumen ke pemiliknya, membatasi field yang boleh ditulis,
dan membatasi panjang teks laporan. Tidak ada koleksi yang bisa dibaca lintas pengguna.

### Deploy

```bash
firebase deploy --only hosting --project kaca-id
firebase deploy --only firestore:rules --project kaca-id
```

## Halaman apps

**Worklist** — filter antrian (belum dibaca / sedang dibaca / selesai / cito / berkas lokal),
filter modalitas, pencarian, pengurutan kolom, drag-and-drop berkas atau folder. Status baca
tersinkron ke akun bila masuk, dan selalu punya salinan lokal.

**Viewer** — alat: Window/Level, geser, perbesar, gulir irisan, ukur panjang, ukur sudut,
ROI persegi & elips (rerata, simpangan baku, luas cm²), probe nilai piksel, anotasi teks.
Tata letak 1×1 / 1×2 / 2×2 / 1×3, cine playback, preset window yang menyesuaikan modalitas,
peta warna, inversi, rotasi, cermin, sinkronisasi antar viewport, inspektur tag DICOM, dan
panel laporan.

### Pintasan papan ketik

| Tombol | Fungsi | | Tombol | Fungsi |
|---|---|---|---|---|
| `W` | Window/Level | | `I` | Inversi |
| `P` | Geser | | `F` | Pas ke layar |
| `Z` | Perbesar | | `0` | Reset tampilan |
| `S` | Gulir irisan | | `H` | Sembunyikan overlay |
| `L` | Ukur panjang | | `←` `→` | Irisan sebelumnya/berikutnya |
| `A` | Ukur sudut | | `Spasi` | Putar/jeda cine |
| `R` `E` | ROI persegi / elips | | `1`–`4` | Tata letak |
| `D` | Probe piksel | | `Esc` | Batalkan / tutup laci |

Tetikus: seret kiri = alat aktif, tengah = geser, kanan = perbesar, roda = gulir irisan,
`Ctrl`+roda = perbesar, klik ganda = ubah tata letak.

Sentuh: satu jari = alat aktif, **dua jari = cubit untuk memperbesar dan menggeser**.

## Ponsel & aksesibilitas

- Seluruh interaksi viewer memakai Pointer Events, jadi tetikus, pena, dan layar sentuh
  berjalan lewat jalur yang sama.
- Di layar sempit: sidebar worklist, panel seri, dan panel kanan menjadi laci geser;
  toolbar viewer berpindah ke bawah sebagai baris yang bisa digulir; tabel worklist berubah
  menjadi daftar kartu.
- Target sentuh diperbesar pada perangkat `pointer: coarse`.
- Tautan lewati-ke-konten, cincin fokus yang terlihat, `aria-pressed` pada alat,
  `aria-selected` pada tab, dan label untuk semua tombol berikon.
- Window/level hasil render di-cache, sehingga geser, perbesar, dan putar tidak menghitung
  ulang LUT — diverifikasi 0 kali perhitungan ulang saat zoom.

## Data demo

Enam studi fiktif (CT toraks, CT kepala, MRI kepala ×2, foto toraks, USG multi-frame) dibuat
sebagai phantom sintetis dengan nilai HU yang masuk akal, sehingga preset window klinis
benar-benar terlihat bedanya. Folder `contoh-dicom/` berisi 20 berkas `.dcm` sungguhan yang
bisa dibuka lewat tombol **Buka File DICOM** untuk menguji parser.

## Catatan

Ini prototipe antarmuka, **bukan perangkat medis**. Seluruh data pasien fiktif dan citra
merupakan phantom sintetis. Jangan gunakan untuk pengambilan keputusan klinis.
