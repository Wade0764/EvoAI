// Health score (computed on device) + AI value estimate (estimate-value Edge Function mocked). No network, no keys.
const L=require('./lib.js');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/';
const V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012';
// v15: details sit behind a tap (collapsed <details>), so read textContent
const txt=(p,id)=>p.evaluate(i=>{var e=document.getElementById(i);return e.innerText+' '+e.textContent;},id);
const body=p=>p.evaluate(()=>document.body.innerText);
const est=p=>p.evaluate(()=>window.__MOCK_STATE__.fn.calls.filter(c=>c.name==='estimate-value'));
async function open(mode,who){
  const p=await L.open({pre:'window.__PRE_EST__="'+mode+'";'});
  await p.evaluate(()=>{});
  return p;
}
async function start(mode,email){
  const p=await L.open({pre:"try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}}catch(e){}"});
  await p.evaluate(m=>{window.__MOCK_STATE__.est.mode=m;},mode);
  await L.login(p,email||'olivia@test.com');await L.sleep(500);return p;
}
async function openVeh(p,id){await p.evaluate(i=>openVehicleDetail(i),id);await L.sleep(500);}
async function tap(p){await p.evaluate(()=>document.getElementById('val-refresh-btn').click());await L.sleep(1400);}
const shotVeh=async(p,name,sel)=>{await p.evaluate(s=>{var tc=document.getElementById('toast-container');if(tc)tc.style.display='none';var n=document.getElementById(s);if(n)n.scrollIntoView({block:'start'});},sel||'val-panel');await L.sleep(350);await p.screenshot({path:SC+name});};
(async()=>{
await L.launch();

console.log('HEALTH: computed on device');
let p=await start('missing');
const h=await p.evaluate(()=>{var o={};getVehicles().forEach(function(v){var h=healthInfo(v);o[v.id]=h&&{score:h.score,reasons:h.reasons,basis:h.basis,asOf:h.asOf};});return o;});
ok(h[V1]&&h[V1].score===90&&h[V1].reasons.length===2&&/No next service is scheduled/.test(h[V1].reasons[0]),'V1 (1 recent service on a 5-year-old car, reg+ins dates, nothing scheduled) = 100-6-4 = 90: '+JSON.stringify(h[V1]&&h[V1].score));
ok(h[V2]&&h[V2].score===56&&/no service history/i.test(h[V2].reasons.join(' ')),'V2 (no history, no dates) = 56: '+(h[V2]&&h[V2].score));
ok(/Based on 1 service record, 2 reminders and 0 documents\./.test(h[V1].basis),'sources line for V1: '+h[V1].basis);
ok(/^\d{4}-\d\d-\d\d$/.test(h[V1].asOf),'last-updated date present');
ok(await p.evaluate(()=>avgHealth(visibleVehicles()))===73,'collection average = mean of 90 and 56 = 73');
ok(/\b73\b/.test(await txt(p,'cp-avg-health')),'overview shows average health 73');
ok(!/Calculated by AI once connected/.test(await body(p)),'placeholder text gone from overview');
await openVeh(p,V1);
let t=await txt(p,'health-panel');
ok(/90 of 100/.test(t)&&/Strong/.test(t)&&/Updated/.test(t)&&/Based on 1 service record, 2 reminders and 0 documents/.test(t)&&/cannot be typed in/.test(t),'vehicle page health panel: score, reason, sources, updated, read-only');
ok(!/Calculated by AI once connected/.test(await body(p)),'placeholder gone from vehicle page');
ok(/Health\s*90 \/ 100/i.test((await txt(p,'vd-stats')).replace(/\n/g,' ')),'Health cell shows 90 / 100');
// refresh on change: overdue registration + a new service on V2
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.reminders.forEach(function(r){if(r.kind==='tag')r.due_date=new Date(Date.now()-5*864e5).toISOString().slice(0,10);});
  S.tables.service_records.push({id:'f1000000-0000-4000-a000-0000000000a2',vehicle_id:'d0000000-0000-4000-a000-000000000012',created_by:'b0000000-0000-4000-a000-000000000002',title:'Oil service',description:null,category:'maintenance',performed_on:new Date(Date.now()-10*864e5).toISOString().slice(0,10),mileage:41100,cost:200});});
await p.evaluate(()=>reloadAll(true));await L.sleep(900);
const h2=await p.evaluate(()=>{var o={};getVehicles().forEach(function(v){var h=healthInfo(v);o[v.id]=h&&{score:h.score,reasons:h.reasons};});return o;});
ok(h2[V1].score===75&&/overdue/.test(h2[V1].reasons.join(' ')),'overdue registration lowers V1 by 15 -> 75: '+h2[V1].score);
ok(h2[V2].score===56+25-4&&!/no service history/i.test(h2[V2].reasons.join(' ')),'adding a service record to V2 removes the no-history penalty (one record on a 59-year-old car -4) -> 77: '+h2[V2].score);
ok(await p.evaluate(()=>{var s=JSON.parse(localStorage.getItem('evoai_health_v1'));return Object.keys(s).length>=2&&Object.keys(s).every(k=>/^[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(k));}),'snapshot stored per account+vehicle');
// never user-entered
await p.evaluate(()=>openAddVehicleModal());await L.sleep(300);
ok(await p.evaluate(()=>{var ids=[].map.call(document.querySelectorAll('#modal-add-vehicle input,#modal-add-vehicle select,#modal-add-vehicle textarea'),e=>e.id);return !ids.some(i=>/health|ai-?value|est/i.test(i))&&ids.indexOf('v-current-value')<0;}),'Add vehicle has no value/health input');
ok(/read-only and can never be typed in/.test(await p.evaluate(()=>document.getElementById('modal-add-vehicle').textContent)),'form explains value/health are read-only');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));await p.close();

console.log('VALUE: not turned on yet (Google free tier 429 -> function 503 not_enabled)');
p=await start('g429');
ok((await est(p)).length===1&&(await est(p))[0].body.probe===true,'one free probe call after login, no vehicle sent');
ok(/No value estimates yet/.test(await txt(p,'cp-total-value')),'probe says deployed, so overview starts neutral');
await openVeh(p,V1);
ok(/No estimate yet/.test(await txt(p,'val-panel'))&&/Get estimate/.test(await txt(p,'val-panel')),'before any answer: neutral "No estimate yet" + Get estimate');
await tap(p);
t=await txt(p,'val-panel');
ok(/Value estimates are not turned on yet/.test(t)&&!/\$\d/.test(t),'after Google 429: vehicle panel shows clear not-turned-on state, no fake numbers');
ok(/Value estimates are not turned on yet/.test(await txt(p,'vd-value')),'vehicle header shows the same state');
ok(/Health score/i.test(await txt(p,'health-panel'))&&/\d+ of 100/.test(await txt(p,'health-panel')),'health score still works when value is off');
await p.evaluate(()=>{var m=document.getElementById('vd-title');if(m)m.scrollIntoView({block:'start'});});await L.sleep(300);await p.screenshot({path:SC+'32-vehicle-value-not-turned-on-390x844.png'});
await shotVeh(p,'32-vehicle-value-panel-not-turned-on-390x844.png','val-panel');
await p.evaluate(()=>closeModal('modal-vehicle-detail'));await L.sleep(300);
ok(/Value estimates are not turned on yet/.test(await txt(p,'cp-total-value')),'overview collection value shows not-turned-on state (not $0)');
ok(!/\$0\b/.test(await txt(p,'cp-total-value')),'no misleading $0');
const calls=await est(p);
ok(calls[1]&&calls[1].body.vehicle_id===V1&&Object.keys(calls[1].body).join()==='vehicle_id','refresh sends only the vehicle id (never a value)');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));
await p.evaluate(()=>{document.querySelector('.main').scrollTop=0;});
await p.screenshot({path:SC+'33-overview-not-turned-on-390x844.png'});
await p.evaluate(()=>reloadAll(true));await L.sleep(500);
ok(/Value estimates are not turned on yet/.test(await txt(p,'cp-total-value')),'state survives a data reload');
await p.close();
p=await start('off');
ok(/Value estimates are not turned on yet/.test(await txt(p,'cp-total-value')),'503 not_configured on probe -> not turned on yet at once');
await p.close();

console.log('VALUE: function not deployed (404) shown at login via probe');
p=await start('missing');
ok(/Value estimates are not turned on yet/.test(await txt(p,'cp-total-value')),'404 probe -> not turned on yet on the overview');
ok(p.errors.length===0,'no page errors');await p.close();

console.log('VALUE: estimates on');
p=await start('ok');
ok(/No value estimates yet/.test(await txt(p,'cp-total-value')),'before first estimate: "No value estimates yet"');
await openVeh(p,V1);await tap(p);
t=await txt(p,'val-panel');
ok(/\$102,500 estimated/.test(t)&&/range \$93,500 to \$113,500/.test(t),'V1 mid + range shown: '+t.slice(0,160).replace(/\n/g,' '));
ok(/As of/.test(t)&&/Sources:/.test(t)&&/bringatrailer\.com/.test(t),'as-of date and sources listed');
ok(await p.evaluate(()=>{var a=[].slice.call(document.querySelectorAll('#val-panel a'));return a.length===2&&a.every(x=>/^https:\/\//.test(x.href)&&x.rel.indexOf('noopener')>=0&&x.target==='_blank');}),'sources are https links with noopener');
ok(/estimate/i.test(await txt(p,'vd-value'))&&/estimated value/i.test(await txt(p,'vd-value'))&&/\$102,500/.test(await txt(p,'vd-value')),'header says Estimated value + Estimate chip + number');
ok(await p.evaluate(()=>document.getElementById('val-refresh-btn').disabled)&&/once a day/.test(await txt(p,'val-panel')),'Refresh limited to once per vehicle per day (button disabled after use)');
ok(/90 of 100/.test(await txt(p,'health-panel')),'health panel still there beside the value');
await p.evaluate(()=>{var m=document.getElementById('vd-title');if(m)m.scrollIntoView({block:'start'});});await L.sleep(300);await p.screenshot({path:SC+'31-vehicle-value-header-390x844.png'});
await shotVeh(p,'31-vehicle-value-health-390x844.png','val-panel');await shotVeh(p,'31-vehicle-health-panel-390x844.png','health-panel');
// second estimate for same vehicle -> delta
await p.evaluate(()=>{var u=getUI();delete u.valRef;localStorage.setItem('evoai_ui',JSON.stringify(u));});
await p.evaluate(()=>refreshCurrent());await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(400);
await tap(p);
t=await txt(p,'val-panel');
ok(/\+\$2,500 since/.test(t)&&/\$105,000 estimated/.test(t),'delta since last estimate: +$2,500');
await p.evaluate(()=>closeModal('modal-vehicle-detail'));await L.sleep(300);
// second vehicle
await openVeh(p,V2);await tap(p);await p.evaluate(()=>closeModal('modal-vehicle-detail'));await L.sleep(500);
const ov=await txt(p,'cp-total-value');
ok(/\$212,500/.test(ov.replace(/\n/g,'')),'collection value = sum of mids (105,000 + 107,500): '+ov.replace(/\n/g,' '));
const dl=await txt(p,'cp-delta');
ok(/estimate/i.test(dl)&&/range \$194,500 to \$234,500/.test(dl),'collection range = sum of lows to sum of highs: '+dl.replace(/\n/g,' '));
ok(/\+\$2,500 since the last estimate/.test(dl),'collection delta since last');
ok(!/Calculated by AI once connected/.test(await body(p)),'placeholder gone everywhere');
await p.evaluate(()=>{document.querySelector('.main').scrollTop=0;});await p.screenshot({path:SC+'30-overview-value-390x844.png'});
await p.evaluate(()=>showPage('valuations'));await L.sleep(400);
ok(/Estimate, as of/.test(await body(p)),'valuations table labels Estimate + as-of');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));await p.close();

console.log('VALUE: never invent / sanitise sources');
p=await start('ok');
await p.evaluate(()=>{window.__MOCK_STATE__.tables.ai_estimates=[{id:'ae-x',vehicle_id:'d0000000-0000-4000-a000-000000000011',kind:'value',value_low:90000,value_mid:100000,value_high:110000,confidence:0.5,sources:[{title:'bad',url:'javascript:alert(1)'},{title:'<img src=x onerror=alert(1)>',url:'https://example.com/ok'}],notes:'n',as_of:new Date().toISOString()}];});
await p.evaluate(()=>reloadAll(true));await L.sleep(800);await openVeh(p,V1);
ok(await p.evaluate(()=>document.querySelectorAll('#val-panel a').length===1&&document.querySelectorAll('#val-panel img').length===0&&document.getElementById('val-panel').innerHTML.indexOf('href="javascript')<0),'javascript: url not linked, HTML in titles escaped');
await p.close();

console.log('VALUE: error states do not break the page');
for(const [mode,re,label] of [['ratelimit',/Daily estimate limit reached/,'per-user daily limit (429)'],['refreshlimit',/already refreshed today/,'once a day per vehicle (429)'],['e502',/Could not get an estimate right now.*provider_timeout/,'provider timeout (502)'],['noprice',/No reliable market prices/,'no prices found'],['network',/Could not reach the estimate service|not turned on/,'network error'],['e403',/not shared value estimates with you/,'403']]){
  p=await start(mode==='network'?'ok':mode);
  if(mode==='network')await p.evaluate(()=>{window.__MOCK_STATE__.est.mode='network';});
  await openVeh(p,V1);
  const had=await p.evaluate(()=>!!document.getElementById('val-refresh-btn'));
  if(had)await tap(p);
  t=await txt(p,'val-panel');
  ok(re.test(t)&&p.errors.length===0,label+' -> friendly message, no page error');
  await p.close();
}

console.log('VALUE: permissions (tech)');
p=await start('ok','tom@test.com');
ok((await est(p)).length===0,'tech without value permission: probe not even called');
await openVeh(p,V1);
t=await txt(p,'val-panel');
ok(/not shared with you/.test(t)&&!(await p.evaluate(()=>!!document.getElementById('val-refresh-btn'))),'no value shown and no Refresh button without permission');
ok(/not shared the health score with you/.test(await txt(p,'health-panel')),'health hidden when owner has not shared it');
ok(/\bnot shared with you\b/i.test(await txt(p,'vd-value')),'header says not shared');
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.my_tech_visibility.forEach(function(r){r.can_view_value_estimate=true;r.can_view_health_estimate=true;});
  S.tables.ai_estimates=[{id:'ae-t',vehicle_id:'d0000000-0000-4000-a000-000000000011',kind:'value',value_low:90000,value_mid:100000,value_high:110000,confidence:0.6,sources:[{title:'hagerty.com',url:'https://example.com/h'}],notes:'n',as_of:new Date().toISOString()}];});
await p.evaluate(()=>reloadAll(true));await L.sleep(800);await openVeh(p,V1);
ok(/\$100,000 estimated/.test(await txt(p,'val-panel'))&&!!(await p.evaluate(()=>document.getElementById('val-refresh-btn'))),'tech WITH value permission sees estimate and Refresh');
ok(/\d+ of 100/.test(await txt(p,'health-panel')),'tech WITH health permission sees score');
await p.close();

await L.close();
console.log('\nVALUE/HEALTH: PASS '+pass+'  FAIL '+fail);
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
