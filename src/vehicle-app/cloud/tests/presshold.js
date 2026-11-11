// v25: press and hold on a car (ph-01..05) + Merge duplicates (mg-01..03). Mocked backend; never touches Supabase.
const L=require('./lib.js');const fs=require('fs');
const SC='/workspace/vehicle-app/cloud/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002',TT='c0000000-0000-4000-a000-000000000003';
const V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012';
const V3='d0000000-0000-4000-a000-000000000013',V4='d0000000-0000-4000-a000-000000000014',V5='d0000000-0000-4000-a000-000000000015';
const PRE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,t='2026-02-01T00:00:00Z';
 S.tables.vehicles.push({id:'${V3}',owner_id:'${O}',year:1961,make:'Fiat',model:'500',color:null,nickname:null,vin:null,mileage:null,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V4}',owner_id:'${O}',year:1961,make:'Fiat',model:'Jolly',color:'Pink',nickname:null,vin:'229451',mileage:8200,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${O}'},
  {id:'${V5}',owner_id:'${O}',year:1990,make:'Mazda',model:'MX-5',color:'Red',nickname:null,vin:null,mileage:1000,archived:false,notes:'',created_at:t,updated_at:t,created_by:'${TT}'});
 S.tables.reminders.push({id:'f0000000-0000-4000-a000-000000000099',vehicle_id:'${V4}',owner_id:'${O}',kind:'tag',title:'Jolly registration',due_date:'2027-01-01',repeat_months:12,created_by:'${O}'});
 S.tables.expenses.push({id:'f2000000-0000-4000-a000-000000000099',vehicle_id:'${V4}',owner_id:'${O}',category:'detailing',amount:120,incurred_on:'2026-03-01',notes:'Wax',created_by:'${O}'});
 S.tables.vehicle_financials.push({vehicle_id:'${V4}',owner_id:'${O}',purchase_price:18000,purchase_date:'2020-05-01'});
 var tv=S.tables.my_tech_visibility||[];if(tv[0]){var c=JSON.parse(JSON.stringify(tv[0]));c.vehicle_id='${V5}';tv.push(c);}
 window.__od=0;})();`;
const SPY=()=>{var o=openVehicleDetail;openVehicleDetail=function(){window.__od++;return o.apply(this,arguments);};};
const front=async p=>{await p.evaluate(()=>{var c=[].slice.call(document.querySelectorAll('.whl-card.front')).filter(x=>x.getBoundingClientRect().width>0)[0];if(c)c.scrollIntoView({block:'center'});});await L.sleep(250);return p.evaluate(()=>{var c=[].slice.call(document.querySelectorAll('.whl-card.front')).filter(x=>x.getBoundingClientRect().width>0)[0];if(!c)return null;var r=c.getBoundingClientRect();return {id:c.getAttribute('data-id'),x:r.left+r.width/2,y:r.top+r.height/2};});};
const fire=(p,type,x,y,id)=>p.evaluate((t,x,y)=>{var c=[].slice.call(document.querySelectorAll('.whl-card.front')).filter(x=>x.getBoundingClientRect().width>0)[0];c.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:7,isPrimary:true,pointerType:'mouse',button:0}));},type,x,y);
const TT_=async(p,type,x,y)=>{if(!p._cdp)p._cdp=await p.target().createCDPSession();await p._cdp.send('Input.dispatchTouchEvent',{type:type,touchPoints:type==='touchEnd'?[]:[{x:x,y:y}]});};
const hold=async(p,ms,x,y)=>{await TT_(p,'touchStart',x,y);await L.sleep(ms);await TT_(p,'touchEnd');await L.sleep(350);};
const sheet=p=>p.evaluate(()=>{var s=document.querySelector('#ph-root [role=dialog]');return s?s.innerText:null;});
const btn=(p,txt)=>p.evaluate(t=>{var all=[].slice.call(document.querySelectorAll('#ph-root button,#ph-toast button'));var b=all.filter(x=>x.innerText.trim().indexOf(t)===0)[0]||all.filter(x=>x.innerText.indexOf(t)>=0)[0];if(b){b.click();return true;}return false;},txt);
const style=p=>p.evaluate(()=>{var bad=[];document.querySelectorAll('#ph-root *, #ph-toast *').forEach(function(e){if(!e.childNodes.length)return;var own=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});if(!own)return;var cs=getComputedStyle(e);if(cs.display==='none'||e.closest('.ph-live'))return;
  var fs=parseFloat(cs.fontSize),m=cs.color.match(/\d+/g).map(Number),grey=Math.abs(m[0]-m[1])<6&&Math.abs(m[1]-m[2])<6&&m[0]>40&&m[0]<200;if(fs<15||grey)bad.push(e.tagName+':'+fs+':'+cs.color+':'+e.textContent.slice(0,20));});return bad;});
const tbl=(p,t)=>p.evaluate(t=>window.__MOCK_STATE__.tables[t]||[],t);
const veh=async(p,id)=>(await tbl(p,'vehicles')).find(v=>v.id===id);
const reload=async p=>{await p.goto(p.url(),{waitUntil:'load'});await L.sleep(500);await L.login(p,'olivia@test.com');await L.sleep(900);await p.evaluate(SPY);};
const home=async p=>{await p.evaluate(()=>{phClose();});};
(async()=>{
await L.launch();
let p=await L.open({pre:PRE});
await L.login(p,'olivia@test.com');await L.sleep(800);await p.evaluate(SPY);
let f=await front(p);ok(!!f,'wheel shows a front card');
ok(await p.evaluate(()=>!!document.querySelector('.ph-hint')&&document.querySelector('.ph-hint').textContent==='Hold a car for options'),'hint "Hold a car for options"');
// real mouse hold, 650ms
await p.mouse.move(f.x,f.y);await p.mouse.down();await L.sleep(300);
ok(await p.evaluate(()=>!!document.querySelector('.whl-card.ph-holding')),'ring/"Keep holding" shows while holding (ph-01)');
await p.screenshot({path:SC+'ph-live-01.png'});
await L.sleep(350);await p.mouse.up();await L.sleep(250);
let s=await sheet(p);
ok(s&&/Move to another spot/.test(s)&&/Change the order of your cars/.test(s)&&/Remove from portfolio/.test(s)&&/Archive or delete this car/.test(s)&&/Cancel/.test(s),'500ms hold opens the action sheet (ph-02)');
ok(await p.evaluate(()=>window.__od===0),'hold does not open the car');
ok((await style(p)).length===0,'sheet text >= 15px, no grey '+(await style(p)).join(','));
await p.screenshot({path:SC+'ph-live-02.png'});
await btn(p,'Cancel');ok(!(await sheet(p)),'Cancel closes');
// short tap opens car, no sheet
f=await front(p);await hold(p,90,f.x,f.y);await L.sleep(500);
ok(!(await sheet(p))&&await p.evaluate(()=>window.__od===1),'touch: a quick tap still opens the car');
await p.evaluate(()=>{closeModal('modal-vehicle-detail');});await L.sleep(900);
// swipe / movement > 10px
f=await front(p);await TT_(p,'touchStart',f.x,f.y);await L.sleep(100);await TT_(p,'touchMove',f.x+14,f.y);await L.sleep(600);
ok(!(await sheet(p)),'touch: moving more than 10px (a swipe) cancels the hold');await TT_(p,'touchEnd');await L.sleep(1200);
f=await front(p);await TT_(p,'touchStart',f.x,f.y);await L.sleep(100);await TT_(p,'touchMove',f.x+6,f.y+5);await L.sleep(600);
await TT_(p,'touchEnd');await L.sleep(350);ok(!!(await sheet(p)),'touch: small wobble (<10px) still counts as a hold, and lifting the finger does not close the sheet');await home(p);
f=await front(p);await fire(p,'pointerdown',12,f.y);await L.sleep(650);
ok(!(await sheet(p)),'no hold from the left edge (swipe-back)');await fire(p,'pointerup',12,f.y);await L.sleep(200);
f=await front(p);await hold(p,250,f.x,f.y);
ok(!(await sheet(p)),'touch: releasing before 500ms does not open the sheet');
await reload(p);
ok(await p.evaluate(()=>{var st=document.querySelector('.whl-stage');st.focus();st.dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true}));return !!document.querySelector('#ph-root [role=dialog]');}),'keyboard: ContextMenu key opens the sheet');await home(p);
// v25b regressions: real touch hold (CDP touch events), the lift must not close the sheet; iOS pointercancel mid-hold
f=await front(p);await hold(p,700,f.x,f.y);s=await sheet(p);
ok(s&&/Move to another spot/.test(s),'touch hold 700ms then lift: sheet opens and stays open');
let od=await p.evaluate(()=>window.__od);ok(od===0,'touch hold does not open the car');await home(p);
f=await front(p);await TT_(p,'touchStart',f.x,f.y);await L.sleep(200);
await p.evaluate(()=>{var st=document.querySelector('.whl-card.front').closest('.whl-stage');st.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:2,pointerType:'touch'}));});
await L.sleep(500);await TT_(p,'touchEnd');await L.sleep(350);
ok(!!(await sheet(p)),'iOS-style pointercancel during a still finger does not stop the hold');await home(p);
f=await front(p);await p.evaluate(()=>{var st=document.querySelector('.whl-card.front').closest('.whl-stage');var c=st.closest('[id]');c.innerHTML=c.innerHTML;});
await p.evaluate(()=>{refreshCurrent();});await L.sleep(600);f=await front(p);await hold(p,650,f.x,f.y);
ok(!!(await sheet(p)),'hold still works after the carousel re-renders');await home(p);
ok(await p.evaluate(()=>{var c=document.querySelector('.whl-card.front'),cs=getComputedStyle(c),i=document.querySelector('.whl-stage img'),ic=i&&getComputedStyle(i);return (cs.webkitTouchCallout===undefined||cs.webkitTouchCallout==='none')&&cs.userSelect==='none'&&(!i||ic.pointerEvents==='none');}),'cards: no touch callout, no text selection, images not draggable');
// move mode
let order0=await p.evaluate(()=>[].slice.call(document.querySelectorAll('.whl-card')).filter(c=>c.closest('.page,section')?c.getBoundingClientRect().width>0:true).sort((a,b)=>a.getAttribute('data-i')-b.getAttribute('data-i')).map(c=>c.getAttribute('data-id')));
await p.evaluate(id=>phSheet(id),order0[0]);await btn(p,'Move to another spot');await L.sleep(200);
s=await sheet(p);ok(/Move cars/.test(s)&&/Drag a car to a new spot, or use the arrows\. Everyone who views this collection sees the new order\./.test(s)&&/Order saves for .* when you tap Done/.test(s),'move screen texts (ph-03)');
ok(await p.evaluate(()=>document.querySelectorAll('.ph-tile').length)===5,'all 5 cars in the collection shown as numbered tiles');
ok((await style(p)).length===0,'move screen text >= 15px, no grey');
await p.evaluate(()=>document.querySelector('.ph-tile .ph-ar button:last-child').click());await L.sleep(150);
let ids=await p.evaluate(()=>PH.move.ids.slice());ok(ids[1]===order0[0]&&ids[0]===order0[1],'arrow moves the car one spot later');
ok(/now number 2 of 5/.test(await p.evaluate(()=>document.getElementById('ph-live').textContent)),'screen reader hears the new position');
// drag tile 1 onto tile 4 (mouse)
let r=await p.evaluate(()=>[0,3].map(i=>{var b=document.querySelectorAll('.ph-tile')[i].querySelector('.ph-tth').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];}));
await p.mouse.move(r[0][0],r[0][1]);await p.mouse.down();await p.mouse.move(r[0][0]+20,r[0][1]+20,{steps:3});await p.mouse.move(r[1][0],r[1][1],{steps:6});await p.mouse.up();await L.sleep(200);
let ids2=await p.evaluate(()=>PH.move.ids.slice());ok(ids2[3]===ids[0]&&ids2.length===5,'dragging a tile moves it to the new spot');
await btn(p,'Done');await L.sleep(800);
let vs=await tbl(p,'vehicles');ok(ids2.every((id,i)=>vs.find(v=>v.id===id).sort_order===i+1),'Done saves the order with save_vehicle_order');
await p.evaluate(async()=>{await reloadAll(true);refreshCurrent();});await L.sleep(900);
let order1=await p.evaluate(()=>[].slice.call(document.querySelectorAll('.whl-card')).filter(c=>c.closest('.page,section')?c.getBoundingClientRect().width>0:true).sort((a,b)=>a.getAttribute('data-i')-b.getAttribute('data-i')).map(c=>c.getAttribute('data-id')));
ok(JSON.stringify(order1)===JSON.stringify(ids2),'order is kept after reloading from the database');
// archive + undo (ph-04, ph-05)
await p.evaluate(id=>phSheet(id),V2);await btn(p,'Remove from portfolio');await L.sleep(150);s=await sheet(p);
ok(/Remove 1967 Chevrolet Corvette Sting Ray\?/.test(s)&&/Archive keeps its history, photos and documents\. You can bring it back any time from Archived cars\./.test(s)&&/Archive keeps completed jobs with the car\. Delete permanently is refused when a completed job is on file\./.test(s),'remove sheet texts (ph-04)');
ok(await p.evaluate(()=>[].slice.call(document.querySelectorAll('#ph-root button')).map(b=>b.innerText.trim()).join('|'))==='Archive|Delete permanently|Cancel','owner gets Archive, Delete permanently, Cancel');
ok((await style(p)).length===0,'remove sheet text >= 15px, no grey');
await btn(p,'Archive');await L.sleep(900);
ok(await p.evaluate(()=>{var t=document.getElementById('ph-toast');return t.className==='on'&&/1967 Chevrolet Corvette Sting Ray archived/.test(t.innerText)&&/Undo/.test(t.innerText);}),'toast "<car> archived" with Undo');
ok((await veh(p,V2)).archived===true,'car archived in the database');
ok(await p.evaluate(id=>!document.querySelector('.whl-card[data-id="'+id+'"]'),V2),'archived car leaves the wheel');
await btn(p,'Undo');await L.sleep(1200);ok((await veh(p,V2)).archived===false,'Undo brings it back');
// delete permanently + undo, then expiry
await p.evaluate(id=>{phSheet(id);},V1);await btn(p,'Remove from portfolio');await btn(p,'Delete permanently');await L.sleep(400);
ok(await p.evaluate(id=>!document.querySelector('.whl-card[data-id="'+id+'"]'),V1),'deleted car disappears at once');
ok(!!(await veh(p,V1)),'...but nothing is deleted on the server yet');
await btn(p,'Undo');await L.sleep(400);ok(await p.evaluate(id=>!!document.querySelector('.whl-card[data-id="'+id+'"]'),V1)&&!!(await veh(p,V1)),'Undo keeps the car');
await p.evaluate(id=>{phSheet(id);},V1);await btn(p,'Remove from portfolio');await btn(p,'Delete permanently');await L.sleep(9000);
ok(!!(await veh(p,V1)),'still on the server at 9s');await L.sleep(2500);
ok(!(await veh(p,V1))&&(await tbl(p,'reminders')).every(x=>x.vehicle_id!==V1),'after 10s deleted permanently via delete_vehicle_permanently');
ok(await p.evaluate(()=>window.__MOCK_STATE__.rpcs.some(r=>r.name==='delete_vehicle_permanently'||r.fn==='delete_vehicle_permanently'||JSON.stringify(r).indexOf('delete_vehicle_permanently')>=0)),'rpc delete_vehicle_permanently called');
// merge (mg-01..03)
await p.evaluate(id=>phSheet(id),V3);ok(/Merge with/.test(await sheet(p)),'action sheet has Merge with\u2026');
await btn(p,'Merge with');await L.sleep(150);s=await sheet(p);
ok(/Which car is the same as/.test(s)&&/1961 Fiat Jolly/.test(s)&&/Looks like the same car/.test(s),'merge picker suggests the Fiat Jolly');
await p.evaluate(id=>mgPickB(id),V4);await L.sleep(100);await p.evaluate(id=>mgKeep(id),V3);await L.sleep(200);
ok((await style(p)).length===0,'merge picker text >= 15px, no grey '+(await style(p)).join(','));
await p.screenshot({path:SC+'mg-01.png'});
await btn(p,'Next: check details');await L.sleep(700);s=await sheet(p);
ok(/Colour[\s\S]*Pink[\s\S]*Filled in from the other car/.test(s)&&/Model . pick one/.test(s)&&/VIN \/ chassis[\s\S]*229451/.test(s)&&/1 reminder/.test(s)&&/1 expense/.test(s),'field preview: blanks filled, conflict to choose, what moves (mg-02)');
await p.evaluate(()=>mgChoose('model','d'));await L.sleep(150);
ok((await style(p)).length===0,'preview text >= 15px, no grey '+(await style(p)).join(','));
await p.screenshot({path:SC+'mg-02.png'});await p.evaluate(()=>{var m=document.querySelector('.ph-move');m.scrollTop=m.scrollHeight;});await L.sleep(200);await p.screenshot({path:SC+'mg-02b.png'});
await btn(p,'Merge cars');await L.sleep(1500);s=await sheet(p);
ok(/Cars merged/.test(s)&&/Undo merge/.test(s),'done screen with Undo merge (mg-03)');
await p.screenshot({path:SC+'mg-03.png'});
let v3=await veh(p,V3),v4=await veh(p,V4),rem=(await tbl(p,'reminders')).find(x=>x.title==='Jolly registration'),fin=(await tbl(p,'vehicle_financials')).find(x=>x.purchase_price===18000);
ok(v3.color==='Pink'&&v3.model==='Jolly'&&v3.vin==='229451'&&v3.mileage===8200,'kept car gets the filled and chosen values');
ok(v4.archived&&v4.merged_into===V3&&!v4.vin,'other car archived, marked merged, VIN released');
ok(rem.vehicle_id===V3&&(await tbl(p,'expenses')).find(x=>x.notes==='Wax').vehicle_id===V3&&fin.vehicle_id===V3,'reminders, expenses and financials moved');
await btn(p,'Undo merge');await L.sleep(1500);
v3=await veh(p,V3);v4=await veh(p,V4);rem=(await tbl(p,'reminders')).find(x=>x.title==='Jolly registration');
ok(v3.model==='500'&&v3.color==null&&!v4.archived&&!v4.merged_into&&v4.vin==='229451'&&rem.vehicle_id===V4,'Undo merge puts everything back');
// summary-page entry: pairs
ok(await p.evaluate(()=>{mgOpen(null);var t=document.querySelector('#ph-root [role=dialog]').innerText;phClose();return /1961 Fiat 500/.test(t)&&/1961 Fiat Jolly/.test(t);}),'Merge duplicates (from the import summary) lists the likely pair');
ok(await p.evaluate(()=>{var a={id:'a',clientId:'x',make:'Fiat',model:'500',year:1961,vin:'AAA111'},b={id:'b',clientId:'x',make:'Fiat',model:'Jolly',year:1961,vin:'BBB222'};return mgScore(a,b)<0;}),'two different VINs are never suggested as a duplicate');
// migration missing fallback
await p.evaluate(()=>{window.__MOCK_STATE__.no017=true;});
await p.evaluate(id=>mgOpen(id),V3);
await p.evaluate(a=>{mgPickB(a[1]);mgKeep(a[0]);mgStep2();},[V3,V4]);await btn(p,'Merge cars');await L.sleep(600);
ok(await p.evaluate(()=>/needs database update 017/.test(document.body.innerText)),'without migration 017 merge says so and changes nothing');
ok(!(await veh(p,V4)).archived,'nothing changed');await home(p);
await p.evaluate(id=>phMoveOpen(id),V2);await p.evaluate(()=>document.querySelector('.ph-tile .ph-ar button:last-child').click());await btn(p,'Done');await L.sleep(500);
ok(await p.evaluate(()=>!!JSON.parse(localStorage.getItem('evo.order25')||'{}')&&Object.keys(JSON.parse(localStorage.getItem('evo.order25'))).length===1),'without 017 the order is kept on this device');
ok(p.errors.length===0,'no page errors '+p.errors.join(' | '));
await p.close();
// technician: may delete only cars they added
p=await L.open({pre:PRE});await L.login(p,'tom@test.com','password123','tech');await L.sleep(900);
let t=await p.evaluate(a=>({dbg:[!!phFind(a[0]),(phFind(a[0])||{}).createdBy,myId()],mine:phCanDelete(phFind(a[0])),other:phCanDelete(phFind(a[1])),move:phCanMove(phFind(a[0]))}),[V5,V2]);
ok(t.mine&&!t.other,'tech: can delete the car they added, not other cars '+JSON.stringify(t.dbg));
await p.evaluate(id=>phRemove(id),V5);
ok(await p.evaluate(()=>[].slice.call(document.querySelectorAll('#ph-root button')).map(b=>b.innerText.trim()).indexOf('Delete permanently')>=0),'tech sees Delete permanently on their own car');await home(p);
let rr=await p.evaluate(async id=>{var r=await sb.rpc('delete_vehicle_permanently',{p_id:id});return r.error&&r.error.code;},V2);
ok(rr==='42501','server refuses a tech deleting a car they did not add');
let rr2=await p.evaluate(async a=>{var r=await sb.rpc('save_vehicle_order',{p_portfolio:null,p_ids:a});return r.error&&r.error.code;},[V2,V5]);
ok(rr2==='42501','server refuses a tech without manage rights reordering');
ok(p.errors.length===0,'no page errors (tech) '+p.errors.join(' | '));
await p.close();
// admin 'View as Owner' (Wade's case): real touch hold on the client portal carousel
p=await L.open({pre:PRE});await L.login(p,'wade@evo.test');await L.sleep(900);
await p.evaluate(()=>setViewAs('owner',getClients().filter(c=>/Olivia/.test(JSON.stringify(c)))[0].id));await L.sleep(1200);
f=await front(p);ok(!!f,'view as owner shows the carousel');
await hold(p,700,f.x,f.y);s=await sheet(p);
ok(s&&/Move to another spot/.test(s)&&/Remove from portfolio/.test(s),'admin viewing as owner: touch hold opens the owner options');
await home(p);ok(p.errors.length===0,'no page errors (view as) '+p.errors.join(' | '));await p.close();
// zero options still explains
p=await L.open({pre:PRE});await L.login(p,'tom@test.com','password123','tech');await L.sleep(900);
await p.evaluate(id=>phSheet(id),V1);s=await sheet(p);
ok(s&&/only its owner or the admin can move, merge or remove it/.test(s)&&/OK/.test(s),'no options: sheet explains why instead of doing nothing');
await home(p);f=await front(p);if(f){await hold(p,700,f.x,f.y);ok(!!(await sheet(p)),'tech: hold always gives feedback');}
await p.close();
// desktop: mouse hold works too, sheet in safe area
p=await L.open({pre:PRE,desktop:true,w:1280,h:800});await L.login(p,'olivia@test.com');await L.sleep(900);
f=await front(p);await p.mouse.move(f.x,f.y);await p.mouse.down();await L.sleep(650);await p.mouse.up();await L.sleep(200);
ok(/Move to another spot/.test(await sheet(p)||''),'desktop: press and hold with the mouse');
ok(await p.evaluate(()=>{var r=document.querySelector('.ph-sheet').getBoundingClientRect();return r.bottom<=innerHeight+1&&r.width<=641;}),'desktop sheet fits the screen');
await p.close();
await L.close();
console.log('\npresshold: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
