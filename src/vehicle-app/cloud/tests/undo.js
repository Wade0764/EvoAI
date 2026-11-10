// v21: master sheet import + portfolios (p20). Mocked backend, real files from /workspace/printables
// (copied unchanged to tests/fixtures/). SheetJS + pdf.js are served from tests/fixtures. Never touches Supabase.
const L=require('./lib.js');const fs=require('fs');const path=require('path');
const SC='/workspace/vehicle-app/cloud/screens/',FX=path.join(__dirname,'fixtures')+'/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002';
const W1='f1000000-0000-4000-a000-000000000001',W2='f1000000-0000-4000-a000-000000000002',W3='f1000000-0000-4000-a000-000000000003',W4='f1000000-0000-4000-a000-000000000004',W5='f1000000-0000-4000-a000-000000000005',W6='f1000000-0000-4000-a000-000000000006';
const P1='a1000000-0000-4000-a000-000000000001',P2='a1000000-0000-4000-a000-000000000002';
// Olivia's collection already has six of the sheet's cars, with some details missing or older
const BASE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,t=new Date().toISOString();function V(id,y,mk,md,c,vin,mi,pl){S.tables.vehicles.push({id:id,owner_id:'${O}',year:y,make:mk,model:md,color:c,nickname:null,vin:vin,plate:pl||null,plate_region:null,mileage:mi,archived:false,archived_at:null,notes:'',created_at:t,updated_at:t});}
 V('${W1}',1966,'Volkswagen','Type 2 Samba','Green','BH323827',null);
 V('${W2}',1968,'Porsche','912 Coupe','Aubergine','12804608',52100);
 V('${W3}',2023,'Aston Martin','DBX707','Blue','SD7VUJBW7PTV07424',15200,'759CPT');
 V('${W4}',2005,'Bentley','Continental GT','Dark Sapphire','SCBCR73W87C041399',38169,'CHIPPO');
 V('${W5}',2016,'MINI','Cooper S Countryman','Black',null,90100);
 V('${W6}',2023,'Land Rover','Defender 110','Firenze Red','SALEW7EU8S2411426',3805,'BM72NY');
 S.tables.vehicle_financials.push({vehicle_id:'${W3}',purchase_price:139000,purchase_date:null});
 S.ovBefore=JSON.stringify(S.tables.vehicle_owner_values||[]);})();`;
const MIG=`(function(){var C=window.__SCHEMA_COLS__,S=window.__MOCK_STATE__;C.portfolios=['id','owner_id','name','country','currency','sort_order','is_default','created_at'];C.vehicles.push('portfolio_id');
 S.tables.portfolios=[{id:'${P1}',owner_id:'${O}',name:'USA Collection',country:'US',currency:'USD',sort_order:0,is_default:true,created_at:'2026-10-01'},{id:'${P2}',owner_id:'${O}',name:'UK & Europe Collection',country:'GB',currency:'EUR',sort_order:1,is_default:false,created_at:'2026-10-01'},
  {id:'a1000000-0000-4000-a000-0000000000ff',owner_id:'b1000000-0000-4000-a000-000000000022',name:'Dana default',country:null,currency:'USD',sort_order:0,is_default:true,created_at:'2026-10-01'}];
 S.tables.vehicles.forEach(function(v){v.portfolio_id=v.id==='${W2}'?'${P2}':(v.owner_id==='${O}'?'${P1}':null);});})();`;
async function serve(p){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();
  if(u.indexOf('cdn.sheetjs.com/xlsx-0.20.3/')>=0)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(FX+'sheetjs/xlsx.full.min.js'),headers:{'access-control-allow-origin':'*'}});
  if(u.indexOf('cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/')>=0)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(FX+'pdfjs/'+u.split('/').pop()),headers:{'access-control-allow-origin':'*'}});
  r.continue();});}
const up=async(p,file,sel)=>{const h=await p.$(sel||'#im-file');await h.uploadFile(FX+file);await p.waitForFunction(()=>!IM.busy&&(IM.step!==1||IM.msg),{timeout:20000});await L.sleep(250);};
const click=(p,txt,sc)=>p.evaluate((t,sc)=>{var all=[].slice.call(document.querySelectorAll((sc||'#im-root')+' button'));var b=all.filter(function(x){return x.textContent.trim()===t;})[0]||all.filter(function(x){return x.textContent.trim().indexOf(t)===0;})[0]||all.filter(function(x){return x.textContent.indexOf(t)>=0;})[0];if(!b)return false;b.click();return true;},txt,sc);
const scr=async(p,n)=>{await p.evaluate(()=>{document.getElementById('im-root').scrollTop=0;});await L.sleep(250);await p.screenshot({path:SC+n});};
const ui=p=>p.evaluate(()=>{var r=document.getElementById('im-root');var A=IM.step===3?imA():null;return {step:IM.step,txt:r?r.innerText:'',msg:IM.msg,A:A&&{changes:A.changes.map(function(c){return c.vid.slice(-1)+':'+c.field+'='+c.val;}),news:A.news.map(function(n){return imCarName(n.f);}),conf:A.conflicts.map(function(c){return c.type+':'+c.car+':'+(c.note||'');})}};});// ===== v23 undo import tests (p23 + migration_016 RPCs mocked). Never touches Supabase. =====
const SH='/workspace/vehicle-app/cloud/screens/';
// mock of migration_016 RPCs, behaving like the SQL (only cars the batch added; edited flag; removed_ids)
const RPC=`(function(){var S=window.__MOCK_STATE__;S.ib={};S.rpcHandlers=S.rpcHandlers||{};
 S.rpcHandlers.record_import_batch=function(a){S.ib[a.p_id]={a:a,undone:null};return {data:{ok:true,tagged:a.p_added.length},error:null};};
 S.rpcHandlers.list_import_batches=function(){return {data:[],error:null};};
 S.rpcHandlers.import_undo_preview=function(a){var b=S.ib[a.p_id];if(!b)return {data:null,error:{message:'not found'}};
   var cars=S.tables.vehicles.filter(function(v){return b.a.p_added.indexOf(v.id)>=0;}).map(function(v){return {id:v.id,year:v.year,make:v.make,model:v.model,edited:v.nickname==='EDITED',can_remove:true,photos:0,documents:0};});
   return {data:{id:a.p_id,cars:cars,restorable:b.a.p_changed.length,expired:false},error:null};};
 S.rpcHandlers.undo_import=function(a){var b=S.ib[a.p_id];if(!b)return {data:null,error:{message:'not found'}};if(b.undone)return {data:null,error:{message:'already undone'}};
   var gone=S.tables.vehicles.filter(function(v){return b.a.p_added.indexOf(v.id)>=0;}).map(function(v){return v.id;});
   S.tables.vehicles=S.tables.vehicles.filter(function(v){return gone.indexOf(v.id)<0;});
   S.tables.vehicle_financials=S.tables.vehicle_financials.filter(function(f){return gone.indexOf(f.vehicle_id)<0;});
   b.undone=1;return {data:{ok:true,removed:gone.length,removed_ids:gone,kept:0,restored:b.a.p_changed.length,files_queued:0},error:null};};})();`;
const style=p=>p.evaluate(()=>{var bad=[],min=99;[].slice.call(document.querySelectorAll('#im-root *')).forEach(function(e){
  if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;var own=[].slice.call(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();});if(!own)return;
  var cs=getComputedStyle(e),f=parseFloat(cs.fontSize),m=/rgba?\((\d+), (\d+), (\d+)/.exec(cs.color);if(f<min)min=f;
  if(m){var r=+m[1],g=+m[2],b=+m[3];if(Math.max(r,g,b)-Math.min(r,g,b)<16&&r>60&&r<200)bad.push(e.textContent.trim().slice(0,30)+' '+cs.color);}});return {min:min,bad:bad};});
const shotFull=async(p,n)=>{await L.sleep(300);await p.screenshot({path:SH+n});};
(async()=>{
await L.launch();
// ---------- 1. database path (migration_016 present)
let p=await L.open({pre:BASE+RPC});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(600);
let BEFORE=(await L.state(p)).tables.vehicles.map(v=>v.id);
await p.evaluate(()=>imOpen());await up(p,'Vehicle_Intake_Summary.xlsx');
await click(p,'Continue');await L.sleep(400);
await p.evaluate(()=>{IM.rows.forEach(function(r,ri){var f=imRowFields(r,ri,IM.res);if(f.paid)IM.res['cbok'+ri]=cbSig(f.paid,f.cur);});imRender();});
await p.evaluate(()=>{IM.tab='changes';imRender();});await L.sleep(100);await click(p,'Approve all');await L.sleep(150);await p.evaluate(()=>{IM.tab='new';imRender();});await click(p,'Add all');await L.sleep(150);
let s=await ui(p);const nNew=s.A.news.length;
await click(p,'Save');await L.sleep(3000);
let st=await L.state(p);
let rec=st.rpcs.filter(r=>r.name==='record_import_batch');
ok(rec.length===1,'record_import_batch called once after save');
let ins=st.tables.vehicles.filter(v=>BEFORE.indexOf(v.id)<0).map(v=>v.id).sort();
ok(rec[0]&&JSON.stringify(rec[0].args.p_added.slice().sort())===JSON.stringify(ins)&&ins.length===nNew,'p_added = exactly the '+nNew+' new car ids');
ok(rec[0]&&rec[0].args.p_owner===O&&rec[0].args.p_file==='Vehicle_Intake_Summary.xlsx','owner + file name sent');
let ch=rec[0]?rec[0].args.p_changed:[];let w2c=ch.filter(c=>c.id===W3)[0];
ok(w2c&&w2c.before.mileage===15200&&w2c.after.mileage===16689&&!('miles' in w2c.before),'changed fields sent with DB column names and DB values');
ok(ch.every(c=>Object.keys(c.before).every(k=>['year','make','model','vin','color','mileage','plate','plate_region','location','insurance_carrier','purchase_price'].indexOf(k)>=0)),'only whitelisted columns in p_changed');
ok(rec.length&&st.rpcs.indexOf(rec[0])>=0&&st.log.filter(l=>l.op==='insert'&&(l.t==='vehicles'||l.table==='vehicles')).length>=nNew,'cars inserted before the batch is recorded');
ok(await p.evaluate(()=>imBatches().slice(-1)[0].db===true),'batch marked as saved to the database');
s=await ui(p);ok(/Import saved/.test(s.txt)&&/Undo this import/.test(s.txt)&&/You can undo this for 30 days/.test(s.txt)&&/Recent imports/i.test(s.txt),'summary: Undo button, 30-day note, Recent imports list');
let sty=await style(p);ok(sty.min>=15&&sty.bad.length===0,'summary text >= 15px, no grey ('+sty.min+') '+sty.bad.join('|'));
await p.evaluate(()=>{document.getElementById('im-root').scrollTop=99999;});await shotFull(p,'undo-final-01.png');
// mark one imported car as edited after import (server flags it)
await p.evaluate(ids=>{var v=window.__MOCK_STATE__.tables.vehicles.filter(function(x){return x.id===ids[0];})[0];v.nickname='EDITED';},ins.slice().reverse());
await click(p,'Undo this import');await L.sleep(600);
s=await ui(p);
ok(st=await L.state(p),'');ok((await L.state(p)).rpcs.some(r=>r.name==='import_undo_preview'),'confirm sheet asks the server for the car list');
ok(new RegExp(nNew+' cars will be removed').test(s.txt)&&/photos, documents and costs/.test(s.txt),'confirm: "'+nNew+' cars will be removed, with their photos, documents and costs"');
ok(/1 car was edited after the import\. Those edits will be lost too\./.test(s.txt)&&/Edited after import/.test(s.txt),'edited-after-import warning + per-car tag');
ok(await p.evaluate(()=>/Edited after import/.test(document.querySelector('.un-car').textContent)),'edited cars are listed first, never hidden in "+ N more"');
ok(/\+ \d+ more cars?/.test(s.txt)||nNew<=6,'long lists collapse to "+ N more"');
ok(/Undo import \u00b7 Remove \d+ cars?/.test(s.txt)&&/Keep everything/.test(s.txt),'red Undo button + Keep everything');
ok(await p.evaluate(()=>getComputedStyle(document.getElementById('un-go')).backgroundColor==='rgb(229, 72, 77)'),'Undo button is red');
sty=await style(p);ok(sty.min>=15&&sty.bad.length===0,'sheet text >= 15px, no grey ('+sty.min+') '+sty.bad.join('|'));
await p.evaluate(()=>{document.querySelector('.un-sheet').scrollTop=0;});await shotFull(p,'undo-final-02.png');
await click(p,'Keep everything');await L.sleep(200);
s=await ui(p);ok(/Import saved/.test(s.txt)&&(await L.state(p)).tables.vehicles.length===BEFORE.length+nNew,'Keep everything closes the sheet, nothing removed');
await click(p,'Undo this import');await L.sleep(500);await click(p,'Undo import');await L.sleep(1500);
st=await L.state(p);
ok(st.rpcs.filter(r=>r.name==='undo_import').length===1,'undo_import RPC called once');
ok(st.tables.vehicles.filter(v=>ins.indexOf(v.id)>=0).length===0,'server removed the imported cars');
ok(await p.evaluate(ids=>!getVehicles().some(function(v){return ids.indexOf(v.id)>=0;}),ins),'cars gone from the app too');
ok(st.tables.vehicles.filter(v=>BEFORE.indexOf(v.id)>=0).length===BEFORE.length,'cars that were already there are kept');
s=await ui(p);ok(/Import undone/.test(s.txt)&&new RegExp(nNew+' cars removed').test(s.txt)&&/restored/.test(s.txt)&&/Not touched/i.test(s.txt)&&/Import undone, Vehicle_Intake_Summary\.xlsx/.test(s.txt),'success screen: removed + restored counts, not touched, logged');
sty=await style(p);ok(sty.min>=15&&sty.bad.length===0,'success text >= 15px, no grey ('+sty.min+') '+sty.bad.join('|'));
await p.evaluate(()=>{document.getElementById('im-root').scrollTop=0;});await shotFull(p,'undo-final-03.png');
ok(st.v.length===0,'no schema violations '+JSON.stringify(st.v).slice(0,200));
await click(p,'Done');await L.sleep(300);
await p.evaluate(()=>imOpen());await L.sleep(200);s=await ui(p);
ok(/Recent imports/i.test(s.txt)&&/Undone/i.test(s.txt),'Recent imports shows the batch as Undone');
ok(p.errors.filter(e=>!/cdnjs|CORS|favicon|net::/.test(e)).length===0,'no page errors '+p.errors.join(' | ').slice(0,300));
await p.close();
// ---------- 2. no migration_016 yet: local fallback still undoes, warns about local edits
p=await L.open({pre:BASE});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(600);
BEFORE=(await L.state(p)).tables.vehicles.map(v=>v.id);
await p.evaluate(()=>imOpen());await up(p,'Vehicle_Intake_Summary.xlsx');await click(p,'Continue');await L.sleep(400);
await p.evaluate(()=>{IM.rows.forEach(function(r,ri){var f=imRowFields(r,ri,IM.res);if(f.paid)IM.res['cbok'+ri]=cbSig(f.paid,f.cur);});imRender();});
await p.evaluate(()=>{IM.tab='changes';imRender();});await L.sleep(100);await click(p,'Approve all');await L.sleep(150);await p.evaluate(()=>{IM.tab='new';imRender();});await click(p,'Add all');await L.sleep(150);
await click(p,'Save');await L.sleep(3000);
st=await L.state(p);
ok(await p.evaluate(()=>imBatches().slice(-1)[0].db===false),'missing RPC: batch kept locally (fallback)');
ok(!/error/i.test(await p.evaluate(()=>document.body.innerText.slice(0,0)))&&p.errors.filter(e=>!/cdnjs|CORS|favicon|net::/.test(e)).length===0,'missing RPC does not break the save');
ins=st.tables.vehicles.filter(v=>BEFORE.indexOf(v.id)<0).map(v=>v.id);
await p.evaluate(id=>{var vs=getVehicles(),v=byId(vs,id);v.nickname='My edit';setVehicles(vs);},ins[0]);await L.sleep(800);
await click(p,'Undo this import');await L.sleep(500);s=await ui(p);
ok(/1 car was edited after the import/.test(s.txt),'local fallback detects the edit made after import');
await click(p,'Undo import');await L.sleep(2500);st=await L.state(p);
ok(st.tables.vehicles.filter(v=>ins.indexOf(v.id)>=0).length===0&&st.tables.vehicles.length===BEFORE.length,'local undo removed exactly the imported cars');
ok(st.tables.vehicles.filter(v=>v.id===W2)[0].mileage===52100,'local undo restored the unedited change');
s=await ui(p);ok(/Import undone/.test(s.txt),'local success screen');
ok(st.v.length===0,'no schema violations (fallback)');
await p.close();
// ---------- 3. 30-day window
p=await L.open({pre:BASE+RPC});await serve(p);await L.login(p,'olivia@test.com');await L.sleep(500);
await p.evaluate(o=>{localStorage.setItem('evoai_im_batches',JSON.stringify([{id:'x1',at:new Date(Date.now()-31*864e5).toISOString(),owner:o,file:'Old sheet.csv',added:['a'],changed:[]}]));imOpen();},O);await L.sleep(300);
s=await ui(p);ok(/Old sheet\.csv/.test(s.txt)&&/Undo expired/.test(s.txt)&&!/UNDO/.test(s.txt),'older than 30 days: "Undo expired", no button');
await p.close();
await L.close();
console.log(`\nundo: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
