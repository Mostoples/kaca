/* ==========================================================
   KACA — penyimpanan berkas lokal (IndexedDB)
   Dipakai agar berkas DICOM yang dibuka di Worklist tetap
   tersedia saat berpindah ke halaman Viewer, tanpa pernah
   dikirim ke server mana pun.
   ========================================================== */
(function (global) {
  'use strict';

  var DB = 'kaca-dicom', VER = 1, STORE = 'instances';
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!global.indexedDB) return rej(new Error('IndexedDB tidak tersedia'));
      var rq = indexedDB.open(DB, VER);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('studyUID', 'studyUID', { unique: false });
        }
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }

  function tx(mode) {
    return open().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); });
  }

  function put(rec) {
    return tx('readwrite').then(function (os) {
      return new Promise(function (res, rej) {
        var rq = os.put(rec);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function byStudy(uid) {
    return tx('readonly').then(function (os) {
      return new Promise(function (res, rej) {
        var out = [], rq = os.index('studyUID').openCursor(IDBKeyRange.only(uid));
        rq.onsuccess = function () {
          var c = rq.result;
          if (c) { out.push(c.value); c.continue(); } else res(out);
        };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function all() {
    return tx('readonly').then(function (os) {
      return new Promise(function (res, rej) {
        var rq = os.getAll();
        rq.onsuccess = function () { res(rq.result || []); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function clear() {
    return tx('readwrite').then(function (os) {
      return new Promise(function (res, rej) {
        var rq = os.clear();
        rq.onsuccess = function () { res(); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  global.KDB = { put: put, byStudy: byStudy, all: all, clear: clear };
})(window);
