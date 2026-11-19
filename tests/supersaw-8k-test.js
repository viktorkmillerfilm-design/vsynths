// headless test for /workspace/vsynths/supersaw-8k/index.html
const puppeteer = require('/tmp/pt/node_modules/puppeteer-core');
const path = require('path'), fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = path.resolve(__dirname, '../supersaw-8k'), URL_ = 'file://' + DIR + '/index.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
function parseSmf(b) { // minimal SMF validator: header + tracks + balanced note on/off
  const s = (o, n) => String.fromCharCode(...b.slice(o, o + n)); if (s(0, 4) !== 'MThd') return 'no MThd';
  const ntr = b[10] << 8 | b[11]; let o = 14, ons = 0, offs = 0, end = false;
  for (let t = 0; t < ntr; t++) { if (s(o, 4) !== 'MTrk') return 'no MTrk'; const L = b[o + 4] << 24 | b[o + 5] << 16 | b[o + 6] << 8 | b[o + 7]; let p = o + 8; const e = p + L; let rs = 0;
    while (p < e) { while (b[p] & 0x80) p++; p++; let st = b[p]; if (st & 0x80) { rs = st; p++; } else st = rs;
      if (st === 0xFF) { const ty = b[p], ln = b[p + 1]; if (ty === 0x2F) end = true; p += 2 + ln; } else { const hi = st & 0xF0; if (hi === 0x90 && b[p + 1] > 0) ons++; else if (hi === 0x80 || hi === 0x90) offs++; p += (hi === 0xC0 || hi === 0xD0) ? 1 : 2; } }
    if (p !== e) return 'track length mismatch'; o = e; }
  return { ons, offs, end, ntr };
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errors = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL_); await page.evaluate(() => localStorage.clear()); await page.reload(); await sleep(300);
  await page.mouse.click(5, 5); // first gesture -> audio unlock
  await page.waitForFunction(() => VS8K.ready, { timeout: 5000 });
  await page.waitForFunction(() => VS8K.ctx.currentTime > 0.3, { timeout: 5000 }); // audio clock running (box may be busy)
  ok(await page.evaluate(() => VS8K.worklet), 'engine runs in AudioWorklet');
  const meter = async ms => { await page.evaluate(() => VS8K.resetMeter()); await sleep(ms); return page.evaluate(() => VS8K.meter()); };
  // computer keyboard chord
  for (const k of ['a', 'd', 'g']) await page.keyboard.down(k);
  let m = await meter(1200); for (const k of ['a', 'd', 'g']) await page.keyboard.up(k);
  ok(m.peak > 0.02 && m.peak < 1 && m.nan === 0, `keyboard chord: peak ${m.peak.toFixed(3)} (${(20 * Math.log10(m.peak)).toFixed(1)} dBFS) nan ${m.nan}`);
  await page.screenshot({ path: DIR + '/shot.png' });
  // on-screen key click
  const key = await page.evaluate(() => { const r = document.querySelector('.wk[data-n="60"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 }; });
  await sleep(1200); await page.mouse.move(key.x, key.y); await page.mouse.down(); m = await meter(500); await page.mouse.up();
  ok(m.peak > 0.02 && m.peak < 1, `on-screen key: peak ${m.peak.toFixed(3)}`);
  // every preset: 8-note full chord (voice stealing) + arp run
  for (let i = 0; i < 8; i++) {
    await page.evaluate(i => { VS8K.stopAll(); VS8K.loadPatch(i, 0); }, i); await sleep(1700);
    await page.evaluate(() => { for (const n of [48, 52, 55, 60, 64, 67, 72, 76, 79, 84]) VS8K.noteDown(n, 1); });
    const a = await meter(1300); await page.evaluate(() => { for (const n of [48, 52, 55, 60, 64, 67, 72, 76, 79, 84]) VS8K.noteUp(n); });
    await page.evaluate(() => VS8K.arpToggleRun()); const b = await meter(1500); await page.evaluate(() => VS8K.arpToggleRun());
    const nm = await page.evaluate(i => VS8K.PRESETS[i].name, i);
    ok(a.peak > 0.01 && a.peak < 1 && a.nan === 0 && b.peak > 0.01 && b.peak < 1 && b.nan === 0, `preset ${i + 1} ${nm}: chord peak ${a.peak.toFixed(3)}, arp peak ${b.peak.toFixed(3)}`);
  }
  // every osc1 / osc2 waveform, filter type/slope, multi-fx, delay type, with extreme knobs (stress: max resonance, x-mod, ring, sync)
  await page.evaluate(() => { VS8K.stopAll(); VS8K.loadPatch(0, 0); }); await sleep(1700);
  let worst = 0, nans = 0, silent = [];
  for (let w = 0; w < 7; w++) for (const o2 of [0, 3]) {
    await page.evaluate((w, o2) => { const s = VS8K.setV; s('o1w', w); s('o2w', o2); s('res', 127); s('xmod', 127); s('ring', 1); s('sync', 1); s('o1c1', 127); s('o1c2', 127); s('cut', 127); s('fType', w % 3); s('fSlope', w % 2); s('mfx', (w * 2 + o2) % 13); s('dly', w % 5); s('mfxLvl', 127); s('dLvl', 127); s('dFb', 127);
      for (const n of [36, 60, 96]) VS8K.noteDown(n, 1); }, w, o2);
    const r = await meter(500); await page.evaluate(() => { for (const n of [36, 60, 96]) VS8K.noteUp(n); }); worst = Math.max(worst, r.peak); nans += r.nan; if (r.peak < 0.005) silent.push(w + '/' + o2);
  }
  ok(worst < 1 && nans === 0 && !silent.length, `stress all waveforms/filters/fx: worst peak ${worst.toFixed(3)} (${(20 * Math.log10(worst)).toFixed(2)} dBFS), nan ${nans}, silent ${silent.join(',') || 'none'}`);
  // ribbon, lever, motion control record + play
  await page.evaluate(() => { VS8K.stopAll(); VS8K.loadPatch(1, 0); }); await sleep(1700);
  const mo = await page.evaluate(async () => { VS8K.arpToggleRun(); document.querySelectorAll('.btn.rd')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    for (let i = 0; i < 20; i++) { VS8K.setV('cut', 20 + i * 5); await new Promise(r => setTimeout(r, 40)); } return VS8K.motion.sets[0].length; });
  ok(mo >= 15, 'motion control recorded ' + mo + ' knob events');
  m = await meter(800); ok(m.peak > 0.01 && m.peak < 1, 'arp + motion running: peak ' + m.peak.toFixed(3));
  // vsynths:stop -> silence
  await page.evaluate(() => window.postMessage({ type: 'vsynths:stop' }, '*')); await sleep(400);
  m = await meter(1000); ok(m.peak < 0.001 && !(await page.evaluate(() => VS8K.arpRunning)), 'vsynths:stop silences everything: peak after ' + m.peak.toExponential(2));
  // plays again after stop
  await page.keyboard.down('h'); m = await meter(500); await page.keyboard.up('h'); ok(m.peak > 0.01, 'plays again after stop: ' + m.peak.toFixed(3));
  // MIDI export
  const bytes = await page.evaluate(() => Array.from(VS8K.buildMidi())); const smf = parseSmf(Uint8Array.from(bytes));
  fs.writeFileSync('/tmp/vs8k-test.mid', Buffer.from(bytes));
  ok(typeof smf === 'object' && smf.ons > 8 && smf.ons === smf.offs && smf.end, 'MIDI export valid SMF: ' + JSON.stringify(smf));
  const dl = await page.evaluate(() => new Promise(res => { const o = URL.createObjectURL; let got = null; HTMLAnchorElement.prototype.click = function () { got = this.download; }; VS8K.exportMidi(); setTimeout(() => res(got), 50); }));
  ok(/\.mid$/.test(dl || ''), 'export button downloads ' + dl);
  // knob drag
  const kn = await page.evaluate(() => { const e = [...document.querySelectorAll('.knob')].find(k => k.nextSibling && k.nextSibling.textContent === 'CUTOFF FREQ'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, v: VS8K.getV('cut') }; });
  await page.mouse.move(kn.x, kn.y); await page.mouse.down(); await page.mouse.move(kn.x, kn.y - 40, { steps: 5 }); await page.mouse.up();
  const v2 = await page.evaluate(() => VS8K.getV('cut')); ok(v2 !== kn.v, `knob drag changes cutoff ${kn.v} -> ${v2}`);
  // iframe embedding with allow attr + stop message from parent
  const host = '/tmp/vs8k-host.html'; fs.writeFileSync(host, `<!doctype html><body style="margin:0;height:2000px"><iframe id=f src="${URL_}" allow="autoplay; midi" style="width:900px;height:450px;border:0"></iframe><p id=p>below</p></body>`);
  const p2 = await browser.newPage(); const err2 = []; p2.on('pageerror', e => err2.push(e.message)); p2.on('console', m => { if (m.type() === 'error') err2.push(m.text()); });
  await p2.setViewport({ width: 1000, height: 600 }); await p2.goto('file://' + host); await sleep(600);
  const fr = p2.frames().find(f => f.url().includes('supersaw-8k'));
  await p2.mouse.click(450, 420); await fr.waitForFunction(() => VS8K.ready, { timeout: 5000 });
  await fr.evaluate(() => { VS8K.arpToggleRun(); }); await sleep(700); await fr.evaluate(() => VS8K.resetMeter()); await sleep(400); const before = await fr.evaluate(() => VS8K.meter().peak);
  await p2.evaluate(() => document.getElementById('f').contentWindow.postMessage({ type: 'vsynths:stop' }, '*')); await sleep(500); await fr.evaluate(() => VS8K.resetMeter()); await sleep(900);
  const after = await fr.evaluate(() => VS8K.meter().peak);
  await p2.evaluate(() => window.scrollTo(0, 500)); const sy = await p2.evaluate(() => scrollY);
  ok(before > 0.01 && after < 0.001 && sy > 0 && !err2.length, `iframe: plays (${before.toFixed(3)}), parent stop -> ${after.toExponential(2)}, host page still scrolls (${sy}), errors ${err2.length}`);
  await p2.close();
  // iPhone landscape screenshot
  await page.evaluate(() => VS8K.stopAll());
  const ph = await browser.newPage(); const err3 = []; ph.on('pageerror', e => err3.push(e.message));
  await ph.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ph.goto(URL_); await sleep(500);
  const tk = await ph.evaluate(() => { const r = document.querySelector('.wk[data-n="64"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 }; });
  await ph.touchscreen.tap(tk.x, tk.y); await sleep(400);
  const fitInfo = await ph.evaluate(() => { const r = document.getElementById('panel').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
  ok(fitInfo.w <= 844 && fitInfo.h <= 390 && fitInfo.x >= 0 && fitInfo.y >= 0 && !err3.length, 'iphone landscape fit ' + JSON.stringify(fitInfo));
  await ph.screenshot({ path: DIR + '/shot-iphone.png' }); await ph.close();
  // a desktop screenshot of the default patch with a lit chord
  await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await sleep(400);
  await page.evaluate(() => { VS8K.ensureAudio(); [57, 60, 64].forEach(n => VS8K.noteDown(n, 0.9)); VS8K.setV('cut', 92); }); await sleep(300);
  await page.screenshot({ path: DIR + '/shot.png' });
  const realErr = errors.filter(e => !/worklet unavailable/.test(e));
  ok(!realErr.length, 'no console errors/warnings' + (realErr.length ? ': ' + realErr.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
