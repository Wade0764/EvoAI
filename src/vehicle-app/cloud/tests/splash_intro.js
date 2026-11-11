// v36b intro splash: shows on every open (signed out + signed-in reload), ring animated, one-line tagline, min ~1.7s, then fades; reduced motion = no animation
const L=require('./lib.js');let F=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)F++;};
const SHOT=process.env.SPLASH_SHOT||'';
const st=p=>p.evaluate(()=>{var b=document.getElementById('boot-loading'),t=b.querySelector('.evo-tag'),sv=b.querySelector('#boot-ring svg');var rg=document.createRange();rg.selectNodeContents(t);
  var tops=new Set([...rg.getClientRects()].map(r=>Math.round(r.top)));return {vis:getComputedStyle(b).display!=='none'&&parseFloat(getComputedStyle(b).opacity)>.5,dots:b.querySelectorAll('#boot-ring circle').length,anim:sv?getComputedStyle(sv).animationName:'',wm:(b.querySelector('.evo-wmt')||{}).textContent,tag:t.textContent,lines:tops.size,tw:t.getBoundingClientRect().width,vw:innerWidth};});
(async()=>{await L.launch();
for(const w of [375,430]){
  const p=await L.open({w,h:w===375?812:932,intro:true});const a=await st(p);
  ok(a.vis,w+' splash visible on open (signed out)');ok(a.dots===291||a.dots===298||a.dots===360,w+' ring dots '+a.dots);ok(a.anim==='evrrot',w+' ring animated');
  ok(a.wm==='EVOAI'&&/Private Collection Management/i.test(a.tag)&&a.lines===1&&a.tw<=a.vw,w+' EVOAI + one-line tagline ('+a.lines+' line, '+Math.round(a.tw)+'/'+a.vw+')');
  if(SHOT&&w===430){await L.sleep(500);await p.screenshot({path:SHOT});}
  await L.sleep(1000);ok((await st(p)).vis,w+' still up at ~1.2-1.5s (minimum display)');
  await L.sleep(1500);ok(!(await st(p)).vis&&await p.evaluate(()=>document.getElementById('auth-screen').style.display!=='none'),w+' faded into sign-in by ~2.7s');
  await p.close();}
// signed-in: reload (home-screen relaunch with a session)
let p=await L.open({w:430,h:932});await L.login(p,'olivia@test.com');await L.sleep(500);
await p.reload({waitUntil:'load'});const b=await st(p);ok(b.vis,'signed-in relaunch shows the splash');
await p.waitForFunction(()=>getComputedStyle(document.getElementById('boot-loading')).display==='none',{timeout:6000}).catch(()=>{});
const t=await p.evaluate(()=>Date.now()-window.__EVO_INTRO.t0);ok(t>=1600&&t<4500,'signed-in relaunch: splash held '+t+'ms then app');
const as=await p.evaluate(()=>({sh:document.getElementById('app-shell').className,au:document.getElementById('auth-screen').style.display}));ok(!/hidden/.test(as.sh)||as.au!=='none','splash handed over to app or sign-in '+JSON.stringify(as));await p.close();
// reduced motion
p=await L.open({w:430,h:932,intro:true,reduced:true});const r=await st(p);ok(r.vis&&r.anim==='none','reduced motion: splash shown, no animation ('+r.anim+')');
await L.sleep(2300);ok(!(await st(p)).vis,'reduced motion: hidden after minimum');await p.close();
await L.close();console.log('splash_intro: '+(F?'FAIL '+F:'all passed'));process.exit(F?1:0);})().catch(e=>{console.error(e);process.exit(1);});
