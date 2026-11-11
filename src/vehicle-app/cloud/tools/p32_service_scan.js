// ============ v32 (p32): LOG SERVICE - SCAN OR UPLOAD RECEIPT ============
// Reuses the scan-document Edge Function (migration_007): file_base64 + mime + vehicle_id in, strict JSON out.
// The receipt is saved to the matched vehicle's documents and linked to the new service record (documents.service_record_id).
var SS={tok:0,busy:0,file:null,thumb:'',scan:null,filled:{},missing:{}};
var SS_MONTH_CAP=60; // per user per month, client side; the server keeps its own daily (and, once applied, monthly) cap
var SS_F={vehicle:'svc-vehicle',date:'svc-date',miles:'svc-miles',note:'svc-note',cost:'svc-cost'};
function ssEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function ssShow(mode,msg){
  ['entry','busy','done'].forEach(function(k){var e=document.getElementById('ss-'+k);if(e)e.style.display=(k===mode?'':'none');});
  var m=document.getElementById('ss-msg');if(m){m.textContent=msg||'';m.style.display=msg?'':'none';}
  var or=document.getElementById('ss-or');if(or)or.style.display=mode==='entry'?'':'none';
  var th=SS.thumb?'<img src="'+ssEsc(SS.thumb)+'" alt="Receipt">':'<span class="ss-pdf">PDF</span>';
  ['ss-thumb-busy','ss-thumb-done'].forEach(function(id){var e=document.getElementById(id);if(e)e.innerHTML=th;});
}
function ssTag(key,kind){
  var inp=document.getElementById(SS_F[key]);if(!inp)return;
  var lab=inp.parentNode&&inp.parentNode.querySelector('label');if(!lab)return;
  var t=lab.querySelector('.ss-tag');if(t)t.parentNode.removeChild(t);
  inp.classList.remove('ss-ai','ss-miss');
  if(inp.dataset.ssPh!==undefined){inp.placeholder=inp.dataset.ssPh;delete inp.dataset.ssPh;}
  if(!kind)return;
  if(kind==='miss'&&inp.tagName==='INPUT'){inp.dataset.ssPh=inp.placeholder||'';inp.placeholder='Not on the receipt - enter it';}
  var s=document.createElement('span');s.className='ss-tag '+(kind==='ai'?'ss-tag-ai':'ss-tag-miss');
  s.textContent=kind==='ai'?(key==='vehicle'&&SS.how?'AI filled - '+SS.how:'AI filled'):'Missing';
  lab.appendChild(s);inp.classList.add(kind==='ai'?'ss-ai':'ss-miss');
}
function ssClearTags(){for(var k in SS_F)ssTag(k,null);SS.filled={};SS.missing={};SS.how='';}
function ssReset(){SS.tok++;SS.busy=0;SS.file=null;SS.thumb='';SS.scan=null;ssClearTags();
  ['ss-cam','ss-file'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});ssShow('entry','');}
function ssPick(k){if(SS.busy)return;var i=document.getElementById(k==='cam'?'ss-cam':'ss-file');if(i){i.value='';i.click();}}
function ssMonthKey(){return 'ss_scans_'+(myId()||'x')+'_'+todayISO().slice(0,7);}
function ssMonthUsed(){try{return Number(localStorage.getItem(ssMonthKey()))||0;}catch(e){return 0;}}
function ssMonthBump(){try{localStorage.setItem(ssMonthKey(),String(ssMonthUsed()+1));}catch(e){}}
function ssB64(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result).replace(/^data:[^,]*,/,''));};r.onerror=function(){rej(new Error('read'));};r.readAsDataURL(blob);});}
function ssFile(input){
  var f=input&&input.files&&input.files[0];if(!f)return;
  var isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name||'');
  var isImg=(f.type&&f.type.indexOf('image/')===0)||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name||'');
  if(!isPdf&&!isImg){ssShow('entry','Please choose a photo or a PDF of the receipt.');return;}
  if(isPdf){if(f.size>10*1024*1024){ssShow('entry','That PDF is over 10 MB. Choose a smaller file, or enter the details below.');return;}
    SS.file={blob:f,mime:'application/pdf',name:f.name||'receipt.pdf'};SS.thumb='';ssRun();return;}
  shrinkPhotoToDataUrl(f,MAX_PHOTO_DIM,MAX_PHOTO_BYTES,'#fff').then(function(out){
    SS.file={blob:dataUrlToBlob(out),mime:'image/jpeg',name:'receipt.jpg'};SS.thumb=out;ssRun();
  },function(){ssShow('entry','Could not read that photo. Try another one, or enter the details below.');});
}
function ssVehicles(){var sel=document.getElementById('svc-vehicle'),vs=getVehicles(),out=[];if(!sel)return out;
  for(var i=0;i<sel.options.length;i++){var v=byId(vs,sel.options[i].value);if(v)out.push(v);}return out;}
function ssNorm(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function ssMatch(s,list){
  var vin=ssNorm(s.vin),i,hit=[];
  if(vin){for(i=0;i<list.length;i++){var vv=ssNorm(list[i].vin);if(vv&&(vv===vin||(vin.length>=8&&vv.slice(-8)===vin.slice(-8))))return {v:list[i],how:'VIN'};}}
  var pl=ssNorm(s.plate);
  if(pl){for(i=0;i<list.length;i++)if(ssNorm(list[i].plate)===pl)return {v:list[i],how:'plate'};}
  var txt=' '+[s.make,s.model,s.title,s.summary,s.vendor,(s.services||[]).join(' ')].join(' ').toUpperCase()+' ';
  for(i=0;i<list.length;i++){var v=list[i],mk=String(v.make||'').toUpperCase().trim(),md=String(v.model||'').toUpperCase().trim().split(/\s+/)[0];
    if(mk&&md&&txt.indexOf(mk)>=0&&txt.indexOf(md)>=0)hit.push(v);}
  if(hit.length===1)return {v:hit[0],how:'make and model'};
  return null;
}
function ssFail(err,body){
  var st=err&&err.context&&err.context.status,bc=body&&body.error;
  if(st===429&&bc==='monthly_cap')return 'AI scanning has reached this month\'s limit. Enter the details below.';
  var c=docAiClassify(err,body);return c.msg.replace('Your document is saved - enter','Enter');
}
async function ssRun(){
  var my=++SS.tok;ssClearTags();SS.scan=null;
  if(ssMonthUsed()>=SS_MONTH_CAP){ssShow('entry','You have used this month\'s AI scans. Enter the details below.');return;}
  var list=ssVehicles(),vid=val('svc-vehicle')||(list[0]&&list[0].id);
  if(!vid){ssShow('entry','Add a vehicle first, then scan the receipt.');return;}
  if(!docAiFnAvailable()){ssShow('entry','AI scanning is not turned on yet. Enter the details below.');return;}
  SS.busy=1;ssShow('busy','');
  var r;
  try{var b64=await ssB64(SS.file.blob);r=await sb.functions.invoke('scan-document',{body:{file_base64:b64,mime:SS.file.mime,vehicle_id:vid}});}
  catch(e){r={data:null,error:e};}
  if(my!==SS.tok)return;SS.busy=0;
  if(r&&r.error){var body=null;try{if(r.error.context&&typeof r.error.context.json==='function')body=await r.error.context.json();}catch(e){}
    ssShow('entry',ssFail(r.error,body));return;}
  var s=r&&r.data;
  if(!s||typeof s!=='object'||!s.category){ssShow('entry','We could not read that receipt. Try a clearer photo, or enter the details below.');return;}
  ssMonthBump();SS.scan=s;ssFill(s,list);
}
function ssFill(s,list){
  var m=ssMatch(s,list),n=0;
  if(m){setVal('svc-vehicle',m.v.id);SS.how=m.how;SS.filled.vehicle=1;}else SS.missing.vehicle=1;
  if(s.doc_date&&s.doc_date<=todayISO()){setVal('svc-date',s.doc_date);SS.filled.date=1;}else SS.missing.date=1;
  if(s.mileage!=null&&s.mileage>=0){setVal('svc-miles',String(s.mileage));SS.filled.miles=1;}else{setVal('svc-miles','');SS.missing.miles=1;}
  var work=(s.services&&s.services.length?s.services.join(', '):(s.title||'')).slice(0,160);
  if(work){setVal('svc-note',work);SS.filled.note=1;}else SS.missing.note=1;
  if(s.amount!=null&&s.amount>=0){setVal('svc-cost',String(s.amount));SS.filled.cost=1;}else{setVal('svc-cost','');SS.missing.cost=1;}
  for(var k in SS_F){if(SS.filled[k]){ssTag(k,'ai');n++;}else if(SS.missing[k])ssTag(k,'miss');}
  try{updateServiceNext();}catch(e){}
  var miss=Object.keys(SS.missing).length;
  var t=document.getElementById('ss-done-sub');if(t)t.textContent=n+' of 5 filled'+(miss?'. Fill in the red one'+(miss>1?'s':'')+', then save.':'. Check and save.');
  ssShow('done','');
}
function ssEdited(e){var t=e&&e.target;if(!t)return;for(var k in SS_F)if(SS_F[k]===t.id&&SS.missing[k]&&String(t.value||'').trim()){delete SS.missing[k];ssTag(k,null);}}
async function ssAttach(v,sid,file,scan){
  var name=((scan&&scan.title)||'Service receipt').slice(0,120);
  var d={id:uid(),vehicleId:v.id,clientId:v.clientId,type:'service',name:name,expiry:'',notes:'Receipt for service on '+fmtDate(val('svc-date')||todayISO()),_file:file,by:myId()};
  try{await docUpload(d);}catch(e){showToast('Service saved, but the receipt could not be attached: '+friendlyError(e),'error');return;}
  var row={service_record_id:sid};
  if(scan){row.doc_category=scan.category||'receipt';row.doc_date=scan.doc_date||null;row.vendor=scan.vendor||null;row.mileage=scan.mileage==null?null:scan.mileage;
    row.amount=scan.amount==null?null:scan.amount;row.services=scan.services||[];row.ai_status='scanned';row.ai_summary=String(scan.summary||'').slice(0,600)||null;
    row.ai_confidence=scan.confidence==null?null:Math.max(0,Math.min(1,+scan.confidence));row.ai_model=scan.model||null;row.scanned_at=new Date().toISOString();}
  for(var a=0;a<4;a++){
    var r=await sb.from('documents').update(row).eq('id',d.id);
    if(!(r&&r.error))break;
    if(docAiMissingCol(r.error)&&row.ai_status){row={service_record_id:sid};continue;}
    await new Promise(function(z){setTimeout(z,1200);});
  }
  try{var sl=v.serviceLog||[];for(var i=0;i<sl.length;i++)if(sl[i]&&sl[i].id===sid)sl[i].docId=d.id;}catch(e){}
  try{audit('document.added','Receipt attached to service for '+vName(v)+': '+name,{clientId:v.clientId,vehicleId:v.id});}catch(e){}
  try{await loadAll();refreshCurrent();}catch(e){}
  showToast('Receipt saved to the service and documents','success');
}
var _ssOpen=openServiceModal;
openServiceModal=function(){var r=_ssOpen.apply(this,arguments);ssReset();return r;};
var _ssSave=saveService;
saveService=function(){
  var vid=val('svc-vehicle'),v0=byId(getVehicles(),vid),n0=v0&&v0.serviceLog?v0.serviceLog.length:0,file=SS.file,scan=SS.scan;
  if(SS.busy){showToast('Still reading the receipt...','error');return;}
  var r=_ssSave.apply(this,arguments);
  var v=byId(getVehicles(),vid),sl=v&&v.serviceLog||[];
  if(file&&v&&sl.length>n0){var sid=sl[sl.length-1].id;SS.file=null;SS.scan=null;ssAttach(v,sid,file,scan);}
  return r;
};
document.addEventListener('input',ssEdited,true);document.addEventListener('change',ssEdited,true);
