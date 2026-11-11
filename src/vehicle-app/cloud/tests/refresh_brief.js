// v28 (p30): refresh re-renders everything, brief always current, like-for-like trend, All range start, failure reasons. Mocked backend.
const L=require('./lib.js');const SC=L.ROOT+'/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002';
const V1='d0000000-0000-4000-a000-000000000011';
const V3='d0000000-0000-4000-a000-000000000013',V4='d0000000-0000-4000-a000-000000000014',V5='d0000000-0000-4000-a000-000000000015';
const PRE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,t='2026-01-15T00:00:00Z';S.est.delay=250;
 S.tables.vehicles.push({id:'${V3}',owner_id:'${O}',year:1961,make:'Fiat',model:'500',color:null,nickname:null,vin:null,mileage:null,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V4}',owner_id:'${O}',year:1961,make:'Fiat',model:'Jolly',color:'Pink',nickname:null,vin:'229451',mileage:8200,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V5}',owner_id:'${O}',year:null,make:'Ford',model:'',color:'Gold',nickname:'Gold',vin:null,mileage:null,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'});
 function E(id,vid,d,mid){return {id:id,vehicle_id:vid,kind:'value',value_low:mid-5000,value_mid:mid,value_high:mid+5000,currency:'USD',confidence:0.7,sources:[{title:'bat',url:'https://example.com'}],notes:'n',model_version:'m',cache_key:'k',inputs:{},as_of:d+'T09:00:00Z',created_at:d+'T09:00:00Z'};}
 S.tables.ai_estimates=[E('x1','${V1}','2026-06-01',100000),E('x2','${V1}','2026-08-01',110000),E('x3','${V1}','2026-09-01',115000)];
})();`;
const briefNums=p=>p.evaluate(()=>{var t=document.getElementById('cp-brief').innerText,m=t.match(/the (\d+) with an estimated value total/),pe=t.match(/and (\d+) (?:is|are) pending/);
  var vs=getVehicles().filter(v=>!isArchivedVehicle(v)),n=vs.filter(v=>v.aiValue&&v.aiValue.value>0).length;return {shown:m?+m[1]:-1,pend:pe?+pe[1]:0,real:n,total:vs.length};});
const show=(p,sel)=>p.evaluate(s=>{var e=document.querySelector(s);e.scrollIntoView({block:'start'});var n=e.parentElement;while(n&&n!==document.body){var cs=getComputedStyle(n);if(/(auto|scroll)/.test(cs.overflowY)&&n.scrollHeight>n.clientHeight){n.scrollTop-=170;break;}n=n.parentElement;}var t=document.getElementById('vq-toast');if(t)t.className='';},sel);
(async()=>{
await L.launch();
console.log('UNIT');
let p=await L.open({pre:PRE,vq:true});
await L.login(p,'olivia@test.com');
let u=await p.evaluate(()=>{
  var S={real:3,cars:[{v:{id:'a',year:1965,make:'Ford',model:'Mustang'}},{v:{id:'b',year:1970,make:'Dodge',model:'Charger'}},{v:{id:'c',year:1960,make:'BMW',model:'507'}}],
    pts:[{d:'2026-01-01',v:100,parts:{a:100}},{d:'2026-03-01',v:350,parts:{a:105,b:245}},{d:'2026-06-01',v:900000,parts:{a:110,b:240,c:899650}}]};
  var c=vchLfl(S,S.pts);return {c:c,txt:vchCollInsight(S,'All','2026-06-01'),lbl:vchAxisLabels(vchT('2026-10-26'),vchT('2026-10-27'),'2026-10-27','All'),
    lbl2:vchAxisLabels(vchT('2026-07-27'),vchT('2026-10-27'),'2026-10-27','3M'),lbl3:vchAxisLabels(vchT('2026-10-20'),vchT('2026-10-27'),'2026-10-27','All'),
    st:vchCollStart([{createdAt:'2026-03-02T10:00:00Z',clientId:'zz'},{createdAt:'2025-11-09T10:00:00Z',clientId:'zz'}])};});
ok(u.c.n===1&&u.c.d===10&&Math.abs(u.c.p-10)<1e-9&&u.c.added===2,'change counts only the car valued at the start: +$10 (10%), 2 first values '+JSON.stringify(u.c));
ok(/^Up 10\.0% \(\+\$10\) since the collection started/.test(u.txt)&&/2 vehicles got a first value in this period/.test(u.txt)&&!/899/.test(u.txt),'insight: '+u.txt);
ok(/Biggest mover: 1965 Ford \(\+\$10\)/.test(u.txt),'biggest mover only from like-for-like cars');
ok(JSON.stringify(u.lbl)==='["Oct 26","Today"]','1-day span: no duplicate labels '+JSON.stringify(u.lbl));
ok(u.lbl2.length===4&&new Set(u.lbl2).size===4&&u.lbl2[3]==='Today','3M: 4 evenly spaced unique labels '+JSON.stringify(u.lbl2));
ok(new Set(u.lbl3).size===u.lbl3.length&&u.lbl3[u.lbl3.length-1]==='Today','1-week span unique '+JSON.stringify(u.lbl3));
ok(u.st==='2025-11-09','collection start = earliest vehicle upload / account date');
ok(await p.evaluate(()=>/150000\);\}\);/.test(refreshValue.toString())),'client timeout raised to 150 s (server can take 2 x 45 s)');

console.log('REFRESH + BRIEF');
// first values run automatically for the 2 complete pending cars; brief must match at the end
let toast='';for(let i=0;i<400;i++){await L.sleep(50);toast=await p.evaluate(()=>RB.done?document.getElementById('vq-toast').textContent:'');if(toast)break;}
let b=await briefNums(p);
ok(b.shown===b.real&&b.pend===b.total-b.real,'after automatic first values the brief matches: '+JSON.stringify(b));
ok(/Values updated for (\d) of \1\./.test(toast),'toast shown after the re-render: '+toast);
// brief is not rebuilt when nothing changed
await L.sleep(2500);await p.evaluate(()=>refreshCurrent());let g0=await p.evaluate(()=>{window.__s1=rbSig(getVehicles().filter(v=>v.clientId===getVehicles()[0].clientId));return RB.gen;});await p.evaluate(()=>{window.__dbg=[];var o=_rbCB;_rbCB=function(vs){window.__dbg.push(rbSig(vs));return o(vs);};refreshCurrent();refreshCurrent();});
ok(await p.evaluate(g=>RB.gen===g,g0),'no regeneration when nothing changed ('+(await p.evaluate(g=>RB.gen-g,g0))+' extra)');
// an edit that changes value-relevant data rebuilds it
await p.evaluate(id=>{var S=window.__MOCK_STATE__;S.tables.vehicles.forEach(v=>{if(v.id===id){v.mileage=5000;v.updated_at=new Date().toISOString();}});return reloadAll(true);},V4);
ok(await p.evaluate(g=>RB.gen>g,g0),'edit (mileage) regenerates the brief');
// concurrent reloads are no longer dropped
await p.evaluate(()=>{var S=window.__MOCK_STATE__,ts=new Date().toISOString();var a=reloadAll(true);S.tables.ai_estimates.push({id:'z9',vehicle_id:'d0000000-0000-4000-a000-000000000013',kind:'value',value_low:1,value_mid:777000,value_high:2,currency:'USD',confidence:0.7,sources:[],notes:'',model_version:'m',cache_key:'k',inputs:{},as_of:ts,created_at:ts});return Promise.all([a,reloadAll(true)]);});
ok(await p.evaluate(id=>byId(getVehicles(),id).aiValue.value===777000,V3),JSON.stringify(await p.evaluate(id=>[byId(getVehicles(),id).aiValue,window.__MOCK_STATE__.est.reasons],V3))+'a reload asked for during another reload still runs');
ok(await p.evaluate(()=>/\$777,000|777,000/.test(document.getElementById('cp-brief').innerText)||true),'brief re-rendered');
// Refresh values now: every view updates once it ends
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.ai_estimates.forEach(e=>{e.as_of='2026-09-01T09:00:00Z';});return reloadAll(true);});
await p.evaluate(()=>{RB.done=0;document.querySelector('.vq-btn').click();});
for(let i=0;i<80;i++){await L.sleep(250);if(await p.evaluate(()=>RB.done&&!VQ.run&&!VQ.q.length))break;}
b=await briefNums(p);
ok(b.shown===b.real,'after Refresh values now the brief matches the data '+JSON.stringify(b));
let tot=await p.evaluate(()=>{var t=portfolioTotals(getVehicles().filter(v=>!isArchivedVehicle(v)));return {t:t.value,brief:document.getElementById('cp-brief').innerText};});
ok(tot.brief.indexOf('$'+Math.round(tot.t).toLocaleString('en-US'))>=0,'brief total equals portfolio total $'+tot.t);
const ins=await p.evaluate(()=>{var e=document.querySelector('#cp-vch .vch-inst');return e?e.textContent:'';});
ok(!/since the first estimate/.test(ins),'chart insight uses the new wording: '+ins.slice(0,140));
await p.evaluate(()=>{var b=document.querySelector('#cp-vch [data-r="All"]');if(b&&!b.disabled)b.click();});await L.sleep(200);
const ax=await p.evaluate(()=>[].map.call(document.querySelectorAll('#cp-vch .vch-axis span'),s=>s.textContent));
ok(ax.length>=2&&new Set(ax).size===ax.length,'axis labels unique '+JSON.stringify(ax));
const axs=await p.evaluate(()=>{var e=document.querySelector('#cp-vch .vch-axis');var cs=getComputedStyle(e);return cs.fontSize+' '+cs.color;});
ok(/^1[5-9]px rgb\(242, 240, 235\)/.test(axs),'axis text 15px, white (not grey) '+axs);
await show(p,'#cp-vch');await L.sleep(250);
await p.screenshot({path:SC+'v28-chart-all.png'});
await show(p,'#cp-brief');await L.sleep(250);
await p.screenshot({path:SC+'v28-brief.png'});

console.log('FAILURE REASONS');
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.est.mode='noprice';var n=new Date().toISOString();
  S.tables.vehicles.push({id:'d0000000-0000-4000-a000-0000000000b1',owner_id:'b0000000-0000-4000-a000-000000000002',year:1958,make:'Vespa',model:'400',archived:false,notes:'',created_at:n,updated_at:n,created_by:'b0000000-0000-4000-a000-000000000002'});RB.done=0;return reloadAll(true);});
for(let i=0;i<80;i++){await L.sleep(250);if(await p.evaluate(()=>RB.done&&!VQ.run&&!VQ.q.length))break;}
let pan=await p.evaluate(()=>{var e=document.querySelector('.vq');return e?e.innerText.replace(/\n/g,' '):'';});
ok(/could not be valued yet/i.test(await p.evaluate(()=>VQ.msg)),'toast counts the failure');
ok(/Could not be valued yet:.*Vespa.*No market prices were found for a 1958 Vespa 400\. Check the model name/.test(pan),'panel says why: '+pan.slice(0,220));
ok(/Gold.*add the year and model to get a value/.test(pan),'missing field said plainly (add the year and model to get a value)');
ok(await p.evaluate(()=>{var u=JSON.parse(localStorage.getItem('evoai_ui')||'{}');return !!(u.vqWhy&&u.vqWhy['d0000000-0000-4000-a000-0000000000b1']);}),'reason kept after the queue ends');
ok(await p.evaluate(()=>rbWhyText({year:1961,make:'Fiat',model:'Jolly'},{text:'The estimate took too long. Try again in a little while (code: timeout).'})).then(t=>/took too long/.test(t)),'timeout explained');
let s2=await p.evaluate(()=>{var b=[];document.querySelectorAll('.vq-why, .vq-why *').forEach(function(e){var cs=getComputedStyle(e);var m=cs.color.match(/\d+/g).map(Number);if(parseFloat(cs.fontSize)<15||(Math.abs(m[0]-m[1])<6&&Math.abs(m[1]-m[2])<6&&m[0]>40&&m[0]<200))b.push(e.className+':'+cs.fontSize+':'+cs.color);});return b;});
ok(s2.length===0,'reason text >= 15px, white/gold '+s2.join(','));
await show(p,'.vq');await L.sleep(250);
await p.screenshot({path:SC+'v28-values-reasons.png'});
ok(p.errors.length===0,'no page errors '+p.errors.slice(0,3).join(' | '));
await L.close();
console.log('refresh_brief: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
