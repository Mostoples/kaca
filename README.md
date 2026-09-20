# Medivox — Viewer Hologram Prisma untuk Citra DICOM

**See. Speak. Understand.**

**Live: <https://kaca-id.web.app>**

> Produk ini sebelumnya bernama *Kaca*. Nama, lambang, dan paletnya kini mengikuti
> identitas Medivox. Identitas teknis yang tidak terlihat pengguna sengaja dibiarkan:
> ID project Firebase tetap `kaca-id`, begitu pula nama basis data IndexedDB. Mengubahnya
> berarti memindahkan project dan membuang data yang sudah tersimpan, tanpa manfaat yang
> terlihat. Kunci `localStorage` memang berpindah ke awalan `medivox.`, tetapi kunci lama
> ikut dipindahkan otomatis saat pertama dibaca sehingga laporan tersimpan tidak hilang.

Inti sistem ini adalah **panggung hologram prisma**: tumpukan irisan CT atau MRI disusun jadi
volume tiga dimensi, lalu dipancarkan sebagai empat pandangan yang saling berhadapan. Prisma
kaca yang diletakkan di atas layar memantulkan keempatnya sehingga bertemu sebagai satu bentuk
yang tampak mengambang — efek *Pepper's ghost*, tanpa kacamata dan tanpa proyektor.

Worklist, viewer 2D, MPR, MIP, pengukuran, dan pelaporan semuanya ada, tetapi kedudukannya
**pendukung**. Titik masuk utamanya `prisma.html`.

Web apps dengan **HTML, CSS, dan JavaScript native** — tanpa framework, tanpa bundler,
tanpa proses build, dan tanpa WebGL. Seluruh perhitungan volume, ray-cast, dan rasterisasi
permukaan berjalan di CPU lewat canvas 2D. Satu-satunya dependensi eksternal adalah SDK
Firebase dari CDN untuk autentikasi dan penyimpanan laporan.

## Peta halaman

| Halaman | Kedudukan | Isi |
|---|---|---|
| `prisma.html` | **utama** | Panggung hologram: pemilih studi, empat pandangan berputar, semua penyetelan |
| `viewer.html` | pendukung | Viewer 2D, tempat volume 3D & MPR dibangun, ekspor STL/OBJ |
| `worklist.html` | pendukung | Daftar studi, buka berkas & folder, kelola cache lokal |
| `masuk.html` | — | Masuk / daftar / mode tamu |
| `index.html` | — | Halaman web pengenalan |

Jalur pendek: `/app` dan `/hologram` → panggung hologram, `/viewer`, `/studi`, `/login`.
Setelah masuk, tujuan bawaannya panggung hologram.

## Bahasa visual

Antarmuka memakai permukaan *neumorphic* di atas latar navy bergradien, dengan aksen gradien
biru royal → cyan yang diambil dari huruf M pada logo:

| Peran | Nilai |
|---|---|
| Biru merek | `#2f6fd0` |
| Cyan aksen | `#5ec9f2` |
| Navy wordmark | `#1b3a63` |
| Permukaan | `#122c50` |
| Gradien merek | `linear-gradient(120deg,#2f6fd0,#5ec9f2)` |

Tipografi **Manrope** untuk antarmuka dan **JetBrains Mono** untuk angka, tag DICOM, serta
overlay citra. Seluruh token ada di `assets/css/base.css`; mengubah paletnya cukup di sana.

**Area citra medis dikecualikan dari gaya ini.** Viewport 2D, panel seri, dan panggung
hologram tetap hitam murni tanpa gradien, karena latar berwarna menggeser persepsi kontras
jaringan dan membuat penilaian window/level tidak dapat diandalkan.

### Ponsel dan desktop

Satu tata letak menyesuaikan diri, bukan dua halaman terpisah:

- Di bawah 900 px sidebar worklist, panel seri, dan panel kanan menjadi laci geser; rel alat
  viewer berpindah ke bawah sebagai baris yang dapat digulir; label tab diringkas.
- Di bawah 720 px tabel worklist menjadi kartu — hanya kolom yang dipakai untuk memilih studi
  yang ditampilkan; regio, jumlah citra, dan accession disembunyikan agar kartu tetap pendek.
- Di atas 1700 px panel diberi ruang lebih lebar.
- Seluruh interaksi viewer memakai Pointer Events, sehingga tetikus, pena, dan sentuh berjalan
  lewat jalur yang sama, lengkap dengan cubit dua jari.

## Menjalankan secara lokal

```bash
node serve.js          # http://localhost:8080
node serve.js 3000     # port lain
```

Gunakan `serve.js`, **bukan** `python -m http.server`. Berkas `assets/js/firebase-init.js`
adalah ES module, dan `http.server` bawaan Python di Windows mengirimkannya sebagai
`text/plain` sehingga peramban menolak memuatnya.

## Menjalankan uji

```bash
node tests/node-runner.js       # 127 uji parser, volume, permukaan, model, kendali
node tests/asap-halaman.js      # 79 uji asap skrip halaman di tiruan DOM
node tests/periksa-contoh.js    # buka 20 berkas .dcm di contoh-dicom/
node tests/periksa-volume.js    # bangun volume dari data demo & berkas nyata, ukur waktunya
node tests/periksa-mesh.js      # rekonstruksi permukaan dari seri volumetrik
node tests/periksa-atlas.js     # muat atlas contoh, periksa normal & pemilihan organ
```

**Semuanya berjalan di Node — tidak ada peramban yang dipakai, tidak ada jaringan.**
Halaman uji di `/tests/` hanya kenyamanan tambahan; daftar ujinya sama persis.

`tests/asap-halaman.js` memuat berkas HTML sungguhan ke tiruan DOM (`tests/dom-tiruan.js`),
menjalankan setiap `<script>` apa adanya, lalu menekan tombol dan memicu pintasan seperti
pengguna: memilih semua alat, memasang setiap tata letak, membangun volume 3D, membuka MPR,
merekonstruksi permukaan, mengekspor STL/OBJ, menyimpan laporan, dan menjalankan panggung
prisma sampai keempat sisinya benar-benar tergambar. Yang tertangkap: galat inisialisasi,
`getElementById` yang mengembalikan `null`, dan pengendali yang melempar.

Tiruan DOM-nya sengaja tidak lengkap — cakupannya persis sebatas yang dipakai kode Medivox:
pohon elemen dari HTML asli, subset selector CSS yang benar-benar muncul, dan konteks canvas
2D yang **mencatat panggilan alih-alih menggambar**. Jadi yang **tidak** teruji tetap sama:
hasil gambar, tata letak, dan gaya CSS. Untuk itu perlu dilihat mata di peramban.

Uji yang sama bisa dijalankan di peramban: `node serve.js`, lalu buka
<http://localhost:8080/tests/>. Tidak ada dependensi dan tidak ada langkah pemasangan —
`tests/node-runner.js` hanya meniru `ImageData` lalu memuat `assets/js/dicom.js` apa adanya.

## Data contoh

Repo ini melacak 20 berkas `.dcm` kecil di `contoh-dicom/`. Semuanya **phantom
sintetis** — `ImageType` berisi `DERIVED\SECONDARY\PHANTOM`, pasiennya `CONTOH^PASIEN`.
Tidak ada data pasien sungguhan di repo ini, dan itu disengaja.

Dua perkakas menambah data tanpa membengkakkan repo. Keluarannya dikecualikan git:

```bash
node tools/buat-contoh.js            # 4 seri volumetrik, 64 irisan, ~18 MB
node tools/buat-contoh.js --besar    # 160–180 irisan, 320², ~120 MB
node tools/buat-contoh.js --daftar   # perkirakan ukurannya dulu

node tools/unduh-contoh.js           # 20 berkas nyata dari pydicom-data, ~2,3 MB
node tools/unduh-contoh.js --lengkap # tambah berkas besar
node tools/unduh-contoh.js --daftar

node tools/unduh-volume.js           # seri phantom 172 irisan dari TCIA, ~40 MB
node tools/unduh-volume.js --semua   # tambah CT pasien nyata, ~90 MB
node tools/unduh-volume.js --daftar  # lihat lisensi & ukurannya dulu
```

**`buat-contoh.js`** membuat CT kepala, CT toraks, CT angiografi, dan MRI otak sebagai
medan 3D — bukan gambar per irisan — sehingga bentuknya benar-benar menyambung antar
irisan. Itu syarat agar MPR dan isosurface menghasilkan sesuatu yang masuk akal. Berkas
lama hanya 6–8 irisan; terlalu tipis untuk 3D. UID dan pembangkit acaknya tetap, jadi
menjalankan ulang menghasilkan berkas yang identik.

**`unduh-contoh.js`** mengambil berkas nyata dari
[pydicom-data](https://github.com/pydicom/pydicom-data) (lisensi MIT, © 2020 Dicom in
Python) dan menuliskan atribusinya ke `contoh-dicom/unduhan/SUMBER.md`. Berkasnya dipilih
untuk **menekan parser dari dua sisi**: yang harus terbaca (deflate, PALETTE COLOR, RGB
planar, big endian, multi-frame, 1-bit Segmentation, sequence rusak) dan yang harus
ditolak dengan pesan jelas (JPEG 2000, JPEG-LS, RLE, JPEG Lossless, HTJ2K). Skripnya
memeriksa setiap berkas dengan parser sendiri lalu melaporkan yang tidak sesuai dugaan —
cara inilah yang menemukan bug sequence yang dijelaskan di bawah.

Berkas unduhan tidak dilacak git meski lisensinya mengizinkan, supaya repo ini tidak ikut
menjadi tempat redistribusi biner proyek lain.

### Seri volumetrik sungguhan dari TCIA

**`unduh-volume.js`** mengambil seri DICOM ratusan irisan dari
[The Cancer Imaging Archive](https://www.cancerimagingarchive.net) lewat REST API publik
NBIA — tanpa akun. Ini satu-satunya sumber besar yang sekaligus berisi volume sungguhan,
sudah de-identifikasi oleh penerbitnya, dan melampirkan lisensi yang jelas per koleksi.

| Seri | Isi | Lisensi | Hasil |
|---|---|---|---|
| `ct-phantom-toraks` | phantom QA, Siemens SOMATOM Definition Edge, 172 irisan | CC BY 4.0 | 34 rb segitiga |
| `ct-pankreas` | CT abdomen pasien, 186 irisan, irisan 1,0 mm | CC BY 3.0 | 66 rb segitiga |
| `ct-toraks-pasien` | CT toraks pasien, 60 irisan pada 512² penuh | CC BY 3.0 | 178 rb segitiga |

Bawaannya **hanya seri phantom** — objek uji, bukan manusia, jadi sejalan dengan proyek ini
yang seluruh datanya memang bukan pasien. Seri pasien baru terunduh bila Anda menambahkan
`--semua`; keduanya citra manusia sungguhan yang sudah de-identifikasi dan dipublikasikan
resmi, tetapi tetap data medis orang lain.

Lisensi dan DOI **tidak ditulis tangan** di skripnya — diambil dari API TCIA saat mengunduh
lalu dicatat ke `contoh-dicom/tcia/SUMBER.md`, sehingga atribusinya tidak bisa salah. CC BY
mewajibkan atribusi bila data disebarkan kembali.

Pembaca ZIP-nya ditulis sendiri (~40 baris di atas `zlib` bawaan Node) supaya tetap tanpa
dependensi. Setelah diekstraksi, setiap seri langsung diverifikasi: disusun jadi volume dan
diekstraksi permukaannya, jadi kalau ada yang tidak terbaca akan langsung kelihatan.

## Struktur

```
index.html              Halaman web (landing/marketing)
masuk.html              Halaman masuk / daftar / mode tamu
worklist.html           Halaman apps — antrian baca
viewer.html             Halaman apps — viewer & inspeksi citra
prisma.html             Halaman apps — proyeksi prisma hologram
serve.js                Server statis untuk pengembangan lokal

assets/css/base.css     Design token + komponen dasar
assets/css/site.css     Gaya halaman web
assets/css/auth.css     Gaya halaman masuk
assets/css/app.css      Gaya halaman apps (termasuk tata letak ponsel)
assets/css/prisma.css   Gaya halaman prisma hologram

assets/js/dicom.js      Parser DICOM Part-10 (ditulis dari nol)
assets/js/volume.js     Volume 3D: MPR, MIP, proyeksi ray-cast
assets/js/mesh.js       Rekonstruksi permukaan: isosurface + perender + STL/OBJ
assets/js/model.js      Pemuat OBJ/STL + adegan atlas anatomi (buffer ID)
assets/js/prisma.js     Panggung prisma hologram
assets/js/demo.js       Generator phantom sintetis untuk data demo
assets/js/firebase-init.js  Jembatan Firebase (satu-satunya ES module)
assets/js/auth.js       Sesi, penjaga halaman, menu pengguna
assets/js/idb.js        Penyimpanan berkas lokal (IndexedDB)
assets/js/common.js     Utilitas bersama (toast, storage, ikon)
assets/js/bantuan.js    Dialog pintasan papan ketik
assets/js/site.js       Script landing
assets/js/masuk.js      Script halaman masuk
assets/js/worklist.js   Script worklist
assets/js/viewer.js     Mesin viewer (render, alat, pengukuran)

tools/tulis-dicom.js    Penulis DICOM minimal (uji + pembuat contoh)
tools/buat-contoh.js    Pembuat seri volumetrik sintetis
tools/buat-atlas.js     Pembuat atlas anatomi contoh (OBJ, 13 organ)
tools/unduh-contoh.js   Pengunduh berkas uji parser (pydicom-data)
tools/unduh-volume.js   Pengunduh seri volumetrik sungguhan (TCIA)

tests/index.html        Penjalan uji di peramban
tests/node-runner.js    Penjalan uji tanpa peramban
tests/uji-dicom.js      Berkas uji parser
tests/uji-volume.js     Berkas uji volume 3D
tests/uji-mesh.js       Berkas uji rekonstruksi permukaan
tests/uji-model.js      Berkas uji pemuat OBJ/STL & adegan atlas
tests/dom-tiruan.js     Tiruan DOM & canvas untuk Node
tests/asap-halaman.js   Uji asap skrip halaman tanpa peramban
tests/periksa-contoh.js Pemeriksa berkas contoh-dicom/
tests/periksa-volume.js Pemeriksa volume dari data sungguhan
tests/periksa-mesh.js   Pemeriksa rekonstruksi dari seri volumetrik
tests/periksa-atlas.js  Pemeriksa atlas contoh (normal, ID, pisahkan)

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
| Deflated Explicit VR LE | ✅ lewat `DICOM.parseAsync()` |
| Sequence (SQ), panjang eksplisit & undefined | ✅ tanpa menimpa tag tingkat atas |
| Pixel data native 8/16 bit, signed & unsigned | ✅ |
| Multi-frame (`0028,0008`) | ✅ |
| MONOCHROME1 / MONOCHROME2 | ✅ |
| RGB interleaved & planar (`0028,0006`) | ✅ |
| PALETTE COLOR, LUT 8 & 16 bit | ✅ |
| Rescale slope, intercept & `RescaleType` | ✅ |
| Geometri irisan (`0020,0032` · `0020,0037` · `0020,1041` · `0018,0088`) | ✅ dipakai penyusun volume |
| Pixel data 1 bit terkemas (objek Segmentation) | ✅ |
| HTJ2K & Deflated Image Frame Compression | dikenali, ditandai perlu dekoder tambahan |
| Pixel data terenkapsulasi JPEG baseline | ✅ (didekode peramban) |
| JPEG 2000 / JPEG-LS / RLE | dikenali, ditandai perlu dekoder tambahan |

Sequence ditangani sesuai standar: sequence dan tiap item boleh berpanjang tetap maupun
tanpa panjang, dan keempat kombinasinya ditemui di berkas nyata. Ini pernah salah — parser
berhenti di Item Delimitation yang pertama padahal setiap item punya satu, sehingga sisa
berkas dibaca dari posisi yang keliru dan `Rows`/`Columns` tidak pernah ditemukan. Bug itu
tidak tertangkap uji sintetis (yang hanya menulis sequence berpanjang tetap) dan baru
muncul saat `tools/unduh-contoh.js` mencoba berkas sungguhan. Sekarang ada uji regresinya.

Diverifikasi lewat 20 uji round-trip di `tests/`: berkas DICOM Part-10 di-*encode* di memori,
diurai kembali, lalu nilai pikselnya dibandingkan satu per satu — pada ketiga transfer syntax
di atas, pada berkas tanpa preamble, pada multi-frame, dan pada berkas deflate. Uji juga
memeriksa pemetaan window/level, LUT palette, konfigurasi planar, dan bahwa transfer syntax
yang belum didukung benar-benar ditandai alih-alih dirender sebagai sampah.

`DICOM.parse()` bersifat sinkron. `DICOM.parseAsync()` sama saja kecuali ia lebih dulu
mengembangkan berkas *deflate* memakai `DecompressionStream` peramban, dan mengembalikan
dataset di atas buffer yang sudah utuh — buffer itulah yang disimpan ke IndexedDB, sehingga
sisa aplikasi tidak perlu tahu-menahu soal kompresi.

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

**Worklist** — tombol utamanya **Tampilkan Hologram**; *Viewer 2D* jadi jalur kedua, dan klik
ganda baris juga menuju hologram. Selebihnya: filter antrian
(belum dibaca / sedang dibaca / selesai / cito / berkas lokal),
filter modalitas, pencarian, pengurutan kolom, drag-and-drop berkas atau folder. Studi dari
berkas lokal memakai status baca yang sama dengan studi PACS, jadi ikut terhitung di setiap
filter. Status baca tersinkron ke akun bila masuk, dan selalu punya salinan lokal.

Berkas yang dibuka disimpan di IndexedDB agar viewer bisa membacanya kembali. Panel
**Cache berkas lokal** di sidebar menampilkan pemakaiannya dan menyediakan penghapusan per
studi maupun pembersihan menyeluruh — berkas asli di komputer tidak tersentuh.

**Viewer** — alat: Window/Level, geser, perbesar, gulir irisan, ukur panjang, ukur sudut,
ROI persegi & elips (rerata, simpangan baku, luas cm²), probe nilai piksel, anotasi teks.
Tata letak 1×1 / 1×2 / 2×2 / 1×3, cine playback, preset window yang menyesuaikan modalitas,
peta warna, inversi, rotasi, cermin horizontal & vertikal, sinkronisasi antar viewport,
inspektur tag DICOM, dan panel laporan.

Pengukuran melekat pada **seri**, bukan pada viewport: berpindah seri tidak menyeret anotasi
seri sebelumnya, dua viewport yang menampilkan seri yang sama menunjukkan anotasi yang sama,
dan daftarnya disimpan di peramban sehingga tidak hilang saat halaman dimuat ulang.

Menyimpan laporan sekaligus memperbarui antrian: status **Final** menandai studi *Selesai*,
status lain menandainya *Sedang dibaca*.

## Volume 3D — MPR, MIP, dan proyeksi

Tombol **Bangun 3D & MPR** di bawah panel seri menumpuk irisan menjadi satu volume, lalu
menambahkan tujuh **seri turunan** ke daftar seri:

| Seri turunan | Isi |
|---|---|
| MPR Koronal · MPR Sagital | potongan tipis, superior di atas |
| MIP Aksial · Koronal · Sagital | slab 20 mm yang meluncur sepanjang bidangnya |
| MIP 3D | ray-cast intensitas maksimum, 24 sudut |
| Volume 3D | ray-cast dengan opasitas (volume rendering), 24 sudut |

Rancangannya sengaja begitu: hasil olahan dibungkus dengan bentuk yang sama seperti seri
DICOM biasa, jadi **semua alat yang sudah ada langsung berlaku** — window/level, peta warna,
ukur panjang & sudut, ROI, probe, tata letak, pengukuran yang tersimpan, dan cine. Pada seri
3D, menggulir irisan berarti memutar volume, dan cine memutarnya otomatis.

Urutan irisan diambil dari `ImagePositionPatient` diproyeksikan ke normal bidang citra, lalu
`SliceLocation`, lalu `InstanceNumber`. Jarak antar irisan memakai median selisih posisi —
lebih tahan terhadap satu-dua irisan yang hilang daripada `SpacingBetweenSlices`. Nilai voxel
disimpan sudah ter-*rescale* (HU untuk CT) sebagai `Int16Array`; volume di atas 40 juta voxel
dikecilkan di bidang irisan, bukan pada arah z, karena resolusi z-lah yang menentukan mutu MPR.

MPR koronal dan sagital hampir selalu punya piksel tidak bujur sangkar — misalnya 0,86 mm
mendatar berbanding 5 mm menegak. Viewer mengoreksinya di `Viewport.aspek()`, sehingga
proporsinya benar dalam milimeter dan pengukuran tetap jatuh di tempat yang tepat.

## Rekonstruksi permukaan 3D

Setelah volume tersusun, kotak di bawah panel seri menyediakan **rekonstruksi permukaan**:
volume diubah menjadi jaring segitiga pada satu nilai ambang — 300 HU memisahkan tulang
kortikal dari jaringan lunak pada hampir semua CT. Hasilnya masuk sebagai seri turunan
"Permukaan 3D" yang bisa diputar dengan gulir irisan atau cine, dan bisa diunduh sebagai
**STL** atau **OBJ** dalam satuan milimeter.

Dua pilihan rancangan yang perlu diketahui:

**Marching tetrahedra, bukan marching cubes.** Setiap kubus dipecah menjadi 6 tetrahedron,
dan satu tetrahedron hanya punya 16 kemungkinan yang tabelnya beberapa baris — bukan tabel
256 kasus berisi ribuan angka tanpa makna yang bisa dibaca. Permukaannya juga selalu
tertutup dan tidak punya kasus ambigu. Bayarannya jumlah segitiga sekitar dua kali lebih
banyak; itu diimbangi parameter langkah yang dipilih otomatis agar jumlah sel tetap di
bawah 1,2 juta. Arah putaran setiap segitiga ditentukan dari gradien volume, bukan dari
tabel — jadi tabelnya tidak bisa salah arah.

**Rasterisasi CPU, bukan WebGL.** Perendernya z-buffer perangkat lunak dengan normal
diinterpolasi per piksel, lampu kepala, sorot spekular, dan penguatan tepi. Alasannya:
keluarannya berupa objek `img` yang sama dengan `DICOM.readPixels()`, jadi masuk ke viewer
dan panggung prisma lewat jalur yang sudah ada — **dan bisa diuji tanpa peramban**. Uji
`tests/uji-mesh.js` memakai bola dengan radius diketahui: titik jaringnya harus berjarak
tepat radius itu dari pusat, luasnya harus mendekati 4πr², normalnya harus radial keluar,
dan lebarnya di layar harus 2r.

Ukuran nyata pada phantom sintetis 192×192×64: 38 ribu segitiga untuk angiografi, 129 ribu
untuk kepala, 209 ribu untuk MRI otak; ekstraksi 110–300 ms, render 75–370 ms per sudut
pada 256². Pada CT toraks sungguhan dari TCIA (512×512×60, irisan 2,5 mm): 178 ribu segitiga
pada 300 HU — kosta dan vertebra terbaca jelas.

## Panggung hologram prisma — halaman utama

`prisma.html` menyiapkan tampilan untuk **piramida atau prisma akrilik** yang diletakkan di
atas layar — efek *Pepper's ghost*. Empat pandangan volume disusun mengelilingi satu titik
pusat, masing-masing dengan tepi atas menghadap ke tengah, sehingga pantulan pada keempat
bidang prisma bertemu sebagai satu citra yang tampak mengambang.

Halaman ini **berdiri sendiri**: di panelnya ada pemilih studi yang menyatukan phantom demo,
berkas lokal yang tersimpan di IndexedDB, dan berkas yang baru dibuka lewat tombol
**Buka berkas DICOM…** — jadi tidak perlu lewat worklist lebih dulu. Seri yang irisannya di
bawah empat ditandai *terlalu tipis* dan tidak bisa dipilih.

Karena keempat sisi selalu berjarak tepat 90°, satu set N sudut yang tersebar rata pada 360°
sudah cukup untuk semuanya: tiap sisi hanya membaca indeks yang bergeser N/4. Sudut-sudut itu
di-*prarender* sekali — ray-cast di CPU berat, 24 sudut pada 256² butuh 1–4 detik — lalu
animasinya cuma memutar-ulang bingkai yang sudah ada, jadi putarannya mulus di 60 fps.

Yang bisa disetel: mode (MIP / volume / rerata / **permukaan** / **atlas**), peta warna, window/level,
kepadatan dan gamma untuk mode volume, ambang untuk mode permukaan, elevasi, jumlah sudut,
resolusi, rapat sinar, lalu ukuran sisi, jarak ke pusat, kecepatan, cermin, dan arah putar
untuk menyesuaikan dengan prisma yang Anda punya.
Penyetelan window/level pada mode MIP dan rerata berlaku seketika; pada mode volume ia bagian
dari *transfer function* sehingga perlu render ulang — tombolnya berkedip saat itu terjadi.

Cara pakai: letakkan puncak prisma di penanda tengah layar, matikan lampu ruangan, dan pakai
layar mendatar (tablet atau monitor direbahkan). Nyalakan **Cermin** bila citranya terbaca
terbalik — arah pantulan berbeda antar model prisma.

## Atlas anatomi

Mode **Atlas** di panggung hologram menampilkan model organ dari berkas **OBJ atau STL**,
tanpa DICOM sama sekali. Ini satu-satunya mode yang jalan tanpa volume.

`assets/js/model.js` melengkapi arah yang selama ini hanya satu jalan: `mesh.js` sudah bisa
mengekspor STL/OBJ, sekarang keduanya juga bisa **dibaca masuk**.

- **OBJ** — indeks negatif (relatif), poligon dipecah jadi segitiga secara kipas, `vn`
  dipakai bila ada dan dihitung dari geometri bila tidak. Penanda `o`/`g` memisahkan organ
  menjadi bagian tersendiri; `usemtl` dipakai sebagai gantinya bila keduanya tidak ada.
- **STL** biner dan teks. Biner dikenali dari panjang berkas (`84 + n × 50`), **bukan** dari
  kata `solid` — 80 byte judul STL biner boleh saja diawali kata itu. Karena STL tidak punya
  titik bersama, titiknya **dilas** berdasarkan posisi (dibulatkan ke mikrometer) lalu normal
  per titik dihitung ulang; tanpa itu permukaannya berfaset dan memorinya tiga kali lipat.
- **glTF/GLB ditolak dengan sengaja.** Berkas glTF modern memakai
  `EXT_meshopt_compression` dan `KHR_mesh_quantization` yang butuh dekoder WASM. Itu
  melanggar aturan tanpa dependensi, jadi pesannya menyarankan konversi ke OBJ/STL.

`MODEL.Adegan` menggambar banyak bagian dengan **satu z-buffer bersama** plus **satu buffer
ID per piksel**. Buffer ID itu yang membuat pemilihan organ tidak perlu ray-casting: klik di
panggung dibalikkan melalui transformasi sisi prisma yang sama, lalu ID-nya dibaca langsung.
Bagian yang sedang dipudarkan (alfa < 0,5) tidak menulis ID, jadi klik tidak menangkap organ
yang sengaja disamarkan.

Bagian buram digambar lebih dulu sambil menulis z; bagian tembus cahaya menyusul, diurutkan
dari jauh ke dekat dan hanya **menguji** z tanpa menulisnya — tanpa itu dua lapisan
transparan saling menghapus tergantung urutan gambar.

Yang bisa dilakukan: menyalakan/mematikan organ satu per satu, menyorot satu organ (yang
lain jadi tembus cahaya, bukan hilang, supaya letaknya di dalam tubuh tetap terbaca),
memisahkan seluruh organ dari pusat tubuh, dan memilih organ dengan **klik pada panggung**
atau **suara**: sebut nama organ, atau ucapkan *pisahkan*, *satukan*, *tampilkan semua*.

Buffer ID disimpan **per sudut** karena yang tampil di panggung adalah bingkai prarender,
bukan hasil render saat itu. Ongkosnya sekitar 6 MB untuk 24 sudut pada 256² — jauh lebih
murah daripada merender ulang setiap kali diklik.

### Atlas contoh

```bash
node tools/buat-atlas.js        # → contoh-dicom/atlas/atlas-contoh.obj (13 organ)
node tests/periksa-atlas.js     # muat, periksa arah normal & pemilihan organ
```

**Bentuknya bukan anatomi sungguhan** — elipsoid berlekuk dengan letak kasar, dibangkitkan
dari rumus di `tools/buat-atlas.js` supaya fitur atlas bisa diuji tanpa bergantung pada
unduhan pihak ketiga dan tanpa pertanyaan lisensi. Jangan dipakai untuk klinis maupun
pendidikan. Keluarannya dikecualikan git karena deterministik.

### Model anatomi sungguhan

Medivox memuat OBJ/STL apa pun, jadi model sungguhan tinggal dimuat. Dua sumber berlisensi
terbuka:

| Sumber | Lisensi | Catatan |
|---|---|---|
| [BodyParts3D / Anatomography](https://lifesciencedb.jp/bp3d/) | CC BY-SA 2.1 Japan | Dari data pencitraan sungguhan; per organ; ada [cermin STL di GitHub](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) |
| [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) | CC BY-SA 4.0 | Turunan BodyParts3D yang lebih rapi, berbasis Blender |

Keduanya menuntut **atribusi** dan bersifat *share-alike*. Kredit yang diminta BodyParts3D:

> BodyParts3D, © The Database Center for Life Science licensed under
> CC Attribution-Share Alike 2.1 Japan

Share-alike itu mengikat modelnya, bukan kode Medivox yang berlisensi MIT. Model tidak
disertakan di repo ini — muat sendiri, dan sertakan atribusinya bila Anda
mendistribusikannya kembali.

**Hati-hati pada model 3D anatomi tanpa keterangan asal.** Banyak yang kini dihasilkan
generator 3D-dari-teks (Tripo, Meshy, dan sejenisnya) dari prompt seperti *"anatomical heart
3d model"*. Bentuknya meyakinkan tapi tidak divalidasi siapa pun, dan pada sistem pencitraan
medis itu berbahaya: orang bisa membacanya sebagai rujukan anatomi. Periksa metadata `.glb`
(`asset.generator`, nama node) sebelum memakainya.

### Pintasan papan ketik

Tekan `?` di halaman worklist atau viewer untuk membuka daftar lengkapnya.

| Tombol | Fungsi | | Tombol | Fungsi |
|---|---|---|---|---|
| `W` | Window/Level | | `I` | Inversi |
| `P` | Geser | | `V` | Cermin vertikal |
| `Z` | Perbesar | | `F` | Pas ke layar |
| `S` | Gulir irisan | | `0` | Reset tampilan |
| `L` | Ukur panjang | | `H` | Sembunyikan overlay |
| `A` | Ukur sudut | | `←` `→` | Irisan sebelumnya/berikutnya |
| `R` `E` | ROI persegi / elips | | `Spasi` | Putar/jeda cine |
| `D` | Probe piksel | | `1` `2` `3` `4` | 1×1 · 1×2 · 1×3 · 2×2 |
| `T` | Anotasi teks | | `Esc` | Batalkan / tutup laci |

Di halaman prisma: `Spasi` putar/jeda, `←` `→` geser satu sudut, `F` layar penuh,
`P` sembunyikan panel, dan seret di panggung untuk memutar manual.

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

## Video promo & tutorial

```bash
node serve.js 8123                  # di terminal lain
node tools/buat-atlas.js            # supaya adegan atlas punya model
node video/render-adegan.js         # klip dari data TCIA → video/potongan/
node video/tangkap.js 8123          # 12 tangkapan halaman → video/tangkapan/
node video/tangkap.js 8123 atlas    # ulangi sebagian saja
node video/susun.js                 # → video/kaca-promo.mp4 & kaca-tutorial.mp4
```

Hasilnya dua berkas 1920×1080 30 fps: **promo ±44 detik** dan **tutorial ±63 detik**.

Bahannya dari dua sumber, keduanya bukan rekaman layar:

- **`render-adegan.js`** merender klip **langsung di Node** — RGB mentah dialirkan ke stdin
  ffmpeg, memakai `volume.js` dan `mesh.js` apa adanya pada seri CT TCIA sungguhan. Jadi yang
  terlihat benar-benar keluaran mesinnya, dan tidak perlu encoder PNG.
- **`tangkap.js`** menangkap halaman sungguhan lewat **Microsoft Edge headless** (bukan
  Chrome — peramban kerja pemilik proyek tidak disentuh). Keadaan yang butuh interaksi
  memakai pembungkus di `video/adegan/*.html` yang menekan tombol asli di dalam iframe;
  `prisma-atlas.html` bahkan mengambil OBJ lewat `fetch` lalu memasangnya ke
  `<input type="file">` sungguhan melalui `DataTransfer`. Tidak ada tampilan yang dikarang.

`susun.js` menyusun tiap ruas jadi mp4 tersendiri lalu menyambungnya dengan concat demuxer.
Sengaja begitu: satu `filter_complex` untuk 13 ruas tidak bisa ditelusuri kalau ada yang
salah. Peralihannya fade per ruas, bukan `xfade`, karena `xfade` menuntut semua ruas masuk
satu graf sekaligus.

Dua jebakan ffmpeg yang sudah dibereskan, jangan diulang:

- **Jalur Windows mutlak tidak bisa dipakai di dalam string filter.** `C:/x` diurai dua kali
  — oleh pengurai filtergraph lalu oleh pengurai opsi filter — sehingga titik duanya tetap
  jadi pemisah opsi betapa pun di-escape. Jalan keluarnya bukan menambah backslash tetapi
  menghilangkan titik duanya: ffmpeg dijalankan dengan `cwd` di folder kerja dan di dalam
  filter hanya ada nama berkas polos. Font ikut disalin ke situ.
- **Teks selalu lewat `textfile=`**, tidak pernah ditanam di string filter. Titik dua, koma,
  dan apostrof dalam kalimat Indonesia akan mengacaukan penguraiannya.

Tidak ada musik: tidak ada trek yang lisensinya jelas. Jalur audio senyap tetap ditambahkan
karena beberapa pemutar dan pengimpor (termasuk CapCut) memperlakukan berkas tanpa audio
secara aneh.

**CapCut CLI tidak dipakai untuk merender.** `capcut` v0.17.2 hanya menulis *draft* CapCut,
bukan video — perenderan tetap ffmpeg. Draft-nya berguna kalau ingin menyunting lanjut
secara manual, bukan sebagai bagian pipeline.

Seluruh isi `video/` dikecualikan dari deploy dan dari git kecuali skripnya: tangkapan, klip,
dan video akhirnya bisa dibuat ulang kapan saja.

## Catatan

Ini prototipe antarmuka, **bukan perangkat medis**. Seluruh data pasien fiktif dan citra
merupakan phantom sintetis. Jangan gunakan untuk pengambilan keputusan klinis.
