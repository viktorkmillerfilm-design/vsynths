// fair-cmi test: errors, every library sample plays (non-silent, <0dBFS, no NaN), light-pen waveform drawing -> new sound, harmonic page, page R sequencer, midi, stop msg, screenshots
const puppeteer=require('/tmp/pt/node_modules/puppeteer-core'); const path=require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=path.resolve(__dirname,'..','fair-cmi'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const smfOk=b=>{ const h=String.fromCharCode(...b.slice(0,4)), t=String.fromCharCode(...b.slice(14,18)); let ons=0; for(let i=18;i<b.length-2;i++) if((b[i]&0xf0)===0x90&&b[i+1]<128&&b[i+2]>0&&b[i+2]<128) ons++; return {ok:h==='MThd'&&t==='MTrk'&&ons>0,ons,len:b.length}; };
(async()=>{ const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage(); const errors=[]; page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); }); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.setViewport({width:1280,height:800}); await page.goto('file://'+dir+'/index.html'); await page.evaluate(()=>localStorage.clear()); await page.reload(); await sleep(500);
  await page.mouse.click(5,5); await page.evaluate(()=>VS.ensure()); await page.waitForFunction(()=>window.__eng&&VS.ctx.currentTime>0.3,{timeout:15000}); await sleep(800);
  ok(await page.evaluate(()=>window.__eng==='worklet'),'engine runs in AudioWorklet');
  const lib=await page.evaluate(()=>SMP.LIB.map(l=>l[0]));
  for(let i=0;i<lib.length;i++){ await page.evaluate(i=>{ CMI.cur=0; CMI.loadLib(0,i); },i); await sleep(60);
    const q=await page.evaluate(()=>{ const d=CMI.regs[0].d; const lv=new Set(); for(let i=0;i<d.length;i+=7) lv.add(Math.round(d[i]*127)); return {max:Math.max(...lv),min:Math.min(...lv),quantOk:[...d].every(x=>Math.abs(x*127-Math.round(x*127))<1e-3)}; });
    await page.evaluate(()=>[48,60,67].forEach(n=>CMI.noteOn(n,110))); const m=await page.evaluate(()=>VS.monitor(450)); await page.evaluate(()=>[48,60,67].forEach(n=>CMI.noteOff(n))); await sleep(150);
    ok(m.peak>0.01&&m.peak<1&&!m.nan&&q.quantOk,`sample ${lib[i]}: peak ${m.peakDb.toFixed(1)} dBFS, 8-bit quantized=${q.quantOk}`); }
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(300);
  // light pen drawing on page 6
  await page.evaluate(()=>CMI.go('6'));
  const r=await page.evaluate(()=>{ const b=CMI.cv.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; }); const P=(x,y)=>[r.x+x/712*r.w,r.y+y/364*r.h];
  let [x,y]=P(32,150); await page.mouse.move(x,y); await page.mouse.down(); for(let i=0;i<=40;i++){ const [a,b]=P(32+i*16,i<20?60:240); await page.mouse.move(a,b); } await page.mouse.up();
  const drawn=await page.evaluate(()=>{ const d=CMI.drawBuf; return {a:d[20],b:d[230]}; }); ok(drawn.a>.6&&drawn.b<-.6,`light pen draws waveform (start ${drawn.a.toFixed(2)}, end ${drawn.b.toFixed(2)})`);
  [x,y]=P(10+56*8.6+20,14+18.4*15.5); await page.mouse.click(x,y); await sleep(120);
  ok(await page.evaluate(()=>CMI.regs[0].name.startsWith('DRAWN')),'COMPUTE loads drawn wave into voice 1: '+await page.evaluate(()=>CMI.regs[0].name));
  await page.evaluate(()=>CMI.noteOn(57,100)); let m=await page.evaluate(()=>VS.monitor(500)); await page.evaluate(()=>CMI.noteOff(57)); ok(m.peak>.01&&m.peak<1&&!m.nan,`drawn sound plays: peak ${m.peakDb.toFixed(1)} dBFS`); await sleep(400);
  await page.evaluate(()=>{ CMI.go('4'); CMI.harm.fill(0); CMI.harm[0]=1; CMI.harm[1]=.5; CMI.harm[6]=.4; CMI.computeHarm(); CMI.noteOn(60,100); }); m=await page.evaluate(()=>VS.monitor(400)); await page.evaluate(()=>CMI.noteOff(60));
  ok(m.peak>.01&&m.peak<1&&await page.evaluate(()=>CMI.regs[0].name.startsWith('HARMON')),`page 4 harmonic compute plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  // page 8 low rate + 4-bit
  await page.evaluate(()=>{ CMI.loadLib(0,0); CMI.go('8'); }); for(let i=0;i<4;i++){ await page.evaluate(()=>{ CMI.hits; }); }
  await page.evaluate(()=>{ for(let i=0;i<30;i++) CMI.adj(-1); }); const rate=await page.evaluate(()=>CMI.regs[0].rate); ok(rate<=9500,'page 8: sample rate lowered to '+rate+' Hz');
  // control params page 7: polyphony stress across 8 voices
  await page.evaluate(()=>{ CMI.go('7'); CMI.regs.forEach(r=>r.kbd=1); }); await page.evaluate(()=>{ for(let n=48;n<84;n+=3) CMI.noteOn(n,127); }); m=await page.evaluate(()=>VS.monitor(700));
  await page.evaluate(()=>{ for(let n=48;n<84;n+=3) CMI.noteOff(n); CMI.regs.forEach((r,i)=>r.kbd=i===0?1:0); }); ok(m.peak<1&&!m.nan&&m.peak>.01,`12 keys x 8 layered voices (stealing 16): peak ${m.peakDb.toFixed(1)} dBFS`); await sleep(500);
  // page R
  await page.evaluate(()=>{ CMI.go('R'); CMI.clk.start(); }); m=await page.evaluate(()=>VS.monitor(2200)); ok(m.peak>.01&&m.peak<1&&!m.nan,`page R rhythm sequencer plays: peak ${m.peakDb.toFixed(1)} dBFS`);
  await page.screenshot({path:dir+'/shot.png'});
  await page.evaluate(()=>window.postMessage({type:'vsynths:stop'},'*')); await sleep(1500); m=await page.evaluate(()=>VS.monitor(300));
  ok(m.peak<0.002&&!(await page.evaluate(()=>CMI.clk.running)),`vsynths:stop silences (peak ${m.peak.toExponential(1)})`);
  const s=smfOk(await page.evaluate(()=>Array.from(CMI.seqMidi()))); ok(s.ok&&s.ons>=20,`page R MIDI export valid SMF (${s.len} bytes, ${s.ons} note-ons)`);
  // step toggle via light pen
  const before=await page.evaluate(()=>CMI.SEQ.pats[0][2][3]); [x,y]=P(170+3*30+10,72+2*27+10); await page.mouse.click(x,y); const after=await page.evaluate(()=>CMI.SEQ.pats[0][2][3]); ok(after!==before,'light pen toggles a page R step');
  const kbBox=await page.evaluate(()=>{ const r=document.querySelector('.vkb-w[data-n="60"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height*.8}; });
  await page.mouse.move(kbBox.x,kbBox.y); await page.mouse.down(); m=await page.evaluate(()=>VS.monitor(400)); await page.mouse.up(); ok(m.peak>0.005,'on-screen key (pointer) sounds');
  await page.keyboard.down('j'); m=await page.evaluate(()=>VS.monitor(300)); await page.keyboard.up('j'); ok(m.peak>0.005,'computer key "j" sounds');
  for(const p of ['1','2','3','4','6','7','8','D']){ await page.evaluate(p=>CMI.go(p),p); await sleep(60); await page.screenshot({path:`/tmp/cmi-page-${p}.png`}); }
  await page.evaluate(()=>CMI.go('R'));
  ok(errors.length===0,'no console errors '+(errors.length?JSON.stringify(errors):''));
  const ph=await browser.newPage(); await ph.setViewport({width:844,height:390,isMobile:true,hasTouch:true,deviceScaleFactor:2}); await ph.goto('file://'+dir+'/index.html'); await sleep(600);
  ok(await ph.evaluate(()=>{ const r=document.getElementById('panel').getBoundingClientRect(); return r.right<=845&&r.bottom<=391&&r.width>700; }),'iphone landscape: panel fits 844x390');
  await ph.screenshot({path:dir+'/shot-iphone.png'});
  await browser.close(); console.log(fails?`${fails} FAILED`:'ALL PASS'); process.exit(fails?1:0); })();
