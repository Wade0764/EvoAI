// v17 (E) automatic VIN decode. vPIC is mocked in the page (no network); backend is mock_sb.
const L=require('./lib.js');
const SC='/workspace/vehicle-app/cloud/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const DEF='SALEA7EU5N2100123',BMW='WBSBG930XLEY12345',Y1980='1G1YY3382A5100001',TES='5YJ3E1EA7KF300001';
const PRE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var C=window.__SCHEMA_COLS__;['is_replica','builder','trim','engine','body_class','vin_decoded_at'].forEach(function(c){if(C.vehicles.indexOf(c)<0)C.vehicles.push(c);});
 if(C.ai_estimates)C.ai_estimates.push('value_mid','notes','inputs','cache_key');
 var R={'${DEF}':{ModelYear:'2022',Make:'LAND ROVER',Model:'Defender 110',Trim:'X-Dynamic',Series:'',DisplacementL:'2.9960',EngineCylinders:'6',FuelTypePrimary:'Gasoline',BodyClass:'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)',Manufacturer:'JAGUAR LAND ROVER LIMITED'},
  '${BMW}':{ModelYear:'1990',Make:'BMW',Model:'M3',Trim:'',Series:'E30',DisplacementL:'2.3',EngineCylinders:'4',FuelTypePrimary:'Gasoline',BodyClass:'Coupe',Manufacturer:'BMW AG'},
  '${TES}':{ModelYear:'2019',Make:'TESLA',Model:'Model 3',Trim:'Long Range',DisplacementL:'',EngineCylinders:'',FuelTypePrimary:'Electric',BodyClass:'Sedan/Saloon',Manufacturer:'TESLA, INC.'}};
 window.__VPIC={calls:[],mode:'ok'};var f0=window.fetch;
 window.fetch=function(u,o){u=String(u);if(u.indexOf('vpic.nhtsa.dot.gov')<0)return f0.apply(this,arguments);window.__VPIC.calls.push(u);
  if(window.__VPIC.mode==='fail')return Promise.reject(new Error('net'));
  var vin=decodeURIComponent(u.split('/').pop().split('?')[0]);var row=R[vin]||{ModelYear:'',Make:'',Model:''};
  return Promise.resolve(new Response(JSON.stringify({Count:1,Results:[row]}),{status:200,headers:{'Content-Type':'application/json'}}));};
})();`;
const w=ms=>L.sleep(ms);
(async()=>{
await L.launch();
console.log('VIN unit');
let p=await L.open({pre:PRE,w:390,h:844});
await L.login(p,'olivia@test.com');await w(500);
const U=await p.evaluate((a)=>({def:vinOk(a.DEF),bmw:vinOk(a.BMW),tes:vinOk(a.TES),y80:vinOk(a.Y1980),short:vinOk('WBSBG930XLEY1234'),bad:vinOk(a.DEF.slice(0,8)+'1'+a.DEF.slice(9)),ioq:vinOk('SALEA7EU5N21OO123'),
  eng:vinParse({ModelYear:'2022',Make:'LAND ROVER',Model:'Defender 110',Trim:'X-Dynamic',DisplacementL:'2.9960',EngineCylinders:'6',FuelTypePrimary:'Gasoline',BodyClass:'Coupe'}),
  ev:vinParse({ModelYear:'2019',Make:'TESLA',Model:'Model 3',DisplacementL:'',EngineCylinders:'',FuelTypePrimary:'Electric'}).engine,url:VIN.url}),{DEF,BMW,TES,Y1980});
ok(U.def&&U.bmw&&U.tes,'valid 17-char VINs pass the check digit');
ok(!U.short&&!U.bad&&!U.ioq,'short, wrong check digit and I/O/Q VINs rejected');
ok(!U.y80,'1980 model-year VIN skipped (pre-1981)');
ok(U.eng.make==='Land Rover'&&U.eng.trim==='X-Dynamic'&&U.eng.engine==='3.0L 6-cyl Gasoline'&&U.eng.body==='Coupe','vPIC row parsed: make, trim, engine (displacement, cylinders, fuel), body');
ok(U.ev==='Electric','EV engine string without displacement');
ok(/DecodeVinValuesExtended\/$/.test(U.url),'uses DecodeVinValuesExtended');

console.log('VIN add form: conflict sheet');
await p.evaluate(a=>{window.__VPIC.calls=[];openAddVehicleModal();setVal('v-year','2021');setVal('v-make','Land Rover');setVal('v-model','Defender');setVal('v-vin',a);vinChanged();},DEF);
await p.waitForSelector('#vin-sheet',{timeout:4000}).catch(()=>{});
let s=await p.evaluate(()=>({t:(document.querySelector('#vin-sheet .vin-t')||{}).textContent,calls:window.__VPIC.calls.slice(),y:val('v-year')}));
ok(s.t==='VIN says 2022 Land Rover Defender 110 X-Dynamic. Update?','confirm sheet text: '+s.t);
ok(s.calls.length===1&&/DecodeVinValuesExtended\/SALEA7EU5N2100123\?format=json/.test(s.calls[0]),'one vPIC Extended call');
ok(s.y==='2021','nothing changed before the owner answers');
await p.screenshot({path:SC+'ch-07-vin-confirm-phone.png'});
await p.click('#vin-use');await w(200);
s=await p.evaluate(()=>({y:val('v-year'),mk:val('v-make'),md:val('v-model'),tr:val('v-trim'),msg:(document.getElementById('v-vin-msg')||{}).textContent,sheet:!!document.getElementById('vin-sheet')}));
ok(s.y==='2022'&&s.mk==='Land Rover'&&s.md==='Defender 110'&&s.tr==='X-Dynamic'&&!s.sheet,'Use VIN fills year/make/model/trim');
ok(/3\.0L 6-cyl Gasoline/.test(s.msg)&&/Sport Utility/.test(s.msg),'message shows engine and body class');
await p.evaluate(()=>{window.__MOCK_STATE__.fn.calls=[];saveVehicle();});await w(1500);
s=await p.evaluate(a=>{var v=getVehicles().filter(function(x){return x.vin===a;})[0]||{};var row=(window.__MOCK_STATE__.tables.vehicles||[]).filter(function(r){return r.id===v.id;})[0]||{};
  return {eng:v.engine,body:v.bodyClass,at:!!v.vinDecodedAt,rowEng:row.engine,rowBody:row.body_class,rowAt:!!row.vin_decoded_at,rowTrim:row.trim,est:window.__MOCK_STATE__.fn.calls.some(function(c){return c.name==='estimate-value'&&c.body&&c.body.vehicle_id===v.id;})};},DEF);
ok(s.eng==='3.0L 6-cyl Gasoline'&&/Sport Utility/.test(s.body)&&s.at,'saved car keeps engine, body class, decoded time');
ok(s.rowEng==='3.0L 6-cyl Gasoline'&&/Sport Utility/.test(s.rowBody)&&s.rowAt&&s.rowTrim==='X-Dynamic','columns synced (trim, engine, body_class, vin_decoded_at)');
ok(s.est,'value estimate runs for the decoded car');
await p.evaluate(()=>{closeModal&&closeModal();});

console.log('VIN add form: keep mine / empty / skips');
await p.evaluate(a=>{openAddVehicleModal();setVal('v-year','1989');setVal('v-make','BMW');setVal('v-model','M3 Sport Evo');setVal('v-vin',a);vinChanged();},BMW);
await p.waitForSelector('#vin-sheet',{timeout:4000}).catch(()=>{});
await p.click('#vin-keep');await w(200);
s=await p.evaluate(()=>({y:val('v-year'),md:val('v-model'),f:VIN.form}));
ok(s.y==='1989'&&s.md==='M3 Sport Evo'&&s.f&&s.f.o===null,'Keep mine leaves the entries alone and stores nothing from VIN');
await p.evaluate(a=>{openAddVehicleModal();setVal('v-vin',a);vinChanged();},TES);await w(1000);
s=await p.evaluate(()=>({sheet:!!document.getElementById('vin-sheet'),y:val('v-year'),mk:val('v-make'),md:val('v-model'),tr:val('v-trim')}));
ok(!s.sheet&&s.y==='2019'&&s.mk==='Tesla'&&s.md==='Model 3'&&s.tr==='Long Range','empty form fills silently, no sheet');
const n0=await p.evaluate(()=>window.__VPIC.calls.length);
await p.evaluate(a=>{openAddVehicleModal();setVal('v-vin',a.Y1980);vinChanged();setVal('v-vin','WBSBG930XLEY1234');vinChanged();},{Y1980});await w(900);
await p.evaluate(a=>{openAddVehicleModal();var c=document.getElementById('v-replica');if(c){c.checked=true;vrFormToggle();}setVal('v-vin',a);vinChanged();},DEF);await w(900);
ok(await p.evaluate(n=>window.__VPIC.calls.length===n,n0),'no lookup for pre-1981, short or replica VINs');
await p.evaluate(a=>{window.__VPIC.mode='fail';VIN.cache={};openAddVehicleModal();setVal('v-make','Tesla');setVal('v-vin',a);vinChanged();},TES);await w(1000);
s=await p.evaluate(()=>({mk:val('v-make'),y:val('v-year'),msg:(document.getElementById('v-vin-msg')||{}).textContent}));
ok(s.mk==='Tesla'&&s.y===''&&/did not answer/.test(s.msg),'vPIC failure: quiet message, fields kept');
await p.evaluate(()=>{window.__VPIC.mode='ok';closeModal&&closeModal();});

console.log('VIN existing cars: backfill + document scan');
s=await p.evaluate(async a=>{var list=getVehicles(),v=list.filter(function(x){return !x.vin&&canEditVehicle(x)&&!x.isReplica;})[0];
  v.vin=a.BMW;v.year='1990';v.make='BMW';v.model='M3';v.trim='';v.engine='';v.bodyClass='';v.vinDecodedAt='';setVehicles(list);
  window.__MOCK_STATE__.fn.calls=[];var c0=window.__VPIC.calls.length;var n=await vinBackfill();await new Promise(r=>setTimeout(r,2200));
  var u=byId(getVehicles(),v.id);return {n:n,sheet:!!document.getElementById('vin-sheet'),eng:u.engine,body:u.bodyClass,at:!!u.vinDecodedAt,trim:u.trim,
   est:window.__MOCK_STATE__.fn.calls.some(function(c){return c.name==='estimate-value'&&c.body&&c.body.vehicle_id===v.id;}),again:await vinBackfill(),id:v.id,calls:window.__VPIC.calls.length-c0};},{BMW});
ok(s.n>=1&&!s.sheet&&s.eng==='2.3L 4-cyl Gasoline'&&s.body==='Coupe'&&s.at,'pull-to-refresh backfill fills empty fields quietly');
ok(s.est,'backfill re-runs the estimate when something changed');
ok(s.again===0,'already-decoded cars are not looked up again');
ok(await p.evaluate(()=>/vinBackfill\(\)/.test(ptrRun?ptrRun.toString():'')).catch(()=>false)||await p.evaluate(()=>{var t=[].slice.call(document.scripts).map(function(x){return x.textContent;}).join('');return /reloadAll\(true\)\)\.then\(function\(\)\{return vinBackfill\(\)/.test(t);}),'pull-to-refresh calls vinBackfill before estimating');
s=await p.evaluate(async a=>{var t=vinApplyToVehicle(a.id,a.DEF,'ask','The document shows VIN '+a.DEF+': ');await new Promise(r=>setTimeout(r,500));
  var txt=(document.querySelector('#vin-sheet .vin-t')||{}).textContent;document.getElementById('vin-use').click();var r=await t;var u=byId(getVehicles(),a.id);return {txt:txt,r:r,make:u.make,vin:u.vin,model:u.model};},{id:s.id,DEF});
ok(/^The document shows VIN SALEA7EU5N2100123: 2022 Land Rover Defender 110 X-Dynamic\. Update\?$/.test(s.txt),'document-scan VIN asks with one sheet');
ok(s.r==='updated'&&s.make==='Land Rover'&&s.model==='Defender 110'&&s.vin===DEF,'Use VIN updates the existing car');
ok(await p.evaluate(()=>/vinApplyToVehicle\(_dv\.id,s\.vin,'ask'/.test([].slice.call(document.scripts).map(function(x){return x.textContent;}).join(''))),'scan-document result.vin hooked into the doc flow');
ok(await p.evaluate(()=>/data\.vin[^\n]*vinChanged\(\)/.test([].slice.call(document.scripts).map(function(x){return x.textContent;}).join(''))),'photo identify VIN goes through vinChanged (auto decode)');
await p.close();

console.log('VIN desktop');
p=await L.open({pre:PRE,w:1440,h:900});await L.login(p,'olivia@test.com');await w(500);
await p.evaluate(a=>{openAddVehicleModal();setVal('v-year','2021');setVal('v-make','Land Rover');setVal('v-model','Defender');setVal('v-vin',a);vinChanged();},DEF);
await p.waitForSelector('#vin-sheet',{timeout:4000}).catch(()=>{});
ok(await p.evaluate(()=>{var r=document.querySelector('#vin-sheet .vin-card').getBoundingClientRect();return r.width<=520&&r.top>100;}),'desktop: sheet centered');
await p.close();
await L.close();
console.log('VIN '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
