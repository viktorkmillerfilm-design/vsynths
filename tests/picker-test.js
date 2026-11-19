// picker shell test: http (HEAD probing, coming-soon, stop message, hash, persistence) + file:// + iPhone landscape
const puppeteer = require('/tmp/pt/node_modules/puppeteer-core');
const path = require('path'), { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const root = path.resolve(__dirname, '..'), port = 8000 + Math.floor(Math.random() * 900);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(800);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const R = { notes: [] }, fail = m => R.notes.push('FAIL ' + m), errs = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.setViewport({ width: 1280, height: 800 });
    // simulate a not-yet-copied instrument: answer 404 for minimoog/index.html
    await page.setRequestInterception(true); page.on('request', q => { if (/minimoog\/index\.html/.test(q.url())) q.respond({ status: 404, body: 'nf' }); else q.continue(); });
    await page.goto(base + 'index.html'); await page.evaluate(() => localStorage.clear()); await page.goto(base + 'index.html#chip-2a03'); await sleep(1200);
    R.items = await page.$$eval('#list a', a => a.map(x => x.dataset.id)); if (R.items.length !== 15) fail('list has ' + R.items.length);
    R.selectVisible = await page.$eval('#pick', e => getComputedStyle(e).display !== 'none'); if (R.selectVisible) fail('select shown on desktop');
    R.src0 = await page.$eval('#fr', f => f.getAttribute('src')); if (R.src0 !== 'chip-2a03/index.html') fail('hash not honoured ' + R.src0);
    await page.screenshot({ path: root + '/tests/picker-desktop.png' });
    // start the 2a03 playing inside the frame and spy on the stop message
    const fh = await (await page.$('#fr')).contentFrame();
    await fh.evaluate(() => { VS.loadPreset(0); VS.play(); window.addEventListener('message', e => { if (e.data && e.data.type === 'vsynths:stop') parent.__stopSeen = (parent.__stopSeen || 0) + 1; }); });
    await sleep(800);
    R.playingBefore = await fh.evaluate(() => VS.AU.ctx.state);
    await page.click('#list a[data-id="chip-sid"]'); await sleep(1200);
    R.stopSeen = await page.evaluate(() => window.__stopSeen || 0); if (!R.stopSeen) fail('old frame did not get vsynths:stop');
    R.src1 = await page.$eval('#fr', f => f.getAttribute('src')); R.hash1 = await page.evaluate(() => location.hash);
    if (R.src1 !== 'chip-sid/index.html' || R.hash1 !== '#chip-sid') fail('switch ' + R.src1 + ' ' + R.hash1);
    R.frames = page.frames().length;
    // coming soon
    await page.click('#list a[data-id="minimoog"]'); await sleep(700);
    R.soon = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById('soon')).display, frameHidden: document.getElementById('fr').style.visibility, dim: document.querySelector('#list a[data-id="minimoog"]').classList.contains('soon') }));
    if (R.soon.shown !== 'flex' || !R.soon.dim) fail('coming soon ' + JSON.stringify(R.soon));
    await page.screenshot({ path: root + '/tests/picker-soon.png' });
    R.marked = await page.$$eval('#list a.soon', a => a.map(x => x.dataset.id));
    // persistence + hashchange
    await page.click('#list a[data-id="fm7"]'); await sleep(400);
    await page.goto(base + 'index.html'); await sleep(800);
    R.restored = await page.$eval('#fr', f => f.getAttribute('src')); if (R.restored !== 'fm7/index.html') fail('not restored ' + R.restored);
    await page.evaluate(() => location.hash = '#chip-sid'); await sleep(600);
    R.hashNav = await page.$eval('#fr', f => f.getAttribute('src')); if (R.hashNav !== 'chip-sid/index.html') fail('hashchange');
    // iframe attributes
    R.allow = await page.$eval('#fr', f => f.getAttribute('allow')); if (!/autoplay/.test(R.allow) || !/midi/.test(R.allow) || !/fullscreen/.test(R.allow)) fail('allow attr');
    // iPhone landscape
    const ph = await browser.newPage(); await ph.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ph.goto(base + 'index.html#chip-sid'); await sleep(1500);
    R.phone = await ph.evaluate(() => ({ select: getComputedStyle(document.getElementById('pick')).display, list: getComputedStyle(document.getElementById('list')).display, bar: document.getElementById('bar').offsetHeight, frameH: document.getElementById('fr').offsetHeight, scroll: document.scrollingElement.scrollHeight <= innerHeight + 1 }));
    if (R.phone.select === 'none' || R.phone.list !== 'none' || R.phone.bar > 34 || !R.phone.scroll) fail('phone layout ' + JSON.stringify(R.phone));
    await ph.screenshot({ path: root + '/tests/picker-iphone.png' });
    await ph.select('#pick', 'chip-2a03'); await sleep(800);
    R.phoneSwitch = await ph.$eval('#fr', f => f.getAttribute('src')); if (R.phoneSwitch !== 'chip-2a03/index.html') fail('phone select switch');
    // file:// (fetch HEAD blocked -> unknown -> still loads existing instruments)
    const fp = await browser.newPage(); await fp.goto('file://' + root + '/index.html#chip-sid'); await sleep(1500);
    R.file = await fp.evaluate(() => ({ src: document.getElementById('fr').getAttribute('src'), soon: getComputedStyle(document.getElementById('soon')).display }));
    const ff = (await (await fp.$('#fr')).contentFrame()); R.fileFrameOk = await ff.evaluate(() => typeof VS === 'object').catch(() => 'cross-origin (expected on file://)');
    if (R.file.src !== 'chip-sid/index.html' || R.file.soon !== 'none') fail('file:// ' + JSON.stringify(R.file));
  } catch (e) { fail('exception ' + e.stack); }
  await browser.close(); srv.kill();
  if (errs.length) fail('errors ' + errs.join(' | '));
  console.log(JSON.stringify(R, null, 1)); console.log(R.notes.length ? 'FAILED picker' : 'PASS picker'); process.exitCode = R.notes.length ? 1 : 0;
})();
