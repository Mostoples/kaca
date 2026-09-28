/* ==========================================================
   MEDIVOX — Home dashboard
   Everything shown here is real: studies come from the demo
   catalogue and the local IndexedDB cache, and the device
   status is read from what this browser actually supports.
   ========================================================== */
(function () {
  'use strict';
  var K = window.MEDIVOX;
  var el = function (id) { return document.getElementById(id); };

  var IKON_MOD = { CT: 'otak', MR: 'kubus', CR: 'paru', DX: 'paru', US: 'petir', MG: 'perisai' };

  function sapa() {
    var j = new Date().getHours();
    return j < 12 ? 'Good morning' : j < 18 ? 'Good afternoon' : 'Good evening';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- device status (real capability checks) ---------- */
  function isiStatus(ses) {
    var suara = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    var kamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    var idb = !!window.indexedDB;
    var akun = ses && ses.pembaca && !ses.pembaca.tamu;
    var baris = [
      ['mik', 'Voice commands', suara ? 'Supported by this browser' : 'Not available here', suara],
      ['tangan', 'Hand gestures', kamera ? 'Camera access available' : 'No camera API', kamera],
      ['folder', 'Local cache', idb ? 'IndexedDB ready' : 'Unavailable', idb],
      ['awan', 'Report sync', akun ? 'Signed in' : 'Guest: this browser only', akun]
    ];
    el('statusGrid').innerHTML = baris.map(function (b) {
      return '<div class="st"><img class="i3d sm" src="assets/ui/ikon/' + b[0] + '.webp" alt="">' +
        '<div><b>' + b[1] + '</b><small>' + b[2] + '</small></div><span class="led' + (b[3] ? '' : ' off') + '"></span></div>';
    }).join('');
    var ok = baris.filter(function (b) { return b[3]; }).length;
    el('statusPill').textContent = ok === baris.length ? 'All systems go' : ok + ' of ' + baris.length + ' ready';
  }

  /* ---------- recent studies ---------- */
  function statusTag(s) {
    if (s.urgent) return '<span class="tag urgent">Urgent</span>';
    if (s.status === 'Selesai') return '<span class="tag ready">Completed</span>';
    if (s.status === 'Sedang dibaca') return '<span class="tag board">In progress</span>';
    return '<span class="tag proc">Unread</span>';
  }

  function isiStudi(lokal) {
    var demo = (window.DEMO ? window.DEMO.studies : []).map(function (s) {
      return { kunci: 'demo=' + s.id, s: s };
    });
    var semua = lokal.concat(demo).slice(0, 5);
    if (!semua.length) { el('recentList').innerHTML = '<li class="muted small">No studies yet.</li>'; return; }
    el('recentList').innerHTML = semua.map(function (e) {
      var s = e.s;
      return '<li class="study-item" data-kunci="' + esc(e.kunci) + '">' +
        '<span class="ic"><img class="i3d" src="assets/ui/ikon/' + (IKON_MOD[s.modality] || 'berkas') + '.webp" alt=""></span>' +
        '<div class="meta"><b>' + esc(s.desc) + '</b><small>' + esc(K.fmtName(s.patient && s.patient.name)) +
        ' &middot; ' + esc(s.modality) + ' &middot; ' + esc(K.fmtDate(s.date)) + '</small></div>' + statusTag(s) + '</li>';
    }).join('');
    var pertama = semua[0];
    el('heroJudul').textContent = pertama.s.desc;
    el('heroSub').textContent = K.fmtName(pertama.s.patient && pertama.s.patient.name) + ' · ' +
      pertama.s.modality + ' · ready to project as a hologram';
    el('heroHolo').href = 'prisma.html?' + pertama.kunci;
    el('hero2D').href = 'viewer.html?' + pertama.kunci;
  }

  el('recentList').addEventListener('click', function (e) {
    var li = e.target.closest('.study-item');
    if (li) location.href = 'prisma.html?' + li.dataset.kunci;
  });

  function lokalDulu() {
    if (!window.KDB || !window.KDB.all) return Promise.resolve([]);
    return window.KDB.all().then(function (recs) {
      var per = {};
      (recs || []).forEach(function (r) { if (!per[r.studyUID]) per[r.studyUID] = r; });
      return Object.keys(per).map(function (uid) {
        var r = per[uid];
        return { kunci: 'local=' + encodeURIComponent(uid), s: {
          desc: r.studyDesc || 'Local study', modality: r.modality || '—', date: r.date || '',
          patient: { name: r.patient || 'Local file' }, status: 'Belum dibaca' } };
      });
    }).catch(function () { return []; });
  }

  el('greet').textContent = sapa();
  window.KAUTH.jaga().then(function (ses) {
    window.KAUTH.pasangChip(el('userChip'), ses.pembaca);
    el('namaPembaca').textContent = ses.pembaca.tamu ? 'Guest reader' : ses.pembaca.nama;
    isiStatus(ses);
    return lokalDulu();
  }).then(isiStudi);
})();
