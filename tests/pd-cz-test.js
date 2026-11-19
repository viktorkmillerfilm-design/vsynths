// pd-cz test: errors, all presets non-silent/<0dBFS/no NaN, waveforms x dcw, line modes, env edit, seq/arp, midi export, stop message, screenshots
const puppeteer=require('/tmp/pt/node_modules/puppeteer-core'); const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=path.resolve(__dirname,'..','pd-cz'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const smfOk=b=>{ const h=String.fromCharCode(...b.slice(0,4)), t=String.fromCharCode(...b.slice(14,18)); let ons=0; for(let i=18;i<b.length-2;i++) if((b[i]&0xf0)===0x90&&b[i+1]<128&&b[i+2]>0&&b[i+2]<128) ons++; return {ok:h==='MThd'&&t==='MTrk'&&ons>0,ons,len:b.length}; };
(async()=>{ const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage(); const errors=[]; page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); }); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.setViewport({width:1280,height:800}); await page.goto('file://'+dir+'/index.html'); await page.evaluate(()=>localStorage.clear()); await page.reload(); await sleep(400);
  await page.mouse.click(5,5); await page.evaluate(()=>VS.ensure()); await page.waitForFunction(()=>window.__eng&&VS.ctx.currentTime>0.3,{timeout:15000}); await sleep(600);
  ok(await page.evaluate(()=>window.__eng==='worklet'),'engine runs in AudioWorklet');
  const n=await page.evaluate(()=>PD.PRESETS.length);
  for(let i=0;i<n;i++){ await page.evaluate(i=>PD.press16(i),i); await sleep(60); await page.evaluate(()=>[48,55,60,64].forEach(n=>PD.noteOn(n,110)));
    const m=await page.evaluate(()=>VS.monitor(600)); await page.evaluate(()=>[48,55,60,64].forEach(n=>PD.noteOff(n))); await sleep(250);
    ok(m.peak>0.01&&m.peak<1&&!m.nan,`preset ${String.fromCharCode(65+i)} ${await page.evaluate(()=>PD.P.name)}: peak ${m.peakDb.toFixed(1)} dBFS`); }
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(300);
  // every waveform at dcw 0 / 99 sounds and stays finite
  let wOk=0; for(let w=1;w<=8;w++) for(const d of [0,99]){ await page.evaluate((w,d)=>{ PD.press16(4); const P=PD.P; P.lineSel=0; P.line[0].w1=w; P.line[0].w2=0; P.line[0].dcwE={r:[99,50,50,50,50,50,50,50],l:[d,d,0,0,0,0,0,0],sus:1,end:1}; PD.send(); },w,d); await sleep(30); await page.evaluate(()=>PD.noteOn(57,100)); const m=await page.evaluate(()=>VS.monitor(200)); await page.evaluate(()=>PD.noteOff(57)); await sleep(120);
    if(m.peak>0.005&&m.peak<1&&!m.nan) wOk++; }
  ok(wOk===16,`8 waveforms x dcw 0/99 audible+finite (${wOk}/16)`);
  // ring + noise modulation, line modes
  for(const [ls,md] of [[0,0],[1,0],[2,0],[3,1],[3,2]]){ await page.evaluate((ls,md)=>{ PD.press16(0); PD.P.lineSel=ls; PD.P.mod=md; PD.send(); },ls,md); await sleep(30);
    await page.evaluate(()=>[48,60].forEach(n=>PD.noteOn(n,100))); const m=await page.evaluate(()=>VS.monitor(300)); await page.evaluate(()=>[48,60].forEach(n=>PD.noteOff(n))); await sleep(150);
    ok(m.peak>0.005&&m.peak<1&&!m.nan,`line ${['1','2',"1+1'","1+2'"][ls]} mod ${['off','ring','noise'][md]}: peak ${m.peakDb.toFixed(1)} dBFS`); }
  // stress polyphony
  await page.evaluate(()=>PD.press16(1)); await page.evaluate(()=>{ for(let n=40;n<88;n+=4) PD.noteOn(n,127); }); let m=await page.evaluate(()=>VS.monitor(700)); await page.evaluate(()=>{ for(let n=40;n<88;n+=4) PD.noteOff(n); });
  ok(m.peak<1&&!m.nan&&m.peak>.01,`12-note stress (voice stealing): peak ${m.peakDb.toFixed(1)} dBFS`); await sleep(600);
  // env edit via cursor/value
  await page.evaluate(()=>{ PD.press16(0); PD.mode='edit'; PD.press16(6); PD.moveCur(1); PD.val(-1); });
  const l=await page.evaluate(()=>PD.lcd()); ok(/DCA1 STEP1/.test(l)&&/LV=98/.test(l),'DCA1 env step edit on lcd: '+JSON.stringify(l));
  await page.evaluate(()=>{ PD.moveCur(1); PD.moveCur(1); PD.envPoint('end'); }); ok(await page.evaluate(()=>PD.P.line[0].dcaE.end===1),'ENV POINT END sets end step (step 2)');
  await page.evaluate(()=>{ PD.mode='tone'; });
  // sequencer + arp
  await page.evaluate(()=>{ PD.press16(2); PD.SA.setMode('seq'); PD.SA.clk.start(); }); m=await page.evaluate(()=>VS.monitor(1800)); ok(m.peak>.01&&m.peak<1&&!m.nan,`sequencer plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(1200); m=await page.evaluate(()=>VS.monitor(300));
  ok(m.peak<0.002&&!(await page.evaluate(()=>PD.SA.clk.running)),`vsynths:stop silences (peak ${m.peak.toExponential(1)})`);
  const s1=smfOk(await page.evaluate(()=>Array.from(PD.SA.midi('pd1').bytes))); ok(s1.ok,`seq MIDI export valid SMF (${s1.len} bytes, ${s1.ons} note-ons)`);
  await page.evaluate(()=>{ PD.SA.setMode('updown'); [60,63,67].forEach(n=>PD.SA.held.add(n)); PD.SA.clk.start(); }); m=await page.evaluate(()=>VS.monitor(1200)); ok(m.peak>.01&&m.peak<1,`arpeggiator plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  const s2=smfOk(await page.evaluate(()=>Array.from(PD.SA.midi('pd1').bytes))); ok(s2.ok&&s2.ons>=16,`arp MIDI export valid SMF (${s2.len} bytes, ${s2.ons} note-ons)`);
  await page.evaluate(()=>{ window.postMessage({type:'vsynths:stop'},'*'); PD.SA.setMode('seq'); }); await sleep(800);
  const kbBox=await page.evaluate(()=>{ const r=document.querySelector('.vkb-w[data-n="60"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height*.8}; });
  await page.mouse.move(kbBox.x,kbBox.y); await page.mouse.down(); m=await page.evaluate(()=>VS.monitor(400)); await page.mouse.up(); ok(m.peak>0.005,'on-screen key (pointer) sounds');
  await page.keyboard.down('d'); m=await page.evaluate(()=>VS.monitor(300)); await page.keyboard.up('d'); ok(m.peak>0.005,'computer key "d" sounds');
  await sleep(500); await page.evaluate(()=>{ PD.press16(0); PD.mode='edit'; PD.press16(4); }); await sleep(150);
  await page.screenshot({path:dir+'/shot.png'});
  ok(errors.length===0,'no console errors '+(errors.length?JSON.stringify(errors):''));
  const ph=await browser.newPage(); await ph.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:2}); await ph.goto('file://'+dir+'/index.html'); await sleep(500);
  ok(await ph.evaluate(()=>{ const r=document.getElementById('panel').getBoundingClientRect(); return r.right<=845&&r.bottom<=391&&r.width>700; }),'iphone landscape: panel fits 844x390');
  await ph.screenshot({path:dir+'/shot-iphone.png'});
  await browser.close(); console.log(fails?`${fails} FAILED`:'ALL PASS'); process.exit(fails?1:0); })();
