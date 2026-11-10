// ===== v23 undo import (p23): batches saved to public.import_batches (migration_016), local fallback =====
var UN_DAYS=30,UN_DB_COLS={year:'year',make:'make',model:'model',vin:'vin',color:'color',mileage:'mileage',plate:'plate',plateRegion:'plate_region',location:'location',insurer:'insurance_carrier',purchasePrice:'purchase_price'};
var UN={remoteAsked:false,busy:false};
function unDbVal(p,v){
  if(v===undefined||v===null||v==='')return null;
  if(p==='year'){var y=parseInt(v,10);return isNaN(y)?null:y;}
  if(p==='mileage'){var m=Math.round(Number(v));return m>0?m:null;}
  if(p==='purchasePrice'){var n=Number(v);return n>0?n:null;}
  if(p==='vin')return String(v).toUpperCase().trim()||null;
  var s=String(v).trim();return s===''?null:s;
}
function unChangedForDb(changed){
  return (changed||[]).map(function(c){var b={},a={},any=false;
    for(var p in c.before)if(c.before.hasOwnProperty(p)&&UN_DB_COLS[p]){b[UN_DB_COLS[p]]=unDbVal(p,c.before[p]);a[UN_DB_COLS[p]]=unDbVal(p,c.after[p]);any=true;}
    return any?{id:c.id,before:b,after:a}:null;}).filter(Boolean);
}
function unSig(v){try{return KIND.vehicles.sig(v);}catch(e){return JSON.stringify(v);}}
function unRpcMissing(err){return !!err&&(err.code==='PGRST202'||err.code==='42883'||/Could not find the function|schema cache/i.test(err.message||''));}
function imApply(A,owner,pfId,appr,add){
  var r=imApplyLocal(A,owner,pfId,appr,add);
  if(!r||r.error||r.none||!r.batch)return r;
  var b=r.batch,all=imBatches(),vs=getVehicles(),sigs={};
  b.added.forEach(function(id){var v=byId(vs,id);if(v)sigs[id]=unSig(v);});
  all.forEach(function(x){if(x.id===b.id){x.file=(IM.file&&IM.file.name)||'';x.sigs=sigs;x.db=false;}});imSaveBatches(all);
  b.file=(IM.file&&IM.file.name)||'';
  if(typeof sb!=='undefined'&&sb&&session){
    var args={p_id:b.id,p_owner:owner,p_portfolio:isUuid(pfId)?pfId:null,p_file:b.file,p_added:b.added.slice(),p_changed:unChangedForDb(b.changed)};
    // runs after the cars' own inserts in the same ordered queue; never fails the queue (local fallback)
    enqueue('import.batch',function(){return sb.rpc('record_import_batch',args).then(function(res){
      if(res&&!res.error){unMark(b.id,{db:true});}
    },function(){});});
  }
  return r;
}
function unMark(id,patch){var all=imBatches();all.forEach(function(x){if(x.id===id)for(var k in patch)x[k]=patch[k];});imSaveBatches(all);}
function unFind(id){return imBatches().filter(function(x){return x.id===id;})[0]||null;}
function unExpired(b){return Date.now()-Date.parse(b.at)>UN_DAYS*864e5;}
function unWhen(iso){var d=new Date(iso),t=new Date();var same=d.toDateString()===t.toDateString();
  return same?'Today, '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString('en-US',{month:'short',day:'numeric'});}
// merge the server list (other devices) into local, once per open
function unFetchRemote(){
  if(UN.remoteAsked||typeof sb==='undefined'||!sb||!session)return;UN.remoteAsked=true;
  sb.rpc('list_import_batches').then(function(res){
    if(!res||res.error||!Array.isArray(res.data))return;
    var all=imBatches(),have={};all.forEach(function(x){have[x.id]=x;});
    res.data.forEach(function(r){var x=have[r.id];
      if(x){x.db=true;if(r.undone_at&&!x.undone)x.undone=r.undone_at;}
      else all.push({id:r.id,at:r.created_at,owner:r.owner_id,file:r.file||'',added:new Array(r.added||0),changed:new Array(r.changed||0),db:true,remote:true,undone:r.undone_at||undefined});});
    all.sort(function(a,b){return Date.parse(a.at)-Date.parse(b.at);});imSaveBatches(all);if(IM.step)imRender();
  },function(){});
}
function unRecentCard(){
  unFetchRemote();
  var me=IM.owner,list=imBatches().filter(function(b){return !me||b.owner===me;}).slice(-5).reverse();
  if(!list.length)return '';
  var h='<div class="im-card un-recent"><div class="im-cap">Recent imports</div>';
  list.forEach(function(b){
    var n=(b.added||[]).length,line=unWhen(b.at)+' \u00b7 '+n+' added',right;
    if(b.undone)right='<span class="un-state">Undone</span>';
    else if(unExpired(b))right='<span class="un-state">Undo expired</span>';
    else right='<button class="un-tag" onclick="imUndo(\''+b.id+'\')" aria-label="Undo import '+imE(b.file||'')+'">UNDO</button>';
    h+='<div class="un-row"><div class="un-row-t"><b>'+imE(b.file||'Master sheet')+'</b><span>'+line+'</span></div>'+right+'</div>';
  });
  return h+'</div>';
}
// confirm sheet
function imUndo(id){
  var b=unFind(id);if(!b||b.undone){showToast('Nothing to undo','error');return;}
  if(unExpired(b)){showToast('The 30 days to undo this import have ended.','error');return;}
  if(!IM.step){var r=document.getElementById('im-root');if(r){r.style.display='block';document.body.classList.add('im-open');}IM.step=4;}
  if(IM.step!==4){IM.step=4;IM.done=null;}
  IM.view='confirm';IM.undo={id:id,loading:true,cars:[],restorable:(b.changed||[]).length,file:b.file||''};imRender();
  var local=function(){var vs=getVehicles(),docs=getDocs();
    IM.undo.cars=(b.added||[]).map(function(vid){var v=byId(vs,vid);if(!v)return null;
      return {id:vid,name:[v.year,v.make,v.model].filter(Boolean).join(' '),edited:!!(b.sigs&&b.sigs[vid]&&b.sigs[vid]!==unSig(v)),
        photos:(v.image?1:0)+((v.photos&&v.photos.length)||0),documents:docs.filter(function(d){return d.vehicleId===vid;}).length};}).filter(Boolean);
    IM.undo.loading=false;imRender();};
  if(b.db&&sb&&session){
    sb.rpc('import_undo_preview',{p_id:id}).then(function(res){
      if(!res||res.error||!res.data){local();return;}
      var d=res.data;IM.undo.cars=(d.cars||[]).filter(function(c){return c.can_remove!==false;}).map(function(c){return {id:c.id,name:[c.year,c.make,c.model].filter(Boolean).join(' '),edited:!!c.edited,photos:c.photos||0,documents:c.documents||0};});
      IM.undo.restorable=d.restorable||0;IM.undo.loading=false;imRender();
    },local);
  }else local();
}
function unCarLine(c){
  if(c.edited)return '<small class="ed">Edited after import \u00b7 edits lost</small>';
  var p=[];if(c.photos)p.push(c.photos+' photo'+(c.photos===1?'':'s'));if(c.documents)p.push(c.documents+' document'+(c.documents===1?'':'s'));
  return '<small>'+(p.length?p.join(' \u00b7 '):'Added by this import')+'</small>';
}
function unSheet(){
  var u=IM.undo,n=u.cars.length,ed=u.cars.filter(function(c){return c.edited;}).length,h='';
  h+='<div class="un-dim" onclick="unCancel()"></div><div class="un-sheet" role="dialog" aria-modal="true" aria-labelledby="un-h"><div class="un-grab"></div><h2 class="un-h" id="un-h">Undo this import?</h2>';
  if(u.loading)return h+'<p class="im-lead">Checking which cars this import added...</p></div>';
  h+='<p class="im-lead"><b>'+n+' car'+(n===1?'':'s')+' will be removed</b>, with their photos, documents and costs.'+(u.restorable?' '+u.restorable+' updated car'+(u.restorable===1?'':'s')+' go back to how they were.':'')+'</p>';
  if(ed)h+='<div class="un-warn" role="alert"><b>'+ed+' car'+(ed===1?' was':'s were')+' edited after the import.</b> Those edits will be lost too.</div>';
  if(n){h+='<div class="un-cars">';u.cars.filter(function(c){return c.edited;}).concat(u.cars.filter(function(c){return !c.edited;})).slice(0,6).forEach(function(c){h+='<div class="un-car"><span class="un-th" aria-hidden="true"></span><div>'+imE(c.name)+unCarLine(c)+'</div></div>';});
    if(n>6)h+='<div class="un-more">+ '+(n-6)+' more car'+(n-6===1?'':'s')+'</div>';h+='</div>';}
  h+='<button class="im-btn un-red" id="un-go" onclick="unGo()"'+(UN.busy?' disabled':'')+'>'+(UN.busy?'Undoing...':'Undo import \u00b7 Remove '+n+' car'+(n===1?'':'s'))+'</button>';
  return h+'<button class="im-btn un-keep" onclick="unCancel()">Keep everything</button></div>';
}
function unCancel(){if(UN.busy)return;IM.view='';IM.undo=null;if(!IM.done){imClose();return;}imRender();}
async function unGo(){
  if(UN.busy||!IM.undo)return;var id=IM.undo.id,b=unFind(id);if(!b)return;UN.busy=true;imRender();
  var res=null;
  try{
    if(b.db&&sb&&session){
      var r=await sb.rpc('undo_import',{p_id:id});
      if(r&&!r.error&&r.data){
        var gone={};(r.data.removed_ids||[]).forEach(function(x){gone[x]=1;});
        // the server already deleted them: drop locally without queueing deletes
        if(SNAP.vehicles)Object.keys(gone).forEach(function(x){delete SNAP.vehicles[x];});
        C.vehicles=C.vehicles.filter(function(v){return !gone[v.id];});
        unMark(id,{undone:new Date().toISOString()});
        res={removed:r.data.removed||0,restored:r.data.restored||0,kept:r.data.kept||0};
        audit('import.undone','Import undone: '+(b.file||'master sheet'),{clientId:b.owner});
        try{reloadAll(true);}catch(e){}
      }else if(r&&r.error&&!unRpcMissing(r.error)){UN.busy=false;showToast(/30 days|ended/.test(r.error.message||'')?'The 30 days to undo this import have ended.':'Could not undo. Please try again.','error');imRender();return;}
    }
    if(!res)res=imUndoLocal(id);
  }catch(e){res=null;}
  UN.busy=false;
  if(!res){showToast('Could not undo. Please try again.','error');imRender();return;}
  IM.view='undone';IM.undoRes=res;IM.undoRes.file=b.file||'master sheet';showToast('Import undone','success');imRender();
}
function unDone(){
  var r=IM.undoRes;
  return '<div class="im-done"><div class="un-big" aria-hidden="true">\u21b6</div><h1 class="im-h1">Import undone</h1>'+
    '<p class="im-lead"><b>'+r.removed+' car'+(r.removed===1?'':'s')+' removed</b> with their photos, documents and costs.'+(r.restored?'<br><b>'+r.restored+' car'+(r.restored===1?'':'s')+' restored</b> to how they were.':'')+'</p>'+
    '<div class="im-card"><div class="im-cap">Not touched</div><div class="im-txt">Cars you already had, or added yourself, were not changed.'+(r.kept?' '+r.kept+' car'+(r.kept===1?'':'s')+' you cannot remove '+(r.kept===1?'was':'were')+' kept.':'')+'</div></div>'+
    '<div class="im-card"><div class="im-cap">Logged</div><div class="im-txt">Saved in the activity log: "Import undone, '+imE(r.file)+'".</div></div>'+
    '<button class="im-btn gold" onclick="unFinish()">Done</button><button class="im-btn line" onclick="unNewImport()">Import a new sheet</button></div>';
}
function unFinish(){var o=IM.owner;IM.view='';IM.done=null;imClose();try{refreshCurrent();}catch(e){}}
function unNewImport(){var o=IM.owner;IM.view='';IM.undoRes=null;IM.done=null;IM.step=1;IM.msg='';IM.id=uid();imRender();}
function imStep4(){
  if(IM.view==='undone'&&IM.undoRes)return unDone();
  var base=IM.done?imStep4Base():'<h1 class="im-h1">Import master sheet</h1>'+unRecentCard();
  if(IM.view==='confirm'&&IM.undo)return base+unSheet();
  return base;
}
