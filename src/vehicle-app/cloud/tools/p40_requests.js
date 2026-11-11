// ============ v40 (p40): Client Requests (tech inbox + owner "Make a request"), Comments above Recent activity, Overview option C ============
// Tables come from migration_022_requests_comments.sql. If they are not there yet, every p40 surface hides itself (no errors, no writes).
var RQ={on:null,rows:[],photos:[],at:0,busy:false,tab:'new',open:{},drafts:{}};
var CM={on:null,rows:[],reads:{},seen:{},at:0,draft:{},client:null,more:{}};
var RQ_SVC=[['maintenance','Scheduled maintenance'],['detailing','Detailing'],['tires','Tires and wheels'],['mechanical','Mechanical'],['electrical','Electrical'],['cosmetic','Cosmetic / paint'],['storage','Storage'],['appraisal','Appraisal'],['restoration','Restoration / upgrade'],['other','Something else']];
var RQ_TIME={any:'Any time',morning:'Morning',afternoon:'Afternoon',evening:'Evening'};
var RQ_ST={new:'New',accepted:'Accepted',scheduled:'Scheduled',done:'Done',declined:'Declined'};
function rqUid(){return session&&session.account?session.account.id:null;}
function rqMissing(e){var c=String(e&&e.code||''),m=String(e&&e.message||'');return c==='42P01'||c==='PGRST205'||c==='PGRST204'||c==='PGRST106'||c==='42703'||/does not exist|schema cache|could not find the table/i.test(m);}
function rqId(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}var h='0123456789abcdef',s='';for(var i=0;i<32;i++)s+=h[Math.floor(Math.random()*16)];return s.slice(0,8)+'-'+s.slice(8,12)+'-4'+s.slice(13,16)+'-a'+s.slice(17,20)+'-'+s.slice(20);}
function rqSvcLabel(k){for(var i=0;i<RQ_SVC.length;i++)if(RQ_SVC[i][0]===k)return RQ_SVC[i][1];return 'Request';}
function rqClientName(o){var c=byId(getClients(),o);if(c&&c.name)return c.name;var p=C.profiles&&C.profiles[o];return p?displayName(p):'Client';}
function rqCanStaff(){return isAdvisor()||isAdmin();}
function rqOwnerId(){return isOwner()?ownerClientId():null;}
async function p40Load(force){
  if(!sb||!session||RQ.busy)return;
  if(!force&&Date.now()-RQ.at<15000)return;
  RQ.busy=true;
  try{
    var r=await Promise.all([
      sb.from('service_requests').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('comments').select('*').order('created_at',{ascending:true}).limit(600),
      sb.from('comment_reads').select('*'),
      sb.from('request_photos').select('*').limit(600)]);
    RQ.on=!r[0].error;RQ.rows=r[0].error?[]:(r[0].data||[]);
    CM.on=!r[1].error;CM.rows=r[1].error?[]:(r[1].data||[]);
    CM.reads={};if(!r[2].error)(r[2].data||[]).forEach(function(x){CM.reads[x.owner_id]=x.last_read_at;});
    if(!CM.at)CM.seen=Object.assign({},CM.reads);
    RQ.photos=r[3].error?[]:(r[3].data||[]);
    if(r[0].error&&!rqMissing(r[0].error))console.warn('requests unavailable',r[0].error.message);
  }catch(e){RQ.on=RQ.on||false;CM.on=CM.on||false;}
  RQ.at=CM.at=Date.now();RQ.busy=false;
  p40Refresh();
}
function p40Refresh(){
  var nav=document.querySelector('.nav-item[data-page="requests"]');
  if(nav)nav.style.display=(session&&RQ.on===true)?'':'none';
  var n=rqCanStaff()?RQ.rows.filter(function(r){return r.status==='new';}).length:0;
  var b=document.getElementById('rq-badge');if(b){b.textContent=String(n);b.style.display=n?'':'none';}
  var mk=document.getElementById('cp-rq-btn');if(mk)mk.style.display=RQ.on===true?'':'none';
  ['cp','dash'].forEach(function(p){cmRender(p);});
  var pg=document.getElementById('page-requests');if(pg&&pg.classList.contains('active'))renderRequests();
  if(RQ.on===false){var a=document.getElementById('page-requests');if(a&&a.classList.contains('active'))showPage(isOwner()?'client-portal':'dashboard');}
}
// ---------- Requests page ----------
function rqVisibleRows(){var o=rqOwnerId();return RQ.rows.filter(function(r){return rqCanStaff()||r.owner_id===o;});}
function renderRequests(){
  p40Load();
  var root=document.getElementById('rq-root');if(!root)return;
  var staff=rqCanStaff(),rows=rqVisibleRows();
  elText('rq-title',staff?'Client Requests':'My Requests');
  elText('rq-sub',staff?'Requests sent by your clients':'Ask your advisor for any service, or something else');
  elHTML('rq-actions',staff?'':'<button class="btn btn-primary" onclick="rqOpen()">Make a request</button>');
  if(RQ.on===null){root.innerHTML='<div class="rq-empty">Loading requests</div>';return;}
  if(RQ.on===false){root.innerHTML='<div class="rq-empty">Client requests are not switched on yet.</div>';return;}
  var html='';
  if(staff){
    var cnt={};['new','accepted','scheduled','done'].forEach(function(s){cnt[s]=rows.filter(function(r){return s==='done'?(r.status==='done'||r.status==='declined'):r.status===s;}).length;});
    html+='<div class="rq-tabs" role="tablist">'+['new','accepted','scheduled','done'].map(function(s){return '<button type="button" role="tab" aria-selected="'+(RQ.tab===s)+'" class="rq-tab'+(RQ.tab===s?' on':'')+'" data-t="'+s+'" onclick="rqTab(\''+s+'\')">'+RQ_ST[s]+(s==='new'&&cnt.new?'<span class="rq-cnt">'+cnt.new+'</span>':(cnt[s]?' <i>'+cnt[s]+'</i>':''))+'</button>';}).join('')+'</div>';
    rows=rows.filter(function(r){return RQ.tab==='done'?(r.status==='done'||r.status==='declined'):r.status===RQ.tab;});
  }
  if(!rows.length)html+='<div class="rq-empty">'+(staff?(RQ.tab==='new'?'No new requests. New client requests appear here.':'Nothing here yet.'):'No requests yet. Tap Make a request to ask for a service, or anything else.')+'</div>';
  else html+=rows.map(rqCard).join('');
  root.innerHTML=html;
  rqLoadThumbs();
}
function rqTab(t){RQ.tab=t;renderRequests();}
function rqCard(r){
  var staff=rqCanStaff(),v=byId(getVehicles(),r.vehicle_id),id=jsId(r.id),st=r.status||'new';
  var acts=[];
  if(staff){
    if(st==='new')acts=[['accept','Accept',1],['schedule','Schedule'],['reply','Reply']];
    else if(st==='accepted')acts=[['schedule','Schedule',1],['reply','Reply'],['done','Mark done']];
    else if(st==='scheduled')acts=[['done','Mark done',1],['schedule','Reschedule'],['reply','Reply']];
    else acts=[['reply','Reply']];
  }else{acts=[['reply','Message']];if(st==='new')acts.push(['withdraw','Withdraw']);}
  var ph=RQ.photos.filter(function(x){return x.request_id===r.id;});
  var replies=CM.rows.filter(function(c){return c.request_id===r.id;});
  var when=(r.preferred_date?fmtDate(r.preferred_date):'Flexible')+' \u00b7 '+(RQ_TIME[r.preferred_time]||'Any time');
  var o=RQ.open[r.id]||'';
  return '<article class="rq-card" data-id="'+id+'" data-st="'+esc(st)+'">'+
   '<div class="rq-top"><div class="rq-th">'+(v?phThumb(v):'')+'</div><div class="rq-who">'+(staff?'<div class="rq-cl">'+esc(rqClientName(r.owner_id))+'</div>':'')+'<div class="rq-veh">'+esc(v?(v.nickname||vFull(v)):'Vehicle')+'</div>'+(v&&v.nickname?'<div class="rq-vf">'+esc(vFull(v))+'</div>':'')+'</div><span class="rq-pill rq-'+esc(st)+'">'+esc(RQ_ST[st]||st)+'</span></div>'+
   '<dl class="rq-dl"><div><dt>Request</dt><dd>'+esc(rqSvcLabel(r.service))+'</dd></div>'+
   (r.details?'<div class="rq-det">\u201c'+esc(r.details)+'\u201d</div>':'')+
   '<div><dt>Preferred</dt><dd>'+esc(when)+'</dd></div>'+
   (r.scheduled_for?'<div><dt>Booked</dt><dd>'+esc(fmtDateTime(r.scheduled_for))+'</dd></div>':'')+
   (r.notes?'<div><dt>Notes</dt><dd>'+esc(r.notes)+'</dd></div>':'')+
   '<div><dt>Sent</dt><dd>'+esc(fmtDateTime(r.created_at))+'</dd></div></dl>'+
   (ph.length?'<div class="rq-phs">'+ph.map(function(x){return '<span class="rq-ph" data-path="'+esc(x.storage_path)+'"></span>';}).join('')+'</div>':'')+
   (replies.length?'<div class="rq-replies">'+replies.slice(-3).map(cmMsgHTML).join('')+'</div>':'')+
   (o==='schedule'?'<div class="rq-inline"><label class="rq-lab" for="rq-dt-'+id+'">Date and time</label><input type="datetime-local" id="rq-dt-'+id+'" value="'+esc(rqDtDefault(r))+'"><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqAct(this,\'confirm\')">Confirm</button></div></div>':'')+
   (o==='reply'?'<div class="rq-inline"><label class="rq-lab" for="rq-rp-'+id+'">'+(staff?'Reply to client':'Message your advisor')+'</label><textarea id="rq-rp-'+id+'" rows="3" oninput="RQ.drafts[\''+id+'\']=this.value" placeholder="Write a message">'+esc(RQ.drafts[id]||'')+'</textarea><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqAct(this,\'send\')">Send</button></div></div>':'')+
   (o?'':'<div class="rq-acts">'+acts.map(function(a){return '<button type="button" class="btn'+(a[2]?' btn-primary':'')+'" onclick="rqAct(this,\''+a[0]+'\')">'+a[1]+'</button>';}).join('')+'</div>')+
  '</article>';
}
function rqDtDefault(r){var d=r.scheduled_for?new Date(r.scheduled_for):(r.preferred_date?new Date(r.preferred_date+'T'+({morning:'09:00',afternoon:'13:00',evening:'17:00'}[r.preferred_time]||'10:00')+':00'):new Date(Date.now()+864e5));if(isNaN(d))d=new Date(Date.now()+864e5);var z=function(n){return (n<10?'0':'')+n;};return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes());}
async function rqLoadThumbs(){
  var els=[].slice.call(document.querySelectorAll('.rq-ph[data-path]:not([data-ok])'));if(!els.length||!sb)return;
  try{var paths=els.map(function(e){return e.dataset.path;});var r=await sb.storage.from('vehicle-photos').createSignedUrls(paths,3600);
    (r.data||[]).forEach(function(x,i){var e=els[i];if(e&&x&&x.signedUrl){e.dataset.ok=1;e.innerHTML='<img alt="Request photo" src="'+esc(x.signedUrl)+'">';}});}catch(e){}
}
async function rqUpdate(id,patch,okMsg){
  var r=byId(RQ.rows,id);if(!r)return false;
  var res=await sb.from('service_requests').update(patch).eq('id',id).select();
  if(res.error||!(res.data&&res.data.length)){showToast(res.error&&rqMissing(res.error)?'Requests are not switched on yet':'Could not update this request','error');await p40Load(true);return false;}
  Object.assign(r,res.data[0]||patch);if(okMsg)showToast(okMsg);renderRequests();p40Refresh();return true;
}
async function rqAct(btn,a){
  var card=btn.closest('.rq-card');if(!card)return;var id=card.dataset.id,r=byId(RQ.rows,id);if(!r)return;
  if(a==='close'){delete RQ.open[id];renderRequests();return;}
  if(a==='schedule'||a==='reply'){RQ.open[id]=a;renderRequests();var f=document.getElementById((a==='schedule'?'rq-dt-':'rq-rp-')+id);if(f)f.focus();return;}
  if(btn.disabled)return;btn.disabled=true;
  try{
    if(a==='accept')await rqUpdate(id,{status:'accepted',assigned_tech:rqUid()},'Request accepted');
    else if(a==='done')await rqUpdate(id,{status:'done'},'Marked done');
    else if(a==='confirm'){var v=(document.getElementById('rq-dt-'+id)||{}).value;var d=v?new Date(v):null;
      if(!d||isNaN(d)){showToast('Pick a date and time','error');return;}
      if(await rqUpdate(id,{status:'scheduled',scheduled_for:d.toISOString(),assigned_tech:r.assigned_tech||rqUid()},'Scheduled for '+fmtDateTime(d.toISOString())))delete RQ.open[id];renderRequests();}
    else if(a==='send'){var t=String((document.getElementById('rq-rp-'+id)||{}).value||'').trim();
      if(!t){showToast('Write a message first','error');return;}
      if(await cmPost(r.owner_id,t,r.vehicle_id,r.id)){delete RQ.open[id];delete RQ.drafts[id];renderRequests();}}
    else if(a==='withdraw'){
      var res=await sb.from('service_requests').delete().eq('id',id).select();
      if(res.error||!(res.data&&res.data.length)){showToast('Could not withdraw this request','error');await p40Load(true);return;}
      RQ.rows=RQ.rows.filter(function(x){return x.id!==id;});showToast('Request withdrawn');renderRequests();p40Refresh();}
  }finally{btn.disabled=false;}
}
// ---------- Make a request sheet (owner) ----------
var RQF={v:null,s:null,file:null};
function rqOpen(vid){
  if(RQ.on!==true){showToast('Requests are not switched on yet','error');return;}
  var vs=visibleVehicles();if(!vs.length){showToast('Add a vehicle first','error');return;}
  RQF={v:vid&&byId(vs,vid)?vid:(vs.length===1?vs[0].id:null),s:null,file:null};
  var t=new Date(),z=function(n){return (n<10?'0':'')+n;},min=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());
  elHTML('rq-form',
   '<div class="rq-intro">Your advisor will confirm the time with you.</div>'+
   '<div class="rq-lab" id="rq-vl">Vehicle</div><div class="rq-vs" role="radiogroup" aria-labelledby="rq-vl">'+vs.map(function(v){return '<button type="button" role="radio" aria-checked="'+(RQF.v===v.id)+'" class="rq-vc'+(RQF.v===v.id?' on':'')+'" data-v="'+jsId(v.id)+'" onclick="rqPickV(this)"><span class="rq-th">'+phThumb(v)+'</span><span class="rq-vn">'+esc(v.nickname||vFull(v))+'</span></button>';}).join('')+'</div>'+
   '<div class="rq-lab" id="rq-sl">Service</div><div class="rq-svc" role="radiogroup" aria-labelledby="rq-sl">'+RQ_SVC.map(function(s){return '<button type="button" role="radio" aria-checked="false" class="rq-sv'+(s[0]==='other'?' rq-other':'')+'" data-s="'+s[0]+'" onclick="rqPickS(this)">'+s[1]+'</button>';}).join('')+'</div>'+
   '<div class="rq-f" id="rq-det-w" style="display:none"><label class="rq-lab" for="rq-det">Describe your request</label><textarea id="rq-det" rows="3" maxlength="1000" placeholder="Tell us what you need"></textarea></div>'+
   '<div class="rq-row2"><div class="rq-f"><label class="rq-lab" for="rq-date">Preferred date</label><input type="date" id="rq-date" min="'+min+'"></div><div class="rq-f"><label class="rq-lab" for="rq-time">Time</label><select id="rq-time">'+Object.keys(RQ_TIME).map(function(k){return '<option value="'+k+'">'+RQ_TIME[k]+'</option>';}).join('')+'</select></div></div>'+
   '<div class="rq-f"><label class="rq-lab" for="rq-notes">Notes</label><textarea id="rq-notes" rows="2" maxlength="1000" placeholder="Gate code, collection details, anything else"></textarea></div>'+
   '<div class="rq-f"><span class="rq-lab">Photo (optional)</span><label class="rq-att" for="rq-file"><span id="rq-file-n">Attach photo</span></label><input type="file" id="rq-file" accept="image/*" onchange="rqFile(this)" class="rq-hidden"></div>'+
   '<div class="rq-acts rq-foot"><button type="button" class="btn" onclick="closeModal(\'modal-req\')">Cancel</button><button type="button" class="btn btn-primary" id="rq-send" onclick="rqSubmit()">Send request</button></div>');
  openModal('modal-req');
}
function rqPickV(b){RQF.v=b.dataset.v;[].slice.call(document.querySelectorAll('.rq-vc')).forEach(function(x){var on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on));});}
function rqPickS(b){RQF.s=b.dataset.s;[].slice.call(document.querySelectorAll('.rq-sv')).forEach(function(x){var on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on));});
  var w=document.getElementById('rq-det-w');if(w)w.style.display=RQF.s==='other'?'':'none';if(RQF.s==='other'){var d=document.getElementById('rq-det');if(d)d.focus();}}
function rqFile(inp){var f=inp.files&&inp.files[0];if(f&&f.type&&f.type.indexOf('image/')!==0){showToast('Please choose a photo','error');inp.value='';f=null;}RQF.file=f||null;elText('rq-file-n',f?('Attached: '+f.name):'Attach photo');}
async function rqSubmit(){
  var btn=document.getElementById('rq-send');if(btn&&btn.disabled)return;
  var o=ownerClientId(),v=RQF.v&&byId(visibleVehicles(),RQF.v);
  if(!o||!v){showToast('Choose a vehicle','error');return;}
  if(!RQF.s){showToast('Choose a service, or Something else','error');return;}
  var det=String(val('rq-det')||'').trim();
  if(RQF.s==='other'&&det.length<3){showToast('Describe what you need','error');var d=document.getElementById('rq-det');if(d)d.focus();return;}
  var row={id:rqId(),owner_id:o,vehicle_id:v.id,created_by:rqUid(),service:RQF.s,details:RQF.s==='other'?det:(det||null),preferred_date:val('rq-date')||null,preferred_time:val('rq-time')||'any',notes:String(val('rq-notes')||'').trim()||null,status:'new'};
  if(btn){btn.disabled=true;btn.textContent='Sending';}
  try{
    var r=await sb.from('service_requests').insert(row);
    if(r.error){showToast(rqMissing(r.error)?'Requests are not switched on yet':'Could not send the request. Please try again.','error');return;}
    row.created_at=new Date().toISOString();RQ.rows.unshift(row);
    var photoOk=true;
    if(RQF.file){photoOk=false;try{
      var blob=await shrinkPhotoBlob(RQF.file,1600,1500000);
      var path=v.clientId+'/'+v.id+'/req-'+row.id.slice(0,8)+'-'+Date.now()+'.jpg';
      var up=await sb.storage.from('vehicle-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});
      if(!up.error){var pr={id:rqId(),request_id:row.id,owner_id:o,storage_path:path,uploaded_by:rqUid()};var ins=await sb.from('request_photos').insert(pr);if(!ins.error){RQ.photos.push(pr);photoOk=true;}}
    }catch(e){}}
    closeModal('modal-req');
    showToast(photoOk?'Request sent to your advisor':'Request sent. The photo could not be attached.',photoOk?'':'error');
    p40Refresh();
  }finally{if(btn){btn.disabled=false;btn.textContent='Send request';}}
}
// ---------- Comments (above Recent activity) ----------
function cmThreadOwner(p){
  if(p==='cp')return ownerClientId();
  var cl=getClients().filter(function(c){return c&&c.id;});if(!cl.length)return null;
  if(CM.client&&byId(cl,CM.client))return CM.client;
  var last=CM.rows.slice().reverse().filter(function(c){return byId(cl,c.owner_id);})[0];
  return (CM.client=last?last.owner_id:cl[0].id);
}
function cmAuthor(c,o){
  if(c.author_id===rqUid())return 'You';
  var p=C.profiles&&C.profiles[c.author_id],n=p?displayName(p):'';
  if(isOwner())return (n||'Your advisor')+(c.author_id===o||!p||p.role==='owner'?'':' \u00b7 Advisor');
  return (n||rqClientName(o));
}
function cmMsgHTML(c){
  var mine=c.author_id===rqUid(),v=c.vehicle_id?byId(getVehicles(),c.vehicle_id):null,rq=c.request_id?byId(RQ.rows,c.request_id):null;
  var tag=rq?('Re: '+rqSvcLabel(rq.service)+(v?' \u00b7 '+(v.nickname||vFull(v)):'')):(v?(v.nickname||vFull(v)):'');
  return '<div class="cm-msg'+(mine?' me':'')+'">'+(tag?'<div class="cm-tag">'+esc(tag)+'</div>':'')+'<div class="cm-body">'+esc(c.body)+'</div><div class="cm-meta">'+esc(cmAuthor(c,c.owner_id))+' \u00b7 '+esc(fmtDateTime(c.created_at))+'</div></div>';
}
function cmRender(p){
  var sec=document.getElementById(p+'-cm-sec'),box=document.getElementById(p+'-cm');if(!sec||!box)return;
  var o=CM.on===true?cmThreadOwner(p):null;
  var act=document.getElementById(p+'-act-sec');
  sec.style.display=(o&&(!act||act.style.display!=='none'))?'':'none';if(!o){box.innerHTML='';return;}
  var all=CM.rows.filter(function(c){return c.owner_id===o;}),seen=CM.seen[o]||'',me0=rqUid();
  var unread=all.filter(function(c){return c.author_id!==me0&&(!seen||c.created_at>seen);}).length;
  elHTML(p+'-cm-new',unread?unread+' new':'');
  var lim=CM.more[o]?all.length:6,list=all.slice(-lim);
  var pick='';
  if(p==='dash'){var cl=getClients().filter(function(c){return c&&c.id;});
    pick='<div class="cm-pick"><label class="rq-lab" for="dash-cm-client">Client</label><select id="dash-cm-client" onchange="CM.client=this.value;cmRender(\'dash\')">'+cl.map(function(c){var n=CM.rows.filter(function(x){return x.owner_id===c.id&&x.author_id!==me0&&(!CM.seen[c.id]||x.created_at>CM.seen[c.id]);}).length;return '<option value="'+esc(c.id)+'"'+(c.id===o?' selected':'')+'>'+esc(c.name||'Client')+(n?' ('+n+' new)':'')+'</option>';}).join('')+'</select></div>';}
  var d=CM.draft[p+o]||'';
  box.innerHTML=pick+(all.length>lim?'<button type="button" class="cm-more" onclick="CM.more[\''+jsId(o)+'\']=1;cmRender(\''+p+'\')">Show earlier ('+(all.length-lim)+')</button>':'')+
    '<div class="cm-list" role="log" aria-label="Comments">'+(list.length?list.map(cmMsgHTML).join(''):'<div class="cm-empty">'+(p==='cp'?'Questions or notes for your advisor go here.':'No comments with this client yet.')+'</div>')+'</div>'+
    '<div class="cm-compose"><label class="rq-hidden" for="'+p+'-cm-in">Write a comment</label><textarea id="'+p+'-cm-in" rows="1" maxlength="2000" placeholder="Write a comment" oninput="CM.draft[\''+p+'\'+\''+jsId(o)+'\']=this.value">'+esc(d)+'</textarea><button type="button" class="btn btn-primary" onclick="cmSend(\''+p+'\')">Send</button></div>';
  if(unread)cmMarkRead(o);
}
async function cmMarkRead(o){
  if(!sb||!rqUid())return;var at=new Date().toISOString();
  try{var r=await sb.from('comment_reads').upsert({user_id:rqUid(),owner_id:o,last_read_at:at});if(!r.error)CM.reads[o]=at;}catch(e){}
}
async function cmPost(o,text,vid,rid){
  var row={id:rqId(),owner_id:o,vehicle_id:vid||null,request_id:rid||null,author_id:rqUid(),body:text};
  var r=await sb.from('comments').insert(row);
  if(r.error){showToast(rqMissing(r.error)?'Comments are not switched on yet':'Could not post the comment','error');return false;}
  row.created_at=new Date().toISOString();CM.rows.push(row);CM.reads[o]=row.created_at;
  ['cp','dash'].forEach(cmRender);return true;
}
async function cmSend(p){
  var o=cmThreadOwner(p),inp=document.getElementById(p+'-cm-in');if(!o||!inp)return;
  var t=String(inp.value||'').trim();if(!t){showToast('Write a comment first','error');inp.focus();return;}
  if(await cmPost(o,t)){delete CM.draft[p+o];var i2=document.getElementById(p+'-cm-in');if(i2)i2.value='';showToast('Comment posted');}
}
// ---------- Overview option C: chart + AI estimate, then Portfolio / Brief / Stats ----------
var OVC_T=['portfolio','brief','stats'];
function ovcGet(p){var t='portfolio';try{t=localStorage.getItem('evo_ovc_'+p)||t;}catch(e){}return OVC_T.indexOf(t)>=0?t:'portfolio';}
function ovcApply(p){
  var t=ovcGet(p);
  OVC_T.forEach(function(k){var el=document.getElementById(p+'-ovc-'+k),b=document.querySelector('#'+p+'-ovc [data-t="'+k+'"]');
    if(el)el.hidden=k!==t;if(b){b.classList.toggle('on',k===t);b.setAttribute('aria-selected',String(k===t));b.tabIndex=k===t?0:-1;}});
  var hero=document.getElementById(p+'-hero'),w=document.getElementById(p+'-ovc-wrap');if(w&&hero)w.style.display=hero.style.display==='none'?'none':'';
}
function ovcSet(p,t){try{localStorage.setItem('evo_ovc_'+p,t);}catch(e){}ovcApply(p);if(t==='portfolio'){if(p==='cp')renderClientPortal();else renderDashboard();}}
function ovcKey(e,p){var i=OVC_T.indexOf(ovcGet(p));if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var n=OVC_T[(i+(e.key==='ArrowRight'?1:2))%3];ovcSet(p,n);var b=document.querySelector('#'+p+'-ovc [data-t="'+n+'"]');if(b)b.focus();}}
var _p40RO=renderOverview;
renderOverview=function(owner,vehicles){_p40RO(owner,vehicles);var p=owner?'cp':'dash';ovcApply(p);cmRender(p);p40Load();};
var _p40RD=renderDashboard;
renderDashboard=function(){_p40RD();ovcApply('dash');cmRender('dash');p40Load();};
