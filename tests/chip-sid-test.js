require('./chip-common.js')('chip-sid', async (page, res, fail, sleep) => {
  const kn = (await page.$$('.st .kn'))[0]; const b = await kn.boundingBox();
  const before = await page.evaluate(() => VS.S.v[0].pw);
  await page.mouse.move(b.x + b.width / 2, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y - 40, { steps: 8 }); await page.mouse.up();
  res.knobDrag = [before, await page.evaluate(() => VS.S.v[0].pw)]; if (res.knobDrag[0] === res.knobDrag[1]) fail('knob drag no change');
  // register encodings: control byte, ADSR, filter
  res.regs = await page.evaluate(async () => { VS.stop(); Object.assign(VS.S.v[0], { wave: 4, ring: 1, sync: 1, test: 0, a: 3, d: 12, s: 5, r: 7 }); Object.assign(VS.S.f, { fc: 0x5A3, res: 9, f1: 1, f2: 0, f3: 1, fx: 0, lp: 0, bp: 1, hp: 1, off3: 1, vol: 12 });
    VS.writeStatic(); VS.noteOn(0, 60, {}, 0); await new Promise(r => setTimeout(r, 250)); const r = VS.AU.snap.r; return { ctrl: r[4].toString(16), ad: r[5].toString(16), sr: r[6].toString(16), fclo: r[0x15], fchi: r[0x16].toString(16), resf: r[0x17].toString(16), mv: r[0x18].toString(16), freq: (r[0] | r[1] << 8).toString(16) }; });
  const R = res.regs; if (R.ctrl !== '47' || R.ad !== '3c' || R.sr !== '57' || R.fclo !== 3 || R.fchi !== 'b4' || R.resf !== '95' || R.mv !== 'ec' || R.freq !== '1167') fail('register encoding ' + JSON.stringify(R));
  // model switch audible for both models
  for (const m of [0, 1]) { const pk = await page.evaluate(async m => { VS.S.model = m; VS.loadPreset(1); VS.S.model = m; VS.send({ cmd: 'model', m }); VS.play(); await new Promise(r => setTimeout(r, 1200)); const an = VS.AU.an, b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let p = 0, nan = 0; for (const x of b) { if (x !== x) nan++; p = Math.max(p, Math.abs(x)); } VS.stop(); return [p, nan]; }, m); res['model' + m] = pk; if (pk[0] < 0.005 || pk[1]) fail('model ' + m); }
});
