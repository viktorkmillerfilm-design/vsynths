const puppeteer = require('/tmp/pt/node_modules/puppeteer-core');
const path = require('path'), fs = require('fs'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = path.resolve(__dirname, '..', 'obx-a'), URL0 = 'file://' + DIR + '/index.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
function parseSMF(b) { const s = (o, n) => String.fromCharCode(...b.slice(o, o + n)); const u32 = o => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  if (s(0, 4) !== 'MThd' || u32(4) !== 6) return { ok: false, why: 'header' }; const fmt = b[8] << 8 | b[9], ntr = b[10] << 8 | b[11], div = b[12] << 8 | b[13];
  let o = 14, on = 0, off = 0, open = {}; for (let t = 0; t < ntr; t++) { if (s(o, 4) !== 'MTrk') return { ok: false, why: 'trk' }; const L = u32(o + 4); let p = o + 8; const end = p + L; let rs = 0, last = null;
    while (p < end) { let d = 0, c; do { c = b[p++]; d = d << 7 | c & 127; } while (c & 128); let st = b[p]; if (st & 128) p++; else st = rs; rs = st;
      if (st === 0xFF) { const ty = b[p++]; let l = 0; do { c = b[p++]; l = l << 7 | c & 127; } while (c & 128); last = ty; p += l; }
      else { const hi = st & 0xF0, a = b[p++], v = (hi === 0xC0 || hi === 0xD0) ? 0 : b[p++]; if (hi === 0x90 && v) { on++; open[a] = (open[a] || 0) + 1; } else if (hi === 0x80 || hi === 0x90) { off++; open[a]--; } } }
    if (p !== end || last !== 0x2F) return { ok: false, why: 'trk end' }; o = end; }
  return { ok: o === b.length, fmt, ntr, div, on, off, balanced: Object.values(open).every(v => v === 0) }; }
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage(); const errors = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL0); await page.evaluate(() => localStorage.clear()); await page.reload(); await sleep(400);
  // unlock with a real click on the keyboard area (plays C3)
  await page.mouse.click(700, 700); await page.waitForFunction(() => OBXA.eng && OBXA.eng.ready && OBXA.ctx.state === 'running' && OBXA.ctx.currentTime > 0.3, { timeout: 8000 }); await sleep(300);
  const kind = await page.evaluate(() => OBXA.eng && OBXA.eng.kind); ok(kind === 'worklet', 'engine kind = ' + kind);
  // live audio meter helper on the analyser after the limiter
  const meter = ms => page.evaluate(async ms => { const a = OBXA.eng.ana, buf = new Float32Array(a.fftSize); let peak = 0, nan = 0, ss = 0, n = 0; const t0 = performance.now();
    while (performance.now() - t0 < ms) { a.getFloatTimeDomainData(buf); for (const x of buf) { if (!isFinite(x)) { nan++; continue; } peak = Math.max(peak, Math.abs(x)); ss += x * x; n++; } await new Promise(r => setTimeout(r, 20)); }
    return { peak, nan, rms: Math.sqrt(ss / Math.max(1, n)) }; }, ms);
  // 1) keys: chord via noteDown, 8 voices + steal
  await page.evaluate(() => { [48, 55, 60, 64, 67, 71, 74, 79, 83, 86].forEach(n => OBXA.noteDown(n)); });
  let m = await meter(900); ok(m.rms > 0.005 && m.peak < 1 && m.nan === 0, `poly chord (10 notes, 8 voices): rms ${m.rms.toFixed(4)} peak ${(20 * Math.log10(m.peak)).toFixed(2)} dBFS nan ${m.nan}` + (m.rms > 0.005 ? '' : ' DIAG ' + await page.evaluate(() => JSON.stringify([OBXA.eng.stats, OBXA.ctx.currentTime, OBXA.ctx.state, OBXA.S.hold, OBXA.S.arp, OBXA.S.mode, OBXA.S.up.vol]))));
  await page.evaluate(() => { [48, 55, 60, 64, 67, 71, 74, 79, 83, 86].forEach(n => OBXA.noteUp(n)); });
  // computer keyboard
  await page.keyboard.down('a'); await page.keyboard.down('d'); await page.keyboard.down('g'); m = await meter(500); await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('g');
  ok(m.rms > 0.005 && m.peak < 1, `computer keys a/d/g: rms ${m.rms.toFixed(4)}`);
  await sleep(1200);
  // 2) sequencer
  await page.evaluate(() => OBXA.play()); m = await meter(2500); ok(m.rms > 0.005 && m.peak < 1 && m.nan === 0, `sequencer play: rms ${m.rms.toFixed(4)} peak ${(20 * Math.log10(m.peak)).toFixed(2)} dBFS`);
  const st = await page.evaluate(() => OBXA.eng.stats); ok(st.nan === 0, 'worklet nan counter = ' + st.nan);
  await page.evaluate(() => OBXA.stop()); await sleep(1500); m = await meter(300); ok(m.rms < 0.002, 'silent after stop: rms ' + m.rms.toFixed(5));
  // 3) every preset, every mode: offline render (worklet in OfflineAudioContext)
  for (let i = 0; i < 8; i++) { const r = await page.evaluate(async i => { const p = OBXA.FACTORY[i]; return Object.assign(await OBXA.renderOffline(3, null, p), { name: p.name }); }, i);
    ok(r.kind === 'worklet' && r.nan === 0 && r.peak > 0.01 && r.peak < 1 && r.rms > 0.002, `offline preset ${i + 1} ${r.name} [${r.kind}]: peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(4)} nan ${r.nan}`); }
  // tuning: A4 single saw through an open filter should measure 440 Hz
  const hz = await page.evaluate(async () => { const sr = 44100, oc = new OfflineAudioContext(1, sr, sr); const p = Object.assign({}, OBXA.FACTORY[0], { o1saw: true, o1pul: false, o2saw: false, o2pul: false, cut: 1, fmod: 0, vdet: 0, det2: 0, tune: 0, aA: 0, aS: 1 });
    const e = new (OBXA.Engine)(oc); await e.init({ p0: p, events: [{ type: 'on', n: 69, v: 1, t: 0, layer: 0 }] }); const b = (await oc.startRendering()).getChannelData(0).slice(8000, 30000);
    let best = 0, bl = 0; for (let l = 60; l < 150; l++) { let c = 0; for (let i = 0; i < 8000; i++) c += b[i] * b[i + l]; if (c > best) { best = c; bl = l; } }
    let c0 = 0, c1 = 0, c2 = 0; for (let i = 0; i < 8000; i++) { c0 += b[i] * b[i + bl - 1]; c1 += b[i] * b[i + bl]; c2 += b[i] * b[i + bl + 1]; } const d = 0.5 * (c0 - c2) / (c0 - 2 * c1 + c2); return sr / (bl + d); });
  ok(Math.abs(hz - 440) < 3, 'A4 tuning ' + hz.toFixed(1) + ' Hz');
  // extreme patch: max res self-osc + sync + noise + all mods
  const ex = await page.evaluate(async () => { const p = Object.assign({}, OBXA.FACTORY[0], { res: 1, cut: 1, fmod: 1, sync: true, fenv2: true, noise: 1, o1pul: true, o2pul: true, lfoDepth: 1, lfoPwm: 1, m1f1: true, m1f2: true, m1flt: true, m2pw1: true, m2pw2: true, m2vol: true, lfoWave: 2, lfoRate: 1, vdet: 1, unison: true });
    return OBXA.renderOffline(2, [[0, [24, 36, 48, 96, 108]], [0.5, [127, 0]]], p); });
  ok(ex.nan === 0, `extreme patch: nan ${ex.nan} raw peak ${ex.peak.toFixed(2)}`);
  // modes live: split / double / unison
  for (const md of ['split', 'double']) { await page.evaluate(md => OBXA.setMode(md), md); await page.evaluate(() => [40, 52, 64, 67, 71, 76].forEach(n => OBXA.noteDown(n))); m = await meter(700);
    ok(m.rms > 0.005 && m.peak < 1 && m.nan === 0, `${md} mode: rms ${m.rms.toFixed(4)} peak ${(20 * Math.log10(m.peak)).toFixed(2)} dBFS`); await page.evaluate(() => [40, 52, 64, 67, 71, 76].forEach(n => OBXA.noteUp(n))); await page.evaluate(md => OBXA.setMode(md), md); await sleep(300); }
  await page.evaluate(() => OBXA.loadProg(3)); await page.evaluate(() => { OBXA.noteDown(36); OBXA.noteDown(43); }); m = await meter(700);
  ok(m.rms > 0.005 && m.peak < 1, `unison bass (legato): rms ${m.rms.toFixed(4)} peak ${(20 * Math.log10(m.peak)).toFixed(2)} dBFS`); await page.evaluate(() => { OBXA.noteUp(36); OBXA.noteUp(43); });
  // arp
  await page.evaluate(() => { OBXA.loadProg(0); if (!OBXA.S.arp.on) document.getElementById('arpBtn').click(); [60, 64, 67].forEach(n => OBXA.noteDown(n)); });
  m = await meter(1200); ok(m.rms > 0.003 && m.peak < 1, `arpeggiator: rms ${m.rms.toFixed(4)} arp on ${await page.evaluate(() => OBXA.S.arp.on)}`);
  // 4) MIDI export (arp pattern while arp held, then sequence)
  let midi = await page.evaluate(() => Array.from(OBXA.buildMidi())); let r = parseSMF(midi); ok(r.ok && r.balanced && r.on > 10, `MIDI (arp) SMF valid: ${JSON.stringify(r)}`);
  await page.evaluate(() => { [60, 64, 67].forEach(n => OBXA.noteUp(n)); OBXA.stopAll(); OBXA.S.arp.on = false; });
  midi = await page.evaluate(() => Array.from(OBXA.buildMidi())); r = parseSMF(midi); ok(r.ok && r.balanced && r.on > 20 && r.fmt === 0, `MIDI (sequence) SMF valid: ${JSON.stringify(r)}`);
  fs.writeFileSync('/tmp/obx-a-test.mid', Buffer.from(midi));
  // download via button
  const client = await page.target().createCDPSession(); const dl = '/tmp/obxa-dl'; fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl);
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }); await page.click('#midiBtn'); await sleep(1200);
  const files = fs.readdirSync(dl); ok(files.length === 1 && files[0].endsWith('.mid') && parseSMF([...fs.readFileSync(path.join(dl, files[0]))]).ok, 'MIDI button download: ' + files.join(','));
  // 5) UI: knob drag changes value, program buttons
  const cut0 = await page.evaluate(() => OBXA.S.up.cut); const kb = await page.evaluate(() => { const r = document.querySelector('.knob[data-key="cut"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(kb.x, kb.y); await page.mouse.down(); await page.mouse.move(kb.x, kb.y - 60, { steps: 6 }); await page.mouse.up();
  const cut1 = await page.evaluate(() => OBXA.S.up.cut); ok(cut1 > cut0, `filter FREQUENCY knob drag ${cut0.toFixed(2)} -> ${cut1.toFixed(2)}`);
  await page.evaluate(() => OBXA.loadProg(0));
  await page.screenshot({ path: DIR + '/shot.png' });
  // 6) iframe embed + vsynths:stop message
  const srv = http.createServer((q, s) => { if (q.url.startsWith('/obx')) { s.setHeader('content-type', 'text/html'); s.end(fs.readFileSync(DIR + '/index.html')); } else { s.setHeader('content-type', 'text/html'); s.end('<body style="margin:0"><iframe id=f src="/obx" allow="autoplay; midi" style="width:1200px;height:600px;border:0"></iframe></body>'); } }).listen(0);
  const port = srv.address().port; const p2 = await browser.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message)); p2.on('console', m => { if (m.type() === 'error') e2.push(m.text()); });
  await p2.setViewport({ width: 1280, height: 700 }); await p2.goto(`http://127.0.0.1:${port}/`); await sleep(800);
  const fr = p2.frames().find(f => f.url().includes('/obx')); await p2.mouse.click(600, 560); await sleep(500);
  await fr.evaluate(() => { OBXA.play(); [60, 64, 67].forEach(n => OBXA.noteDown(n)); });
  const fm = ms => fr.evaluate(async ms => { const a = OBXA.eng.ana, b = new Float32Array(a.fftSize); let ss = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { a.getFloatTimeDomainData(b); for (const x of b) { ss += x * x; n++; } await new Promise(r => setTimeout(r, 20)); } return Math.sqrt(ss / n); }, ms);
  const before = await fm(800); await p2.evaluate(() => document.getElementById('f').contentWindow.postMessage({ type: 'vsynths:stop' }, '*')); await sleep(600); const after = await fm(400);
  ok(before > 0.005 && after < 0.001 && !(await fr.evaluate(() => OBXA.playing)), `iframe: sound ${before.toFixed(4)} -> after vsynths:stop ${after.toFixed(5)}`);
  ok(e2.length === 0, 'iframe errors: ' + JSON.stringify(e2)); srv.close(); await p2.close();
  // 7) iPhone landscape
  const ph = await browser.newPage(); const e3 = []; ph.on('pageerror', e => e3.push(e.message));
  await ph.emulate({ viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2, isLandscape: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await ph.goto(URL0); await sleep(500);
  const fitInfo = await ph.evaluate(() => { const r = document.getElementById('panel').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
  ok(fitInfo.w <= 844 && fitInfo.h <= 390 && fitInfo.sw <= 844, 'iphone fit ' + JSON.stringify(fitInfo));
  await ph.touchscreen.tap(400, 340); await sleep(500);
  const touchSound = await ph.evaluate(() => !!OBXA.eng && OBXA.ctx.state); ok(touchSound === 'running', 'touch unlocks audio: ' + touchSound);
  await ph.screenshot({ path: DIR + '/shot-iphone.png' }); ok(e3.length === 0, 'iphone errors: ' + JSON.stringify(e3));
  ok(errors.length === 0, 'console errors/warnings: ' + JSON.stringify(errors));
  await browser.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
