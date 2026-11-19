require('./chip-common.js')('chip-2a03', async (page, res, fail, sleep) => {
  // drag the pulse-1 VOL/ENV knob up and check state + register write
  const kn = (await page.$$('.st .kn'))[0]; const b = await kn.boundingBox();
  const before = await page.evaluate(() => VS.S.ch[0].V);
  await page.mouse.move(b.x + b.width / 2, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y - 40, { steps: 8 }); await page.mouse.up();
  res.knobDrag = [before, await page.evaluate(() => VS.S.ch[0].V)]; if (res.knobDrag[0] === res.knobDrag[1]) fail('knob drag no change');
  // sweep/negate register encoding
  res.reg4001 = await page.evaluate(async () => { VS.S.ch[0].swEn = 1; VS.S.ch[0].swP = 3; VS.S.ch[0].swNeg = 1; VS.S.ch[0].swSh = 5; VS.noteOn(0, 60, {}, 0); await new Promise(r => setTimeout(r, 200)); return VS.AU.snap.r[1].toString(16); });
  if (res.reg4001 !== 'bd') fail('$4001 encoding ' + res.reg4001);
  // console details: controller START plays (power LED lights), d-pad moves cursor, A bumps value, port 2 = export
  await page.click('#mid .pills b:last-child'); await sleep(500);
  res.startLed = await page.evaluate(() => document.querySelector('#front .pled').classList.contains('on'));
  await page.click('#mid .pills b:last-child'); await sleep(200);
  const cur0 = await page.evaluate(() => document.querySelector('#trk .f.sel').parentElement.parentElement.firstChild.textContent);
  await page.click('#dp .d'); await page.click('#dp .d');
  res.dpad = [cur0, await page.evaluate(() => document.querySelector('#trk .f.sel').parentElement.parentElement.firstChild.textContent)];
  if (!res.startLed) fail('START did not play'); if (res.dpad[0] === res.dpad[1]) fail('d-pad no move');
  // tracker hex edit
  await page.evaluate(() => { VS.stop(); }); 
});
