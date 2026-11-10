// v32: Log service - scan or upload receipt (scan-document mocked; never a real key).
const L=require('./lib.js');const path=require('path');const fs=require('fs');
const OUT=process.env.SS_OUT||'/workspace/vehicle-app/cloud/screens/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011';
function PRE(){return `try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__;S.ss={mode:'ok',calls:[],delay:300};
 C.documents.push('doc_category','doc_date','vendor','mileage','amount','services','expires_on','ai_status','ai_confidence','ai_summary','ai_model','scanned_at');
 var lib=window.supabase,cc=lib.createClient;
 lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__ss)return c;c.__ss=1;
   var inv=c.functions.invoke;c.functions.invoke=function(n,o){if(n!=='scan-document')return inv.apply(this,arguments);S.ss.calls.push(o&&o.body);
     return new Promise(function(res){setTimeout(function(){var m=S.ss.mode;
       var FE=function(st,b){return {name:'FunctionsHttpError',context:{status:st,json:function(){return Promise.resolve(b||{});}}};};
       if(m==='fail')return res({data:null,error:FE(502,{error:'upstream_error',message:'Could not read this document right now. You can enter the details manually.'})});
       if(m==='cap')return res({data:null,error:FE(429,{error:'monthly_cap'})});
       res({data:{category:'repair_invoice',confidence:0.92,title:"Annual service - Holbert's Porsche",doc_date:'2026-10-14',vendor:"Holbert's Porsche",mileage:null,amount:642.18,currency:'USD',
         services:['Oil and filter service','Cabin air filter'],expires_on:null,summary:'Annual oil service.',vin:'WP0AB2A99MS123456',reminders:[],model:'gemini-3.5-flash',remaining:9},error:null});},S.ss.delay);});};
   return c;};
})();`;}
async function openSvc(p){await p.evaluate(()=>{showPage('inspections');openServiceModal();});await L.sleep(400);}
async function upload(p,id,file){const i=await p.$(id);await i.uploadFile(path.join(__dirname,file));}
(async()=>{
  await L.launch();
  let p=await L.open({pre:PRE()});await L.login(p,'wade@evo.test');
  await openSvc(p);
  ok(await p.evaluate(()=>{const e=document.getElementById('ss-entry');return !!e&&e.offsetParent!==null&&/Scan or upload receipt/.test(e.textContent)&&/fills in everything/.test(e.textContent);}),'entry: scan card visible at top of Log service');
  ok(await p.evaluate(()=>document.getElementById('ss-file').accept.indexOf('application/pdf')>=0&&document.getElementById('ss-file').accept.indexOf('image/')>=0&&document.getElementById('ss-cam').getAttribute('capture')==='environment'),'camera + upload inputs (images and PDFs)');
  if(process.env.SS_SHOTS)await p.screenshot({path:OUT+'ss_1_entry.png'});
  await p.evaluate(()=>{window.__MOCK_STATE__.ss.delay=2500;});
  await upload(p,'#ss-file','fixture.jpg');
  await p.waitForFunction(()=>document.getElementById('ss-busy').style.display!=='none',{timeout:6000});
  ok(true,'scanning state shows');
  if(process.env.SS_SHOTS){await L.sleep(500);await p.screenshot({path:OUT+'ss_2_scanning.png'});}
  await p.waitForFunction(()=>document.getElementById('ss-done').style.display!=='none',{timeout:8000});await L.sleep(300);
  const f=await p.evaluate(()=>{const g=id=>document.getElementById(id).value;const tags=[...document.querySelectorAll('#modal-service .ss-tag')].map(t=>({t:t.textContent,fs:getComputedStyle(t).fontSize}));
    return {v:g('svc-vehicle'),d:g('svc-date'),m:g('svc-miles'),n:g('svc-note'),c:g('svc-cost'),tags,dis:[...document.querySelectorAll('#modal-service input,#modal-service select')].some(e=>e.disabled||e.readOnly),call:window.__MOCK_STATE__.ss.calls[0]};});
  ok(f.v===V1&&f.d==='2026-10-14'&&f.m===''&&/Oil and filter/.test(f.n)&&f.c==='642.18','auto-filled vehicle (VIN), date, work, cost; mileage left empty');
  ok(f.tags.filter(t=>/AI filled/.test(t.t)).length===4&&f.tags.some(t=>t.t==='AI filled - VIN')&&f.tags.filter(t=>t.t==='Missing').length===1,'4 gold AI filled tags (vehicle says VIN) + 1 red Missing');
  ok(f.tags.every(t=>parseFloat(t.fs)>=15),'tags are 15px+');
  ok(!f.dis,'every field still editable');
  ok(f.call&&f.call.file_base64&&f.call.mime==='image/jpeg'&&f.call.vehicle_id,'reuses scan-document with file_base64 + mime + vehicle_id');
  const grey=await p.evaluate(()=>{const ok=['rgb(255, 255, 255)','rgb(201, 170, 107)','rgb(7, 8, 10)','rgb(242, 240, 235)'];return [...document.querySelectorAll('#ss-box *,#ss-or,#modal-service label')].filter(e=>e.offsetParent&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&ok.indexOf(getComputedStyle(e).color)<0).map(e=>e.className+':'+getComputedStyle(e).color);});
  ok(grey.length===0,'scan card and labels: white/gold text only '+grey.join(','));
  if(process.env.SS_SHOTS)await p.screenshot({path:OUT+'ss_3_filled.png'});
  await p.evaluate(()=>{const e=document.getElementById('svc-miles');e.value='2410';e.dispatchEvent(new Event('input',{bubbles:true}));});
  ok(await p.evaluate(()=>![...document.querySelectorAll('#modal-service .ss-tag')].some(t=>t.textContent==='Missing')),'typing into a Missing field clears the red tag');
  await p.evaluate(()=>saveService());await p.waitForFunction(()=>(window.__MOCK_STATE__.tables.documents||[]).some(d=>d.service_record_id&&d.ai_status==='scanned'),{timeout:10000}).catch(()=>{});await L.sleep(400);
  let st=await L.state(p);
  const sr=(st.tables.service_records||[]).filter(r=>r.vehicle_id===V1&&r.performed_on==='2026-10-14')[0];
  ok(sr&&sr.mileage===2410&&Number(sr.cost)===642.18,'service record saved with the scanned values');
  const doc=(st.tables.documents||[]).filter(d=>sr&&d.service_record_id===sr.id)[0];
  ok(doc&&doc.vehicle_id===V1&&doc.mime_type==='image/jpeg'&&doc.ai_status==='scanned'&&Number(doc.amount)===642.18,'receipt saved to vehicle documents, linked to the service record, AI fields kept');
  ok(st.storage.some(k=>doc&&k.indexOf(doc.storage_path)>=0),'receipt file uploaded to storage');
  ok(p.errors.length===0,'no page errors '+p.errors.join('|'));
  // failure: plain message, nothing filled, still usable
  await openSvc(p);await p.evaluate(()=>{window.__MOCK_STATE__.ss.mode='fail';window.__MOCK_STATE__.ss.delay=100;});
  await upload(p,'#ss-file','fixture.pdf');await p.waitForFunction(()=>document.getElementById('ss-msg').textContent,{timeout:5000}).catch(()=>{});
  const fl=await p.evaluate(()=>({msg:document.getElementById('ss-msg').textContent,vis:document.getElementById('ss-entry').style.display!=='none',tags:document.querySelectorAll('#modal-service .ss-tag').length,mime:window.__MOCK_STATE__.ss.calls.slice(-1)[0].mime}));
  ok(fl.mime==='application/pdf','PDF upload sent as application/pdf');
  ok(/enter the details/i.test(fl.msg)&&fl.vis&&fl.tags===0,'scan failure: plain message, buttons back, no tags');
  await p.evaluate(()=>{window.__MOCK_STATE__.ss.mode='cap';});await upload(p,'#ss-cam','fixture.jpg');await L.sleep(900);
  ok(await p.evaluate(()=>/month/.test(document.getElementById('ss-msg').textContent)),'server monthly cap: plain message');
  await p.evaluate(()=>{window.__MOCK_STATE__.ss.mode='ok';localStorage.setItem(ssMonthKey(),String(SS_MONTH_CAP));});const n0=await p.evaluate(()=>window.__MOCK_STATE__.ss.calls.length);
  await upload(p,'#ss-file','fixture.jpg');await L.sleep(900);
  ok(await p.evaluate(n=>window.__MOCK_STATE__.ss.calls.length===n&&/month/.test(document.getElementById('ss-msg').textContent),n0),'client monthly cap: no AI call made');
  // matching order
  const mt=await p.evaluate(()=>{const L=[{id:'a',vin:'WP0AB2A99MS123456',plate:'EVO 1',make:'Porsche',model:'911 Carrera'},{id:'b',vin:'',plate:'ABC-123',make:'Ferrari',model:'F40'}];
    return [ssMatch({vin:'WP0AB2A99MS123456'},L),ssMatch({plate:'abc 123'},L),ssMatch({title:'Ferrari F40 belt service'},L),ssMatch({title:'Oil change'},L)].map(x=>x?x.v.id+'/'+x.how:'none');});
  ok(mt.join()==='a/VIN,b/plate,b/make and model,none','match order: VIN, plate, make/model, else Missing');
  ok(p.errors.length===0,'no page errors '+p.errors.join('|'));
  await L.close();console.log(fails?'SERVICE_SCAN FAIL '+fails:'SERVICE_SCAN PASS');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
