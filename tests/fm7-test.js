// fm7 test: headless chrome, errors, audio non-silent / < 0 dBFS / no NaN, sequencer, edit mode, midi export, stop message, screenshots
const puppeteer=require('/tmp/pt/node_modules/puppeteer-core'); const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=path.resolve(__dirname,'..','fm7'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{ const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage(); const errors=[]; page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); }); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.setViewport({width:1280,height:800}); await page.goto('file://'+dir+'/index.html'); await page.evaluate(()=>localStorage.clear()); await page.reload(); await sleep(400);
  await page.mouse.click(5,5); await page.evaluate(()=>VS.ensure()); await page.waitForFunction(()=>window.__eng&&VS.ctx.currentTime>0.3,{timeout:15000}); await sleep(600);
  ok(await page.evaluate(()=>window.__eng==='worklet'),'engine runs in AudioWorklet');
  const voices=['E.PIANO 1','BASS 1','TUB BELLS','BRASS 1'];
  for(let i=0;i<4;i++){ await page.evaluate(i=>FM7.press32(i),i); await sleep(100);
    await page.evaluate(()=>{ [48,55,60,64,67,72].forEach((n,k)=>FM7.noteOn(n,110)); }); const m=await page.evaluate(()=>VS.monitor(900));
    await page.evaluate(()=>[48,55,60,64,67,72].forEach(n=>FM7.noteOff(n))); await sleep(700);
    ok(m.peak>0.01&&m.peak<1&&!m.nan,`preset ${i+1} ${await page.evaluate(()=>FM7.P.name.trim())}: peak ${m.peakDb.toFixed(1)} dBFS nan=${m.nan}`); }
  // stress: 20 notes (voice stealing) full velocity
  await page.evaluate(()=>FM7.press32(1)); await page.evaluate(()=>{ for(let n=30;n<90;n+=3) FM7.noteOn(n,127); }); let m=await page.evaluate(()=>VS.monitor(800));
  ok(m.peak<1&&!m.nan&&m.peak>0.01,`20-note stress (16 voices, stealing): peak ${m.peakDb.toFixed(1)} dBFS`); await page.evaluate(()=>{ for(let n=30;n<90;n+=3) FM7.noteOff(n); }); await sleep(800);
  // all 32 algorithms produce sound
  let algOk=0; for(let a=1;a<=32;a++){ await page.evaluate(a=>{ FM7.P.alg=a; FM7.setMode('edit'); FM7.press32(6); FM7.inc(0); },a); await sleep(30);
    await page.evaluate(()=>FM7.noteOn(60,100)); const r=await page.evaluate(()=>VS.monitor(160)); await page.evaluate(()=>FM7.noteOff(60)); if(r.peak>0.003&&r.peak<1&&!r.nan) algOk++; await sleep(40); }
  ok(algOk===32,`all 32 algorithms audible (${algOk}/32)`);
  // edit mode: param buttons + data entry
  await page.evaluate(()=>{ FM7.setMode('play'); FM7.press32(0); FM7.setMode('edit'); FM7.press32(26); FM7.inc(-1); });
  const l=await page.evaluate(()=>FM7.lcd()); ok(/OUTPUT LEVEL=98/.test(l),'edit: OUTPUT LEVEL -1 shown on lcd: '+JSON.stringify(l));
  await page.evaluate(()=>FM7.press32(20)); await page.evaluate(()=>FM7.press32(20)); ok(/EG RATE 2=/.test(await page.evaluate(()=>FM7.lcd())),'edit: EG RATE sub-param cycles to R2');
  await page.evaluate(()=>FM7.setMode('play'));
  // sequencer
  await page.evaluate(()=>{ FM7.press32(0); FM7.setArp('seq'); FM7.clk.bpm=140; FM7.clk.start(); }); m=await page.evaluate(()=>VS.monitor(2000));
  ok(m.peak>0.01&&m.peak<1&&!m.nan,`sequencer plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  // stop message
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(1500); m=await page.evaluate(()=>VS.monitor(300));
  ok(m.peak<0.002&&!(await page.evaluate(()=>FM7.clk.running)),`vsynths:stop silences (peak ${m.peak.toExponential(1)})`);
  // arp
  await page.evaluate(()=>{ FM7.setArp('up'); FM7.held.add(60); FM7.held.add(64); FM7.held.add(67); FM7.clk.start(); }); m=await page.evaluate(()=>VS.monitor(1200));
  ok(m.peak>0.01&&m.peak<1,`arpeggiator plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  const mid=await page.evaluate(()=>Array.from(FM7.buildMidi())); await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*'));
  const hdr=String.fromCharCode(...mid.slice(0,4)), trk=String.fromCharCode(...mid.slice(14,18)); let ons=0; for(let i=18;i<mid.length-2;i++) if((mid[i]&0xf0)===0x90&&mid[i+2]>0&&mid[i+1]<128) ons++;
  ok(hdr==='MThd'&&trk==='MTrk'&&ons>=8,`arp MIDI export valid SMF (${mid.length} bytes, ~${ons} note-ons)`);
  await page.evaluate(()=>{ FM7.setArp('seq'); FM7.held.clear(); }); const mid2=await page.evaluate(()=>Array.from(FM7.buildMidi())); ok(String.fromCharCode(...mid2.slice(0,4))==='MThd'&&mid2.length>100,'seq MIDI export valid SMF ('+mid2.length+' bytes)');
  // touch keyboard click
  const kbBox=await page.evaluate(()=>{ const r=document.querySelector('.vkb-w[data-n="60"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height*.8}; });
  await page.mouse.move(kbBox.x,kbBox.y); await page.mouse.down(); m=await page.evaluate(()=>VS.monitor(400)); await page.mouse.up(); ok(m.peak>0.005,'on-screen key (pointer) sounds');
  await page.keyboard.down('a'); m=await page.evaluate(()=>VS.monitor(300)); await page.keyboard.up('a'); ok(m.peak>0.005,'computer key "a" sounds');
  await sleep(500); await page.evaluate(()=>{FM7.setMode('play'); FM7.press32(0);}); await sleep(100);
  await page.screenshot({path:dir+'/shot.png'});
  ok(errors.length===0,'no console errors '+(errors.length?JSON.stringify(errors):''));
  const ph=await browser.newPage(); await ph.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:2}); await ph.goto('file://'+dir+'/index.html'); await sleep(500);
  const fitOk=await ph.evaluate(()=>{ const r=document.getElementById('panel').getBoundingClientRect(); return r.right<=845&&r.bottom<=391&&r.width>700; }); ok(fitOk,'iphone landscape: panel fits 844x390');
  await ph.screenshot({path:dir+'/shot-iphone.png'});
  await browser.close(); console.log(fails?`${fails} FAILED`:'ALL PASS'); process.exit(fails?1:0); })();
