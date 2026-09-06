# Memori Proyek — Kaca

Catatan tetap tentang proyek ini: apa isinya, aturan tak tertulisnya, apa yang sudah
dikerjakan, dan apa yang masih tersisa. Dibaca lebih dulu sebelum mengubah kode.

## Ringkas

**Kaca** — **viewer hologram prisma** untuk citra DICOM. Live di <https://kaca-id.web.app>
(Firebase project `kaca-id`, Firestore region `asia-southeast2`).

**INTI SISTEM ADALAH PANGGUNG HOLOGRAM PRISMA (`prisma.html`).** Ini ditegaskan sendiri oleh
pemilik proyek. Worklist, viewer 2D, MPR, MIP, pengukuran, dan pelaporan kedudukannya
**pendukung** — jangan pernah menaikkannya jadi titik masuk utama lagi. Hierarki yang berlaku:

- tab di semua halaman apps: **Hologram** → Viewer 2D → Studi
- tombol utama worklist: **Tampilkan Hologram**; klik ganda baris juga ke hologram
- tujuan bawaan setelah masuk (`masuk.js` → `BAWAAN`): `prisma.html`
- rewrite Firebase: `/app` dan `/hologram` → `prisma.html`
- landing page memimpin dengan hologram; hero-nya merender susunan empat sisi sungguhan

Rancangan yang benar-benar diberikan pemilik hanya dua kalimat: hologram prisma memakai media
kaca prisma dengan pantulan cahaya, dan itulah yang utama. Tidak ada mockup atau spesifikasi
tata letak. Jangan mengaku "sesuai rancangan" untuk hal di luar dua kalimat itu.

HTML + CSS + JavaScript native. **Tanpa framework, tanpa bundler, tanpa langkah build,
tanpa `package.json`, tanpa `node_modules`.** Satu-satunya dependensi eksternal adalah SDK
Firebase dari CDN. Ini disengaja — jangan menambahkan toolchain tanpa diminta.

Lima halaman: `prisma.html` (**utama** — panggung hologram), `viewer.html` (2D + pembangun
volume), `worklist.html` (daftar studi), `masuk.html` (auth), `index.html` (landing).

`prisma.html` **berdiri sendiri**: `katalogDemo()` + `katalogLokal()` menyusun katalog studi,
`isiPemilih()` mengisi dua `<select>`, `muatTerpilih()` menyusun volume dan memprarender,
`bukaBerkas()` menerima berkas DICOM langsung di halaman itu. Parameter URL `?demo=`/`?local=`
`&seri=` tetap dihormati bila datang dari worklist atau viewer.

## Aturan tak tertulis yang harus diikuti

1. **Satu berkas JS = satu IIFE = satu global.** `KACA` (dialias `K`), `DICOM`, `VOLUME`,
   `MESH`, `DEMO`, `KDB`, `KAUTH`, `KACA_BANTUAN`. Gaya ES5 (`var`, `function`), bukan ES6+ —
   kecuali `assets/js/firebase-init.js`, satu-satunya ES module, yang memakai `KFB`.
   Skrip di `tools/` dan `tests/` berjalan di Node, jadi di sana ES6+ boleh.
2. **Bahasa Indonesia** untuk komentar, nama fungsi/variabel internal, pesan UI, dan commit.
   Nama tag/atribut DICOM tetap dalam istilah aslinya.
3. **Piksel DICOM tidak pernah keluar dari peramban.** Firestore hanya menyimpan teks:
   status baca dan isi laporan. Jangan pernah mengunggah `buf`, `pixels`, atau canvas.
4. **Halaman harus tampil sebelum jaringan siap.** `KAUTH.jaga()` punya batas waktu 4 detik
   dan mode tamu tidak menunggu Firebase sama sekali. Worklist dan viewer merender dari data
   lokal dulu, baru menyusul sinkronisasi.
5. **Interaksi viewer memakai Pointer Events saja** — satu jalur untuk tetikus, pena, sentuh.
6. **`assets/css/base.css`** memegang design token (`:root`) dan primitif bersama;
   `site.css`/`auth.css`/`app.css` khusus per halaman.
7. **Jalankan lewat `node serve.js`**, bukan `python -m http.server` (ES module dikirim
   sebagai `text/plain` oleh http.server di Windows).
8. **Jangan pakai peramban pengguna untuk menguji.** Seluruh pengujian harus jalan di Node.
   `tests/dom-tiruan.js` menyediakan tiruan DOM + canvas; `tests/asap-halaman.js` memakainya
   untuk menjalankan skrip halaman sungguhan. Kalau menambah global peramban baru
   (`IntersectionObserver`, `ResizeObserver`, dan sejenisnya), tambahkan juga ke tiruannya —
   kalau tidak, uji asap akan gagal dengan pesan "… is not defined", dan itu justru
   pertanda tiruan yang perlu dilengkapi, bukan kode aplikasi yang salah.

## Menjalankan & menguji

```bash
node serve.js                   # http://localhost:8080
node tests/node-runner.js       # 66 uji parser/volume/permukaan, exit 1 bila gagal
node tests/periksa-contoh.js    # buka 20 berkas .dcm sungguhan
node tests/periksa-volume.js    # bangun volume dari demo & berkas nyata + ukur waktu
node tests/periksa-mesh.js      # rekonstruksi permukaan (perlu tools/buat-contoh.js dulu)

node tests/asap-halaman.js      # 57 uji asap skrip halaman di tiruan DOM

node tools/buat-contoh.js       # 4 seri volumetrik 64 irisan → contoh-dicom/volume/
node tools/unduh-contoh.js      # 20 berkas uji parser → contoh-dicom/unduhan/
node tools/unduh-volume.js      # seri volumetrik TCIA → contoh-dicom/tcia/
```

Seluruh keluaran `tools/` **dikecualikan git** (lihat `.gitignore`). `buat-contoh.js`
deterministik — UID dan pembangkit acaknya tetap, jadi hasilnya identik tiap kali.

**Sumber data volumetrik sungguhan: TCIA.** REST API NBIA
(`services.cancerimagingarchive.net/nbia-api/services/v1/`) bisa dipakai **tanpa akun**:
`getCollectionValues`, `getSeries?Collection=`, `getSeriesMetaData?SeriesInstanceUID=`,
`getImage?SeriesInstanceUID=` (mengembalikan ZIP). Lisensi ada **per seri** di field
`License Name` / `License URL`, dan DOI koleksi di `Data Description URI` — jadi jangan
pernah menulis lisensi secara manual, ambil dari API. Endpoint `getCollectionDescriptions`
dan `v2/getLicenses` mengembalikan HTTP 500; yang jalan adalah `getLicenses` tanpa versi.
Perhatikan `getSeries` memakai nama field rapat (`ImageCount`, `LicenseName`) sementara
`getSeriesMetaData` memakai nama berspasi (`Number of Images`, `License Name`).

Uji yang sama juga jalan di peramban di `/tests/`. `tests/node-runner.js` memuat
`assets/js/dicom.js` dan `assets/js/volume.js` apa adanya di dalam `vm` dan hanya meniru
`ImageData`.

`tests/tulis-dicom.js` adalah penulis DICOM minimal — hanya untuk uji, bukan bagian aplikasi.
Uji baru ditambahkan lewat `it(...)` di `tests/uji-dicom.js` atau `tests/uji-volume.js`;
keduanya menumpuk ke daftar yang sama (`window.UJI.daftar`), jadi urutan pemuatan berkas
uji tidak boleh dibalik.

**Cakupan `tests/dom-tiruan.js`.** Bukan DOM lengkap dan tidak berusaha jadi itu. Yang ada:
pohon dari HTML asli (pemindai sendiri, menangani void element & `<svg>` bersarang), subset
selector (`#id`, `.kelas`, `tag`, `[atr]`, `[atr="v"]`, `:not()`, keturunan, koma),
`innerHTML` yang **memindai ulang** sehingga `querySelectorAll` sesudahnya menemukan anak
baru, `classList`/`dataset` lewat Proxy, perambatan peristiwa dengan `closest`, dan konteks
canvas 2D yang **mencatat panggilan** (`ctx._catatan.perNama`) alih-alih menggambar —
itulah cara uji memastikan keempat sisi prisma benar tergambar per bingkai.
`indexedDB` sengaja dibiarkan `undefined` supaya jalur "IndexedDB tidak tersedia" di
`idb.js` ikut teruji. Modul ES (`firebase-init.js`) dilewati; mode tamu disetel lewat
`localStorage['kaca.sesi.tamu']='true'` supaya `KAUTH.jaga()` selesai seketika.

**Pelajaran dari sesi 3D:** tiga uji proyeksi awalnya "gagal" karena metode ujinya keliru,
bukan kodenya. Yang perlu diingat: (a) satu voxel menutupi beberapa piksel layar, jadi
bandingkan **titik berat** semua piksel maksimum, bukan argmax pertama; (b) `proyeksi()`
menjepit ukuran layar minimum ke 32 px; (c) peta warna `hot` menghasilkan putih di
intensitas puncak, jadi uji warna butuh objek bergradasi.

## Bentuk data

```
localStorage (prefiks "kaca.")
  wl.filter, wl.mods, wl.status      filter & status baca worklist
  vw.layout                          tata letak viewer terakhir
  vw.meas.<studyId>                  pengukuran, dikunci per seri
  report.<studyId>                   salinan lokal laporan
  sesi.tamu                          penanda mode tamu

IndexedDB "kaca-dicom" / store "instances", indeks studyUID
  { id, studyUID, seriesUID, instance, ..., buf: ArrayBuffer }

Firestore
  users/{uid}/worklist/{studyId}   { studyId, status, updatedAt }
  users/{uid}/reports/{studyId}    { studyId, clinical, findings, impression,
                                     status, by, patient, updatedAt }
```

**Kunci studi berbeda antara dua tempat, dan itu disengaja:** status baca dikunci dengan
`worklistKey()` (`local:<studyUID>` untuk berkas lokal, id apa adanya untuk studi demo)
sementara laporan dikunci dengan `studyId()` (id tanpa `/` dan `\`). Kalau salah satu diubah,
ubah pasangannya di `assets/js/viewer.js` dan `assets/js/worklist.js` sekaligus, jika tidak
status laporan tidak akan pernah muncul di antrian.

`firestore.rules` membatasi field yang boleh ditulis. Menambah field ke dokumen worklist
atau laporan **harus** diikuti perubahan `hasOnly([...])` di sana.

## Yang sudah dikerjakan (sesi 7 Sep 2026)

Semua berangkat dari audit gap terhadap kode yang sudah ada.

**Viewer (`assets/js/viewer.js`)**
- Pengukuran kini melekat pada **seri**, bukan viewport. `measStore` per studi, `measFor()`
  membagikan satu array ke setiap viewport yang membuka seri itu, `simpanMeas()` menulis ke
  localStorage di setiap titik perubahan. Sebelumnya anotasi terbawa saat berpindah seri dan
  hilang saat halaman dimuat ulang. Catatan: `clearMeas()` mengosongkan dengan
  `vp.meas.length = 0`, **bukan** `vp.meas = []`, supaya tautan bersama tidak terputus.
- `unitOf(img)` membaca `img.rescaleType` lalu `img.modality` (dulu selalu memakai modalitas
  studi, sehingga studi lokal campuran salah satuan).
- Tombol cermin vertikal `#btnFlipV` + pintasan `V` — `flipV` sudah lengkap di kode tetapi
  tidak punya kontrol apa pun.
- Cine menghormati "sinkron antar viewport".
- Menyimpan laporan memperbarui status antrian: Final → *Selesai*, lainnya → *Sedang dibaca*.

**Worklist (`assets/js/worklist.js`)**
- Drag-drop folder: `readEntries()` dipanggil berulang sampai batch kosong. Sebelumnya
  dipanggil sekali sehingga folder besar terpotong di ~100 berkas tanpa peringatan, dan
  penyelesaiannya bergantung pada `setTimeout(…, 60)`.
- Studi lokal memakai status baca biasa (`Belum dibaca`), jadi ikut terhitung di filter.
- Panah pengurutan ditampilkan sejak awal; kolom cito tidak lagi menimpa urutan pilihan.
- Panel **Cache berkas lokal**: `KDB.usage()`, `KDB.deleteStudy()`, dan `KDB.clear()`
  akhirnya punya jalan dari UI. Sebelumnya `ArrayBuffer` menumpuk di IndexedDB tanpa batas.

**Parser (`assets/js/dicom.js`)**
- `DICOM.parseAsync()` membuka Deflated Explicit VR LE lewat `DecompressionStream`.
  Buffer hasilnya yang disimpan ke IndexedDB, jadi `buildLocalStudy()` tetap boleh memakai
  `parse()` yang sinkron. Dulu transfer syntax ini dikenali tetapi diurai jadi sampah.
- PALETTE COLOR benar-benar dirender (LUT 8 & 16 bit); jatuh ke grayscale bila LUT tidak
  lengkap. `PlanarConfiguration` dibaca dan dipakai `toImageData()`.
- Entri `SQ` ditambahkan ke kamus supaya sequence Implicit VR tidak dibaca sebagai elemen
  tingkat atas, dan tag di dalam sequence tidak lagi menimpa tag tingkat atas.
- Jalur cepat 16 bit untuk data little endian yang sudah rata 2 byte.

**Baru**
- `assets/js/bantuan.js` — dialog pintasan (`?` atau menu pengguna). `auth.js` sudah
  memanggil `window.KACA_BANTUAN()` sejak lama tetapi fungsinya tidak pernah ada.
- `tests/` — 20 uji round-trip, penjalan peramban + Node, pemeriksa berkas contoh.
  README sebelumnya mengklaim uji ini ada padahal tidak.

## Volume 3D & prisma hologram (sesi lanjutan 7 Sep 2026)

Permintaan aslinya "proyeksi prisma" ternyata berarti **piramida hologram** (Pepper's ghost),
bukan istilah radiologi. Yang dibangun: MPR, MIP, volume rendering, dan panggung prisma.

**`assets/js/volume.js`** (baru) — tidak menyentuh DOM sama sekali, jadi bisa diuji headless.
- `VOLUME.bangun(series)` → `Volume`. Irisan dimuat **berurutan**, bukan paralel: untuk berkas
  lokal setiap `getImage()` mengurai berkas baru.
- Urutan irisan: `ImagePositionPatient` diproyeksikan ke normal (`ImageOrientationPatient`),
  lalu `SliceLocation`, lalu `InstanceNumber`. Jarak z = **median** selisih posisi (tahan
  terhadap irisan yang hilang), fallback `SpacingBetweenSlices` → `SliceThickness`.
- Voxel = `Int16Array` berisi nilai yang **sudah** direscale, jadi `slope`/`intercept` pada
  img turunan selalu 1/0. Di atas 40 juta voxel dikecilkan di bidang irisan saja — **jangan**
  kecilkan arah z, itu yang menentukan mutu MPR.
- `irisan()` / `slab(bidang, dari, sampai, mode)` dengan mode `maks`/`min`/`rerata`/`tengah`.
  Koronal & sagital **membalik z** supaya superior di atas.
- `proyeksi({azimut, elevasi, mode, ukuran, mutu, ...})` ray-cast di ruang voxel, dengan
  pemotongan kotak (slab method) agar ruang kosong tidak ditelusuri. Kamera: `d` = arah
  pandang, `kanan = cross((0,0,1), d)`, `atas = cross(d, kanan)`. Azimut 0 = koronal dari
  depan, kiri pasien di kanan gambar. Mode `komposit` mengembalikan RGB 8 bit; lainnya Int16.
- **Kunci rancangan:** semua keluaran berbentuk objek `img` yang sama dengan
  `DICOM.readPixels()`, dan `seriMPR()`/`seriMIP()`/`seriProyeksi()` membungkusnya sebagai
  "series" bebek-tipe yang sama dengan seri DICOM. Akibatnya viewer tidak butuh jalur render
  baru sama sekali — alat ukur, W/L, cine, tata letak, dan pengukuran tersimpan langsung
  berlaku. Kalau nanti menambah bentukan baru, ikuti pola ini.

**Viewer** — tombol `#btnBangun3D` di kotak `.vol-box` bawah panel seri menambahkan 7 seri
turunan (`derived: true`, `key` sendiri seperti `MPR#coronal`). `mountStudy()` kini hanya
memberi `key` bila belum ada, supaya kunci seri turunan tidak tertimpa.

**Perbaikan yang tersingkap gara-gara MPR** (dua bug lama yang tidak terlihat selama semua
citra berpiksel bujur sangkar):
- `Viewport.aspek()` = `pixelSpacing[0] / pixelSpacing[1]`, dipakai `base()`, `blit()`,
  `toScreen()`, dan `toImage()`. Tanpa ini MPR koronal (0,86 mm × 5 mm) tampil gepeng 6× dan
  pengukuran jatuh di tempat yang salah.
- Bilah skala memakai `pixelSpacing[1]` (jarak antar kolom), bukan `[0]` — bilahnya mendatar.

**`prisma.html` + `assets/js/prisma.js` + `assets/css/prisma.css`** — empat sisi N/E/S/W
dengan tepi atas menghadap pusat (rotasi 0 / +90° / 180° / −90°). Karena sisi berjarak tepat
90°, satu set N sudut cukup: tiap sisi membaca indeks bergeser N/4, dan N selalu dibulatkan
ke kelipatan 4. Sudut di-prarender sekali (24 sudut 256² ≈ 1–4 detik) lalu diputar-ulang, jadi
animasinya 60 fps. Objek `img` hasil ray-cast disimpan (bukan hanya canvas) supaya W/L pada
mode MIP/rerata bisa diterapkan ulang tanpa ray-cast; mode komposit memakai W/L sebagai
transfer function sehingga wajib render ulang — tombol `#btnRender` diberi kelas `.perlu`
untuk menandainya.

## Rekonstruksi permukaan & data contoh (sesi lanjutan 7 Sep 2026)

**`assets/js/mesh.js`** (baru) — bebas DOM, bisa diuji headless.
- `MESH.dari(vol, {ambang, langkah})` → `Mesh`. **Marching TETRAHEDRA**, bukan marching
  cubes: 6 tet per kubus, 16 kasus per tet, tabelnya beberapa baris — bukan 256 kasus
  berisi ribuan angka tanpa makna. Selalu tertutup, tanpa kasus ambigu.
- **Arah putaran segitiga ditentukan dari gradien volume, bukan dari tabel.** Jadi tabel
  kasus tidak bisa salah arah. Normal = −gradien (gradien menunjuk ke dalam benda).
- Titik rusuk dibagi bersama lewat `Map`. **Kunci rusuk memakai `nx*ny*nz` sebagai pengali,
  bukan 2^32** — dengan 2^32 kunci melewati 2^53 dan dua rusuk berbeda bisa dianggap sama.
- `langkah` dipilih otomatis agar sel ≤ 1,2 juta; ada juga batas 1,6 juta segitiga.
- `Mesh.render()` = rasterisasi z-buffer perangkat lunak, normal diinterpolasi per piksel,
  lampu kepala + spekular + penguatan tepi. **Sengaja bukan WebGL** supaya keluarannya
  objek `img` biasa (masuk viewer & prisma lewat jalur yang ada) dan bisa diuji di Node.
- `Mesh.stl()` (biner) dan `Mesh.obj()`, satuan milimeter. `seriPermukaan()` mengikuti pola
  pembungkus seri yang sama dengan volume.js.
- Kamera memakai kesepakatan yang sama dengan `VOLUME.proyeksi()` — jangan sampai berbeda.

**Perkakas data** (`tools/`) — `tulis-dicom.js` dipindah dari `tests/` karena kini dipakai
dua pihak; `buat-contoh.js` membuat 4 seri volumetrik dari **medan 3D** (bukan gambar per
irisan, supaya bentuknya menyambung antar irisan); `unduh-contoh.js` mengambil 20 berkas
nyata dari pydicom-data (MIT) dan memverifikasinya dengan parser sendiri;
`unduh-volume.js` mengambil seri ratusan irisan dari TCIA, memuat pembaca ZIP sendiri
(~40 baris di atas `zlib` bawaan Node, metode 0 & 8, EOCD dicari dari belakang), lalu
memverifikasi tiap seri dengan menyusun volume dan mengekstraksi permukaannya.

**Bawaan `unduh-volume.js` hanya mengunduh seri PHANTOM.** Seri pasien nyata (Pancreas-CT,
TCGA-LUAD) baru terunduh dengan `--semua`. Ini bukan kehati-hatian berlebihan: repo ini
sengaja tidak memuat data pasien, jadi jangan ubah bawaannya tanpa diminta.

Penulis DICOM diperbaiki: `[].concat(typedArray)` **tidak** membentangkan isinya (jadi
`keDaftar()`), dan elemen kini diurutkan menaik menurut tag sebelum ditulis.

**Dua bug parser yang ditemukan berkas sungguhan — bukan uji sintetis:**
1. **Sequence tanpa panjang tetap.** `parseDataset` berhenti di Item Delimitation yang
   PERTAMA, padahal setiap item punya satu. Sisa berkas lalu dibaca dari posisi keliru dan
   `Rows` tidak pernah ditemukan. Sekarang ada `bacaSequence()` terpisah yang menangani
   keempat kombinasi (sequence/item × panjang tetap/tanpa panjang), dan `parseDataset`
   punya bendera `sampaiItemDelim`. Ada uji regresinya di `uji-dicom.js`.
   **Pelajaran:** uji sintetis lama hanya pernah menulis sequence berpanjang tetap.
2. **Pixel data 1 bit** (objek Segmentation) dibaca sebagai 16 bit. Sekarang dibongkar per
   bit, LSB lebih dulu, dan bit mengalir menyambung antar frame (tidak dibulatkan ke byte).

Ditambahkan juga ke `ENCAPSULATED`: HTJ2K (`.201`–`.203`) dan **Deflated Image Frame
Compression (`1.2.840.10008.1.2.8.1`)** — jangan tertukar dengan Deflated Explicit VR LE
(`1.2.840.10008.1.2.1.99`) yang DIDUKUNG lewat `parseAsync()`.

## Masih tersisa

- **JPEG Lossless, JPEG-LS, JPEG 2000, RLE** masih ditandai perlu dekoder tambahan.
  Butuh dekoder WASM/JS — pilihan sadar untuk tetap tanpa dependensi.
- **JPEG Extended (`.51`)** dipetakan optimistis ke `image/jpeg`; berkas 12 bit umumnya
  gagal dan berakhir di `img.unsupported = 'JPEG gagal didekode'`.
- **Modality LUT / VOI LUT Sequence, overlay plane, WindowCenter/Width bernilai ganda**
  belum ditangani (hanya indeks 0 yang dibaca).
- **Multi-frame terenkapsulasi** mengasumsikan satu fragmen per frame; Basic Offset Table
  dibuang di `readFragments()`.
- **Kamus tag** hanya ~100 entri (subset untuk UI). Tag tak dikenal tampil tanpa nama.
- **Google Sign-In** perlu diaktifkan manual di Firebase Console → Authentication →
  Sign-in method. Sebelum itu aplikasi menampilkan pesan penjelas, bukan galat mentah.
- Tidak ada CI. `node tests/node-runner.js` sudah siap dipakai bila nanti dibuat.
- `KFB.hapusLaporan()` dan `KFB.onUser()` masih belum dipakai siapa pun.

Khusus volume 3D:
- **Ray-cast berjalan di thread utama.** Untuk volume besar halaman akan tersendat saat
  prarender. Pemindahan ke Web Worker adalah langkah berikut yang paling berdampak;
  `volume.js` sudah bebas DOM sehingga bisa dipakai lewat `importScripts` apa adanya.
- **Sampling nearest-neighbour**, belum trilinear — MPR pada volume dengan jarak irisan besar
  terlihat bertangga. Interpolasi z akan paling terasa.
- **Belum ada MPR oblique** (potongan miring) maupun kursor rujuk-silang antar viewport.
- **Seri terkompresi (JPEG 2000/RLE) dan seri berwarna belum bisa dijadikan volume** —
  `bangun()` melewatinya lalu menolak dengan pesan jelas bila sisanya kurang dari 4 irisan.
- Tata letak prisma memakai empat sisi tegak lurus; prisma berbentuk lain (3 sisi, atau
  bersudut tidak 45°) belum didukung.

Khusus rekonstruksi permukaan:
- **Tanpa penghalusan (smoothing) dan tanpa desimasi.** Permukaan CT dengan jarak irisan
  besar terlihat bertangga; Laplacian smoothing beberapa iterasi akan sangat membantu.
- **Satu ambang saja**, belum ada segmentasi wilayah, jadi meja pemeriksaan dan penyangga
  ikut terekstraksi kalau ada di volume.
- **Tanpa penghilangan komponen kecil** — derau di atas ambang jadi bintik segitiga.
- Rasterisasi dan ekstraksi berjalan di thread utama; sama seperti ray-cast, ini kandidat
  utama untuk dipindah ke Web Worker (`mesh.js` sudah bebas DOM).
- `Modality LUT`/`VOI LUT Sequence` sudah bisa DIBACA (ada di berkas uji `mlut_18.dcm` dan
  `vlut_04.dcm`) tetapi belum DIPAKAI saat render.

## Sejarah git

```
2ae7e9d  Keluarkan cache deploy Firebase dari repo
1d9df93  Tambah autentikasi Firebase, sinkronisasi laporan, dan dukungan ponsel
312c0fc  Kaca: platform inspeksi citra DICOM berbasis web
```

## Deploy

```bash
firebase deploy --only hosting --project kaca-id
firebase deploy --only firestore:rules --project kaca-id
```

`tests/index.html` ikut ter-deploy (halaman uji yang berjalan sendiri di peramban), sedangkan
`tests/node-runner.js` dan `tests/periksa-contoh.js` dikecualikan lewat `ignore` di
`firebase.json` karena keduanya skrip Node, bukan aset web.
