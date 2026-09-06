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
        status: statusOverride['local:' + uid] || 'Berkas lokal',
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
    /* cito selalu di atas */
    rows.sort(function (a, b) { return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0); });

    state.rows = rows;
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-key="' + r.key + '"' + (state.selected === r.key ? ' class="sel"' : '') + '>' +
        '<td>' + (r.urgent ? '<span title="Cito" style="color:#ff8b90">&#9679;</span>' : '') + '</td>' +
        '<td class="pn">' + esc(r.patient) +
          '<span class="sub">' + esc(r.patientId) + (r.sex ? ' · ' + r.sex : '') + (r.age ? ' · ' + fmtAge(r.age) : '') + '</span></td>' +
        '<td><span class="mod-tag mod-' + esc(r.modality) + '">' + esc(r.modality) + '</span></td>' +
        '<td>' + esc(r.desc) + '<span class="sub">' + r.series + ' seri · ' + r.images + ' citra</span></td>' +
        '<td>' + esc(r.bodyPart || '—') + '</td>' +
        '<td>' + K.fmtDate(r.date) + '<span class="sub">' + K.fmtTime(r.time) + '</span></td>' +
        '<td>' + r.images + '</td>' +
        '<td>' + statusPill(r.status) + '</td>' +
        '<td style="font-family:var(--mono);font-size:12px">' + esc(r.accession) + '</td>' +
      '</tr>';
    }).join('');

    emptyBox.classList.toggle('hide', rows.length > 0);
    document.getElementById('foot').textContent =
      rows.length + ' studi ditampilkan · ' + rows.reduce(function (a, r) { return a + r.images; }, 0) + ' citra';

    updateCounts();
    document.getElementById('btnOpen').disabled = !state.selected;
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
  K.qsa('.wl-side .side-item[data-filter]').forEach(function (n) {
    n.addEventListener('click', function () {
      K.qsa('.wl-side .side-item[data-filter]').forEach(function (x) { x.classList.remove('active'); });
      n.classList.add('active');
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

  K.qsa('table.wl thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var by = th.dataset.sort;
      if (state.sort.by === by) state.sort.dir *= -1;
      else state.sort = { by: by, dir: 1 };
      K.qsa('table.wl thead th .arw').forEach(function (a) { a.remove(); });
      th.insertAdjacentHTML('beforeend', '<span class="arw">' + (state.sort.dir > 0 ? '▲' : '▼') + '</span>');
      render();
    });
  });

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

  document.getElementById('btnOpen').addEventListener('click', openSelected);
  document.getElementById('btnRefresh').addEventListener('click', function () {
    refreshLocalFromDB().then(function () { buildModFilters(); render(); K.toast('Worklist disegarkan.'); });
  });

  function openSelected() {
    var r = state.rows.filter(function (x) { return x.key === state.selected; })[0];
    if (!r) { K.toast('Pilih satu studi terlebih dahulu.', 'warn'); return; }
    if (r.source === 'demo') {
      if (r.status === 'Belum dibaca') { statusOverride[r.key] = 'Sedang dibaca'; K.store.set('wl.status', statusOverride); }
      location.href = 'viewer.html?demo=' + encodeURIComponent(r.key);
    } else {
      location.href = 'viewer.html?local=' + encodeURIComponent(r.studyUID);
    }
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
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    var items = e.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      var files = [], pending = 0, done = false;
      function walk(entry, path) {
        if (entry.isFile) {
          pending++;
          entry.file(function (f) { files.push(f); if (--pending === 0 && done) ingest(files); });
        } else if (entry.isDirectory) {
          pending++;
          var rd = entry.createReader();
          rd.readEntries(function (ents) {
            ents.forEach(function (en) { walk(en, path + '/' + en.name); });
            if (--pending === 0 && done) ingest(files);
          });
        }
      }
      for (var i = 0; i < items.length; i++) {
        var en = items[i].webkitGetAsEntry();
        if (en) walk(en, '');
      }
      done = true;
      setTimeout(function () { if (pending === 0 && files.length) ingest(files); }, 60);
    } else {
      ingest(e.dataTransfer.files);
    }
  });

  function ingest(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var ok = 0, fail = 0, total = files.length;
    K.toast('Membaca ' + total + ' berkas…');

    var i = 0;
    function next() {
      if (i >= files.length) {
        buildModFilters(); render();
        K.toast(ok + ' citra dimuat' + (fail ? ', ' + fail + ' berkas dilewati (bukan DICOM valid)' : '') + '.',
          fail && !ok ? 'err' : '');
        return;
      }
      var f = files[i++];
      /* lewati berkas yang jelas bukan DICOM */
      if (/\.(png|jpe?g|gif|pdf|txt|zip|docx?|xlsx?|mp4|json|html?|css|js)$/i.test(f.name)) { fail++; return next(); }

      var fr = new FileReader();
      fr.onload = function () {
        try {
          var ds = window.DICOM.parse(fr.result);
          if (!ds.has('00280010')) throw new Error('bukan citra');
          var rec = {
            studyUID: ds.string('0020000D') || ('NOUID-' + (f.webkitRelativePath || f.name).split('/')[0]),
            seriesUID: ds.string('0020000E') || 'S1',
            instance: parseInt(ds.string('00200013') || '0', 10) || 0,
            seriesNumber: parseInt(ds.string('00200011') || '0', 10) || 0,
            seriesDesc: ds.string('0008103E') || '',
            name: f.name,
            size: f.size,
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
            buf: fr.result
          };
          addLocalRecord(rec);
          ok++;
          if (window.KDB) window.KDB.put(rec).catch(function () {});
        } catch (err) { fail++; }
        if (ok % 12 === 0) { buildModFilters(); render(); }
        next();
      };
      fr.onerror = function () { fail++; next(); };
      fr.readAsArrayBuffer(f);
    }
    next();
  }

  /* ---------- init ---------- */
  refreshLocalFromDB().then(function () {
    buildModFilters();
    render();
  });
})();
