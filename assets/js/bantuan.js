/* ==========================================================
   MEDIVOX — dialog bantuan pintasan papan ketik
   ----------------------------------------------------------
   Menyediakan window.MEDIVOX_BANTUAN() yang dipanggil dari menu
   pengguna (assets/js/auth.js) dan dari tombol "?" / "Shift+/".
   Isi dialog menyesuaikan halaman yang sedang dibuka: worklist
   hanya menampilkan pintasan antrian, viewer menampilkan alat,
   tampilan, navigasi, tetikus, dan sentuh.
   ========================================================== */
(function (global) {
  'use strict';
  var K = global.MEDIVOX;

  /* ---------- isi ---------- */
  var UMUM = {
    judul: 'General',
    baris: [
      ['?', 'Open / close this shortcut dialog'],
      ['Esc', 'Close a dialog or drawer, or cancel an action'],
      ['Tab', 'Move focus between controls']
    ]
  };

  var WORKLIST = [
    {
      judul: 'Reading queue',
      baris: [
        ['↑  ↓', 'Select previous / next study'],
        ['Enter', 'Open the selected study'],
        ['Double-click', 'Open the study directly'],
        ['Click a column header', 'Sort ascending / descending']
      ]
    },
    UMUM
  ];

  var VIEWER = [
    {
      judul: 'Tools',
      baris: [
        ['W', 'Window / Level'],
        ['P', 'Pan'],
        ['Z', 'Zoom'],
        ['S', 'Scroll slices'],
        ['L', 'Measure length'],
        ['A', 'Measure angle'],
        ['R', 'Rectangle ROI'],
        ['E', 'Ellipse ROI'],
        ['D', 'Pixel value probe'],
        ['T', 'Text annotation']
      ]
    },
    {
      judul: 'View',
      baris: [
        ['I', 'Invert'],
        ['V', 'Flip vertical'],
        ['F', 'Fit to screen'],
        ['0', 'Reset view'],
        ['H', 'Hide overlay'],
        ['1', 'Layout 1×1'],
        ['2', 'Layout 1×2'],
        ['3', 'Layout 1×3'],
        ['4', 'Layout 2×2']
      ]
    },
    {
      judul: 'Slice navigation',
      baris: [
        ['←  →', 'Previous / next slice'],
        ['↑  ↓', 'Previous / next slice'],
        ['Space', 'Play / pause cine']
      ]
    },
    {
      judul: 'Mouse',
      baris: [
        ['Left drag', 'Use the active tool'],
        ['Middle drag', 'Pan the image'],
        ['Right drag', 'Zoom in / out'],
        ['Wheel', 'Scroll slices'],
        ['Ctrl + wheel', 'Zoom in / out'],
        ['Shift + drag', 'Pan the image'],
        ['Double-click', 'Switch layout 1×1 ↔ 2×2']
      ]
    },
    {
      judul: 'Touch screen',
      baris: [
        ['One finger', 'Use the active tool'],
        ['Two fingers', 'Pinch to zoom and pan']
      ]
    },
    {
      judul: '3D, MPR & MIP',
      baris: [
        ['Series panel', 'The "Build 3D & MPR" button below the series list'],
        ['Result', 'Appears as new series: MPR, MIP and 3D projections'],
        ['3D series', 'Scrolling rotates the volume; Space rotates it automatically'],
        ['Surface', '"Reconstruct surface" builds an isosurface at one threshold'],
        ['Download', 'STL and OBJ buttons save the mesh in millimetres'],
        ['Prism', '"Send to hologram" opens the prism stage']
      ]
    },
    UMUM
  ];

  var PRISMA = [
    {
      judul: 'Hologram stage',
      baris: [
        ['Space', 'Play / pause'],
        ['←  →', 'Step one angle'],
        ['Drag', 'Rotate the volume with mouse or finger'],
        ['F', 'Full screen'],
        ['P', 'Hide the control panel']
      ]
    },
    {
      judul: 'Projection mode',
      baris: [
        ['MIP', 'Highest value along each ray: good for bone and vessels'],
        ['Volume', 'Opacity ray casting with adjustable density and gamma'],
        ['Average', 'Looks like a digital radiograph'],
        ['Surface', 'Shaded isosurface with an adjustable threshold']
      ]
    },
    {
      judul: 'Setting up the prism',
      baris: [
        ['Prism apex', 'Sits exactly on the centre mark'],
        ['Face size', 'Match the width of a prism face'],
        ['Distance to centre', 'Adjust until the four reflections overlap'],
        ['Mirror', 'Turn on if the image reads backwards'],
        ['Reverse direction', 'Swaps the rotation direction']
      ]
    },
    UMUM
  ];

  /* ---------- render ---------- */
  var back = null;
  var fokusSebelum = null;

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function grupHTML(g) {
    return '<section class="sc-grup">' +
      '<h4>' + esc(g.judul) + '</h4><dl>' +
      g.baris.map(function (b) {
        var tombol = b[0].split(/\s{2,}/).map(function (t) {
          return '<kbd>' + esc(t) + '</kbd>';
        }).join('<span class="atau">or</span>');
        return '<div><dt>' + tombol + '</dt><dd>' + esc(b[1]) + '</dd></div>';
      }).join('') +
      '</dl></section>';
  }

  function halaman() {
    var f = location.pathname.split('/').pop();
    if (f.indexOf('viewer') === 0) return 'viewer';
    if (f.indexOf('prisma') === 0) return 'prisma';
    return 'worklist';
  }

  function buka() {
    if (back) return tutup();
    var mode = halaman();
    var grup = mode === 'viewer' ? VIEWER : mode === 'prisma' ? PRISMA : WORKLIST;

    fokusSebelum = document.activeElement;
    back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal sc-modal" role="dialog" aria-modal="true" aria-labelledby="scJudul">' +
        '<header>' +
          '<h3 id="scJudul">Pintasan papan ketik</h3>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-sm" data-tutup aria-label="Tutup dialog pintasan">Tutup</button>' +
        '</header>' +
        '<div class="body sc-body">' + grup.map(grupHTML).join('') + '</div>' +
        '<footer>' +
          '<span style="font-size:11.5px;color:var(--muted);margin-right:auto">' +
            (mode === 'viewer' ? 'Tool shortcuts are disabled while typing in a text field.'
             : mode === 'prisma' ? 'Dim the room lights for the clearest reflections.'
             : 'Studies page: open the viewer for tool shortcuts.') +
          '</span>' +
          '<button class="btn btn-sm btn-primary" data-tutup>Mengerti</button>' +
        '</footer>' +
      '</div>';
    document.body.appendChild(back);

    K.qsa('[data-tutup]', back).forEach(function (b) {
      b.addEventListener('click', tutup);
    });
    back.addEventListener('click', function (e) { if (e.target === back) tutup(); });
    back.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); tutup(); return; }
      if (e.key !== 'Tab') return;
      /* jaga fokus tetap di dalam dialog */
      var f = K.qsa('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', back)
        .filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var pertama = f[0], terakhir = f[f.length - 1];
      if (e.shiftKey && document.activeElement === pertama) { e.preventDefault(); terakhir.focus(); }
      else if (!e.shiftKey && document.activeElement === terakhir) { e.preventDefault(); pertama.focus(); }
    });

    var awal = back.querySelector('[data-tutup]');
    if (awal) awal.focus();
  }

  function tutup() {
    if (!back) return;
    back.remove();
    back = null;
    if (fokusSebelum && fokusSebelum.focus) { try { fokusSebelum.focus(); } catch (e) {} }
    fokusSebelum = null;
  }

  /* "?" (Shift+/) membuka dialog dari mana saja kecuali kolom teks */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '?') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    e.preventDefault();
    buka();
  });

  global.MEDIVOX_BANTUAN = buka;
  global.MEDIVOX_BANTUAN_TUTUP = tutup;
})(window);
