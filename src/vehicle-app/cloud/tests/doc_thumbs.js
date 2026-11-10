// v18 document thumbnails + full-screen viewer against the mock backend. Files are served from tests/fixtures (dt_*),
// pdf.js from tests/fixtures/pdfjs (same bytes as cdnjs 3.11.174). Never touches Supabase.
const L=require('./lib.js');const fs=require('fs'),path=require('path');
const OUT='/workspace/vehicle-app/cloud/screens/',FX=path.join(__dirname,'fixtures')+'/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011',O='b0000000-0000-4000-a000-000000000002';
const PDF=fs.readFileSync(FX+'dt_invoice.pdf'),JPG=fs.readFileSync(FX+'dt_registration.jpg');
const LEG=[ // legacy documents: file kept, no stored thumbnail
  {id:'e1000000-0000-4000-a000-000000000001',p:'legacy-invoice.pdf',m:'application/pdf',k:'invoice',t:'Brake service - Holbert\'s',c:'repair_invoice',d:'2026-06-02',v:"Holbert's Porsche",a:1880},
  {id:'e1000000-0000-4000-a000-000000000002',p:'legacy-reg.jpg',m:'image/jpeg',k:'registration',t:'NJ registration 2026',c:'registration',d:'2026-03-31',v:'NJ MVC',a:84},
  {id:'e1000000-0000-4000-a000-000000000003',p:'legacy-note.txt',m:'text/plain',k:'other',t:'Paint correction note',c:'other',d:'2025-11-20',v:'',a:null}];
function PRE(o){o=o||{};return `try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__;
 C.documents.push('doc_category','doc_date','vendor','mileage','amount','services','expires_on','ai_status','ai_confidence','ai_summary','ai_model','scanned_at');
 if(${!o.nomig})C.documents.push('thumb_path');
 C.reminders.push('ai_generated','source_document_id','ai_reason');
 var T=S.tables.documents||(S.tables.documents=[]);
 ${JSON.stringify(o.legacy?LEG:[])}.concat(${o.many?`Array.from({length:14},function(_,i){return {id:'e2000000-0000-4000-a000-0000000000'+(10+i),p:'bulk-'+i+(i%2?'.pdf':'.jpg'),m:i%2?'application/pdf':'image/jpeg',k:'invoice',t:'Receipt '+(i+1),c:'receipt',d:'2025-'+String(12-(i%12)).padStart(2,'0')+'-0'+(1+i%9),v:'Vendor',a:10+i};})`:'[]'}).forEach(function(x){
   T.push({id:x.id,vehicle_id:'${V1}',uploaded_by:'${O}',kind:x.k,title:x.t,storage_path:'${O}/${V1}/'+x.p,mime_type:x.m,size_bytes:1000,owner_only:false,created_at:x.d+'T10:00:00Z',updated_at:x.d+'T10:00:00Z',
     doc_category:x.c,doc_date:x.d,vendor:x.v,amount:x.a,services:[],ai_status:'scanned',ai_confidence:0.9${o.nomig?'':',thumb_path:null'}});});
 S.rpcHandlers.add_doc_reminders=function(a){return {data:{inserted:0,replaced:0},error:null};};
 var lib=window.supabase,cc=lib.createClient;
 lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__dt)return c;c.__dt=1;
   var inv=c.functions.invoke;c.functions.invoke=function(n,ob){if(n!=='scan-document')return inv.apply(this,arguments);
     return Promise.resolve({data:{category:'repair_invoice',confidence:0.92,title:'Annual service',doc_date:'2026-09-14',vendor:"Holbert's Porsche",mileage:2410,amount:1284.6,services:['Engine oil and filter'],expires_on:null,summary:'x',reminders:[],model:'m'},error:null});};
   ${o.nomig?`var fr=c.from;c.from=function(t){var q=fr.apply(this,arguments);if(t==='documents'){var ins=q.insert;q.insert=function(r){if(r&&('thumb_path' in r)){S.dtRejected=(S.dtRejected||0)+1;return Promise.resolve({data:null,error:{code:'PGRST204',message:"Could not find the 'thumb_path' column of 'documents' in the schema cache"}});}return ins.apply(q,arguments);};}return q;};`:''}
   return c;};
})();`;}
async function serve(p,o){o=o||{};await p.evaluate(async()=>{try{for(const k of await caches.keys())await caches.delete(k);}catch(e){}});p.hits={sign:[],pdfjs:0};p.blobs={};
  await p.setRequestInterception(true);
  p.on('request',r=>{const u=r.url();
    if(u.indexOf('cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/')>=0){p.hits.pdfjs++;if(o.noPdfjs)return r.respond({status:404,body:'no'});
      const f=u.split('/').pop();return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(FX+'pdfjs/'+f),headers:{'access-control-allow-origin':'*'}});}
    if(u.indexOf('/storage/v1/object/sign/vehicle-documents/')>=0){const pth=decodeURIComponent(u.split('/storage/v1/object/sign/vehicle-documents/')[1].split('?')[0]);p.hits.sign.push(pth);
      const h={'access-control-allow-origin':'*'};
      if(p.blobs[pth])return r.respond({status:200,contentType:p.blobs[pth].t,body:p.blobs[pth].b,headers:h});
      if(/\.pdf$/.test(pth))return r.respond({status:200,contentType:'application/pdf',body:PDF,headers:h});
      if(/\.jpe?g$/.test(pth))return r.respond({status:200,contentType:'image/jpeg',body:JPG,headers:h});
      return r.respond({status:200,contentType:'text/plain',body:'note',headers:h});}
    r.continue();});}
// copy what the app uploaded (mock storage) so the fake CDN serves those exact bytes
async function syncBlobs(p){const m=await p.evaluate(async()=>{const B=window.__MOCK_STATE__.blobs||{},o={};for(const k of Object.keys(B)){const b=B[k];if(!b||!b.arrayBuffer)continue;const a=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.subarray(i,i+8192));o[k]={t:b.type,b:btoa(s)};}return o;});
  for(const k of Object.keys(m))p.blobs[k]={t:m[k].t,b:Buffer.from(m[k].b,'base64')};}
const shot=async(p,n)=>{await L.sleep(400);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
const SAT=59;
async function inset(p){await p.evaluate(s=>{document.documentElement.style.setProperty('--sat',s+'px');document.documentElement.style.setProperty('--sab','34px');},SAT);}
async function openV(p){await p.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(700);await p.evaluate(()=>{const e=document.getElementById('vd-docs');if(e)e.scrollIntoView({block:'start'});});await L.sleep(300);
  await p.evaluate(()=>{const m=document.querySelector('#modal-vehicle-detail .modal')||document.getElementById('modal-vehicle-detail');const e=document.getElementById('vd-docs');if(m&&e){m.scrollTop+=-120;}});}
const thumbsLoaded=p=>p.waitForFunction(n=>document.querySelectorAll('#vd-docs .dt-th.has').length>=n,{timeout:20000},2).then(()=>true,()=>false);
async function upload(p,file){
  const inp=await p.$('#vd-doc-input');await inp.uploadFile(file);
  await p.waitForFunction(()=>{const m=document.getElementById('modal-docscan');return m&&m.classList.contains('active')&&!/scanning/.test((document.getElementById('dai-state')||{}).className||'');},{timeout:15000});
  await L.sleep(300);await p.evaluate(()=>docAiSave());await L.sleep(1200);
}
(async()=>{
  await L.launch();
  // ===== 1. new uploads keep the file + store a thumbnail (migration_011 in) =====
  let p=await L.open({pre:PRE({})});await serve(p);await L.login(p,'olivia@test.com');await inset(p);
  await openV(p);
  await upload(p,FX+'dt_invoice.pdf');
  await upload(p,FX+'dt_registration.jpg');
  let st=await L.state(p);
  const docs=st.tables.documents.filter(d=>d.vehicle_id===V1&&d.uploaded_by===O&&!/^e[12]000000-/.test(d.id));
  const pdfRow=docs.find(d=>d.mime_type==='application/pdf'),jpgRow=docs.find(d=>d.mime_type==='image/jpeg');
  ok(pdfRow&&jpgRow,'two documents filed');
  ok(pdfRow&&st.storage.includes('vehicle-documents/'+pdfRow.storage_path)&&jpgRow&&st.storage.includes('vehicle-documents/'+jpgRow.storage_path),'original files kept in the private bucket after the AI scan');
  const pdfSize=await p.evaluate(pth=>(window.__MOCK_STATE__.blobs[pth]||{}).size,pdfRow&&pdfRow.storage_path);
  ok(pdfSize===PDF.length,'PDF stored byte-for-byte ('+pdfSize+' bytes)');
  ok(pdfRow&&/_t\.jpg$/.test(pdfRow.thumb_path||'')&&st.storage.includes('vehicle-documents/'+pdfRow.thumb_path),'PDF page-1 thumbnail stored + thumb_path set: '+(pdfRow&&pdfRow.thumb_path));
  ok(jpgRow&&/_t\.jpg$/.test(jpgRow.thumb_path||'')&&st.storage.includes('vehicle-documents/'+jpgRow.thumb_path),'photo thumbnail stored + thumb_path set');
  const tsz=await p.evaluate(pth=>{const b=window.__MOCK_STATE__.blobs[pth];return b?b.size:0;},jpgRow&&jpgRow.thumb_path);
  ok(tsz>0&&tsz<60000,'thumbnail is small ('+tsz+' bytes)');
  ok(pdfRow&&pdfRow.doc_category==='repair_invoice','AI category kept on the row');
  ok(!st.v.length,'no schema violations '+st.v.join('|'));
  ok(p.hits.pdfjs>=1,'pdf.js lazy-loaded for the new PDF');
  await syncBlobs(p);global.__B=p.blobs;
  await p.evaluate(()=>{['modal-docscan'].forEach(i=>{try{closeModal(i);}catch(e){}});});
  // ===== 2. fresh session: thumbnails from the stored _t.jpg, legacy docs from the file itself =====
  const seeded=st.tables.documents;
  await p.close();
  p=await L.open({pre:PRE({legacy:true})+`;(function(){var S=window.__MOCK_STATE__;var add=${JSON.stringify(docs)};add.forEach(function(r){S.tables.documents.push(r);});})();`});
  await serve(p);
  // carry the uploaded bytes over
  p.blobs=Object.assign(p.blobs,(global.__B||{}));
  await L.login(p,'olivia@test.com');await inset(p);
  await openV(p);
  ok(await thumbsLoaded(p),'thumbnails render in the Documentation section');
  await p.waitForFunction(()=>document.querySelectorAll('#vd-docs .dt-th.has').length>=4,{timeout:20000}).catch(()=>{});
  const info=await p.evaluate(()=>[...document.querySelectorAll('#vd-docs .dt-row')].map(r=>{const t=r.querySelector('.dt-th'),im=t.querySelector('img');return {id:r.dataset.doc,cat:(r.querySelector('.dt-catl')||{}).textContent,date:(r.querySelector('.dt-date')||{}).textContent,has:t.classList.contains('has'),w:im?im.naturalWidth:0,btn:t.tagName,fmt:(t.querySelector('.dt-fmt')||{}).textContent};}));
  console.log('   rows',JSON.stringify(info.map(x=>[x.cat,x.date,x.fmt,x.has,x.w])));
  ok(info.length===5,'5 documents listed');
  const dts=await p.evaluate(()=>[...document.querySelectorAll('#vd-docs .dt-row')].map(r=>docAiDate(getDocs().find(d=>d.id===r.dataset.doc))));
  ok(dts.slice().sort().reverse().join()===dts.join(),'newest first kept '+dts.join(','));
  ok(info.filter(x=>x.fmt!=='Note').every(x=>x.has&&x.w>=200&&x.w<=400),'every file has a real thumbnail (200-400px wide)');
  ok(info.some(x=>x.cat==='Repair invoice')&&info.some(x=>x.cat==='Registration'),'AI category labels shown');
  const note=info.find(x=>x.fmt==='Note');ok(note&&!note.has&&note.btn==='DIV','text-only record shows a category tile, not a broken image');
  const sThumb=p.hits.sign.filter(s=>/_t\.jpg$/.test(s)).length;
  ok(sThumb>=2,'stored thumbnails fetched via signed URLs ('+sThumb+')');
  ok(p.hits.sign.some(s=>/legacy-invoice\.pdf$/.test(s))&&p.hits.pdfjs>=1,'legacy PDF rendered on-device from page 1 (pdf.js lazy)');
  // cached: re-render does not refetch
  const before=p.hits.sign.length;
  await p.evaluate(()=>{refreshDetailIfOpen&&refreshDetailIfOpen();});await L.sleep(800);
  await p.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(800);
  const reInfo=await p.evaluate(()=>[...document.querySelectorAll('#vd-docs .dt-th.has img.ld')].length);
  ok(p.hits.sign.length===before&&reInfo>=4,'re-render uses cached thumbnails (no new requests; '+reInfo+' shown at once)');
  const cacheN=await p.evaluate(async()=>{try{const c=await caches.open('evoai-dt-v1');return (await c.keys()).length;}catch(e){return -1;}});
  ok(cacheN>=4,'thumbnails persisted in Cache Storage evoai-dt-v1 ('+cacheN+')');
  await p.evaluate(()=>{const e=document.getElementById('vd-doc-add')||document.getElementById('vd-docs');let sc=e.parentNode;while(sc&&sc!==document.body&&!(sc.scrollHeight>sc.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentNode;const r=e.getBoundingClientRect();(sc&&sc!==document.body?sc:document.scrollingElement).scrollTop+=r.top-200;});
  await shot(p,'dt-01-vehicle-doc-thumbs-390x844');
  // ===== 3. image viewer =====
  const regId=info.find(x=>x.fmt==='Photo'&&x.cat==='Registration').id;
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),regId);
  await p.waitForFunction(()=>{const i=document.getElementById('dtv-img');return i&&i.classList.contains('ld')&&!i.classList.contains('ph')&&i.naturalWidth>0;},{timeout:8000}).catch(()=>{});
  const vw=await p.evaluate(()=>{const i=document.getElementById('dtv-img'),x=document.getElementById('dtv-x').getBoundingClientRect();return {open:!!DT.view,w:i.naturalWidth,src:i.src,xt:x.top,xr:innerWidth-x.right,xs:x.width,fs:document.getElementById('dtv').getBoundingClientRect().height};});
  ok(vw.open&&vw.w===1200&&/\/sign\/vehicle-documents\/.+legacy-reg\.jpg\?token/.test(vw.src),'viewer opens the full file via a signed URL ('+vw.w+'px)');
  ok(vw.xt>=SAT&&vw.xs>=44,'close button below the safe area (top '+vw.xt+', '+vw.xs+'px)');
  ok(vw.fs===844,'viewer is full-screen');
  ok(await p.evaluate(()=>{const t=swbTarget();return !!t&&t.el===DT.view.el;}),'edge swipe-back targets the viewer');
  await shot(p,'dt-02-image-viewer-390x844');
  // pinch zoom (two pointers)
  await p.evaluate(()=>{const st=document.getElementById('dtv-stage');const E=(t,id,x,y)=>st.dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:x,clientY:y,bubbles:true,pointerType:'touch'}));
    E('pointerdown',1,160,420);E('pointerdown',2,230,420);for(let k=1;k<=10;k++){E('pointermove',1,160-k*9,420);E('pointermove',2,230+k*9,420);}E('pointerup',1,70,420);E('pointerup',2,320,420);});
  await L.sleep(250);
  const z=await p.evaluate(()=>DT.view.s);ok(z>2,'pinch zooms ('+z.toFixed(2)+'x)');
  ok(await p.evaluate(()=>swbTarget()===null),'while zoomed the edge swipe pans instead of going back');
  await shot(p,'dt-03-image-viewer-zoomed-390x844');
  await p.keyboard.press('Escape');await L.sleep(300);
  ok(await p.evaluate(()=>!DT.view&&!document.getElementById('dtv')),'Escape closes the viewer');
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),regId);await L.sleep(400);
  await p.evaluate(()=>document.getElementById('dtv-x').click());await L.sleep(300);
  ok(await p.evaluate(()=>!DT.view),'close button closes the viewer');
  ok(await p.evaluate(()=>{const t=swbTarget();return !!t&&t.el!==null&&!document.getElementById('dtv');}),'swipe-back still works on the vehicle page afterwards');
  // swipe-back gesture itself closes the viewer
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),regId);await L.sleep(400);
  const c=await p.target().createCDPSession();const pt=(x,y)=>[{x,y,id:1}];
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pt(6,400)});
  for(let i=1;i<=10;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pt(6+26*i,402)});await L.sleep(16);}
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await L.sleep(600);
  ok(await p.evaluate(()=>!DT.view&&document.getElementById('modal-vehicle-detail').classList.contains('active')),'edge swipe closes the viewer, vehicle page stays');
  // ===== 4. PDF: real file in a new window via a short-lived signed URL =====
  const pdfId=info.find(x=>x.fmt==='PDF'&&x.cat==='Repair invoice').id;
  await p.evaluate(()=>{window.__opens=[];window.open=function(u,t){var w={closed:false,document:document.implementation.createHTMLDocument('x'),location:{replace:function(x){window.__opens.push({late:x});}},close:function(){}};window.__opens.push({u:u,t:t});return window.__block?null:w;};});
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),pdfId);await L.sleep(300);
  let op=await p.evaluate(()=>window.__opens);
  ok(op.length===1&&/\/sign\/vehicle-documents\/.+\.pdf\?token/.test(op[0].u)&&op[0].t==='_blank','PDF opens synchronously in a new window (pre-signed URL)');
  ok(await p.evaluate(()=>{const k=Object.keys(DT.open)[0];const e=DT.open[k].exp-Date.now();return e>500000&&e<=600000;}),'open URL is short-lived (10 min)');
  await p.evaluate(()=>{window.__opens=[];Object.keys(DT.open).forEach(k=>DT.open[k].exp=Date.now()+1000);});
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),pdfId);await L.sleep(400);
  op=await p.evaluate(()=>window.__opens);
  ok(op.length===2&&op[0].u===''&&/\.pdf\?token/.test(op[1].late||''),'expired URL: window opened inside the tap, then pointed at a fresh signed URL');
  await p.evaluate(()=>{window.__opens=[];window.__block=true;Object.keys(DT.open).forEach(k=>DT.open[k].exp=Date.now()+1000);});
  await p.evaluate(id=>document.querySelector('.dt-th[data-dt="'+id+'"]').click(),pdfId);await L.sleep(500);
  ok(await p.evaluate(()=>{const a=document.querySelector('#dt-sheet a.dt-sheet-go');return !!a&&/\.pdf\?token/.test(a.href)&&a.target==='_blank';}),'popup blocked: one-tap "Open PDF" sheet with the signed link');
  await shot(p,'dt-04-pdf-open-sheet-390x844');
  await p.evaluate(()=>dtCloseSheet());
  // signed-URL refresh on expiry
  const n0=await p.evaluate(()=>(window.__MOCK_STATE__.signed||[]).length);
  await p.evaluate(()=>{Object.keys(DT.sig).forEach(k=>DT.sig[k].exp=Date.now()+1000);});
  const u2=await p.evaluate(()=>dtSign(Object.keys(DT.sig)[0]));
  const n1=await p.evaluate(()=>(window.__MOCK_STATE__.signed||[]).length);
  ok(u2&&n1===n0+1,'signed URL re-issued when near expiry');
  ok(!p.errors.length,'no page errors '+p.errors.join(' | ').slice(0,300));
  // documents page
  await p.evaluate(()=>{closeModal('modal-vehicle-detail');showPage('documents');});await L.sleep(1500);
  ok(await p.evaluate(()=>document.querySelectorAll('#documents-list .dt-th.has').length>=4),'Documents page shows the same thumbnails');
  await shot(p,'dt-05-documents-page-390x844');
  // remove: thumbnail goes with the file
  st=await L.state(p);const del=docs[0];
  await p.evaluate(id=>{window.confirm=()=>true;deleteDocument(id);},del.id);await L.sleep(1500);
  st=await L.state(p);
  ok(!st.storage.includes('vehicle-documents/'+del.storage_path)&&!st.storage.includes('vehicle-documents/'+del.thumb_path),'removing a document removes its file and thumbnail');
  await p.close();
  // ===== 5. lazy loading with many documents =====
  p=await L.open({pre:PRE({many:true})});await serve(p);await L.login(p,'olivia@test.com');
  await p.evaluate(v=>openVehicleDetail(v),V1);await L.sleep(2500);
  const lz=await p.evaluate(()=>({rows:document.querySelectorAll('#vd-docs .dt-th[data-dt]').length,loaded:[...document.querySelectorAll('#vd-docs .dt-th[data-dt]')].filter(e=>e._dt).length}));
  ok(lz.rows===14&&lz.loaded<lz.rows,'thumbnails load lazily ('+lz.loaded+' of '+lz.rows+' started before scrolling)');
  await p.evaluate(()=>{const e=[...document.querySelectorAll('#vd-docs .dt-th')].pop();e.scrollIntoView();});await L.sleep(2500);
  ok(await p.evaluate(()=>{const e=[...document.querySelectorAll('#vd-docs .dt-th')].pop();return e._dt===1;}),'scrolling loads the rest');
  await p.close();
  // ===== 6. migration_011 not applied + pdf.js unavailable =====
  p=await L.open({pre:PRE({nomig:true})});await serve(p,{noPdfjs:true});await L.login(p,'olivia@test.com');await inset(p);
  await openV(p);
  await upload(p,FX+'dt_registration.jpg');
  st=await L.state(p);
  const nr=st.tables.documents.find(d=>d.uploaded_by===O&&d.mime_type==='image/jpeg'&&!/^e[12]000000-/.test(d.id));
  ok(nr&&st.storage.includes('vehicle-documents/'+nr.storage_path)&&!('thumb_path' in nr),'without migration_011: upload retried without thumb_path, file kept');
  ok(await p.evaluate(()=>DT.col===false&&window.__MOCK_STATE__.dtRejected>=1),'missing column detected once');
  ok(!st.storage.some(s=>/_t\.jpg$/.test(s)),'orphan thumbnail removed');
  ok(!st.v.length,'no schema violations '+st.v.join('|'));
  await p.close();
  p=await L.open({pre:PRE({nomig:true,legacy:true})});await serve(p,{noPdfjs:true});await L.login(p,'olivia@test.com');await inset(p);
  await openV(p);await L.sleep(3000);
  ok(await p.evaluate(()=>DT.col===false),'hydration sees no thumb_path column (no insert attempts with it)');
  const fb=await p.evaluate(()=>[...document.querySelectorAll('#vd-docs .dt-row')].map(r=>{const t=r.querySelector('.dt-th');return {fmt:(t.querySelector('.dt-fmt')||{}).textContent,has:t.classList.contains('has'),tl:(t.querySelector('.dt-tl')||{}).textContent};}));
  ok(fb.filter(x=>x.fmt==='Photo').every(x=>x.has),'photos still get on-device thumbnails');
  ok(fb.filter(x=>x.fmt==='PDF').every(x=>!x.has&&x.tl==='Repair invoice'),'pdf.js unavailable: elegant category tile for the PDF');
  await p.evaluate(()=>{const e=document.getElementById('vd-doc-add')||document.getElementById('vd-docs');let sc=e.parentNode;while(sc&&sc!==document.body&&!(sc.scrollHeight>sc.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentNode;const r=e.getBoundingClientRect();(sc&&sc!==document.body?sc:document.scrollingElement).scrollTop+=r.top-200;});
  await shot(p,'dt-06-tile-fallback-390x844');
  ok(!p.errors.filter(e=>!/pdf|404|Failed to load resource/i.test(e)).length,'no page errors '+p.errors.join(' | ').slice(0,300));
  await p.close();
  // desktop
  p=await L.open({pre:PRE({legacy:true}),desktop:true,w:1280,h:800,dsf:1});await serve(p);await L.login(p,'olivia@test.com');
  await p.evaluate(()=>showPage('documents'));await L.sleep(3000);await shot(p,'dt-07-documents-1280x800');
  await L.close();
  console.log(fails?'doc_thumbs: '+fails+' FAILED':'doc_thumbs: all passed');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
