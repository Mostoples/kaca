/* ==========================================================
   KACA — tiruan DOM & canvas untuk pengujian tanpa peramban
   ----------------------------------------------------------
   Bukan implementasi DOM lengkap, dan tidak berusaha jadi itu.
   Cakupannya persis sebatas yang dipakai skrip halaman Kaca:
   pohon elemen yang dibangun dari berkas HTML sungguhan, subset
   selector CSS yang benar-benar muncul di kode, dan konteks
   canvas 2D yang mencatat panggilan alih-alih menggambar.

   Gunanya: menjalankan assets/js/viewer.js dan assets/js/prisma.js
   apa adanya di Node, sehingga galat inisialisasi, id yang salah
   tulis, dan pengendali yang melempar bisa tertangkap tanpa
   membuka peramban sama sekali.

   Yang TIDAK diuji di sini: hasil gambar yang sesungguhnya, tata
   letak, dan gaya CSS. Untuk itu tetap perlu mata manusia.
   ========================================================== */
'use strict';

/* ==========================================================
   Pemindai HTML
   ----------------------------------------------------------
   Cukup untuk markup yang kita tulis sendiri: tag, atribut
   berkutip, komentar, elemen tanpa penutup, dan <svg> bersarang.
   ========================================================== */
const TANPA_PENUTUP = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
  'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'stop', 'use'
]);
/* isinya teks mentah, bukan markup */
const TEKS_MENTAH = new Set(['script', 'style']);

function pindai(html, buatElemen, buatTeks) {
  const akar = buatElemen('#akar');
  let induk = akar;
  const tumpukan = [];
  let i = 0;

  while (i < html.length) {
    const buka = html.indexOf('<', i);
    if (buka === -1) {
      const sisa = html.slice(i);
      if (sisa.trim()) induk.appendChild(buatTeks(sisa));
      break;
    }
    if (buka > i) {
      const teks = html.slice(i, buka);
      if (teks.trim()) induk.appendChild(buatTeks(teks));
    }

    if (html.startsWith('<!--', buka)) {
      const tutup = html.indexOf('-->', buka);
      i = tutup === -1 ? html.length : tutup + 3;
      continue;
    }
    if (html.startsWith('<!', buka)) {            /* doctype */
      const tutup = html.indexOf('>', buka);
      i = tutup === -1 ? html.length : tutup + 1;
      continue;
    }

    if (html[buka + 1] === '/') {                 /* tag penutup */
      const tutup = html.indexOf('>', buka);
      const nama = html.slice(buka + 2, tutup).trim().toLowerCase();
      /* naik sampai menemukan tag yang cocok, supaya markup yang
         sedikit tidak rapi tidak merusak seluruh pohon */
      for (let k = tumpukan.length - 1; k >= 0; k--) {
        if (tumpukan[k].tagName.toLowerCase() === nama) {
          induk = tumpukan[k].parentNode || akar;
          tumpukan.length = k;
          break;
        }
      }
      i = tutup === -1 ? html.length : tutup + 1;
      continue;
    }

    /* tag pembuka */
    let j = buka + 1, dalamKutip = null;
    while (j < html.length) {
      const c = html[j];
      if (dalamKutip) { if (c === dalamKutip) dalamKutip = null; }
      else if (c === '"' || c === "'") dalamKutip = c;
      else if (c === '>') break;
      j++;
    }
    const isiTag = html.slice(buka + 1, j);
    i = j + 1;

    const cocokNama = /^([A-Za-z][-\w:]*)/.exec(isiTag);
    if (!cocokNama) continue;
    const nama = cocokNama[1];
    const el = buatElemen(nama);

    /* atribut */
    const sisaTag = isiTag.slice(nama.length);
    const re = /([-\w:@.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = re.exec(sisaTag))) {
      const nilai = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3]
        : m[4] !== undefined ? m[4] : '';
      el.setAttribute(m[1], nilai);
    }

    induk.appendChild(el);

    const menutupSendiri = /\/\s*$/.test(isiTag) || TANPA_PENUTUP.has(nama.toLowerCase());
    if (menutupSendiri) continue;

    if (TEKS_MENTAH.has(nama.toLowerCase())) {
      const akhir = html.toLowerCase().indexOf('</' + nama.toLowerCase(), i);
      const isi = html.slice(i, akhir === -1 ? html.length : akhir);
      if (isi.trim()) el.appendChild(buatTeks(isi));
      if (akhir !== -1) {
        const tutup = html.indexOf('>', akhir);
        i = tutup === -1 ? html.length : tutup + 1;
      } else i = html.length;
      continue;
    }

    tumpukan.push(el);
    induk = el;
  }
  return akar;
}

/* ==========================================================
   Selector: subset CSS yang benar-benar dipakai kode Kaca
   ========================================================== */
function pecahSederhana(teks) {
  const b = { tag: null, id: null, kelas: [], atr: [], bukan: [] };
  const re = /(^[A-Za-z][-\w]*)|#([-\w]+)|\.([-\w]+)|\[([^\]=]+)(?:([~^$*|]?=)"?([^\]"]*)"?)?\]|:not\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(teks))) {
    if (m[1]) b.tag = m[1].toLowerCase();
    else if (m[2]) b.id = m[2];
    else if (m[3]) b.kelas.push(m[3]);
    else if (m[4]) b.atr.push({ nama: m[4].trim(), nilai: m[5] ? m[6] : undefined });
    else if (m[7] !== undefined) b.bukan.push(pecahSederhana(m[7]));
  }
  return b;
}

function cocokSederhana(el, b) {
  if (el.nodeType !== 1) return false;
  if (b.tag && el.tagName.toLowerCase() !== b.tag) return false;
  if (b.id && el.id !== b.id) return false;
  for (const k of b.kelas) if (!el.classList.contains(k)) return false;
  for (const a of b.atr) {
    if (!el.hasAttribute(a.nama)) return false;
    if (a.nilai !== undefined && el.getAttribute(a.nama) !== a.nilai) return false;
  }
  for (const n of b.bukan) if (cocokSederhana(el, n)) return false;
  return true;
}

function cocokPenuh(el, bagian) {
  /* bagian terakhir harus cocok dengan el, sisanya dengan leluhurnya */
  if (!cocokSederhana(el, bagian[bagian.length - 1])) return false;
  let idx = bagian.length - 2;
  let p = el.parentNode;
  while (idx >= 0 && p) {
    if (cocokSederhana(p, bagian[idx])) idx--;
    p = p.parentNode;
  }
  return idx < 0;
}

function cariSemua(akar, selector) {
  const grup = String(selector).split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => s.split(/\s+/).map(pecahSederhana));
  const hasil = [];
  (function turun(n) {
    for (const anak of n.childNodes) {
      if (anak.nodeType === 1) {
        if (grup.some((g) => cocokPenuh(anak, g))) hasil.push(anak);
        turun(anak);
      }
    }
  })(akar);
  return hasil;
}

/* ==========================================================
   Konteks canvas 2D tiruan
   ----------------------------------------------------------
   Mencatat jumlah panggilan, tidak menggambar apa pun. Cukup untuk
   memastikan kode render berjalan tanpa melempar.
   ========================================================== */
function buatKonteks2D(kanvas) {
  const catatan = { panggilan: 0, perNama: {} };
  const ctx = {
    canvas: kanvas, _catatan: catatan,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic',
    shadowColor: 'transparent', shadowBlur: 0,
    imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter'
  };
  const metode = ['setTransform', 'transform', 'resetTransform', 'save', 'restore',
    'translate', 'rotate', 'scale', 'clearRect', 'fillRect', 'strokeRect',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
    'bezierCurveTo', 'quadraticCurveTo', 'rect', 'fill', 'stroke', 'clip',
    'fillText', 'strokeText', 'drawImage', 'putImageData', 'setLineDash'];
  for (const nama of metode) {
    ctx[nama] = function () {
      catatan.panggilan++;
      catatan.perNama[nama] = (catatan.perNama[nama] || 0) + 1;
    };
  }
  ctx.measureText = (t) => ({ width: String(t).length * 6 });
  ctx.createImageData = (w, h) => ({
    width: w, height: h, data: new Uint8ClampedArray(w * h * 4)
  });
  ctx.getImageData = (x, y, w, h) => ({
    width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4))
  });
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  return ctx;
}

/* ==========================================================
   Elemen
   ========================================================== */
class Peristiwa {
  constructor(tipe, opsi) {
    Object.assign(this, { type: tipe, bubbles: true, cancelable: true,
      defaultPrevented: false, target: null, currentTarget: null }, opsi || {});
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._berhenti = true; }
  stopImmediatePropagation() { this._berhenti = true; }
}

class Simpul {
  constructor(tipe) {
    this.nodeType = tipe;
    this.childNodes = [];
    this.parentNode = null;
  }
}

class Teks extends Simpul {
  constructor(isi) { super(3); this._teks = isi; }
  get textContent() { return this._teks; }
  set textContent(v) { this._teks = String(v); }
}

class Elemen extends Simpul {
  constructor(tagName, dok) {
    super(1);
    this.tagName = String(tagName).toUpperCase();
    this._dok = dok;
    this._atr = new Map();
    this._pendengar = new Map();
    this.style = new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } });
    this._nilai = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.files = null;
    this.width = 300;
    this.height = 150;
    this.tabIndex = -1;
    this._ctx = null;

    const self = this;
    this.classList = {
      contains: (k) => self._kelas().includes(k),
      add(...ks) { const a = self._kelas(); ks.forEach((k) => { if (k && !a.includes(k)) a.push(k); }); self.className = a.join(' '); },
      remove(...ks) { self.className = self._kelas().filter((k) => !ks.includes(k)).join(' '); },
      toggle(k, paksa) {
        const ada = self._kelas().includes(k);
        const mau = paksa === undefined ? !ada : !!paksa;
        if (mau) this.add(k); else this.remove(k);
        return mau;
      },
      get length() { return self._kelas().length; }
    };

    this.dataset = new Proxy({}, {
      get: (t, k) => self.getAttribute('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())),
      set: (t, k, v) => {
        self.setAttribute('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), String(v));
        return true;
      },
      has: (t, k) => self.hasAttribute('data-' + String(k))
    });
  }

  _kelas() { return String(this.className || '').split(/\s+/).filter(Boolean); }

  get className() { return this._atr.get('class') || ''; }
  set className(v) { this._atr.set('class', String(v)); }
  get id() { return this._atr.get('id') || ''; }
  set id(v) { this._atr.set('id', String(v)); if (this._dok) this._dok._daftar(this); }

  get value() {
    if (this._atr.has('value') && this._nilai === '') return this._atr.get('value');
    return this._nilai;
  }
  set value(v) { this._nilai = String(v); }

  get min() { return this._atr.get('min'); }
  set min(v) { this.setAttribute('min', String(v)); }
  get max() { return this._atr.get('max'); }
  set max(v) { this.setAttribute('max', String(v)); }
  get type() { return this._atr.get('type') || ''; }

  getAttribute(n) { const v = this._atr.get(String(n).toLowerCase()); return v === undefined ? null : v; }
  setAttribute(n, v) {
    n = String(n).toLowerCase();
    this._atr.set(n, String(v));
    if (n === 'id' && this._dok) this._dok._daftar(this);
    if (n === 'value') this._nilai = String(v);
    if (n === 'checked') this.checked = true;
    if (n === 'disabled') this.disabled = true;
    if (n === 'hidden') this.hidden = true;
  }
  hasAttribute(n) { return this._atr.has(String(n).toLowerCase()); }
  removeAttribute(n) { this._atr.delete(String(n).toLowerCase()); }

  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[i + 1] || null;
  }

  appendChild(n) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  insertBefore(baru, acuan) {
    if (!acuan) return this.appendChild(baru);
    const i = this.childNodes.indexOf(acuan);
    if (baru.parentNode) baru.parentNode.removeChild(baru);
    baru.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, baru);
    return baru;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; }
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }
  set textContent(v) {
    this.childNodes.forEach((n) => { n.parentNode = null; });
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) this.appendChild(this._dok.createTextNode(String(v)));
  }

  get innerHTML() { return this._html || ''; }
  set innerHTML(v) {
    this._html = String(v);
    this.childNodes.forEach((n) => { n.parentNode = null; });
    this.childNodes = [];
    const akar = pindai(this._html,
      (t) => this._dok.createElement(t),
      (t) => this._dok.createTextNode(t));
    /* pindahkan anak-anak hasil pindai ke elemen ini */
    [...akar.childNodes].forEach((n) => this.appendChild(n));
  }

  insertAdjacentHTML(posisi, html) {
    const akar = pindai(html,
      (t) => this._dok.createElement(t),
      (t) => this._dok.createTextNode(t));
    const anak = [...akar.childNodes];
    if (posisi === 'beforeend') anak.forEach((n) => this.appendChild(n));
    else if (posisi === 'afterbegin') anak.reverse().forEach((n) => this.insertBefore(n, this.firstChild));
    else if (posisi === 'afterend' && this.parentNode) {
      const s = this.nextSibling;
      anak.forEach((n) => this.parentNode.insertBefore(n, s));
    } else if (posisi === 'beforebegin' && this.parentNode) {
      anak.forEach((n) => this.parentNode.insertBefore(n, this));
    }
  }

  querySelector(s) { return cariSemua(this, s)[0] || null; }
  querySelectorAll(s) {
    const a = cariSemua(this, s);
    a.forEach = Array.prototype.forEach;
    return a;
  }
  closest(s) {
    const bagian = String(s).split(/\s+/).map(pecahSederhana);
    let n = this;
    while (n && n.nodeType === 1) {
      if (cocokSederhana(n, bagian[bagian.length - 1])) return n;
      n = n.parentNode;
    }
    return null;
  }
  matches(s) {
    return String(s).split(',').some((g) =>
      cocokSederhana(this, pecahSederhana(g.trim())));
  }

  addEventListener(t, fn) {
    if (!this._pendengar.has(t)) this._pendengar.set(t, []);
    this._pendengar.get(t).push(fn);
  }
  removeEventListener(t, fn) {
    const a = this._pendengar.get(t);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    let n = this;
    while (n) {
      const a = n._pendengar && n._pendengar.get(ev.type);
      if (a) {
        ev.currentTarget = n;
        for (const fn of [...a]) {
          fn.call(n, ev);
          if (ev._berhenti) return !ev.defaultPrevented;
        }
      }
      if (!ev.bubbles) break;
      n = n.parentNode;
    }
    return !ev.defaultPrevented;
  }
  click() { return this.dispatchEvent(new Peristiwa('click', { target: this })); }
  focus() { this._dok.activeElement = this; }
  blur() { if (this._dok.activeElement === this) this._dok.activeElement = this._dok.body; }

  getContext(jenis) {
    if (jenis !== '2d') return null;
    if (!this._ctx) this._ctx = buatKonteks2D(this);
    return this._ctx;
  }
  toBlob(cb) { cb({ size: 0, type: 'image/png' }); }
  toDataURL() { return 'data:image/png;base64,'; }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
  }
  get clientWidth() { return 800; }
  get clientHeight() { return 600; }
  get offsetParent() { return this.parentNode; }
  setPointerCapture() {}
  releasePointerCapture() {}
  scrollIntoView() {}
  requestFullscreen() { return Promise.resolve(); }
}

/* ==========================================================
   Dokumen & jendela
   ========================================================== */
function buatLingkungan(html, opsi) {
  opsi = opsi || {};

  const dok = {
    nodeType: 9,
    _peta: new Map(),
    _pendengar: new Map(),
    activeElement: null,
    fullscreenElement: null,
    title: '',
    _daftar(el) { if (el.id) dok._peta.set(el.id, el); },
    createElement(t) { return new Elemen(t, dok); },
    createTextNode(t) { return new Teks(t); },
    getElementById(id) { return dok._peta.get(id) || null; },
    querySelector(s) { return cariSemua(dok, s)[0] || null; },
    querySelectorAll(s) {
      const a = cariSemua(dok, s);
      a.forEach = Array.prototype.forEach;
      return a;
    },
    addEventListener(t, fn) {
      if (!dok._pendengar.has(t)) dok._pendengar.set(t, []);
      dok._pendengar.get(t).push(fn);
    },
    removeEventListener(t, fn) {
      const a = dok._pendengar.get(t);
      if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    },
    dispatchEvent(ev) {
      const a = dok._pendengar.get(ev.type);
      if (a) for (const fn of [...a]) { ev.currentTarget = dok; fn.call(dok, ev); }
      return !ev.defaultPrevented;
    },
    exitFullscreen() { dok.fullscreenElement = null; return Promise.resolve(); },
    get documentElement() { return dok._html; }
  };

  /* bangun pohon dari HTML sungguhan */
  const akar = pindai(html, (t) => dok.createElement(t), (t) => dok.createTextNode(t));
  akar.childNodes.forEach((n) => { n.parentNode = akar; });
  akar.nodeType = 1;
  akar.tagName = '#AKAR';
  dok.childNodes = akar.childNodes;

  dok._html = cariSemua(dok, 'html')[0] || dok.createElement('html');
  dok.body = cariSemua(dok, 'body')[0] || dok.createElement('body');
  dok.head = cariSemua(dok, 'head')[0] || dok.createElement('head');
  /* documentElement adalah getter di Simpul; definisikan lewat properti biasa
     yang menyimpan nilai, bukan mencoba menulis ke getter warisan */
  Object.defineProperty(dok, 'documentElement', { value: dok._html, writable: true, configurable: true });
  dok._html.requestFullscreen = () => { dok.fullscreenElement = dok._html; return Promise.resolve(); };
  dok.activeElement = dok.body;

  /* semua id didaftarkan ulang setelah pohon siap */
  cariSemua(dok, '*').length;
  (function daftarSemua(n) {
    for (const a of n.childNodes) {
      if (a.nodeType === 1) { if (a.id) dok._peta.set(a.id, a); daftarSemua(a); }
    }
  })(dok);

  /* ---------- penyimpanan ---------- */
  const simpanan = new Map(Object.entries(opsi.localStorage || {}));
  const localStorage = {
    getItem: (k) => (simpanan.has(k) ? simpanan.get(k) : null),
    setItem: (k, v) => simpanan.set(k, String(v)),
    removeItem: (k) => simpanan.delete(k),
    clear: () => simpanan.clear(),
    get length() { return simpanan.size; }
  };

  /* ---------- jendela ---------- */
  const tugas = [];
  const win = {
    document: dok,
    localStorage,
    location: Object.assign({
      href: 'http://localhost/' + (opsi.halaman || 'index.html'),
      pathname: '/' + (opsi.halaman || 'index.html'),
      search: opsi.search || '',
      hash: '',
      replace(u) { win.location._pindah = u; },
      assign(u) { win.location._pindah = u; }
    }, {}),
    navigator: { userAgent: 'kaca-uji', clipboard: { writeText: () => Promise.resolve() } },
    devicePixelRatio: 1,
    innerWidth: 1440, innerHeight: 900,
    performance: { now: () => Date.now() },
    console,
    Math, JSON, Date, Promise, Map, Set, Array, Object, String, Number, Boolean, Error,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    DataView, Uint8Array, Uint8ClampedArray, Uint16Array, Int16Array, Int8Array,
    Uint32Array, Int32Array, Float32Array, Float64Array, ArrayBuffer,
    URLSearchParams, URL: Object.assign(function (u) { return new (require('url').URL)(u); },
      { createObjectURL: () => 'blob:kaca', revokeObjectURL: () => {} }),
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    Blob: class { constructor(p, o) { this.parts = p; this.type = (o && o.type) || ''; this.size = 0; } },
    Image: class {
      constructor() { this.naturalWidth = 8; this.naturalHeight = 8; }
      set src(v) { this._src = v; if (this.onload) setTimeout(() => this.onload(), 0); }
      get src() { return this._src; }
    },
    FileReader: class {
      readAsArrayBuffer() { if (this.onerror) setTimeout(() => this.onerror(), 0); }
      readAsText() { if (this.onerror) setTimeout(() => this.onerror(), 0); }
    },
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }),
    IntersectionObserver: class {
      constructor(cb) { this._cb = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(cb) { this._cb = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    requestAnimationFrame(fn) { tugas.push(fn); return tugas.length; },
    cancelAnimationFrame() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert() {}, confirm: () => (opsi.confirm === undefined ? true : opsi.confirm),
    prompt: () => (opsi.prompt === undefined ? 'catatan uji' : opsi.prompt),
    addEventListener(t, fn) { dok.addEventListener('window:' + t, fn); },
    removeEventListener(t, fn) { dok.removeEventListener('window:' + t, fn); },
    dispatchEvent(ev) { return dok.dispatchEvent(Object.assign(ev, { type: 'window:' + ev.type })); },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Event: Peristiwa,
    /* indexedDB sengaja tidak ada: idb.js harus menolak dengan rapi */
    indexedDB: undefined
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  win.top = win;

  /* jalankan rAF yang tertunda */
  win._jalankanFrame = function (kali) {
    for (let n = 0; n < (kali || 1); n++) {
      const batch = tugas.splice(0, tugas.length);
      batch.forEach((fn) => fn(Date.now()));
    }
  };
  win._jumlahFrameTertunda = () => tugas.length;

  return { win, dok, Peristiwa, Elemen };
}

module.exports = { buatLingkungan, Peristiwa, Elemen, pindai, cariSemua };
