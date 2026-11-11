// Simulates iPhone standalone: --sat=59px, draws a mock 59px status bar (clock + island) over the page, screenshots.
const L=require('./lib.js');const fs=require('fs');
const OUT='/workspace/vehicle-app/cloud/screens/safearea/';fs.mkdirSync(OUT,{recursive:true});
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const MOCK=`(function(){var d=document.createElement('div');d.id='mock-sb';d.style.cssText='position:fixed;left:0;right:0;top:0;height:59px;z-index:99999;pointer-events:none;border-bottom:1px dashed rgba(255,0,80,.8);color:#fff;font:600 16px -apple-system,Arial';d.innerHTML='<span style="position:absolute;left:42px;top:20px">3:26</span><span style="position:absolute;left:50%;top:11px;margin-left:-62px;width:124px;height:34px;border-radius:20px;background:#000;border:1px solid #444"></span><span style="position:absolute;right:30px;top:20px">5G 92%</span>';document.body.appendChild(d);})()`;
(async()=>{
  await L.launch();
  const p=await L.open({pre:"try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){}"});
  await L.login(p,'wade@evo.test','password123','advisor');
  await p.evaluate(()=>document.documentElement.style.setProperty('--sat','59px'));
  await p.evaluate(MOCK);
  const shot=async n=>{await L.sleep(300);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
  const clear=async tag=>{const r=await p.evaluate(()=>{const b=document.getElementById('viewas-btn')||document.getElementById('viewas-static');const x=b.getBoundingClientRect();return x.top;});ok(r>=59,tag+': top-bar control top '+r+' >= 59');};
  const open=async()=>{await p.evaluate(()=>document.getElementById('viewas-btn').click());};
  const menuOpen=()=>p.evaluate(()=>!document.getElementById('viewas-menu').hidden);
  const pick=async r=>{await p.evaluate(r=>document.querySelector('#viewas-menu [data-role='+r+']').click(),r);await L.sleep(500);};
  await clear('admin');await shot('1_admin_closed');
  await open();ok(await menuOpen(),'menu opens');
  const below=await p.evaluate(()=>document.getElementById('viewas-menu').getBoundingClientRect().top>=document.getElementById('viewas-btn').getBoundingClientRect().bottom);ok(below,'menu opens below button');
  ok(await p.evaluate(()=>document.querySelector('#viewas-menu [aria-selected=true]').dataset.role==='admin'),'admin highlighted');
  await shot('2_admin_open');
  await pick('advisor');ok(!(await menuOpen()),'menu closes on pick');
  ok(await p.evaluate(()=>/Viewing as Tech - back to Admin/.test(document.getElementById('viewas-msg').innerText)),'tech banner text');
  ok(await p.evaluate(()=>!!document.getElementById('auth-screen')&&document.getElementById('auth-screen').style.display==='none'),'no sign-out needed');
  await clear('tech');await shot('3_tech_closed');await open();await shot('4_tech_open');
  await pick('owner');
  await p.evaluate(()=>{});
  ok(await p.evaluate(()=>/Viewing as Owner/.test(document.getElementById('viewas-msg').innerText)),'owner banner');
  await clear('owner');await shot('5_owner_closed');await open();await shot('6_owner_open');
  await p.keyboard.press('Escape');ok(!(await menuOpen()),'Esc closes');
  await p.evaluate(()=>document.getElementById('viewas-msg').click());await L.sleep(400);
  ok(await p.evaluate(()=>document.getElementById('viewas-cur').textContent==='Admin'&&!viewAsActive()),'banner returns to Admin');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=390),'no h-overflow');
  // modal + bottom nav check
  const nav=await p.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).paddingBottom);console.log('  sidebar padding-bottom',nav);
  await p.close();
  // non-admin: static role only
  const q=await L.open();await L.login(q,'olivia@test.com');
  await q.evaluate(()=>document.documentElement.style.setProperty('--sat','59px'));await q.evaluate(MOCK);
  ok(await q.evaluate(()=>document.getElementById('viewas-btn').style.display==='none'&&/Owner/.test(document.getElementById('viewas-static').innerText)),'non-admin: role only, no dropdown');
  await L.sleep(300);await q.screenshot({path:OUT+'7_owner_user_static.png'});
  await q.evaluate(()=>{openModal&&openModal('modal-account')});await L.sleep(400);await q.screenshot({path:OUT+'8_modal.png'});
  await L.close();console.log(fails?'FAIL '+fails:'SAFE-AREA PASS');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
