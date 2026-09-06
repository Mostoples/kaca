# Kaca — Platform Inspeksi Citra DICOM

Prototipe web apps dengan **HTML, CSS, dan JavaScript native** (tanpa framework, tanpa
dependensi, tanpa proses build). Terdiri dari halaman web (landing) dan halaman aplikasi
(worklist + viewer DICOM).

## Menjalankan

Karena aplikasi memakai `fetch`-free File API dan IndexedDB, cukup buka lewat server statis
apa pun (membuka via `file://` juga jalan, hanya IndexedDB di sebagian peramban dibatasi):

```bash
# pilih salah satu
python -m http.server 8080
npx serve .
```

Lalu buka <http://localhost:8080/>.

## Struktur

```
index.html            Halaman web (landing/marketing)
worklist.html         Halaman apps — daftar studi / antrian baca
viewer.html           Halaman apps — viewer & inspeksi citra
assets/css/base.css   Design token + komponen dasar
assets/css/site.css   Gaya halaman web
assets/css/app.css    Gaya halaman apps
assets/js/dicom.js    Parser DICOM Part-10 (ditulis dari nol)
assets/js/demo.js     Generator phantom sintetis untuk data demo
assets/js/idb.js      Penyimpanan berkas lokal (IndexedDB)
assets/js/common.js   Utilitas bersama (toast, storage, ikon)
assets/js/site.js     Script landing
assets/js/worklist.js Script worklist
assets/js/viewer.js   Mesin viewer (render, tool, pengukuran)
contoh-dicom/         20 berkas .dcm asli untuk dicoba
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

## Halaman apps

**Worklist** — filter antrian (belum dibaca / sedang dibaca / selesai / cito / berkas lokal),
filter modalitas, pencarian, pengurutan kolom, drag-and-drop berkas atau folder, status baca
tersimpan di peramban.

**Viewer** — alat: Window/Level, geser, perbesar, gulir irisan, ukur panjang, ukur sudut,
ROI persegi & elips (rerata, simpangan baku, luas cm²), probe nilai piksel, anotasi teks.
Tata letak 1×1 / 1×2 / 2×2 / 1×3, cine playback, preset window klinis, peta warna, inversi,
rotasi, cermin, sinkronisasi antar viewport, inspektur tag DICOM, dan panel laporan.

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
| `D` | Probe piksel | | `Esc` | Batalkan / keluar layar penuh |

Tetikus: seret kiri = alat aktif, tengah = geser, kanan = perbesar, roda = gulir irisan,
`Ctrl`+roda = perbesar, klik ganda = ubah tata letak.

## Data demo

Enam studi fiktif (CT toraks, CT kepala, MRI kepala ×2, foto toraks, USG multi-frame) dibuat
sebagai phantom sintetis dengan nilai HU yang masuk akal, sehingga preset window klinis
benar-benar terlihat bedanya. Folder `contoh-dicom/` berisi 20 berkas `.dcm` sungguhan yang
bisa dibuka lewat tombol **Buka File DICOM** untuk menguji parser.

## Catatan

Ini prototipe antarmuka, **bukan perangkat medis**. Seluruh data pasien fiktif dan citra
merupakan phantom sintetis. Jangan gunakan untuk pengambilan keputusan klinis.
