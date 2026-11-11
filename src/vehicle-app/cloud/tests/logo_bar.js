const L=require('./lib.js');const fs=require('fs');const path=require('path');
function head(f,names){let s=fs.readFileSync(path.join(__dirname,f),'utf8');s=s.slice(0,s.indexOf('(async()=>{'));return new Function('require','__dirname',s+';return {'+names+'};')(require,__dirname);}
const BD=head('binder.js','PRE');let F=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)F++;};
const info=p=>p.evaluate(()=>{var b=document.querySelector('.va-brand'),i=b&&b.querySelector('i'),w=b&&b.querySelector('b'),bar=document.getElementById('viewas-bar');var r=b.getBoundingClientRect(),br=bar.getBoundingClientRect();
 // Option C (p40): the due notice lives in the Brief tab; open it so the banner is actually on screen
 var bt=document.querySelector('.page.active .ovc-t[data-t="brief"]');if(bt&&bt.getAttribute('aria-selected')!=='true')bt.click();
 var ban=[...document.querySelectorAll('.page.active *')].find(e=>/due within 30 days/i.test(e.textContent)&&e.children.length<3&&e.getClientRects().length>0);
 var rt=[...bar.querySelectorAll('.va-static,.va-btn')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect());
 return {x:r.left,top:r.top,iw:i.getBoundingClientRect().width,wm:w.textContent,ff:getComputedStyle(w).fontFamily,col:getComputedStyle(w).color,img:/webp/.test(getComputedStyle(i).backgroundImage),barTop:br.top,barB:br.bottom,ban:ban?ban.getBoundingClientRect().top:null,overlap:rt.some(q=>q.left<r.right),pos:getComputedStyle(bar).position};});
(async()=>{await L.launch();
for(const [who,args] of [['owner',['olivia@test.com']],['tech',['tom@test.com','password123','advisor']]]){
 for(const w of [375,430,1280]){const p=await L.open({pre:BD.PRE(),w,h:w>900?860:932});await L.login(p,...args);await L.sleep(900);
  const a=await info(p);
  ok(a.img&&a.iw>=32&&a.iw<=36,who+' '+w+' emblem 32-36px ('+a.iw+')');ok(a.wm==='EVOAI'&&/EvoDisplay|Cormorant/.test(a.ff)&&a.col==='rgb(226, 197, 142)',who+' '+w+' EVOAI wordmark Cormorant champagne');
  ok(a.pos==='sticky'&&a.top<a.barB,who+' '+w+' brand in sticky top bar');ok(a.ban===null||a.ban>=a.barB-1,who+' '+w+' above the due banner ('+a.ban+' vs '+a.barB+')');ok(!a.overlap,who+' '+w+' no clash with Signed in as / View as');
  await p.evaluate(()=>{var m=document.querySelector('.main');if(m)m.scrollTop=400;window.scrollTo(0,400);});await L.sleep(300);const b2=await info(p);ok(Math.abs(b2.top-a.top)<2||b2.top>=0,who+' '+w+' stays put on scroll');
  if(who==='owner'&&w===430){await p.evaluate(()=>{var m=document.querySelector('.main');if(m)m.scrollTop=0;window.scrollTo(0,0);});await L.sleep(300);await p.screenshot({path:'/tmp/logoshot/bar_owner_430.png'});}
  if(who==='owner'&&w===1280){await p.evaluate(()=>{var m=document.querySelector('.main');if(m)m.scrollTop=0;window.scrollTo(0,0);});await L.sleep(300);await p.screenshot({path:'/tmp/logoshot/desk.png'});}
  if(who==='tech'&&w===430){await p.evaluate(()=>{var m=document.querySelector('.main');if(m)m.scrollTop=0;window.scrollTo(0,0);});await L.sleep(300);await p.screenshot({path:'/tmp/logoshot/bar_tech_430.png'});}
  await p.close();}}
const p=await L.open({pre:BD.PRE(),w:430,h:932});await L.login(p,'wade@evo.test','password123','advisor');await L.sleep(900);const a=await info(p);ok(!a.overlap&&a.iw>=32,'admin View as + brand no clash');
await p.evaluate(()=>viewAsToggle({stopPropagation(){}}));await L.sleep(300);await p.screenshot({path:'/tmp/logoshot/bar_admin_430.png'});
await L.close();console.log('logo_bar: '+(F?'FAIL '+F:'all passed'));process.exit(F?1:0);})().catch(e=>{console.error(e);process.exit(1);});
