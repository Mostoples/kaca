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
    judul: 'Umum',
    baris: [
      ['?', 'Buka / tutup dialog pintasan ini'],
      ['Esc', 'Tutup dialog, laci, atau batalkan aksi'],
      ['Tab', 'Pindah fokus antar kontrol']
    ]
  };

  var WORKLIST = [
    {
      judul: 'Antrian baca',
      baris: [
        ['↑  ↓', 'Pilih studi sebelumnya / berikutnya'],
        ['Enter', 'Buka studi terpilih di viewer'],
        ['Klik ganda', 'Buka studi langsung'],
        ['Klik judul kolom', 'Urutkan naik / turun']
      ]
    },
    UMUM
  ];

  var VIEWER = [
    {
      judul: 'Alat',
      baris: [
        ['W', 'Window / Level'],
        ['P', 'Geser (pan)'],
        ['Z', 'Perbesar'],
        ['S', 'Gulir irisan'],
        ['L', 'Ukur panjang'],
        ['A', 'Ukur sudut'],
        ['R', 'ROI persegi'],
        ['E', 'ROI elips'],
        ['D', 'Probe nilai piksel'],
        ['T', 'Anotasi teks']
      ]
    },
    {
      judul: 'Tampilan',
      baris: [
        ['I', 'Inversi'],
        ['V', 'Cermin vertikal'],
        ['F', 'Pas ke layar'],
        ['0', 'Reset tampilan'],
        ['H', 'Sembunyikan overlay'],
        ['1', 'Tata letak 1×1'],
        ['2', 'Tata letak 1×2'],
        ['3', 'Tata letak 1×3'],
        ['4', 'Tata letak 2×2']
      ]
    },
    {
      judul: 'Navigasi irisan',
      baris: [
        ['←  →', 'Irisan sebelumnya / berikutnya'],
        ['↑  ↓', 'Irisan sebelumnya / berikutnya'],
        ['Spasi', 'Putar / jeda cine']
      ]
    },
    {
      judul: 'Tetikus',
      baris: [
        ['Seret kiri', 'Jalankan alat yang aktif'],
        ['Seret tengah', 'Geser citra'],
        ['Seret kanan', 'Perbesar / perkecil'],
        ['Roda', 'Gulir irisan'],
        ['Ctrl + roda', 'Perbesar / perkecil'],
        ['Shift + seret', 'Geser citra'],
        ['Klik ganda', 'Ganti tata letak 1×1 ↔ 2×2']
      ]
    },
    {
      judul: 'Layar sentuh',
      baris: [
        ['Satu jari', 'Jalankan alat yang aktif'],
        ['Dua jari', 'Cubit untuk memperbesar dan menggeser']
      ]
    },
    {
      judul: '3D, MPR & MIP',
      baris: [
        ['Panel seri', 'Tombol "Bangun 3D & MPR" di bawah daftar seri'],
        ['Hasilnya', 'Muncul sebagai seri baru: MPR, MIP, dan proyeksi 3D'],
        ['Seri 3D', 'Gulir irisan memutar volume; Spasi memutarnya otomatis'],
        ['Permukaan', '"Rekonstruksi permukaan" membuat isosurface pada satu ambang'],
        ['Unduh', 'Tombol STL dan OBJ menyimpan jaringnya dalam milimeter'],
        ['Prisma', 'Tombol "Prisma hologram" membuka tampilan piramida']
      ]
    },
    UMUM
  ];

  var PRISMA = [
    {
      judul: 'Panggung hologram',
      baris: [
        ['Spasi', 'Putar / jeda'],
        ['←  →', 'Geser satu sudut'],
        ['Seret', 'Putar volume dengan tetikus atau jari'],
        ['F', 'Layar penuh'],
        ['P', 'Sembunyikan panel kontrol']
      ]
    },
    {
      judul: 'Mode proyeksi',
      baris: [
        ['MIP', 'Nilai tertinggi sepanjang sinar — bagus untuk tulang & pembuluh'],
        ['Volume', 'Ray-cast beropasitas; kepadatan & gamma bisa disetel'],
        ['Rerata', 'Mirip radiograf digital'],
        ['Permukaan', 'Isosurface bernaung; ambangnya bisa digeser']
      ]
    },
    {
      judul: 'Menyiapkan prisma',
      baris: [
        ['Puncak prisma', 'Diletakkan tepat di penanda tengah layar'],
        ['Ukuran sisi', 'Disamakan dengan lebar bidang prisma'],
        ['Jarak ke pusat', 'Digeser sampai keempat pantulan bertumpuk'],
        ['Cermin', 'Dinyalakan bila citra terbaca terbalik'],
        ['Balik arah', 'Menukar arah putar antar sisi']
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
        }).join('<span class="atau">atau</span>');
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
            (mode === 'viewer' ? 'Pintasan alat tidak aktif saat kursor berada di kolom teks.'
             : mode === 'prisma' ? 'Matikan lampu ruangan untuk pantulan yang paling jelas.'
             : 'Halaman worklist — buka viewer untuk pintasan alat.') +
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
