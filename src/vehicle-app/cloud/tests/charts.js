// v17 value chart + auto-estimate + pull-to-refresh + estimate lines + co-owners. Mocked backend, no keys.
const L=require('./lib.js');
const SC='/workspace/vehicle-app/cloud/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002';
const V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012';
// real-shaped weekly ai_estimates rows (what the estimate-value function writes): V1 has 26 weekly points, V2 one point today.
const PRE=(o)=>`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__;C.vehicles.push('is_replica','builder');C.ai_estimates.push('value_mid','notes','inputs','cache_key');
 C.vehicle_owner_values=['vehicle_id','owner_id','owner_value','owner_value_set_at','set_by','created_at','updated_at'];
 C.collection_members=['collection_owner_id','user_id','role','added_by','invite_id','created_at'];
 (S.tables.vehicles||[]).forEach(function(v){v.is_replica=false;v.builder=null;});
 var O=(S.tables.vehicles||[]).filter(function(v){return v.id==='${V1}';})[0].owner_id;window.__O=O;
 var rows=S.tables.ai_estimates||(S.tables.ai_estimates=[]),now=Date.now(),src=[{title:'bringatrailer.com',url:'https://example.com/bat'},{title:'hagerty.com',url:'https://example.com/h'}];
 ${o.hist===false?'':`for(var w=25;w>=0;w--){var mid=Math.round(214000+(25-w)*620+Math.sin(w/2)*1800);var d=new Date(now-w*7*864e5).toISOString();
   rows.push({id:'h1-'+w,vehicle_id:'${V1}',kind:'value',value_low:mid-12000,value_mid:mid,value_high:mid+12000,currency:'USD',confidence:0.72,sources:src,health_score:null,reasons:[],model_version:'m',as_of:d,created_at:d});}`}
 ${o.v2===false?'':`rows.push({id:'h2-0',vehicle_id:'${V2}',kind:'value',value_low:98000,value_mid:104000,value_high:110000,currency:'USD',confidence:0.41,sources:src.slice(0,1),health_score:null,reasons:[],model_version:'m',as_of:new Date(now).toISOString(),created_at:new Date(now).toISOString()});`}
 ${o.replica?`S.tables.vehicles.forEach(function(v){if(v.id==='${V2}'){v.is_replica=true;v.builder='Superformance';}});`:''}
})();`;
const showHead=(p,sel)=>p.evaluate(s=>{var e=document.querySelector(s);e.scrollIntoView({block:'start'});var n=e.parentElement;while(n&&n!==document.body){var cs=getComputedStyle(n);if(/(auto|scroll)/.test(cs.overflowY)&&n.scrollHeight>n.clientHeight){n.scrollTop-=150;break;}n=n.parentElement;}if(!n||n===document.body)window.scrollBy(0,-150);},sel);
const nan=p=>p.evaluate(()=>/NaN|Infinity|undefined/.test([].slice.call(document.querySelectorAll('.vch svg, .vch-head, .vch-axis, .vch-bub, .vch-ins')).map(function(e){return e.outerHTML;}).join('')));
(async()=>{
await L.launch();
// ---------- 1. pure functions with the app's own code ----------
console.log('CHARTS unit');
let p=await L.open({pre:PRE({hist:false,v2:false}),w:390,h:844});
await L.login(p,'olivia@test.com');await L.sleep(500);
const U=await p.evaluate(()=>{
  var out={},T=todayISO(),d=function(n){var x=new Date();x.setDate(x.getDate()-n);return isoLocal(x);};
  var base=getVehicles()[0],mk=function(id,log,extra){var v=JSON.parse(JSON.stringify(base));v.id=id;v.valueLog=log.map(function(x){return {date:x[0],value:x[1],source:'AI',ai:true};});v.ownerValue=null;v.isReplica=false;v.aiValue=log.length?{value:log[log.length-1][1],confidence:0.72,sources:[{title:'a'},{title:'b'}]}:null;Object.assign(v,extra||{});return v;};
  // carry-forward sums: A d20=100k d6=120k ; B d13=50k
  var A=mk('A',[[d(20),100000],[d(6),120000]]),B=mk('B',[[d(13),50000]]);
  var S=vchCollSeries([A,B],T);out.cf=S.pts.map(function(p){return p.v;});out.cfReal=S.real;out.cfLastExt=!!S.pts[S.pts.length-1].ext;
  // single point
  var one=mk('one',[[T,104000]]),m1=vchVehModel('x',one);out.oneReal=m1.real;out.oneIns=m1.insight('1Y');
  var host=document.createElement('div');host.id='t-host';host.style.width='360px';document.body.appendChild(host);
  vchMount('t-host',m1);out.oneDots=host.querySelectorAll('svg circle').length;out.onePaths=host.querySelectorAll('svg path').length;out.oneHist=host.textContent.indexOf('History starts '+fmtDate(T)+' \u2014 updates weekly')>=0;
  out.oneDisabled=[].slice.call(host.querySelectorAll('.vch-ranges button')).every(function(b){return b.disabled;});
  out.oneDisc=!host.querySelector('.vch-disc').hidden&&/Estimate, not an appraisal/.test(host.querySelector('.vch-disc').textContent);
  // multi point: 30 weekly points
  var log=[];for(var w=29;w>=0;w--)log.push([d(w*7),200000+(29-w)*1000]);
  var mm=vchVehModel('x',mk('multi',log));vchMount('t-host',mm);
  out.mPaths=host.querySelectorAll('svg path').length;out.mOn=(host.querySelector('.vch-ranges button.on')||{}).textContent;
  out.mEnabled=[].slice.call(host.querySelectorAll('.vch-ranges button')).filter(function(b){return !b.disabled;}).map(function(b){return b.textContent;});
  out.mChg=host.querySelector('.vch-chg').textContent;out.mIns=mm.insight('3M');out.mBig=host.querySelector('.vch-big').textContent;
  out.mAxis=host.querySelector('.vch-axis').textContent;
  out.mNaN=/NaN|Infinity/.test(host.innerHTML);
  // owner value priority, no owner history -> owner point + dashed AI line
  var ov=mk('ov',log,{ownerValue:{value:255000,setAt:T}});var mo=vchVehModel('x',ov);vchMount('t-host',mo);
  out.oLab=host.querySelector('.vch-labt').textContent;out.oBig=host.querySelector('.vch-big').textContent;out.oDash=!!host.querySelector('path[stroke-dasharray="5 6"]');out.oOwn=!!host.querySelector('.vch-own');
  out.oLeg=host.querySelector('.vch-leg').textContent;out.oIns=mo.insight('1Y');
  // collection total uses the owner value (same as portfolioTotals)
  var S2=vchCollSeries([ov,A],T);out.collOwn=S2.pts[S2.pts.length-1].v;
  // replica
  var rp=mk('rp',log,{isReplica:true,builder:'Superformance'});out.rIns=vchVehModel('x',rp).insight('1Y');
  // ranges slicing: 1M keeps the carried value at the range start
  out.slice1M=vchSlice(mm.main,'1M',T).length;out.sliceFirstCarry=!!vchSlice([{d:d(60),v:1},{d:d(10),v:2},{d:T,v:3}],'1M',T)[0].carry;
  // no NaN with odd data
  var odd=mk('odd',[[d(3),'x'],[d(2),null],[d(1),0],[T,150000]]);var mo2=vchVehModel('x',odd);vchMount('t-host',mo2);out.oddNaN=/NaN|Infinity/.test(host.innerHTML);out.oddReal=mo2.real;
  host.remove();return out;
});
ok(JSON.stringify(U.cf)==='[100000,150000,170000,170000]'&&U.cfReal===3&&U.cfLastExt,'collection carry-forward sums each car\'s latest value as of each date: '+JSON.stringify(U.cf));
ok(U.oneReal===1&&U.oneDots>=3&&U.onePaths===0,'1 point: single glowing dot, no line');
ok(U.oneHist,'1 point: "History starts <date> \u2014 updates weekly"');
ok(U.oneDisabled,'1 point: ranges disabled (no data)');
ok(/^First AI estimate recorded \w+ \d+\. Trends appear after a few weekly updates\./.test(U.oneIns),'1 point insight says so plainly: '+U.oneIns);
ok(U.oneDisc,'"Estimate, not an appraisal" under the AI headline');
ok(U.mPaths>=3&&U.mOn==='1Y'&&U.mEnabled.join()==='1M,3M,1Y,All','multi-point: glow line + gradient fill, 1Y default, all ranges usable');
ok(/\u25B2 \+\$/.test(U.mChg)&&/\(\+\d+\.\d%\)/.test(U.mChg),'big value with change in $ and %: '+U.mChg);
ok(/Today$/.test(U.mAxis),'axis ends at Today');
ok(/^AI estimate up \d+\.\d% \(\+\$[\d,]+\) over the past 3 months\. Latest estimate: 72% confidence, 2 sources\./.test(U.mIns),'vehicle insight: change + confidence + sources: '+U.mIns);
ok(U.oLab==='Owner value'&&/255,000/.test(U.oBig),'owner value is the headline, labelled "Owner value"');
ok(U.oDash&&U.oOwn&&/Owner value/.test(U.oLeg)&&/AI estimate/.test(U.oLeg),'owner value point + AI estimates as a dashed secondary line');
ok(/Your owner value is \$[\d,]+ (above|below) the latest AI estimate/.test(U.oIns),'owner insight compares with the AI estimate');
ok(U.collOwn===255000+120000,'collection total uses the owner value where set');
ok(/Valued as a replica by Superformance\./.test(U.rIns),'replica: insight says it is valued as a replica');
ok(U.sliceFirstCarry,'range start carries the last known value forward');
ok(!U.mNaN&&!U.oddNaN&&U.oddReal===1,'no NaN / Infinity with odd rows (bad values ignored)');
ok(p.errors.length===0,'unit: no page errors '+p.errors.join(' | '));
await p.close();

// ---------- 2. UI: collection + vehicle pages, phone + desktop ----------
for(const vp of [{w:390,h:844,tag:'phone',dsf:3},{w:1280,h:860,tag:'desktop',desktop:true,dsf:1}]){
  console.log('CHARTS UI @'+vp.tag);
  p=await L.open({pre:PRE({replica:true}),w:vp.w,h:vp.h,desktop:vp.desktop,dsf:vp.dsf});
  await L.login(p,'olivia@test.com');await L.sleep(900);
  const c=await p.evaluate(()=>{var h=document.getElementById('cp-vch'),b=document.getElementById('cp-brief');
    return {on:!!h&&h.classList.contains('on'),under:!!(h&&b&&h.nextElementSibling&&h.parentNode===b.parentNode&&(h.compareDocumentPosition(b)&4)&&!h.nextElementSibling.matches('.stats3')),
      briefNext:(function(){var e=h,n=null;while(e&&!n){n=e.nextElementSibling;while(n&&getComputedStyle(n).display==='none')n=n.nextElementSibling;e=e.parentElement;}return n&&n.id;})(),
      briefTab:(function(){var t=document.getElementById('cp-ovc-brief');return !!(t&&b&&t.contains(b));})(),
      big:(h.querySelector('.vch-big')||{}).textContent,total:portfolioTotals(visibleVehicles()).value,disc:!h.querySelector('.vch-disc').hidden,
      ins:(h.querySelector('.vch-inst')||{}).textContent,ta:getComputedStyle(h.querySelector('.vch-plot')).touchAction};});
  ok(c.on,'collection chart shown');
  // Option C (p40): the brief moved into the Brief tab of the Portfolio/Brief/Stats switcher that sits directly under the graph
  ok(/^cp-ovc(-wrap)?$/.test(c.briefNext||'')&&c.briefTab,'Collection brief sits directly under the graph (Brief tab, next: '+c.briefNext+')');
  ok(c.big.replace(/[^\d]/g,'')===String(c.total),'headline = collection total ('+c.big+')');
  ok(c.disc,'collection total: "Estimate, not an appraisal"');
  ok(/^(Up|Down|Unchanged)/.test(c.ins)&&/Biggest mover: The Ghost/.test(c.ins),'collection insight: change + biggest contributor: '+c.ins);
  ok(c.ta==='none','chart has touch-action:none');
  ok(!(await nan(p)),'collection: no NaN in the chart');
  await showHead(p,'#cp-vch .vch-head');await L.sleep(200);
  if(vp.tag==='phone'){await p.screenshot({path:SC+'ch-01-collection-phone.png'});}
  // scrub: pointer events -> crosshair + bubble, does not bubble up, does not trigger swipe-back
  const sc=await p.evaluate(async()=>{
    var plot=document.querySelector('#cp-vch .vch-plot'),r=plot.getBoundingClientRect(),leaked=0,lk=function(){leaked++;};
    document.addEventListener('pointerdown',lk);document.addEventListener('pointermove',lk);
    function ev(t,x){plot.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:7,pointerType:'touch',clientX:x,clientY:r.top+r.height/2,isPrimary:true}));}
    ev('pointerdown',r.left+8);
    var claimed=!!(window.SWB&&SWB.claim);
    ev('pointermove',r.left+r.width*0.4);await new Promise(function(z){requestAnimationFrame(function(){requestAnimationFrame(z);});});
    var bu=document.querySelector('#cp-vch .vch-bub'),x=document.querySelector('#cp-vch .vch-x');
    var o={bub:getComputedStyle(bu).opacity,bubTxt:bu.textContent,cross:getComputedStyle(x).opacity,lab:document.querySelector('#cp-vch .vch-labt').textContent,leaked:leaked,claimed:claimed};
    ev('pointermove',r.left+r.width*0.6);await new Promise(function(z){requestAnimationFrame(function(){requestAnimationFrame(z);});});o.moved=document.querySelector('#cp-vch .vch-bub .x').textContent;
    document.removeEventListener('pointerdown',lk);document.removeEventListener('pointermove',lk);return o;});
  ok(sc.bub==='1'&&sc.cross==='1'&&/\$[\d,]+/.test(sc.bubTxt)&&/\d{4}/.test(sc.bubTxt),'scrub: crosshair + date/value bubble ('+sc.bubTxt+')');
  ok(/^Value on |^Value today/.test(sc.lab),'scrub: headline follows the finger ('+sc.lab+')');
  ok(sc.leaked===0,'scrub pointer events stop at the chart (carousel/photo swipes untouched)');
  ok(!sc.claimed,'drag starting on the chart near the left edge does not claim swipe-back');
  if(vp.tag==='phone')await p.screenshot({path:SC+'ch-02-collection-scrub-phone.png'});
  // ranges
  const rg=await p.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('#cp-vch .vch-ranges button'));b[0].click();return {on:document.querySelector('#cp-vch .vch-ranges button.on').textContent,chg:document.querySelector('#cp-vch .vch-chg').textContent};});
  ok(rg.on==='1M'&&/past month/.test(rg.chg),'1M range switches the line + change ('+rg.chg+')');
  if(vp.tag==='desktop'){await p.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('#cp-vch .vch-ranges button'));b[3].click();});await L.sleep(100);await p.screenshot({path:SC+'ch-05-collection-desktop.png'});}
  // vehicle page with history
  await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(700);
  const v=await p.evaluate(()=>{var h=document.getElementById('vd-vch');return {on:!!h&&h.classList.contains('on'),inBlock:!!(h&&h.closest('#val-panel')),lab:h.querySelector('.vch-labt').textContent,ins:h.querySelector('.vch-inst').textContent,disc:!h.querySelector('.vch-disc').hidden,basis:/Cost basis/.test(h.textContent)};});
  ok(v.on&&v.inBlock,'vehicle page: chart inside the value block');
  ok(v.lab==='Estimated value'&&/Latest estimate: 72% confidence, 2 sources/.test(v.ins),'vehicle insight with confidence + sources: '+v.ins);
  ok(v.disc,'vehicle page: "Estimate, not an appraisal" under the value');
  ok(v.basis,'cost basis line shown (real purchase price on file)');
  ok(!(await nan(p)),'vehicle: no NaN');
  if(vp.tag==='phone'){await showHead(p,'#vd-vch .vch-head');await L.sleep(250);await p.screenshot({path:SC+'ch-03-vehicle-phone.png'});}
  // replica car with one estimate -> single-dot state
  await p.evaluate(i=>openVehicleDetail(i),V2);await L.sleep(700);
  const r=await p.evaluate(()=>{var h=document.getElementById('vd-vch');return {txt:h.textContent,badge:!!document.querySelector('#vd-rep .vr-badge'),ins:h.querySelector('.vch-inst').textContent};});
  ok(r.badge&&/Valued as a replica by Superformance/.test(r.ins),'replica car: Replica badge + replica-based estimate noted');
  ok(/History starts .* \u2014 updates weekly/.test(r.txt)&&/First AI estimate recorded/.test(r.ins)&&/41% confidence, 1 source/.test(r.ins)&&r.txt.indexOf('History starts '+new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))>=0,'replica car with one estimate: single-dot state on today\'s local date, confidence said plainly');
  if(vp.tag==='phone'){await showHead(p,'#vd-vch .vch-head');await L.sleep(250);await p.screenshot({path:SC+'ch-04-vehicle-single-phone.png'});}
  ok(p.errors.length===0,'UI '+vp.tag+': no page errors '+p.errors.join(' | '));
  await p.close();
}

// ---------- 3. auto-estimate after add, after photo upload, pull-to-refresh ----------
console.log('AUTO ESTIMATE + PULL TO REFRESH');
p=await L.open({pre:PRE({hist:false,v2:false}),w:390,h:844});
await p.evaluate(()=>{window.__MOCK_STATE__.est.mode='ok';});
await L.login(p,'olivia@test.com');await L.sleep(700);
const calls=()=>p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(c=>c.name==='estimate-value'&&c.body&&c.body.vehicle_id).map(c=>c.body.vehicle_id));
const t0=Date.now();
await p.evaluate(()=>{openAddVehicleModal();setVal('v-year','1989');setVal('v-make','BMW');setVal('v-model','M3');saveVehicle();});
const uiFree=Date.now()-t0;
await L.sleep(3500);
let st=await p.evaluate(()=>{var vs=getVehicles(),nv=vs.filter(v=>v.make==='BMW')[0];return {id:nv&&nv.id,val:nv&&nv.aiValue&&nv.aiValue.value,total:portfolioTotals(visibleVehicles()).value,head:(document.querySelector('#cp-vch .vch-big')||{}).textContent||document.getElementById('cp-total-value').textContent};});
let cl=await calls();
ok(st.id&&cl.indexOf(st.id)>=0,'new vehicle: estimate-value called in the background');
ok(uiFree<1500,'adding did not wait for the estimate');
ok(st.val>0&&String(st.total)===st.head.replace(/[^\d]/g,''),'collection total recomputed after the estimate, no reload ('+st.head+')');
// fail quietly
await p.evaluate(()=>{window.__MOCK_STATE__.est.mode='e502';openAddVehicleModal();setVal('v-year','1990');setVal('v-make','Lancia');setVal('v-model','Delta');saveVehicle();});
await L.sleep(2500);
const toasts=await p.evaluate(()=>[].slice.call(document.querySelectorAll('.toast')).map(t=>t.textContent).join(' | '));
ok(!/estimate/i.test(toasts),'failed background estimate stays quiet ('+toasts+')');
// photo upload to a car with no estimate -> auto estimate (the hook in pfUploadAll)
await p.evaluate(()=>{window.__MOCK_STATE__.est.mode='ok';});
ok(await p.evaluate(()=>/valueAutoQueue\(v\.id,300\)/.test(pfUploadAll.toString())),'photo upload completion queues an estimate for cars without one');
const n0=(await calls()).length;
await p.evaluate(()=>{var v=getVehicles().filter(x=>x.make==='Lancia')[0];try{var u=getUI();delete (u.valRef||{})[v.id];localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}window.__lan=v.id;});
// pull-to-refresh: touch pull on the collection screen at scrollTop 0
await p.evaluate(()=>{showPage('client-portal');document.querySelector('.main').scrollTop=0;});await L.sleep(300);
const pr=await p.evaluate(async()=>{
  var m=document.querySelector('.main'),tgt=document.getElementById('cp-welcome')||m;
  function T(type,x,y){var t=new Touch({identifier:3,target:tgt,clientX:x,clientY:y});tgt.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}));}
  T('touchstart',200,150);for(var y=160;y<=420;y+=20){T('touchmove',202,y);await new Promise(r=>setTimeout(r,8));}
  var shown=document.getElementById('ptr'),op=shown?getComputedStyle(shown).opacity:'0',ring=!!(shown&&shown.querySelector('svg'));
  T('touchend',202,420);await new Promise(r=>setTimeout(r,60));
  return {op:op,ring:ring,spin:!!(shown&&shown.classList.contains('spin')),page:(document.querySelector('.page.active')||{}).id,st:m.scrollTop,init:PTR.init};});
ok(pr.ring&&Number(pr.op)>0&&pr.spin,'pull-down at the top shows the gold ring and refreshes');
await L.sleep(3500);
cl=await calls();
const lan=await p.evaluate(()=>window.__lan);
ok(cl.slice(n0).indexOf(lan)>=0,'after the pull, cars without an estimate get one');
ok(await p.evaluate(()=>{var v=getVehicles().filter(x=>x.make==='Lancia')[0];return !!(v.aiValue&&v.aiValue.value>0);}),'...and the total/chart update without a reload');
// limits: per-vehicle daily rule + per-user 429 stop + max N
const lim=await p.evaluate(async()=>{
  var S=window.__MOCK_STATE__,before=S.fn.calls.length;valueAutoMissing(5);await new Promise(r=>setTimeout(r,800));
  var again=S.fn.calls.length-before;
  AUTOV.stop=false;S.est.mode='ratelimit';
  ['A1','A2','A3'].forEach(function(x){});
  return {again:again,max:AUTOV.max};});
ok(lim.again===0,'no repeat calls for cars already estimated today (per-vehicle daily rule)');
ok(lim.max===5,'pull-to-refresh asks for at most 5 estimates');
const stopT=await p.evaluate(async()=>{var S=window.__MOCK_STATE__;S.est.mode='ratelimit';var vs=getVehicles().slice(0,2);vs.forEach(function(v){v.aiValue=null;});try{var u=getUI();u.valRef={};localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}
  var b=S.fn.calls.length;vs.forEach(function(v){valueAutoQueue(v.id,0);});await new Promise(r=>setTimeout(r,1500));return {n:S.fn.calls.length-b,stop:AUTOV.stop||!!VQ.stopped};});
ok(stopT.n===1&&stopT.stop,'a per-user daily limit (429) stops the queue after one call');
// conflicts: pull from the left edge = swipe-back territory; pull on a non-collection page = nothing
const cf=await p.evaluate(async()=>{
  AUTOV.stop=false;var m=document.querySelector('.main'),tgt=document.getElementById('cp-welcome')||m,e=document.getElementById('ptr');e.style.opacity='0';
  function T(type,x,y){var t=new Touch({identifier:4,target:tgt,clientX:x,clientY:y});tgt.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));}
  T('touchstart',10,150);for(var y=160;y<=420;y+=40)T('touchmove',12,y);var a=getComputedStyle(e).opacity;T('touchend',12,420);
  T('touchstart',200,150);T('touchmove',320,160);T('touchmove',380,170);var b=getComputedStyle(e).opacity;T('touchend',380,170);
  return {edge:a,horiz:b};});
ok(cf.edge==='0'&&cf.horiz==='0','pull-to-refresh ignores left-edge (swipe-back) and horizontal (carousel) drags');
ok(p.errors.length===0,'auto: no page errors '+p.errors.join(' | '));
await p.close();

// ---------- 4. co-owners (mock of migration_010 RPCs) ----------
console.log('CO-OWNERS');
const COPRE=PRE({})+`(function(){var S=window.__MOCK_STATE__;S.seq=S.seq||1;
 S.users.push({id:'e0000000-0000-4000-a000-000000000077',email:'sam@test.com',password:'password123',confirmed:true});
 S.tables.profiles.push({id:'e0000000-0000-4000-a000-000000000077',role:'owner',display_name:'Sam Harper',email:'sam@test.com'});
 var CODE='c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0';
 function me(){return S.session.user.id;}function coll(u){var m=(S.tables.collection_members||[]).filter(function(x){return x.user_id===u;})[0];return m?m.collection_owner_id:u;}
 S.rpcHandlers.create_co_owner_invite=function(){var iid='inv-co-'+S.seq++;(S.tables.invites=S.tables.invites||[]).push({id:iid,kind:'co_owner',created_by:me(),owner_id:coll(me()),expires_at:new Date(Date.now()+14*864e5).toISOString()});S.coCode=CODE;return {data:[{invite_id:iid,code:CODE,expires_at:new Date().toISOString()}],error:null};};
 var red=S.rpcHandlers.redeem_invite;S.rpcHandlers.redeem_invite=function(a){if(a.p_code!==CODE)return red(a);var inv=(S.tables.invites||[]).filter(function(i){return i.kind==='co_owner'&&!i.redeemed_at;})[0];if(!inv)return {data:null,error:{code:'P0001',message:'invalid_or_expired_invite'}};
   inv.redeemed_at=new Date().toISOString();(S.tables.collection_members=S.tables.collection_members||[]).push({collection_owner_id:inv.owner_id,user_id:me(),role:'owner',added_by:inv.created_by,created_at:new Date().toISOString()});return {data:{kind:'co_owner',owner_id:inv.owner_id},error:null};};
 S.rpcHandlers.remove_co_owner=function(a){var m=(S.tables.collection_members||[]).filter(function(x){return x.user_id===a.p_user_id;})[0];if(!m)return {data:null,error:{code:'P0002',message:'not_found'}};
   if(!(m.collection_owner_id===me()||a.p_user_id===me()))return {data:null,error:{code:'42501',message:'not_allowed'}};S.tables.collection_members=S.tables.collection_members.filter(function(x){return x!==m;});return {data:{removed:a.p_user_id},error:null};};
})();`;
p=await L.open({pre:COPRE,w:390,h:844});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(()=>showPage('access'));await L.sleep(400);
ok(await p.evaluate(()=>!!document.getElementById('co-invite-btn')),'"Invite co-owner" on My team');
await p.evaluate(()=>document.getElementById('co-invite-btn').click());await L.sleep(500);
const inv=await p.evaluate(()=>{var b=document.getElementById('co-code');return b?b.textContent:'';});
ok(/C0C0-C0C0/i.test(inv)&&/\?invite=c0c0c0c0/.test(inv)&&/not sent automatically/.test(inv),'one-time code + ?invite= link shown to copy or share');
ok(await p.evaluate(()=>window.__MOCK_STATE__.emails.length===0),'nothing is sent automatically');
await p.evaluate(()=>document.getElementById('co-code').scrollIntoView({block:'center'}));await L.sleep(200);
await p.screenshot({path:SC+'ch-06-coowner-invite-phone.png'});
await p.close();
p=await L.open({pre:COPRE+`(function(){var S=window.__MOCK_STATE__;(S.tables.collection_members=S.tables.collection_members||[]);})();`,w:390,h:844});
// Sam redeems (the mock invite row lives per page, so recreate it as Olivia first)
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.invites=S.tables.invites||[];S.tables.invites.push({id:'inv-co-x',kind:'co_owner',created_by:window.__O,owner_id:window.__O});});
await L.login(p,'sam@test.com');await L.sleep(600);
ok(await p.evaluate(()=>getVehicles().length===0),'before joining Sam sees no cars');
const rr=await p.evaluate(async()=>{var r=await sb.rpc('redeem_invite',{p_code:'c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'});return {d:r.data,t:inviteDoneText(r.data)};});
ok(rr.d&&rr.d.kind==='co_owner'&&/co-owner/.test(rr.t),'co-owner redeems the code: '+rr.t);
await p.evaluate(()=>reloadAll(true));await L.sleep(900);await p.evaluate(()=>showPage('client-portal'));await L.sleep(500);
const so=await p.evaluate(()=>({n:visibleVehicles().length,oc:ownerClientId(),total:portfolioTotals(visibleVehicles()).value,chart:!!document.querySelector('#cp-vch.on')}));
ok(so.n===2&&!!so.oc,'co-owner sees the whole collection with equal rights ('+so.n+' cars)');
ok(so.chart&&so.total>0,'co-owner gets the same value chart and total');
await p.evaluate(()=>showPage('access'));await L.sleep(400);
ok(await p.evaluate(()=>/Leave collection/.test(document.getElementById('co-sec').textContent)),'co-owner can leave');
const pageErr=p.errors.slice();
await p.evaluate(()=>{window.confirm=()=>true;var b=[].slice.call(document.querySelectorAll('#co-sec button')).filter(x=>/Leave/.test(x.textContent))[0];b.click();});await L.sleep(1200);
ok(await p.evaluate(()=>(window.__MOCK_STATE__.tables.collection_members||[]).length===0&&getVehicles().length===0),'after leaving: membership gone, no cars');
ok(pageErr.length===0,'co-owner: no page errors '+pageErr.join(' | '));
await p.close();
// original owner removes; others cannot
p=await L.open({pre:COPRE+`(function(){var S=window.__MOCK_STATE__;S.tables.collection_members=[{collection_owner_id:window.__O,user_id:'e0000000-0000-4000-a000-000000000077',role:'owner',created_at:new Date().toISOString()}];})();`,w:390,h:844});
await L.login(p,'olivia@test.com');await L.sleep(600);await p.evaluate(()=>showPage('access'));await L.sleep(400);
ok(await p.evaluate(()=>/Sam Harper/.test(document.getElementById('co-sec').textContent)&&/Remove/.test(document.getElementById('co-sec').textContent)),'original owner sees the co-owner with Remove');
await p.evaluate(()=>{window.confirm=()=>true;var b=[].slice.call(document.querySelectorAll('#co-sec button')).filter(x=>/^Remove$/.test(x.textContent))[0];b.click();});await L.sleep(1000);
ok(await p.evaluate(()=>(window.__MOCK_STATE__.tables.collection_members||[]).length===0),'original owner removes the co-owner');
ok(p.errors.length===0,'owner: no page errors '+p.errors.join(' | '));
await p.close();
await L.close();
console.log('CHARTS PASS '+pass+'  FAIL '+fail);
process.exit(fail?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(1);});
