/* ==========================================================
   KACA — script halaman Worklist
   ========================================================== */
(function () {
  'use strict';
  var K = window.KACA;

  /* ---------- ikon sidebar ---------- */
  [['i-inbox','inbox'],['i-clock','clock'],['i-user','user'],['i-check','check'],
   ['i-flag','flag'],['i-file','file']].forEach(function (p) {
    var n = document.getElementById(p[0]); if (n) n.innerHTML = K.icon(p[1]);
  });

  /* ==========================================================
     Model data
     ========================================================== */
  var state = {
    filter: K.store.get('wl.filter', 'all'),
    mods: K.store.get('wl.mods', []),
    q: '',
    dateRange: 'all',
    sort: { by: 'date', dir: -1 },
    selected: null,
    rows: []
  };

  var statusOverride = K.store.get('wl.status', {});   /* perubahan status yang dibuat pengguna */
  var sesi = null;                                     /* {fb, pembaca} dari KAUTH.jaga() */

  /* Simpan status baca: selalu ke penyimpanan lokal, dan ke Firestore
     bila pengguna masuk dengan akun sehingga tersinkron antar perangkat. */
  function setStatus(key, status) {
    statusOverride[key] = status;
    K.store.set('wl.status', statusOverride);
    if (sesi && sesi.fb && sesi.fb.user) {
      sesi.fb.simpanStatus(key, status).catch(function (err) {
        K.toast('Status tersimpan lokal, gagal menyinkronkan: ' + sesi.fb.pesanGalat(err), 'warn');
      });
    }
  }

  function demoRows() {
    return window.DEMO.studies.map(function (s) {
      var images = s.series.reduce(function (a, x) { return a + x.n; }, 0);
      return {
        key: s.id,
        source: 'demo',
        urgent: s.urgent,
        patient: K.fmtName(s.patient.name),
        patientId: s.patient.id,
        sex: s.patient.sex,
        age: s.patient.age,
        modality: s.modality,
        desc: s.desc,
        bodyPart: s.bodyPart,
        date: s.date,
        time: s.time,
        images: images,
        series: s.series.length,
        status: statusOverride[s.id] || s.status,
        accession: s.accession,
        ref: s
      };
    });
  }

  /* ---------- studi dari berkas lokal ---------- */
  var localStudies = {};    /* studyUID → row */

  function refreshLocalFromDB() {
    if (!window.KDB) return Promise.resolve();
    return window.KDB.all().then(function (recs) {
      localStudies = {};
      recs.forEach(function (r) { addLocalRecord(r, true); });
    }).catch(function () {});
  }

  function addLocalRecord(rec, quiet) {
    var uid = rec.studyUID;
    var row = localStudies[uid];
    if (!row) {
      row = localStudies[uid] = {
        key: 'local:' + uid,
        source: 'local',
        urgent: false,
        patient: rec.patient || '—',
        patientId: rec.patientId || '—',
        sex: rec.sex || '',
        age: rec.age || '',
        modality: rec.modality || '??',
        desc: rec.studyDesc || 'Studi lokal',
        bodyPart: rec.bodyPart || '—',
        date: rec.date || '',
        time: rec.time || '',
        images: 0,
        seriesSet: {},
        series: 0,
        /* Studi lokal memakai status baca yang sama dengan studi PACS
           supaya ikut terhitung di filter "belum dibaca / sedang dibaca /
           selesai". Asalnya tetap dibedakan lewat r.source. */
        status: statusOverride['local:' + uid] || 'Belum dibaca',
        accession: rec.accession || '—',
        studyUID: uid
      };
    }
    row.images++;
    if (rec.seriesUID) { row.seriesSet[rec.seriesUID] = 1; row.series = Object.keys(row.seriesSet).length; }
    return row;
  }

  /* ==========================================================
     Render tabel
     ========================================================== */
  var tbody = document.getElementById('rows');
  var emptyBox = document.getElementById('empty');

  function allRows() {
    return demoRows().concat(Object.keys(localStudies).map(function (k) { return localStudies[k]; }));
  }

  function matchFilter(r) {
    var f = state.filter;
    if (f === 'unread' && r.status !== 'Belum dibaca') return false;
    if (f === 'reading' && r.status !== 'Sedang dibaca') return false;
    if (f === 'done' && r.status !== 'Selesai') return false;
    if (f === 'urgent' && !r.urgent) return false;
    if (f === 'local' && r.source !== 'local') return false;

    if (state.mods.length && state.mods.indexOf(r.modality) === -1) return false;

    if (state.q) {
      var hay = [r.patient, r.patientId, r.desc, r.accession, r.modality, r.bodyPart].join(' ').toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }

    if (state.dateRange !== 'all' && r.date && r.date.length === 8) {
      var d = new Date(r.date.slice(0, 4), +r.date.slice(4, 6) - 1, +r.date.slice(6, 8));
      var days = (Date.now() - d.getTime()) / 86400000;
      if (state.dateRange === 'today' && days > 1) return false;
      if (state.dateRange === '7' && days > 7) return false;
      if (state.dateRange === '30' && days > 30) return false;
    }
    return true;
  }

  function statusPill(s) {
    var cls = s === 'Selesai' ? 'pill-ok' : s === 'Sedang dibaca' ? 'pill-info'
            : s === 'Belum dibaca' ? 'pill-warn' : '';
    return '<span class="pill ' + cls + '"><span class="dot"></span>' + s + '</span>';
  }

  function render() {
    var rows = allRows().filter(matchFilter);
    var by = state.sort.by, dir = state.sort.dir;
    rows.sort(function (a, b) {
      var va = a[by], vb = b[by];
      if (by === 'date') { va = (a.date || '') + (a.time || ''); vb = (b.date || '') + (b.time || ''); }
      if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * dir;
    });
    /* Cito selalu di atas — kecuali bila pengguna memang sedang mengurutkan
       kolom cito, karena kalau tidak urutan pilihannya akan selalu ditimpa. */
    if (by !== 'urgent') {
      rows.sort(function (a, b) { return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0); });
    }

    state.rows = rows;
    tbody.innerHTML = rows.map(function (r) {
      /* data-l dipakai sebagai label kolom saat tabel berubah jadi kartu di ponsel */
      return '<tr data-key="' + r.key + '" tabindex="0"' +
          (state.selected === r.key ? ' class="sel"' : '') + '>' +
        '<td class="c-urgent">' + (r.urgent
          ? '<span class="mod-tag pill-urgent" title="Cito">CITO</span>' : '') + '</td>' +
        '<td class="pn">' + esc(r.patient) +
          '<span class="sub">' + esc(r.patientId) + (r.sex ? ' · ' + r.sex : '') + (r.age ? ' · ' + fmtAge(r.age) : '') + '</span></td>' +
        '<td data-l="Modalitas"><span class="mod-tag mod-' + esc(r.modality) + '">' + esc(r.modality) + '</span></td>' +
        '<td data-l="Studi">' + esc(r.desc) + '<span class="sub">' + r.series + ' seri · ' + r.images + ' citra</span></td>' +
        '<td data-l="Regio">' + esc(r.bodyPart || '—') + '</td>' +
        '<td data-l="Tanggal">' + K.fmtDate(r.date) + '<span class="sub">' + K.fmtTime(r.time) + '</span></td>' +
        '<td data-l="Citra">' + r.images + '</td>' +
        '<td data-l="Status">' + statusPill(r.status) + '</td>' +
        '<td data-l="Accession" style="font-family:var(--mono);font-size:12px">' + esc(r.accession) + '</td>' +
      '</tr>';
    }).join('');

    emptyBox.classList.toggle('hide', rows.length > 0);
    document.getElementById('foot').textContent =
      rows.length + ' studi ditampilkan · ' + rows.reduce(function (a, r) { return a + r.images; }, 0) + ' citra';

    updateCounts();
    document.getElementById('btnOpen').disabled = !state.selected;

    document.getElementById('btnOpen2D').disabled = !state.selected;

    var terpilih = rows.filter(function (r) { return r.key === state.selected; })[0];
    var btnDel = document.getElementById('btnDelStudy');
    if (btnDel) btnDel.disabled = !(terpilih && terpilih.source === 'local');
  }

  function fmtAge(a) {
    if (!a) return '';
    var m = /^(\d+)([YMD])$/.exec(a);
    if (!m) return a;
    return parseInt(m[1], 10) + (m[2] === 'Y' ? ' Th' : m[2] === 'M' ? ' Bln' : ' Hr');
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateCounts() {
    var all = allRows();
    function n(fn) { return all.filter(fn).length; }
    document.getElementById('c-all').textContent = all.length;
    document.getElementById('c-unread').textContent = n(function (r) { return r.status === 'Belum dibaca'; });
    document.getElementById('c-reading').textContent = n(function (r) { return r.status === 'Sedang dibaca'; });
    document.getElementById('c-done').textContent = n(function (r) { return r.status === 'Selesai'; });
    document.getElementById('c-urgent').textContent = n(function (r) { return r.urgent; });
    document.getElementById('c-local').textContent = n(function (r) { return r.source === 'local'; });
  }

  /* ---------- filter modalitas ---------- */
  function buildModFilters() {
    var mods = {};
    allRows().forEach(function (r) { mods[r.modality] = (mods[r.modality] || 0) + 1; });
    var host = document.getElementById('modFilters');
    host.innerHTML = Object.keys(mods).sort().map(function (m) {
      var on = state.mods.indexOf(m) !== -1;
      return '<div class="side-item' + (on ? ' active' : '') + '" data-mod="' + esc(m) + '">' +
        '<span class="mod-tag mod-' + esc(m) + '" style="min-width:32px">' + esc(m) + '</span>' +
        '<span>' + modName(m) + '</span><span class="cnt">' + mods[m] + '</span></div>';
    }).join('');
    K.qsa('#modFilters .side-item').forEach(function (n) {
      n.addEventListener('click', function () {
        var m = n.dataset.mod, i = state.mods.indexOf(m);
        if (i === -1) state.mods.push(m); else state.mods.splice(i, 1);
        K.store.set('wl.mods', state.mods);
        buildModFilters(); render();
      });
    });
  }
  function modName(m) {
    return ({ CT: 'CT Scan', MR: 'MRI', CR: 'Radiografi', DX: 'Radiografi Digital',
      US: 'Ultrasonografi', MG: 'Mamografi', XA: 'Angiografi', NM: 'Kedokteran Nuklir' })[m] || m;
  }

  /* ==========================================================
     Interaksi
     ========================================================== */
  K.qsa('.wl-side .side-item').forEach(function (n) {
    n.setAttribute('role', 'button');
    n.setAttribute('tabindex', '0');
    n.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.click(); }
    });
  });
  K.qsa('.wl-side .side-item[data-filter]').forEach(function (n) {
    n.setAttribute('aria-pressed', n.classList.contains('active') ? 'true' : 'false');
    n.addEventListener('click', function () {
      K.qsa('.wl-side .side-item[data-filter]').forEach(function (x) {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      n.classList.add('active');
      n.setAttribute('aria-pressed', 'true');
      state.filter = n.dataset.filter;
      K.store.set('wl.filter', state.filter);
      render();
    });
  });
  var initFilterNode = K.qs('.wl-side .side-item[data-filter="' + state.filter + '"]');
  if (initFilterNode) {
    K.qsa('.wl-side .side-item[data-filter]').forEach(function (x) { x.classList.remove('active'); });
    initFilterNode.classList.add('active');
  }

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value.trim(); render();
  });
  document.getElementById('fDate').addEventListener('change', function (e) {
    state.dateRange = e.target.value; render();
  });

  /* Tandai kolom yang sedang dipakai untuk mengurutkan. Dipanggil juga saat
     halaman dibuka, supaya panah cocok dengan urutan awal (tanggal, terbaru
     dulu) dan klik pertama tidak terasa berlawanan arah. */
  function tandaiArah() {
    K.qsa('table.wl thead th .arw').forEach(function (a) { a.remove(); });
    K.qsa('table.wl thead th[data-sort]').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === state.sort.by
        ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    var aktif = K.qs('table.wl thead th[data-sort="' + state.sort.by + '"]');
    if (aktif) {
      aktif.insertAdjacentHTML('beforeend',
        '<span class="arw">' + (state.sort.dir > 0 ? '▲' : '▼') + '</span>');
    }
  }

  K.qsa('table.wl thead th[data-sort]').forEach(function (th) {
    th.setAttribute('role', 'columnheader');
    th.setAttribute('tabindex', '0');
    function urut() {
      var by = th.dataset.sort;
      if (state.sort.by === by) state.sort.dir *= -1;
      else state.sort = { by: by, dir: by === 'date' ? -1 : 1 };
      tandaiArah();
      render();
    }
    th.addEventListener('click', urut);
    th.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); urut(); }
    });
  });
  tandaiArah();

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    state.selected = tr.dataset.key;
    render();
  });
  tbody.addEventListener('dblclick', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    state.selected = tr.dataset.key;
    openSelected();
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      if (e.key === 'Enter' && state.selected) openSelected();
      return;
    }
    if (e.key === 'Enter') openSelected();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var i = state.rows.findIndex(function (r) { return r.key === state.selected; });
      i = Math.max(0, Math.min(state.rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      if (state.rows[i]) { state.selected = state.rows[i].key; render(); }
    }
  });

  /* ---------- laci filter untuk layar sempit ---------- */
  (function laci() {
    var side = document.getElementById('wlSide');
    var scrim = document.getElementById('scrim');
    var btn = document.getElementById('btnFilter');
    if (!side || !btn) return;

    function buka(on) {
      side.classList.toggle('open', on);
      scrim.hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) side.querySelector('.side-item').focus();
    }
    btn.addEventListener('click', function () { buka(!side.classList.contains('open')); });
    scrim.addEventListener('click', function () { buka(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && side.classList.contains('open')) { buka(false); btn.focus(); }
    });
    /* memilih filter di ponsel langsung menutup laci */
    side.addEventListener('click', function (e) {
      if (e.target.closest('.side-item') && window.matchMedia('(max-width:900px)').matches) buka(false);
    });
  })();

  document.getElementById('btnOpen').addEventListener('click', function () { openSelected(); });
  document.getElementById('btnOpen2D').addEventListener('click', function () { openSelected('2d'); });
  document.getElementById('btnRefresh').addEventListener('click', function () {
    refreshLocalFromDB().then(function () {
      buildModFilters(); render(); segarkanInfoCache();
      K.toast('Worklist disegarkan.');
    });
  });

  /* Tujuan utama sistem ini adalah hologram prisma, jadi itulah yang
     dibuka tombol utama dan klik ganda. Viewer 2D tetap ada sebagai
     jalur kedua untuk pengukuran dan pembacaan konvensional. */
  function openSelected(tujuan) {
    var r = state.rows.filter(function (x) { return x.key === state.selected; })[0];
    if (!r) { K.toast('Pilih satu studi terlebih dahulu.', 'warn'); return; }
    /* membuka studi yang belum dibaca langsung menandainya sedang dibaca */
    if (r.status === 'Belum dibaca') setStatus(r.key, 'Sedang dibaca');

    var halaman = tujuan === '2d' ? 'viewer.html' : 'prisma.html';
    var param = r.source === 'demo'
      ? 'demo=' + encodeURIComponent(r.key)
      : 'local=' + encodeURIComponent(r.studyUID);
    location.href = halaman + '?' + param;
  }

  /* ==========================================================
     Buka berkas lokal
     ========================================================== */
  document.getElementById('btnOpenFiles').addEventListener('click', function () {
    document.getElementById('fileInput').click();
  });
  document.getElementById('btnOpenFolder').addEventListener('click', function () {
    document.getElementById('dirInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function (e) { ingest(e.target.files); });
  document.getElementById('dirInput').addEventListener('change', function (e) { ingest(e.target.files); });

  var drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('hot'); });
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function () { drop.classList.remove('hot'); });
  });
  /* Telusuri satu entry FileSystem menjadi daftar File.
     readEntries() mengembalikan entri per batch (umumnya 100 per panggilan)
     dan harus dipanggil berulang sampai batch kosong — kalau hanya dipanggil
     sekali, folder besar akan terpotong tanpa pemberitahuan. */
  function bacaEntry(entry, depth) {
    return new Promise(function (res) {
      if (!entry || depth > 12) return res([]);

      if (entry.isFile) {
        entry.file(function (f) { res([f]); }, function () { res([]); });
        return;
      }
      if (!entry.isDirectory) return res([]);

      var rd = entry.createReader(), anak = [];
      (function batch() {
        rd.readEntries(function (ents) {
          if (!ents.length) {
            Promise.all(anak.map(function (en) { return bacaEntry(en, depth + 1); }))
              .then(function (hasil) { res(gabung(hasil)); });
            return;
          }
          anak = anak.concat(Array.prototype.slice.call(ents));
          batch();
        }, function () { res([]); });
      })();
    });
  }
  function gabung(daftarDaftar) {
    return daftarDaftar.reduce(function (a, x) { return a.concat(x); }, []);
  }

  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    var items = e.dataTransfer.items;
    if (!(items && items.length && items[0].webkitGetAsEntry)) {
      ingest(e.dataTransfer.files);
      return;
    }
    /* webkitGetAsEntry() harus dipanggil sinkron, sebelum event selesai */
    var entries = [];
    for (var i = 0; i < items.length; i++) {
      var en = items[i].webkitGetAsEntry();
      if (en) entries.push(en);
    }
    if (!entries.length) { ingest(e.dataTransfer.files); return; }

    var adaFolder = entries.some(function (en) { return en.isDirectory; });
    if (adaFolder) K.toast('Menelusuri folder…');

    Promise.all(entries.map(function (en) { return bacaEntry(en, 0); }))
      .then(function (hasil) {
        var files = gabung(hasil);
        if (!files.length) { K.toast('Tidak ada berkas di dalam yang dijatuhkan.', 'warn'); return; }
        ingest(files);
      })
      .catch(function () { K.toast('Gagal membaca folder yang dijatuhkan.', 'err'); });
  });

  function ingest(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var ok = 0, fail = 0, total = files.length;
    K.toast('Membaca ' + total + ' berkas…');

    var i = 0;
    function next() {
      if (i >= files.length) {
        buildModFilters(); render(); segarkanInfoCache();
        K.toast(ok + ' citra dimuat' + (fail ? ', ' + fail + ' berkas dilewati (bukan DICOM valid)' : '') + '.',
          fail && !ok ? 'err' : '');
        return;
      }
      var f = files[i++];
      /* lewati berkas yang jelas bukan DICOM */
      if (/\.(png|jpe?g|gif|pdf|txt|zip|docx?|xlsx?|mp4|json|html?|css|js)$/i.test(f.name)) { fail++; return next(); }

      var fr = new FileReader();
      fr.onload = function () {
        /* parseAsync juga menangani berkas Deflated Explicit VR LE. Yang
           dikembalikannya adalah dataset di atas buffer yang sudah
           dikembangkan (ds.buffer), dan buffer itulah yang disimpan —
           dengan begitu viewer cukup memakai parse() yang sinkron. */
        window.DICOM.parseAsync(fr.result).then(function (ds) {
          try {
            if (!ds.has('00280010')) throw new Error('bukan citra');
            var rec = {
              studyUID: ds.string('0020000D') || ('NOUID-' + (f.webkitRelativePath || f.name).split('/')[0]),
              seriesUID: ds.string('0020000E') || 'S1',
              instance: parseInt(ds.string('00200013') || '0', 10) || 0,
              seriesNumber: parseInt(ds.string('00200011') || '0', 10) || 0,
              seriesDesc: ds.string('0008103E') || '',
              name: f.name,
              size: ds.buffer.byteLength,
              patient: K.fmtName(ds.string('00100010')),
              patientId: ds.string('00100020') || '—',
              sex: ds.string('00100040') || '',
              age: ds.string('00101010') || '',
              modality: (ds.string('00080060') || '??').trim(),
              studyDesc: ds.string('00081030') || ds.string('0008103E') || 'Studi lokal',
              bodyPart: ds.string('00180015') || '—',
              date: ds.string('00080020') || '',
              time: ds.string('00080030') || '',
              accession: ds.string('00080050') || '—',
              buf: ds.buffer
            };
            addLocalRecord(rec);
            ok++;
            if (window.KDB) window.KDB.put(rec).catch(function () {});
          } catch (err) { fail++; }
          if (ok % 12 === 0) { buildModFilters(); render(); }
          next();
        }, function () { fail++; next(); });
      };
      fr.onerror = function () { fail++; next(); };
      fr.readAsArrayBuffer(f);
    }
    next();
  }

  /* ==========================================================
     Kelola cache berkas lokal
     ----------------------------------------------------------
     Berkas DICOM yang dibuka disimpan utuh di IndexedDB supaya
     viewer bisa membukanya kembali. Tanpa jalan untuk menghapus,
     ArrayBuffer itu menumpuk tanpa batas — bagian ini menyediakan
     penghapusan per studi dan pembersihan menyeluruh.
     ========================================================== */
  var infoCache = document.getElementById('cacheInfo');

  function segarkanInfoCache() {
    if (!infoCache) return;
    if (!window.KDB || !window.KDB.usage) { infoCache.textContent = 'Cache tidak tersedia.'; return; }
    window.KDB.usage().then(function (u) {
      infoCache.textContent = u.instances
        ? u.instances + ' citra dari ' + u.studies + ' studi · ' + K.fmtBytes(u.bytes)
        : 'Belum ada berkas lokal tersimpan.';
    }).catch(function () { infoCache.textContent = 'Cache tidak terbaca.'; });
  }

  /* buang jejak status, laporan, dan pengukuran milik studi lokal */
  function bersihkanJejakLokal(uid) {
    delete statusOverride['local:' + uid];
    K.store.set('wl.status', statusOverride);
    K.store.del('report.' + uid);
    K.store.del('vw.meas.' + String(uid).replace(/[/\\]/g, '_'));
  }

  document.getElementById('btnDelStudy').addEventListener('click', function () {
    var r = state.rows.filter(function (x) { return x.key === state.selected; })[0];
    if (!r || r.source !== 'local') { K.toast('Pilih satu studi lokal terlebih dahulu.', 'warn'); return; }
    if (!confirm('Hapus ' + r.images + ' citra studi "' + r.desc + '" dari cache peramban?\n' +
                 'Berkas aslinya di komputer Anda tidak tersentuh.')) return;

    window.KDB.deleteStudy(r.studyUID).then(function (n) {
      bersihkanJejakLokal(r.studyUID);
      delete localStudies[r.studyUID];
      if (state.selected === r.key) state.selected = null;
      buildModFilters(); render(); segarkanInfoCache();
      K.toast(n + ' citra dihapus dari cache.');
    }).catch(function (err) {
      K.toast('Gagal menghapus: ' + (err && err.message ? err.message : 'kesalahan IndexedDB'), 'err');
    });
  });

  document.getElementById('btnPurge').addEventListener('click', function () {
    var jml = Object.keys(localStudies).length;
    if (!jml) { K.toast('Tidak ada berkas lokal di cache.', 'warn'); return; }
    if (!confirm('Bersihkan seluruh cache berkas lokal (' + jml + ' studi)?\n' +
                 'Berkas asli di komputer Anda tidak tersentuh, tetapi studi ini harus dibuka ulang.')) return;

    window.KDB.clear().then(function () {
      Object.keys(localStudies).forEach(bersihkanJejakLokal);
      localStudies = {};
      state.selected = null;
      buildModFilters(); render(); segarkanInfoCache();
      K.toast('Cache berkas lokal dibersihkan.');
    }).catch(function (err) {
      K.toast('Gagal membersihkan cache: ' + (err && err.message ? err.message : 'kesalahan IndexedDB'), 'err');
    });
  });

  /* ==========================================================
     Init — pastikan sesi dulu, baru bangun tampilan
     ========================================================== */
  /* Tampilkan worklist lebih dulu dari data yang sudah ada di perangkat,
     baru lengkapi dengan sesi dan sinkronisasi. Dengan begitu daftar tidak
     pernah kosong hanya karena menunggu jaringan. */
  buildModFilters();
  render();
  refreshLocalFromDB().then(function () { buildModFilters(); render(); segarkanInfoCache(); });

  window.KAUTH.jaga().then(function (ses) {
    sesi = ses;
    window.KAUTH.pasangChip(document.getElementById('userChip'), ses.pembaca);

    if (!(ses.fb && ses.fb.user)) { tandaiSinkron(null); return; }

    return ses.fb.ambilSemuaStatus().then(function (jauh) {
      Object.keys(jauh).forEach(function (k) { statusOverride[k] = jauh[k]; });
      K.store.set('wl.status', statusOverride);
      tandaiSinkron(true);
      render();
    }).catch(function (err) {
      tandaiSinkron(false, ses.fb.pesanGalat(err));
    });
  }).catch(function (err) {
    console.warn('Init worklist:', err);
    tandaiSinkron(false, 'sesi tidak terbaca');
  });

  /* identitas menyusul bila sesi akun baru diketahui belakangan */
  window.addEventListener('kaca-pembaca', function (e) {
    window.KAUTH.pasangChip(document.getElementById('userChip'), e.detail);
  });

  /* indikator kecil di bilah bawah */
  function tandaiSinkron(ok, pesan) {
    var host = document.getElementById('syncState');
    if (!host) return;
    if (ok === null) {
      host.className = 'sync-dot off';
      host.innerHTML = '<i></i>Mode tamu — tersimpan di peramban ini';
      return;
    }
    host.className = 'sync-dot ' + (ok ? 'on' : 'off');
    host.innerHTML = '<i></i>' + (ok ? 'Tersinkron dengan akun Anda' : 'Sinkronisasi gagal: ' + esc(pesan || ''));
  }
})();
