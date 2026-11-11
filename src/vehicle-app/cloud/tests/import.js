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
const ui=p=>p.evaluate(()=>{var r=document.getElementById('im-root');var A=IM.step===3?imA():null;return {step:IM.step,txt:r?r.innerText:'',msg:IM.msg,A:A&&{changes:A.changes.map(function(c){return c.vid.slice(-1)+':'+c.field+'='+c.val;}),news:A.news.map(function(n){return imCarName(n.f);}),conf:A.conflicts.map(function(c){return c.type+':'+c.car+':'+(c.note||'');}),rows:A.rows.map(function(r){return r.car+'|'+r.bucket+'|'+r.reason+'|'+r.flags.join(';');}),pr:A.prompts.map(function(q){return q.car+'|'+q.pick;}),ch:A.changes.map(function(c){return c.vid.slice(-1)+':'+c.field+':'+c.kind+'='+c.val;})}};});
(async()=>{
await L.launch();
// ---------- A. helpers on real values
let p=await L.open({pre:BASE});await serve(p);
let u=await p.evaluate(()=>({r:imMoney('~$30k\u2013$38k'),e:imMoney('\u20ac50,400.00'),g:imMoney('\u00a317,450'),n:imCell('MISSING')+imCell('\u2014')+imCell('N/A'),
  h:['VIN / Chassis No.','VIN Check','Registration (Plate / State)','Reg. Expiry','Colour (Ext / Int)','Agreed Value / Cost','Est. Value (Asset List)','Insurance (Carrier / Policy)','Policy Renewal','Asset Location','Model / Trim','Mileage','Intake Remarks','Vehicle Estimated Value'].map(imHeaderField),
  v1:imVinExpect('SALLDVAF7TA977218'),v2:imVinExpect('SD7VUJBW7PTV07424'),c:imClean({vin:'Chassis : BH323827',model:'Jolly (Left-hand drive)',ins:'Chubb 15852739-04',reg:'K9 JOLLY / FL',color:'Velvet Green / Pearl White',miles:'6,722 km'})}));
ok(u.r&&u.r.range,'value range "~$30k-$38k" is never imported');
ok(u.e.v===50400&&u.e.cur==='EUR'&&u.g.v===17450&&u.g.cur==='GBP','currency kept as written (EUR 50,400 / GBP 17,450)');
ok(u.n==='','"MISSING" reads as blank');
ok(u.h.join()==='vin,,reg,,color,paid,,ins,,loc,model,miles,,','headers map to the simplified fields only: '+u.h.join());
ok(u.v1==='X'&&u.v2==='7','check digit: SALLDVAF7TA977218 should be X; DBX707 passes');
ok(u.c.f.vin==='BH323827'&&u.c.f.model==='Jolly'&&u.c.f.ins==='Chubb'&&u.c.f.plate==='K9 JOLLY'&&u.c.f.region==='FL'&&u.c.f.color==='Velvet Green'&&u.c.u.miles&&u.c.u.miles.km,'cleaning: chassis prefix, drive note, policy no., plate/state, ext colour, km flagged');
await p.close();
// ---------- B. owner, NO migration_013 (single implicit portfolio), Intake Summary xlsx
p=await L.open({pre:BASE});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(600);
ok(await p.evaluate(()=>!!document.getElementById('cp-import')&&PO.on===false),'"Import sheet" on My collection; portfolios off without migration');
await p.evaluate(()=>document.getElementById('cp-import').click());await L.sleep(300);
let s=await ui(p);ok(s.step===1&&/Upload your list\. Nothing changes until you approve it\./.test(s.txt)&&/Scans and photos work too/.test(s.txt)&&/STEP 1 OF 4/.test(s.txt),'step 1 upload screen (mk-02)');
let fz=await p.evaluate(()=>{var m=Infinity;[].slice.call(document.querySelectorAll('#im-root *')).forEach(function(e){if(e.children.length===0&&e.textContent.trim()&&e.offsetParent){var f=parseFloat(getComputedStyle(e).fontSize);if(f<m)m=f;}});return m;});
ok(fz>=14,'no text under 14px on the upload screen ('+fz+')');
await scr(p,'im-01-upload-390.png');
await up(p,'Vehicle_Intake_Summary.xlsx');
s=await ui(p);ok(s.step===2&&/Which portfolio\?/.test(s.txt)&&/Vehicle_Intake_Summary\.xlsx/.test(s.txt)&&/19 vehicles found/.test(s.txt),'xlsx read in the browser: 19 vehicles found (legend + Discrepancies sheet ignored)');
ok(/My collection/.test(s.txt)&&/8 vehicles now/.test(s.txt)&&!/New portfolio for this import/.test(s.txt),'implicit portfolio only; no "+ New portfolio" without migration');
let fnc=await p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(function(c){return c.name==='import-sheet';}).length);
ok(fnc===0,'no AI call for a clear spreadsheet');
await scr(p,'im-02-portfolio-implicit-390.png');
await click(p,'Continue');await L.sleep(300);
s=await ui(p);
ok(s.step===3,'review step');
ok(s.A.changes.some(c=>/^3:paid=\$147,000/.test(c))&&s.A.changes.some(c=>/^3:miles=16,689 mi/.test(c))&&s.A.changes.some(c=>/^3:color=Powder Blue/.test(c)),'DBX707 auto-matched by VIN: paid / mileage / colour changes');
ok(s.A.changes.some(c=>/^4:loc=Sargents/.test(c))&&!s.A.changes.some(c=>/^4:miles/.test(c)),'Bentley matched by VIN, unchanged mileage not listed');
ok(s.A.rows.some(c=>/^1966 Volkswagen.*\|(update|unchanged)\|Matched by chassis/.test(c)),'exact chassis BH323827 matches the VW Samba automatically');
ok(s.A.rows.some(c=>/^1968 Porsche 912 Coupe\|(update|unchanged)\|Matched by chassis/.test(c)),'912 matched by exact chassis 12804608');
ok(s.A.pr.some(c=>/^2016 MINI/.test(c)),'MINI (no VIN on file) is a "Same car?" prompt, not automatic');
ok(s.A.conf.some(c=>/^unclear:2023 Aston Martin DBX707/.test(c))&&s.A.conf.some(c=>/^unclear:1981 Alfa Romeo/.test(c)),'"Unclear:" values go to Conflicts');
ok(s.A.conf.some(c=>/^flag:2023 Land Rover Defender 110:VIN check digit should be/.test(c)),'Defender VIN check digit flagged for checking');
ok(!s.A.changes.concat(s.A.news).join().match(/~|k\u2013/),'no value ranges anywhere');
ok(s.A.news.indexOf('1961 Fiat 500 Jolly')>=0&&s.A.news.indexOf('2022 Audi RS7')>=0,'unmatched cars listed as New cars ('+s.A.news.length+')');
await scr(p,'im-03-review-changes-390.png');
// approve two changes one by one, then skip one
await p.evaluate(()=>{IM.tab='changes';imRender();});await L.sleep(100);await click(p,'Replace');await L.sleep(150);
s=await ui(p);ok(/\u2713 Will replace/.test(s.txt)&&/Save: add \d+ cars?, update \d+/.test(s.txt),'Replace marks one change; save bar shows add/update counts');
let st0=await L.state(p);const BEFORE=st0.tables.vehicles.map(v=>v.id);ok(!st0.log.some(l=>l.t==='vehicles'||l.table==='vehicles'),'nothing written before Save');
await p.evaluate(()=>{IM.tab='new';imRender();});await L.sleep(200);
await scr(p,'im-04-review-new-390.png');
await p.evaluate(()=>{IM.tab='conflicts';imRender();});await L.sleep(200);
await scr(p,'im-05-review-conflicts-390.png');
// resolve: VW same car, 912 same car, MINI same car, Defender VIN keep, unclear: use DBX plate, Alfa model use + km use
await p.evaluate((w1,w2,w5)=>{IM.res['m0']=w1;IM.res['m2']=w2;IM.res['m12']=w5;imRender();},W1,W2,W5);
await p.evaluate(()=>{var A=imA();A.conflicts.forEach(function(c){if(c.type==='vincheck')imResolve(c.key,'keep');});});
await p.evaluate(()=>{var A=imA();A.conflicts.forEach(function(c){if(c.type==='unclear'&&/Aston|Alfa Romeo/.test(c.car))IM.res[c.key]='use';});imRender();});
s=await ui(p);
ok(s.A.changes.some(c=>/^1:reg=IHF - 4916/.test(c))&&s.A.changes.some(c=>/^1:color=Velvet Green/.test(c)),'after "same car": VW gets registration + colour changes');
ok(s.A.changes.some(c=>/^2:miles=56,949 mi/.test(c))&&s.A.changes.some(c=>/^2:paid=\u20ac50,400/.test(c)),'912: mileage 52,100 -> 56,949 and EUR price');
ok(s.A.changes.some(c=>/^3:reg=759CPT \/ FL/.test(c)),'unclear DBX plate used after approval (note text stripped)');
ok(s.A.news.some(n=>/1981 Alfa Romeo Giulia Spider Junior/.test(n)),'unclear model used after approval');
await p.evaluate(()=>{IM.tab='changes';imRender();});
await click(p,'Approve all');await L.sleep(150);
await p.evaluate(()=>{IM.tab='new';imRender();});await click(p,'Add all');await L.sleep(150);
// v21b: flagged costs must be confirmed first (see tests/costcheck.js); confirm them all here
await p.evaluate(()=>{IM.rows.forEach(function(r,ri){var f=imRowFields(r,ri,IM.res);if(f.paid)IM.res['cbok'+ri]=cbSig(f.paid,f.cur);});imRender();});
s=await ui(p);let nNew=s.A.news.length,nChg=s.A.changes.length;
ok(/Save: add \d+ cars?, update \d+/.test(s.txt),'save bar shows the add/update counts');
await click(p,'Save');await L.sleep(2500);
s=await ui(p);ok(s.step===4&&/Import saved/.test(s.txt)&&new RegExp('Added to My collection \u00b7 '+nNew,'i').test(s.txt),'done screen: '+nNew+' added');
await scr(p,'im-06-done-390.png');
let st=await L.state(p);
let ins=st.tables.vehicles.filter(v=>v.owner_id===O&&BEFORE.indexOf(v.id)<0);
ok(ins.length===nNew,'new cars inserted as vehicles of the collection owner ('+ins.length+')');
let rs7=ins.filter(v=>v.model==='RS7')[0];
ok(rs7&&rs7.vin==='WUAPCBF21NN900493'&&rs7.mileage===13053&&rs7.plate==='AL24HN'&&rs7.plate_region==='FL'&&rs7.color==='White','RS7 row: VIN, mileage, plate/state, colour');
ok(rs7&&!('portfolio_id' in rs7),'no portfolio_id written without migration');
let rsf=st.tables.vehicle_financials.filter(f=>rs7&&f.vehicle_id===rs7.id)[0];
ok(rsf&&Number(rsf.purchase_price)===125000,'"What you paid" saved through the normal save path');
let fj=ins.filter(v=>v.model==='500 Jolly (pink)')[0],fjf=st.tables.vehicle_financials.filter(f=>fj&&f.vehicle_id===fj.id)[0];
ok(fj&&/"cur":"EUR"/.test(fj.notes)&&fjf&&Number(fjf.purchase_price)===11000,'EUR price kept as EUR (notes extras without migration_012)');
let w2=st.tables.vehicles.filter(v=>v.id===W2)[0];ok(w2.mileage===56949,'approved change saved on the existing 912');
let w3=st.tables.vehicles.filter(v=>v.id===W3)[0],w3f=st.tables.vehicle_financials.filter(f=>f.vehicle_id===W3)[0];
ok(w3.color==='Powder Blue'&&w3.mileage===16689&&Number(w3f.purchase_price)===147000,'DBX707 updated (colour, mileage, paid)');
ok(st.tables.ai_estimates.filter(e=>e.kind==='owner').length===0&&JSON.stringify(st.tables.vehicle_owner_values||[])===await p.evaluate(()=>window.__MOCK_STATE__.ovBefore),'nothing written to owner value');
ok(!st.tables.vehicles.some(v=>/Discrep|Intake Remarks|kept per owner/i.test(v.notes||'')),'no discrepancy notes imported');
ok(st.v.length===0,'no schema violations '+JSON.stringify(st.v).slice(0,300));
// new car page shows Missing for blanks
await click(p,'View collection');await L.sleep(500);
await p.evaluate(id=>openVehicleDetail(id),rs7.id);await L.sleep(500);
let k=await p.evaluate(()=>{var k=document.getElementById('vd-key');return {miss:[].slice.call(k.querySelectorAll('.ms-miss')).map(function(b){return b.dataset.f;}),txt:k.textContent};});
ok(k.miss.length===0||k.miss.every(f=>['ins','loc','reg','miles','paid','color','vin'].indexOf(f)>=0),'new car has its own page with the key details card');
let alfa=ins.filter(v=>/Giulia Spider/.test(v.model))[0];
await p.evaluate(id=>openVehicleDetail(id),alfa.id);await L.sleep(400);
k=await p.evaluate(()=>[].slice.call(document.querySelectorAll('#vd-key .ms-miss')).map(function(b){return b.dataset.f;}).join());
ok(k==='reg','imported Alfa (no registration on sheet) shows Missing on Registration ('+k+')');
await p.screenshot({path:SC+'im-07-new-car-missing-390.png'});
// undo the batch
await p.evaluate(()=>imOpen());await L.sleep(200);
s=await ui(p);ok(/Recent imports/i.test(s.txt)&&/Vehicle_Intake_Summary\.xlsx/.test(s.txt)&&/UNDO/.test(s.txt),'upload screen lists Recent imports with UNDO (v23)');
await click(p,'UNDO');await L.sleep(400);
s=await ui(p);ok(/Undo this import\?/.test(s.txt)&&new RegExp(nNew+' cars will be removed').test(s.txt),'confirm sheet says how many cars go');
await click(p,'Undo import');await L.sleep(2500);
s=await ui(p);ok(/Import undone/.test(s.txt),'success screen');
st=await L.state(p);
ok(st.tables.vehicles.filter(v=>v.owner_id===O).length===8,'undo removed the added cars (back to 2 seed + 6)');
w2=st.tables.vehicles.filter(v=>v.id===W2)[0];w3=st.tables.vehicles.filter(v=>v.id===W3)[0];w3f=st.tables.vehicle_financials.filter(f=>f.vehicle_id===W3)[0];
ok(w2.mileage===52100&&w3.color==='Blue'&&Number(w3f.purchase_price)===139000,'undo restored the previous values');
ok(st.v.length===0,'no schema violations after undo');
ok(p.errors.filter(e=>!/cdnjs|CORS|favicon|net::/.test(e)).length===0,'no page errors '+p.errors.join(' | ').slice(0,300));
await p.close();
// ---------- C. WITH migration_013: portfolios, new portfolio, other-portfolio flag, portfolio_id on insert; Asset List PDF
p=await L.open({pre:BASE+MIG});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(600);
ok(await p.evaluate(()=>PO.on===true&&poList(ownerClientId()).length===2),'portfolios loaded with migration (2 for Olivia, RLS-scoped)');
if(!fs.existsSync(FX+'Vehicle_Asset_List.pdf')){
  console.log('  skip asset-list PDF section (private fixture is not in the repo)');
  await p.close();
}else{
await p.evaluate(()=>imOpen());await up(p,'Vehicle_Asset_List.pdf');
s=await ui(p);ok(s.step===2&&/21 vehicles found/.test(s.txt),'Asset List PDF (text layer) read in the browser: 21 vehicles');
ok(/USA Collection/.test(s.txt)&&/7 vehicles now \u00b7 USD/.test(s.txt)&&/UK & Europe Collection/.test(s.txt)&&/1 vehicle now \u00b7 EUR/.test(s.txt)&&/New portfolio for this import/.test(s.txt),'pf-04: portfolios with counts + currency, "+ New portfolio"');
ok(await p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(function(c){return c.name==='import-sheet';}).length===0),'no AI call for a text PDF');
await scr(p,'im-02-portfolio-390.png');
await click(p,'New portfolio for this import');await L.sleep(150);
await p.evaluate(()=>{var n=document.getElementById('im-np-name');n.value='Florida Garage';n.dispatchEvent(new Event('input'));var c=document.getElementById('im-np-country');c.value='US';c.dispatchEvent(new Event('change'));});
await scr(p,'im-02b-new-portfolio-390.png');
await click(p,'Continue');await p.waitForFunction(()=>IM.step===3,{timeout:8000}).catch(()=>{});await L.sleep(300);
st=await L.state(p);let npf=st.tables.portfolios.filter(x=>x.name==='Florida Garage')[0];
ok(npf&&npf.owner_id===O&&npf.country==='US'&&npf.currency==='USD'&&npf.is_default===false,'"+ New portfolio" created in the portfolios table');
s=await ui(p);
ok(s.A.ch.some(c=>/^1:year:replace=1974/.test(c)),'PDF: year 1966 vs 1974 (matched by chassis) is a replacement needing approval');
ok(s.A.conf.some(c=>/^flag:1996 Land Rover Defender 90:VIN check digit should be X, the sheet has 7/.test(c)),'PDF: SALLDVAF7TA977218 check digit conflict');
ok(s.A.rows.some(c=>/^1968 Porsche 912/.test(c))||s.A.pr.some(c=>/912/.test(c)),'912 is accounted for');
await p.evaluate(()=>{IM.tab='conflicts';imRender();});await L.sleep(150);
await scr(p,'im-05b-conflicts-pdf-390.png');
await p.evaluate(w2=>{IM.res['m13']=w2;imRender();},W2);
s=await ui(p);ok(s.A.conf.some(c=>/^otherpf:1968 Porsche 912 Coupe:This car is already in your collection, in UK & Europe Collection/.test(c)),'car already in another portfolio is flagged');
s=await ui(p);ok(!(await p.evaluate(()=>{var A=imA();return A.changes.filter(function(c){return c.field==='year'&&c.vid.slice(-1)==='1'&&imChangeOn(c);}).length;})),'"1966" is kept unless the year replacement is approved');
await p.evaluate(()=>{IM.tab='new';imRender();});await click(p,'Add all');await L.sleep(100);await p.evaluate(()=>{IM.rows.forEach(function(r,ri){var f=imRowFields(r,ri,IM.res);if(f.paid)IM.res['cbok'+ri]=cbSig(f.paid,f.cur);});imRender();});await click(p,'Save');await L.sleep(2500);
st=await L.state(p);
let added=st.tables.vehicles.filter(v=>v.owner_id===O&&v.portfolio_id===npf.id);
ok(added.length>0&&added.length===s.A.news.length,'new cars written with portfolio_id = new portfolio ('+added.length+')');
ok(st.tables.vehicles.filter(v=>v.id===W2)[0].portfolio_id===P2,'existing car stays in its portfolio');
ok(st.v.length===0,'no schema violations with migration '+JSON.stringify(st.v).slice(0,300));
await p.close();
}
// ---------- D. scan / photo -> import-sheet edge function (mocked); daily cap message
p=await L.open({pre:BASE});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(500);
await p.evaluate(()=>{var orig=sb.functions.invoke;window.__imMode='ok';sb.functions.invoke=function(n,o){if(n!=='import-sheet')return orig(n,o);window.__MOCK_STATE__.fn.calls.push({name:n,body:o.body});
  if(window.__imMode==='cap')return Promise.resolve({data:null,error:{message:'x',context:{json:function(){return Promise.resolve({error:'daily_limit',message:'limit'});}}}});
  return Promise.resolve({data:{rows:[{year:'1975',make:'Fiat',model:'500R',vin:'',registration:'',colour:'Dark Blue',mileage:'',paid:'\u20ac3,000.00',location:'With Ed',insurance:'Hagerty'},{year:'2023',make:'Aston Martin',model:'DBX707',vin:'SD7VUJBW7PTV07424',registration:'759CPT',region:'FL',colour:'Powder Blue',mileage:'16,689',paid:'~$125k\u2013$145k',location:'',insurance:''}]},error:null});};imOpen();});
await up(p,'dt_registration.jpg','#im-photo');
s=await ui(p);let call=await p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(function(c){return c.name==='import-sheet';})[0]);
ok(call&&call.body.mode==='rows'&&call.body.mime==='image/jpeg'&&call.body.file_base64.length>100&&call.body.import_id,'photo sent to import-sheet (rows mode, with import_id)');
ok(s.step===2&&/2 vehicles found/.test(s.txt),'AI rows go through the same review');
await click(p,'Continue');await L.sleep(200);s=await ui(p);
ok(!s.A.changes.some(c=>/paid/.test(c)&&/^3/.test(c)),'AI-returned value range is not imported');
await p.evaluate(()=>{IM.step=1;window.__imMode='cap';imRender();});await up(p,'dt_registration.jpg','#im-photo');
s=await ui(p);ok(s.step===1&&/today's 5 AI imports/.test(s.msg),'daily cap (5/day) message: '+s.msg);
await scr(p,'im-08-ai-cap-390.png');
await p.close();
// ---------- E. advisor: the import uses the same add-vehicle permission as the Add form
p=await L.open({pre:BASE});await serve(p);await L.login(p,'tom@test.com');await L.sleep(500);
let te=await p.evaluate(()=>{imOpen();return {owner:IM.owner,ok:!IM.owner||canAddVehicleFor(IM.owner),cnt:getClients().filter(function(c){return canAddVehicleFor(c.id);}).length};});
ok(te.ok,'advisor: import only targets a collection they may add vehicles to ('+te.cnt+' addable)');
await p.close();
await L.close();
console.log(`\nimport: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
