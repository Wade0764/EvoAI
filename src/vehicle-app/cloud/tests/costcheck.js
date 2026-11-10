// v21b: cost basis check (p21). Mocked backend only.
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
const ui=p=>p.evaluate(()=>{var r=document.getElementById('im-root');var A=IM.step===3?imA():null;return {step:IM.step,txt:r?r.innerText:'',msg:IM.msg,A:A&&{changes:A.changes.map(function(c){return c.vid.slice(-1)+':'+c.field+'='+c.val;}),news:A.news.map(function(n){return imCarName(n.f);}),conf:A.conflicts.map(function(c){return c.type+':'+c.car+':'+(c.note||'');})}};});

const fin=(st,id)=>st.tables.vehicle_financials.filter(f=>f.vehicle_id===id)[0];
const cbScr=async(p,n,sel)=>{await p.evaluate(sel=>{var r=document.getElementById('im-root'),e=sel&&document.querySelector(sel);if(r&&e){var t=e.closest('.im-item')||e;r.scrollTop=Math.max(0,t.getBoundingClientRect().top-r.getBoundingClientRect().top+r.scrollTop-170);}},sel);await L.sleep(250);await p.screenshot({path:SC+n});};
(async()=>{
await L.launch();
// ---------- A. thresholds
let p=await L.open({pre:BASE});
let t=await p.evaluate(()=>{var c=function(o){var r=cbCheck(o);return r?r.kind:'ok';};return {
  zero:c({amount:0,make:'Zzz'}),u999:c({amount:999,make:'Zzz'}),k1:c({amount:1000,make:'Zzz'}),m20:c({amount:20000000,make:'Zzz'}),m20p:c({amount:20000001,make:'Zzz'}),
  eur900:c({amount:900,cur:'EUR',make:'Zzz'}),eur930:c({amount:930,cur:'EUR',make:'Zzz'}),
  ai24:c({amount:24000,estimate:100000,make:'Zzz'}),ai25:c({amount:25000,estimate:100000,make:'Zzz'}),ai400:c({amount:400000,estimate:100000,make:'Zzz'}),ai401:c({amount:401000,estimate:100000,make:'Zzz'}),
  aiWins:c({amount:20000,estimate:30000,make:'Ferrari'}),mkLow:c({amount:60000,make:'Ferrari'}),mkOk:c({amount:80000,make:'Ferrari'}),mkHigh:c({amount:1300000,make:'Ferrari'}),
  gbp:c({amount:5000,cur:'GBP',make:'Fiat'}),
  mix:c({amount:5000,raw:'$\u20ac5,000',make:'Zzz'}),grp:c({amount:12345000,raw:'$1,2345,000',make:'Zzz'}),dig:c({amount:1e10,raw:'$12345678901',make:'Zzz'}),dec:c({amount:5000.123,raw:'5000.123',make:'Zzz'}),
  eu:c({amount:50400,raw:'\u20ac50.400,00',cur:'EUR',make:'Porsche'}),fine:c({amount:147000,raw:'$147,000',make:'Aston Martin'}),
  why:cbCheck({amount:300,make:'Fiat'}).reason,why2:cbCheck({amount:3587.04,make:'Bentley'}).reason};});
ok(t.zero==='zero'&&t.u999==='low'&&t.k1==='ok','0 and under $1,000 flagged; $1,000 passes (unknown make)');
ok(t.m20==='ok'&&t.m20p==='high','over $20,000,000 flagged');
ok(t.eur900==='low'&&t.eur930==='ok','EUR converted for the $1,000 floor (EUR 900 low, EUR 930 ok)');
ok(t.ai24==='low'&&t.ai25==='ok'&&t.ai400==='ok'&&t.ai401==='high','vs AI estimate: under 25% / over 400% flagged');
ok(t.aiWins==='ok','AI estimate used before the make guide');
ok(t.mkLow==='low'&&t.mkOk==='ok'&&t.mkHigh==='high','make guide when no estimate (Ferrari ~$300k)');
ok(t.gbp==='ok','GBP converted (GBP 5,000 Fiat ok)');
ok(t.mix==='malformed'&&t.grp==='malformed'&&t.dig==='malformed'&&t.dec==='malformed','malformed: two currencies, broken groups, too many digits, 3 decimals');
ok(t.eu==='ok'&&t.fine==='ok','normal amounts are not flagged (EUR 50.400,00; $147,000)');
ok(/Looks low for this car/.test(t.why)&&t.why2==='Looks low for this car','reason text: '+t.why+' / '+t.why2);
await p.close();
// ---------- B. import review: Changes + New cars
p=await L.open({pre:BASE});await serve(p);
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(()=>document.getElementById('cp-import').click());await L.sleep(300);
await up(p,'Vehicle_Intake_Summary.xlsx');await click(p,'Continue');await L.sleep(300);
await p.evaluate(()=>{var A=imA();A.conflicts.forEach(function(c){if(c.type==='unclear'&&/Alfa Romeo/.test(c.car))IM.res[c.key]='use';if(c.type==='vincheck')IM.res[c.key]={keep:true};});imRender();});
let info=await p.evaluate(()=>{var A=imA(),o={};A.changes.forEach(function(x){if(x.field==='paid'){var f=imRowFields(IM.rows[x.ri],x.ri,IM.res);o[x.car]=cbImFlag(x.ri,f,x.vid);}});A.news.forEach(function(x){o[imCarName(x.f)]=cbImFlag(x.ri,x.f,null);});return o;});
ok(info['2005 Bentley Continental GT']&&info['2005 Bentley Continental GT'].kind==='low','Bentley $3,587.04 flagged low (Changes)');
ok(info['2023 Aston Martin DBX707']===null,'DBX707 $147,000 not flagged');
ok(info['1961 Fiat 500 Jolly']&&info['1961 Fiat 500 Jolly'].kind==='low'&&info['1996 Alfa Romeo Spider 916']&&info['1981 Alfa Romeo Giulia Spider Junior'],'New cars: Fiat $300, Alfa $100, Alfa EUR 11.75 flagged');
ok(info['2022 Audi RS7']===null&&info['1970 Fiat 500 Jolly (pink)']===null,'RS7 $125,000 and Fiat EUR 11,000 not flagged');
await p.evaluate(()=>{IM.tab='changes';imRender();});await L.sleep(150);
let box=await p.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('#im-root .cb-box'))[0];if(!b)return null;var cs=getComputedStyle(b),a=b.querySelector('.cb-amt');return {bw:parseFloat(cs.borderTopWidth),bc:cs.borderTopColor,fs:parseFloat(getComputedStyle(a).fontSize),amt:a.textContent,txt:b.innerText,car:b.closest('.im-item').querySelector('.im-car').textContent};});
ok(box&&box.bw>=3&&/rgb\(229, 72, 77\)/.test(box.bc),'thick red border around the amount ('+(box&&box.bw)+'px)');
ok(box&&box.fs>=26&&box.amt==='$3,587.04'&&box.car==='2005 Bentley Continental GT','large amount text: '+(box&&box.amt));
ok(box&&/Looks low for this car/.test(box.txt)&&/Yes, this is correct/.test(box.txt)&&/Edit/.test(box.txt)&&/Saved for confirming later/.test(box.txt),'reason + "Yes, this is correct" + "Edit" + "Saved for confirming later"');
await cbScr(p,'cb-01-import-change-flag-390.png','.cb-box');
await click(p,'Approve all');await L.sleep(150);
let s=await ui(p);
ok(/Will (be filled|replace) \u00b7 confirm later/.test(s.txt)&&/4 costs will be saved for confirming later/.test(s.txt),'flagged cost is on by default (non-blocking, "confirm later"): 1 change + 3 new cars');
let sm=/Save: add (\d+) cars?, update (\d+)/.exec(s.txt)||[],pc=await p.evaluate(()=>imPlanCounts(imA()));
ok(Number(sm[1])===pc.add&&Number(sm[2])===pc.upd&&pc.upd>0,'save bar counts include the flagged change ('+sm[0]+')');
await cbScr(p,'cb-02-approve-all-needs-390.png','.cb-box');
await p.evaluate(()=>{IM.tab='new';imRender();});await L.sleep(150);
await cbScr(p,'cb-03-import-new-flag-390.png','.cb-box');
await click(p,'Add all');await L.sleep(150);
s=await ui(p);let need=(/(\d+) costs will be saved for confirming later/.exec(s.txt)||[])[1];
ok(Number(need)===4,'Add all: 3 new-car costs + 1 change marked for later ('+need+')');
let ri=await p.evaluate(()=>imA().news.filter(function(x){return /Spider 916/.test(x.f.model);})[0].ri);
await p.evaluate(r=>cbImEdit(r),ri);await L.sleep(200);
await cbScr(p,'cb-04-edit-amount-390.png','#cb-in');
await p.evaluate(()=>{document.getElementById('cb-in').value='10000';});await click(p,'Save amount');await L.sleep(150);
ok(await p.evaluate(r=>{var x=imA().news.filter(function(n){return n.ri===r;})[0];return x.f.paid===10000&&!cbImFlag(r,x.f,null);},ri),'Edit: amount changed to $10,000 and no longer flagged');
await p.evaluate(()=>{var b=[].slice.call(document.querySelectorAll('#im-root .im-item')).filter(function(i){return /1961 Fiat 500 Jolly/.test(i.querySelector('.im-car').textContent);})[0];[].slice.call(b.querySelectorAll('button')).filter(function(x){return x.textContent==='Yes, this is correct';})[0].click();});await L.sleep(150);
s=await ui(p);ok(/Confirmed as correct/.test(s.txt)&&/2 costs will be saved for confirming later/.test(s.txt),'"Yes, this is correct" confirms the Fiat (2 left for later)');
await cbScr(p,'cb-05-confirmed-390.png','.cb-box.ok');
let st0=await L.state(p);const BEFORE=st0.tables.vehicles.map(v=>v.id);
await click(p,'Save');await L.sleep(2500);
s=await ui(p);let st=await L.state(p);
let ins=st.tables.vehicles.filter(v=>v.owner_id===O&&BEFORE.indexOf(v.id)<0);
let fiat=ins.filter(v=>v.model==='500 Jolly')[0],a916=ins.filter(v=>/Spider 916/.test(v.model))[0],junior=ins.filter(v=>/Giulia Spider Junior/.test(v.model))[0];
ok(fiat&&Number((fin(st,fiat.id)||{}).purchase_price)===300&&!/"cfc"/.test(fiat.notes||''),'confirmed Fiat saved with $300, confirmed');
ok(a916&&Number((fin(st,a916.id)||{}).purchase_price)===10000&&!/"cfc"/.test(a916.notes||''),'edited Alfa saved with $10,000, confirmed');
ok(junior&&Number((fin(st,junior.id)||{}).purchase_price)===11.75||(junior&&Number((fin(st,junior.id)||{}).purchase_price)===12),'unconfirmed Alfa (EUR 11.75) IS saved');
ok(junior&&/"cfc":"0"/.test(junior.notes)&&/"cfr":"Under \$1,000/.test(junior.notes),'...marked unconfirmed with its reason (notes extras, no migration_015)');
let w4=fin(st,W4),w4v=st.tables.vehicles.filter(v=>v.id===W4)[0];
ok(w4&&Math.round(Number(w4.purchase_price))===3587&&/"cfc":"0"/.test(w4v.notes),'flagged Bentley cost saved as unconfirmed');
ok(/Sargents/.test(JSON.stringify(w4v)),'other approved Bentley changes saved (location)');
let w3=fin(st,W3),w3v=st.tables.vehicles.filter(v=>v.id===W3)[0];ok(w3&&Number(w3.purchase_price)===147000&&!/"cfc"/.test(w3v.notes||''),'unflagged DBX707 cost saved, confirmed');
ok(s.step===4&&/Costs to confirm\s*2/.test(s.txt),'done screen: "Costs to confirm 2"');
ok(st.v.length===0,'no schema violations '+JSON.stringify(st.v).slice(0,200));
await p.screenshot({path:SC+'cb-06-done-390.png'});
// vehicle page keeps the red box until confirmed
await click(p,'View collection');await L.sleep(500);
await p.evaluate(id=>openVehicleDetail(id),junior.id);await L.sleep(600);
let pg=await p.evaluate(()=>{var b=document.querySelector('#vd-key .cb-box');return b&&{txt:b.innerText,bw:parseFloat(getComputedStyle(b).borderTopWidth),fs:parseFloat(getComputedStyle(b.querySelector('.cb-amt')).fontSize)};});
ok(pg&&pg.bw>=3&&pg.fs>=26&&/\u20ac11\.75/.test(pg.txt)&&/Under \$1,000/.test(pg.txt)&&/Yes, this is correct/.test(pg.txt)&&/Edit/.test(pg.txt),'vehicle page: thick red box, amount, reason, both buttons');
await p.evaluate(()=>{var b=document.getElementById('cb-page');var sc=b;while(sc&&sc.scrollHeight<=sc.clientHeight+2)sc=sc.parentElement;b.scrollIntoView({block:'center'});});await L.sleep(300);
await p.screenshot({path:SC+'cb-10-vehicle-page-red-box-390.png'});
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('#cb-page button')).filter(function(x){return x.textContent==='Yes, this is correct';})[0].click();});await L.sleep(1800);
st=await L.state(p);let jv=st.tables.vehicles.filter(v=>v.id===junior.id)[0];
ok(!(await p.evaluate(()=>!!document.querySelector('#vd-key .cb-box')))&&!/"cfc"/.test(jv.notes||''),'"Yes, this is correct" on the page clears the box and saves confirmed');
// Bentley: Edit from the page opens the form with the box; a new amount saves as confirmed
await p.evaluate(id=>openVehicleDetail(id),W4);await L.sleep(500);
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('#cb-page button')).filter(function(x){return x.textContent==='Edit';})[0].click();});await L.sleep(1500);
await p.evaluate(()=>{var k=document.getElementById('vin-keep');if(k&&k.offsetParent){k.click();document.getElementById('v-purchase-price').focus();}});await L.sleep(300);
let fe=await p.evaluate(()=>({f:document.activeElement&&document.activeElement.id,box:/Looks low for this car/.test(document.getElementById('cb-form').innerText)}));
ok(fe.f==='v-purchase-price'&&fe.box,'page "Edit" opens the form on "What you paid" with the red box ('+fe.f+')');
await p.evaluate(()=>{var i=document.getElementById('v-purchase-price');i.value='45000';i.dispatchEvent(new Event('input',{bubbles:true}));saveVehicle();});await L.sleep(1800);
st=await L.state(p);w4v=st.tables.vehicles.filter(v=>v.id===W4)[0];
ok(Number(fin(st,W4).purchase_price)===45000&&!/"cfc"/.test(w4v.notes||''),'edited to $45,000: saved and confirmed');
ok(st.v.length===0,'no schema violations after confirm/edit');
await p.close();
// ---------- C. vehicle form: saves flagged amount as unconfirmed, no blocking
p=await L.open({pre:BASE});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(()=>openAddVehicleModal());await L.sleep(400);
await p.evaluate(()=>{setVal('v-year','2019');setVal('v-make','Porsche');setVal('v-model','911 Carrera');var e=document.getElementById('v-more');if(e)e.open=true;var i=document.getElementById('v-purchase-price');i.value='5000';i.dispatchEvent(new Event('input',{bubbles:true}));});await L.sleep(200);
let fb=await p.evaluate(()=>{var b=document.querySelector('#cb-form .cb-box');return b&&{vis:document.getElementById('cb-form').offsetParent!==null,txt:b.innerText,bw:parseFloat(getComputedStyle(b).borderTopWidth),inbad:document.getElementById('v-purchase-price').classList.contains('cb-in-bad')};});
ok(fb&&fb.vis&&/\$5,000/.test(fb.txt)&&/Looks low for this car/.test(fb.txt)&&/You can save now/.test(fb.txt)&&fb.bw>=3&&fb.inbad,'form: red box + reason, says it can be saved now');
await p.evaluate(()=>{document.getElementById('cb-form').scrollIntoView({block:'center'});});await L.sleep(250);
await p.screenshot({path:SC+'cb-07-form-flag-390.png'});
await p.evaluate(()=>saveVehicle());await L.sleep(1800);
st=await L.state(p);let nv=st.tables.vehicles.filter(v=>v.model==='911 Carrera')[0];
ok(nv&&Number((fin(st,nv.id)||{}).purchase_price)===5000&&/"cfc":"0"/.test(nv.notes)&&/Looks low/.test(nv.notes),'form: saves without blocking, marked unconfirmed');
await p.evaluate(id=>openVehicleDetail(id),nv.id);await L.sleep(500);
ok(await p.evaluate(()=>!!document.querySelector('#vd-key .cb-box')),'form-saved flagged cost shows the red box on the vehicle page');
// confirm in the form before saving -> saved confirmed
await p.evaluate(()=>{closeModal('modal-vehicle-detail');openAddVehicleModal();});await L.sleep(400);
await p.evaluate(()=>{setVal('v-year','2020');setVal('v-make','Porsche');setVal('v-model','Cayman');var e=document.getElementById('v-more');if(e)e.open=true;var i=document.getElementById('v-purchase-price');i.value='6000';i.dispatchEvent(new Event('input',{bubbles:true}));});await L.sleep(200);
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('#cb-form button')).filter(function(x){return x.textContent==='Edit';})[0].click();});
ok(await p.evaluate(()=>document.activeElement.id==='v-purchase-price'),'form: "Edit" focuses the amount');
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('#cb-form button')).filter(function(x){return x.textContent==='Yes, this is correct';})[0].click();});await L.sleep(150);
ok(await p.evaluate(()=>/Confirmed as correct/.test(document.getElementById('cb-form').innerText)),'form: confirmed state shown');
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('.toast')).forEach(function(t){t.remove();});document.getElementById('cb-form').scrollIntoView({block:'center'});});await L.sleep(300);
await p.screenshot({path:SC+'cb-08-form-confirmed-390.png'});
await p.evaluate(()=>saveVehicle());await L.sleep(1800);
st=await L.state(p);let cay=st.tables.vehicles.filter(v=>v.model==='Cayman')[0];
ok(cay&&Number((fin(st,cay.id)||{}).purchase_price)===6000&&!/"cfc"/.test(cay.notes||''),'form: confirmed before saving -> saved confirmed');
// existing car vs AI estimate
await p.evaluate(i=>{aiVal=function(){return 200000;};openVehicleDetail(i);},W3);await L.sleep(400);
await p.evaluate(()=>editCurrentVehicle());await L.sleep(1500);await p.evaluate(()=>{var k=document.getElementById('vin-keep');if(k)k.click();});await L.sleep(400);
ok(await p.evaluate(()=>document.getElementById('cb-form').style.display==='none'),'form: unchanged confirmed amount shows no box');
await p.evaluate(()=>{var i=document.getElementById('v-purchase-price');i.value='900000';i.dispatchEvent(new Event('input',{bubbles:true}));});await L.sleep(150);
await p.evaluate(()=>{[].slice.call(document.querySelectorAll('.toast')).forEach(function(t){t.remove();});document.getElementById('cb-form').scrollIntoView({block:'center'});});await L.sleep(1200);
await p.screenshot({path:SC+'cb-09-form-edit-high-390.png'});
ok(await p.evaluate(()=>/Looks high for this car/.test(document.getElementById('cb-form').innerText)),'form: 450% of the AI estimate flagged high');
await p.evaluate(()=>saveVehicle());await L.sleep(1800);
st=await L.state(p);w3v=st.tables.vehicles.filter(v=>v.id===W3)[0];
ok(Number(fin(st,W3).purchase_price)===900000&&/"cfc":"0"/.test(w3v.notes)&&/Looks high/.test(w3v.notes),'form: high amount saved as unconfirmed');
ok(st.v.length===0,'no schema violations');
ok(p.errors.filter(e=>!/cdnjs|CORS|favicon|net::/.test(e)).length===0,'no page errors '+p.errors.join(' | ').slice(0,300));
await p.close();
// ---------- D. migration_015 columns + tech view
const V1='d0000000-0000-4000-a000-000000000011';
const FLAG=`(function(){var S=window.__MOCK_STATE__;S.tables.vehicles.forEach(function(v){if(v.id==='${V1}')v.notes='Garage kept.\\n~evo~{"cfc":"0","cfr":"Looks low for this car"}';});})();`;
const M15=`(function(){var C=window.__SCHEMA_COLS__,S=window.__MOCK_STATE__;C.vehicle_financials.push('cost_confirmed','cost_flag_reason');S.tables.vehicle_financials.forEach(function(f){f.cost_confirmed=true;f.cost_flag_reason=null;if(f.vehicle_id==='${V1}'){f.cost_confirmed=false;f.cost_flag_reason='Looks high for this car';}});})();`;
p=await L.open({pre:M15});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
ok(await p.evaluate(()=>CB.fcol===true&&/Looks high for this car/.test((document.querySelector('#vd-key .cb-box')||{}).innerText||'')),'migration_015: reads cost_confirmed=false + reason from vehicle_financials');
await p.evaluate(()=>cbPageOk());await L.sleep(1800);
st=await L.state(p);let f1=fin(st,V1);
ok(f1.cost_confirmed===true&&f1.cost_flag_reason===null,'migration_015: confirm writes cost_confirmed=true, reason cleared');
ok(st.v.length===0,'migration_015: no schema violations');
await p.close();
p=await L.open({pre:FLAG});
await L.login(p,'tom@test.com');await L.sleep(700);
await p.evaluate(i=>{try{openVehicleDetail(i);}catch(e){}},V1);await L.sleep(500);
ok(await p.evaluate(()=>!document.querySelector('.cb-box')&&!/Looks low for this car/.test(document.body.innerText)),'tech/shared view: no red box, no reason');
await p.close();
p=await L.open({pre:FLAG});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
ok(await p.evaluate(()=>!!document.querySelector('#vd-key .cb-box')),'owner sees the red box from notes extras (no migration_015)');
await p.close();
await L.close();
console.log('\ncostcheck: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
