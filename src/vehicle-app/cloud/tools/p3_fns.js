//@@fn me
function me(){
  if(!session)return null;
  var real=session.account;
  if(!viewAsActive())return real;
  if(session.viewAs.role==='advisor')return {id:real.id,name:real.name,email:real.email,role:'advisor',viewAs:true};
  var cl=byId(getClients(),session.viewAs.clientId);
  return {id:real.id,name:cl?cl.name:'Owner',email:cl?cl.email:real.email,role:'owner',clientId:session.viewAs.clientId,viewAs:true};
}
//@@fn audit
function audit(action,text,ref){
  ref=ref||{};
  var a=session?session.account:null,vtag=(session&&viewAsActive())?' [admin viewing as '+viewAsLabel()+']':'';
  LOCAL_AUDIT.push({id:uid(),at:new Date().toISOString(),actorId:a?a.id:'',actor:a?(a.name||a.email):'System',role:a?(a.role==='tech'?'advisor':a.role):'system',action:action,text:(String(text||'')+vtag).slice(0,300),clientId:ref.clientId||'',vehicleId:ref.vehicleId||'',ownerVisible:ref.internal?false:true});
  if(LOCAL_AUDIT.length>400)LOCAL_AUDIT=LOCAL_AUDIT.slice(-400);
}
//@@fn imgSrc
function imgSrc(v){
  if(!v||!v.image||typeof v.image!=='string')return null;
  if(v.image.indexOf('data:image/')===0||v.image.indexOf('blob:')===0)return v.image;
  if(v.image.indexOf(SUPABASE_URL+'/storage/')===0)return v.image;
  return null;
}
//@@fn populateClientSelect
function populateClientSelect(id,selected,addOnly){
  var sel=document.getElementById(id);if(!sel)return;
  var clients=getClients().filter(function(c){return !addOnly||canAddVehicleFor(c.id);}),h='<option value="">Select client</option>';
  if(!selected&&clients.length===1)selected=clients[0].id;
  for(var i=0;i<clients.length;i++)h+='<option value="'+esc(clients[i].id)+'"'+(clients[i].id===selected?' selected':'')+'>'+esc(clients[i].name)+(clients[i].managed&&!clients[i].claimed?' (not on app yet)':'')+'</option>';
  sel.innerHTML=h;
}
//@@fn populateVehicleSelect
function populateVehicleSelect(id,clientId,selected,perm){
  var sel=document.getElementById(id);if(!sel)return;
  var vehicles=visibleVehicles();
  if(clientId)vehicles=vehicles.filter(function(v){return v.clientId===clientId;});
  if(perm)vehicles=vehicles.filter(function(v){return can(v,perm);});
  var h='<option value="">Select vehicle</option>';
  for(var i=0;i<vehicles.length;i++){var v=vehicles[i];h+='<option value="'+esc(v.id)+'"'+(v.id===selected?' selected':'')+'>'+esc(vName(v)+' - '+v.year+' '+v.make+' '+v.model)+'</option>';}
  sel.innerHTML=h;
}
//@@fn detailActionsHTML
function detailActionsHTML(v){
  if(isArchivedVehicle(v))return '';
  var b='';
  if(can(v,'can_add_service'))b+='<button class="btn btn-primary btn-sm" onclick="openServiceFromDetail()">Log service</button>';
  if(can(v,'can_add_expenses'))b+='<button class="btn btn-sm" onclick="openExpenseFromDetail()">Expense</button>';
  if(can(v,'can_add_documents'))b+='<button class="btn btn-sm" onclick="openDocFromDetail()">Document</button>';
  if(canManageReminders(v))b+='<button class="btn btn-sm" onclick="openReminderFromDetail()">Reminder</button>';
  if(can(v,'can_add_service'))b+='<button class="btn btn-sm" onclick="openNoteFromDetail()">Note</button><button class="btn btn-sm" onclick="openInspectionForVehicle()">Inspection</button>';
  if(can(v,'can_create_advisories'))b+='<button class="btn btn-sm" onclick="openRecForVehicle()">Advisory</button>';
  if(can(v,'view_photos'))b+='<button class="btn btn-sm" onclick="pickDetailPhoto()">Photo</button>';
  if(canEditVehicle(v)){
    b+='<button class="btn btn-sm" onclick="editCurrentVehicle()">Edit</button>';
    b+='<button class="btn btn-sm" onclick="goAccessFromDetail()">Share with a tech</button>';
    b+='<button class="btn btn-sm" onclick="openTransferModal()">Sell / transfer</button>';
    b+='<button class="btn btn-sm btn-danger" onclick="archiveCurrentVehicle()">Archive</button>';
  }
  return b;
}
//@@fn transferMetaHTML
function transferMetaHTML(v){
  var h,t;
  if(isArchivedVehicle(v)){
    h='<div class="xfer-note"><span class="lab">'+(v.archiveReason==='transferred'?'Read-only copy, transferred out':'Read-only archive')+'</span>';
    h+=esc(fmtDate(String(v.archivedAt||'').slice(0,10)));
    if(v.archiveNote)h+='. '+esc(v.archiveNote);
    return h+'</div>';
  }
  t=C.transfers[v.id];
  if(t&&canEditVehicle(v)){
    return '<div class="xfer-note"><span class="lab">Transfer pending</span>Waiting for the new owner to enter the code. Expires '+esc(fmtDate(String(t.expires_at||'').slice(0,10)))+'. <span class="link" onclick="cancelPendingTransfer(\''+jsId(t.id)+'\')">Cancel transfer</span></div>';
  }
  return '';
}
//@@fn openTransferModal
function openTransferModal(){
  var v=byId(getVehicles(),currentVehicleId);
  if(!v){showToast('Vehicle not found','error');return;}
  if(!requireEdit(v)||refuseIfArchived(v))return;
  if(C.transfers[v.id]){showToast('A transfer is already pending for this vehicle. Cancel it first to start another.','error');return;}
  elText('xfer-vehicle-name',vName(v)+' - '+vFull(v));
  setVal('xfer-email','');
  openModal('modal-transfer');
}
//@@fn confirmTransfer
async function confirmTransfer(){
  var v=byId(getVehicles(),currentVehicleId);
  if(!v){showToast('Vehicle not found','error');return;}
  if(!requireEdit(v)||refuseIfArchived(v))return;
  var email=normEmail(val('xfer-email'));
  if(email&&!validEmail(email)){showToast('That email address does not look right','error');return;}
  if(!window.confirm('Create a transfer code for '+vName(v)+'?\n\nWhen the buyer enters the code, the vehicle moves to their collection. You keep a read-only archive of the records up to then. Your expenses, reminders, purchase details and tech access for this vehicle are removed from the live record.\n\nYou can cancel before the code is used.'))return;
  if(Q.pending>0){showToast('Still saving your last changes. Try again in a moment.','error');return;}
  try{
    var r=chk(await sb.rpc('initiate_transfer',{p_vehicle_id:v.id,p_buyer_email:email||null}));
    var row=Array.isArray(r.data)?r.data[0]:r.data;
    if(!row||!row.code)throw new Error('No code returned');
    audit('transfer.initiated','Transfer code created for '+vName(v),{clientId:v.clientId,vehicleId:v.id,internal:true});
    closeModal('modal-transfer');closeModal('modal-vehicle-detail');
    await loadAll();
    refreshCurrent();
    showInviteResult({title:'Transfer code',code:row.code,expires:row.expires_at,who:vName(v)+' - '+vFull(v),help:'Give this one-time code to the buyer. They enter it under Account, Redeem a code, and the vehicle moves to their collection. You keep a read-only archive. Cancel any time before it is used.'});
  }catch(e){showToast(friendlyError(e),'error');}
}
async function cancelPendingTransfer(tid){
  if(!window.confirm('Cancel this transfer? The code stops working and the vehicle stays with you.'))return;
  try{
    chk(await sb.rpc('cancel_transfer',{p_transfer_id:tid}));
    await loadAll();refreshCurrent();
    if(currentVehicleId)openVehicleDetail(currentVehicleId);
    showToast('Transfer cancelled','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
function goAccessFromDetail(){closeModal('modal-vehicle-detail');showPage('access');}
//@@fn docRowHTML
function docRowHTML(d){
  var v=byId(getVehicles(),d.vehicleId),canDel=v&&!isArchivedVehicle(v)&&(canEditVehicle(v)||(d.by===myId()&&can(v,'can_add_documents')));
  var thumb;
  if(d.image&&typeof d.image==='string'&&(d.image.indexOf('data:image/')===0||d.image.indexOf(SUPABASE_URL+'/storage/')===0))thumb='<img class="doc-thumb" src="'+esc(d.image)+'" alt="" onclick="openImageView(\'doc\',\''+jsId(d.id)+'\')">';
  else if(d.fileUrl&&d.fileUrl.indexOf(SUPABASE_URL+'/storage/')===0)thumb='<a class="doc-icon" style="text-decoration:none;" href="'+esc(d.fileUrl)+'" target="_blank" rel="noopener">PDF</a>';
  else thumb='<div class="doc-icon">DOC</div>';
  return '<div class="doc-row">'+thumb+'<div style="flex:1;min-width:0;"><div class="doc-name">'+esc(d.name)+'</div><div class="doc-meta" style="text-transform:capitalize;">'+esc(d.type)+(d.notes?' / '+esc(d.notes):'')+'</div></div>'+(d.expiry?'<div class="doc-expiry">'+docExpiryHTML(d.expiry)+'</div>':'')+(canDel?'<button class="btn btn-sm" onclick="deleteDocument(\''+jsId(d.id)+'\')">Remove</button>':'')+'</div>';
}
//@@fn saveDocument
function saveDocument(){
  var vid=val('doc-vehicle'),type=val('doc-type')||'other',name=val('doc-name').trim();
  if(!vid){showToast('Select a vehicle','error');return;}
  var vs=getVehicles(),v=byId(vs,vid);if(!v){showToast('Vehicle not found','error');return;}
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_documents'))return;
  if(!name){var tl=document.getElementById('doc-type'),opt=tl&&tl.options[tl.selectedIndex];name=opt?opt.text:'Document';}
  var expiry=val('doc-expiry'),f=ctxFile.doc||null;
  var d={id:uid(),vehicleId:vid,clientId:v.clientId,type:type,name:name.slice(0,120),expiry:expiry,notes:val('doc-notes').trim().slice(0,240),image:ctxPhoto.doc||'',fileUrl:'',_file:f,createdAt:new Date().toISOString(),by:me().id};
  var docs=getDocs();docs.push(d);
  if(!setDocs(docs))return;
  var synced='';
  if(parseDate(expiry)&&canManageReminders(v)){
    if(type==='registration'&&!dateField(v,'regExpiry')){v.regExpiry=expiry;synced='registration date';}
    else if(type==='insurance'&&!dateField(v,'insRenewal')){v.insRenewal=expiry;synced='insurance renewal date';}
    if(synced){v.updatedAt=new Date().toISOString();setVehicles(vs);}
  }
  setUI('lastVehicle',vid);setUI('docType',type);
  audit('document.added','Document recorded for '+vName(v)+': '+d.name+(synced?' (set '+synced+')':''),{clientId:v.clientId,vehicleId:v.id});
  closeModal('modal-document');
  clearPhoto('doc');
  refreshCurrent();
  showToast(synced?'Document saved. Reminder set from its date.':'Document saved','success');
  afterDetailSave(vid);
}
//@@fn openDocModal
function openDocModal(vid){
  populateVehicleSelect('doc-vehicle',null,prefVehicleId(vid),'can_add_documents');
  setVal('doc-name','');setVal('doc-notes','');setVal('doc-expiry','');
  var dt=getUI().docType;setVal('doc-type',(dt&&/^(title|registration|insurance|invoice|service|provenance|appraisal|other)$/.test(dt))?dt:'registration');
  clearPhoto('doc');
  openModal('modal-document');
}
//@@fn clearPhoto
function clearPhoto(ctx){
  ctxPhoto[ctx]=null;ctxFile[ctx]=null;
  var i=document.getElementById(ctx+'-img-input');if(i)i.value='';
  var s=document.getElementById(ctx+'-img-src');if(s){s.removeAttribute('src');s.style.display='';}
  var n=document.getElementById(ctx+'-file-name');if(n)n.textContent='';
  showEl(ctx+'-img-preview',false);
}
//@@fn handlePhoto
function handlePhoto(input,ctx){
  var file=input&&input.files&&input.files[0];if(!file)return;
  var isPdf=(file.type==='application/pdf')||/\.pdf$/i.test(file.name||'');
  if(isPdf){
    if(file.size>10*1024*1024){showToast('That PDF is over 10 MB. Choose a smaller file.','error');input.value='';return;}
    ctxFile[ctx]={blob:file,mime:'application/pdf',name:file.name||'document.pdf'};ctxPhoto[ctx]='';
    var s0=document.getElementById(ctx+'-img-src');if(s0){s0.removeAttribute('src');s0.style.display='none';}
    var n0=document.getElementById(ctx+'-file-name');if(n0)n0.textContent='PDF attached: '+(file.name||'document.pdf');
    showEl(ctx+'-img-preview',true);
    showToast('PDF ready','success');return;
  }
  readResized(file,input,function(out){
    ctxPhoto[ctx]=out;ctxFile[ctx]={blob:dataUrlToBlob(out),mime:'image/jpeg',name:'photo.jpg'};
    var s=document.getElementById(ctx+'-img-src');if(s){s.style.display='';s.src=out;}
    var n=document.getElementById(ctx+'-file-name');if(n)n.textContent='';
    showEl(ctx+'-img-preview',true);
    showToast('Photo ready ('+Math.round(dataUrlBytes(out)/1024)+' KB)','success');
  });
}
function readResized(file,input,cb){
  if(!file.type||file.type.indexOf('image/')!==0){showToast('Please choose a photo (image file)','error');if(input)input.value='';return;}
  if(file.size>MAX_RAW_BYTES){showToast('Photo is too large (over 15 MB). Choose a smaller image.','error');if(input)input.value='';return;}
  var reader=new FileReader();
  reader.onerror=function(){showToast('Could not read this photo','error');};
  reader.onload=function(e){
    var img=new Image();
    img.onerror=function(){showToast('This image format is not supported here. Try a JPEG or PNG.','error');};
    img.onload=function(){
      var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
      if(!w||!h){showToast('Could not read this photo','error');return;}
      var scale=Math.min(1,MAX_PHOTO_DIM/Math.max(w,h));
      var cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
      var canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
      var cx=canvas.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cw,ch);cx.drawImage(img,0,0,cw,ch);
      var out=canvas.toDataURL('image/jpeg',0.7);
      if(dataUrlBytes(out)>MAX_PHOTO_BYTES)out=canvas.toDataURL('image/jpeg',0.5);
      if(dataUrlBytes(out)>MAX_PHOTO_BYTES){showToast('Photo is still over 1.5 MB after resizing. Choose a different image.','error');return;}
      cb(out);
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
//@@fn openImageView
function openImageView(kind,id){
  var row=byId(kind==='doc'?getDocs():getExpenses(),id);
  if(!row||!row.image||typeof row.image!=='string'||(row.image.indexOf('data:image/')!==0&&row.image.indexOf(SUPABASE_URL+'/storage/')!==0)){showToast('No photo on this record','error');return;}
  var v=byId(getVehicles(),row.vehicleId);
  if(!v||!canSeeVehicle(v)){showToast('Not available','error');return;}
  var el=document.getElementById('img-view-src');if(el)el.src=row.image;
  elHTML('img-view-actions','');
  openModal('modal-image-view');
}
//@@fn reopenRec
function reopenRec(id){showToast('The owner declined this one. Send a new advisory if things change.','error');}
//@@fn recCardHTML
function recCardHTML(r,owner,vehicles,clients){
  var v=byId(vehicles,r.vehicleId),c=byId(clients,r.clientId);
  var color=URG_COLOR[r.urgency];
  var label=r.urgency==='red'?'Immediate':r.urgency==='yellow'?'Soon':'Monitor';
  var impact=r.valueImpact==='additive'?'Adds value':r.valueImpact==='protective'?'Protects value':'';
  var actions='';
  if(owner&&r.status==='open')actions+='<button class="btn btn-primary btn-sm" onclick="openRespond(\''+jsId(r.id)+'\',\'accepted\')">Accept</button><button class="btn btn-sm" onclick="openRespond(\''+jsId(r.id)+'\',\'declined\')">Decline</button>';
  if(r.status==='accepted')actions+='<button class="btn btn-primary btn-sm" onclick="completeRec(\''+jsId(r.id)+'\')">Mark completed</button>';
  if(canEditVehicle(v)||(r.by===myId()&&r.status==='open'))actions+='<button class="btn btn-sm btn-danger" onclick="deleteRec(\''+jsId(r.id)+'\')">Delete</button>';
  return '<div class="rec-card"><div style="flex:1;min-width:220px;">'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;"><span class="status-chip" style="color:'+color+';border-color:'+color+'66;">'+label+'</span>'+statusChip(r.status,owner)+'</div>'+
    '<div class="rec-title">'+esc(r.title)+'</div>'+
    '<div class="doc-meta">'+esc((owner?'':(c?c.name+' / ':''))+(v?vFull(v):'Collection-wide')+(r.date?' / '+fmtDate(r.date):'')+(impact?' / '+impact:''))+'</div>'+(v?nickHTML(v):'')+
    '<div class="rec-desc">'+esc(r.description||'')+'</div>'+
    (r.cost?'<div class="doc-meta" style="margin-top:8px;color:var(--gold);">Estimated '+esc(r.cost)+'</div>':'')+
    responseHTML(r)+(actions?'<div class="rec-actions">'+actions+'</div>':'')+'</div></div>';
}
//@@fn openAccountModal
function openAccountModal(){
  if(!session)return;
  var a=session.account;
  elText('acct-name',a.name||'');
  elText('acct-email',a.email||'');
  elText('acct-role',isOwner()?'Owner':(isAdmin()?'Admin':'Advisor / Tech'));
  elText('acct-export-note','Downloads a copy of everything you can see in EVOai as a JSON file. Keep it somewhere private.');
  setVal('pw-current','');setVal('pw-new','');setVal('acct-code',pendingInviteCode()?groupCode(pendingInviteCode()):'');
  elText('acct-code-msg','');
  setDisp('.redeem-sec',!realAdmin());
  openModal('modal-account');
}
//@@fn exportData
function exportData(){
  if(!session)return;
  var stamp=todayISO(),vs=getVehicles().filter(function(v){return canSeeVehicle(v);}),vids={},j;
  for(j=0;j<vs.length;j++)vids[vs[j].id]=1;
  function mine(x){return vids[x.vehicleId];}
  function strip(o,drop){var r={},k;for(k in o)if(o.hasOwnProperty(k)&&k.charAt(0)!=='_'&&drop.indexOf(k)<0)r[k]=o[k];return r;}
  var a=session.account;
  var out={app:'EVOai',kind:'export',version:7,exportedAt:new Date().toISOString(),
    account:{name:a.name||'',email:a.email||'',role:a.role},
    vehicles:vs.map(function(v){return strip(v,['image','reminders']);}),
    inspections:getInspections().filter(mine),
    advisories:getRecs().filter(mine).map(function(r){return {title:r.title,vehicleId:r.vehicleId,urgency:r.urgency,status:r.status,cost:r.cost,description:r.description,date:r.date,response:r.response||null,completedAt:r.completedAt||null};}),
    expenses:getExpenses().filter(mine).map(function(e){var o=strip(e,['image']);o.hasReceipt=!!e.image;return o;}),
    documents:getDocs().filter(mine).map(function(d){var o=strip(d,['image','fileUrl']);o.hasFile=!!(d.image||d.fileUrl);return o;}),
    reminders:reminderItems(vs).map(function(it){return {vehicleId:it.vid,kind:it.kind,title:remPhrase(it),due:it.due||'',repeat:it.repeat};})};
  if(downloadJSON(out,'evoai-export-'+stamp+'.json'))showToast('Your data was downloaded','success');
}
//@@fn changePassword
async function changePassword(){
  if(viewAsActive()){showToast('Return to Admin to change your password.','error');return;}
  var cur=val('pw-current'),nw=val('pw-new');
  if(!cur||!nw){showToast('Enter your current and new password','error');return;}
  if(nw.length<8){showToast('New password must be at least 8 characters','error');return;}
  try{
    var re=await sb.auth.signInWithPassword({email:session.account.email,password:cur});
    if(re.error){showToast('Current password is incorrect','error');return;}
    var up=await sb.auth.updateUser({password:nw});
    if(up.error)throw up.error;
    setVal('pw-current','');setVal('pw-new','');
    showToast('Password updated','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
//@@fn deleteMyAccount
function deleteMyAccount(){
  showToast('To delete your account, email your advisor. We keep this simple and safe for now.','error');
}
//@@fn refreshAI
function refreshAI(){showToast('AI estimates are calculated for you once the AI service is connected.','error');}
//@@add
var ctxFile={doc:null,ex:null};
function canRemoveExpenses(){return !!(session&&(realAdmin()||session.account.role==='owner'));}
function photosHTML(v){
  if(isArchivedVehicle(v)||!can(v,'view_photos'))return '';
  var ph=(v._photos||[]).filter(function(p){return p.url;}),h='<div class="sh"><h2>Photos</h2></div>';
  if(ph.length)h+='<div class="photo-strip">'+ph.map(function(p){return '<div class="ph-item"><img src="'+esc(p.url)+'" alt="" onclick="viewPhoto(\''+jsId(p.id)+'\')">'+(p.isCover?'<span class="ph-cover">Cover</span>':'')+'</div>';}).join('')+'</div>';
  else h+=mutedLine('No photos yet.');
  return h;
}
function pickDetailPhoto(){var i=document.getElementById('vd-photo-input');if(i)i.click();}
function handleDetailPhoto(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  var v=byId(getVehicles(),currentVehicleId);
  if(!v||!can(v,'view_photos')){showToast('Photos are not enabled for you on this vehicle.','error');input.value='';return;}
  readResized(file,input,function(out){
    input.value='';
    var cover=!(v._photos||[]).some(function(p){return p.isCover;});
    if(cover)v.image=out;
    enqueue('photo',async function(){
      var su=await uploadPhoto(v,dataUrlToBlob(out),cover);
      if(cover&&su)v.image=su;
      refreshDetailIfOpen();refreshCurrent();
    });
    showToast('Uploading photo...','success');

  });
}
function viewPhoto(pid){
  var v=byId(getVehicles(),currentVehicleId),p=v&&(v._photos||[]).filter(function(x){return x.id===pid;})[0];
  if(!p)return;
  var el=document.getElementById('img-view-src');if(el)el.src=p.url;
  var h='';
  if(canEditVehicle(v)&&!p.isCover)h+='<button class="btn btn-sm" onclick="makeCoverPhoto(\''+jsId(pid)+'\')">Make cover</button>';
  if(canEditVehicle(v)||p.by===myId())h+='<button class="btn btn-sm btn-danger" onclick="deleteVehiclePhoto(\''+jsId(pid)+'\')">Delete photo</button>';
  elHTML('img-view-actions',h);
  openModal('modal-image-view');
}
async function makeCoverPhoto(pid){
  var v=byId(getVehicles(),currentVehicleId);if(!v||!canEditVehicle(v))return;
  try{
    chk(await sb.from('vehicle_photos').update({is_cover:false}).eq('vehicle_id',v.id).eq('is_cover',true));
    chk(await sb.from('vehicle_photos').update({is_cover:true}).eq('id',pid));
    closeModal('modal-image-view');await loadAll();refreshCurrent();refreshDetailIfOpen();showToast('Cover photo updated','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
async function deleteVehiclePhoto(pid){
  var v=byId(getVehicles(),currentVehicleId),p=v&&(v._photos||[]).filter(function(x){return x.id===pid;})[0];
  if(!p||!window.confirm('Delete this photo?'))return;
  try{
    chk(await sb.from('vehicle_photos').delete().eq('id',pid));
    removeObject('vehicle-photos',p.path);
    closeModal('modal-image-view');await loadAll();refreshCurrent();refreshDetailIfOpen();showToast('Photo deleted','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
function toggleFinFields(clientId){
  var on=!!(session&&(realAdmin()||session.account.role==='owner'||(clientId?managedMine(clientId):C.clients.some(function(c){return managedMine(c.id);}))));
  setDisp('.fin-only',on);
}
// 'Add vehicle for <client>': opens the add-vehicle form with the client preselected
function openAddVehicleFor(clientId){
  var c=byId(getClients(),clientId);
  if(!c||!canAddVehicleFor(clientId)){showToast('You cannot add vehicles for this client.','error');return;}
  currentClientId=clientId;
  openAddVehicleModal(clientId);
}
function vehicleClientChanged(){
  var id=val('v-client'),c=byId(getClients(),id);
  elText('av-title',c&&!editingVehicleId&&c.id!==myId()?('Add vehicle for '+c.name):'Add vehicle');
  toggleFinFields(id||null);
}
var wasOffline=false;
function wireNet(){
  function upd(){
    var on=navigator.onLine!==false;
    showEl('net-banner',!on,'block');
    if(!on){wasOffline=true;return;}
    if(wasOffline&&session&&!reloading&&Q.pending===0){wasOffline=false;reloadAll(true);}
  }
  window.addEventListener('online',upd);window.addEventListener('offline',upd);upd();
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden&&session&&C.loadedAt&&Date.now()-C.loadedAt>40*60*1000&&Q.pending===0&&!reloading)reloadAll(true);
  });
}
function registerSW(){
  if('serviceWorker' in navigator&&/^https?:/.test(location.protocol)){
    window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
  }
}
function showA2HS(){
  var ua=navigator.userAgent||'';
  var ios=/iphone|ipad|ipod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var standalone=(window.navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
  var force=/[?&]a2hs=1/.test(location.search);
  showEl('a2hs-card',force||(ios&&!standalone&&!DB.get('evoai_a2hs',false)));
}
function dismissA2HS(){DB.set('evoai_a2hs',true);showEl('a2hs-card',false);}
document.addEventListener('DOMContentLoaded',function(){
  selectRole('advisor');wireNet();registerSW();showA2HS();
  if(/type=recovery/.test(location.hash||''))recoveryMode=true;
  readUrlInvite();
  if(!initClient()){authPanels('login');return;}
  initAuthEvents();
  retryBoot();
});
