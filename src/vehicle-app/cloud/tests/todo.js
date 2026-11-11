// v36: To Do tab (p36). Cars with Missing details, filled in place via the vehicle edit save path. Mocked backend, no DB change.
const L=require('./lib.js');const fs=require('fs');
const OUT=process.env.TD_OUT||'';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const V1='d0000000-0000-4000-a000-000000000011';
const BASE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,v=S.tables.vehicles.filter(function(x){return x.id==='${V1}';})[0];
 v.year=1968;v.make='Porsche';v.model='912 Coupe';v.nickname='Purple Candy';v.color='Aubergine';v.vin='12804608';v.mileage=56949;v.plate=null;v.plate_region=null;
 v.notes='Service records: partial.\\n~evo~'+JSON.stringify({loc:'Hickory Vaults',cur:'EUR'});
 S.tables.vehicle_financials.forEach(function(f){if(f.vehicle_id==='${V1}'){f.purchase_price=50400;f.purchase_date='2019-05-02';}});})();`;
const shot=async(p,n)=>{if(!OUT)return;fs.mkdirSync(OUT,{recursive:true});await p.evaluate(()=>{var tc=document.getElementById('toast-container');if(tc)tc.innerHTML='';var m=document.querySelector('.main');if(m)m.scrollTop=0;window.scrollTo(0,0);});await L.sleep(300);await p.screenshot({path:OUT+n});};
const info=p=>p.evaluate(()=>{var r=document.getElementById('todo-root'),b=document.getElementById('todo-badge');
  var exp=visibleVehicles().filter(function(v){var c=msCount(v);return msCanSeeMissing(v)&&c.done<c.total;});
  return {cards:[].slice.call(r.querySelectorAll('.td-card')).map(function(c){return c.dataset.v;}),badge:b.style.display==='none'?0:Number(b.textContent),exp:exp.map(function(v){return v.id;}),
   txt:r.innerText,active:document.getElementById('page-todo').classList.contains('active')};});
const style=p=>p.evaluate(()=>{var bad=[];[].slice.call(document.querySelectorAll('#page-todo *')).forEach(function(e){if(!e.offsetParent||e.closest('svg'))return;var own=[].slice.call(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();});if(!own)return;
  var cs=getComputedStyle(e),f=parseFloat(cs.fontSize),m=cs.color.match(/\d+/g).map(Number);var white=m[0]>=230&&m[1]>=225&&m[2]>=215,gold=Math.abs(m[0]-201)<=30&&Math.abs(m[1]-170)<=30&&m[0]>m[2]+50,red=m[0]>200&&m[1]<150,dark=m[0]<40&&m[1]<40&&m[2]<40;
  if(f<15||!(white||gold||red||dark))bad.push(e.textContent.trim().slice(0,24)+' '+cs.color+' '+f);});return bad;});
(async()=>{
await L.launch();
let p=await L.open({pre:BASE,w:430,h:932});
await L.login(p,'olivia@test.com');await L.sleep(600);
ok(await p.evaluate(()=>!!document.querySelector('.nav-item[data-page="todo"]')),'To Do tab in the nav');
ok(await p.evaluate(()=>{var n=[].slice.call(document.querySelectorAll('.sidebar .nav-item')).filter(function(e){return e.offsetParent;});return n[1]&&n[1].dataset.page==='todo';}),'To Do sits right after Overview');
await p.evaluate(()=>showPage('todo'));await L.sleep(400);
let s=await info(p);
ok(s.active,'To Do page opens for an owner');
ok(s.exp.length>0&&s.cards.slice().sort().join()===s.exp.slice().sort().join(),'lists exactly the cars with Missing details, same msCount logic ('+s.cards.length+')');
ok(s.badge===s.exp.length,'badge = vehicles needing details ('+s.badge+')');
const order=await p.evaluate(()=>{var o=ownerClientId(),p=poList(o)[0];return stApply(phSorted(activeVehicles(getVehicles()).filter(function(x){return x.clientId===o&&poOf(x,o).id===p.id;}))).map(function(v){return v.id;});});
ok(JSON.stringify(order.filter(i=>s.cards.indexOf(i)>=0))===JSON.stringify(s.cards),'cars in collection order');
let c1=await p.evaluate(id=>{var c=document.querySelector('.td-card[data-v="'+id+'"]');return {f:[].slice.call(c.querySelectorAll('.td-fld')).map(function(x){return x.dataset.f;}),ins:[].slice.call(c.querySelectorAll('[data-in]')).map(function(x){return x.dataset.in+':'+(x.type||x.tagName);}),cnt:c.querySelector('.td-cnt').textContent,img:!!c.querySelector('.td-th img,.td-th svg,.td-th .ph-noimg'),nm:c.querySelector('.td-name').textContent};},V1);
ok(c1.f.join()==='reg,ins','912: Registration + Insurance missing ('+c1.f+')');
ok(c1.ins.join()==='v-plate:text,v-plate-region:text,v-insurer:text','inline inputs mapped to the edit-form fields ('+c1.ins+')');
ok(c1.cnt==='6 of 8'&&c1.img&&/1968 Porsche 912 Coupe/.test(c1.nm),'thumbnail, name, 6 of 8 ring');
let bad=await style(p);ok(bad.length===0,'15px+, white/gold/red only '+bad.join(' | '));
ok(await p.evaluate(()=>[].slice.call(document.querySelectorAll('#todo-root input,#todo-root select')).every(function(e){return e.getBoundingClientRect().height>=44;})),'inputs >= 44px tall');
await shot(p,'todo_01_list.png');
// empty save -> refused, no write
const w0=(await L.state(p)).log.length;
await p.evaluate(id=>tdSave(id),V1);await L.sleep(300);
ok((await L.state(p)).log.length===w0,'empty save writes nothing');
// inline edit + save
await p.focus('#td-'+V1.slice(-8)+'-v-plate');await p.keyboard.type('eu105g');
await p.focus('#td-'+V1.slice(-8)+'-v-plate-region');await p.keyboard.type('FL');
await p.focus('#td-'+V1.slice(-8)+'-v-insurer');await p.keyboard.type('Chubb');
await p.evaluate(id=>{var c=document.querySelector('.td-card[data-v="'+id+'"]');c.scrollIntoView({block:'start'});var m=document.querySelector('.main');if(m)m.scrollTop-=90;window.scrollBy(0,-90);var tc=document.getElementById('toast-container');if(tc)tc.innerHTML='';},V1);await L.sleep(250);
if(OUT)await p.screenshot({path:OUT+'todo_02_editing.png'});
// drafts survive a re-render
await p.evaluate(()=>renderTodo());ok(await p.evaluate(id=>document.getElementById('td-'+id.slice(-8)+'-v-insurer').value==='Chubb',V1),'typed values survive a re-render');
await p.evaluate(id=>tdSave(id),V1);await L.sleep(1500);
let st=await L.state(p);let row=st.tables.vehicles.filter(v=>v.id===V1)[0];
ok(row.plate==='EU105G'&&row.plate_region==='FL','plate + region saved to the existing vehicles columns');
ok(/"insc":"Chubb"/.test(row.notes)&&/"loc":"Hickory Vaults"/.test(row.notes)&&/"cur":"EUR"/.test(row.notes),'insurance saved via the same notes extras; location/currency untouched');
ok(row.year==1968&&row.color==='Aubergine'&&row.vin==='12804608','other details unchanged');
ok(st.v.length===0,'no schema/RLS violations '+JSON.stringify(st.v).slice(0,200));
let s2=await info(p);
ok(s2.active&&s2.cards.indexOf(V1)<0,'completed car drops off the list');
ok(s2.badge===s.badge-1,'badge dropped by one ('+s.badge+' -> '+s2.badge+')');
ok(await p.evaluate(()=>!document.getElementById('modal-add-vehicle').classList.contains('active')),'edit form not left open');
if(OUT){await p.evaluate(()=>{var tc=document.getElementById('toast-container');[].slice.call(tc.querySelectorAll('.toast')).slice(0,-1).forEach(function(t){t.remove();});});await p.screenshot({path:OUT+'todo_03_after_save.png'});}
await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
ok(await p.evaluate(()=>{var c=document.querySelector('#vd-key .ms-chip');return c&&/8 of 8 complete/.test(c.textContent)&&!document.querySelector('#vd-key .ms-miss');}),'vehicle page ring: 8 of 8 complete');
await p.evaluate(()=>closeModal('modal-vehicle-detail'));
// fill everything else -> empty state
await p.evaluate(()=>showPage('todo'));await L.sleep(300);
for(let k=0;k<12;k++){const id=await p.evaluate(()=>{var c=document.querySelector('.td-card');if(!c)return null;
  var vals={'v-year':'1990','v-make':'Test','v-model':'Car','v-vin':'TESTVIN0001','v-plate':'TEST1','v-color':'Black','v-mileage':'1200','v-purchase-price':'100000','v-location':'Garage','v-insurer':'Hagerty'};
  c.querySelectorAll('input[data-in]').forEach(function(i){if(!i.value&&vals[i.dataset.in])i.value=vals[i.dataset.in];});return c.dataset.v;});
  if(!id)break;await p.evaluate(i=>tdSave(i),id);await L.sleep(900);}
let s3=await info(p);
ok(s3.cards.length===0&&/All records complete/.test(s3.txt),'empty state: "All records complete"');
ok(s3.badge===0,'badge hidden when nothing is missing');
bad=await style(p);ok(bad.length===0,'empty state 15px+, white/gold only '+bad.join(' | '));
await shot(p,'todo_04_empty.png');
ok(p.errors.length===0,'no page errors '+p.errors.join(' | '));
await p.close();
// advisor sees it too; tech/shared never gets editable inputs for cars it cannot edit
p=await L.open({pre:BASE});await L.login(p,'tom@test.com','password123','advisor');await L.sleep(500);
let adv=await p.evaluate(()=>{if(!session)return null;showPage('todo');return {a:document.getElementById('page-todo').classList.contains('active'),ok:[].slice.call(document.querySelectorAll('#todo-root .td-card')).every(function(c){return canEditVehicle(byId(getVehicles(),c.dataset.v));})};});
ok(!adv||(adv.a&&adv.ok),'advisor: page opens, only editable cars listed');
ok(p.errors.length===0,'advisor no page errors '+p.errors.join(' | '));
await L.close();
console.log('\ntodo: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
