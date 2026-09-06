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
   `MESH`, `MODEL`, `KENDALI`, `DEMO`, `KDB`, `KAUTH`, `KACA_BANTUAN`. Gaya ES5 (`var`, `function`), bukan ES6+ —
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
node tests/node-runner.js       # 127 uji parser/volume/permukaan/model/kendali
node tests/periksa-contoh.js    # buka 20 berkas .dcm sungguhan
node tests/periksa-volume.js    # bangun volume dari demo & berkas nyata + ukur waktu
node tests/periksa-mesh.js      # rekonstruksi permukaan (perlu tools/buat-contoh.js dulu)
node tests/periksa-atlas.js     # atlas anatomi (perlu tools/buat-atlas.js dulu)

node tests/asap-halaman.js      # 79 uji asap skrip halaman di tiruan DOM

node tools/buat-contoh.js       # 4 seri volumetrik 64 irisan → contoh-dicom/volume/
node tools/buat-atlas.js        # 13 organ contoh → contoh-dicom/atlas/
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

## Atlas anatomi (sesi lanjutan)

Permintaannya: "kombinasikan repo `thebuggeddev/anatomy`". **Repo itu tidak digabungkan, dan
tidak boleh digabungkan.** Alasannya dicatat di sini supaya tidak dibongkar ulang:

1. **Tidak ada lisensi.** API GitHub: `"license": null`, dan tidak ada berkas `LICENSE` di
   akar. Berarti hak cipta penuh — boleh dilihat & di-fork, **tidak boleh** disalin ke proyek
   lain lalu dipublikasikan. Kaca berlisensi MIT dan ter-deploy publik.
2. **Tumpukan bertabrakan.** `package.json`-nya: Next 16.2.6, React 19.2.6, three.js 0.185.1,
   Drizzle ORM, Tailwind 4, Vite 8, Wrangler/vinext, TypeScript. Nama repo aslinya
   `site-creator-vinext-starter`. Ini kebalikan aturan #1 di atas.
3. **Model 3D-nya dihasilkan AI.** Chunk JSON di `public/models/*.glb` memuat nama node
   `tripo_node_<uuid>` / `tripo_material_<uuid>` (Tripo), digenerate dari prompt seperti
   `anatomical+heart+3d+model` (terlihat di nama tekstur), lalu dioptimalkan
   `glTF-Transform v4.4.2` dengan `EXT_meshopt_compression` + `KHR_mesh_quantization`.
   Jadi: tidak divalidasi anatomis, asalnya tidak jelas, DAN butuh dekoder WASM untuk dibaca.
   **Cara memeriksanya:** unduh 300 KB pertama `.glb` lewat header `Range`, baca chunk JSON
   glTF (offset 20, panjang di offset 12), lihat `asset.generator` dan nama node.

Yang dibangun sebagai gantinya — kemampuannya, bukan kodenya:

**`assets/js/model.js`** (baru) — bebas DOM, bisa diuji headless.
- `MODEL.dariOBJ` / `dariSTL` / `muat(nama, data)`. Melengkapi arah yang selama ini satu
  jalan: `mesh.js` hanya bisa MENGEKSPOR STL/OBJ, sekarang keduanya bisa DIBACA MASUK.
- OBJ: indeks negatif (relatif), poligon dipecah kipas, `vn` dipakai bila ada. `o`/`g`
  memisahkan organ; `usemtl` jadi pengganti bila keduanya tidak ada. **Indeks OBJ itu
  global untuk seluruh berkas**, jadi wajah dikumpulkan per kelompok dulu lalu titiknya
  dipadatkan & dipetakan ulang per bagian.
- STL: biner dikenali dari **panjang berkas** (`84 + n*50`), **bukan** dari kata `solid` —
  80 byte judul STL biner boleh saja diawali kata itu. Ada uji regresinya. Titik **dilas**
  per posisi (dibulatkan ke mikrometer) lalu normal per titik dihitung ulang; normal facet
  dari berkas diabaikan karena tidak bisa menghasilkan bayangan mulus.
- **glTF/GLB ditolak dengan sengaja** — pesannya menyebut WASM & menyarankan konversi.
- Normal per titik: normal segitiga dijumlahkan **tanpa dinormalkan lebih dulu**, sehingga
  besar vektor silang (= 2× luas) berlaku sebagai bobot.

**`MODEL.Adegan`** — banyak bagian, **satu z-buffer bersama** + **satu buffer ID per piksel**.
- Buffer ID itu kunci mekanisme pilih-organ: tidak perlu ray-casting, cukup baca ID di piksel
  yang diklik. Rasterisasi CPU sudah jalan, informasinya tinggal disimpan.
- Bagian beralfa < 0,5 **tidak menulis ID**, jadi klik tidak menangkap organ yang dipudarkan.
- Buram digambar dulu (tulis z); tembus cahaya menyusul diurutkan jauh→dekat dan hanya
  MENGUJI z tanpa menulisnya — tanpa itu dua lapis transparan saling menghapus.
- `isolasi()` memudarkan yang lain, **tidak menyembunyikannya**, supaya letak organ terpilih
  di dalam tubuh tetap terbaca. `ledak()` memakai `kotakAsli()` (tanpa geser) sebagai acuan
  supaya pemanggilan berulang tidak menumpuk.
- `seriAtlas()` mengikuti pola pembungkus seri yang sama dengan volume.js & mesh.js.

**`prisma.html` mode Atlas** — satu-satunya mode yang jalan **tanpa `App.vol`**. Buffer ID
disimpan **per sudut** (`App.atlasId[]`) karena yang tampil di panggung adalah bingkai
prarender, bukan hasil render saat itu; ~6 MB untuk 24 sudut 256², jauh lebih murah daripada
render ulang tiap klik. `organDiTitik()` membalik transformasi sisi prisma
(translate → rotate → cermin → drawImage) untuk mengubah klik jadi koordinat piksel citra.
Menyorot organ mengubah piksel, jadi **memilih organ memicu prarender penuh** — sama seperti
mengubah ambang isosurface.

**`kendali.js`** dapat kosakata organ (`perintah: 'organ'`) plus `pisah`/`satukan`/`semua`.
Dua pelajaran: (a) `'tulang'` TIDAK dipakai sebagai nama organ karena sudah jadi padanan mode
permukaan, dan yang terdaftar lebih dulu menang bila panjang katanya sama; (b) `'semuanya'`
sebagai pemicu tunggal membuat "selamat pagi semuanya" tertangkap sebagai perintah — uji
`Suara: ucapan tanpa perintah menghasilkan null` yang menangkapnya, jadi pemicunya wajib
dua kata. Nama organ ditulis tetap, bukan diambil dari model, karena pengenal suara jauh
lebih baik pada kosakata tertutup dan nama bagian di OBJ sering berupa kode (`FJ6297`).

**`tools/buat-atlas.js`** — 13 organ sebagai bola UV yang dilengkungkan sinus, deterministik,
satuan mm, sumbu DICOM (+x kiri pasien, +y posterior, +z superior). **Bukan anatomi
sungguhan**; ada supaya fitur atlas bisa diuji tanpa unduhan pihak ketiga dan tanpa
pertanyaan lisensi. Keluarannya dikecualikan git. Diperiksa `tests/periksa-atlas.js`, yang
antara lain memastikan **setiap organ bisa diklik di salah satu dari 8 sudut** — kalau ada
organ yang selalu tertutup, mekanisme pilih jadi bohong.

**Model sungguhan** yang lisensinya sudah diverifikasi: BodyParts3D (CC BY-SA 2.1 JP, kredit
wajib "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share
Alike 2.1 Japan", ada cermin STL di `Kevin-Mattheus-Moerman/BodyParts3D`) dan Z-Anatomy
(CC BY-SA 4.0). Share-alike mengikat modelnya, bukan kode MIT Kaca. Cermin BodyParts3D itu
menamai berkasnya `BP<angka>.stl` sementara daftar namanya memakai `FMA<id>` di
`parts_list_e.txt` — pemetaan keduanya belum ditelusuri, jadi **belum ada pengunduh otomatis**.

Bug lama yang tersingkap: `jalankanPerintah` case `reset` mengembalikan `rSkala` ke **0,36**,
padahal bawaannya sudah diperbaiki jadi 0,30 — artinya "atur ulang" justru memunculkan lagi
tumpang-tindih antar sisi. Sudah dibetulkan.

`tests/index.html` sebelumnya tidak memuat `kendali.js`/`uji-kendali.js` sama sekali; sudah
ditambahkan bersama `model.js`/`uji-model.js`. `TextDecoder`/`TextEncoder` ditambahkan ke
sandbox `node-runner.js`.

## Video promo & tutorial (selesai)

`video/susun.js` → `video/kaca-promo.mp4` (±44 s) dan `video/kaca-tutorial.mp4` (±63 s),
1920×1080 30 fps. Bahan: `video/potongan/*.mp4` (dirender native di Node dari TCIA) +
`video/tangkapan/*.png` (12 tangkapan Edge headless).

**Jebakan ffmpeg yang mahal waktunya, jangan diulang:**
- **Jalur Windows mutlak TIDAK BISA dipakai di dalam string filter.** `C:/x` diurai dua kali
  (filtergraph, lalu opsi filter) sehingga titik duanya tetap jadi pemisah opsi betapa pun
  di-escape — `C\:` maupun `C\\:` sama-sama gagal. Jalan keluarnya menghilangkan titik duanya:
  ffmpeg dijalankan dengan `cwd` di `video/tmp/susun/`, di dalam filter hanya nama berkas
  polos, dan font disalin ke situ lebih dulu. Jalur mutlak tetap aman untuk `-i` & keluaran.
- **Teks selalu lewat `textfile=`.** Titik dua, koma, dan apostrof dalam kalimat Indonesia
  mengacaukan pengurai filter.
- Koma di dalam ekspresi (`min(a\,b)`, `mod(t\,x)`) wajib di-escape `\,`.
- Tiap ruas dijadikan mp4 tersendiri lalu disambung concat demuxer. `filter_complex` untuk 13
  ruas tidak bisa ditelusuri saat gagal. Peralihan = fade per ruas, bukan `xfade` (xfade
  menuntut semua ruas dalam satu graf).
- Jalur audio senyap ditambahkan karena pemutar & pengimpor (CapCut) aneh tanpa audio.
- **CapCut CLI hanya menulis draft, tidak merender video.** Perenderan tetap ffmpeg.

`video/tangkap.js` menerima saringan nama adegan: `node video/tangkap.js 8123 atlas` hanya
mengulang adegan atlas. Menangkap semuanya butuh menit dan biasanya cuma satu yang salah.

**Bug yang ditemukan lewat tangkapan (bukan lewat uji):**
- `prisma-panggung.html` memakai `ST-2409-0146` (CT kepala). MIP kepala = siluet tengkorak
  putih penuh, bentuknya hilang. Diganti `ST-2409-0143` (CT toraks).
- Data demo toraks hanya **24 irisan**, jadi MIP-nya bergaris seperti kerai (sampling
  nearest-neighbour). Klip "cantik" karena itu diambil dari TCIA lewat `render-adegan.js`,
  bukan dari studi demo. Jangan mengharap tangkapan halaman demo terlihat mulus.
- **`video/**` ternyata ikut ter-deploy ke situs publik** (~4 MB tangkapan + klip + pembungkus
  iframe). Sudah dikecualikan di `firebase.json`; sudah diverifikasi 404 setelah deploy ulang.
  Ingat: `firebase deploy` mengunggah dari direktori kerja, jadi berkas yang tidak dilacak git
  pun terunggah kalau tidak masuk daftar `ignore`.

`video/*.mp4`, `video/potongan/`, `video/tangkapan/`, `video/tmp/` dikecualikan git.

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
