// v20: Missing indicators + completeness count on the vehicle page (p19). Mocked backend.
const L=require('./lib.js');
const SC='/workspace/vehicle-app/cloud/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const V1='d0000000-0000-4000-a000-000000000011';
// 1968 Porsche 912 from the Intake Summary: no registration, no insurance; location + EUR price in the notes extras (no migration_012)
const BASE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,v=S.tables.vehicles.filter(function(x){return x.id==='${V1}';})[0];
 v.year=1968;v.make='Porsche';v.model='912 Coupe';v.nickname='Purple Candy';v.color='Aubergine';v.vin='12804608';v.mileage=56949;v.plate=null;v.plate_region=null;
 v.notes='Service records: partial.\\n~evo~'+JSON.stringify({loc:'Hickory Vaults',cur:'EUR'});
 S.tables.vehicle_financials.forEach(function(f){if(f.vehicle_id==='${V1}'){f.purchase_price=50400;f.purchase_date='2019-05-02';}});})();`;
const MIG=`(function(){var C=window.__SCHEMA_COLS__;C.vehicles.push('location','insurance_carrier');C.vehicle_financials.push('purchase_currency');
 var S=window.__MOCK_STATE__;S.tables.vehicles.forEach(function(v){v.location=null;v.insurance_carrier=null;});S.tables.vehicle_financials.forEach(function(f){f.purchase_currency='USD';});
 var v=S.tables.vehicles.filter(function(x){return x.id==='${V1}';})[0];v.location='Hickory Vaults';v.notes='Service records: partial.';
 S.tables.vehicle_financials.forEach(function(f){if(f.vehicle_id==='${V1}')f.purchase_currency='EUR';});})();`;
const key=p=>p.evaluate(()=>{var k=document.getElementById('vd-key');if(!k)return null;var m=[].slice.call(k.querySelectorAll('.ms-miss'));var c=k.querySelector('.ms-chip');
  var cs=m[0]?getComputedStyle(m[0]):null;
  return {chip:c?c.textContent:'',miss:m.map(function(b){return b.dataset.f;}),txt:k.textContent,fs:cs?parseFloat(cs.fontSize):0,col:cs?cs.color:'',bb:cs?cs.borderBottomWidth+' '+cs.borderBottomStyle+' '+cs.borderBottomColor:'',
   lab:parseFloat(getComputedStyle(k.querySelector('.ms-lab')).fontSize),tap:m[0]?m[0].getBoundingClientRect().height:0};});
const show=async p=>{await p.evaluate(()=>{var h=document.querySelector('#modal-vehicle-detail .vhead');var el=h;var sc=null;while(el&&el!==document.body){var cs=getComputedStyle(el);if(/(auto|scroll)/.test(cs.overflowY)&&el.scrollHeight>el.clientHeight){sc=el;break;}el=el.parentElement;}
  sc=sc||document.scrollingElement;var bar=document.querySelector('#modal-vehicle-detail .backbar');var off=(bar?bar.getBoundingClientRect().height:0)+12;sc.scrollTop+=h.getBoundingClientRect().top-off;});await L.sleep(300);};
(async()=>{
await L.launch();
// ---------- A. owner, no migration_012
let p=await L.open({pre:BASE,w:390,h:844});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(600);
let k=await key(p);
ok(k&&k.chip==='6 of 8 complete','completeness count on by default: "'+(k&&k.chip)+'"');
ok(k&&k.miss.join()==='reg,ins','Missing on Registration + Insurance only ('+(k&&k.miss)+')');
ok(k&&/Hickory Vaults/.test(k.txt)&&/\u20ac50,400\.00/.test(k.txt),'location + EUR "What you paid" from notes extras (no migration)');
ok(k&&/1968 Porsche 912 Coupe/.test(k.txt)&&/12804608/.test(k.txt)&&/56,949 mi/.test(k.txt),'car, chassis no., mileage shown');
ok(k&&k.fs>=20,'Missing text >= 20px ('+(k&&k.fs)+')');
ok(k&&k.col==='rgb(255, 255, 255)','Missing text is white');
ok(k&&/^3px solid rgb\(229, 72, 77\)/.test(k.bb),'red underline ('+(k&&k.bb)+')');
ok(k&&k.lab>=17,'labels >= 17px');ok(k&&k.tap>=44,'Missing tap target >= 44px');
await show(p);await p.screenshot({path:SC+'ms-01-vehicle-missing-390.png'});
// ---------- B. tap Missing -> that field's editor
await p.evaluate(()=>document.querySelector('#vd-key .ms-miss[data-f="reg"]').click());await L.sleep(700);
let e=await p.evaluate(()=>({open:document.getElementById('modal-add-vehicle').classList.contains('active')||getComputedStyle(document.getElementById('modal-add-vehicle')).display!=='none',
  more:document.getElementById('v-more').open,focus:document.activeElement&&document.activeElement.id,hl:!!document.querySelector('.input-group.ms-focus #v-plate'),title:document.getElementById('av-title').textContent,
  loc:document.getElementById('v-location').value,cur:document.getElementById('v-currency').value,paidLab:document.querySelector('label[for="v-purchase-price"]').textContent}));
ok(e.open&&e.title==='Edit vehicle','tap opens the Edit form');
ok(e.more,'"More details" opened for the field');
ok(e.focus==='v-plate'&&e.hl,'Registration input focused + highlighted ('+e.focus+')');
ok(e.loc==='Hickory Vaults'&&e.cur==='EUR','form prefilled: location + currency EUR');
ok(e.paidLab==='What you paid','price labelled "What you paid"');
await p.screenshot({path:SC+'ms-02-editor-from-missing-390.png'});
await p.evaluate(()=>{setVal('v-plate','eu105g');setVal('v-plate-region','FL');setVal('v-insurer','Chubb');saveVehicle();});await L.sleep(1800);
let st=await L.state(p);let row=st.tables.vehicles.filter(v=>v.id===V1)[0];
ok(row.plate==='EU105G'&&row.plate_region==='FL','plate + plate_region saved to existing vehicles columns');
ok(/"insc":"Chubb"/.test(row.notes)&&/"loc":"Hickory Vaults"/.test(row.notes)&&/"cur":"EUR"/.test(row.notes),'insurance, location, currency kept in notes extras');
ok(row.location===undefined&&row.insurance_carrier===undefined,'no migration_012 columns written when absent');
ok(st.v.length===0,'no schema violations '+JSON.stringify(st.v).slice(0,200));
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
k=await key(p);ok(k.chip==='8 of 8 complete'&&k.miss.length===0,'after save: 8 of 8 complete, no Missing');
// ---------- C. count can be turned off
await p.evaluate(()=>{setVal('v-plate','');});
await p.evaluate(()=>msSetCount(false));k=await key(p);ok(k.chip==='','count hidden when turned off');
await p.evaluate(()=>msSetCount(true));k=await key(p);ok(k.chip!=='','count back on');
// ---------- D. co-owner view: never Missing
await p.evaluate(()=>{var v=byId(getVehicles(),currentVehicleId);v.insurer='';CO.of='someone-else';msRender(v);});
k=await key(p);ok(k.miss.length===0&&k.chip===''&&/Not on file/.test(k.txt),'co-owner view: no Missing, no count');
await p.evaluate(()=>{CO.of=null;});
// ---------- E. archived / export never carry Missing
ok(await p.evaluate(()=>!/Missing/.test(JSON.stringify(getVehicles()))),'exported data has no "Missing"');
ok(await p.evaluate(()=>{var v=byId(getVehicles(),currentVehicleId);var a=Object.assign({},v,{archived:true});return !msCanSeeMissing(a);}),'archived car: no Missing');
ok(p.errors.filter(x=>!/pdf\.js|pdf\.min|ERR_FAILED/.test(x)).length===0,'no page errors '+JSON.stringify(p.errors).slice(0,300));
await p.close();
// ---------- F. shared view (tech with access to the owner's cars)
p=await L.open({pre:BASE,w:390,h:844});
await L.login(p,'tom@test.com');await L.sleep(700);
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(600);
k=await key(p);
ok(k&&k.miss.length===0,'shared (tech) view: no Missing');
ok(k&&k.chip==='','shared view: no completeness count');
ok(k&&/Not on file/.test(k.txt)&&!/Missing/.test(k.txt),'shared view shows "Not on file" instead');
await show(p);await p.screenshot({path:SC+'ms-03-shared-view-no-missing-390.png'});
await p.close();
// ---------- G. with migration_012 columns
p=await L.open({pre:BASE+MIG,w:390,h:844});
await L.login(p,'olivia@test.com');await L.sleep(600);
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
k=await key(p);ok(/Hickory Vaults/.test(k.txt)&&/\u20ac50,400\.00/.test(k.txt),'migration_012: location column + purchase_currency read');
await p.evaluate(()=>msEdit('ins'));await L.sleep(500);
ok(await p.evaluate(()=>document.activeElement.id==='v-insurer'),'Insurance Missing focuses the Insurance field');
await p.evaluate(()=>{setVal('v-insurer','Essentia');setVal('v-currency','GBP');saveVehicle();});await L.sleep(1800);
st=await L.state(p);row=st.tables.vehicles.filter(v=>v.id===V1)[0];const fin=st.tables.vehicle_financials.filter(f=>f.vehicle_id===V1)[0];
ok(row.insurance_carrier==='Essentia'&&row.location==='Hickory Vaults','migration_012: insurance_carrier + location columns written');
ok(fin.purchase_currency==='GBP'&&Number(fin.purchase_price)===50400,'migration_012: purchase_currency written, price unchanged');
ok(st.v.length===0,'no schema violations');
await p.close();await L.close();
console.log('MISSING: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
