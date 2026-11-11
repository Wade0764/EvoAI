// ============ AI PHOTO DUMP: auto-sort into portfolio sections (tag-photos Edge Function, migration_008) ============
// Up to 50 photos per dump, uploaded by a 2-wide queue; the 400px thumbnails already in storage are sorted by AI in
// batches of 8. One tap on a chip fixes a photo (saved as a manual tag; AI never overrides it). No key in the client.
var PF_TAGS=['Exterior','Interior','Engine','Wheels','Details','Documents','Work','Other'];
var PT={cols:null,fn:null,legacy:false,MAX:50,BATCH:8,CONC:2};
var PT_LEGACY={Exterior:'Exterior',Interior:'Interior',Engine:'Engine',Wheels:'Detail',Details:'Detail',Documents:null,Work:'Work',Other:null};
function ptNormTag(row){
  if(row&&Object.prototype.hasOwnProperty.call(row,'tag_source'))PT.cols=true;else if(row&&PT.cols===null)PT.cols=false;
  var t=row&&row.tag||'';return t==='Detail'?'Details':t;
}
function ptDbTag(t){return (PT.cols===false||PT.legacy)?(t?PT_LEGACY[t]:null):(t||null);}
function ptTagRow(t,src,conf){var r={tag:ptDbTag(t)};if(PT.cols!==false&&!PT.legacy){r.tag_source=t?src:null;r.tag_confidence=src==='ai'&&conf!=null?conf:null;}return r;}
async function ptUpdateTag(pid,t,src,conf){
  var r=await sb.from('vehicle_photos').update(ptTagRow(t,src,conf)).eq('id',pid);
  if(r&&r.error&&(r.error.code==='23514'||/check constraint/i.test(String(r.error.message||'')))&&!PT.legacy){PT.legacy=true;r=await sb.from('vehicle_photos').update(ptTagRow(t,src,conf)).eq('id',pid);}
  if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204')&&/tag_source|tag_confidence/.test(String(r.error.message||''))&&PT.cols!==false){PT.cols=false;r=await sb.from('vehicle_photos').update(ptTagRow(t,src,conf)).eq('id',pid);}
  chk(r);
}
async function pfSetTag(pid,tag){
  var v=PF.v;if(!v)return;
  try{await ptUpdateTag(pid,tag||null,'manual');PF.focusId=pid;await loadAll();refreshDetailIfOpen();showToast(tag?'Tagged '+tag:'Tag removed','success');}
  catch(e){showToast(friendlyError(e),'error');}
}
// ---------- sheet ----------
function pfShowAdd(v){
  pfCloseAdd(true);
  var el=document.createElement('div');el.className='pfa';el.id='pfa';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Add photos');
  el.innerHTML='<div class="pfa-sheet"><div class="pfa-top"><div class="pfa-title">Add photos</div><button class="pfa-x" type="button" aria-label="Close" onclick="pfCloseAdd()">'+pfIcon('x')+'</button></div>'+
    '<div class="pfa-sub">'+esc(heroHead(v))+(v.nickname?' / '+esc(vFull(v)):'')+'</div>'+
    '<input type="file" id="pfa-input" accept="image/*" multiple style="display:none">'+
    '<button class="pfa-pick" type="button" id="pfa-pick" onclick="document.getElementById(\'pfa-input\').click()">'+pfIcon('plus')+'<span>Choose photos</span><em>Up to '+PT.MAX+' at a time. AI sorts them for you.</em></button>'+
    '<div class="pfa-tagall pt-note" id="pfa-tagall"></div><div class="pfa-grid" id="pfa-grid"></div><div class="pfa-msg" id="pfa-msg" role="status" aria-live="polite"></div>'+
    '<div class="pfa-bar"><div class="pfa-prog" id="pfa-prog"><i></i></div><button class="pfa-go" id="pfa-go" type="button" disabled onclick="pfUploadAll()">Upload</button></div></div>';
  document.body.appendChild(el);
  PF.add={el:el,items:[],busy:false,seq:0,tag:'',opener:document.activeElement,tagging:0,prevQ:[],prevBusy:false};
  el.addEventListener('click',function(e){if(e.target===el&&!PF.add.busy)pfCloseAdd();});
  PF.add.key=function(e){if(e.key==='Escape'&&PF.add&&!PF.add.busy){e.preventDefault();pfCloseAdd();}};
  document.addEventListener('keydown',PF.add.key);
  document.getElementById('pfa-input').addEventListener('change',function(){pfAddFiles(this.files);this.value='';});
  document.body.classList.add('pfa-open');
  pfAddRender();
  setTimeout(function(){el.classList.add('on');var b=document.getElementById('pfa-pick');if(b)b.focus();},10);
}
function pfAddFiles(files){
  var A=PF.add;if(!A||A.busy||!files)return;
  var room=PT.MAX-A.items.length,added=0,skipped=0;
  for(var i=0;i<files.length;i++){
    var f=files[i];
    if(added>=room){skipped++;continue;}
    if(!/^image\//.test(f.type||'')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name||'')){skipped++;continue;}
    var it={id:++A.seq,file:f,url:'',tag:A.tag||'',manual:!!A.tag,ai:false,state:'ready',err:'',pid:null,disp:null};
    A.items.push(it);A.prevQ.push(it);added++;
  }
  var m=document.getElementById('pfa-msg');if(m)m.textContent=skipped?(skipped+' file'+(skipped===1?' was':'s were')+' skipped (not a photo, or more than '+PT.MAX+').'):'';
  pfAddRender();ptPreviews();
}
// small previews, one at a time (50 full-size decodes at once would exhaust a phone's memory)
async function ptPreviews(){
  var A=PF.add;if(!A||A.prevBusy)return;A.prevBusy=true;
  while(PF.add===A&&A.prevQ.length){
    var it=A.prevQ.shift();if(it.url)continue;
    try{var d=await pfDecode(it.file);try{var b=await pfEncode(d,240,0.7);it.url=URL.createObjectURL(b);}finally{d.done();}}
    catch(e){it.url=URL.createObjectURL(it.file);}
    ptPaintItem(it);
  }
  A.prevBusy=false;
}
function ptChip(it){
  if(it.state==='ready'&&!it.manual)return '<button type="button" class="pfa-tg pt-auto" aria-label="Sorted by AI after upload. Tap to choose a section" onclick="pfAddCycle('+it.id+')">Auto</button>';
  if(it.sorting)return '<button type="button" class="pfa-tg pt-auto" aria-label="Sorting" onclick="pfAddCycle('+it.id+')"><span class="pt-dot"></span>Sorting</button>';
  return '<button type="button" class="pfa-tg'+(it.tag?'':' pt-none')+(it.ai?' pt-ai':'')+'" aria-label="'+esc(it.tag?('Section: '+it.tag+'. Tap to change'):'Untagged. Tap to choose a section')+'" onclick="pfAddCycle('+it.id+')">'+esc(it.tag||'Tag')+(it.ai?'<em>AI</em>':'')+'</button>';
}
function ptItemHTML(it){
  var A=PF.add;
  return '<div class="pfa-it '+it.state+'" data-id="'+it.id+'">'+(it.url?'<img alt="Selected photo" src="'+esc(it.url)+'" decoding="async">':'<span class="pfg-sk"></span>')+ptChip(it)+
    (A&&A.busy||it.state==='done'?'':'<button type="button" class="pfa-rm" aria-label="Remove photo" onclick="pfAddRemove('+it.id+')">'+pfIcon('x')+'</button>')+
    (it.state==='done'&&it.tag==='Documents'&&it.disp?'<button type="button" class="pt-scan" onclick="ptScanItem('+it.id+')">Scan as document?</button>':'')+
    (it.state==='done'?'<span class="pfa-st ok pt-ok">Added</span>':it.state==='fail'?'<span class="pfa-st bad" title="'+esc(it.err)+'">Failed</span>':it.state==='work'?'<span class="pfa-st">Uploading</span>':'')+'</div>';
}
function ptPaintItem(it){var n=document.querySelector('#pfa-grid .pfa-it[data-id="'+it.id+'"]');if(n)n.outerHTML=ptItemHTML(it);}
function pfAddRender(){
  var A=PF.add;if(!A)return;
  var tg=document.getElementById('pfa-tagall');
  if(tg)tg.innerHTML=A.items.length?esc(PT.fn===false?'Auto-sorting is not turned on yet. Photos upload untagged - tap a tag to sort them.':'AI sorts each photo into '+PF_TAGS.slice(0,-1).join(', ')+' or Other. Tap any tag to change it.'):'';
  var g=document.getElementById('pfa-grid');
  if(g)g.innerHTML=A.items.map(ptItemHTML).join('');
  var go=document.getElementById('pfa-go'),ready=A.items.filter(function(i){return i.state==='ready'||i.state==='fail';}).length;
  var all=A.items.length&&!ready&&!A.busy;
  if(go){go.disabled=A.busy||(!ready&&!all);go.textContent=A.busy?'Uploading...':(ready?'Upload '+ready+' photo'+(ready===1?'':'s'):(all?'Done':'Upload'));go.onclick=all?function(){pfCloseAdd();}:function(){pfUploadAll();};}
  var pk=document.getElementById('pfa-pick');if(pk)pk.disabled=A.busy||A.items.length>=PT.MAX;
}
function pfAddTagAll(t){var A=PF.add;if(!A||A.busy)return;A.tag=t;A.items.forEach(function(i){if(i.state!=='done'){i.tag=t;i.manual=true;}});pfAddRender();}
function pfAddCycle(id){
  var A=PF.add;if(!A)return;
  var it=A.items.filter(function(i){return i.id===id;})[0];if(!it)return;
  var ix=PF_TAGS.indexOf(it.tag);it.tag=PF_TAGS[(ix+1)%PF_TAGS.length];it.manual=true;it.ai=false;it.sorting=false;
  ptPaintItem(it);
  if(it.state==='done'&&it.pid){ptUpdateTag(it.pid,it.tag,'manual').then(function(){A.dirty=true;},function(e){showToast(friendlyError(e),'error');});}
}
function pfAddRemove(id){var A=PF.add;if(!A||A.busy)return;A.items=A.items.filter(function(i){if(i.id===id&&i.url)URL.revokeObjectURL(i.url);return i.id!==id;});pfAddRender();}
// ---------- upload queue + AI batches ----------
function pfUploadAll(){
  var A=PF.add,v=PF.v;if(!A||A.busy||!v)return;
  var todo=A.items.filter(function(i){return i.state==='ready'||i.state==='fail';});if(!todo.length)return;
  if(!pfCanAdd(v)){showToast('Photos are not enabled for you on this vehicle.','error');return;}
  A.busy=true;var done=0,fails=0,first='',next=0;
  var hasCover=(v._photos||[]).some(function(p){return p.isCover;});
  var base=(v._photos||[]).reduce(function(m,p){return Math.max(m,(Number(p.sort)||0)+1);},(v._photos||[]).length);if(!isFinite(base))base=(v._photos||[]).length;
  var msg=document.getElementById('pfa-msg'),bar=document.querySelector('#pfa-prog i'),tagQ=[],tagChain=Promise.resolve();
  pfAddRender();
  function setP(){if(bar)bar.style.width=Math.round(100*(done+fails)/todo.length)+'%';if(msg)msg.textContent='Uploading '+Math.min(todo.length,done+fails+1)+' of '+todo.length+'...';}
  function flushTags(force){
    while(tagQ.length>=PT.BATCH||(force&&tagQ.length)){var b=tagQ.splice(0,PT.BATCH);(function(b){tagChain=tagChain.then(function(){return ptTagBatch(v,b);});})(b);}
  }
  async function one(it,ix){
    it.state='work';ptPaintItem(it);
    var id=uid(),b=v.clientId+'/'+v.id+'/portfolio/'+id,paths={o:b+'.jpg',t:b+'_t.jpg',d:b+'_d.jpg'},up=[];
    try{
      var out=await pfProcess(it.file);
      async function put(path,blob){chk(await sb.storage.from('vehicle-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false}));up.push(path);}
      await put(paths.d,out.disp);await put(paths.t,out.thumb);await put(paths.o,out.orig);
      var cover=!hasCover&&!first;if(cover)hasCover=true;
      var row={id:id,vehicle_id:v.id,uploaded_by:myId(),storage_path:paths.o,thumb_path:paths.t,display_path:paths.d,is_cover:cover,sort_order:(isFinite(base+ix)?base+ix:ix)};
      var tr=ptTagRow(it.manual?it.tag:null,'manual');for(var k in tr)row[k]=tr[k];
      var r=await sb.from('vehicle_photos').insert(row);
      if(r&&r.error&&(r.error.code==='23514')&&!PT.legacy){PT.legacy=true;tr=ptTagRow(it.manual?it.tag:null,'manual');delete row.tag_source;delete row.tag_confidence;for(k in tr)row[k]=tr[k];r=await sb.from('vehicle_photos').insert(row);}
      if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204')&&/tag_source|tag_confidence/.test(String(r.error.message||''))&&PT.cols!==false){PT.cols=false;delete row.tag_source;delete row.tag_confidence;row.tag=ptDbTag(it.manual?it.tag:null);r=await sb.from('vehicle_photos').insert(row);}
      chk(r);
      if(!first)first=id;
      it.pid=id;it.disp=out.disp;it.state='done';done++;
      if(!it.manual&&PT.fn!==false&&ptFnOk()){it.sorting=true;tagQ.push(it);flushTags(false);}
    }catch(e){
      up.forEach(function(p){removeObject('vehicle-photos',p);});
      if(e&&(e.code==='42703'||e.code==='PGRST204')){PF.ready=false;}
      it.state='fail';it.err=pfErr(e);fails++;
    }
    setP();ptPaintItem(it);
  }
  async function worker(){while(PF.add===A&&next<todo.length){var ix=next++;await one(todo[ix],ix);}}
  setP();
  var ws=[];for(var w=0;w<Math.min(PT.CONC,todo.length);w++)ws.push(worker());
  Promise.all(ws).then(function(){flushTags(true);return tagChain;}).then(async function(){
    if(PF.add!==A)return;
    A.busy=false;
    var ai=todo.filter(function(i){return i.ai;}).length,untagged=todo.filter(function(i){return i.state==='done'&&!i.tag;}).length;
    if(msg=document.getElementById('pfa-msg'))msg.textContent=(done?done+' photo'+(done===1?'':'s')+' added'+(ai?', '+ai+' sorted by AI':'')+'. ':'')+(untagged?untagged+' untagged - tap a tag to sort. ':'')+
      (fails?fails+' failed: '+(todo.filter(function(i){return i.state==='fail';})[0]||{}).err+'. Tap Upload to retry.':'')+(A.note?' '+A.note:'');
    pfAddRender();
    if(done){
      PF.focusId=first;PF.tag='';
      try{await loadAll();}catch(e){}
      refreshCurrent();refreshDetailIfOpen();
      var allManual=todo.every(function(i){return i.state!=='done'||i.manual;});
      if(!fails&&allManual){showToast(done+' photo'+(done===1?'':'s')+' added to the portfolio','success');setTimeout(function(){pfCloseAdd();},350);}
    }
    if(PF.ready===false){pfCloseAdd();showToast(PF_NOTICE,'error');pfRenderControls();}
  });
}
function ptFnOk(){return typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function';}
async function ptTagBatch(v,items){
  var A=PF.add;
  if(PT.fn===false){items.forEach(function(it){it.sorting=false;ptPaintItem(it);});return;}
  var r;try{r=await sb.functions.invoke('tag-photos',{body:{vehicle_id:v.id,photo_ids:items.map(function(i){return i.pid;})}});}catch(e){r={data:null,error:e};}
  if(r&&r.error){
    var st=r.error.context&&r.error.context.status;
    if(st===404||st===503){PT.fn=false;if(A)A.note='';}
    else if(A)A.note=st===429?'Daily auto-sort limit reached - tap a tag to sort the rest.':'Auto-sort is unavailable right now - tap a tag to sort.';
    items.forEach(function(it){it.sorting=false;ptPaintItem(it);});if(A)pfAddRender();return;
  }
  PT.fn=true;
  var res=(r&&r.data&&r.data.results)||[],map={};res.forEach(function(x){map[x.id]=x;});
  for(var i=0;i<items.length;i++){
    var it=items[i],x=map[it.pid];it.sorting=false;
    if(it.manual||!x||!x.tag||PF_TAGS.indexOf(x.tag)<0){ptPaintItem(it);continue;}
    try{await ptUpdateTag(it.pid,x.tag,'ai',x.confidence);it.tag=x.tag;it.ai=true;}catch(e){}
    ptPaintItem(it);
  }
}
// ---------- Documents -> scan-document ----------
async function ptScanBlob(v,blob,label){
  if(!can(v,'can_add_documents')){showToast('Adding documents is not enabled for you on this vehicle.','error');return;}
  var d={id:uid(),vehicleId:v.id,clientId:v.clientId,type:'other',name:label||'Photo document',expiry:'',notes:'',_file:{blob:blob,mime:'image/jpeg',name:'document.jpg'},by:myId()};
  try{await docUpload(d);}catch(e){showToast(friendlyError(e),'error');return;}
  try{await loadAll();refreshCurrent();}catch(e){}
  docAiOpenEdit(d.id,true,{id:d.id,vehicleId:v.id,name:d.name,type:'other',mime:'image/jpeg',by:myId(),ai:null});
}
function ptScanItem(id){
  var A=PF.add,v=PF.v;if(!A||!v)return;
  var it=A.items.filter(function(i){return i.id===id;})[0];if(!it||!it.disp)return;
  pfCloseAdd(true);
  try{if(typeof closeModal==='function')closeModal('modal-vehicle-detail');}catch(e){}
  ptScanBlob(v,it.disp,'Photo document');
}
async function ptScanPhoto(pid){
  var v=PF.v,p=v&&(v._photos||[]).filter(function(x){return x.id===pid;})[0];if(!p)return;
  try{var u=await pfSign(pfDispPath(p));var res=await fetch(u);if(!res.ok)throw new Error('download');var b=await res.blob();
    try{closeModal('modal-vehicle-detail');}catch(e){}ptScanBlob(v,b,'Photo document');}
  catch(e){showToast('Could not open this photo for scanning. Try again.','error');}
}
