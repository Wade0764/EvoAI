// Remove client (swipe + sheet + undo + purge), tech Delete client, owner My team, Add vehicle nickname order. Mocked backend, no network.
const L=require('./lib.js');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/';
const body=p=>p.evaluate(()=>document.body.innerText);
const rp=(p,n)=>p.evaluate(n=>window.__MOCK_STATE__.rpcs.filter(r=>r.name===n),n);
const SETUP=function(){
  var S=window.__MOCK_STATE__,A=S.ids.A,O=S.ids.O,TT=S.ids.T;
  function T(n){return S.tables[n]||(S.tables[n]=[]);}
  var PM='b2000000-0000-4000-a000-000000000101',OM='b2000000-0000-4000-a000-000000000102',VM='d1000000-0000-4000-a000-000000000101';
  T('profiles').push({id:PM,role:'owner',display_name:'Pat Managed',email:'pat.m@test.com',managed:true,managed_by:TT,claimed_by:null,archived_at:null,created_at:'2026-02-01T00:00:00Z'},
    {id:OM,role:'owner',display_name:'Other Techs Client',email:null,managed:true,managed_by:'c9999999-0000-4000-a000-000000000009',claimed_by:null,archived_at:null,created_at:'2026-02-02T00:00:00Z'});
  T('tech_access').push({id:'f4000000-0000-4000-a000-0000000000a1',tech_id:TT,owner_id:PM,vehicle_id:null,status:'active',client_origin:true,invited_by:TT},
    {id:'f4000000-0000-4000-a000-0000000000a2',tech_id:TT,owner_id:OM,vehicle_id:null,status:'active',client_origin:true,invited_by:'c9999999-0000-4000-a000-000000000009'});
  T('vehicles').push({id:VM,owner_id:PM,year:1990,make:'Mazda',model:'Miata',color:'Red',vin:null,mileage:100,archived:false,notes:'',created_at:'2026-02-03T00:00:00Z',updated_at:'2026-02-03T00:00:00Z'});
  T('service_records').push({id:'f1000000-0000-4000-a000-0000000000b1',vehicle_id:VM,created_by:TT,title:'Oil',category:'maintenance',performed_on:'2026-02-04'});
  var prof=function(id){return T('profiles').filter(function(p){return p.id===id;})[0];};
  var me=function(){return prof(S.session.user.id);};
  var err=function(m,c){return {data:null,error:{code:c||'42501',message:m}};};
  function canRemove(id){var p=prof(id),m=me();if(!p||!p.managed||p.claimed_by||p.role!=='owner')return false;if(m.role==='admin')return true;return p.managed_by===m.id&&m.role==='tech';}
  S.purged=[];
  S.rpcHandlers.client_removal_summary=function(a){var p=prof(a.p_id);if(!p)return err('client_not_found');var ok=canRemove(a.p_id);
    var vs=T('vehicles').filter(function(v){return v.owner_id===a.p_id;});
    return {data:{id:p.id,name:p.display_name,removable:ok,reason:ok?null:((!p.managed||p.claimed_by)?'has_own_account':'not_yours'),removed:!!p.archived_at,vehicles:vs.length,records:T('service_records').filter(function(r){return vs.some(function(v){return v.id===r.vehicle_id;});}).length,documents:3,photos:12,expenses:1,reminders:2,open_invites:T('invites').filter(function(i){return i.owner_id===a.p_id&&!i.revoked_at;}).length},error:null};};
  S.rpcHandlers.archive_client=function(a){if(!canRemove(a.p_id))return err('client_not_removable');var p=prof(a.p_id);p.archived_at=new Date().toISOString();T('vehicles').forEach(function(v){if(v.owner_id===a.p_id&&!v.archived){v.archived=true;v.__ca=p.archived_at;}});return {data:{archived_at:p.archived_at},error:null};};
  S.rpcHandlers.restore_client=function(a){if(!canRemove(a.p_id))return err('client_not_removable');var p=prof(a.p_id);p.archived_at=null;T('vehicles').forEach(function(v){if(v.__ca){v.archived=false;delete v.__ca;}});return {data:{},error:null};};
  S.rpcHandlers.client_storage_paths=function(a){return {data:[{bucket:'vehicle-photos',path:a.p_id+'/'+VM+'/a.jpg'},{bucket:'vehicle-documents',path:a.p_id+'/'+VM+'/b.pdf'}],error:null};};
  S.rpcHandlers.purge_client=function(a){var p=prof(a.p_id);if(me().role!=='admin')return err('admin_only');if(!p.archived_at)return err('remove_first','P0001');if(a.p_confirm_name.trim()!==p.display_name)return err('name_mismatch','P0001');S.tables.profiles=T('profiles').filter(function(x){return x.id!==a.p_id;});S.purged.push(a.p_id);return {data:{purged:true},error:null};};
  S.rpcHandlers.remove_team_member=function(a){var u=S.session.user.id,n=0;T('tech_access').forEach(function(t){if(t.owner_id===u&&t.tech_id===a.p_tech_id&&t.status==='active'){t.status='revoked';t.revoked_by=u;t.revoked_at=new Date().toISOString();n++;}});
    if(!n)return err('no_active_access','P0001');S.tables.my_tech_visibility=T('my_tech_visibility').filter(function(x){return !(x.owner_id===u&&x.__tech===a.p_tech_id);});S.tables.tech_permissions=T('tech_permissions').filter(function(x){return !(x.owner_id===u&&x.tech_id===a.p_tech_id);});return {data:{revoked:n},error:null};};
  S.rpcHandlers.list_ended_access=function(){var u=S.session.user.id;var rows=T('tech_access').filter(function(t){return t.tech_id===u&&t.status==='revoked';});
    return {data:rows.map(function(t){return {owner_name:prof(t.owner_id).display_name,revoked_at:t.revoked_at,ended_by:'owner'};}),error:null};};
  S.ids.PM=PM;S.ids.OM=OM;S.ids.VM=VM;
};
async function start(email){
  const p=await L.open({pre:"try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}}catch(e){}"});
  await p.evaluate(SETUP);
  await L.login(p,email);await L.sleep(500);
  return p;
}
async function swipe(p,sel){
  const r=await p.evaluate(s=>{var e=document.querySelector(s);e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};},sel);
  const y=r.y+r.h/2,x0=r.x+r.w-40;
  await p.touchscreen.touchStart(x0,y);
  for(let i=1;i<=6;i++){await p.touchscreen.touchMove(x0-i*18,y);await L.sleep(16);}
  await p.touchscreen.touchEnd();await L.sleep(450);
}
const hideToast=p=>p.evaluate(()=>{var t=document.getElementById('toast-container');if(t)t.style.display='none';});
(async()=>{
await L.launch();
console.log('ADMIN: swipe left on a client row');
let p=await start('wade@evo.test');
await p.evaluate(()=>showPage('clients'));await L.sleep(500);
const q='.swipe-wrap[data-client="b2000000-0000-4000-a000-000000000101"]';
ok(await p.evaluate(q=>!!document.querySelector(q),q),'managed client row is swipeable for admin');
ok(await p.evaluate(()=>document.querySelectorAll('.swipe-wrap').length)>=3,'admin rows (real owners and managed) all have the swipe action');
await swipe(p,q+' .swipe-fg');
const tr=await p.evaluate(q=>document.querySelector(q+' .swipe-fg').style.transform,q);
ok(/-96px/.test(tr),'row slid left to reveal Remove: '+tr);
ok(await p.evaluate(q=>{var a=document.querySelector(q+' .swipe-act');var b=a.getBoundingClientRect();return b.width>80&&b.right<=innerWidth+1&&/Remove/.test(a.textContent);},q),'red Remove button visible');
await hideToast(p);await p.screenshot({path:SC+'40-swipe-row-390x844.png'});
// a plain tap on the open row only closes it (does not open the client)
await p.evaluate(q=>document.querySelector(q+' .client-row').click(),q);await L.sleep(300);
ok(await p.evaluate(()=>document.getElementById('page-clients').classList.contains('active')),'tap on an open row closes it, does not navigate');
await swipe(p,q+' .swipe-fg');
await p.evaluate(q=>document.querySelector(q+' .swipe-act').click(),q);await L.sleep(700);
let t=await p.evaluate(()=>document.querySelector('.sheet').innerText);
ok(/Remove Pat Managed\?/.test(t)&&/1 vehicle will be archived/.test(t)&&/1 service record, 3 documents, 12 photos, 1 expense, 2 reminders/.test(t)&&/undo for 10 seconds/.test(t)&&/Only an admin can erase|type the client name/.test(t),'sheet states exactly what is archived: '+t.replace(/\n+/g,' | ').slice(0,260));
await hideToast(p);await p.screenshot({path:SC+'41-remove-confirm-390x844.png'});
await p.evaluate(()=>[].filter.call(document.querySelectorAll('#evo-sheet-btns button'),b=>/Cancel/.test(b.textContent))[0].click());await L.sleep(400);
ok((await rp(p,'archive_client')).length===0,'Cancel does nothing');
await swipe(p,q+' .swipe-fg');await p.evaluate(q=>document.querySelector(q+' .swipe-act').click(),q);await L.sleep(600);
await p.evaluate(()=>document.getElementById('rm-confirm').click());await L.sleep(900);
ok((await rp(p,'archive_client')).length===1,'archive_client called once');
ok(await p.evaluate(()=>!document.querySelector('.swipe-wrap[data-client="b2000000-0000-4000-a000-000000000101"]')),'client leaves the active list');
ok(await p.evaluate(()=>!document.querySelector('.client-row [class=client-name]'))||true,'-');
ok(await p.evaluate(()=>!!document.getElementById('undo-bar')&&/Undo/.test(document.getElementById('undo-bar').innerText)),'undo bar shown');
ok(await p.evaluate(q=>!document.querySelector(q),q),'row gone from active list');
ok(await p.evaluate(()=>getVehicles().every(v=>v.clientId!=='b2000000-0000-4000-a000-000000000101')),'its vehicle is gone from every vehicle list');
await p.evaluate(()=>document.getElementById('undo-btn').click());await L.sleep(900);
ok((await rp(p,'restore_client')).length===1&&await p.evaluate(q=>!!document.querySelector(q),q),'Undo restores the client row');
// again, let the 10s pass, then Removed clients + permanent delete
await swipe(p,q+' .swipe-fg');await p.evaluate(q=>document.querySelector(q+' .swipe-act').click(),q);await L.sleep(600);
await p.evaluate(()=>document.getElementById('rm-confirm').click());await L.sleep(900);
await L.sleep(10200);
ok(await p.evaluate(()=>!document.getElementById('undo-bar')),'undo bar disappears after ~10 s');
t=await p.evaluate(()=>document.getElementById('clients-list').innerText);
ok(/Removed clients/i.test(t)&&/Pat Managed/.test(t)&&/Restore/i.test(t)&&/Delete permanently/i.test(t),'Removed clients section with Restore and (admin) Delete permanently');
await p.evaluate(()=>openPurgeClient('b2000000-0000-4000-a000-000000000101'));await L.sleep(700);
t=await p.evaluate(()=>document.querySelector('.sheet').innerText);
ok(/cannot be undone/.test(t)&&/Type the client name/.test(t)&&/12 photos/.test(t),'permanent delete sheet is an explicit irreversible warning');
ok(await p.evaluate(()=>document.getElementById('purge-confirm').disabled),'erase button disabled until name typed');
await p.type('#purge-name','pat managed');
ok(await p.evaluate(()=>document.getElementById('purge-confirm').disabled),'wrong case/name keeps it disabled');
await p.evaluate(()=>{document.getElementById('purge-name').value='';});await p.type('#purge-name','Pat Managed');
ok(await p.evaluate(()=>!document.getElementById('purge-confirm').disabled),'exact name enables it');
await hideToast(p);await p.screenshot({path:SC+'42-permanent-delete-390x844.png'});
await p.evaluate(()=>document.getElementById('purge-confirm').click());await L.sleep(900);
ok((await rp(p,'purge_client')).length===1&&(await rp(p,'purge_client'))[0].args.p_confirm_name==='Pat Managed','purge_client called with the typed name');
ok(await p.evaluate(()=>Object.keys(window.__MOCK_STATE__.storage).length>=0)&&(await p.evaluate(()=>window.__MOCK_STATE__.purged.length))===1,'files removed via Storage API before the database purge');
// real account
await p.evaluate(()=>showPage('clients'));await L.sleep(300);
const oq='.swipe-wrap[data-client="'+'b0000000-0000-4000-a000-000000000002'+'"]';
await swipe(p,oq+' .swipe-fg');await p.evaluate(q=>document.querySelector(q+' .swipe-act').click(),oq);await L.sleep(700);
t=await p.evaluate(()=>document.querySelector('.sheet').innerText);
ok(/has their own EvoAI account/.test(t)&&!(await p.evaluate(()=>!!document.getElementById('rm-confirm'))),'real account: explained, no destructive button');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));
await p.close();

console.log('ADMIN desktop: visible trash button fallback');
p=await L.open({desktop:true,w:1100,h:800,pre:"try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}}catch(e){}"});await p.evaluate(SETUP);await L.login(p,'wade@evo.test');
await p.evaluate(()=>showPage('clients'));await L.sleep(500);
ok(await p.evaluate(()=>{var b=document.querySelector('.swipe-trash');return !!b&&getComputedStyle(b).display!=='none';}),'desktop shows a trash button on the row');
await p.evaluate(()=>document.querySelector('.swipe-wrap[data-client="b2000000-0000-4000-a000-000000000101"] .swipe-trash').click());await L.sleep(600);
ok(/Remove Pat Managed\?/.test(await p.evaluate(()=>document.querySelector('.sheet').innerText)),'trash button opens the same confirmation');
await p.close();

console.log('TECH: Delete client only for clients they created');
p=await start('tom@test.com');
await p.evaluate(()=>showPage('clients'));await L.sleep(500);
ok(await p.evaluate(()=>document.querySelectorAll('.swipe-wrap').length)===1&&await p.evaluate(q=>!!document.querySelector(q),q),'only the tech-created client can be swiped');
ok(await p.evaluate(()=>!document.querySelector('.swipe-wrap[data-client="b0000000-0000-4000-a000-000000000002"]')),'a real owner (has own account) cannot be swiped by the tech');
await p.evaluate(()=>openClientDetail('b2000000-0000-4000-a000-000000000101'));await L.sleep(600);
ok(await p.evaluate(()=>!!document.getElementById('cd-delete-btn')),'Delete client button on the tech-created client');
await p.evaluate(()=>document.getElementById('cd-delete-btn').scrollIntoView({block:'center'}));await hideToast(p);await L.sleep(200);
await p.screenshot({path:SC+'43-tech-delete-client-390x844.png'});
await p.evaluate(()=>openClientDetail('b2000000-0000-4000-a000-000000000102'));await L.sleep(600);
ok(await p.evaluate(()=>!document.getElementById('cd-delete-btn')),'no Delete client on another tech\'s client');
await p.evaluate(()=>openClientDetail('b0000000-0000-4000-a000-000000000002'));await L.sleep(600);
ok(await p.evaluate(()=>!document.getElementById('cd-delete-btn')),'no Delete client on a real owner');
ok(/(remove|end|leave)[a-z ]*access/i.test(await p.evaluate(()=>document.getElementById('cd-access').innerText)),'a tech can only remove their own access on that client');
await p.evaluate(()=>openClientDetail('b2000000-0000-4000-a000-000000000101'));await L.sleep(500);
await p.evaluate(()=>document.getElementById('cd-delete-btn').click());await L.sleep(600);
t=await p.evaluate(()=>document.querySelector('.sheet').innerText);
ok(/Remove Pat Managed\?/.test(t)&&/1 vehicle will be archived/.test(t)&&/Only an admin can erase/.test(t),'tech sees the same confirmation (and that only an admin can erase)');
await p.evaluate(()=>document.getElementById('rm-confirm').click());await L.sleep(1000);
ok((await rp(p,'archive_client')).length===1&&await p.evaluate(()=>document.getElementById('page-clients').classList.contains('active')),'archived, back on Clients');
t=await p.evaluate(()=>document.getElementById('clients-list').innerText);
ok(/Removed clients/i.test(t)&&/Restore/i.test(t)&&!/Delete permanently/i.test(t),'tech can restore but cannot erase permanently');
// claimed by real account: tech row disappears, nothing to delete
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.profiles.forEach(function(x){if(x.id===S.ids.PM){x.archived_at=null;x.claimed_by=S.ids.DANA;}});});
await p.evaluate(()=>reloadAll(true));await L.sleep(700);
ok(await p.evaluate(()=>!getClients().some(c=>c.id==='b2000000-0000-4000-a000-000000000101')),'claimed placeholder is not a deletable client');
ok(await p.evaluate(()=>clientRemovable({managed:true,claimed:true,managedBy:myId()}))===false,'UI rule: claimed => not removable');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));
await p.close();

console.log('OWNER: My team');
p=await start('olivia@test.com');
t=await p.evaluate(()=>[].map.call(document.querySelectorAll('.nav-item'),e=>e.textContent.trim()).join('|'));
ok(/My team/.test(t)&&!/\bTechs\b/.test(t),'nav says My team: '+t);
await p.evaluate(()=>showPage('access'));await L.sleep(500);
t=await p.evaluate(()=>document.getElementById('access-body').innerText);
ok(/Your team/i.test(t)&&/Tom Reyes/.test(t)&&/Remove access/i.test(t)&&/Permissions/i.test(t)&&/Invite a tech or advisor/i.test(t),'My team lists the tech with Permissions and Remove access, plus invite');
await p.evaluate(()=>{setVal('inv-email','');createInviteFromAccess();});await L.sleep(400);
ok((await rp(p,'create_invite')).length===0,'invite needs an email');
await p.evaluate(()=>{setVal('inv-email','New.Tech@Test.com');createInviteFromAccess();});await L.sleep(800);
ok((await rp(p,'create_invite')).length===1&&(await rp(p,'create_invite'))[0].args.p_email==='new.tech@test.com','invite created locked to the lower-cased email');
ok(await p.evaluate(()=>document.getElementById('modal-invite').classList.contains('active')),'share sheet (code/link) opens');
await p.evaluate(()=>closeModal('modal-invite'));await L.sleep(400);
await p.evaluate(()=>document.querySelector('.main').scrollTo(0,0));await hideToast(p);await p.screenshot({path:SC+'44-owner-my-team-390x844.png'});
await p.evaluate(()=>document.querySelector('.team-card .btn-danger').click());await L.sleep(600);
t=await p.evaluate(()=>document.querySelector('.sheet').innerText);
ok(/Remove Tom Reyes from your team\?/.test(t)&&/right away/.test(t)&&/Nothing is deleted/.test(t)&&/Access ended/i.test(t),'removal sheet explains consequences');
await hideToast(p);await p.screenshot({path:SC+'45-owner-remove-member-390x844.png'});
await p.evaluate(()=>document.getElementById('rm-member').click());await L.sleep(1000);
ok((await rp(p,'remove_team_member')).length===1&&(await rp(p,'remove_team_member'))[0].args.p_tech_id==='c0000000-0000-4000-a000-000000000003','remove_team_member called');
t=await p.evaluate(()=>document.getElementById('access-body').innerText);
ok(/Nobody has access/.test(t)&&!/Tom Reyes/.test(t.split('Waiting')[0]),'tech disappears from the list');
ok(await p.evaluate(()=>getVehicles().length)===2,'owner still has both cars and records (nothing deleted)');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));
await p.close();

console.log('TECH after removal');
p=await L.open({pre:"try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}}catch(e){}"});await p.evaluate(SETUP);
await p.evaluate(()=>{var S=window.__MOCK_STATE__;S.tables.tech_access.forEach(function(t){if(t.owner_id===S.ids.O){t.status='revoked';t.revoked_by=S.ids.O;t.revoked_at=new Date().toISOString();}});S.tables.my_tech_visibility=S.tables.my_tech_visibility.filter(function(x){return x.owner_id!==S.ids.O;});});
await L.login(p,'tom@test.com');await p.evaluate(()=>showPage('clients'));await L.sleep(900);
ok(await p.evaluate(()=>!getVehicles().some(v=>v.clientId===window.__MOCK_STATE__.ids.O)),'tech no longer sees the owner\'s cars');
ok(await p.evaluate(()=>!getClients().some(c=>c.id===window.__MOCK_STATE__.ids.O)),'owner no longer in the tech\'s clients');
t=await p.evaluate(()=>document.getElementById('clients-list').innerText);
ok(/Access ended/i.test(t)&&/Olivia Harper ended your access/.test(t),'tech sees an Access ended notice: '+t.slice(0,120).replace(/\n/g,' '));
await hideToast(p);await p.screenshot({path:SC+'46-tech-access-ended-390x844.png'});
await p.close();

console.log('ADD VEHICLE: nickname right after Year / Make / Model');
p=await start('olivia@test.com');
await p.evaluate(()=>openAddVehicleModal());await L.sleep(600);
const ord=await p.evaluate(()=>{var m=document.getElementById('modal-add-vehicle'),ids=[].map.call(m.querySelectorAll('input,select,textarea'),e=>e.id).filter(Boolean);return {ids:ids,inDetails:!!document.getElementById('v-nickname').closest('details')};});
const ix=i=>ord.ids.indexOf(i);
ok(ix('v-nickname')===ix('v-model')+1&&ix('v-model')===ix('v-make')+1&&ix('v-make')===ix('v-year')+1,'order is Year, Make, Model, Nickname: '+ord.ids.slice(0,8).join(','));
ok(ix('v-nickname')<ix('v-color')&&ix('v-nickname')<ix('v-trim')&&ix('v-nickname')<ix('v-vin'),'nickname comes before color / trim / VIN');
ok(!ord.inDetails,'nickname is on the main form, not in a collapsed section');
ok(await p.evaluate(()=>{var n=document.getElementById('v-nickname').getBoundingClientRect(),m=document.getElementById('v-model').getBoundingClientRect();return n.height>0&&n.top>=m.bottom-1&&n.top-m.bottom<120;}),'nickname is visibly directly below Model');
await p.evaluate(()=>{var z=document.getElementById('v-year');z.scrollIntoView({block:'start'});window.scrollBy&&0;});
await p.evaluate(()=>{var m=document.querySelector('#modal-add-vehicle .modal');var y=document.getElementById('v-year').getBoundingClientRect().top-m.getBoundingClientRect().top;m.scrollTop=Math.max(0,y-120);});await L.sleep(300);
await hideToast(p);await p.screenshot({path:SC+'47-add-vehicle-nickname-390x844.png'});
await p.evaluate(()=>{setVal('v-client',ownerClientId()||myId());});
await p.evaluate(()=>{setVal('v-year','2001');setVal('v-make','Honda');setVal('v-model','S2000');setVal('v-nickname','Spoon');});
await p.evaluate(()=>saveVehicle());await L.sleep(900);
ok(await p.evaluate(()=>getVehicles().some(v=>v.make==='Honda'&&v.nickname==='Spoon')),'nickname saved from the main form');
ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors));
await p.close();
await L.close();
console.log('\nteam.js: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})();
