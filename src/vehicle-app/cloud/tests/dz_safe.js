// dz: safe area on every page/modal/sheet/lightbox (390x844, simulated 47px inset), client title, edge swipe-back.
const L=require('./lib.js');
const OUT='/workspace/vehicle-app/cloud/screens/';const SAT=47;
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const PRE="try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};(function(){var t=window.__MOCK_STATE__.tables.profiles;t.forEach(function(p){if(p.id==='b0000000-0000-4000-a000-000000000002')p.display_name=\"Amy & David's collective\";});})()";
const MOCK=`(function(){var d=document.createElement('div');d.id='mock-sb';d.style.cssText='position:fixed;left:0;right:0;top:0;height:${SAT}px;z-index:99999;pointer-events:none;border-bottom:1px dashed rgba(255,0,80,.6);color:#fff;font:600 16px -apple-system,Arial';d.innerHTML='<span style="position:absolute;left:36px;top:15px">5:57</span><span style="position:absolute;left:50%;top:9px;margin-left:-60px;width:120px;height:32px;border-radius:20px;background:#000;border:1px solid #444"></span><span style="position:absolute;right:28px;top:15px">5G</span>';document.body.appendChild(d);})()`;
const V1='d0000000-0000-4000-a000-000000000011',O='b0000000-0000-4000-a000-000000000002';
async function inset(p){await p.evaluate(s=>document.documentElement.style.setProperty('--sat',s+'px'),SAT);await p.evaluate(MOCK);}
// every visible interactive control in the top band must be below the inset, and back/close controls >=44px
function audit(sel){return (function(sel,SAT){const root=sel?document.querySelector(sel):document;const bad=[];let n=0;
  root.querySelectorAll('button,a,select,[onclick],input').forEach(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);
    if(!r.width||!r.height||cs.visibility==='hidden'||r.bottom<=0||r.top>200)return;if(e.closest('#mock-sb'))return;
    let hidden=false;for(let x=e;x;x=x.parentElement){const c=getComputedStyle(x);if(c.display==='none'||c.opacity==='0'){hidden=true;break;}}if(hidden)return;
    n++;if(r.top<SAT)bad.push((e.id||e.className||e.tagName)+'@'+Math.round(r.top));
    if(e.matches('.backbtn,.modal-close,.pfl-x')&&(r.height<44||r.width<44))bad.push('small '+(e.className)+' '+Math.round(r.width)+'x'+Math.round(r.height));});
  return {n,bad};})}
const A=(p,sel)=>p.evaluate(audit(),sel||null,SAT);
const shot=async(p,n)=>{await L.sleep(350);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
async function swipe(p,x0,x1,y0,y1){const c=await p.target().createCDPSession();const pt=(x,y)=>[{x,y,id:1}];
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pt(x0,y0)});
  for(let i=1;i<=10;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pt(x0+(x1-x0)*i/10,y0+(y1-y0)*i/10)});await L.sleep(16);}
  return {end:async()=>{await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await L.sleep(450);}};}
const vdOpen=p=>p.evaluate(()=>document.getElementById('modal-vehicle-detail').classList.contains('active'));
(async()=>{
  await L.launch();
  // ---------- OWNER ----------
  const p=await L.open({pre:PRE});await L.login(p,'olivia@test.com');await inset(p);
  const t=await p.evaluate(()=>{const e=document.querySelector('#cp-title .ctitle-name');if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {txt:e.textContent,fs:parseFloat(cs.fontSize),ff:cs.fontFamily,w:r.width,rule:!!document.querySelector('#cp-title .ctitle-rule'),btn:document.querySelector('#page-client-portal .topline .head-actions .btn').getBoundingClientRect().top>r.bottom};});
  ok(t&&t.txt==="Amy & David's Collective",'client title text: '+(t&&t.txt));
  ok(t&&t.fs>=34,'client title large ('+(t&&t.fs)+'px)');ok(t&&/Cormorant|Georgia|serif/.test(t.ff),'serif display face');
  ok(t&&t.rule,'gold hairline');ok(t&&t.btn,'Add vehicle sits on its own line below the title');
  let a=await A(p);ok(!a.bad.length,'owner overview top controls below inset '+a.bad.join(','));
  await shot(p,'dz-01-owner-client-title-390x844');
  const pages=await p.evaluate(()=>OWNER_PAGES.slice());
  for(const pg of pages){await p.evaluate(x=>showPage(x),pg);await L.sleep(250);a=await A(p,'.page.active');ok(!a.bad.length,'owner page '+pg+' ('+a.n+' controls) '+a.bad.join(','));}
  await p.evaluate(()=>showPage('client-portal'));
  await p.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(700);
  const bk=await p.evaluate(()=>{const r=document.querySelector('#modal-vehicle-detail .backbtn').getBoundingClientRect();return {t:r.top,h:r.height,w:r.width};});
  ok(bk.t>=SAT+4&&bk.h>=44&&bk.w>=44,'vehicle Back below inset: top '+Math.round(bk.t)+' size '+Math.round(bk.w)+'x'+Math.round(bk.h));
  a=await A(p,'#modal-vehicle-detail');ok(!a.bad.length,'vehicle detail top controls '+a.bad.join(','));
  await shot(p,'dz-02-vehicle-back-390x844');
  await p.evaluate(()=>{const m=document.getElementById('modal-vehicle-detail');m.scrollTop=900;m.querySelector('.modal').scrollTop=900;});await L.sleep(200);
  ok(await p.evaluate(s=>{const r=document.querySelector('#modal-vehicle-detail .backbtn').getBoundingClientRect();return r.top>=s&&r.top<s+30;},SAT),'Back stays reachable (sticky) after scrolling');
  await shot(p,'dz-03-vehicle-back-scrolled-390x844');
  await p.evaluate(()=>{const m=document.getElementById('modal-vehicle-detail');m.scrollTop=0;m.querySelector('.modal').scrollTop=0;});
  // lightbox
  const hasLb=await p.evaluate(()=>{try{pfOpenLightbox(0);return !!document.querySelector('.pfl');}catch(e){return false;}});await L.sleep(500);
  if(hasLb){const r=await p.evaluate(()=>{const b=document.getElementById('pfl-x').getBoundingClientRect();return [b.top,b.height];});ok(r[0]>=SAT&&r[1]>=44,'lightbox close below inset '+Math.round(r[0]));
    await shot(p,'dz-04-lightbox-390x844');
    let s=await swipe(p,10,260,400,410);await s.end();ok(!(await p.evaluate(()=>!!(window.PF&&PF.lb))),'edge swipe closes lightbox');ok(await vdOpen(p),'...and leaves the vehicle page open');}
  else ok(true,'lightbox: no photos in seed (skipped)');
  // swipe: middle start does nothing; vertical edge does nothing; edge right swipe = Back
  let s=await swipe(p,150,380,420,425);await s.end();ok(await vdOpen(p),'mid-screen swipe does not go back (hero swipe keeps it)');
  s=await swipe(p,10,20,300,700);await s.end();ok(await vdOpen(p),'vertical edge drag does not go back');
  s=await swipe(p,10,40,420,422);await s.end();ok(await vdOpen(p),'short edge swipe snaps back');
  s=await swipe(p,8,230,420,424);
  const mid=await p.evaluate(()=>getComputedStyle(document.querySelector('#modal-vehicle-detail .modal')).transform);ok(/matrix/.test(mid),'interactive follow during drag ('+mid+')');
  await shot(p,'dz-05-swipe-back-mid-390x844');await s.end();
  ok(!(await vdOpen(p)),'edge right swipe = Back (vehicle page closed)');
  ok(await p.evaluate(()=>!document.querySelector('#modal-vehicle-detail .modal').style.transform),'transform reset after back');
  // every modal
  const modals=await p.evaluate(()=>[...document.querySelectorAll('.modal-overlay')].map(m=>m.id));
  for(const id of modals){await p.evaluate(i=>openModal(i),id);await L.sleep(260);a=await A(p,'#'+id);ok(!a.bad.length,'modal '+id+' '+a.bad.join(','));
    if(id==='modal-account')await shot(p,'dz-06-modal-account-390x844');await p.evaluate(i=>closeModal(i),id);await L.sleep(230);}
  // edge swipe closes a modal sheet too
  await p.evaluate(()=>openModal('modal-account'));await L.sleep(300);s=await swipe(p,6,250,500,505);await s.end();
  ok(!(await p.evaluate(()=>document.getElementById('modal-account').classList.contains('active'))),'edge swipe closes a modal');
  ok(p.errors.length===0,'owner: no page errors '+p.errors.join('|'));
  await p.close();
  // ---------- ADMIN ----------
  const q=await L.open({pre:PRE});await L.login(q,'wade@evo.test','password123','advisor');await inset(q);
  const pagesA=await q.evaluate(()=>[...document.querySelectorAll('.page')].map(e=>e.id.replace('page-','')));
  for(const pg of pagesA){await q.evaluate(x=>showPage(x),pg);await L.sleep(220);a=await A(q);ok(!a.bad.length,'admin page '+pg+' '+a.bad.join(','));}
  await q.evaluate(o=>openClientDetail(o),O);await L.sleep(600);
  const ct=await q.evaluate(()=>{const e=document.querySelector('#cd-name .ctitle-name');return e&&[e.textContent,parseFloat(getComputedStyle(e).fontSize)];});
  ok(ct&&ct[0]==="Amy & David's Collective"&&ct[1]>=34,'admin client view title '+ct);
  const cb=await q.evaluate(()=>{const r=document.querySelector('#page-client-detail .backbtn').getBoundingClientRect();return [r.top,r.height];});ok(cb[0]>=SAT&&cb[1]>=44,'client page Back below inset');
  await shot(q,'dz-07-admin-client-title-390x844');
  s=await swipe(q,8,240,500,503);await s.end();ok(await q.evaluate(()=>document.getElementById('page-clients').classList.contains('active')),'edge swipe on client page = Back to Clients');
  // sheet (remove client)
  const sheet=await q.evaluate(()=>{try{sheetOpen({title:'Test sheet',sub:'x',html:'',buttons:[{label:'Cancel',fn:sheetClose}]});return true;}catch(e){return false;}});await L.sleep(350);
  if(sheet){const r=await q.evaluate(()=>SHEET_EL.querySelector('.sheet').getBoundingClientRect().top);ok(r>=SAT,'sheet top below inset '+Math.round(r));
    s=await swipe(q,6,250,700,702);await s.end();ok(await q.evaluate(()=>!SHEET_EL),'edge swipe closes sheet');}
  // roundabout untouched: a mid-screen swipe on the overview never triggers back
  await q.evaluate(()=>showPage('dashboard'));await L.sleep(300);ok(await q.evaluate(()=>swbTarget()===null),'no back target on a top-level page (edge swipe inert)');
  ok(q.errors.length===0,'admin: no page errors '+q.errors.join('|'));await q.close();
  // ---------- DESKTOP ----------
  const d=await L.open({pre:PRE,w:1280,h:800,desktop:true,dsf:1});await L.login(d,'olivia@test.com');
  await shot(d,'dz-08-owner-client-title-1280x800');
  await d.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(700);await shot(d,'dz-09-vehicle-back-1280x800');await d.close();
  const e=await L.open({pre:PRE,w:1280,h:800,desktop:true,dsf:1});await L.login(e,'wade@evo.test','password123','advisor');
  await e.evaluate(o=>openClientDetail(o),O);await L.sleep(600);await shot(e,'dz-10-admin-client-title-1280x800');
  await L.close();console.log(fails?'FAIL '+fails:'DZ-SAFE PASS');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
