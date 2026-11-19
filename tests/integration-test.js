// integration: serve the folder over http, open the picker, switch through all 15 at desktop + iPhone landscape.
// Audio is measured inside each frame by tapping every connection to ctx.destination into an AnalyserNode.
const puppeteer = require('/tmp/pt/node_modules/puppeteer-core');
const path = require('path'), { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IDS = ['fm7','pd-cz','wavemass','fair-cmi','supersaw-8k','obx-a','minimoog','moog-modular','arp-soloist','juno-60','juno-106','alpha-juno','tb-303','chip-2a03','chip-sid'];
const TAP = () => {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC || AC.__tapped) return; AC.__tapped = 1;
  window.__ctxs = [];
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...a) {
    try { if (dst instanceof AudioDestinationNode) { const c = this.context; if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; window.__ctxs.push(c); } orig.call(this, c.__an); } } catch (e) {}
    return orig.call(this, dst, ...a);
  };
  window.__peak = async (ms) => { let pk = 0, nan = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { for (const c of window.__ctxs) { if (c.state !== 'running') continue; const b = new Float32Array(2048); c.__an.getFloatTimeDomainData(b); for (const x of b) { if (x !== x) nan++; else if (Math.abs(x) > pk) pk = Math.abs(x); } } await new Promise(r => setTimeout(r, 25)); } return { pk, nan, ctx: window.__ctxs.map(c => c.state) }; };
  window.addEventListener('message', e => { if (e.data && e.data.type === 'vsynths:stop') { try { parent.__stops = parent.__stops || {}; parent.__stops[location.pathname.split('/').slice(-2)[0]] = (parent.__stops[location.pathname.split('/').slice(-2)[0]] || 0) + 1; } catch (_) {} } });
};
(async () => {
  const root = path.resolve(__dirname, '..'), port = 8100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(800);
  const base = `http://127.0.0.1:${port}/index.html`;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const out = {};
  for (const mode of ['desktop', 'iphone']) {
    const page = await browser.newPage(); await page.evaluateOnNewDocument(TAP);
    if (mode === 'desktop') await page.setViewport({ width: 1280, height: 800 }); else await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    let errs = []; page.on('console', m => { if (m.type() === 'error') errs.push((m.location() && m.location().url || '').replace(/.*\/\/[^/]+\//, '') + ': ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(base + '#' + IDS[0]); await page.evaluate(() => localStorage.clear()); await sleep(300);
    let prev = null;
    for (const id of IDS) {
      const r = { errors: [] }; errs = [];
      if (prev) { // switch via picker UI
        if (mode === 'desktop') await page.click(`#list a[data-id="${id}"]`); else await page.select('#pick', id);
      } else await page.reload();
      await sleep(1800);
      r.src = await page.$eval('#fr', f => f.getAttribute('src'));
      if (prev) r.prevGotStop = await page.evaluate(p => (window.__stops || {})[p] || 0, prev);
      const fh = await (await page.$('#fr')).contentFrame();
      r.loaded = !!fh && await fh.evaluate(() => document.readyState === 'complete' && document.body.children.length > 0).catch(() => false);
      r.title = fh ? await fh.title().catch(() => '') : '';
      // 1) key press (desktop) / tap on the bottom area of the frame (iphone) then hold
      const box = await (await page.$('#fr')).boundingBox();
      if (mode === 'desktop') { await fh.evaluate(() => window.focus()); await page.mouse.click(box.x + 4, box.y + 4); await page.keyboard.down('KeyA'); r.key = await fh.evaluate(() => window.__peak(700)); await page.keyboard.up('KeyA'); }
      else { // tap a few points along the lower part of the frame (where keyboards live) and hold via touch
        let best = { pk: 0 }; for (const fy of [0.9, 0.82, 0.72]) { for (const fx of [0.35, 0.55]) {
          const x = box.x + box.width * fx, y = box.y + box.height * fy;
          const cdp = await page.target().createCDPSession();
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          const m = await fh.evaluate(() => window.__peak(450)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
          if (m.pk > best.pk) best = { ...m, at: [fx, fy] }; if (best.pk > 0.003) break; } if (best.pk > 0.003) break; }
        r.tap = best; }
      // 2) start the sequencer/arp with Space as a continuous source, then self-stop check
      await sleep(300); await page.keyboard.press('Space'); r.play = await fh.evaluate(() => window.__peak(1200));
      await fh.evaluate(() => window.postMessage({ type: 'vsynths:stop' }, '*')); await sleep(600);
      r.afterStop = await fh.evaluate(() => window.__peak(400));
      // restart so the picker switch has something to stop
      await page.keyboard.press('Space'); await sleep(300);
      r.errors = errs.slice();
      const heard = Math.max((r.key || r.tap || {}).pk || 0, r.play.pk);
      r.verdict = [r.loaded ? 'loaded' : 'NOT-LOADED', heard > 0.003 ? 'audio' : 'SILENT', r.afterStop.pk < 0.002 ? 'stops' : 'NOT-STOPPED', (r.key || r.tap).nan || r.play.nan ? 'NaN' : '', r.errors.length ? 'ERRORS' : '', prev ? (r.prevGotStop ? 'prev-got-stop' : 'PREV-NO-STOP') : ''].filter(Boolean).join(' ');
      out[mode + ':' + id] = r; console.log(mode.padEnd(7), id.padEnd(13), r.verdict, '| key/tap', ((r.key || r.tap).pk).toFixed(3), 'play', r.play.pk.toFixed(3), 'after', r.afterStop.pk.toFixed(4), r.errors.length ? JSON.stringify(r.errors).slice(0, 300) : '');
      prev = id;
    }
    // last one: switch back to the first to check the final frame gets the stop
    if (mode === 'desktop') await page.click(`#list a[data-id="${IDS[0]}"]`); else await page.select('#pick', IDS[0]);
    await sleep(800); console.log(mode, 'chip-sid got stop on switch away:', await page.evaluate(() => (window.__stops || {})['chip-sid'] || 0));
    await page.screenshot({ path: root + `/tests/integration-${mode}.png` });
    await page.close();
  }
  await browser.close(); srv.kill();
  require('fs').writeFileSync(path.join(root, 'tests', 'integration-result.json'), JSON.stringify(out, null, 1));
})();
