// Auto-identify (photo -> fields) with the Edge Function mocked. No network, no keys.
const L=require('./lib.js'),path=require('path');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/',FIX=path.join(__dirname,'fixture.jpg');
const g=(p,id)=>p.evaluate(i=>document.getElementById(i).value,id);
const note=p=>p.evaluate(()=>document.getElementById('v-autonote').innerText);
const tags=p=>p.evaluate(()=>[].map.call(document.querySelectorAll('#modal-add-vehicle .ai-tag'),t=>t.getAttribute('data-for')));
async function openForm(mode,delay){
  const p=await L.open();await L.login(p,'olivia@test.com');
  await p.evaluate(()=>{try{Object.keys(localStorage).forEach(function(k){if(k.indexOf('evo_draft_')===0)localStorage.removeItem(k);});}catch(e){}}); // v27: each case starts without a saved form draft
  await p.evaluate((m,d)=>{window.__MOCK_STATE__.fn.mode=m;window.__MOCK_STATE__.fn.delay=d||60;},mode,delay);
  await p.evaluate(()=>openAddVehicleModal());await L.sleep(300);return p;
}
async function pick(p){const i=await p.$('#v-img-input');await i.uploadFile(FIX);}
const shot=async(p,name)=>{await p.evaluate(()=>{var tc=document.getElementById('toast-container');if(tc)tc.style.display='none';var m=document.querySelector('#modal-add-vehicle .modal');var n=document.getElementById('v-autonote');if(m&&n)m.scrollTop=n.getBoundingClientRect().top-m.getBoundingClientRect().top+m.scrollTop-150;});await L.sleep(250);await p.screenshot({path:SC+name});};
(async()=>{
await L.launch();
console.log('IDENTIFY: success');
let p=await openForm('ok',2500);
ok(/fill in for you/.test(await note(p)),'idle note replaces the old "once connected" wording');
ok(!/once connected/.test(await note(p)),'old wording gone');
await pick(p);await L.sleep(900);
ok(/Identifying your vehicle\.\.\./.test(await note(p)),'loading state text');
await shot(p,'12-identify-loading-390x844.png');
await L.sleep(2600);
ok(await g(p,'v-year')==='1996'&&await g(p,'v-make')==='Porsche'&&await g(p,'v-model')==='911 Carrera'&&await g(p,'v-color')==='Guards Red','year/make/model/color filled');
ok((await tags(p)).join()==='v-year,v-make,v-model,v-color','AI suggested tags on filled fields only');
ok(/AI suggested - tap any field to edit/.test(await note(p))&&/Medium \(62%\)/.test(await note(p)),'confidence shown in note');
ok(/AI suggested - tap to edit/.test(await p.evaluate(()=>document.querySelector('.ai-tag').innerText)),'field tag wording');
await shot(p,'13-identify-filled-390x844.png');
await p.evaluate(()=>{var e=document.getElementById('v-make');e.value='Porsche AG';e.dispatchEvent(new Event('input'));});
ok(!(await tags(p)).includes('v-make')&&(await tags(p)).includes('v-year'),'editing a field removes only its tag');
const calls=await p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(c=>c.name==='identify-vehicle'));
ok(calls.length===1&&calls[0].name==='identify-vehicle'&&calls[0].body.mime==='image/jpeg'&&calls[0].body.image_base64.length>100&&calls[0].body.image_base64.indexOf('data:')!==0,'invoked once with raw base64 (no data: prefix)');
await p.evaluate(()=>{var s=document.getElementById('v-client');if(s&&!s.value&&s.options.length>1)s.selectedIndex=1;});
await p.evaluate(()=>saveVehicle());await L.sleep(1800);
const s=await L.state(p);
ok((s.tables.vehicles||[]).some(v=>v.make==='Porsche AG'&&v.year===1996&&v.model==='911 Carrera'),'Save works with the AI-filled + edited values');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));await p.close();

console.log('IDENTIFY: does not overwrite typed values');
p=await openForm('ok');
await p.evaluate(()=>{var e=document.getElementById('v-make');e.value='Ferrari';});
await pick(p);await L.sleep(900);
ok(await g(p,'v-make')==='Ferrari'&&await g(p,'v-year')==='1996','typed make kept, empty fields filled');
ok(!(await tags(p)).includes('v-make'),'no AI tag on a field the user typed');
await p.close();

console.log('IDENTIFY: VIN typed -> sent along');
p=await openForm('vin');
await p.evaluate(()=>{var e=document.getElementById('v-vin');e.value='WP0AA2991SS320000';e.dispatchEvent(new Event('input'));});
await pick(p);await L.sleep(900);
const c2=await p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(c=>c.name==='identify-vehicle'));
ok(c2[0]&&c2[0].body.vin==='WP0AA2991SS320000','valid 17-char VIN is sent for an exact decode');
await p.close();

console.log('IDENTIFY: fallbacks');
for(const [mode,label,re] of [['missing','not deployed (404)',/Auto-identify is not turned on yet - enter details manually \(code: 404\)/],['nokey','key missing (503)',/Auto-identify is not turned on yet - enter details manually \(code: 503\)/],['network','network error',/Could not reach auto-identify .*\(code: net\)/],['e502','provider 404 via function',/Could not identify this photo - enter details manually \(code: provider_404\)/],['e401','expired session',/sign-in has expired.*\(code: 401\)/],['e413','photo too large',/too large.*\(code: 413\)/],['parse','non-JSON reply',/\(code: parse\)/],['fail','server error (500)',/Could not identify this photo - enter details manually \(code: 500\)/],['ratelimit','daily limit (429)',/Daily auto-identify limit reached/],['unsure','no vehicle found',/Could not tell what this is/]]){
  p=await openForm(mode);await pick(p);await L.sleep(900);
  ok(re.test(await note(p)),label+' -> friendly message');
  ok(await g(p,'v-make')===''&&(await tags(p)).length===0,label+' -> fields untouched');
  if(mode==='missing'){
    await shot(p,'14-identify-fallback-390x844.png');
    await p.evaluate(()=>{['v-year','v-make','v-model'].forEach(function(i,k){document.getElementById(i).value=['2001','Honda','S2000'][k];});var s=document.getElementById('v-client');if(s&&!s.value&&s.options.length>1)s.selectedIndex=1;});
    await p.evaluate(()=>saveVehicle());await L.sleep(1500);
    const s2=await L.state(p);ok((s2.tables.vehicles||[]).some(v=>v.make==='Honda'&&v.year===2001),'manual Save still works after fallback');
    await p.evaluate(()=>openAddVehicleModal());await L.sleep(300);
    ok(/not turned on yet/.test(await note(p)),'off state remembered for the session (no repeat calls on open)');
  }
  ok(p.errors.length===0,label+' no page errors '+JSON.stringify(p.errors));await p.close();
}
console.log('IDENTIFY: stale result ignored after photo removed');
p=await openForm('ok',1200);await pick(p);await L.sleep(300);
await p.evaluate(()=>clearVehicleImage());await L.sleep(1600);
ok(await g(p,'v-make')===''&&/fill in for you/.test(await note(p)),'late response ignored after Remove Photo');
await p.close();
console.log('\nIDENTIFY PASS '+pass+'  FAIL '+fail);
await L.close();process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
