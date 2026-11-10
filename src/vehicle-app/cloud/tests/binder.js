// v34: Records vault - AI binders. Fake test data only (EXAMPLE / TEST names). scan-document mocked.
const L=require('./lib.js');const path=require('path');const fs=require('fs');
const OUT=process.env.BND_OUT||'/workspace/vehicle-app/cloud/publish-cloud-preview-binder/screens/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011';
function PRE(){return `try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__,T=function(n){return S.tables[n]=S.tables[n]||[];};
 C.documents.push('doc_category','doc_date','vendor','mileage','amount','services','expires_on','ai_status','ai_confidence','ai_summary','ai_model','scanned_at');
 var pl=function(n){var d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 var V1='${V1}',own=T('vehicles').filter(function(v){return v.id===V1;})[0].owner_id;
 T('vehicles').push({id:'d0000000-0000-4000-a000-0000000000b3',owner_id:own,year:2022,make:'Land Rover',model:'Defender 110',nickname:'',vin:'SALEXAMPLE0000003',mileage:12400,archived:false,created_at:'2026-01-04T00:00:00Z'},
  {id:'d0000000-0000-4000-a000-0000000000b4',owner_id:own,year:1966,make:'Jaguar',model:'E-Type',nickname:'',vin:'',mileage:58210,archived:false,created_at:'2026-01-05T00:00:00Z'});
 var n=0,D=function(v,o){n++;var id='b0000000-0000-4000-a000-0000000000'+(n<10?'0':'')+n;T('documents').push(Object.assign({id:id,vehicle_id:v,uploaded_by:own,kind:'other',storage_path:'',mime_type:'text/plain',size_bytes:null,service_record_id:null,owner_only:false,created_at:'2026-0'+(1+n%9)+'-1'+(n%9)+'T00:00:00Z',
   doc_category:null,doc_date:null,vendor:null,mileage:null,amount:null,services:[],expires_on:null,ai_status:'scanned',ai_confidence:0.95,ai_summary:null,ai_model:'test',scanned_at:null},o));return id;};
 D(V1,{title:'Annual service (TEST)',doc_category:'repair_invoice',kind:'invoice',doc_date:pl(-18),vendor:'Test Motors Ltd',mileage:1850,amount:1240,services:['Oil service']});
 D(V1,{title:'Brake pads and fluid (TEST)',doc_category:'repair_invoice',kind:'invoice',doc_date:pl(-140),vendor:'Sample Garage',mileage:1500,amount:2860});
 D(V1,{title:'Tyres x4 (TEST)',doc_category:'receipt',kind:'receipt',doc_date:pl(-280),vendor:'Demo Tyre Co',amount:2100});
 D(V1,{title:'Parking stub',doc_category:'receipt',kind:'receipt',doc_date:pl(-60),vendor:'Example Parking',amount:18,ai_confidence:0.41});
 D(V1,{title:'Insurance policy EVO-TEST-0001',doc_category:'insurance',kind:'insurance',doc_date:pl(-356),vendor:'Example Mutual (fake)',expires_on:pl(9),ai_summary:'Policy no. EVO-TEST-0001 agreed value.'});
 D(V1,{title:'Registration (TEST)',doc_category:'registration',kind:'registration',doc_date:pl(-335),vendor:'Test DMV',expires_on:pl(31)});
 D(V1,{title:'Certificate of title (TEST)',doc_category:'title',kind:'title',doc_date:'2024-03-01'});
 D(V1,{title:'Extended warranty (TEST)',doc_category:'warranty',kind:'other',expires_on:pl(400),vendor:'Sample Warranty Co'});
 D(V1,{title:'Pre-purchase inspection (TEST)',doc_category:'inspection',kind:'other',doc_date:'2024-02-20'});
 D(V1,{title:'Bill of sale (TEST)',doc_category:'other',kind:'other',doc_date:'2024-03-01',amount:229000});
 D(V1,{title:'Loan agreement (TEST)',doc_category:'other',kind:'other',doc_date:'2024-03-01'});
 D(V1,{title:'Window sticker (TEST)',doc_category:'other',kind:'other'});
 D(V1,{title:'VIN plate photo (TEST)',doc_category:null,ai_status:'manual',ai_confidence:null,kind:'other'});
 D('d0000000-0000-4000-a000-0000000000b3',{title:'Registration (TEST)',doc_category:'registration',kind:'registration',expires_on:pl(25)});
 D('d0000000-0000-4000-a000-0000000000b3',{title:'Service invoice (TEST)',doc_category:'service_record',kind:'invoice',amount:780,mileage:12400});
 D('d0000000-0000-4000-a000-0000000000b4',{title:'Inspection report (TEST)',doc_category:'inspection',kind:'other',expires_on:pl(-5)});
 D('d0000000-0000-4000-a000-0000000000b4',{title:'Old style title',doc_category:null,ai_status:'manual',ai_confidence:null,kind:'title'});
 S.bnd={calls:0};var lib=window.supabase,cc=lib.createClient;
 lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__bnd)return c;c.__bnd=1;var inv=c.functions.invoke;c.functions.invoke=function(nm,o){if(nm!=='scan-document')return inv.apply(this,arguments);S.bnd.calls++;
   return Promise.resolve({data:{category:'insurance',confidence:0.98,title:'Insurance policy EVO-TEST-0002',doc_date:pl(9),vendor:'Example Mutual (fake)',mileage:null,amount:null,currency:'USD',services:[],expires_on:pl(374),summary:'Policy no. EVO-TEST-0002, agreed value.',reminders:[],model:'test',remaining:9},error:null});};return c;};
})();`;}
const shot=async(p,n)=>{if(!process.env.BND_SHOTS)return;fs.mkdirSync(OUT,{recursive:true});await p.evaluate(()=>{const r=document.getElementById('bnd-root'),m=document.querySelector('.main');if(r&&m&&!document.getElementById('bnd-filed')){const hb=document.querySelector('.offline-bar,.rem-banner');m.scrollTop+=r.getBoundingClientRect().top-190;}});await L.sleep(400);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+OUT+n+'.png');};
const grey=p=>p.evaluate(()=>{const okc=['rgb(255, 255, 255)','rgb(201, 170, 107)','rgb(224, 138, 116)','rgb(7, 8, 10)'];
  return [...document.querySelectorAll('.bnd *,.bnd-sheet *')].filter(e=>e.offsetParent&&!e.closest('.dt-th')&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).filter(e=>{const s=getComputedStyle(e);return okc.indexOf(s.color)<0||parseFloat(s.fontSize)<15;}).map(e=>e.className+':'+getComputedStyle(e).color+'/'+getComputedStyle(e).fontSize);});
(async()=>{
  await L.launch();
  let p=await L.open({pre:PRE()});await L.login(p,'olivia@test.com');
  await p.evaluate(()=>showPage('documents'));await p.waitForSelector('#bnd-root .bnd-tile',{timeout:8000}).catch(()=>{});await L.sleep(300);
  if(!(await p.evaluate(()=>!!document.getElementById('bnd-root')))){ok(false,'binder vault not in this build (run tools/build_cloud.py)');await L.close();process.exit(1);}
  // collection view
  let c=await p.evaluate(()=>({t:document.getElementById('bnd-root').textContent,tiles:document.querySelectorAll('#bnd-root .bnd-tile').length,leg:document.getElementById('bnd-legacy').style.display}));
  ok(/COLLECTION VAULT/.test(c.t)&&/4 vehicles/.test(c.t)&&/17 documents/.test(c.t),'collection view: vehicles + document count');
  ok(/needs? attention/.test(c.t)&&/Inspections .* expired 5 days ago/.test(c.t),'collection alerts include an expired inspection on another car');
  ok(c.leg==='','legacy file list still shown below the collection vault');
  ok((await grey(p)).length===0,'collection: 15px+, white/gold/red only '+(await grey(p)).join(','));
  await shot(p,'bnd_4_collection');
  // vault for V1
  await p.evaluate(v=>bndOpen(v,null),V1);await L.sleep(400);
  const cnt=await p.evaluate(()=>{const o={};document.querySelectorAll('#bnd-root .bnd-tile').forEach(t=>o[t.dataset.bd]=+t.querySelector('.bnd-n').textContent);return o;});
  ok(JSON.stringify(cnt)===JSON.stringify({service:4,insurance:1,title:1,registration:1,warranty:1,inspections:1,purchase:2,sticker:2}),'auto-filed existing docs into binders '+JSON.stringify(cnt));
  const al=await p.evaluate(()=>[...document.querySelectorAll('#bnd-root .bnd-tile.alert')].map(t=>t.dataset.bd).sort().join());
  ok(al==='insurance,registration,service','red tiles: insurance + registration expiring, service has a low-confidence doc ('+al+')');
  ok(await p.evaluate(()=>/Insurance .* expires in 9 days/.test((document.getElementById('bnd-alerts')||{textContent:''}).textContent)),'expiry alert from AI-read expires_on');
  ok((await grey(p)).length===0,'vault: 15px+, white/gold/red only');
  await shot(p,'bnd_1_vault');
  // auto reminders (existing reminders table; existing "Insurance renewal" etc not duplicated wrongly)
  await L.sleep(600);let st=await L.state(p);
  const rems=(st.tables.reminders||[]).filter(r=>/expires - /.test(r.title));
  ok(rems.some(r=>r.kind==='insurance'&&/Insurance expires/.test(r.title)&&r.remind_days_before===30)&&rems.some(r=>r.kind==='tag')&&rems.some(r=>/Warranty/.test(r.title)),'auto reminders created from expiry dates ('+rems.length+')');
  ok(!rems.some(r=>/Inspection report/.test(r.title)),'no reminder for an already-expired doc');
  await p.evaluate(()=>{BND.auto={};return bndAutoReminders();});await L.sleep(400);st=await L.state(p);
  ok((st.tables.reminders||[]).filter(r=>/expires - /.test(r.title)).length===rems.length,'reminders are not duplicated on re-render');
  // search
  await p.evaluate(()=>bndSearch('brake'));
  ok(await p.evaluate(()=>/1 match/.test(document.getElementById('bnd-results').textContent)&&/Brake pads/.test(document.getElementById('bnd-results').textContent)),'search finds "brake"');
  await p.evaluate(()=>bndSearch(''));
  // inside Service binder
  await p.evaluate(v=>bndOpen(v,'service'),V1);await L.sleep(400);
  const sv=await p.evaluate(()=>({tot:document.getElementById('bnd-totals').textContent,rows:[...document.querySelectorAll('#bnd-root .bnd-tl .bnd-row')].map(r=>r.querySelector('.bnd-rt').textContent),low:[...document.querySelectorAll('#bnd-root .bnd-row.low')].length,mv:document.querySelectorAll('#bnd-root .bnd-move').length}));
  ok(/\$6,218/.test(sv.tot)&&/1,850 mi/.test(sv.tot),'service totals: spend + last mileage '+sv.tot);
  ok(sv.rows[0]==='Annual service (TEST)'&&sv.rows.length===4,'timeline newest first');
  ok(sv.low===1&&sv.mv===4,'low-confidence doc flagged, each doc has Move');
  ok((await grey(p)).length===0,'binder: 15px+, white/gold/red only '+(await grey(p)).join(','));
  await shot(p,'bnd_3_service');
  // move (one tap, remembered on the row)
  const pk=await p.evaluate(()=>document.querySelector('#bnd-root .bnd-row.low').dataset.doc);
  await p.evaluate(id=>bndMoveOpen(id),pk);await L.sleep(200);
  ok(await p.evaluate(()=>document.querySelectorAll('#bnd-sheet .bnd-pick').length===9),'move sheet lists all 9 binders');
  await p.evaluate(()=>document.querySelector('#bnd-sheet .bnd-pick[data-bd="other"]').click());await L.sleep(600);
  st=await L.state(p);const mv=(st.tables.documents||[]).filter(d=>d.id===pk)[0];
  ok(mv&&/"bd":"other"/.test(mv.title)&&/^Parking stub/.test(mv.title),'move saved on the document row (title extras), name kept');
  await p.evaluate(()=>{localStorage.removeItem('evo_bnd_moves');});await p.evaluate(()=>loadAll().then(()=>refreshCurrent()));await L.sleep(700);
  ok(await p.evaluate(id=>bndOf(byId(getDocs(),id))==='other'&&!bndLowConf(byId(getDocs(),id)),pk),'move remembered after reload; no longer flagged');
  // auto-filed upload (real Add document + AI scan + save)
  await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();if(u.indexOf('/storage/v1/object/sign/')>=0)return r.respond({status:200,contentType:'image/jpeg',body:fs.readFileSync(path.join(__dirname,'fixture.jpg')),headers:{'access-control-allow-origin':'*'}});r.continue();});
  await p.evaluate(v=>{bndOpen(v,null);openDocModal(v);},V1);await L.sleep(300);
  const inp=await p.$('#doc-img-input');await inp.uploadFile(path.join(__dirname,'fixture.jpg'));await L.sleep(700);
  await p.evaluate(()=>document.getElementById('doc-scan-btn').click());
  await p.waitForFunction(()=>{const s=document.getElementById('dai-state');return s&&!/scanning/.test(s.className)&&document.getElementById('modal-docscan').classList.contains('active');},{timeout:8000});await L.sleep(200);
  await p.evaluate(()=>docAiSave());await p.waitForSelector('#bnd-filed',{timeout:8000}).catch(()=>{});await L.sleep(500);
  const fd=await p.evaluate(()=>{const e=document.getElementById('bnd-filed');return e?e.textContent:'';});
  ok(/Filed to Insurance/.test(fd)&&/EVO-TEST-0002/.test(fd)&&/Expires/.test(fd)&&/98% confident/.test(fd)&&/Binder now holds 2/.test(fd),'upload auto-filed: "Filed to Insurance" with policy no. + expiry');
  ok((await grey(p)).length===0,'filed sheet: 15px+, white/gold/red only '+(await grey(p)).join(','));
  await shot(p,'bnd_2_filed');
  ok(await p.evaluate(()=>/Wrong binder/.test(document.getElementById('bnd-filed').textContent)),'filed sheet offers Move');
  await p.evaluate(()=>bndClose());await L.sleep(300);
  ok(await p.evaluate(()=>!/needs? attention[^]*Insurance/.test(document.getElementById('bnd-root').textContent)||!/Insurance .* expires in 9 days/.test(document.getElementById('bnd-root').textContent)),'renewed policy clears the old insurance alert');
  // classifier unit checks (service scan receipts -> Service)
  const u=await p.evaluate(()=>[bndAuto({srId:'x',ai:{category:'other'}}),bndAuto({type:'invoice'}),bndAuto({name:'Monroney window sticker'}),bndAuto({name:'Lien release',ai:{category:'title'}}),bndAuto({ai:{category:'inspection'}}),bndAuto({name:'Random'})].join());
  ok(u==='service,service,sticker,purchase,inspections,other','classifier: service-scan receipt, legacy type, sticker, loan, inspection, other ('+u+')');
  ok(p.errors.length===0,'no page errors '+p.errors.join('|'));
  await L.close();console.log(fails?'BINDER FAIL '+fails:'BINDER PASS');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
