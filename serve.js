#!/usr/bin/env node
/* ==========================================================
   MEDIVOX — server statis untuk pengembangan lokal
   ----------------------------------------------------------
   Jalankan: node serve.js [port]

   Perlu dipakai (bukan `python -m http.server`) karena berkas
   assets/js/firebase-init.js adalah ES module: peramban menolak
   memuatnya bila server mengirim Content-Type yang salah, dan
   http.server bawaan Python di Windows sering mengirim
   "text/plain" untuk berkas .js.
   ========================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2], 10) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.dcm': 'application/dicom',
  '.md': 'text/markdown; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';

  /* jalur ramah tanpa .html, sama seperti cleanUrls di Firebase Hosting */
  let file = path.join(ROOT, rel);
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';

  /* jangan pernah keluar dari folder proyek */
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) {
    res.writeHead(403).end('Terlarang');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>Tidak ditemukan: ' +
        rel.replace(/[<&]/g, '') + '</p><p><a href="/">Kembali ke beranda</a></p>');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Medivox berjalan di http://localhost:' + PORT + '/');
  console.log('Tekan Ctrl+C untuk berhenti.');
});
