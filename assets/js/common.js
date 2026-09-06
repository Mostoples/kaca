/* ==========================================================
   KACA — utilitas bersama (toast, storage, helper DOM)
   ========================================================== */
(function (global) {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  /* ---------- toast ---------- */
  function toast(msg, kind, ms) {
    var host = qs('#toasts');
    if (!host) { host = el('div', { id: 'toasts' }); document.body.appendChild(host); }
    var t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: msg });
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s,transform .25s';
      t.style.opacity = '0'; t.style.transform = 'translateY(6px)';
      setTimeout(function () { t.remove(); }, 260);
    }, ms || 2800);
  }

  /* ---------- localStorage aman ---------- */
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('kaca.' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('kaca.' + k, JSON.stringify(v)); return true; }
      catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem('kaca.' + k); } catch (e) {} }
  };

  /* ---------- format ---------- */
  function fmtDate(d) {
    if (!d || d.length < 8) return d || '—';
    var bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return parseInt(d.slice(6, 8), 10) + ' ' + bulan[parseInt(d.slice(4, 6), 10) - 1] + ' ' + d.slice(0, 4);
  }
  function fmtTime(t) {
    if (!t || t.length < 4) return '';
    return t.slice(0, 2) + ':' + t.slice(2, 4);
  }
  function fmtName(pn) {
    if (!pn) return '—';
    var p = String(pn).split('^');
    return [p[1], p[0]].filter(Boolean).join(' ').trim() || String(pn).replace(/\^/g, ' ');
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /* ---------- ikon inline ---------- */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 9.2 4 4 0 0 0 6.5 19h11z"/>',
    ruler: '<path d="M3 15 15 3l6 6L9 21z"/><path d="m7 11 2 2"/><path d="m10 8 2 2"/><path d="m13 5 2 2"/>',
    brain: '<path d="M12 5a3 3 0 0 0-6 0v1a3 3 0 0 0-2 5.5A3 3 0 0 0 7 17a3 3 0 0 0 5 2z"/><path d="M12 5a3 3 0 0 1 6 0v1a3 3 0 0 1 2 5.5A3 3 0 0 1 17 17a3 3 0 0 1-5 2z"/>',
    file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round"' + (size ? ' width="' + size + '" height="' + size + '"' : '') +
      '>' + (ICONS[name] || '') + '</svg>';
  }

  global.KACA = {
    qs: qs, qsa: qsa, el: el, toast: toast, store: store, icon: icon, ICONS: ICONS,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtName: fmtName, fmtBytes: fmtBytes
  };
})(window);
