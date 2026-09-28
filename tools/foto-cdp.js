// Tangkap layar dengan emulasi perangkat lewat CDP (tanpa batas lebar jendela).
// pakai: node --experimental-websocket tools/foto-cdp.js tools/foto-tex.json
//   daftar: [{url, w, h, dpr, mobile, tunggu, out, penuh}]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROF = path.join(process.env.TEMP, 'medivox-foto');
const daftar = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const jeda = ms => new Promise(r => setTimeout(r, ms));
function ambilJSON(url) {
  return new Promise((ok, gagal) => http.get(url, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { gagal(e); } });
  }).on('error', gagal));
}

(async () => {
  const cr = spawn(CH, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9333',
    '--user-data-dir=' + PROF, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 40; i++) { try { info = await ambilJSON('http://127.0.0.1:9333/json/list'); break; } catch (e) { await jeda(250); } }
  const hal = info.find(t => t.type === 'page');
  const ws = new WebSocket(hal.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const tunggu = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
  const kirim = (method, params = {}) => new Promise(r => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await kirim('Page.enable');
  for (const j of daftar) {
    await kirim('Emulation.setDeviceMetricsOverride', {
      width: j.w, height: j.h, deviceScaleFactor: j.dpr || 1, mobile: !!j.mobile,
    });
    await kirim('Emulation.setTouchEmulationEnabled', { enabled: !!j.mobile });
    await kirim('Page.navigate', { url: j.url });
    await jeda(j.tunggu || 4000);
    if (j.js) await kirim('Runtime.evaluate', { expression: j.js, awaitPromise: true });
    if (j.js) await jeda(j.jedaJs || 1200);
    if (j.js) { const t = await kirim('Runtime.evaluate', { expression: 'document.title' }); console.log('JS', t.result.result.value); }
    const opsi = { format: j.out.endsWith('.jpg') ? 'jpeg' : 'png', quality: 92 };
    if (j.penuh) {
      const m = await kirim('Page.getLayoutMetrics');
      const tinggi = Math.ceil(m.result.cssContentSize.height);
      opsi.captureBeyondViewport = true;
      opsi.clip = { x: 0, y: 0, width: j.w, height: tinggi, scale: 1 };
    }
    const r = await kirim('Page.captureScreenshot', opsi);
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    fs.writeFileSync(j.out, Buffer.from(r.result.data, 'base64'));
    console.log('ok', j.out);
  }
  ws.close(); cr.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
