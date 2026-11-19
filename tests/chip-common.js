// shared test harness for chip-2a03 / chip-sid (headless Chrome, puppeteer-core)
const puppeteer = require('/tmp/pt/node_modules/puppeteer-core');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function parseSMF(b){ const s=(o,n)=>String.fromCharCode(...b.slice(o,o+n)); if(s(0,4)!=='MThd') throw new Error('no MThd');
  const fmt=b[8]<<8|b[9], ntr=b[10]<<8|b[11]; let o=14, tracks=[];
  for(let t=0;t<ntr;t++){ if(s(o,4)!=='MTrk') throw new Error('no MTrk '+t); const L=(b[o+4]<<24|b[o+5]<<16|b[o+6]<<8|b[o+7])>>>0; let p=o+8, end=p+L, on=0, off=0, name='', run=0, eot=false;
    while(p<end){ let d=0,c; do{ c=b[p++]; d=(d<<7)|(c&127);}while(c&128); let st=b[p]; if(st&128){ p++; run=st; } else st=run;
      if(st===0xFF){ const ty=b[p++]; let l=0; do{ c=b[p++]; l=(l<<7)|(c&127);}while(c&128); if(ty===3) name=s(p,l); if(ty===0x2F) eot=true; p+=l; }
      else { const hi=st&0xF0; if(hi===0x90){ b[p+1]?on++:off++; p+=2; } else if(hi===0x80){ off++; p+=2; } else if(hi===0xC0||hi===0xD0) p+=1; else p+=2; } }
    if(p!==end||!eot) throw new Error('bad track '+t); tracks.push({name,on,off}); o=end; }
  return {fmt,ntr,tracks}; }
module.exports = async function run(slug, extra) {
  const dir = path.resolve(__dirname, '..', slug), url = 'file://' + dir + '/index.html';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const res = { slug, errors: [], pass: true, notes: [] }; const fail = m => { res.pass = false; res.notes.push('FAIL ' + m); };
  try {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') res.errors.push(m.text()); });
    page.on('pageerror', e => res.errors.push('pageerror: ' + e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload(); await sleep(400);
    await page.screenshot({ path: dir + '/shot.png' });
    const presets = await page.evaluate(() => VS.PRESETS.length);
    res.presets = [];
    for (let i = 0; i < presets; i++) {
      await page.evaluate(i => { VS.loadPreset(i); VS.play(); }, i);
      await sleep(400);
      const m = await page.evaluate(async () => { const an = VS.AU.an, pre = VS.AU.anPre, b = new Float32Array(an.fftSize), b2 = new Float32Array(pre.fftSize); let pk = 0, pk2 = 0, nan = 0, ss = 0, n = 0;
        const t0 = performance.now(); while (performance.now() - t0 < 2500) { an.getFloatTimeDomainData(b); pre.getFloatTimeDomainData(b2);
          for (const x of b) { if (x !== x) nan++; else { pk = Math.max(pk, Math.abs(x)); ss += x * x; n++; } } for (const x of b2) if (x === x) pk2 = Math.max(pk2, Math.abs(x)); await new Promise(r => setTimeout(r, 20)); }
        return { peakDb: 20 * Math.log10(pk || 1e-9), prePeakDb: 20 * Math.log10(pk2 || 1e-9), rmsDb: 20 * Math.log10(Math.sqrt(ss / n) || 1e-9), nan, mode: VS.AU.mode, state: VS.AU.ctx.state }; });
      m.preset = i; res.presets.push(m);
      if (m.nan) fail('NaN in preset ' + i); if (m.peakDb >= 0) fail('peak >= 0 dBFS preset ' + i); if (m.rmsDb < -45) fail('silent preset ' + i);
      if (i === 0) await page.screenshot({ path: dir + '/shot-playing.png' });
      await page.evaluate(() => VS.stop()); await sleep(150);
    }
    // stop message silences
    await page.evaluate(() => { VS.loadPreset(0); VS.play(); }); await sleep(600);
    await page.evaluate(() => window.postMessage({ type: 'vsynths:stop' }, '*')); await sleep(700);
    res.afterStop = await page.evaluate(async () => { const an = VS.AU.an, b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let pk = 0; for (const x of b) pk = Math.max(pk, Math.abs(x)); return { playing: VS.isPlaying ? VS.isPlaying() : null, state: VS.AU.ctx.state, peak: pk }; });
    if (res.afterStop.state === 'running' && res.afterStop.peak > 0.01) fail('sound after vsynths:stop');
    // live keyboard note (computer key)
    await page.evaluate(() => VS.AU.ctx.resume()); await page.keyboard.down('KeyA'); await sleep(500);
    res.keyNote = await page.evaluate(() => { const an = VS.AU.an, b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let pk = 0; for (const x of b) pk = Math.max(pk, Math.abs(x)); return pk; });
    await page.keyboard.up('KeyA'); if (res.keyNote < 0.005) fail('computer key note silent');
    // on-screen key tap
    const kb = await page.$('#kb .w'); const bb = await kb.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height * 0.8); await page.mouse.down(); await sleep(300);
    res.tapNote = await page.evaluate(() => { const an = VS.AU.an, b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let pk = 0; for (const x of b) pk = Math.max(pk, Math.abs(x)); return pk; });
    await page.mouse.up(); if (res.tapNote < 0.005) fail('on-screen key silent');
    // MIDI export
    const bytes = await page.evaluate(() => Array.from(VS.buildMidi()));
    try { res.midi = parseSMF(bytes); res.midi.bytes = bytes.length; if (res.midi.tracks.reduce((a, t) => a + t.on, 0) < 4) fail('midi has too few notes'); if (res.midi.tracks.some(t => t.on !== t.off)) fail('midi on/off mismatch'); } catch (e) { fail('midi ' + e.message); }
    // knob drag changes a value
    if (extra) await extra(page, res, fail, sleep);
    // fallback engine (ScriptProcessor)
    const p2 = await browser.newPage(); p2.on('pageerror', e => res.errors.push('fallback pageerror: ' + e.message));
    await p2.evaluateOnNewDocument(() => { window.VS_FORCE_SCRIPT = true; }); await p2.goto(url); await sleep(300);
    await p2.evaluate(() => { VS.loadPreset(0); VS.play(); }); await sleep(1500);
    res.fallback = await p2.evaluate(() => { const an = VS.AU.an, b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let pk = 0, nan = 0; for (const x of b) { if (x !== x) nan++; pk = Math.max(pk, Math.abs(x)); } return { mode: VS.AU.mode, pk, nan }; });
    if (res.fallback.pk < 0.005 || res.fallback.nan) fail('fallback engine');
    await p2.close();
    // iPhone landscape
    const ph = await browser.newPage(); await ph.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await ph.goto(url); await sleep(400);
    await ph.screenshot({ path: dir + '/shot-iphone.png' });
    res.iphone = await ph.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fits: r.width <= innerWidth + 1 && r.height <= innerHeight + 1, scroll: document.scrollingElement.scrollHeight <= innerHeight + 1 }; });
    if (!res.iphone.fits) fail('iphone does not fit');
    // touch on knob via touchscreen
    await ph.close();
  } catch (e) { fail('exception ' + e.stack); }
  await browser.close();
  if (res.errors.length) fail('console errors: ' + res.errors.join(' | '));
  console.log(JSON.stringify(res, null, 1)); console.log(res.pass ? 'PASS ' + slug : 'FAILED ' + slug);
  process.exitCode = res.pass ? 0 : 1; return res;
};
