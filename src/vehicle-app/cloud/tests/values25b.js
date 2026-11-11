// v25b: automatic first values (queue + progress), Refresh values now, missing data, review flags, honest trends. Mocked backend.
const L=require('./lib.js');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002';
const V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012';
const V3='d0000000-0000-4000-a000-000000000013',V4='d0000000-0000-4000-a000-000000000014',V5='d0000000-0000-4000-a000-000000000015';
const PRE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,t='2026-02-01T00:00:00Z';S.est.delay=250;
 S.tables.vehicles.push({id:'${V3}',owner_id:'${O}',year:1961,make:'Fiat',model:'500',color:null,nickname:null,vin:null,mileage:null,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V4}',owner_id:'${O}',year:1961,make:'Fiat',model:'Jolly',color:'Pink',nickname:null,vin:'229451',mileage:8200,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V5}',owner_id:'${O}',year:null,make:'Ford',model:'',color:'Gold',nickname:'Gold',vin:null,mileage:null,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'});
 function E(id,vid,d,mid,key,rv){return {id:id,vehicle_id:vid,kind:'value',value_low:mid-5000,value_mid:mid,value_high:mid+5000,currency:'USD',confidence:0.7,sources:[],notes:'n',model_version:'m',cache_key:key,inputs:rv?{review:rv}:{},as_of:d+'T09:00:00Z',created_at:d+'T09:00:00Z'};}
 var old=new Date(Date.now()-20*864e5).toISOString().slice(0,10);
 S.tables.ai_estimates=[
  // V1 "Black Betty": 780k then 100k on the same basis = a -87% jump, never a market move
  E('x1','${V1}','2026-06-01',780000,'k1'),E('x2','${V1}','2026-07-01',101000,'k1'),E('x3','${V1}',old,100000,'k1'),
  // V2: valued as an original, later as a replica (new basis) + a newer flagged estimate
  E('y1','${V2}','2026-05-01',900000,'1965|shelby|cobra|'),E('y2','${V2}','2026-07-01',120000,'replica|superformance|1965|shelby|cobra|'),E('y3','${V2}',old,126000,'replica|superformance|1965|shelby|cobra|'),
  E('y4','${V2}',new Date(Date.now()-864e5).toISOString().slice(0,10),40000,'replica|superformance|1965|shelby|cobra|',['changed -68% from the previous estimate'])];
})();`;
const st=p=>p.evaluate(()=>window.__MOCK_STATE__.est.reasons||[]);
(async()=>{
await L.launch();
let p=await L.open({pre:PRE,vq:true});
await L.login(p,'olivia@test.com');
// progress shows while the first values run
let seen='';for(let i=0;i<40&&!/Valuing \d of \d/.test(seen);i++){await L.sleep(150);seen=await p.evaluate(()=>{var g=document.getElementById('vq-toast');return g?g.textContent:'';});}
ok(/Valuing \d of 2\u2026/.test(seen),'progress "Valuing x of 2..." shows ('+seen+')');
for(let i=0;i<60;i++){await L.sleep(250);if(await p.evaluate(()=>!VQ.run&&!VQ.q.length&&VQ.total>0))break;}
let r=await st(p);
ok(r.filter(x=>x==='first').length===2,'pending cars (no value, year/make/model on file) get a first value automatically: '+JSON.stringify(r));
ok(await p.evaluate(ids=>ids.every(id=>{var v=byId(getVehicles(),id);return v.aiValue&&v.aiValue.value>0;}),[V3,V4]),'both now have a value');
ok(/Values updated for 2 of 2/.test(await p.evaluate(()=>VQ.msg)),'finish message');
ok(r.indexOf('user')<0,'not counted as user refreshes (5/day limit untouched)');
// incomplete car is reported with exactly what is missing, and never sent
let panel=await p.evaluate(()=>{var e=document.querySelector('.vq');return e?e.innerText:'';});
ok(/Can't be valued yet:.*Gold.*add the year and model/.test(panel.replace(/\n/g,' ')),'missing data shown: '+panel.split('\n')[0].slice(0,120));
ok(await p.evaluate(()=>/\d+ cars? (is|are) valued at typical mileage/.test(document.querySelector('.vq').innerText)),'cars without mileage are called out');
// trend: -87% jump is not a trend; flagged for review
let brief=await p.evaluate(()=>document.querySelector('.brief').innerText);
ok(!/-87/.test(brief)&&!/\$620,700|\$880,000|\$1,680,000/.test(brief),'brief no longer reports the -87% / basis-change drop');
ok(/Needs review:.*value jumped -87(\.\d)?% .*not counted in the trend/.test(panel.replace(/\n/g,' ')),'jump listed under Needs review');
let vp=await p.evaluate(id=>valuePoints(byId(getVehicles(),id)).map(x=>x.value),V1);
ok(JSON.stringify(vp)==='[101000,100000]','V1 trend restarts after the jump '+JSON.stringify(vp));
let v2=await p.evaluate(id=>{var v=byId(getVehicles(),id);return {pts:valuePoints(v).map(x=>x.value),val:v.aiValue.value,rev:v.aiReview};},V2);
ok(JSON.stringify(v2.pts)==='[120000,126000]','V2: original-car values dropped after the replica basis change '+JSON.stringify(v2.pts));
ok(v2.val===126000&&v2.rev&&v2.rev.value===40000,'V2: flagged estimate is not shown as the value, kept for review');
ok(/Needs review:.*changed -68%/.test(panel.replace(/\n/g,' ')),'flag reason shown');
// reload: nothing re-queued (all valued or tried)
await p.goto(p.url(),{waitUntil:'load'});await L.sleep(400);await L.login(p,'olivia@test.com');await L.sleep(2500);
ok((await st(p)).filter(x=>x==='first').length<=2,'no repeat first values for cars already tried');
// Refresh values now (owner): once a day, skips fresh cars
ok(await p.evaluate(()=>!!document.querySelector('.vq-btn')&&document.querySelector('.vq-btn').textContent==='Refresh values now'),'owner sees Refresh values now');
await p.evaluate(()=>document.querySelector('.vq-btn').click());
for(let i=0;i<60;i++){await L.sleep(250);if(await p.evaluate(()=>!VQ.run&&!VQ.q.length&&VQ.msg&&!/Valuing/.test(VQ.msg)))break;}
r=await st(p);
ok(r.indexOf('collection_start')>=0,'starts a collection run');
const nCol=r.filter(x=>x==='collection').length;
ok(nCol>=2,'cars older than 7 days are re-valued with reason collection ('+nCol+')');
ok(await p.evaluate(()=>document.querySelector('.vq-btn').disabled&&document.querySelector('.vq-btn').textContent==='Values refreshed today'),'button disabled for the rest of the day');
let s2=await p.evaluate(()=>{var b=[];document.querySelectorAll('.vq, .vq *, #vq-toast').forEach(function(e){var own=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});if(!own)return;var cs=getComputedStyle(e);var m=cs.color.match(/\d+/g).map(Number);if(parseFloat(cs.fontSize)<15||(Math.abs(m[0]-m[1])<6&&Math.abs(m[1]-m[2])<6&&m[0]>40&&m[0]<200))b.push(e.className+':'+cs.fontSize+':'+cs.color);});return b;});
ok(s2.length===0,'panel text >= 15px, no grey '+s2.join(','));
// single add: a brand-new car is queued as a first value
const nFirst0=(await st(p)).filter(x=>x==='first').length;
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.vehicles.push({id:'d0000000-0000-4000-a000-0000000000a1',owner_id:'b0000000-0000-4000-a000-000000000002',year:1972,make:'Porsche',model:'911 T',archived:false,notes:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:'b0000000-0000-4000-a000-000000000002'});});
await p.evaluate(()=>reloadAll(true).then(function(){valueAutoQueue('d0000000-0000-4000-a000-0000000000a1',0);}));
for(let i=0;i<40;i++){await L.sleep(250);if(await p.evaluate(()=>{var v=byId(getVehicles(),'d0000000-0000-4000-a000-0000000000a1');return !!(v&&v.aiValue);}))break;}
ok(await p.evaluate(()=>{var v=byId(getVehicles(),'d0000000-0000-4000-a000-0000000000a1');return !!(v&&v.aiValue&&v.aiValue.value>0);}),'single add is valued right away');
ok((await st(p)).filter(x=>x==='first').length===nFirst0+1,'single add used reason first');
// monthly cap: the queue stops and says why
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.est.mode='cap';S.tables.vehicles.push({id:'d0000000-0000-4000-a000-0000000000a2',owner_id:'b0000000-0000-4000-a000-000000000002',year:1980,make:'BMW',model:'M1',archived:false,notes:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:'b0000000-0000-4000-a000-000000000002'},{id:'d0000000-0000-4000-a000-0000000000a3',owner_id:'b0000000-0000-4000-a000-000000000002',year:1981,make:'DeLorean',model:'DMC-12',archived:false,notes:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:'b0000000-0000-4000-a000-000000000002'});return reloadAll(true);});
for(let i=0;i<40;i++){await L.sleep(250);if(await p.evaluate(()=>/budget is used up/.test(VQ.msg)))break;}
ok(await p.evaluate(()=>/budget is used up/.test(VQ.msg)),'monthly cap stops the queue with a plain message');
await L.close();
console.log('values25b: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
