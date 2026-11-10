// ============ AI DOCUMENT SCANNING + AI REMINDERS (scan-document Edge Function, migration_007) ============
// The key never reaches the client: the app only calls sb.functions.invoke('scan-document'). Every failure falls back to manual entry.
var DOCAI={cols:null,fn:null,edit:null,busy:0,token:0};
var DOCAI_REM={};
var DOCAI_CATS=[['repair_invoice','Repair invoice'],['service_record','Service record'],['registration','Registration'],['insurance','Insurance'],['title','Title'],['inspection','Inspection'],['warranty','Warranty'],['receipt','Receipt'],['other','Other']];
var DOCAI_TO_TYPE={repair_invoice:'invoice',service_record:'service',registration:'registration',insurance:'insurance',title:'title',inspection:'other',warranty:'other',receipt:'invoice',other:'other'};
var DOCAI_TO_KIND={repair_invoice:'invoice',service_record:'other',registration:'registration',insurance:'insurance',title:'title',inspection:'inspection',warranty:'other',receipt:'receipt',other:'other'};
var DOCAI_TYPE_TO_CAT={invoice:'repair_invoice',service:'service_record',registration:'registration',insurance:'insurance',title:'title',provenance:'other',appraisal:'other',other:'other'};
var DOCAI_KIND_LBL={tag:'Registration',insurance:'Insurance',inspection:'Inspection',service:'Service',custom:'Reminder'};
function docAiCatLabel(c){for(var i=0;i<DOCAI_CATS.length;i++)if(DOCAI_CATS[i][0]===c)return DOCAI_CATS[i][1];return 'Other';}
function docAiFromRow(dr){
  if(!dr||!Object.prototype.hasOwnProperty.call(dr,'ai_status')){if(dr&&DOCAI.cols===null)DOCAI.cols=false;return null;}
  DOCAI.cols=true;
  return {category:dr.doc_category||null,docDate:dr.doc_date||'',vendor:dr.vendor||'',mileage:dr.mileage==null?null:+dr.mileage,amount:dr.amount==null?null:+dr.amount,
    services:Array.isArray(dr.services)?dr.services:[],expiresOn:dr.expires_on||'',status:dr.ai_status||'manual',confidence:dr.ai_confidence==null?null:+dr.ai_confidence,summary:dr.ai_summary||'',model:dr.ai_model||''};
}
function docAiDate(d){return (d.ai&&d.ai.docDate)||String(d.createdAt||'').slice(0,10);}
function docAiSort(list){return list.slice().sort(function(a,b){return docAiDate(b).localeCompare(docAiDate(a))||String(b.createdAt||'').localeCompare(String(a.createdAt||''));});}
function docAiCanEdit(d){var v=byId(getVehicles(),d.vehicleId);return !!(v&&!isArchivedVehicle(v)&&(canEditVehicle(v)||(d.by===myId()&&can(v,'can_add_documents'))));}
function docAiHasFile(d){return !!(d.image||d.fileUrl||(d.mime&&d.mime!=='text/plain'));}
function docRowHTML(d){
  var v=byId(getVehicles(),d.vehicleId),canDel=docAiCanEdit(d),a=d.ai;
  var thumb;
  if(d.image&&typeof d.image==='string'&&(d.image.indexOf('data:image/')===0||d.image.indexOf(SUPABASE_URL+'/storage/')===0))thumb='<img class="doc-thumb" src="'+esc(d.image)+'" alt="" onclick="openImageView(\'doc\',\''+jsId(d.id)+'\')">';
  else if(d.fileUrl&&d.fileUrl.indexOf(SUPABASE_URL+'/storage/')===0)thumb='<a class="doc-icon" style="text-decoration:none;" href="'+esc(d.fileUrl)+'" target="_blank" rel="noopener">PDF</a>';
  else thumb='<div class="doc-icon">DOC</div>';
  var cat=a&&a.category?docAiCatLabel(a.category):(d.type?d.type.charAt(0).toUpperCase()+d.type.slice(1):'Other');
  var meta=[cat,fmtDate(docAiDate(d))];
  if(a&&a.vendor)meta.push(a.vendor);
  if(a&&a.mileage!=null)meta.push(Number(a.mileage).toLocaleString('en-US')+' mi');
  if(a&&a.amount!=null)meta.push(money(a.amount));
  var badge=a&&(a.status==='scanned'||a.status==='edited')?'<span class="dai-pill">'+(a.status==='edited'?'AI / edited':'Read by AI')+'</span>':'';
  var svc=a&&a.services&&a.services.length?'<div class="dai-svc">'+esc(a.services.slice(0,4).join(' / ')+(a.services.length>4?' / +'+(a.services.length-4)+' more':''))+'</div>':'';
  var btns=(canDel?'<button class="btn btn-sm" onclick="docAiOpenEdit(\''+jsId(d.id)+'\')">Details</button>':'')+(canDel?'<button class="btn btn-sm" onclick="deleteDocument(\''+jsId(d.id)+'\')">Remove</button>':'');
  return '<div class="doc-row dai-row" data-doc="'+esc(d.id)+'">'+thumb+'<div style="flex:1;min-width:0;"><div class="doc-name">'+esc(d.name)+badge+'</div><div class="doc-meta">'+esc(meta.join(' / '))+(d.notes?' / '+esc(d.notes):'')+'</div>'+svc+'</div>'+
    ((d.expiry||(a&&a.expiresOn))?'<div class="doc-expiry">'+docExpiryHTML((a&&a.expiresOn)||d.expiry)+'</div>':'')+'<div class="dai-btns">'+btns+'</div></div>';
}
function docsGroupedHTML(vehicles,docs,emptyMsg){
  var h='';
  var groups=vehicles.map(function(v){return {v:v,docs:docAiSort(docs.filter(function(d){return d.vehicleId===v.id;}))};}).filter(function(g){return g.docs.length;});
  groups.sort(function(a,b){return docAiDate(b.docs[0]).localeCompare(docAiDate(a.docs[0]));});
  groups.forEach(function(g){h+='<div class="sh"><h2>'+esc(vFull(g.v))+nickHTML(g.v)+'</h2><span class="dai-sorted">Newest first</span></div>'+g.docs.map(docRowHTML).join('');});
  return h||emptyCard(emptyMsg);
}
// ---------- Save & scan ----------
function docAiFnAvailable(){return typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function'&&DOCAI.fn!==false;}
async function docAiSaveAndScan(){
  if(DOCAI.busy)return;
  var vid=val('doc-vehicle'),type=val('doc-type')||'other',name=val('doc-name').trim();
  if(!vid){showToast('Select a vehicle','error');return;}
  var vs=getVehicles(),v=byId(vs,vid);if(!v){showToast('Vehicle not found','error');return;}
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_documents'))return;
  var f=ctxFile.doc||null;
  if(!f||!f.blob){showToast('Add a photo or PDF of the document first','error');return;}
  if(!name){var tl=document.getElementById('doc-type'),opt=tl&&tl.options[tl.selectedIndex];name=opt?opt.text:'Document';}
  var d={id:uid(),vehicleId:vid,clientId:v.clientId,type:type,name:name.slice(0,120),expiry:val('doc-expiry'),notes:val('doc-notes').trim().slice(0,240),_file:f,by:myId()};
  DOCAI.busy=1;var btn=document.getElementById('doc-scan-btn');if(btn){btn.disabled=true;btn.textContent='Uploading...';}
  try{await docUpload(d);}
  catch(e){DOCAI.busy=0;if(btn){btn.disabled=false;btn.textContent='Save & scan with AI';}showToast(friendlyError(e),'error');return;}
  DOCAI.busy=0;if(btn){btn.disabled=false;btn.textContent='Save & scan with AI';}
  try{audit('document.added','Document recorded for '+vName(v)+': '+d.name,{clientId:v.clientId,vehicleId:v.id});}catch(e){}
  closeModal('modal-document');clearPhoto('doc');
  try{await loadAll();refreshCurrent();}catch(e){}
  var doc=byId(getDocs(),d.id)||{id:d.id,vehicleId:vid,name:d.name,type:type,expiry:d.expiry,notes:d.notes,mime:f.mime,by:myId(),ai:null};
  docAiOpenEdit(doc.id,true,doc);
}
function docAiClassify(err,body){
  var st=err&&err.context&&err.context.status,nm=err&&err.name;
  if(nm==='FunctionsFetchError')return {off:false,msg:'Could not reach AI scanning (offline?). Enter the details below, or try Scan again later.'};
  if(st===404||st===503)return {off:true,msg:'AI scanning is not turned on yet. Your document is saved - enter the details below.'};
  if(st===429)return {off:false,msg:'Daily scan limit reached. Enter the details below, or scan again tomorrow.'};
  if(st===413)return {off:false,msg:'This file is too large to scan (10 MB max). Enter the details below.'};
  if(st===401)return {off:false,msg:'Your sign-in has expired. Sign out and back in to scan.'};
  return {off:false,msg:(body&&body.message)||'Could not read this document right now. Enter the details below.'};
}
async function docAiScan(docId){
  var my=++DOCAI.token;
  docAiState('scanning');
  if(!docAiFnAvailable()){docAiState('note','AI scanning is not turned on yet. Your document is saved - enter the details below.');return;}
  var r;
  try{r=await sb.functions.invoke('scan-document',{body:{document_id:docId}});}catch(e){r={data:null,error:e};}
  if(my!==DOCAI.token||!DOCAI.edit||DOCAI.edit.id!==docId)return;
  if(r&&r.error){
    var body=null;try{if(r.error.context&&typeof r.error.context.json==='function')body=await r.error.context.json();}catch(e){}
    var c=docAiClassify(r.error,body);if(c.off)DOCAI.fn=false;
    docAiState('note',c.msg);return;
  }
  var s=r&&r.data;
  if(!s||typeof s!=='object'||!s.category){docAiState('note','The scan did not return usable details. Enter them below.');return;}
  DOCAI.fn=true;
  DOCAI.edit.scan=s;
  docAiFill({category:s.category,title:s.title,docDate:s.doc_date,vendor:s.vendor,mileage:s.mileage,amount:s.amount,expiresOn:s.expires_on,services:s.services||[],summary:s.summary||''});
  DOCAI.edit.base=docAiRead();
  DOCAI.edit.rems=(s.reminders||[]).map(function(x){return {kind:x.kind,title:x.title,due_date:x.due_date,due_mileage:x.due_mileage,repeat_months:x.repeat_months,repeat_miles:x.repeat_miles,reason:x.reason,on:true};});
  docAiRenderRems();
  docAiState('done','Read by AI ('+Math.round((s.confidence||0)*100)+'% confident). Check the details, edit anything, then save.');
}
// ---------- editor ----------
function docAiModalHTML(){
  return '<div class="modal-overlay" id="modal-docscan"><div class="modal">'+
    '<div class="modal-header"><div class="modal-title" id="dai-title">Document details</div><button class="modal-close" onclick="docAiClose()">&#10005;</button></div>'+
    '<div id="dai-state" class="dai-state"></div>'+
    '<div class="form-grid">'+
      '<div class="input-group"><label>Category</label><select id="dai-cat">'+DOCAI_CATS.map(function(c){return '<option value="'+c[0]+'">'+c[1]+'</option>';}).join('')+'</select></div>'+
      '<div class="input-group"><label>Document date</label><input type="date" id="dai-date"></div>'+
      '<div class="input-group form-full"><label>Title</label><input type="text" id="dai-name" maxlength="120"></div>'+
      '<div class="input-group"><label>Vendor / issuer</label><input type="text" id="dai-vendor" maxlength="120"></div>'+
      '<div class="input-group"><label>Mileage</label><input type="number" id="dai-miles" min="0" inputmode="numeric"></div>'+
      '<div class="input-group"><label>Amount</label><input type="number" id="dai-amount" min="0" step="0.01" inputmode="decimal"></div>'+
      '<div class="input-group"><label>Expiry / renewal</label><input type="date" id="dai-exp"></div>'+
      '<div class="input-group form-full"><label>Services performed (one per line)</label><textarea id="dai-svc" rows="3" maxlength="2000"></textarea></div>'+
    '</div>'+
    '<div class="dai-rems-wrap"><div class="sh first"><h2>AI reminders</h2><span class="dai-sorted" id="dai-rem-note"></span></div><div id="dai-rems"></div></div>'+
    '<div class="flex gap-2 mt-4 dai-actions">'+
      '<button class="btn btn-ghost" id="dai-rescan" onclick="docAiRescan()">Scan again</button>'+
      '<span style="flex:1"></span><button class="btn btn-ghost" onclick="docAiClose()">Cancel</button>'+
      '<button class="btn btn-primary" id="dai-save" onclick="docAiSave()">Save details</button>'+
    '</div></div></div>';
}
function docAiEnsureModal(){if(!document.getElementById('modal-docscan')){var w=document.createElement('div');w.innerHTML=docAiModalHTML();document.body.appendChild(w.firstChild);}}
function docAiState(kind,msg){
  var el=document.getElementById('dai-state');if(!el)return;
  el.className='dai-state dai-'+kind;
  el.innerHTML=kind==='scanning'?'<span class="dai-spin"></span>Reading your document with AI...':esc(msg||'');
  var b=document.getElementById('dai-save');if(b)b.disabled=kind==='scanning';
  var rs=document.getElementById('dai-rescan');if(rs)rs.style.display=(DOCAI.edit&&DOCAI.edit.hasFile&&DOCAI.fn!==false)?'':'none';
}
function docAiFill(o){
  setVal('dai-cat',o.category||'other');setVal('dai-date',o.docDate||'');setVal('dai-name',o.title||'');setVal('dai-vendor',o.vendor||'');
  setVal('dai-miles',o.mileage==null?'':String(o.mileage));setVal('dai-amount',o.amount==null?'':String(o.amount));setVal('dai-exp',o.expiresOn||'');
  setVal('dai-svc',(o.services||[]).join('\n'));
}
function docAiRead(){
  var n=function(id){var x=val(id).trim();if(x==='')return null;var k=Number(x);return isFinite(k)&&k>=0?k:null;};
  return {category:val('dai-cat')||'other',docDate:val('dai-date')||null,title:val('dai-name').trim().slice(0,120),vendor:val('dai-vendor').trim().slice(0,120)||null,
    mileage:n('dai-miles')==null?null:Math.round(n('dai-miles')),amount:n('dai-amount')==null?null:Math.round(n('dai-amount')*100)/100,expiresOn:val('dai-exp')||null,
    services:val('dai-svc').split('\n').map(function(s){return s.trim().slice(0,120);}).filter(function(s){return s;}).slice(0,40)};
}
function docAiOpenEdit(id,scan,fallbackDoc){
  var d=byId(getDocs(),id)||fallbackDoc;if(!d)return;
  docAiEnsureModal();
  var v=byId(getVehicles(),d.vehicleId),a=d.ai||{};
  DOCAI.edit={id:d.id,vehicleId:d.vehicleId,doc:d,scan:null,base:null,rems:[],hasFile:docAiHasFile(d)||!!scan,notes:d.notes||''};
  document.getElementById('dai-title').textContent=(v?vName(v)+' - ':'')+'Document details';
  docAiFill({category:a.category||DOCAI_TYPE_TO_CAT[d.type]||'other',title:d.name,docDate:a.docDate||'',vendor:a.vendor,mileage:a.mileage,amount:a.amount,expiresOn:a.expiresOn||d.expiry||'',services:a.services||[]});
  DOCAI.edit.base=docAiRead();
  docAiRenderRems();
  openModal('modal-docscan');
  if(scan)docAiScan(d.id);
  else docAiState('idle',a.status==='scanned'||a.status==='edited'?('Read by AI'+(a.status==='edited'?', then edited':'')+'. You can change anything.'):'Enter or correct the details. '+(DOCAI.edit.hasFile&&DOCAI.fn!==false?'Or tap Scan again to read it with AI.':''));
}
function docAiRescan(){if(DOCAI.edit)docAiScan(DOCAI.edit.id);}
function docAiClose(){DOCAI.token++;DOCAI.edit=null;closeModal('modal-docscan');}
function docAiRemDue(r){var p=[];if(r.due_date)p.push(fmtDate(r.due_date));if(r.due_mileage)p.push(Number(r.due_mileage).toLocaleString('en-US')+' mi');return p.join(' or ');}
function docAiRenderRems(){
  var el=document.getElementById('dai-rems');if(!el||!DOCAI.edit)return;
  var e=DOCAI.edit,v=byId(getVehicles(),e.vehicleId);
  var allowed=v&&(canManageReminders(v)||can(v,'can_add_documents'));
  var note=document.getElementById('dai-rem-note');if(note)note.textContent=e.rems.length?'Untick any you do not want':'';
  if(!e.rems.length){el.innerHTML='<div class="quiet-note">'+(e.scan?'No follow-ups needed from this document.':'Reminders are suggested after an AI scan.')+'</div>';return;}
  el.innerHTML=e.rems.map(function(r,i){
    return '<label class="dai-rem'+(r.on?' on':'')+'"><input type="checkbox" '+(r.on?'checked ':'')+(allowed?'':'disabled ')+'onchange="docAiToggleRem('+i+',this.checked)">'+
      '<div class="dai-rem-body"><div class="dai-rem-top"><span class="dai-kind">'+esc(DOCAI_KIND_LBL[r.kind]||'Reminder')+'</span><span class="dai-rem-t">'+esc(r.title)+'</span></div>'+
      '<div class="dai-rem-due">Due '+esc(docAiRemDue(r))+(r.repeat_months||r.repeat_miles?' / then every '+esc([r.repeat_months?r.repeat_months+' months':'',r.repeat_miles?Number(r.repeat_miles).toLocaleString('en-US')+' mi':''].filter(Boolean).join(' or ')):'')+'</div>'+
      '<div class="dai-why"><b>Why:</b> '+esc(r.reason||'Suggested from this document.')+'</div>'+
      '<div class="dai-rem-edit"><input type="date" value="'+esc(r.due_date||'')+'" onchange="docAiRemSet('+i+',\'due_date\',this.value)" aria-label="Due date"><input type="number" min="0" placeholder="Due miles" value="'+esc(r.due_mileage==null?'':String(r.due_mileage))+'" onchange="docAiRemSet('+i+',\'due_mileage\',this.value)" aria-label="Due mileage"></div>'+
      '</div></label>';
  }).join('')+(allowed?'':'<div class="quiet-note">Reminders are added by the owner. They will see this document.</div>');
}
function docAiToggleRem(i,on){if(DOCAI.edit&&DOCAI.edit.rems[i]){DOCAI.edit.rems[i].on=!!on;docAiRenderRems();}}
function docAiRemSet(i,k,x){var r=DOCAI.edit&&DOCAI.edit.rems[i];if(!r)return;if(k==='due_mileage'){var n=Math.round(Number(x));r.due_mileage=x===''||!isFinite(n)||n<=0?null:n;}else r.due_date=x||null;r.edited=true;}
function docAiMissingCol(err){var c=err&&err.code,m=String(err&&err.message||'');return c==='42703'||c==='PGRST204'||/column .* does not exist|schema cache/i.test(m);}
async function docAiSave(){
  var e=DOCAI.edit;if(!e)return;
  var o=docAiRead(),d=e.doc,v=byId(getVehicles(),e.vehicleId);
  if(!v){showToast('Vehicle not found','error');return;}
  if(!o.title)o.title=docAiCatLabel(o.category);
  var changed=JSON.stringify(o)!==JSON.stringify(e.base);
  var status=e.scan?(changed?'edited':'scanned'):((d.ai&&d.ai.status&&d.ai.status!=='manual')?'edited':'manual');
  var titlePacked=packX(o.title,{type:DOCAI_TO_TYPE[o.category]||'other',exp:o.expiresOn||'',notes:e.notes});
  var row={title:titlePacked,kind:DOCAI_TO_KIND[o.category]||'other',doc_category:o.category,doc_date:o.docDate,vendor:o.vendor,mileage:o.mileage,amount:o.amount,services:o.services,expires_on:o.expiresOn,ai_status:status};
  if(e.scan){row.ai_confidence=e.scan.confidence==null?null:Math.max(0,Math.min(1,+e.scan.confidence));row.ai_summary=String(e.scan.summary||'').slice(0,600)||null;row.ai_model=e.scan.model||null;row.scanned_at=new Date().toISOString();}
  var b=document.getElementById('dai-save');if(b){b.disabled=true;b.textContent='Saving...';}
  var limited=false,msg=[];
  try{
    var r=await sb.from('documents').update(row).eq('id',e.id);
    if(r&&r.error){
      if(docAiMissingCol(r.error)){DOCAI.cols=false;limited=true;chk(await sb.from('documents').update({title:titlePacked,kind:row.kind}).eq('id',e.id));}
      else chk(r);
    }
    var picks=e.rems.filter(function(x){return x.on&&(x.due_date||x.due_mileage);});
    if(picks.length){
      var items=picks.map(function(x){return {kind:x.kind,title:String(x.title).slice(0,120),due_date:x.due_date||null,due_mileage:x.due_mileage||null,repeat_months:x.repeat_months||null,repeat_miles:x.repeat_miles||null,reason:String(x.reason||'').slice(0,600)};});
      var rr=await sb.rpc('add_doc_reminders',{p_document_id:e.id,p_items:items});
      if(rr&&rr.error){
        var missing=rr.error.code==='PGRST202'||/schema cache|could not find the function/i.test(String(rr.error.message||''));
        if(missing&&canManageReminders(v)){
          for(var i=0;i<items.length;i++){var it=items[i];chk(await sb.from('reminders').insert({id:uid(),vehicle_id:v.id,kind:it.kind,title:it.title,notes:('From document: '+o.title+'. '+it.reason).slice(0,1000),due_date:it.due_date,due_mileage:it.due_mileage,repeat_months:it.repeat_months,repeat_miles:it.repeat_miles,created_by:myId()}));}
          msg.push(items.length+' reminder'+(items.length===1?'':'s')+' added');limited=true;
        }else if(missing){msg.push('AI reminders need one backend update - Appy is applying it');limited=true;}
        else chk(rr);
      }else msg.push(picks.length+' AI reminder'+(picks.length===1?'':'s')+' added');
    }
  }catch(err){if(b){b.disabled=false;b.textContent='Save details';}showToast(friendlyError(err),'error');return;}
  if(b){b.disabled=false;b.textContent='Save details';}
  try{audit('document.updated','Document details saved for '+vName(v)+': '+o.title+(status!=='manual'?' (AI '+status+')':''),{clientId:v.clientId,vehicleId:v.id});}catch(x){}
  DOCAI.token++;DOCAI.edit=null;closeModal('modal-docscan');
  try{await loadAll();refreshCurrent();}catch(x){}
  showToast('Filed under '+docAiCatLabel(o.category)+(msg.length?'. '+msg.join('. '):'')+(limited?'. Some details are kept in short form until the backend update is applied.':''),'success');
}
// ---------- AI reminders lists ----------
function docAiRemList(vid){
  var vs={};visibleVehicles().forEach(function(v){vs[v.id]=v;});
  return Object.keys(DOCAI_REM).map(function(k){return DOCAI_REM[k];}).filter(function(r){return !r.completed_at&&vs[r.vehicle_id]&&(!vid||r.vehicle_id===vid);})
    .sort(function(a,b){return String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||(a.due_mileage||0)-(b.due_mileage||0);});
}
function docAiRemCardHTML(r,showVeh){
  var v=byId(getVehicles(),r.vehicle_id),doc=r.source_document_id?byId(getDocs(),r.source_document_id):null;
  var days=r.due_date?daysUntil(r.due_date):null,miles='';
  if(r.due_mileage&&v&&v.mileage!=null){var left=r.due_mileage-Number(v.mileage||0);miles=left<=0?'due now by mileage':Number(left).toLocaleString('en-US')+' mi to go';}
  var when=[r.due_date?fmtDate(r.due_date)+(days!==null?(days<0?' ('+Math.abs(days)+' days overdue)':' (in '+days+' days)'):''):'',r.due_mileage?Number(r.due_mileage).toLocaleString('en-US')+' mi'+(miles?' ('+miles+')':''):''].filter(Boolean).join(' or ');
  var act=v&&canManageReminders(v)?'<div class="dai-rem-act"><button class="btn btn-sm" onclick="docAiRemDone(\''+jsId(r.id)+'\')">Done</button><button class="btn btn-sm btn-ghost" onclick="docAiRemDismiss(\''+jsId(r.id)+'\')">Dismiss</button></div>':'';
  return '<div class="dai-card'+(days!==null&&days<0?' overdue':'')+'"><div class="dai-rem-top"><span class="dai-kind">'+esc(DOCAI_KIND_LBL[r.kind]||'Reminder')+'</span><span class="dai-ai">AI</span></div>'+
    '<div class="dai-rem-t big">'+esc(r.title)+'</div>'+(showVeh&&v?'<div class="doc-meta">'+esc(vName(v))+'</div>':'')+
    '<div class="dai-rem-due">Due '+esc(when)+'</div>'+(r.ai_reason?'<div class="dai-why"><b>Why:</b> '+esc(r.ai_reason)+'</div>':'')+
    (doc?'<div class="dai-src">From <a onclick="docAiOpenEdit(\''+jsId(doc.id)+'\')">'+esc(doc.name)+'</a>'+(doc.ai&&doc.ai.docDate?' ('+esc(fmtDate(doc.ai.docDate))+')':'')+'</div>':'')+act+'</div>';
}
function docAiRemSectionHTML(vid,showVeh){
  var l=docAiRemList(vid);if(!l.length)return '';
  return '<section class="sec dai-sec"><div class="sh first"><h2>AI reminders from your documents</h2><span class="dai-sorted">Soonest first</span></div>'+l.map(function(r){return docAiRemCardHTML(r,showVeh);}).join('')+'</section>';
}
async function docAiRemDone(id){try{chk(await sb.from('reminders').update({completed_at:new Date().toISOString()}).eq('id',id));if(DOCAI_REM[id])DOCAI_REM[id].completed_at=new Date().toISOString();refreshCurrent();docAiDetailRefresh();showToast('Marked done','success');}catch(e){showToast(friendlyError(e),'error');}}
async function docAiRemDismiss(id){if(!window.confirm('Dismiss this AI reminder?'))return;try{chk(await sb.from('reminders').delete().eq('id',id));delete DOCAI_REM[id];refreshCurrent();docAiDetailRefresh();showToast('Reminder dismissed','success');}catch(e){showToast(friendlyError(e),'error');}}
function docAiDetail(v){elHTML('vd-airem',v?docAiRemSectionHTML(v.id,false):'');}
function docAiDetailRefresh(){try{if(typeof currentVehicleId!=='undefined'&&currentVehicleId)docAiDetail(byId(getVehicles(),currentVehicleId));}catch(e){}}
