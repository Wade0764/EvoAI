// AI document scanning + AI reminders against the mock backend (scan-document mocked; never a real key).
const L=require('./lib.js');const path=require('path');
const OUT='/workspace/vehicle-app/cloud/screens/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011',O='b0000000-0000-4000-a000-000000000002';
// mode: mig (007 applied) | nomig (no columns/RPC) ; scan: ok | missing | ratelimit
function PRE(mode,scan){return `try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__;S.docai={mode:'${mode}',scan:'${scan}',calls:[]};
 S.tables.profiles.forEach(function(p){if(p.id==='${O}')p.display_name="Amy & David's collective";});
 if('${mode}'==='mig'){C.documents.push('doc_category','doc_date','vendor','mileage','amount','services','expires_on','ai_status','ai_confidence','ai_summary','ai_model','scanned_at');
   C.reminders.push('ai_generated','source_document_id','ai_reason');
   (S.tables.documents||[]).forEach(function(d){d.ai_status='manual';d.services=[];});
   S.rpcHandlers.add_doc_reminders=function(a){var d=(S.tables.documents||[]).filter(function(x){return x.id===a.p_document_id;})[0];if(!d)return {data:null,error:{code:'P0002',message:'document_not_found'}};
     var R=S.tables.reminders||(S.tables.reminders=[]);for(var i=R.length-1;i>=0;i--)if(R[i].source_document_id===d.id&&R[i].ai_generated&&!R[i].completed_at)R.splice(i,1);
     var v=S.tables.vehicles.filter(function(x){return x.id===d.vehicle_id;})[0];
     a.p_items.forEach(function(it,k){R.push({id:'ai-rem-'+(S.seq++),vehicle_id:d.vehicle_id,owner_id:v.owner_id,kind:it.kind,title:it.title,due_date:it.due_date,due_mileage:it.due_mileage,repeat_months:it.repeat_months,repeat_miles:it.repeat_miles,completed_at:null,created_by:S.session.user.id,created_at:new Date().toISOString(),ai_generated:true,source_document_id:d.id,ai_reason:it.reason});});
     return {data:{inserted:a.p_items.length,replaced:0},error:null};};}
 var lib=window.supabase,cc=lib.createClient;
 lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__dz)return c;c.__dz=1;
   var inv=c.functions.invoke;c.functions.invoke=function(n,o){if(n!=='scan-document')return inv.apply(this,arguments);S.docai.calls.push(o&&o.body);
     return new Promise(function(res){setTimeout(function(){var m=S.docai.scan;
       var FE=function(st,b){return {name:'FunctionsHttpError',context:{status:st,json:function(){return Promise.resolve(b||{});}}};};
       if(m==='missing')return res({data:null,error:FE(404)});if(m==='ratelimit')return res({data:null,error:FE(429,{error:'rate_limited'})});
       var reg=S.docai.next==='registration';
       res({data:reg?{category:'registration',confidence:0.94,title:'NJ registration',doc_date:'2026-03-31',vendor:'NJ MVC',mileage:null,amount:84,currency:'USD',services:[],expires_on:'2027-03-31',summary:'Registration for the 911.',
           reminders:[{kind:'tag',title:'Registration renewal',due_date:'2027-03-31',due_mileage:null,repeat_months:12,repeat_miles:null,reason:'The registration expires on 2027-03-31.'}],model:'gemini-3.5-flash',remaining:38}
         :{category:'repair_invoice',confidence:0.91,title:"Annual service - Holbert's Porsche",doc_date:'2026-09-14',vendor:"Holbert's Porsche",mileage:2410,amount:1284.6,currency:'USD',
           services:['Engine oil and filter','Brake fluid flush','Cabin air filter','Multi-point inspection'],expires_on:null,summary:'Annual service with brake fluid.',
           reminders:[{kind:'service',title:'Oil service',due_date:'2027-09-14',due_mileage:12410,repeat_months:12,repeat_miles:10000,reason:'Porsche specifies an oil service every 10,000 mi or 12 months for the 911 Carrera S; last done at 2,410 mi on Sep 14, 2026.'},
                      {kind:'service',title:'Brake fluid',due_date:'2028-09-14',due_mileage:null,repeat_months:24,repeat_miles:null,reason:'Porsche specifies brake fluid every 2 years regardless of mileage.'}],model:'gemini-3.5-flash',remaining:39},error:null});},250);});};
   if('${mode}'==='nomig'){var fr=c.from;c.from=function(t){var q=fr.apply(this,arguments);if(t==='documents'){var up=q.update;q.update=function(p){if(p&&('ai_status' in p||'doc_category' in p)){var e={data:null,error:{code:'PGRST204',message:"Could not find the 'ai_status' column of 'documents' in the schema cache"}};var th={eq:function(){return Promise.resolve(e);}};return th;}return up.apply(q,arguments);};}return q;};}
   return c;};
})();`;}
// v18: the documents list now fetches the (signed) files for thumbnails; serve fixtures instead of hitting the real host with token=x
const fs=require('fs');
async function serveDocs(p){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();if(u.indexOf('/storage/v1/object/sign/')>=0){const pdf=/\.pdf\?/.test(u);return r.respond({status:200,contentType:pdf?'application/pdf':'image/jpeg',body:fs.readFileSync(path.join(__dirname,pdf?'fixture.pdf':'fixture.jpg')),headers:{'access-control-allow-origin':'*'}});}
  if(u.indexOf('cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/')>=0)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'fixtures/pdfjs/',u.split('/').pop())),headers:{'access-control-allow-origin':'*'}});r.continue();});}
const shot=async(p,n)=>{await L.sleep(350);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
async function addDoc(p,file,next){
  await p.evaluate((v,n)=>{window.__MOCK_STATE__.docai.next=n;openDocModal(v);},V1,next||'');await L.sleep(300);
  const inp=await p.$('#doc-img-input');await inp.uploadFile(path.join(__dirname,file));await L.sleep(700);
}
const isActive=(p,id)=>p.evaluate(i=>{const m=document.getElementById(i);return !!(m&&m.classList.contains('active'));},id);
async function scanFlow(p){await p.evaluate(()=>document.getElementById('doc-scan-btn').click());
  await p.waitForFunction(()=>{const s=document.getElementById('dai-state');return s&&!/scanning/.test(s.className)&&document.getElementById('modal-docscan').classList.contains('active');},{timeout:8000});await L.sleep(200);}
(async()=>{
  await L.launch();
  // ===== owner, migration applied, function on =====
  let p=await L.open({pre:PRE('mig','ok')});await serveDocs(p);await L.login(p,'olivia@test.com');
  await addDoc(p,'fixture.pdf');
  ok(await p.evaluate(()=>!!document.getElementById('doc-scan-btn')&&/scan with AI/.test(document.getElementById('doc-scan-btn').textContent)),'Save & scan button in Add document');
  await shot(p,'dz-11-add-document-390x844');
  await scanFlow(p);
  const f=await p.evaluate(()=>({cat:val('dai-cat'),date:val('dai-date'),ven:val('dai-vendor'),mi:val('dai-miles'),amt:val('dai-amount'),svc:val('dai-svc').split('\n').length,rems:document.querySelectorAll('#dai-rems .dai-rem').length,why:document.querySelector('#dai-rems .dai-why').textContent,st:document.getElementById('dai-state').textContent}));
  ok(f.cat==='repair_invoice'&&f.date==='2026-09-14'&&/Holbert/.test(f.ven)&&f.mi==='2410'&&f.amt==='1284.6'&&f.svc===4,'scan fills category/date/vendor/mileage/amount/services '+JSON.stringify(f).slice(0,160));
  ok(f.rems===2&&/10,000 mi or 12 months/.test(f.why),'2 proposed reminders with the reason');
  ok(/Read by AI \(91% confident\)/.test(f.st),'confidence shown');
  const call=await p.evaluate(()=>window.__MOCK_STATE__.docai.calls[0]);
  ok(call&&/^[0-9a-f-]{36}$/.test(call.document_id)&&Object.keys(call).length===1,'function called with document_id only (no key, no file bytes)');
  ok(await p.evaluate(()=>!/AIza|VISION_API_KEY|generativelanguage/.test(document.documentElement.outerHTML)),'no key or provider URL in the client');
  await p.evaluate(()=>{const m=document.getElementById('modal-docscan');m.scrollTop=0;});await shot(p,'dz-12-scan-result-390x844');
  await p.evaluate(()=>{document.querySelector('#modal-docscan .dai-rems-wrap').scrollIntoView();});await shot(p,'dz-13-scan-reminders-390x844');
  // manual edit then save
  await p.evaluate(()=>{setVal('dai-vendor',"Holbert's Porsche Warrington");});
  await p.evaluate(()=>docAiSave());await L.sleep(1200);
  let st=await L.state(p);
  const row=st.tables.documents.find(d=>d.id===call.document_id);
  ok(row&&row.doc_category==='repair_invoice'&&row.ai_status==='edited'&&row.vendor==="Holbert's Porsche Warrington"&&row.mileage===2410&&row.amount===1284.6&&row.services.length===4&&row.doc_date==='2026-09-14','document filed + manual edit kept (ai_status edited)');
  ok(row&&row.kind==='invoice'&&/^Annual service/.test(row.title),'kind mapped to invoice, title kept');
  const ar=st.tables.reminders.filter(r=>r.ai_generated&&r.source_document_id===call.document_id);
  ok(ar.length===2&&ar.every(r=>r.ai_reason&&r.vehicle_id===V1),'2 AI reminders with source document + reason');
  ok(st.rpcs.some(r=>r.name==='add_doc_reminders'),'reminders go through add_doc_reminders');
  ok(!st.v.length,'no schema violations '+st.v.join('|'));
  // second doc: registration (older) -> renewal reminder from expiry
  await addDoc(p,'fixture.jpg','registration');await scanFlow(p);
  ok(await p.evaluate(()=>val('dai-cat')==='registration'&&val('dai-exp')==='2027-03-31'&&/expires on 2027-03-31/.test(document.querySelector('#dai-rems').textContent)),'registration: expiry + renewal reminder');
  await p.evaluate(()=>docAiSave());await L.sleep(1200);
  st=await L.state(p);
  ok(st.tables.reminders.some(r=>r.ai_generated&&r.kind==='tag'&&r.due_date==='2027-03-31'),'registration renewal reminder saved (kind tag)');
  // documents list: newest first
  await p.evaluate(()=>showPage('documents'));await L.sleep(500);
  const order=await p.evaluate(()=>[...document.querySelectorAll('#documents-list .dai-row')].map(r=>{const d=getDocs().find(x=>x.id===r.dataset.doc);return d?docAiDate(d):'';}));
  const v1docs=order;ok(order.length>=2&&order.slice().sort().reverse().join()===order.join(),'documents sorted newest first '+order.join(','));
  ok(await p.evaluate(()=>/Read by AI|AI \/ edited/.test(document.getElementById('documents-list').textContent)&&/Repair invoice/.test(document.getElementById('documents-list').textContent)),'list shows AI badge + category');
  await shot(p,'dz-14-documents-sorted-390x844');
  // details reopen = manual edit option
  await p.evaluate(id=>docAiOpenEdit(id),call.document_id);await L.sleep(400);
  ok(await p.evaluate(()=>val('dai-vendor')==="Holbert's Porsche Warrington"&&/then edited/.test(document.getElementById('dai-state').textContent)),'Details reopens saved fields for editing');
  await p.evaluate(()=>docAiClose());await L.sleep(300);
  // reminders page + vehicle page
  await p.evaluate(()=>showPage('reminders'));await L.sleep(500);
  const rp=await p.evaluate(()=>({n:document.querySelectorAll('#rem-body .dai-card').length,t:document.getElementById('rem-body').textContent}));
  ok(rp.n===3&&/Why:/.test(rp.t)&&/From Annual service/.test(rp.t),'reminders page: 3 AI reminders with why + source doc');
  await shot(p,'dz-15-ai-reminders-390x844');
  await p.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(700);
  await p.evaluate(()=>document.getElementById('vd-airem').scrollIntoView());
  ok(await p.evaluate(()=>document.querySelectorAll('#vd-airem .dai-card').length===3),'vehicle page lists its AI reminders');
  await shot(p,'dz-16-vehicle-ai-reminders-390x844');
  await p.evaluate(()=>closeModal('modal-vehicle-detail'));await L.sleep(300);
  // done / dismiss
  await p.evaluate(()=>showPage('reminders'));await L.sleep(300);
  await p.evaluate(()=>document.querySelector('#rem-body .dai-card .dai-rem-act .btn').click());await L.sleep(500);
  ok(await p.evaluate(()=>document.querySelectorAll('#rem-body .dai-card').length===2),'Done removes it from the list');
  ok(p.errors.length===0,'owner: no page errors '+p.errors.join('|'));
  // desktop shots
  const d=await L.open({pre:PRE('mig','ok'),w:1280,h:800,desktop:true,dsf:1});await L.login(d,'olivia@test.com');
  await addDoc(d,'fixture.pdf');await scanFlow(d);await shot(d,'dz-17-scan-result-1280x800');await d.evaluate(()=>docAiSave());await L.sleep(1200);
  await d.evaluate(()=>showPage('documents'));await L.sleep(400);await shot(d,'dz-18-documents-sorted-1280x800');
  await d.evaluate(()=>showPage('reminders'));await L.sleep(400);await shot(d,'dz-19-ai-reminders-1280x800');await d.close();
  await p.close();
  // ===== tech (can_add_documents) =====
  let t=await L.open({pre:PRE('mig','ok')});await L.login(t,'tom@test.com');
  await addDoc(t,'fixture.pdf');await scanFlow(t);
  ok(await t.evaluate(()=>val('dai-cat')==='repair_invoice'&&!document.querySelector('#dai-rems input[type=checkbox]').disabled),'tech with can_add_documents can scan + file reminders');
  await t.evaluate(()=>docAiSave());await L.sleep(1200);st=await L.state(t);
  ok(st.tables.reminders.filter(r=>r.ai_generated&&r.created_by===st.tables.profiles.find(x=>x.email==='tom@test.com').id).length===2,'tech AI reminders created via RPC');
  ok(t.errors.length===0,'tech: no page errors '+t.errors.join('|'));await t.close();
  // ===== tech without can_add_documents =====
  t=await L.open({pre:PRE('mig','ok')+";window.__MOCK_STATE__.tables.my_tech_visibility.forEach(function(r){r.can_add_documents=false;});"});await L.login(t,'tom@test.com');
  ok(await t.evaluate(v=>{try{return !can(byId(getVehicles(),v),'can_add_documents');}catch(e){return false;}},V1),'tech without can_add_documents: permission off');
  await t.evaluate(v=>openDocModal(v),V1);await L.sleep(300);
  ok(await t.evaluate(v=>![...document.querySelectorAll('#doc-vehicle option')].some(o=>o.value===v),V1),'vehicle not offered for adding documents');
  await t.close();
  // ===== fallback: function missing =====
  let q=await L.open({pre:PRE('mig','missing')});await L.login(q,'olivia@test.com');
  await addDoc(q,'fixture.pdf');await scanFlow(q);
  ok(await q.evaluate(()=>/not turned on yet/.test(document.getElementById('dai-state').textContent)&&val('dai-cat')!==''),'function missing: calm note, manual form');
  await shot(q,'dz-20-scan-fallback-390x844');
  await q.evaluate(()=>{setVal('dai-vendor','Manual Garage');setVal('dai-miles','2500');});await q.evaluate(()=>docAiSave());await L.sleep(1000);
  st=await L.state(q);ok(st.tables.documents.some(x=>x.vendor==='Manual Garage'&&x.ai_status==='manual'&&x.mileage===2500),'manual entry saved (ai_status manual)');
  ok(q.errors.length===0,'fallback: no page errors');await q.close();
  // ===== fallback: migration not applied =====
  q=await L.open({pre:PRE('nomig','ok')});await L.login(q,'olivia@test.com');
  await addDoc(q,'fixture.pdf');await scanFlow(q);
  await q.evaluate(()=>docAiSave());await L.sleep(1200);st=await L.state(q);
  const plain=st.tables.reminders.filter(r=>/From document:/.test(r.notes||''));
  ok(plain.length===2&&plain.every(r=>r.due_date||r.due_mileage),'no migration: owner gets plain reminders with the reason in notes');
  ok(await q.evaluate(()=>/backend update/.test(document.getElementById('toast-container').textContent)),'no migration: calm notice');
  ok(q.errors.length===0,'no-migration: no page errors '+q.errors.join('|'));
  await L.close();console.log(fails?'DOCAI FAIL '+fails:'DOCAI PASS');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
