// ============ v15: calm vehicle page (one value block, one Documentation section), owner value, replica / kit car ============
var VR={cols:null};       // vehicles.is_replica / builder columns present (migration_009)
var OV={on:null,busy:false,edit:null};   // vehicle_owner_values table present (migration_009)
// ---------- replica / kit car ----------
function vrRep(r,x){if(r&&Object.prototype.hasOwnProperty.call(r,'is_replica'))VR.cols=true;else if(r&&VR.cols===null)VR.cols=false;return r&&r.is_replica===true||!!(x&&x.rep);}
function vrBld(r,x){return cleanText((r&&r.builder)||(x&&x.bld)||'',80);}
function vrLabel(v){return v&&v.isReplica?('Replica'+(v.builder?' by '+v.builder:'')):'';}
async function vrSyncCols(v){
  if(VR.cols!==true||!v)return;
  try{var r=await sb.from('vehicles').update({is_replica:!!v.isReplica,builder:v.isReplica&&v.builder?String(v.builder).slice(0,80):null}).eq('id',v.id);
    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))VR.cols=false;}catch(e){}
}
function vrFormToggle(){var on=!!(document.getElementById('v-replica')||{}).checked;var g=document.getElementById('v-builder-row');if(g)g.style.display=on?'':'none';}
function vrFormFill(v){var c=document.getElementById('v-replica');if(c)c.checked=!!(v&&v.isReplica);setVal('v-builder',v&&v.builder||'');vrFormToggle();vrHint('');}
// Likely-replica hint: VIN decode or photo identification. Never changes anything by itself; the owner confirms.
var VR_KIT=/\b(kit|replica|recreation|tribute|continuation|special(ly)? construct|assembled|homebuilt|home built|reconstructed|jps|beck|vintage motorcars|intermeccanica|factory five|superformance|backdraft|thoroughbred|everett.?morrison|era replica|shell valley|chamonix|apal|cmc|race car replicas|lone star)\b/i;
function vrVinHint(row,typedMake){
  if(!row)return '';
  var mk=cleanText(row.Make,40),mf=cleanText(row.Manufacturer,80),bc=cleanText(row.BodyClass,60),vt=cleanText(row.VehicleType,60),note=cleanText(row.Note,200);
  var all=[mk,mf,bc,vt,note].join(' ');
  if(VR_KIT.test(all))return 'The VIN is registered to '+(mf||mk||'a specialist builder')+', which suggests a replica or kit car.';
  if(typedMake&&mk&&typedMake.toLowerCase()!==mk.toLowerCase())return 'The VIN belongs to '+titleCase(mk)+', not '+typedMake+'. That often means a replica or kit car built on another chassis.';
  return '';
}
function vrHint(reason){
  var el=document.getElementById('v-rep-hint');if(!el)return;
  var c=document.getElementById('v-replica');
  if(!reason||(c&&c.checked)){el.style.display='none';el.innerHTML='';return;}
  el.style.display='';
  el.innerHTML='<div class="vr-hint-t">Possibly a replica or kit car</div><div class="vr-hint-b">'+esc(reason)+' Is this a replica?</div>'+
    '<div class="vr-hint-a"><button type="button" class="btn btn-sm" onclick="vrConfirm(true)">Yes, it is a replica</button><button type="button" class="btn btn-sm btn-ghost" onclick="vrConfirm(false)">No, it is original</button></div>';
}
function vrConfirm(yes){var c=document.getElementById('v-replica');if(c)c.checked=!!yes;vrFormToggle();vrHint('');if(yes){var b=document.getElementById('v-builder');if(b)b.focus();}}
// ---------- owner value (manual override, owner/admin only; techs see it only with view_value_estimate via RLS) ----------
async function ovLoad(){
  try{var r=await sb.from('vehicle_owner_values').select('*');
    if(r&&r.error){OV.on=false;return [];}
    OV.on=true;return (r&&r.data)||[];}catch(e){OV.on=false;return [];}
}
function ovApply(v,rows){
  v.ownerValue=null;
  for(var i=0;i<(rows||[]).length;i++){var o=rows[i];if(o&&o.vehicle_id===v.id&&Number(o.owner_value)>0)v.ownerValue={value:Math.round(Number(o.owner_value)),setAt:String(o.owner_value_set_at||'').slice(0,10)};}
}
function ovVal(v){return v&&v.ownerValue&&Number(v.ownerValue.value)>0&&can(v,'view_value_estimate')?Number(v.ownerValue.value):null;}
function aiVal(v){
  if(!v||!session||!can(v,'view_value_estimate'))return null;
  var o=ovVal(v);if(o!==null)return o;
  var a=v.aiValue;return (a&&Number(a.value)>0)?Number(a.value):null;
}
function portfolioTotals(vehicles){
  var value=0,low=0,high=0,basis=0,basisAll=0,gain=0,nValued=0,nPending=0,dsum=0,nDelta=0,perm=false,nOwner=0,exs=getExpenses();
  for(var i=0;i<vehicles.length;i++){
    var v=vehicles[i],g=vehicleGain(v,exs);
    if(can(v,'view_value_estimate'))perm=true;
    basisAll+=g.basis;
    if(g.hasValue){
      value+=g.value;nValued++;
      if(ovVal(v)!==null){low+=g.value;high+=g.value;nOwner++;}
      else{var a=v.aiValue||{};low+=Number(a.low)>0?Number(a.low):g.value;high+=Number(a.high)>0?Number(a.high):g.value;if(Number(a.prev)>0){dsum+=a.value-a.prev;nDelta++;}}
    }else nPending++;
    if(g.hasGain){basis+=g.basis;gain+=g.gain;}
  }
  return {value:value,low:low,high:high,basis:basis,basisAll:basisAll,gain:gain,pctGain:basis?(gain/basis)*100:0,nValued:nValued,nPending:nPending,nTotal:vehicles.length,delta:dsum,nDelta:nDelta,perm:vehicles.length?perm:true,nOwner:nOwner};
}
function ovCanSet(v){return !!(v&&!isArchivedVehicle(v)&&canEditVehicle(v)&&OV.on!==false);}
function ovOpen(vid){OV.edit=vid;var v=byId(getVehicles(),vid);vbFinish(v);var i=document.getElementById('ov-input');if(i){i.focus();i.select&&i.select();}}
function ovCancel(){var vid=OV.edit;OV.edit=null;vbFinish(byId(getVehicles(),vid));}
async function ovSave(vid,clear){
  var v=byId(getVehicles(),vid);if(!v||!ovCanSet(v)||OV.busy)return;
  var n=null;
  if(!clear){var raw=String(val('ov-input')||'').replace(/[$,\s]/g,'');n=Number(raw);
    if(!(n>0)||n>500000000){showToast('Enter a value in dollars, for example 85000','error');return;}n=Math.round(n);}
  OV.busy=true;
  try{
    var r=clear?await sb.from('vehicle_owner_values').delete().eq('vehicle_id',vid)
      :await sb.from('vehicle_owner_values').upsert({vehicle_id:vid,owner_id:v.clientId,owner_value:n,owner_value_set_at:new Date().toISOString(),set_by:myId()},{onConflict:'vehicle_id'});
    if(r&&r.error&&(r.error.code==='42P01'||r.error.code==='PGRST205'||/does not exist|schema cache/i.test(String(r.error.message||'')))){OV.on=false;OV.busy=false;showToast('Owner value needs one backend update first.','error');vbFinish(v);return;}
    chk(r);
    v.ownerValue=clear?null:{value:n,setAt:todayISO()};OV.edit=null;OV.busy=false;
    try{audit(clear?'vehicle.owner_value_cleared':'vehicle.owner_value_set',(clear?'Owner value cleared for ':'Owner value set for ')+vName(v),{clientId:v.clientId,vehicleId:v.id});}catch(e){}
    showToast(clear?'Owner value removed. The AI estimate is used again.':'Owner value saved','success');
    refreshCurrent();refreshDetailIfOpen();
  }catch(e){OV.busy=false;showToast(friendlyError(e),'error');}
}
// ---------- one calm value block ----------
function valueHeadHTML(v,g){
  var perm=can(v,'view_value_estimate'),ov=ovVal(v),a=v.aiValue,hasAi=!!(a&&Number(a.value)>0);
  var h='<div id="val-panel" class="vb">';
  if(ov!==null){
    h+='<div class="lab">Owner value</div><div class="num">'+bigNum(ov)+'</div>';
    h+='<div class="vb-sub">Set by the owner'+(v.ownerValue.setAt?' on '+esc(fmtDate(v.ownerValue.setAt)):'')+(hasAi?' / AI estimate '+esc(money(a.value)):'')+'</div>';
  }else if(hasAi&&perm){
    h+='<div class="lab">Estimated value</div><div class="num">'+bigNum(g.value)+'</div>';
    var dl=valueDeltaText(a),low=!(a.sources&&a.sources.length)||Number(a.confidence)<0.3;
    h+='<div class="vb-sub">'+(Number(a.low)>0?'Range '+esc(money(a.low))+' to '+esc(money(a.high))+' / ':'')+'as of '+esc(fmtDate(a.asOf))+(dl?' / '+esc(dl):'')+(low?' / <span class="vb-low">Low confidence</span>':'')+'</div>';
  }else{
    h+='<div class="lab">Estimated value</div><div class="num"><span class="vb-none">'+esc(!perm?'Value is not shared with you':(VALUE.state==='off'?'Value estimates are not turned on yet':'No estimate yet'))+'</span></div>';
  }
  return h+'</div>';
}
function vbTailHTML(v){
  var a=v.aiValue,perm=can(v,'view_value_estimate'),hv=!!(a&&Number(a.value)>0),nt=VALUE.note[v.id],ov=ovVal(v),out='';
  if(!perm)return '';
  if(OV.edit===v.id&&ovCanSet(v)){
    out+='<div class="ov-form"><label for="ov-input">Owner value (USD)</label><div class="ov-row"><input id="ov-input" inputmode="numeric" autocomplete="off" placeholder="e.g. 85000" value="'+(ov!==null?esc(String(ov)):'')+'" onkeydown="if(event.key===\'Enter\')ovSave(\''+jsId(v.id)+'\')">'+
      '<button class="btn btn-sm btn-primary" type="button" onclick="ovSave(\''+jsId(v.id)+'\')">Save</button><button class="btn btn-sm btn-ghost" type="button" onclick="ovCancel()">Cancel</button></div>'+
      '<div class="vb-fine">Your own figure is used for this vehicle and in the collection total instead of the AI estimate.</div></div>';
  }
  if(hv){
    out+='<details class="vb-more"><summary>'+(ov!==null?'AI estimate and sources':'Sources and details')+'</summary>';
    out+='<p>'+esc(money(a.value))+' estimated. '+esc(aiValueMeta(v))+'.</p>';
    var dl=valueDeltaText(a);if(dl)out+='<p class="'+(a.value<a.prev?'neg':'')+'">'+esc(dl)+'.</p>';
    if(a.notes)out+='<p class="vb-fine">'+esc(a.notes)+'</p>';
    out+='<p class="vb-fine">Sources: '+(a.sources&&a.sources.length?valueSrcLinks(a.sources):'none returned (low confidence)')+'</p>';
    out+='<p class="vb-fine">Found with Google Search and updated weekly'+(v.isReplica?', valued as a replica'+(v.builder?' by '+esc(v.builder):''):'')+'. An estimate, not an appraisal.</p></details>';
  }else if(VALUE.state==='off'){
    out+='<p class="vb-fine" id="val-off">Nothing is wrong with your vehicle or your data. The estimate appears here once it is switched on.</p>';
  }
  if(nt)out+='<p class="val-note" data-kind="'+esc(nt.kind)+'">'+esc(nt.text)+'</p>';
  var btns=valueButtonHTML(v,hv);
  var ovb=ovCanSet(v)&&OV.edit!==v.id?'<button class="btn btn-sm btn-ghost" type="button" id="ov-btn" onclick="ovOpen(\''+jsId(v.id)+'\')">'+(ov!==null?'Edit owner value':'Set my own value')+'</button>'+(ov!==null?'<button class="btn btn-sm btn-ghost" type="button" onclick="ovSave(\''+jsId(v.id)+'\',true)">Use AI estimate</button>':''):'';
  if(btns||ovb)out+='<div class="vb-acts">'+btns.replace(/^<div style="margin-top:10px;">/,'<div class="vb-btn">')+ovb+'</div>';
  return out;
}
function vbFinish(v){
  if(!v)return;
  var p=document.getElementById('val-panel');if(!p){var w=document.getElementById('vd-value');if(!w)return;w.innerHTML=valueHeadHTML(v,vehicleGain(v))+w.innerHTML;p=document.getElementById('val-panel');}
  var old=p.querySelector('.vb-tail');if(old)old.remove();
  var host=document.getElementById('vd-value');
  [].slice.call(host.children).forEach(function(c){if(c!==p&&c.classList.contains('delta'))p.appendChild(c);});
  var t=document.createElement('div');t.className='vb-tail';t.innerHTML=vbTailHTML(v);p.appendChild(t);
  var rl=document.getElementById('vd-rep');if(rl)rl.remove();
  if(v.isReplica){var sub=document.getElementById('vd-sub');if(sub)sub.insertAdjacentHTML('afterend','<div class="vr-line" id="vd-rep"><span class="vr-badge">Replica</span>'+(v.builder?'<span>by '+esc(v.builder)+'</span>':'')+'</div>');}
}
// ---------- health: calm, no pill ----------
function aiPanelHTML(v){
  var h=healthInfo(v),out='<div class="brief" style="margin-top:30px;" id="health-panel"><div class="brief-head"><div class="brief-title">Health score</div></div>';
  if(h){
    out+='<p><b>'+h.score+' of 100</b> ('+esc(h.label)+'). Updated '+esc(fmtDate(h.asOf))+'.</p>';
    out+='<ul class="vb-list">'+h.reasons.map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul>';
    out+='<details class="vb-more"><summary>How this is worked out</summary><p class="vb-fine">'+esc(h.basis)+' Worked out on this device from service history and intervals, reminders, documents and gaps. It updates when your records change and cannot be typed in.</p></details>';
  }else out+='<p class="vb-fine">The owner has not shared the health score with you.</p>';
  return out+'</div>';
}
// ---------- Documentation: one section ----------
var DSEC_DESC='All documents relating to vehicles - Registration, Invoice, repair orders. That will be automatically recognized and organized by AI.';
function dsecRender(v){
  var el=document.getElementById('vd-doc-add');if(!el||!v)return;
  var archived=isArchivedVehicle(v),add=!archived&&can(v,'can_add_documents');
  el.innerHTML=add?'<button class="btn btn-primary dsec-btn" type="button" id="vd-doc-btn" onclick="dsecPick()">Add Documents</button><input type="file" id="vd-doc-input" accept="image/*,application/pdf" style="display:none" onchange="dsecFile(this)">':'';
  var due=document.getElementById('vd-doc-due');if(!due)return;
  var ai={};Object.keys(typeof DOCAI_REM==='object'&&DOCAI_REM?DOCAI_REM:{}).forEach(function(k){ai[jsId(k)]=1;});
  var items=archived||!can(v,'view_reminders')?[]:reminderItems([v]).filter(function(it){return !(it.kind==='custom'&&ai[it.id]);});
  var hasAi=typeof docAiRemList==='function'&&docAiRemList(v.id).length>0;
  due.innerHTML=(items.length||hasAi?'<div class="dsec-lab">Coming up</div>':'')+items.slice(0,6).map(function(it){
    var c=it.sortDays<0?' over':(it.sortDays<=30?' soon':'');
    return '<div class="dsec-due'+c+'"><span>'+esc(remPhrase(it))+'</span>'+(it.due?'<em>'+esc(fmtDate(it.due))+'</em>':'')+'</div>';}).join('');
}
function dsecPick(){var i=document.getElementById('vd-doc-input');if(i)i.click();}
async function dsecFile(inp){
  var f=inp&&inp.files&&inp.files[0];if(inp)inp.value='';
  var v=byId(getVehicles(),currentVehicleId);if(!f||!v)return;
  if(!/^(image\/|application\/pdf)/.test(f.type||'')&&!/\.(jpe?g|png|heic|heif|webp|pdf)$/i.test(f.name||'')){showToast('Choose a photo or a PDF of the document','error');return;}
  if(f.size>10*1024*1024){showToast('This file is larger than 10 MB. Try a photo instead.','error');return;}
  var b=document.getElementById('vd-doc-btn');if(b){b.disabled=true;b.textContent='Uploading...';}
  var blob=f,mime=f.type||(/\.pdf$/i.test(f.name)?'application/pdf':'image/jpeg');
  try{if(/^image\//.test(mime)&&typeof pfDecode==='function'){var d=await pfDecode(f);try{blob=await pfEncode(d,2200,0.85);mime='image/jpeg';}finally{d.done();}}}catch(e){blob=f;}
  await dsecUpload(v,blob,mime,String(f.name||'Document').replace(/\.[a-z0-9]+$/i,'').slice(0,80)||'Document');
  if(b){b.disabled=false;b.textContent='Add Documents';}
}
async function dsecUpload(v,blob,mime,label){
  if(!can(v,'can_add_documents')){showToast('Adding documents is not enabled for you on this vehicle.','error');return;}
  var d={id:uid(),vehicleId:v.id,clientId:v.clientId,type:'other',name:label||'Document',expiry:'',notes:'',_file:{blob:blob,mime:mime,name:/pdf/.test(mime)?'document.pdf':'document.jpg'},by:myId()};
  try{await docUpload(d);}catch(e){showToast(friendlyError(e),'error');return;}
  try{audit('document.added','Document recorded for '+vName(v)+': '+d.name,{clientId:v.clientId,vehicleId:v.id});}catch(e){}
  try{await loadAll();refreshCurrent();refreshDetailIfOpen();}catch(e){}
  docAiOpenEdit(d.id,true,{id:d.id,vehicleId:v.id,name:d.name,type:'other',mime:mime,by:myId(),ai:null});
}
// photo dump "Scan as document?" uses the same path
async function ptScanBlob(v,blob,label){return dsecUpload(v,blob,'image/jpeg',label||'Photo document');}
