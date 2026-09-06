/* ==========================================================
   KACA — proyeksi prisma hologram
   ----------------------------------------------------------
   Menyiapkan tampilan untuk piramida/prisma akrilik yang
   diletakkan di atas layar (efek Pepper's ghost): empat
   pandangan volume disusun mengelilingi satu titik pusat,
   masing-masing dengan sisi atas menghadap ke tengah, sehingga
   pantulan pada keempat bidang prisma bertemu sebagai satu citra
   yang tampak mengambang.

   Sudut pandang di-*prarender* sekali (ray-cast di CPU cukup
   berat), lalu animasi hanya memutar-ulang bingkai yang sudah
   ada — dengan begitu putarannya mulus di 60 fps.

   Karena keempat sisi selalu berjarak 90°, satu set N bingkai
   yang tersebar rata pada 360° cukup untuk semuanya: tiap sisi
   hanya membaca indeks yang bergeser N/4.
   ========================================================== */
(function () {
  'use strict';
  var K = window.KACA;

  var App = {
    vol: null,
    mesh: null,
    meshAmbang: null,
    seri: null,
    judul: '',
    imgs: [],          /* objek img hasil ray-cast per sudut */
    kanvas: [],        /* hasil window/level yang siap digambar */
    fase: 0,
    jalan: true,
    rafId: null,
    perluRender: false,
    opsi: {
      mode: 'maks',
      jumlah: 24,
      ukuran: 256,
      mutu: 1,
      elevasi: 0,
      colormap: '',
      invert: false,
      gamma: 1.6,
      kepadatan: 1,
      ww: null,
      wc: null,
      ambang: 300,
      /* tata letak prisma */
      skala: 0.36,
      jarak: 0.30,
      cermin: false,
      arah: 1,
      kecepatan: 6,
      pusat: true
    }
  };

  var kanvasUtama = document.getElementById('prismaCanvas');
  var ctx = kanvasUtama.getContext('2d');

  function el(id) { return document.getElementById(id); }
  function pesan(teks, sub) {
    el('statusTeks').textContent = teks;
    el('statusSub').textContent = sub || '';
    el('status').classList.remove('hide');
  }
  function tutupPesan() { el('status').classList.add('hide'); }

  /* ==========================================================
     Katalog studi
     ----------------------------------------------------------
     Halaman ini berdiri sendiri: ia menyusun sendiri daftar studi
     yang tersedia (phantom demo + berkas lokal di IndexedDB +
     berkas yang baru dibuka) sehingga tidak perlu dilempar dari
     worklist. Hologram adalah tujuan utama, bukan lampiran.
     ========================================================== */
  var katalog = [];      /* {kunci, label, sumber, seri: [{label, jumlah, buat()}]} */

  function katalogDemo() {
    return (window.DEMO ? window.DEMO.studies : []).map(function (st) {
      return {
        kunci: 'demo:' + st.id,
        label: K.fmtName(st.patient.name) + ' — ' + st.modality + ' ' + st.desc,
        sumber: 'demo',
        studi: st,
        seri: st.series.map(function (s, i) {
          return {
            label: s.desc + ' · ' + s.n + ' irisan',
            jumlah: s.n,
            buat: function () {
              var cache = null;
              return {
                desc: s.desc, number: s.num, modality: st.modality, count: s.n,
                getImage: function (k) {
                  if (!cache) cache = window.DEMO.buildSeriesImages(st, i);
                  return Promise.resolve(cache[Math.max(0, Math.min(s.n - 1, k))]);
                }
              };
            }
          };
        })
      };
    });
  }

  /* studi dari berkas yang pernah dibuka, masih tersimpan di IndexedDB */
  function katalogLokal() {
    if (!window.KDB) return Promise.resolve([]);
    return window.KDB.all().then(function (recs) {
      var perStudi = {};
      recs.forEach(function (r) {
        (perStudi[r.studyUID] = perStudi[r.studyUID] || []).push(r);
      });
      return Object.keys(perStudi).map(function (uid) {
        return dariRecord('lokal:' + uid, perStudi[uid], 'lokal');
      });
    }).catch(function () { return []; });
  }

  /* bentuk entri katalog dari kumpulan record berkas */
  function dariRecord(kunci, recs, sumber) {
    var perSeri = {};
    recs.forEach(function (r) {
      (perSeri[r.seriesUID || 'S1'] = perSeri[r.seriesUID || 'S1'] || []).push(r);
    });
    var first = recs[0];
    var daftarSeri = Object.keys(perSeri)
      .map(function (k) { return perSeri[k]; })
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (items) {
        items.sort(function (a, b) { return (a.instance || 0) - (b.instance || 0); });
        var s0 = items[0];
        return {
          label: (s0.seriesDesc || 'Seri ' + (s0.seriesNumber || 1)) + ' · ' + items.length + ' irisan',
          jumlah: items.length,
          buat: function () {
            return {
              desc: s0.seriesDesc || 'Seri lokal', number: s0.seriesNumber || 1,
              modality: s0.modality, count: items.length,
              getImage: function (i) {
                var r = items[Math.max(0, Math.min(items.length - 1, i))];
                return new Promise(function (res, rej) {
                  try {
                    if (!r._ds) r._ds = window.DICOM.parse(r.buf);
                    res(window.DICOM.readPixels(r._ds, 0));
                  } catch (e) { rej(e); }
                });
              }
            };
          }
        };
      });

    return {
      kunci: kunci, sumber: sumber,
      label: (first.patient || '—') + ' — ' + (first.modality || '??') + ' ' +
             (first.studyDesc || 'Studi lokal'),
      seri: daftarSeri
    };
  }

  /* isi kedua <select> dari katalog */
  function isiPemilih(kunciTerpilih, idxSeri) {
    var selStudi = el('pilihStudi'), selSeri = el('pilihSeri');
    selStudi.innerHTML = katalog.map(function (k) {
      return '<option value="' + esc(k.kunci) + '">' +
        esc(k.label) + (k.sumber === 'demo' ? ' (demo)' : '') + '</option>';
    }).join('');
    if (kunciTerpilih) selStudi.value = kunciTerpilih;

    var st = cariKatalog(selStudi.value);
    selSeri.innerHTML = st ? st.seri.map(function (s, i) {
      return '<option value="' + i + '"' + (s.jumlah < 4 ? ' disabled' : '') + '>' +
        esc(s.label) + (s.jumlah < 4 ? ' — terlalu tipis' : '') + '</option>';
    }).join('') : '';
    if (st) {
      /* pilih seri yang diminta, atau tumpukan paling tebal */
      var pakai = (idxSeri !== undefined && st.seri[idxSeri] && st.seri[idxSeri].jumlah >= 4)
        ? idxSeri
        : st.seri.reduce(function (terbaik, s, i) {
            return s.jumlah > (st.seri[terbaik] ? st.seri[terbaik].jumlah : 0) ? i : terbaik;
          }, 0);
      selSeri.value = String(pakai);
    }
  }

  function cariKatalog(kunci) {
    return katalog.filter(function (k) { return k.kunci === kunci; })[0] || null;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ==========================================================
     Muat studi terpilih → volume → prarender
     ========================================================== */
  function muatTerpilih() {
    var st = cariKatalog(el('pilihStudi').value);
    if (!st) { pesan('Tidak ada studi yang bisa dibuka'); return Promise.resolve(); }
    var idx = parseInt(el('pilihSeri').value, 10) || 0;
    var entri = st.seri[idx];
    if (!entri) { pesan('Seri tidak ada'); return Promise.resolve(); }

    if (entri.jumlah < 4) {
      pesan('Seri ini hanya ' + entri.jumlah + ' irisan',
        'Hologram butuh setidaknya 4 irisan. Pilih seri lain.');
      return Promise.resolve();
    }

    /* volume & permukaan lama tidak berlaku lagi */
    App.vol = null; App.mesh = null; App.meshAmbang = null;
    App.imgs = []; App.kanvas = [];

    App.seri = entri.buat();
    el('hJudul').textContent = st.label;
    el('hSub').textContent = entri.label;
    el('studiInfo').textContent = st.sumber === 'demo'
      ? 'Phantom sintetis — bukan data pasien.'
      : 'Berkas lokal Anda sendiri, diurai di peramban ini.';
    document.title = st.label + ' — Prisma Kaca';

    pesan('Menyusun volume…', 'membaca irisan');
    el('bar').style.width = '0%';

    return window.VOLUME.bangun(App.seri, {
      lapor: function (n, total) {
        el('statusSub').textContent = n + ' / ' + total + ' irisan';
        el('bar').style.width = (n / total * 100) + '%';
      }
    }).then(function (vol) {
      App.vol = vol;
      el('volInfo').textContent = vol.info();
      setelRentang(vol);
      return prarender();
    }).catch(function (err) {
      var m = (err && err.message) ? err.message : String(err);
      pesan('Tidak bisa menyiapkan hologram', m);
      el('bar').style.width = '0%';
      console.warn('Prisma:', err);
    });
  }

  /* rentang penggeser mengikuti nilai voxel yang benar-benar ada */
  function setelRentang(vol) {
    var rentang = Math.max(1, vol.max - vol.min);
    var sWW = el('rWW'), sWL = el('rWL');
    sWW.min = 1; sWW.max = Math.round(rentang * 2);
    sWL.min = Math.round(vol.min - rentang * 0.5);
    sWL.max = Math.round(vol.max + rentang * 0.5);
    App.opsi.ww = Math.round(vol.windowWidth);
    App.opsi.wc = Math.round(vol.windowCenter);
    sWW.value = App.opsi.ww; sWL.value = App.opsi.wc;
    el('rWWVal').textContent = App.opsi.ww;
    el('rWLVal').textContent = App.opsi.wc;

    var sAmb = el('rAmbang');
    sAmb.min = Math.round(vol.min + 1);
    sAmb.max = Math.round(vol.max - 1);
    App.opsi.ambang = window.MESH ? window.MESH.ambangSaran(vol)
      : Math.round((vol.min + vol.max) / 2);
    sAmb.value = App.opsi.ambang;
    el('rAmbangVal').textContent = App.opsi.ambang;
  }

  /* ==========================================================
     Membuka berkas DICOM langsung di halaman ini
     ========================================================== */
  function bukaBerkas(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    pesan('Membaca ' + files.length + ' berkas…', '0 / ' + files.length);
    el('bar').style.width = '0%';

    var recs = [], selesai = 0, gagal = 0;

    files.forEach(function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        window.DICOM.parseAsync(fr.result).then(function (ds) {
          try {
            if (ds.has('00280010')) {
              recs.push({
                studyUID: ds.string('0020000D') || 'LOKAL',
                seriesUID: ds.string('0020000E') || 'S1',
                instance: parseInt(ds.string('00200013') || '0', 10) || 0,
                seriesNumber: parseInt(ds.string('00200011') || '0', 10) || 0,
                seriesDesc: ds.string('0008103E') || '',
                patient: K.fmtName(ds.string('00100010')),
                modality: (ds.string('00080060') || '??').trim(),
                studyDesc: ds.string('00081030') || 'Studi lokal',
                buf: ds.buffer, _ds: ds
              });
            } else gagal++;
          } catch (e) { gagal++; }
          langkahSelesai();
        }, function () { gagal++; langkahSelesai(); });
      };
      fr.onerror = function () { gagal++; langkahSelesai(); };
      fr.readAsArrayBuffer(f);
    });

    function langkahSelesai() {
      selesai++;
      el('statusSub').textContent = selesai + ' / ' + files.length;
      el('bar').style.width = (selesai / files.length * 100) + '%';
      if (selesai < files.length) return;

      if (!recs.length) {
        pesan('Tidak ada berkas DICOM yang bisa dibaca',
          gagal + ' berkas dilewati. Pastikan yang dipilih berkas .dcm.');
        return;
      }

      /* satu atau beberapa studi sekaligus; semuanya masuk katalog */
      var perStudi = {};
      recs.forEach(function (r) { (perStudi[r.studyUID] = perStudi[r.studyUID] || []).push(r); });
      var baru = Object.keys(perStudi).map(function (uid) {
        return dariRecord('buka:' + uid, perStudi[uid], 'buka');
      });

      /* buang entri lama dengan kunci sama, lalu taruh yang baru di atas */
      var kunciBaru = baru.map(function (b) { return b.kunci; });
      katalog = baru.concat(katalog.filter(function (k) {
        return kunciBaru.indexOf(k.kunci) === -1;
      }));

      isiPemilih(baru[0].kunci);
      muatTerpilih();
    }
  }

  /* ==========================================================
     Prarender sudut
     ========================================================== */
  function prarender() {
    var o = App.opsi;
    /* slider mengembalikan angka pecahan; jumlah sudut harus bulat
       dan habis dibagi empat karena keempat sisi berjarak tepat 90° */
    var n = Math.max(4, Math.round(o.jumlah / 4) * 4);
    o.jumlah = n;
    App.imgs = new Array(n);
    App.kanvas = [];
    App.perluRender = false;
    el('btnRender').classList.remove('perlu');

    var i = 0;
    var mulai = performance.now();
    var permukaan = o.mode === 'permukaan';

    /* Mode permukaan perlu isosurface dulu. Jaringnya disimpan dan
       hanya dibangun ulang kalau ambangnya berubah — ekstraksi jauh
       lebih mahal daripada merender satu sudut. */
    if (permukaan) {
      if (!window.MESH) { pesan('Modul permukaan tidak termuat'); return Promise.resolve(); }
      if (!App.mesh || App.meshAmbang !== o.ambang) {
        pesan('Menelusuri isosurface…', 'ambang ' + Math.round(o.ambang));
        el('bar').style.width = '0%';
        App.mesh = App.vol ? window.MESH.dari(App.vol, { ambang: o.ambang }) : null;
        App.meshAmbang = o.ambang;
        var mi = el('meshInfo');
        if (mi) {
          mi.textContent = App.mesh && !App.mesh.kosong()
            ? App.mesh.info()
            : 'Tidak ada permukaan pada ambang ' + Math.round(o.ambang) + '.';
        }
      }
      if (!App.mesh || App.mesh.kosong()) {
        pesan('Tidak ada permukaan pada ambang itu',
          'Geser ambang lalu tekan "Render ulang".');
        return Promise.resolve();
      }
    }

    pesan('Merender ' + n + ' sudut…', '0 / ' + n);

    return new Promise(function (selesai) {
      function langkah() {
        var t0 = performance.now();
        /* render beberapa sudut per giliran, tetapi selalu lepaskan
           kendali sebelum 100 ms agar bilah kemajuan tetap bergerak */
        do {
          App.imgs[i] = permukaan
            ? App.mesh.render({
                azimut: i / n * Math.PI * 2,
                elevasi: o.elevasi * Math.PI / 180,
                ukuran: o.ukuran
              })
            : App.vol.proyeksi({
                azimut: i / n * Math.PI * 2,
                elevasi: o.elevasi * Math.PI / 180,
                mode: o.mode, ukuran: o.ukuran, mutu: o.mutu,
                windowCenter: o.wc, windowWidth: o.ww,
                colormap: o.colormap || null,
                gamma: o.gamma, kepadatan: o.kepadatan
              });
          i++;
        } while (i < n && performance.now() - t0 < 90);

        el('statusSub').textContent = i + ' / ' + n;
        el('bar').style.width = (i / n * 100) + '%';

        if (i < n) { setTimeout(langkah, 0); return; }

        siapkanKanvas();
        tutupPesan();
        el('renderInfo').textContent =
          n + ' sudut · ' + o.ukuran + '² px · ' +
          Math.round(performance.now() - mulai) + ' ms';
        selesai();
      }
      setTimeout(langkah, 0);
    });
  }

  /* img → canvas siap pakai (window/level & peta warna diterapkan di sini
     untuk mode skalar, sehingga penyetelan W/L tidak perlu ray-cast ulang) */
  function siapkanKanvas() {
    var o = App.opsi;
    App.kanvas = App.imgs.map(function (img) {
      var c = document.createElement('canvas');
      c.width = img.cols; c.height = img.rows;
      var cc = c.getContext('2d');
      var idata = window.DICOM.toImageData(img, {
        windowCenter: o.wc !== null ? o.wc : img.windowCenter,
        windowWidth: o.ww !== null ? o.ww : img.windowWidth,
        invert: o.invert,
        colormap: img.samplesPerPixel === 3 ? null : (o.colormap || null)
      });
      cc.putImageData(idata, 0, 0);
      return c;
    });
    gambar();
  }

  /* ==========================================================
     Menggambar tata letak prisma
     ========================================================== */
  function ukurKanvas() {
    var kotak = kanvasUtama.parentNode.getBoundingClientRect();
    var sisi = Math.max(160, Math.floor(Math.min(kotak.width, kotak.height)));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    kanvasUtama.style.width = sisi + 'px';
    kanvasUtama.style.height = sisi + 'px';
    kanvasUtama.width = Math.round(sisi * dpr);
    kanvasUtama.height = Math.round(sisi * dpr);
  }

  /* Empat sisi, masing-masing dengan tepi atas menghadap pusat.
     Sudut putar kanvas positif berarti searah jarum jam. */
  var SISI = [
    { nama: 'S', dx: 0,  dy: 1,  rot: 0 },
    { nama: 'W', dx: -1, dy: 0,  rot: Math.PI / 2 },
    { nama: 'N', dx: 0,  dy: -1, rot: Math.PI },
    { nama: 'E', dx: 1,  dy: 0,  rot: -Math.PI / 2 }
  ];

  function gambar() {
    var S = kanvasUtama.width, o = App.opsi;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, kanvasUtama.height);
    if (!App.kanvas.length) return;

    var n = App.kanvas.length;
    var cx = S / 2, cy = kanvasUtama.height / 2;
    var sisiPx = S * o.skala;
    var jarakPx = S * o.jarak;

    /* penanda pusat: membantu meletakkan puncak prisma */
    if (o.pusat) {
      ctx.strokeStyle = 'rgba(47,212,189,.28)';
      ctx.lineWidth = Math.max(1, S / 900);
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.02, cy); ctx.lineTo(cx + S * 0.02, cy);
      ctx.moveTo(cx, cy - S * 0.02); ctx.lineTo(cx, cy + S * 0.02);
      ctx.stroke();
    }

    SISI.forEach(function (s, k) {
      /* tiap sisi tertinggal 90° dari sisi sebelumnya */
      var idx = Math.round(App.fase + App.opsi.arah * k * n / 4);
      idx = ((idx % n) + n) % n;
      var src = App.kanvas[idx];
      if (!src) return;

      ctx.save();
      ctx.translate(cx + s.dx * jarakPx, cy + s.dy * jarakPx);
      ctx.rotate(s.rot);
      if (o.cermin) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      /* tepi atas citra menghadap pusat: setelah rotasi, gambar
         diletakkan pada -y sehingga sisi atasnya mengarah ke dalam */
      ctx.drawImage(src, -sisiPx / 2, -sisiPx, sisiPx, sisiPx);
      ctx.restore();
    });
  }

  /* ==========================================================
     Animasi
     ========================================================== */
  var terakhir = 0;
  function loop(ts) {
    App.rafId = requestAnimationFrame(loop);
    if (!terakhir) terakhir = ts;
    var dt = Math.min(0.1, (ts - terakhir) / 1000);
    terakhir = ts;
    if (!App.jalan || !App.kanvas.length) return;
    var n = App.kanvas.length;
    App.fase = (App.fase + App.opsi.kecepatan * dt * n / 60 + n) % n;
    gambar();
  }

  /* ==========================================================
     Kontrol
     ========================================================== */
  function tandaiPerluRender() {
    App.perluRender = true;
    el('btnRender').classList.add('perlu');
  }

  /* penyetelan yang cukup diterapkan ke kanvas hasil */
  function segarkanTampilan() {
    if (!App.imgs.length) return;
    siapkanKanvas();
  }

  function pasangSlider(id, kunci, format, aksi) {
    var s = el(id), out = el(id + 'Val');
    function terap() {
      App.opsi[kunci] = parseFloat(s.value);
      if (out) out.textContent = format ? format(App.opsi[kunci]) : s.value;
      if (aksi) aksi();
    }
    s.addEventListener('input', terap);
    terap();
  }

  function pasangKontrol() {
    /* pemilih studi & seri */
    el('pilihStudi').addEventListener('change', function () {
      isiPemilih(this.value);
      muatTerpilih();
    });
    el('pilihSeri').addEventListener('change', function () { muatTerpilih(); });
    el('btnBukaFile').addEventListener('click', function () { el('fileInput').click(); });
    el('fileInput').addEventListener('change', function (e) { bukaBerkas(e.target.files); });

    /* mode proyeksi */
    K.qsa('#modeGrid button').forEach(function (b) {
      b.addEventListener('click', function () {
        K.qsa('#modeGrid button').forEach(function (x) {
          x.classList.remove('on'); x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
        App.opsi.mode = b.dataset.mode;
        el('barisKomposit').classList.toggle('hide', b.dataset.mode !== 'komposit');
        el('barisPermukaan').classList.toggle('hide', b.dataset.mode !== 'permukaan');
        tandaiPerluRender();
      });
    });

    pasangSlider('rAmbang', 'ambang', Math.round, tandaiPerluRender);

    /* peta warna */
    K.qsa('#cmapGrid button').forEach(function (b) {
      b.addEventListener('click', function () {
        K.qsa('#cmapGrid button').forEach(function (x) {
          x.classList.remove('on'); x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
        App.opsi.colormap = b.dataset.cmap || '';
        /* mode komposit memakai peta warna saat ray-cast, jadi harus dirender ulang */
        if (App.opsi.mode === 'komposit') tandaiPerluRender();
        else segarkanTampilan();
      });
    });

    pasangSlider('rWW', 'ww', Math.round, function () {
      if (App.opsi.mode === 'komposit') tandaiPerluRender(); else segarkanTampilan();
    });
    pasangSlider('rWL', 'wc', Math.round, function () {
      if (App.opsi.mode === 'komposit') tandaiPerluRender(); else segarkanTampilan();
    });
    pasangSlider('rElev', 'elevasi', function (v) { return v + '°'; }, tandaiPerluRender);
    pasangSlider('rSudut', 'jumlah', function (v) { return v + ' sudut'; }, tandaiPerluRender);
    pasangSlider('rUkuran', 'ukuran', function (v) { return v + ' px'; }, tandaiPerluRender);
    pasangSlider('rMutu', 'mutu', function (v) { return v.toFixed(2) + '×'; }, tandaiPerluRender);
    pasangSlider('rKepadatan', 'kepadatan', function (v) { return v.toFixed(2); }, tandaiPerluRender);
    pasangSlider('rGamma', 'gamma', function (v) { return v.toFixed(2); }, tandaiPerluRender);

    pasangSlider('rSkala', 'skala', function (v) { return Math.round(v * 100) + '%'; }, gambar);
    pasangSlider('rJarak', 'jarak', function (v) { return Math.round(v * 100) + '%'; }, gambar);
    pasangSlider('rKecepatan', 'kecepatan', function (v) { return v.toFixed(1) + ' rpm'; });

    el('swCermin').addEventListener('change', function (e) {
      App.opsi.cermin = e.target.checked; gambar();
    });
    el('swInvert').addEventListener('change', function (e) {
      App.opsi.invert = e.target.checked; segarkanTampilan();
    });
    el('swPusat').addEventListener('change', function (e) {
      App.opsi.pusat = e.target.checked; gambar();
    });
    el('swArah').addEventListener('change', function (e) {
      App.opsi.arah = e.target.checked ? -1 : 1; gambar();
    });

    el('btnPutar').addEventListener('click', function () {
      App.jalan = !App.jalan;
      this.textContent = App.jalan ? 'Jeda' : 'Putar';
      this.setAttribute('aria-pressed', App.jalan ? 'true' : 'false');
    });
    el('btnRender').addEventListener('click', function () {
      if (!App.vol) return;
      prarender();
    });
    el('btnPenuh').addEventListener('click', function () {
      var target = document.getElementById('panggung');
      if (document.fullscreenElement) document.exitFullscreen();
      else target.requestFullscreen().catch(function () {});
    });
    el('btnPanel').addEventListener('click', function () {
      var b = document.body.classList.toggle('tanpa-panel');
      this.setAttribute('aria-pressed', b ? 'true' : 'false');
      requestAnimationFrame(function () { ukurKanvas(); gambar(); });
    });

    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); el('btnPutar').click(); }
      if (e.key.toLowerCase() === 'f') el('btnPenuh').click();
      if (e.key.toLowerCase() === 'p') el('btnPanel').click();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        App.jalan = false;
        el('btnPutar').textContent = 'Putar';
        var n = App.kanvas.length || 1;
        App.fase = (App.fase + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
        gambar();
      }
    });

    window.addEventListener('resize', function () { ukurKanvas(); gambar(); });
    document.addEventListener('fullscreenchange', function () {
      requestAnimationFrame(function () { ukurKanvas(); gambar(); });
    });

    /* seret di panggung untuk memutar manual */
    var seret = null;
    kanvasUtama.addEventListener('pointerdown', function (e) {
      seret = { x: e.clientX, fase: App.fase };
      App.jalan = false;
      el('btnPutar').textContent = 'Putar';
      try { kanvasUtama.setPointerCapture(e.pointerId); } catch (err) {}
    });
    kanvasUtama.addEventListener('pointermove', function (e) {
      if (!seret || !App.kanvas.length) return;
      var n = App.kanvas.length;
      App.fase = (seret.fase + (e.clientX - seret.x) / 6 + n * 4) % n;
      gambar();
    });
    kanvasUtama.addEventListener('pointerup', function () { seret = null; });
    kanvasUtama.addEventListener('pointercancel', function () { seret = null; });
  }

  /* ==========================================================
     Boot
     ========================================================== */
  ukurKanvas();
  pasangKontrol();
  App.rafId = requestAnimationFrame(loop);

  pesan('Memeriksa sesi…');
  window.KAUTH.jaga().then(function (ses) {
    window.KAUTH.pasangChip(el('userChip'), ses.pembaca);
    pesan('Menyusun daftar studi…');
    return katalogLokal();
  }).then(function (lokal) {
    /* berkas lokal lebih dulu — itu yang biasanya baru dibuka pengguna */
    katalog = lokal.concat(katalogDemo());
    if (!katalog.length) {
      pesan('Tidak ada studi yang tersedia', 'Buka berkas DICOM lewat panel di samping.');
      el('statusAksi').classList.remove('hide');
      return;
    }

    /* hormati parameter URL bila datang dari worklist atau viewer */
    var p = new URLSearchParams(location.search);
    var minta = p.get('local') ? 'lokal:' + p.get('local')
      : p.get('demo') ? 'demo:' + p.get('demo') : null;
    var idxSeri = p.get('seri') !== null ? parseInt(p.get('seri'), 10) : undefined;

    isiPemilih(minta && cariKatalog(minta) ? minta : katalog[0].kunci, idxSeri);
    return muatTerpilih();
  }).catch(function (err) {
    var m = (err && err.message) ? err.message : String(err);
    pesan('Tidak bisa menyiapkan hologram', m);
    el('bar').style.width = '0%';
    el('statusAksi').classList.remove('hide');
    console.warn('Prisma:', err);
  });
})();
