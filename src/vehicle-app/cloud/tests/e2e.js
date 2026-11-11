const L=require('./lib.js');
const path=require('path');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/';
async function setv(p,id,v){await p.evaluate((i,x)=>{var e=document.getElementById(i);e.value=x;e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));},id,v);}
async function noErr(p,label){ok(p.errors.length===0,label+' no page errors '+(p.errors.length?JSON.stringify(p.errors):''));}
async function violations(p,label){const s=await L.state(p);ok(s.v.length===0,label+' no schema/RLS-shape violations '+(s.v.length?JSON.stringify(s.v):''));return s;}
(async()=>{
await L.launch();
// ===== 1. AUTH =====
console.log('AUTH');
let p=await L.open();await L.sleep(500);
ok(await p.evaluate(()=>document.getElementById('auth-screen').style.display!=='none'),'login shown when no session');
await p.screenshot({path:SC+'01-login-390x844.png'});
await p.evaluate(()=>{document.getElementById('auth-email').value='olivia@test.com';document.getElementById('auth-password').value='wrong';login();});await L.sleep(300);
ok((await p.evaluate(()=>document.getElementById('auth-error').textContent)).indexOf('incorrect')>=0,'wrong password message');
await p.evaluate(()=>{window.__MOCK_STATE__.offline=true;document.getElementById('auth-password').value='password123';login();});await L.sleep(300);
ok((await p.evaluate(()=>document.getElementById('auth-error').textContent)).indexOf('offline')>=0,'offline sign-in message is calm: '+await p.evaluate(()=>document.getElementById('auth-error').textContent));
await p.evaluate(()=>{window.__MOCK_STATE__.offline=false;document.getElementById('auth-email').value='new@test.com';document.getElementById('auth-password').value='password123';login();});await L.sleep(300);
ok((await p.evaluate(()=>document.getElementById('auth-error').textContent)).toLowerCase().indexOf('confirm')>=0,'unconfirmed email message');
await p.evaluate(()=>{showSignup(true);selectRole('client');});
await p.evaluate(()=>{document.getElementById('su-name').value='Sam Newbie';document.getElementById('su-email').value='sam@test.com';document.getElementById('su-password').value='password123';document.getElementById('su-code').value='0123-4567-89ab-cdef-0123';signupOwner();});await L.sleep(400);
ok(await p.evaluate(()=>document.getElementById('auth-confirm-panel').style.display!=='none'),'sign-up shows check-your-email panel');
let s=await L.state(p);
ok(s.emails.some(e=>e.type==='signup'&&e.to==='sam@test.com'&&/^http:\/\/127\.0\.0\.1:8765\/evoai-cloud\.html$/.test(e.redirect)),'emailRedirectTo = current page url ('+(s.emails[0]&&s.emails[0].redirect)+')');
const u=await p.evaluate(()=>window.__MOCK_STATE__.users.filter(x=>x.email==='sam@test.com')[0]);
ok(u&&u.meta&&u.meta.pending_invite&&u.meta.display_name==='Sam Newbie','signup metadata carries display_name + pending_invite');
await p.screenshot({path:SC+'02-confirm-email-390x844.png'});
await p.evaluate(()=>{showForgot(true);document.getElementById('fg-email').value='olivia@test.com';sendReset();});await L.sleep(300);
s=await L.state(p);ok(s.emails.some(e=>e.type==='reset'),'password reset email requested');
await noErr(p,'auth');await p.close();
// A2HS hint
p=await L.open({q:'?a2hs=1'});await L.sleep(300);
ok(await p.evaluate(()=>document.getElementById('a2hs-card').style.display!=='none'),'add-to-home-screen hint visible (forced)');
await p.screenshot({path:SC+'03-login-a2hs-390x844.png'});
await p.evaluate(()=>dismissA2HS());
ok(await p.evaluate(()=>document.getElementById('a2hs-card').style.display==='none'),'hint dismissible');await p.close();
p=await L.open();await L.sleep(300);
ok(await p.evaluate(()=>document.getElementById('a2hs-card').style.display==='none'),'hint hidden on non-iOS/desktop UA');await p.close();

// ===== 2. OWNER =====
console.log('OWNER');
p=await L.open();await L.login(p,'olivia@test.com');
ok(await p.evaluate(()=>document.querySelectorAll('.car-card,.vcard,[onclick*="openVehicleDetail"]').length>=2),'owner sees both vehicles');
ok(await p.evaluate(()=>document.body.innerText.indexOf('The Ghost')>=0),'nickname shown (The Ghost)');
ok(await p.evaluate(()=>document.body.innerText.indexOf('Calculated by AI once connected')<0&&/No value estimates yet|Value estimates are not turned on yet/.test(document.getElementById('cp-total-value').innerText)),'old placeholder gone; clear no-estimate state shown when no ai_estimates');
await p.screenshot({path:SC+'04-owner-home-390x844.png'});
// vehicle page
await p.evaluate(id=>openVehicleDetail(id),'d0000000-0000-4000-a000-000000000011');await L.sleep(500);
const t=await p.evaluate(()=>document.getElementById('modal-vehicle-detail').innerText);
ok(/Registration/.test(t)&&/Insurance/.test(t),'reminders from DB shown on vehicle page');
ok(/Annual service/.test(t),'service record shown');
ok(/229,000/.test(t),'purchase price from vehicle_financials shown to owner');
ok(await p.evaluate(()=>/Edit/.test(document.getElementById('vd-actions').innerText)&&/Sell/.test(document.getElementById('vd-actions').innerText)),'owner has edit/transfer actions');
await p.evaluate(()=>{document.querySelector('#modal-vehicle-detail .modal').scrollTop=0;});
await p.screenshot({path:SC+'06-owner-vehicle-390x844.png'});
// photo upload
const inp=await p.$('#vd-photo-input');await inp.uploadFile(path.join(__dirname,'fixture.jpg'));await L.sleep(1500);
s=await L.state(p);
ok(s.storage.some(k=>k.startsWith('vehicle-photos/b0000000-0000-4000-a000-000000000002/d0000000-0000-4000-a000-000000000011/')),'photo uploaded to vehicle-photos/{owner}/{vehicle}/file');
ok((s.tables.vehicle_photos||[]).length===1&&s.tables.vehicle_photos[0].is_cover===true,'vehicle_photos row (cover)');
ok(await p.evaluate(()=>{var v=byId(getVehicles(),'d0000000-0000-4000-a000-000000000011');return /supabase\.co\/storage/.test(v.image||'');}),'cover uses signed URL');
await p.evaluate(()=>closeModal('modal-vehicle-detail'));
// add expense with PDF receipt
await p.evaluate(id=>{currentVehicleId=id;openExpenseModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'ex-amount','1234.5');await setv(p,'ex-desc','Brake pads & rotors');
const ei=await p.$('#ex-img-input');await ei.uploadFile(path.join(__dirname,'fixture.pdf'));await L.sleep(300);
await p.evaluate(()=>saveExpense());await L.sleep(1500);
s=await L.state(p);
const ex=(s.tables.expenses||[]).filter(e=>e.amount===1234.5)[0];
ok(!!ex&&ex.category==='maintenance'&&ex.incurred_on&&ex.created_by==='b0000000-0000-4000-a000-000000000002','expense row inserted with schema columns');
ok(s.storage.some(k=>k.startsWith('vehicle-documents/')&&/\.pdf$/.test(k)),'PDF receipt stored in vehicle-documents');
ok((s.tables.documents||[]).some(d=>d.kind==='receipt'&&d.mime_type==='application/pdf'),'receipt documents row (kind receipt, mime pdf)');
// invoice document with image
await p.evaluate(id=>{currentVehicleId=id;openDocModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'doc-type','invoice');await setv(p,'doc-name','Porsche invoice #99');
const di=await p.$('#doc-img-input');await di.uploadFile(path.join(__dirname,'fixture.jpg'));await L.sleep(500);
await p.evaluate(()=>saveDocument());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.documents||[]).some(d=>d.kind==='invoice'&&d.title.indexOf('Porsche invoice #99')===0&&d.mime_type==='image/jpeg'),'invoice doc uploaded (kind invoice)');
// service
await p.evaluate(id=>{currentVehicleId=id;openServiceModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'svc-note','Oil change and filter');await setv(p,'svc-miles','2100');await setv(p,'svc-cost','180');
await p.evaluate(()=>saveService());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.service_records||[]).some(r=>/Oil change/.test(r.title)&&r.mileage===2100&&r.cost===180),'service_records inserted');
ok(s.log.some(l=>l.table==='vehicles'&&l.op==='update'),'vehicle mileage updated');
// reminder
await p.evaluate(id=>{currentVehicleId=id;openReminderModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
const due=new Date(Date.now()+40*864e5).toISOString().slice(0,10);
await setv(p,'rm-title','Battery tender check');await setv(p,'rm-due',due);
await p.evaluate(()=>saveReminder());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.reminders||[]).some(r=>r.title==='Battery tender check'&&r.kind==='custom'&&r.due_date===due),'custom reminder inserted');
// advisory accept
await p.evaluate(()=>openRespond('f3000000-0000-4000-a000-000000000001','accepted'));await L.sleep(300);
await p.evaluate(()=>{var b=document.querySelector('#modal-respond .btn-primary,#modal-respond button[onclick*="submitRespond"],#modal-respond button[onclick*="confirmRespond"]');if(b)b.click();});await L.sleep(1000);
s=await L.state(p);
ok((s.tables.advisories||[]).some(a=>a.id==='f3000000-0000-4000-a000-000000000001'&&a.status==='accepted'),'advisory accepted -> status accepted in DB');
// add vehicle
await p.evaluate(()=>openAddVehicleModal());await L.sleep(200);
await setv(p,'v-year','2019');await setv(p,'v-make','Ferrari');await setv(p,'v-model','488 Pista');await setv(p,'v-nickname','Rosso');await setv(p,'v-vin','zff90hha7k0234567');await setv(p,'v-purchase-price','325000');await setv(p,'v-trim','Spider');
await p.evaluate(()=>saveVehicle());await L.sleep(1500);
s=await L.state(p);
const nv=(s.tables.vehicles||[]).filter(v=>v.make==='Ferrari')[0];
ok(!!nv&&nv.owner_id==='b0000000-0000-4000-a000-000000000002'&&nv.nickname==='Rosso','vehicle inserted for owner with nickname');
ok(!!nv&&/^[A-Z0-9]{5,25}$/.test(nv.vin||''),'VIN upper-cased and matches DB check');
ok((s.tables.vehicle_financials||[]).some(f=>f.vehicle_id===(nv&&nv.id)&&f.purchase_price===325000),'vehicle_financials written (owner only)');
// permissions page
await p.evaluate(()=>showPage('access'));await L.sleep(500);
const acc=await p.evaluate(()=>document.getElementById('access-body').innerText);
ok(/Tom Reyes/.test(acc),'Techs page lists the tech');
await p.evaluate(()=>{document.querySelector('#access-body details').open=true;});
await p.screenshot({path:SC+'07-owner-techs-permissions-390x844.png'});
await p.evaluate(()=>{var c=document.querySelector('input[id$="-view_expenses"]');c.checked=true;c.dispatchEvent(new Event('change'));});await L.sleep(600);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='set_tech_permission'&&r.args.p_permission==='view_expenses'&&r.args.p_value===true),'toggle -> set_tech_permission rpc');
// invite
await p.evaluate(()=>{setVal('inv-email','tech.new@test.com');createInviteFromAccess();});await L.sleep(800);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='create_invite'&&(r.args.p_kind==='tech_owner'||r.args.p_kind==='tech_vehicle')),'create_invite rpc (tech kind)');
ok(await p.evaluate(()=>/^[0-9a-f]{4}-/i.test(document.getElementById('invite-code-text').textContent)),'invite code displayed');
ok(await p.evaluate(()=>/opens your own mail app/i.test(document.getElementById('modal-invite').innerText)),'modal explains Send email uses your mail app (v27)');
ok(await p.evaluate(()=>/Share via text/.test(document.getElementById('modal-invite').innerText)&&/Copy link/.test(document.getElementById('modal-invite').innerText)&&/example\.com|mailto:/.test(document.getElementById('invite-mailto').href+'mailto:')),'share + email buttons present');
await p.evaluate(()=>closeModal('modal-invite'));
await p.evaluate(()=>showPage('access'));await L.sleep(500);
ok(await p.evaluate(()=>/0123-4567-89ab/.test(document.getElementById('access-body').innerText)&&/Copy code/.test(document.getElementById('access-body').innerText)&&/Share invite/.test(document.getElementById('access-body').innerText)),'open invite row shows code + Copy code + Share invite');
ok(await p.evaluate(()=>{var t=inviteShareText('0123456789abcdef0123456789abcdef','a@b.com');return t.indexOf('https://wade0764.github.io/EvoAI/cloud/')>-1&&t.indexOf('0123-4567-89ab')>-1&&/Tap to join/.test(t);}),'share text has link, code, instructions');
await p.evaluate(()=>{var e=document.querySelector('.invite-row-code');if(e)e.scrollIntoView({block:'center'});});await L.sleep(200);
await p.screenshot({path:SC+'11-invite-row-share-390x844.png'});
// transfer
await p.evaluate(id=>{currentVehicleId=id;openTransferModal();},'d0000000-0000-4000-a000-000000000012');await L.sleep(200);
await setv(p,'xfer-email','buyer@test.com');
await p.evaluate(()=>confirmTransfer());await L.sleep(1000);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='initiate_transfer'&&r.args.p_buyer_email==='buyer@test.com'),'initiate_transfer rpc');
ok(await p.evaluate(()=>/^fedc-/i.test(document.getElementById('invite-code-text').textContent)),'transfer code displayed');
await p.evaluate(()=>closeModal('modal-invite'));
// redeem code
await p.evaluate(()=>{document.getElementById('acct-code').value='0123-4567-89ab-cdef-0123-4567-89ab-cdef';redeemCodeFrom('acct-code');});await L.sleep(600);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='redeem_invite'&&r.args.p_code==='0123456789abcdef0123456789abcdef'),'redeem_invite rpc called');
// archive
await p.evaluate(id=>{currentVehicleId=id;archiveCurrentVehicle();},nv.id);await L.sleep(1200);
s=await L.state(p);
ok((s.tables.vehicles||[]).some(v=>v.id===nv.id&&v.archived===true),'archive -> vehicles.archived=true');
// export
await p.evaluate(()=>{window.__dl=null;var o=URL.createObjectURL;});
await violations(p,'owner');await noErr(p,'owner');
// sign out
await p.evaluate(()=>{logout();});await L.sleep(800);
await p.close();

// ===== 3. TECH =====
console.log('TECH');
p=await L.open();await L.login(p,'tom@test.com','password123','advisor');
const nav=await p.evaluate(()=>document.querySelector('.sidebar').innerText);
ok(!/Expenses/.test(await p.evaluate(()=>Array.from(document.querySelectorAll('.nav-item')).filter(e=>e.offsetParent!==null).map(e=>e.innerText).join('|'))),'tech without view/add expenses: Expenses nav hidden');
ok(await p.evaluate(()=>document.body.innerText.indexOf('The Ghost')>=0),'tech sees granted vehicles');
await p.screenshot({path:SC+'05-tech-home-390x844.png'});
await p.evaluate(id=>openVehicleDetail(id),'d0000000-0000-4000-a000-000000000011');await L.sleep(500);
const tt=await p.evaluate(()=>document.getElementById('modal-vehicle-detail').innerText);
ok(!/229,000/.test(tt),'tech cannot see purchase price');
const acts=await p.evaluate(()=>document.getElementById('vd-actions').innerText);
ok(/Log service/.test(acts)&&/Document/.test(acts)&&/Advisory/.test(acts),'tech has permitted actions');
ok(!/Expense/.test(acts)&&!/Edit/.test(acts)&&!/Archive/.test(acts)&&!/Sell/.test(acts)&&!/Reminder/.test(acts),'tech lacks expense/edit/archive/transfer/reminder actions');
await p.screenshot({path:SC+'08-tech-vehicle-390x844.png'});
await p.evaluate(()=>closeModal('modal-vehicle-detail'));
await p.evaluate(()=>{setVal('ic-name','Wendy Client');setVal('ic-email','wendy@test.com');inviteClientOnly();});await L.sleep(900);
await p.screenshot({path:SC+'12-client-invite-modal-390x844.png'});
await p.evaluate(()=>closeModal('modal-invite'));await p.evaluate(()=>showPage('clients'));await L.sleep(500);
ok(await p.evaluate(()=>/Invite pending/.test(document.getElementById('clients-list').innerText)&&/Copy code/.test(document.getElementById('clients-list').innerText)&&/Share invite/.test(document.getElementById('clients-list').innerText)&&/0123-4567/.test(document.getElementById('clients-list').innerText)),'Clients page pending invite row shows code + Copy code + Share invite');
await p.screenshot({path:SC+'13-clients-pending-invite-390x844.png'});
await p.evaluate(()=>closeModal('modal-vehicle-detail'));
// tech logs service
await p.evaluate(id=>{currentVehicleId=id;openServiceModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'svc-note','Tire rotation');await setv(p,'svc-miles','2200');await setv(p,'svc-cost','60');
await p.evaluate(()=>saveService());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.service_records||[]).some(r=>r.title==='Tire rotation'&&r.created_by==='c0000000-0000-4000-a000-000000000003'),'tech inserted service record');
ok(!(s.tables.expenses||[]).some(e=>/Tire rotation/.test(e.notes||'')),'tech service did not create expense (no can_add_expenses)');
ok(!s.log.some(l=>l.table==='vehicles'&&l.op==='update'),'tech did not attempt vehicle update (owner-only)');
ok(!s.log.some(l=>l.table==='reminders'),'tech did not write reminders');
// tech advisory
await p.evaluate(id=>{currentVehicleId=id;openRecModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'rec-title','Wiper blades');await setv(p,'rec-description','Streaking on left side.');await setv(p,'rec-urgency','yellow');
await p.evaluate(()=>saveRecommendation());await L.sleep(1200);
s=await L.state(p);
ok((s.tables.advisories||[]).some(a=>a.title==='Wiper blades'&&a.severity==='urgent'||a.title==='Wiper blades'&&a.severity==='recommended'),'tech advisory inserted (from_tech_id=tech)');
// tech blocked action
await p.evaluate(()=>{window.__before=window.__MOCK_STATE__.log.length;});
await p.evaluate(()=>{var v=getVehicles()[0];currentVehicleId=v.id;saveExpense();});
ok(true,'(expense blocked path executed without error)');
await violations(p,'tech');await noErr(p,'tech');
await p.close();


// ===== 3b. MANAGED CLIENTS (tech adds a client with no invite) =====
console.log('MANAGED CLIENTS');
const switchTo=async(page,email)=>{await page.evaluate(()=>{window.__MOCK_STATE__.session=null;session=null;C=emptyCache();});await page.evaluate((e)=>{document.getElementById('auth-email').value=e;document.getElementById('auth-password').value='password123';login();},email);await L.sleep(1800);};
p=await L.open();await L.login(p,'tom@test.com','password123','advisor');
await p.evaluate(()=>showPage('dashboard'));await L.sleep(300);
ok(await p.evaluate(()=>/New client/.test(document.querySelector('#page-dashboard').innerText)),'Overview has New client button');
await p.evaluate(()=>openNewClient());await L.sleep(300);
ok(await p.evaluate(()=>!!document.getElementById('nc-phone')&&!!document.getElementById('nc-notes')&&/New client/.test(document.querySelector('#modal-add-client .modal-title').textContent)),'New client form: name/email/phone/notes');
await p.evaluate(()=>{setVal('nc-name','Pat Client');setVal('nc-email','Pat@Test.com');setVal('nc-phone','904-555-0111');setVal('nc-notes','Prefers texts');});
await p.screenshot({path:SC+'20-new-client-form-390x844.png'});
await p.evaluate(()=>addClient());await L.sleep(1200);
s=await L.state(p);
const mrpc=s.rpcs.filter(r=>r.name==='create_managed_client')[0];
ok(!!mrpc&&mrpc.args.p_name==='Pat Client'&&mrpc.args.p_email==='pat@test.com'&&mrpc.args.p_phone==='904-555-0111','create_managed_client rpc (name, lowercased email, phone)');
ok(!s.rpcs.some(r=>r.name==='create_invite'),'no invite code involved');
ok(await p.evaluate(()=>document.getElementById('modal-client-created').classList.contains('active')||document.getElementById('modal-client-created').style.display==='flex'||/Add vehicle for Pat Client/.test(document.getElementById('modal-client-created').innerText)),'after creating: Add vehicle for Pat Client shown');
ok(/not on app yet/i.test(await p.evaluate(()=>document.getElementById('modal-client-created').innerText)),'client-created modal has Not on app yet badge');
await p.screenshot({path:SC+'21-client-created-390x844.png'});
const MID=await p.evaluate(()=>getClients().filter(c=>c.name==='Pat Client')[0].id);
ok(await p.evaluate(()=>{var c=getClients().filter(c=>c.name==='Pat Client')[0];return c.managed&&!c.claimed&&c.canAdd;}),'managed client appears in client list data (managed, can add)');
await p.evaluate(()=>clientCreatedAddVehicle());await L.sleep(500);
ok(await p.evaluate(m=>val('v-client')===m,MID),'Add vehicle opens with the new client preselected');
ok(await p.evaluate(()=>/Add vehicle for Pat Client/.test(document.getElementById('av-title').textContent)),'title: Add vehicle for Pat Client');
ok(await p.evaluate(()=>Array.from(document.querySelectorAll('#v-client option')).some(o=>/Pat Client \(not on app yet\)/.test(o.textContent))),'client dropdown marks managed client (not on app yet)');
await setv(p,'v-year','1998');await setv(p,'v-make','Toyota');await setv(p,'v-model','Supra');await setv(p,'v-vin','jt2jb01a8w0123456');await setv(p,'v-purchase-price','41000');await setv(p,'v-nickname','Mk4');
await p.evaluate(()=>{document.querySelector('#modal-add-vehicle .modal').scrollTop=0;});
await p.screenshot({path:SC+'22-add-vehicle-for-managed-390x844.png'});
await p.evaluate(()=>saveVehicle());await L.sleep(1500);
s=await L.state(p);
const mv=(s.tables.vehicles||[]).filter(v=>v.make==='Toyota')[0];
ok(!!mv&&mv.owner_id===MID,'vehicle inserted under the managed client owner_id');
ok((s.tables.vehicle_financials||[]).some(f=>f.vehicle_id===(mv&&mv.id)&&f.purchase_price===41000),'tech may record purchase info for a managed client');
// tech works under the managed client: service, document (storage path), photo, reminder
await p.evaluate(id=>{currentVehicleId=id;openServiceModal(id);},mv.id);await L.sleep(200);
await setv(p,'svc-note','Initial inspection');await setv(p,'svc-miles','88000');
await p.evaluate(()=>saveService());await L.sleep(1500);
await p.evaluate(id=>{currentVehicleId=id;openDocModal(id);},mv.id);await L.sleep(200);
await setv(p,'doc-type','invoice');await setv(p,'doc-name','Bill of sale');
const mdi=await p.$('#doc-img-input');await mdi.uploadFile(path.join(__dirname,'fixture.jpg'));await L.sleep(500);
await p.evaluate(()=>saveDocument());await L.sleep(1500);
await p.evaluate(id=>{currentVehicleId=id;openVehicleDetail(id);},mv.id);await L.sleep(500);
ok(await p.evaluate(()=>/Edit/.test(document.getElementById('vd-actions').innerText)&&/Reminder/.test(document.getElementById('vd-actions').innerText)),'tech has owner-level actions (edit/reminder) on managed client vehicle');
const mpi=await p.$('#vd-photo-input');await mpi.uploadFile(path.join(__dirname,'fixture.jpg'));await L.sleep(1500);
await p.evaluate(()=>closeModal('modal-vehicle-detail'));
await p.evaluate(id=>{currentVehicleId=id;openReminderModal(id);},mv.id);await L.sleep(200);
const mdue=new Date(Date.now()+30*864e5).toISOString().slice(0,10);
await setv(p,'rm-title','Tag renewal');await setv(p,'rm-due',mdue);
await p.evaluate(()=>saveReminder());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.service_records||[]).some(r=>r.vehicle_id===mv.id&&/Initial inspection/.test(r.title)&&r.created_by==='c0000000-0000-4000-a000-000000000003'),'service record created by tech for managed client');
ok((s.tables.documents||[]).some(d=>d.vehicle_id===mv.id&&d.storage_path.indexOf(MID+'/'+mv.id+'/')===0),'document storage_path = {managed_owner}/{vehicle}/file');
ok(s.storage.some(k=>k.indexOf('vehicle-documents/'+MID+'/'+mv.id+'/')===0),'document object uploaded under managed owner prefix');
ok(s.storage.some(k=>k.indexOf('vehicle-photos/'+MID+'/'+mv.id+'/')===0),'photo object uploaded under managed owner prefix');
ok((s.tables.reminders||[]).some(r=>r.vehicle_id===mv.id&&r.title==='Tag renewal'),'tech created reminder for managed client');
// clients list
await p.evaluate(()=>showPage('clients'));await L.sleep(500);
const ct=await p.evaluate(()=>document.getElementById('clients-list').innerText);
ok(/Pat Client/.test(ct)&&/not on app yet/i.test(ct)&&/Invite to app/.test(ct)&&/Add vehicle/.test(ct),'Clients list: managed row has Not on app yet badge, Add vehicle, Invite to app');
await p.screenshot({path:SC+'23-client-list-390x844.png'});
// client page banner
await p.evaluate(m=>openClientDetail(m),MID);await L.sleep(500);
ok(await p.evaluate(()=>/Add vehicle for Pat Client/.test(document.getElementById('cd-managed').innerText)),'client page shows managed banner with Add vehicle for Pat Client');
// duplicate + validation
await p.evaluate(()=>openNewClient());await p.evaluate(()=>{setVal('nc-name','Pat Again');setVal('nc-email','pat@test.com');addClient();});await L.sleep(800);
ok(/already have a client/.test(await p.evaluate(()=>document.getElementById('nc-error').textContent)),'duplicate email -> helpful error');
await p.evaluate(()=>{setVal('nc-name','');addClient();});await L.sleep(200);
ok(/name is required/i.test(await p.evaluate(()=>document.getElementById('nc-error').textContent)),'name is required');
await p.evaluate(()=>{setVal('nc-name','Owner Already');setVal('nc-email','olivia@test.com');addClient();});await L.sleep(800);
ok(/already has an EvoAI account/.test(await p.evaluate(()=>document.getElementById('nc-error').textContent)),'email of an existing owner -> use Invite to app message');
await p.evaluate(()=>closeModal('modal-add-client'));
// Invite to app (optional code flow) + share link carries ?invite=
await p.evaluate(m=>inviteManagedClient(m),MID);await L.sleep(900);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='create_managed_client_invite'&&r.args.p_managed_id===MID),'Invite to app -> create_managed_client_invite');
const mcode=await p.evaluate(()=>codeKey(lastInviteCode));
ok(await p.evaluate(c=>{var t=inviteShareText(c,'pat@test.com');return t.indexOf('https://wade0764.github.io/EvoAI/cloud/?invite='+c)>-1;},mcode),'Share/Email message link = .../cloud/?invite=CODE');
ok(await p.evaluate(c=>decodeURIComponent(document.getElementById('invite-mailto').href).indexOf('/cloud/?invite='+c)>-1,mcode),'Email it (mailto) body has the ?invite= link');
await p.evaluate(()=>closeModal('modal-invite'));
await p.evaluate(()=>showPage('clients'));await L.sleep(400);
ok(await p.evaluate(()=>/Invite pending/.test(document.getElementById('clients-list').innerText)&&!/Invite to app/.test(document.getElementById('clients-list').innerText)),'managed row shows Invite pending after inviting');
await violations(p,'managed tech');await noErr(p,'managed tech');
// ---- the real client signs up with the same email: auto-claim ----
await p.evaluate(()=>{window.__MOCK_STATE__.tables.profiles.push({id:window.__MOCK_STATE__.ids.PAT,role:'owner',display_name:'Pat Client',email:'pat@test.com'});});  // the sign-up trigger creates this profile
await switchTo(p,'pat@test.com');
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='claim_managed_clients'),'owner sign-in calls claim_managed_clients');
ok((s.tables.vehicles||[]).some(v=>v.id===mv.id&&v.owner_id==='b1000000-0000-4000-a000-000000000021'),'vehicle moved to the real account (same email)');
ok(await p.evaluate(()=>/Supra/.test(document.body.innerText)),'real client sees the vehicle the tech added');
ok(await p.evaluate(()=>/already added for you|are now in your collection|is now in your collection/.test(document.getElementById('toast-container').innerText)),'toast tells the client vehicles were added');
await violations(p,'claim');await noErr(p,'claim');
await p.close();

// ---- managed client claimed with an invite code via the Enter invite code cards ----
p=await L.open();await L.login(p,'tom@test.com','password123','advisor');
await p.evaluate(()=>{setVal('nc-name','Dana Client');addClient();});await L.sleep(1200);
const DID=await p.evaluate(()=>getClients().filter(c=>c.name==='Dana Client')[0].id);
await p.evaluate(()=>closeModal('modal-client-created'));
await p.evaluate(()=>{window.__MOCK_STATE__.tables.vehicles.push({id:'d1000000-0000-4000-a000-000000000099',owner_id:window.__MOCK_STATE__.tables.profiles.filter(x=>x.display_name==='Dana Client')[0].id,year:2005,make:'Ford',model:'GT',mileage:900,archived:false,notes:'',created_at:'2026-02-01T00:00:00Z',updated_at:'2026-02-01T00:00:00Z'});});
await p.evaluate(m=>inviteManagedClient(m),DID);await L.sleep(900);
const dcode=await p.evaluate(()=>lastInviteCode);
await p.evaluate(()=>closeModal('modal-invite'));
await switchTo(p,'dana@test.com');
ok(await p.evaluate(()=>/enter invite code/i.test(document.getElementById('cp-redeem').innerText)&&!!document.getElementById('ov-code')),'owner empty Overview shows Enter invite code card');
await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:SC+'24-owner-empty-enter-code-390x844.png'});
await p.evaluate(()=>{setVal('ov-code','zzzzzzzzzzzzzzzzzzzz');redeemCodeFrom('ov-code','ov-code-msg');});await L.sleep(600);
ok(/did not work/.test(await p.evaluate(()=>document.getElementById('ov-code-msg').textContent)),'bad code -> helpful inline error: '+await p.evaluate(()=>document.getElementById('ov-code-msg').textContent));
await p.evaluate(()=>{setVal('ov-code','abc');redeemCodeFrom('ov-code','ov-code-msg');});await L.sleep(200);
ok(/too short/.test(await p.evaluate(()=>document.getElementById('ov-code-msg').textContent)),'short code -> too short message');
await p.evaluate(()=>openAccountModal());await L.sleep(300);
ok(await p.evaluate(()=>{var c=document.querySelector('#modal-account .redeem-sec');return c&&c.offsetParent!==null&&/enter invite code/i.test(c.innerText)&&!!document.getElementById('acct-redeem-btn');}),'Account page has visible Enter invite code card with Redeem button');
await p.evaluate(()=>{document.querySelector('#modal-account .redeem-sec').scrollIntoView({block:'center'});});await L.sleep(200);
await p.screenshot({path:SC+'25-account-enter-code-390x844.png'});
await p.evaluate(c=>{setVal('acct-code',c);redeemCodeFrom('acct-code','acct-code-msg');},dcode);await L.sleep(1500);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='redeem_invite'&&r.args.p_code===dcode.replace(/-/g,'')),'redeem_invite called with the pasted (grouped) code');
ok((s.tables.vehicles||[]).some(v=>v.id==='d1000000-0000-4000-a000-000000000099'&&v.owner_id==='b1000000-0000-4000-a000-000000000022'),'managed vehicles transferred to the redeeming owner');
ok(await p.evaluate(()=>/Ford/.test(document.body.innerText)),'redeemer now sees the vehicle');
await violations(p,'enter code');await noErr(p,'enter code');
await p.close();

// ---- ?invite=CODE in the URL ----
p=await L.open({q:'?invite=0123456789abcdef0123456789abcdef'});await L.sleep(700);
ok(await p.evaluate(()=>window.location.search===''),'?invite is removed from the address bar after reading');
ok(await p.evaluate(()=>document.getElementById('auth-signup-panel')?document.getElementById('auth-signup-panel').style.display!=='none':true),'sign-up panel opens for an invite link');
ok(await p.evaluate(()=>val('su-code').replace(/-/g,'')==='0123456789abcdef0123456789abcdef'),'invite code auto-filled on sign-up');
await p.screenshot({path:SC+'26-invite-link-signup-390x844.png'});
await p.evaluate(()=>{showSignup(false);document.getElementById('auth-email').value='dana@test.com';document.getElementById('auth-password').value='password123';login();});await L.sleep(1800);
s=await L.state(p);
ok(s.rpcs.some(r=>r.name==='redeem_invite'&&r.args.p_code==='0123456789abcdef0123456789abcdef'),'code from the link is redeemed automatically after login');
ok(await p.evaluate(()=>localStorage.getItem('evo_pending_invite')===null),'stored link code cleared after use');
await noErr(p,'invite link');await p.close();
// invalid link code after login -> friendly toast, no crash
p=await L.open({q:'?invite=deadbeefdeadbeefdeadbeefdeadbeef'});await L.sleep(500);
await p.evaluate(()=>{showSignup(false);document.getElementById('auth-email').value='dana@test.com';document.getElementById('auth-password').value='password123';login();});await L.sleep(1800);
ok(await p.evaluate(()=>/did not work/.test(document.getElementById('toast-container').innerText)),'bad link code -> friendly toast after login');
await noErr(p,'bad invite link');await p.close();

// ---- fallback: migration not applied yet ----
p=await L.open();await L.login(p,'tom@test.com','password123','advisor');
await p.evaluate(()=>{delete window.__MOCK_STATE__.rpcHandlers.create_managed_client;openNewClient();setVal('nc-name','Early Client');addClient();});await L.sleep(900);
ok(/Needs one backend update - Appy is applying it/.test(await p.evaluate(()=>document.getElementById('nc-error').textContent)),'RPC missing -> "Needs one backend update - Appy is applying it" in the form');
ok(/Needs one backend update/.test(await p.evaluate(()=>document.getElementById('toast-container').innerText)),'RPC missing -> toast too');
ok(await p.evaluate(()=>document.getElementById('app-shell').classList.contains('hidden')===false),'app still usable after missing RPC');
await noErr(p,'fallback');await p.close();
// owner sign-in must stay silent when claim_managed_clients does not exist yet
p=await L.open({pre:'window.__PRE_NO_CLAIM=1;'});
await p.evaluate(()=>{delete window.__MOCK_STATE__.rpcHandlers.claim_managed_clients;});
await L.login(p,'olivia@test.com');
ok(await p.evaluate(()=>!/Needs one backend/.test(document.getElementById('toast-container').innerText)),'owner sign-in silent when claim RPC not installed');
await noErr(p,'no claim rpc');await p.close();

// ---- admin (Wade, also the tech) adds a client and a vehicle ----
p=await L.open();await L.login(p,'wade@evo.test','password123','advisor');
await p.evaluate(()=>{openNewClient();setVal('nc-name','Wade Test Client');setVal('nc-email','wade@evo.test');addClient();});await L.sleep(1200);
ok(await p.evaluate(()=>getClients().some(c=>c.name==='Wade Test Client'&&c.managed)),'admin: New client works even with his own email');
await p.evaluate(()=>clientCreatedAddVehicle());await L.sleep(400);
ok(await p.evaluate(()=>document.querySelectorAll('#v-client option').length>3&&/Add vehicle for Wade Test Client/.test(document.getElementById('av-title').textContent)),'admin: client dropdown lists everyone, new client preselected');
await setv(p,'v-year','2020');await setv(p,'v-make','Lotus');await setv(p,'v-model','Emira');
await p.evaluate(()=>saveVehicle());await L.sleep(1500);
s=await L.state(p);
ok((s.tables.vehicles||[]).some(v=>v.make==='Lotus'&&v.owner_id!=='a0000000-0000-4000-a000-000000000001'),'admin: vehicle saved under the managed client');
await violations(p,'admin managed');await noErr(p,'admin managed');await p.close();

// ===== 4. ADMIN view-as =====
console.log('ADMIN');
p=await L.open();await L.login(p,'wade@evo.test','password123','advisor');
ok(await p.evaluate(()=>document.body.innerText.indexOf('The Ghost')>=0),'admin sees all vehicles');
await p.evaluate(()=>{setViewAs('owner','b0000000-0000-4000-a000-000000000002');});await L.sleep(500);
ok(await p.evaluate(()=>/Good (morning|afternoon|evening)/.test(document.body.innerText)),'admin view-as owner renders owner portal');
await p.evaluate(()=>setViewAs('admin'));await L.sleep(300);
await noErr(p,'admin');await p.close();

// ===== 5. OFFLINE / ERROR =====
console.log('ERRORS');
p=await L.open();await L.login(p,'olivia@test.com');
await p.evaluate(()=>{window.__MOCK_STATE__.failOn={table:'expenses',op:'insert',msg:'boom'};});
await p.evaluate(id=>{currentVehicleId=id;openExpenseModal(id);},'d0000000-0000-4000-a000-000000000011');await L.sleep(200);
await setv(p,'ex-amount','50');await p.evaluate(()=>saveExpense());await L.sleep(1500);
ok(await p.evaluate(()=>/Something went wrong|could not|try again/i.test(document.getElementById('toast-container').innerText)),'failed write -> calm toast: '+await p.evaluate(()=>document.getElementById('toast-container').innerText.replace(/\n/g,' ')));
ok(await p.evaluate(()=>!getExpenses().some(e=>e.amount===50)),'failed write rolled back by reload');
await p.evaluate(()=>{window.__MOCK_STATE__.failOn=null;window.__MOCK_STATE__.offline=true;Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.dispatchEvent(new Event('offline'));});await L.sleep(200);
ok(await p.evaluate(()=>document.getElementById('net-banner').style.display!=='none'),'offline banner shown');
await p.evaluate(()=>{window.__MOCK_STATE__.offline=false;Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.dispatchEvent(new Event('online'));});await L.sleep(800);
ok(await p.evaluate(()=>document.getElementById('net-banner').style.display==='none'),'offline banner hidden on reconnect');
await noErr(p,'errors');await p.close();
// boot offline -> retry panel
p=await L.open({pre:'window.__MOCK_STATE__&&0;'});
await p.evaluate(()=>{window.__MOCK_STATE__.session={access_token:'t',user:{id:window.__MOCK_STATE__.ids.O,email:'olivia@test.com',user_metadata:{}}};window.__MOCK_STATE__.offline=true;retryBoot();});await L.sleep(800);
ok(await p.evaluate(()=>document.getElementById('auth-retry-panel').style.display!=='none'),'boot while offline -> retry panel (not a crash)');
await p.screenshot({path:SC+'09-offline-retry-390x844.png'});
await p.evaluate(()=>{window.__MOCK_STATE__.offline=false;retryBoot();});await L.sleep(1200);
ok(await p.evaluate(()=>document.getElementById('auth-screen').style.display==='none'),'retry recovers into the app');
await p.close();

// ===== 6. DESKTOP =====
console.log('DESKTOP');
p=await L.open({desktop:true,w:1280,h:800,dsf:1});await L.login(p,'olivia@test.com');
await p.screenshot({path:SC+'10-owner-home-1280x800.png'});
await p.evaluate(id=>openVehicleDetail(id),'d0000000-0000-4000-a000-000000000011');await L.sleep(500);
await p.screenshot({path:SC+'11-owner-vehicle-1280x800.png'});
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'desktop: no horizontal overflow');
await p.close();
p=await L.open();await L.login(p,'olivia@test.com');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile 390: no horizontal overflow');
await p.close();
console.log('\nPASS '+pass+'  FAIL '+fail);
await L.close();
process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
