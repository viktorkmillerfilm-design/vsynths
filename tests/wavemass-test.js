// wavemass test: errors, presets non-silent/<0dBFS/no NaN, every wavetable x intensity mode, every filter type, unison stress, mod assign, seq/arp, midi, stop msg, screenshots
const puppeteer=require('/tmp/pt/node_modules/puppeteer-core'); const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=path.resolve(__dirname,'..','wavemass'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const smfOk=b=>{ const h=String.fromCharCode(...b.slice(0,4)), t=String.fromCharCode(...b.slice(14,18)); let ons=0; for(let i=18;i<b.length-2;i++) if((b[i]&0xf0)===0x90&&b[i+1]<128&&b[i+2]>0&&b[i+2]<128) ons++; return {ok:h==='MThd'&&t==='MTrk'&&ons>0,ons,len:b.length}; };
(async()=>{ const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage(); const errors=[]; page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); }); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.setViewport({width:1280,height:800}); await page.goto('file://'+dir+'/index.html'); await page.evaluate(()=>localStorage.clear()); await page.reload(); await sleep(400);
  await page.mouse.click(5,5); await page.evaluate(()=>VS.ensure()); await page.waitForFunction(()=>window.__eng&&VS.ctx.currentTime>0.3,{timeout:15000}); await sleep(1500);
  ok(await page.evaluate(()=>window.__eng==='worklet'),'engine runs in AudioWorklet');
  const n=await page.evaluate(()=>WM.PRESETS.length);
  for(let i=0;i<n;i++){ await page.evaluate(i=>WM.loadPreset(i),i); await sleep(80); await page.evaluate(()=>[36,48,55,60].forEach(n=>WM.noteOn(n,110)));
    const m=await page.evaluate(()=>VS.monitor(900)); await page.evaluate(()=>[36,48,55,60].forEach(n=>WM.noteOff(n))); await sleep(300);
    ok(m.peak>0.01&&m.peak<1&&!m.nan,`preset ${i+1} ${await page.evaluate(()=>WM.P.name)}: peak ${m.peakDb.toFixed(1)} dBFS`); }
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(300);
  let c=0; for(let t=0;t<10;t++) for(let md=0;md<5;md++){ await page.evaluate((t,md)=>{ WM.loadPreset(7); const P=WM.P; P.d.o1wt=t; P.d.o1mode=md; P.k.o1int=.7; P.k.o1pos=.5; P.k.namp=0; P.d.f1type=0; WM.send(); },t,md); await sleep(25);
    await page.evaluate(()=>WM.noteOn(57,100)); const m=await page.evaluate(()=>VS.monitor(140)); await page.evaluate(()=>WM.noteOff(57)); await sleep(60); if(m.peak>0.005&&m.peak<1&&!m.nan) c++; else console.log('  silent/bad wt',t,'mode',md,m.peak); }
  ok(c===50,`10 wavetables x 5 intensity modes audible+finite (${c}/50)`);
  c=0; for(let f=0;f<11;f++){ await page.evaluate(f=>{ WM.loadPreset(5); const P=WM.P; P.d.f1type=f; P.k.f1cut=.6; P.k.f1res=.9; P.k.f1drv=.8; WM.send(); },f); await sleep(25);
    await page.evaluate(()=>[48,55].forEach(n=>WM.noteOn(n,127))); const m=await page.evaluate(()=>VS.monitor(250)); await page.evaluate(()=>[48,55].forEach(n=>WM.noteOff(n))); await sleep(80); if(m.peak>0.003&&m.peak<1&&!m.nan) c++; else console.log('  filter',f,m.peak,m.nan); }
  ok(c===11,`11 filter types at max resonance/drive stable (${c}/11)`);
  await page.evaluate(()=>{ WM.loadPreset(5); WM.P.d.uni=6; WM.P.d.o3on=1; WM.P.k.fbamt=1; WM.P.d.ins1=2; WM.P.k.ins1mix=1; WM.send(); }); await sleep(30);
  await page.evaluate(()=>{ for(let n=40;n<90;n+=5) WM.noteOn(n,127); }); let m=await page.evaluate(()=>VS.monitor(1200)); await page.evaluate(()=>{ for(let n=40;n<90;n+=5) WM.noteOff(n); });
  ok(m.peak<1&&!m.nan&&m.peak>.01,`10 notes x 3 osc x 6 unison + feedback + bitcrusher stress: peak ${m.peakDb.toFixed(1)} dBFS`); await sleep(800);
  // mod assignment via UI: arm lfo5, tap filter1 cutoff knob, drag
  await page.evaluate(()=>{ WM.loadPreset(7); WM.arm('lfo5'); });
  const kn=await page.evaluate(()=>{ const e=[...document.querySelectorAll('.mk')].find(x=>(x.querySelector('.kl')||{}).textContent.toLowerCase()==='cutoff'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
  await page.mouse.move(kn.x,kn.y); await page.mouse.down(); await page.mouse.move(kn.x,kn.y-40,{steps:5}); await page.mouse.up(); await page.evaluate(()=>WM.arm('lfo5'));
  const mods=await page.evaluate(()=>WM.P.mods.f1cut); ok(mods&&mods[0].src==='lfo5'&&mods[0].amt>.1,'UI mod assign: lfo5 → filter1 cutoff amt '+(mods&&mods[0].amt));
  // wobble preset sequencer
  await page.evaluate(()=>{ WM.loadPreset(0); WM.SA.setMode('seq'); WM.SA.clk.start(); }); m=await page.evaluate(()=>VS.monitor(2000)); ok(m.peak>.01&&m.peak<1&&!m.nan,`sequencer (wobble bass): peak ${m.peakDb.toFixed(1)} dBFS`);
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(1500); m=await page.evaluate(()=>VS.monitor(300));
  ok(m.peak<0.002&&!(await page.evaluate(()=>WM.SA.clk.running)),`vsynths:stop silences incl. fx tails (peak ${m.peak.toExponential(1)})`);
  const s1=smfOk(await page.evaluate(()=>Array.from(WM.SA.midi('wavemass').bytes))); ok(s1.ok,`seq MIDI export valid SMF (${s1.len} bytes, ${s1.ons} note-ons)`);
  await page.evaluate(()=>{ WM.loadPreset(6); WM.SA.setMode('up'); [60,64,67,71].forEach(n=>WM.SA.held.add(n)); WM.SA.clk.start(); }); m=await page.evaluate(()=>VS.monitor(1200)); ok(m.peak>.01&&m.peak<1,`arpeggiator (pluck): peak ${m.peakDb.toFixed(1)} dBFS`);
  const s2=smfOk(await page.evaluate(()=>Array.from(WM.SA.midi('wavemass').bytes))); ok(s2.ok&&s2.ons>=16,`arp MIDI export valid SMF (${s2.ons} note-ons)`);
  await page.evaluate(()=>{ window.postMessage({type:'vsynths:stop'},'*'); WM.SA.setMode('seq'); }); await sleep(800);
  const kbBox=await page.evaluate(()=>{ const r=document.querySelector('.vkb-w[data-n="48"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height*.8}; });
  await page.mouse.move(kbBox.x,kbBox.y); await page.mouse.down(); m=await page.evaluate(()=>VS.monitor(400)); await page.mouse.up(); ok(m.peak>0.005,'on-screen key (pointer) sounds');
  await page.keyboard.down('a'); m=await page.evaluate(()=>VS.monitor(300)); await page.keyboard.up('a'); ok(m.peak>0.005,'computer key "a" sounds');
  await sleep(500); await page.evaluate(()=>{ WM.loadPreset(0); }); await sleep(150);
  await page.screenshot({path:dir+'/shot.png'});
  ok(errors.length===0,'no console errors '+(errors.length?JSON.stringify(errors):''));
  const ph=await browser.newPage(); await ph.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:2}); await ph.goto('file://'+dir+'/index.html'); await sleep(500);
  ok(await ph.evaluate(()=>{ const r=document.getElementById('panel').getBoundingClientRect(); return r.right<=845&&r.bottom<=391&&r.width>700; }),'iphone landscape: panel fits 844x390');
  await ph.screenshot({path:dir+'/shot-iphone.png'});
  await browser.close(); console.log(fails?`${fails} FAILED`:'ALL PASS'); process.exit(fails?1:0); })();
