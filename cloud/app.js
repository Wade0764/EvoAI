
// Reserved for the cloud version. Photo identification is not part of this build, so this stays empty.
var AI_ID_ENDPOINT = '';
// Reserved for the cloud version. When set, POST vehicle JSON and expect {value,low,high,asOf,sources[],confidence}.
var AI_VALUE_ENDPOINT = '';
// When set, POST vehicle JSON and expect {score,reasons[],asOf}.
var AI_HEALTH_ENDPOINT = '';
// EvoAI - private vehicle collection management - ASCII-only JS
// v5: real device-local sign-in, owner scoping via invite codes, advisory lifecycle,
// escaping, cascade deletes, photo downscaling, backup export/import, audit trail.
// ============ CLOUD CONFIG (public values only; the anon key is safe for clients, RLS protects the data) ============
var SUPABASE_URL='https://xosbchskdtkxogppmkex.supabase.co';
var SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvc2JjaHNrZHRreG9ncHBta2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzgyMzksImV4cCI6MjEwNzkxNDIzOX0.UoSwP5oGOotjfOem5E3Usziz_1IbBdDEryPZlTd8sQs';
var SITE_URL='https://wade0764.github.io/EvoAI/';
var sb=null;
function initClient(){
  try{
    if(!SUPABASE_ANON_KEY||!window.supabase||!window.supabase.createClient)return false;
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'evoai-cloud-auth'}});
    return true;
  }catch(e){sb=null;return false;}
}
function redirectUrl(){
  try{if(/^https?:$/.test(window.location.protocol))return window.location.origin+window.location.pathname;}catch(e){}
  return SITE_URL;
}
// ============ DATA LAYER (in-memory cache hydrated from Supabase; writes are diffed and sent in order) ============
// Only small UI preferences (last used vehicle) use localStorage.
var DB={
  get:function(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}},
  set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}},
  remove:function(k){try{localStorage.removeItem(k);}catch(e){}}
};
function emptyCache(){return {profile:null,clients:[],pending:[],vehicles:[],archiveVehicles:[],inspections:[],recs:[],logs:[],expenses:[],docs:[],invites:[],access:[],permRows:[],vis:{},transfers:{},team:[],audit:[],profiles:{},loadedAt:0};}
var C=emptyCache();
var SNAP={};
var LOCAL_AUDIT=[];
var SESSION_START=new Date().toISOString();
function getClients(){return C.clients;}
function setClients(v){return true;}
function getVehicles(){return C.vehicles.concat(C.archiveVehicles);}
function getInspections(){return C.inspections;}
function getRecs(){return C.recs.map(normRec);}
function getLogs(){return C.logs;}
function getExpenses(){return C.expenses;}
function getDocs(){return C.docs;}
function getInvites(){return C.invites;}
function setVehicles(v){C.vehicles=v.filter(function(x){return x&&!x._ar;});syncKind('vehicles',C.vehicles);return true;}
function setInspections(v){C.inspections=v;syncKind('inspections',v);return true;}
function setRecs(v){C.recs=v;syncKind('recs',v);return true;}
function setLogs(v){C.logs=v;syncKind('logs',v);return true;}
function setExpenses(v){C.expenses=v;syncKind('expenses',v);return true;}
function setDocs(v){C.docs=v;syncKind('docs',v);return true;}
function getAudit(){
  var out=LOCAL_AUDIT.slice(),i,e,me0=session&&session.account?session.account.id:'';
  for(i=0;i<C.audit.length;i++){e=C.audit[i];if(e.actorId===me0&&e.at>=SESSION_START)continue;out.push(e);}
  return out;
}
function normRec(r){
  if(!r)return r;
  if(['open','accepted','declined','completed'].indexOf(r.status)<0)r.status='open';
  if(['red','yellow','green'].indexOf(r.urgency)<0)r.urgency='green';
  return r;
}
// ---- uuid ids (the database uses uuid primary keys; the app creates them) ----
function uid(){
  var b=new Uint8Array(16),i,h='';
  try{window.crypto.getRandomValues(b);}catch(e){for(i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);}
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  for(i=0;i<16;i++){h+=('0'+b[i].toString(16)).slice(-2);if(i===3||i===5||i===7||i===9)h+='-';}
  return h;
}
function isUuid(s){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));}
// ---- hidden extras: app-only fields packed after a marker at the end of a free-text column ----
var XT='~evo~';
function packX(text,obj){
  var o={},k,has=false;
  for(k in obj)if(obj.hasOwnProperty(k)&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!==''){o[k]=obj[k];has=true;}
  text=String(text===null||text===undefined?'':text);
  return has?(text+'\n'+XT+JSON.stringify(o)):text;
}
function unpackX(s){
  s=String(s===null||s===undefined?'':s);
  var i=s.lastIndexOf(XT),x={};
  if(i<0)return {text:s.replace(/\s+$/,''),x:{}};
  try{x=JSON.parse(s.slice(i+XT.length));}catch(e){x={};}
  return {text:s.slice(0,i).replace(/\s+$/,''),x:(x&&typeof x==='object')?x:{}};
}
function nz(s){s=(s===undefined||s===null)?'':String(s).trim();return s===''?null:s;}
// ---- helpers ----
function chk(res){if(res&&res.error)throw res.error;return res;}
function myId(){return session&&session.account?session.account.id:'';}
function displayName(p){return p?(p.display_name||p.email||'Someone'):'Someone';}
var NEEDS_BACKEND='Needs one backend update - Appy is applying it';
function rpcMissing(err){
  var m=String((err&&(err.message||err.error_description||err))||''),c=String((err&&err.code)||'');
  return c==='PGRST202'||/could not find the function|schema cache/i.test(m)||(c==='404'&&/rpc/i.test(m));
}
function friendlyError(err){
  var m=String((err&&(err.message||err.error_description||err))||''),c=String((err&&err.code)||'');
  if(rpcMissing(err))return NEEDS_BACKEND+'.';
  if(/client_already_on_app/.test(m))return 'That person already has an EvoAI account. Use Invite to app with their email instead.';
  if(/managed_client_exists/.test(m))return 'You already have a client with that email.';
  if(/name_required/.test(m))return 'Enter the client name.';
  if(/invalid_email/.test(m))return 'That email address does not look right.';
  if(/client_has_vehicles/.test(m))return 'Remove or move this client\'s vehicles first.';
  if(/vin_conflict/.test(m))return 'A vehicle with the same VIN is already in the account. Ask Wade to sort out the duplicate.';
  if(/cannot_claim_own_client/.test(m))return 'You cannot claim a client you created.';
  if(/only techs can add clients/.test(m))return 'Only techs can add clients.';
  if(/too_many_managed_clients/.test(m))return 'That is the maximum number of clients not yet on the app.';
  if(/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(m)&&!c)return 'You seem to be offline. That change was not saved. Please try again when you are back online.';
  if(c==='42501'||/row-level security|permission denied/i.test(m))return 'You do not have permission to make that change.';
  if(c==='23505'||/duplicate key/i.test(m))return /vin/i.test(m)?'A vehicle with that VIN is already in this collection.':'That already exists.';
  if(c==='23502'||/violates not-null/i.test(m))return 'Something needed was missing, so that did not save. Please close and reopen this page, then try again.';
  if(c==='23514'||/violates check/i.test(m))return 'One of the values was not accepted. Please check the details and try again.';
  if(/invalid_or_expired_invite/.test(m))return 'That code is not valid. It may be used, expired or revoked. Ask for a new one.';
  if(/cannot_redeem_own_invite/.test(m))return 'You cannot use a code that you created.';
  if(/role_not_eligible/.test(m))return 'This account cannot use that kind of code.';
  if(/too_many_open_invites/.test(m))return 'There are too many open codes. Revoke some and try again.';
  if(/transfer_already_pending/.test(m))return 'A transfer is already pending for this vehicle.';
  if(/cannot_transfer_to_self/.test(m))return 'You cannot transfer a vehicle to yourself.';
  if(/access_revoked/.test(m))return 'That access has already ended.';
  if(/JWT|token.*expired|not_authenticated/i.test(m))return 'Your session ended. Please sign in again.';
  return 'That did not save. Please try again in a moment.';
}
function dataUrlToBlob(u){
  var i=u.indexOf(','),meta=u.slice(5,i),mime=meta.split(';')[0]||'image/jpeg',bin=atob(u.slice(i+1)),n=bin.length,a=new Uint8Array(n),k;
  for(k=0;k<n;k++)a[k]=bin.charCodeAt(k);
  return new Blob([a],{type:mime});
}
function extOf(mime,name){
  var m=String(mime||'').toLowerCase();
  if(m==='application/pdf')return 'pdf';
  if(m==='image/png')return 'png';
  if(m==='image/webp')return 'webp';
  if(m==='image/heic')return 'heic';
  if(m==='text/plain')return 'txt';
  if(m.indexOf('image/')===0)return 'jpg';
  var mm=/\.([a-z0-9]{2,5})$/i.exec(String(name||''));return mm?mm[1].toLowerCase():'bin';
}
// ---- permissions (UI mirrors the database rules; the database is the real gate) ----
var PERM_KEYS=['view_service_records','view_expenses','view_documents','view_reminders','view_value_estimate','view_health_estimate','view_purchase_info','view_photos','can_add_service','can_add_documents','can_add_expenses','can_create_advisories'];
function isRealOwnerOf(v){return !!(v&&v.clientId&&(v.clientId===myId()||(typeof CO!=='undefined'&&CO.of&&v.clientId===CO.of)));}
// A client the tech created that is not on the app yet: the tech acts as the owner until the client claims it (database rule: private.is_managing_tech).
function managedMine(clientId){
  if(!session||!clientId)return false;
  var c=byId(C.clients,clientId);
  return !!(c&&c.managed&&!c.claimed&&c.managedBy===myId());
}
function can(v,perm){
  if(!v||!session)return false;
  if(realAdmin())return perm!=='can_create_advisories';
  if(isRealOwnerOf(v)||managedMine(v.clientId))return perm!=='can_create_advisories';
  var row=C.vis[v.id];return !!(row&&row[perm]);
}
function canAny(perm,list){
  var vs=list||activeVehicles(),i;
  for(i=0;i<vs.length;i++)if(can(vs[i],perm))return true;
  return false;
}
function canEditVehicle(v){return !!(v&&session&&(realAdmin()||isRealOwnerOf(v)||managedMine(v.clientId)));}
function canManageReminders(v){return canEditVehicle(v);}
function canAddVehicleFor(clientId){
  if(!session||!clientId)return false;
  if(realAdmin())return true;
  if(clientId===myId()||(typeof CO!=='undefined'&&CO.of&&clientId===CO.of))return true;
  if(managedMine(clientId))return true;
  var cl=byId(C.clients,clientId);return !!(cl&&cl.canAdd);
}
function isRealTech(){return !!(session&&session.account&&session.account.role==='tech');}
// ---- sync queue: writes go out one at a time, in order. On failure the cache is reloaded from the server. ----
var Q={chain:Promise.resolve(),pending:0,failed:false,errShown:false};
function enqueue(label,fn){
  Q.pending++;
  setSyncBadge();
  Q.chain=Q.chain.then(function(){if(Q.failed)return null;return fn();}).then(function(){qDone(false,null);},function(err){qDone(true,err);});
}
function qDone(failed,err){
  Q.pending--;
  if(failed&&!Q.failed){Q.failed=true;showToast(friendlyError(err),'error');}
  if(Q.pending<=0){
    Q.pending=0;
    var wasFailed=Q.failed;Q.failed=false;
    setSyncBadge();
    if(wasFailed)reloadAll(true);else afterSync();
  }
}
function setSyncBadge(){var el=document.getElementById('sync-badge');if(el)el.style.display=Q.pending>0?'block':'none';}
function afterSync(){
  fetchAudit().then(function(){try{if(session){var a=document.querySelector('.page.active');if(a&&(a.id==='page-audit'||a.id==='page-dashboard'||a.id==='page-client-portal'))refreshCurrent();}}catch(e){}});
}
// ---- per-kind diffing ----
function snapClone(item){
  try{return JSON.parse(JSON.stringify(item,function(k,val){
    if(k&&k.charAt(0)==='_')return undefined;
    if(k==='image'&&typeof val==='string'&&val.indexOf('data:')===0)return 'data';
    return val;
  }));}catch(e){return null;}
}
function buildSnap(kind,list){
  var m={},i;
  for(i=0;i<list.length;i++)if(list[i]&&list[i].id)m[list[i].id]={sig:KIND[kind].sig(list[i]),item:snapClone(list[i])};
  SNAP[kind]=m;
}
function syncKind(kind,list){
  if(!sb||!session)return;
  var K=KIND[kind],prev=SNAP[kind]||{},seen={},i,it,p;
  for(i=0;i<list.length;i++){
    it=list[i];if(!it||!it.id)continue;
    seen[it.id]=1;p=prev[it.id];
    if(!p){
      (function(item){enqueue(kind+'.insert',function(){return K.insert(item);});})(it);
      prev[it.id]={sig:K.sig(it),item:snapClone(it)};
    }else{
      var s=K.sig(it);
      if(s!==p.sig){
        (function(item,pv){enqueue(kind+'.update',function(){return K.update(item,pv);});})(it,p.item);
        prev[it.id]={sig:s,item:snapClone(it)};
      }
    }
  }
  for(var id in prev)if(prev.hasOwnProperty(id)&&!seen[id]){
    (function(pv){enqueue(kind+'.remove',function(){return K.remove(pv);});})(prev[id].item);
    delete prev[id];
  }
  SNAP[kind]=prev;
}
// ---- mappings ----
var EXP_TO_DB={maintenance:'maintenance',detailing:'detailing',insurance:'insurance',storage:'storage',registration:'registration',transport:'other',restoration:'modification',other:'other'};
var DOC_TO_DB={title:'title',registration:'registration',insurance:'insurance',invoice:'invoice',service:'other',provenance:'other',appraisal:'other',other:'other'};
var URG_TO_DB={red:'urgent',yellow:'recommended',green:'info'},URG_FROM_DB={urgent:'red',recommended:'yellow',info:'green'};
var REC_TO_DB={open:'pending',accepted:'accepted',declined:'declined',completed:'completed'},REC_FROM_DB={pending:'open',accepted:'accepted',declined:'declined',completed:'completed'};
function parseCost(s){var m=/[0-9][0-9,]*(\.[0-9]+)?/.exec(String(s||''));if(!m)return null;var n=parseFloat(m[0].replace(/,/g,''));return isNaN(n)?null:n;}
function vx(v){return {trim:v.trim||'',ins:Number(v.insuredValue)>0?Number(v.insuredValue):'',svcM:svcMonths(v),svcI:svcMiles(v),insRep:v.insRepeat==='6months'?'6months':'yearly',rep:v.isReplica?1:'',bld:v.isReplica?(v.builder||''):'',eng:v.engine||'',body:v.bodyClass||'',vdec:v.vinDecodedAt||'',pl:msX(v).pl,plr:msX(v).plr,loc:msX(v).loc,insc:msX(v).insc,cur:msX(v).cur,cfc:cbX(v).cfc,cfr:cbX(v).cfr};}
function vCore(v){
  return {year:toInt(v.year),make:v.make,model:v.model,color:nz(v.color),nickname:nz(v.nickname),vin:nz(String(v.vin||'').toUpperCase()),mileage:Number(v.mileage)>0?Math.round(Number(v.mileage)):null,notes:packX(v.notes||'',vx(v)),archived:!!v.archived};
}
function remSpecs(v){
  var o={},d;
  d=dateField(v,'regExpiry');if(d)o.tag={title:'Registration',due_date:d,due_mileage:null,repeat_months:12,repeat_miles:null};
  d=dateField(v,'insRenewal');if(d)o.insurance={title:'Insurance renewal',due_date:d,due_mileage:null,repeat_months:v.insRepeat==='6months'?6:12,repeat_miles:null};
  d=dateField(v,'inspExpiry');if(d)o.inspection={title:'Inspection / emissions',due_date:d,due_mileage:null,repeat_months:12,repeat_miles:null};
  var nd=dateField(v,'nextServiceDate'),nm=Number(v.nextServiceMiles)>0?Math.round(Number(v.nextServiceMiles)):null;
  if(nd||nm){var m=svcMonths(v),mi=svcMiles(v);o.service={title:'Service',due_date:nd||null,due_mileage:nm,repeat_months:m>0?m:null,repeat_miles:mi>0?mi:null};}
  return o;
}
function vview(v){
  var cs=[],i,r,rl=v.reminders||[],sl=v.serviceLog||[],sids=[];
  for(i=0;i<rl.length;i++){r=rl[i];if(r)cs.push([r.id,r.title,dateField(r,'due'),safeRepeat(r.repeat),r.doneAt||'']);}
  for(i=0;i<sl.length;i++)if(sl[i])sids.push(sl[i].id);
  var pp=Number(v.purchasePrice)>0?Number(v.purchasePrice):0;
  return {core:vCore(v),pp:pp,pd:v.purchaseDate||'',rem:remSpecs(v),cs:cs,sl:sids,img:(typeof v.image==='string'&&v.image.indexOf('data:')===0)?'data':(v.image?'url':'')};
}
// ---------- vehicles ----------
async function finSave(v,prev){
  var pp=Number(v.purchasePrice)>0?Number(v.purchasePrice):null,pd=v.purchaseDate||null;
  var had=prev&&((Number(prev.purchasePrice)>0)||prev.purchaseDate);
  if(pp===null&&!pd){if(had)chk(await sb.from('vehicle_financials').delete().eq('vehicle_id',v.id));return;}
  if(had)chk(await sb.from('vehicle_financials').update({purchase_price:pp,purchase_date:pd}).eq('vehicle_id',v.id));
  else chk(await sb.from('vehicle_financials').insert({vehicle_id:v.id,purchase_price:pp,purchase_date:pd}));
}
function remRow(spec){return {title:spec.title,due_date:spec.due_date,due_mileage:spec.due_mileage,repeat_months:spec.repeat_months,repeat_miles:spec.repeat_miles};}
async function remSync(v,prev){
  var want=remSpecs(v),had=prev?remSpecs(prev):{},ids=v._rem||(v._rem={}),kinds=['tag','insurance','inspection','service'],i,k,d,p;
  for(i=0;i<kinds.length;i++){
    k=kinds[i];d=want[k];p=had[k];
    if(d&&(!p||!ids[k])){
      var nid=uid(),row=remRow(d);row.id=nid;row.vehicle_id=v.id;row.kind=k;row.created_by=myId();
      chk(await sb.from('reminders').insert(row));ids[k]=nid;
    }else if(d&&p&&JSON.stringify(d)!==JSON.stringify(p)){
      chk(await sb.from('reminders').update(remRow(d)).eq('id',ids[k]));
    }else if(!d&&p&&ids[k]){
      chk(await sb.from('reminders').delete().eq('id',ids[k]));delete ids[k];
    }
  }
  var cur=v.reminders||[],old=(prev&&prev.reminders)||[],omap={},cmap={};
  for(i=0;i<old.length;i++)if(old[i])omap[old[i].id]=old[i];
  for(i=0;i<cur.length;i++){
    var r=cur[i];if(!r)continue;cmap[r.id]=1;
    var row2={title:String(r.title||'Reminder').slice(0,80),due_date:dateField(r,'due')||null,repeat_months:repeatMonths(safeRepeat(r.repeat))||null,completed_at:r.doneAt?(String(r.doneAt).slice(0,10)+'T12:00:00Z'):null};
    if(!row2.due_date)continue;
    if(!omap[r.id]){row2.id=r.id;row2.vehicle_id=v.id;row2.kind='custom';row2.created_by=myId();chk(await sb.from('reminders').insert(row2));}
    else if(JSON.stringify([omap[r.id].title,dateField(omap[r.id],'due'),safeRepeat(omap[r.id].repeat),omap[r.id].doneAt||''])!==JSON.stringify([r.title,dateField(r,'due'),safeRepeat(r.repeat),r.doneAt||''])){
      chk(await sb.from('reminders').update(row2).eq('id',r.id));
    }
  }
  for(var oid in omap)if(omap.hasOwnProperty(oid)&&!cmap[oid])chk(await sb.from('reminders').delete().eq('id',oid));
}
async function svcSync(v,prev){
  var cur=v.serviceLog||[],old={},i,s;
  var po=(prev&&prev.serviceLog)||[];
  for(i=0;i<po.length;i++)if(po[i])old[po[i].id]=1;
  for(i=0;i<cur.length;i++){
    s=cur[i];if(!s||old[s.id])continue;
    var note=String(s.note||'Service completed'),cost=Number(s.cost)>0?Number(s.cost):null;
    chk(await sb.from('service_records').insert({id:s.id,vehicle_id:v.id,created_by:myId(),title:note.slice(0,120),description:note.length>120?note:null,category:'maintenance',performed_on:dateField({d:s.date},'d')||todayISO(),mileage:Number(s.mileage)>0?Math.round(Number(s.mileage)):null,cost:cost}));
  }
}
async function uploadPhoto(v,blob,cover){
  var path=v.clientId+'/'+v.id+'/'+uid()+'.'+extOf(blob.type,'');
  chk(await sb.storage.from('vehicle-photos').upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:false}));
  var pid=uid(),so=(v._photos||[]).length;
  try{
    if(cover)await sb.from('vehicle_photos').update({is_cover:false}).eq('vehicle_id',v.id).eq('is_cover',true);
    chk(await sb.from('vehicle_photos').insert({id:pid,vehicle_id:v.id,uploaded_by:myId(),storage_path:path,is_cover:!!cover,sort_order:so}));
  }catch(e){try{await sb.storage.from('vehicle-photos').remove([path]);}catch(e2){}throw e;}
  var su=null;try{var r=await sb.storage.from('vehicle-photos').createSignedUrl(path,3600);su=r&&r.data?r.data.signedUrl:null;}catch(e3){}
  if(!v._photos)v._photos=[];
  v._photos.push({id:pid,path:path,thumb:'',disp:'',tag:'',sort:so,at:new Date().toISOString(),url:su,isCover:!!cover,caption:'',by:myId()});
  return su;
}
async function imgSync(v,prev){
  var isData=typeof v.image==='string'&&v.image.indexOf('data:')===0;
  if(isData){
    var blob=dataUrlToBlob(v.image),su=await uploadPhoto(v,blob,true);
    if(su)v.image=su;
    var ph=v._photos||[],i;for(i=0;i<ph.length;i++)ph[i].isCover=(ph[i].path&&su&&ph[i].url===su);
  }else if(!v.image&&prev&&prev.image){
    var cov=(v._photos||[]).filter(function(p){return p.isCover;})[0];
    if(cov){
      chk(await sb.from('vehicle_photos').delete().eq('id',cov.id));
      try{await sb.storage.from('vehicle-photos').remove([cov.path]);}catch(e){}
      v._photos=(v._photos||[]).filter(function(p){return p.id!==cov.id;});
    }
  }
}
async function removeObject(bucket,path){try{if(path)await sb.storage.from(bucket).remove([path]);}catch(e){}}
var KIND={
  vehicles:{
    sig:function(v){return JSON.stringify(vview(v));},
    insert:async function(v){
      var c=vCore(v),row={id:v.id,owner_id:v.clientId,year:c.year,make:c.make,model:c.model,color:c.color,nickname:c.nickname,vin:c.vin,mileage:c.mileage,notes:c.notes,archived:false};if(typeof PO!=='undefined'&&PO.cols===true&&v.portfolioId)row.portfolio_id=v.portfolioId;
      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);await msSyncCols(v);await vinSyncCols(v);try{valueAutoQueue(v.id);}catch(e){}
      if(canEditVehicle(v)||canAddVehicleFor(v.clientId)){
        if(Number(v.purchasePrice)>0||v.purchaseDate){if(canEditVehicle(v))await finSave(v,null);}
        if(canEditVehicle(v))await remSync(v,null);
      }
      await imgSync(v,null);
      await svcSync(v,null);
    },
    update:async function(v,prev){
      var pv=prev||{};
      var ed=canEditVehicle(v);
      if(ed){
        var oc=JSON.stringify(vCore(pv.make===undefined?v:pv)),nc=JSON.stringify(vCore(v));
        if(!prev||oc!==nc){
          var c=vCore(v);
          chk(await sb.from('vehicles').update({year:c.year,make:c.make,model:c.model,color:c.color,nickname:c.nickname,vin:c.vin,mileage:c.mileage,notes:c.notes,archived:c.archived}).eq('id',v.id));
          await vrSyncCols(v);await msSyncCols(v);await vinSyncCols(v);
        }
        if(String(pv.purchasePrice||'')!==String(v.purchasePrice||'')||String(pv.purchaseDate||'')!==String(v.purchaseDate||''))await finSave(v,pv);
        await remSync(v,pv);
        await imgSync(v,pv);
      }
      await svcSync(v,pv);
    },
    remove:async function(pv){chk(await sb.from('vehicles').delete().eq('id',pv.id));}
  },
  inspections:{
    sig:function(x){return JSON.stringify([x.date,x.aiSummary,x.notes]);},
    insert:async function(x){
      var text=String(x.aiSummary||x.notes||'Inspection completed.');
      var ex={tech:x.tech,bat:x.battery,tnd:x.tender,fl:x.tireFL,fr:x.tireFR,rl:x.tireRL,rr:x.tireRR,ms:x.mileageStart,me:x.mileageEnd,cond:x.condition,cc:(x.conditionChecks||[]).join('|'),sv:(x.services||[]).join('|'),notes:x.notes,sum:x.aiSummary};
      var mi=toInt(x.mileageEnd||'');
      chk(await sb.from('service_records').insert({id:x.id,vehicle_id:x.vehicleId,created_by:myId(),title:'Inspection',description:packX(text.slice(0,1500),ex),category:'inspection',performed_on:dateField({d:x.date},'d')||todayISO(),mileage:(mi!==null&&mi>=0)?mi:null,shop_name:nz(x.tech)}));
    },
    update:async function(){},
    remove:async function(pv){chk(await sb.from('service_records').delete().eq('id',pv.id));}
  },
  logs:{
    sig:function(x){return JSON.stringify([x.notes]);},
    insert:async function(x){
      var t=String(x.notes||'');
      chk(await sb.from('service_records').insert({id:x.id,vehicle_id:x.vehicleId,created_by:myId(),title:'Note',description:t.slice(0,1500),category:'other',performed_on:dateField({d:x.date},'d')||todayISO()}));
    },
    update:async function(){},
    remove:async function(pv){chk(await sb.from('service_records').delete().eq('id',pv.id));}
  },
  expenses:{
    sig:function(e){return JSON.stringify([e.amount,e.date,e.desc,e.category,e.valueAdd]);},
    insert:async function(e){
      var rd='';
      if(e._file){
        try{rd=await docUpload({id:uid(),vehicleId:e.vehicleId,clientId:e.clientId,type:'invoice',name:'Receipt: '+String(e.desc||e.category||'expense').slice(0,60),_file:e._file,_kind:'receipt'});}
        catch(err){showToast('Expense saved. The receipt could not be attached: '+friendlyError(err),'error');}
      }
      chk(await sb.from('expenses').insert({id:e.id,vehicle_id:e.vehicleId,category:EXP_TO_DB[e.category]||'other',amount:e.amount,incurred_on:dateField({d:e.date},'d')||todayISO(),notes:packX(e.desc||'',{cat:e.category,va:e.valueAdd==='yes'?'yes':'',rd:rd}),created_by:myId()}));
    },
    update:async function(e){
      chk(await sb.from('expenses').update({category:EXP_TO_DB[e.category]||'other',amount:e.amount,incurred_on:dateField({d:e.date},'d')||todayISO(),notes:packX(e.desc||'',{cat:e.category,va:e.valueAdd==='yes'?'yes':'',rd:e.rd||''})}).eq('id',e.id));
    },
    remove:async function(pv){
      chk(await sb.from('expenses').delete().eq('id',pv.id));
      if(pv.rd){
        var path=null,i;for(i=0;i<DOC_PATHS.length;i++)if(DOC_PATHS[i].id===pv.rd)path=DOC_PATHS[i].path;
        try{await sb.from('documents').delete().eq('id',pv.rd);await removeObject('vehicle-documents',path);}catch(e){}
      }
    }
  },
  docs:{
    sig:function(d){return JSON.stringify([d.name]);},
    insert:async function(d){await docUpload(d);},
    update:async function(){},
    remove:async function(pv){
      var path=null,i;for(i=0;i<DOC_PATHS.length;i++)if(DOC_PATHS[i].id===pv.id)path=DOC_PATHS[i].path;
      chk(await sb.from('documents').delete().eq('id',pv.id));
      await removeObject('vehicle-documents',path);
      await dtRemoveThumb(pv.id);
    }
  },
  recs:{
    sig:function(r){return JSON.stringify([r.status,r.response&&r.response.note,r.title]);},
    insert:async function(r){
      chk(await sb.from('advisories').insert({id:r.id,vehicle_id:r.vehicleId,from_tech_id:myId(),title:r.title,body:packX(r.description||'',{cat:r.category,vi:r.valueImpact,cost:r.cost}),severity:URG_TO_DB[r.urgency]||'info',estimated_cost:parseCost(r.cost)}));
    },
    update:async function(r,prev){
      var upd={status:REC_TO_DB[r.status]||'pending'};
      if(r.response&&r.response.note&&(!prev||!prev.response||prev.response.note!==r.response.note))upd.owner_response=r.response.note;
      chk(await sb.from('advisories').update(upd).eq('id',r.id));
    },
    remove:async function(pv){chk(await sb.from('advisories').delete().eq('id',pv.id));}
  }
};
var DOC_PATHS=[];
async function docUpload(d){
  var f=d._file,blob,mime,name,kind=d._kind||DOC_TO_DB[d.type]||'other';
  if(f&&f.blob){blob=f.blob;mime=f.mime||blob.type||'application/octet-stream';name=f.name||'';}
  else{
    mime='text/plain';
    blob=new Blob([String(d.name||'Document')+(d.notes?('\n'+d.notes):'')+'\n'],{type:'text/plain'});
    name='record.txt';
  }
  var path=d.clientId+'/'+d.vehicleId+'/'+uid()+'.'+extOf(mime,name);
  chk(await sb.storage.from('vehicle-documents').upload(path,blob,{contentType:mime,upsert:false}));
  var ownerOnly=!!(d.type==='insurance'||d.type==='title')&&(realAdmin()||d.clientId===myId()||(typeof CO!=='undefined'&&CO.of&&d.clientId===CO.of)||managedMine(d.clientId));
  try{
    await dtInsertDoc({id:d.id,vehicle_id:d.vehicleId,uploaded_by:myId(),kind:kind,title:packX(String(d.name||'Document').slice(0,120),{type:d.type,exp:d.expiry,notes:d.notes}),storage_path:path,mime_type:mime,size_bytes:blob.size||null,owner_only:ownerOnly},blob,mime,path);
  }catch(e){await removeObject('vehicle-documents',path);throw e;}
  DOC_PATHS.push({id:d.id,path:path});
  return d.id;
}
// ============ HYDRATION ============
async function tbl(name,build){
  try{
    var r=await (build?build(sb.from(name).select('*')):sb.from(name).select('*'));
    if(r&&r.error){
      if(/failed to fetch|network|load failed/i.test(String(r.error.message||'')))throw new Error('network');
      LOAD_ERRORS.push(name+': '+(r.error.message||r.error.code));return [];
    }
    return (r&&r.data)||[];
  }catch(e){if(String(e&&e.message)==='network'||/fetch|network|load failed/i.test(String(e&&e.message)))throw new Error('network');LOAD_ERRORS.push(name);return [];}
}
var LOAD_ERRORS=[];
function groupBy(rows,key){var m={},i;for(i=0;i<rows.length;i++){var k=rows[i][key];(m[k]||(m[k]=[])).push(rows[i]);}return m;}
function latestBy(rows,tsKey){return rows.slice().sort(function(a,b){return String(b[tsKey]||'').localeCompare(String(a[tsKey]||''));});}
async function signedMap(bucket,paths){
  var map={};
  if(!paths.length)return map;
  try{
    var r=await sb.storage.from(bucket).createSignedUrls(paths,3600);
    if(r&&r.data)for(var i=0;i<r.data.length;i++)if(r.data[i]&&r.data[i].signedUrl&&r.data[i].path)map[r.data[i].path]=r.data[i].signedUrl;
  }catch(e){}
  return map;
}
function strList(a,max){
  var out=[],i,x;
  if(Object.prototype.toString.call(a)!=='[object Array]')return out;
  for(i=0;i<a.length&&out.length<max;i++){x=a[i];if(x&&typeof x==='object')x=x.name||x.title||x.text||x.url||'';x=String(x||'').trim().slice(0,200);if(x)out.push(x);}
  return out;
}
function auditText(r,vehName){
  var lab={vehicles:'Vehicle',service_records:'Service record',documents:'Document',advisories:'Advisory',tech_access:'Tech access',tech_permissions:'Tech permissions',vehicle_financials:'Purchase details',invites:'Invite',transfers:'Transfer'}[r.entity_table]||r.entity_table;
  if(r.action==='invite_redeemed')return 'An invite code was redeemed';
  var verb=r.action==='insert'?'added':(r.action==='delete'?'removed':'updated');
  if(r.entity_table==='tech_access')verb=r.action==='insert'?'granted':(r.action==='delete'?'removed':'changed');
  return lab+' '+verb+(vehName?' ('+vehName+')':'');
}
async function fetchAudit(){
  if(!sb||!session)return;
  try{
    var r=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(300);
    if(r.error)return;
    var out=[],i,row,v,p,me0=myId();
    for(i=0;i<(r.data||[]).length;i++){
      row=r.data[i];v=row.vehicle_id?byId(C.vehicles,row.vehicle_id):null;p=C.profiles[row.actor_id];
      out.push({id:'db'+row.id,at:row.created_at,actorId:row.actor_id||'',actor:row.actor_id===me0?'You':(p?displayName(p):'Someone'),role:p?(p.role==='owner'?'owner':(p.role==='admin'?'admin':'advisor')):'system',action:row.action,text:auditText(row,v?vName(v):''),clientId:row.owner_id||'',vehicleId:row.vehicle_id||'',ownerVisible:true});
    }
    C.audit=out;
  }catch(e){}
}
async function loadAll(){
  LOAD_ERRORS=[];
  var me0=myId();
  var prof=await tbl('profiles');
  var profMap={},i,j;
  for(i=0;i<prof.length;i++)profMap[prof[i].id]=prof[i];
  var mine=profMap[me0];
  if(!mine)throw new Error('noprofile');
  DOCAI_REM={};
  var res=await Promise.all([tbl('vehicles'),tbl('vehicle_financials'),tbl('reminders'),tbl('service_records'),tbl('expenses'),tbl('documents'),tbl('vehicle_photos'),tbl('advisories'),tbl('ai_estimates'),tbl('tech_access'),tbl('tech_permissions'),tbl('invites'),tbl('transfers'),tbl('vehicle_archives'),mine.role==='tech'?tbl('my_tech_visibility'):Promise.resolve([]),ovLoad(),cmLoad(),poLoad()]);
  var rows={veh:res[0],fin:res[1],rem:res[2],svc:res[3],exp:res[4],doc:res[5],pho:res[6],adv:res[7],est:res[8],acc:res[9],perm:res[10],inv:res[11],xfer:res[12],arc:res[13],vis:res[14],ov:res[15]||[]};CO.rows=res[16]||[];CO.of=coOfRows(CO.rows,me0);poSet(res[17]);
  var nc=emptyCache();
  nc.profile=mine;nc.profiles=profMap;
  var archOwners={},keepV={};
  for(i=0;i<prof.length;i++)if(prof[i].archived_at)archOwners[prof[i].id]=1;
  rows.veh=rows.veh.filter(function(r){if(archOwners[r.owner_id])return false;keepV[r.id]=1;return true;});
  ['fin','rem','svc','exp','doc','pho','adv','est'].forEach(function(k){rows[k]=(rows[k]||[]).filter(function(r){return !r.vehicle_id||keepV[r.vehicle_id];});});
  nc.removed=prof.filter(function(p){return p.managed&&p.archived_at&&!p.claimed_by&&(mine.role==='admin'||p.managed_by===me0);});
  nc.ended=C.ended||null;
  // signed urls
  var photoPaths=[],docPaths=[];
  // portfolio: only each vehicle's cover (or first photo) is signed here, at display size; everything else is signed lazily when visible
  var _cv={};
  rows.pho.slice().sort(function(a,b){return (a.is_cover?0:1)-(b.is_cover?0:1)||(Number(a.sort_order)||0)-(Number(b.sort_order)||0);}).forEach(function(r){if(!_cv[r.vehicle_id]){_cv[r.vehicle_id]=r.id;photoPaths.push(r.display_path||r.storage_path);}});
  for(i=0;i<rows.doc.length;i++)if(/^(image\/|application\/pdf)/.test(String(rows.doc[i].mime_type||'')))docPaths.push(rows.doc[i].storage_path);
  var sp=await signedMap('vehicle-photos',photoPaths.slice(0,300)),sd=await signedMap('vehicle-documents',docPaths.slice(0,300));
  var byVeh={fin:{},rem:groupBy(rows.rem,'vehicle_id'),svc:groupBy(rows.svc,'vehicle_id'),pho:groupBy(rows.pho,'vehicle_id'),est:groupBy(rows.est,'vehicle_id')};
  for(i=0;i<rows.fin.length;i++)byVeh.fin[rows.fin[i].vehicle_id]=rows.fin[i];
  // expense receipts: doc ids referenced by expenses
  var rdIds={};
  for(i=0;i<rows.exp.length;i++){var xr=unpackX(rows.exp[i].notes).x;if(xr.rd)rdIds[xr.rd]=1;}
  var vehicles=[];
  for(i=0;i<rows.veh.length;i++){
    var r=rows.veh[i],un=unpackX(r.notes),x=un.x,fin=byVeh.fin[r.id],rems=byVeh.rem[r.id]||[],svc=byVeh.svc[r.id]||[],pho=latestBy(byVeh.pho[r.id]||[],'created_at'),est=byVeh.est[r.id]||[];
    var v={id:r.id,clientId:r.owner_id,year:r.year?String(r.year):'',make:r.make||'',model:r.model||'',trim:x.trim||'',isReplica:vrRep(r,x),builder:vrBld(r,x),engine:cleanText(r.engine||x.eng,120),bodyClass:cleanText(r.body_class||x.body,80),vinDecodedAt:r.vin_decoded_at||x.vdec||'',nickname:r.nickname||'',color:r.color||'',mileage:r.mileage||0,vin:r.vin||'',notes:un.text,
      purchasePrice:fin&&fin.purchase_price!==null?Number(fin.purchase_price):0,purchaseDate:fin&&fin.purchase_date?fin.purchase_date:'',insuredValue:Number(x.ins)>0?Number(x.ins):0,
      archived:!!r.archived,archivedAt:r.archived_at||null,sortOrder:(r.sort_order==null?null:Number(r.sort_order)),createdBy:r.created_by||null,mergedInto:r.merged_into||null,archiveReason:r.archived?'archived':'',createdAt:r.created_at,updatedAt:r.updated_at,
      regExpiry:'',insRenewal:'',insRepeat:x.insRep==='6months'?'6months':'yearly',inspExpiry:'',lastServiceDate:'',nextServiceDate:'',nextServiceMiles:'',
      svcIntervalMonths:(x.svcM===undefined?6:Number(x.svcM)),svcIntervalMiles:(x.svcI===undefined?5000:Number(x.svcI)),
      reminders:[],serviceLog:[],renewals:[],valueLog:[],aiValue:null,aiHealth:null,status:'green',image:null,_rem:{},_photos:[]};
    // reminders
    var seenKind={};
    rems=latestBy(rems,'created_at');
    for(j=0;j<rems.length;j++){
      var rm=rems[j];
      if(rm.ai_generated){DOCAI_REM[rm.id]=rm;continue;}
      if(rm.kind==='custom'){
        var rp=rm.repeat_months===12?'yearly':(rm.repeat_months===6?'6months':(rm.repeat_months===3?'quarterly':'none'));
        v.reminders.push({id:rm.id,title:rm.title,due:rm.due_date||'',repeat:rp,doneAt:rm.completed_at?String(rm.completed_at).slice(0,10):'',createdAt:rm.created_at,by:rm.created_by||''});
        continue;
      }
      if(rm.completed_at||seenKind[rm.kind])continue;
      seenKind[rm.kind]=1;v._rem[rm.kind]=rm.id;
      if(rm.kind==='tag')v.regExpiry=rm.due_date||'';
      else if(rm.kind==='insurance'){v.insRenewal=rm.due_date||'';if(rm.repeat_months===6)v.insRepeat='6months';else if(rm.repeat_months)v.insRepeat='yearly';}
      else if(rm.kind==='inspection')v.inspExpiry=rm.due_date||'';
      else if(rm.kind==='service'){v.nextServiceDate=rm.due_date||'';v.nextServiceMiles=rm.due_mileage||'';}
    }
    // service records -> serviceLog / inspections / notes
    svc=svc.slice().sort(function(a,b){return String(a.performed_on).localeCompare(String(b.performed_on))||String(a.created_at).localeCompare(String(b.created_at));});
    for(j=0;j<svc.length;j++){
      var sr=svc[j];
      if(sr.category==='inspection'){
        var iu=unpackX(sr.description),ix=iu.x;
        nc.inspections.push({id:sr.id,vehicleId:r.id,clientId:r.owner_id,date:sr.performed_on,tech:ix.tech||sr.shop_name||'',battery:ix.bat||'',tender:ix.tnd||'',tireFL:ix.fl||'',tireFR:ix.fr||'',tireRL:ix.rl||'',tireRR:ix.rr||'',mileageStart:ix.ms||'',mileageEnd:ix.me||(sr.mileage?String(sr.mileage):''),condition:ix.cond||'',conditionChecks:ix.cc?String(ix.cc).split('|'):[],services:ix.sv?String(ix.sv).split('|'):[],notes:ix.notes||iu.text,aiSummary:ix.sum||'',createdAt:sr.created_at,by:sr.created_by});
      }else if(sr.category==='other'&&sr.title==='Note'){
        nc.logs.push({id:sr.id,vehicleId:r.id,clientId:r.owner_id,notes:sr.description||'',aiOutput:sr.description||'',date:sr.performed_on,createdAt:sr.created_at,by:sr.created_by});
      }else{
        v.serviceLog.push({id:sr.id,date:sr.performed_on,mileage:sr.mileage||'',note:sr.description||sr.title||'Service completed',cost:sr.cost!==null?Number(sr.cost):'',by:sr.created_by,createdAt:sr.created_at});
        if(!v.lastServiceDate||sr.performed_on>v.lastServiceDate)v.lastServiceDate=sr.performed_on;
      }
    }
    // photos
    for(j=0;j<pho.length;j++){
      var ph=pho[j];
      v._photos.push({id:ph.id,path:ph.storage_path,thumb:ph.thumb_path||'',disp:ph.display_path||'',tag:ptNormTag(ph),tagSrc:ph.tag_source||'',sort:Number(ph.sort_order)||0,at:ph.created_at||'',url:sp[ph.display_path||ph.storage_path]||null,isCover:!!ph.is_cover,caption:ph.caption||'',by:ph.uploaded_by});
    }
    v._photos.sort(function(a,b){return (a.sort-b.sort)||String(a.at).localeCompare(String(b.at));});
    var cover=null;for(j=0;j<v._photos.length;j++)if(v._photos[j].isCover&&v._photos[j].url)cover=v._photos[j];
    if(!cover)for(j=0;j<v._photos.length;j++)if(v._photos[j].url){cover=v._photos[j];break;}
    if(cover)v.image=cover.url;
    // ai estimates (read-only)
    est=est.slice().sort(function(a,b){return String(a.as_of).localeCompare(String(b.as_of));});
    for(j=0;j<est.length;j++){
      var e=est[j];
      if(e.kind==='value'&&e.value_low!==null&&e.value_high!==null){
        var mid=(e.value_mid!==null&&e.value_mid!==undefined&&Number(e.value_mid)>0)?Math.round(Number(e.value_mid)):Math.round((Number(e.value_low)+Number(e.value_high))/2);var prevAi=v.aiValue;
        var _rv=(e.inputs&&Object.prototype.toString.call(e.inputs.review)==='[object Array]'&&e.inputs.review.length)?e.inputs.review.slice(0,4).map(function(x){return String(x).slice(0,80);}):null;
        if(_rv&&v.aiValue&&!v.aiValue.review){v.aiReview={value:mid,asOf:String(e.as_of).slice(0,10),why:_rv};continue;}
        if(!_rv)v.aiReview=null;v._lastRv=_rv;
        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true,ts:e.as_of,key:e.cache_key||'',review:!!_rv});
        v.aiValue={value:mid,low:Math.round(Number(e.value_low)),high:Math.round(Number(e.value_high)),asOf:(function(t){t=new Date(e.as_of);return isNaN(t.getTime())||!/T\d/.test(String(e.as_of))?String(e.as_of).slice(0,10):isoLocal(t);})(),sources:srcObjList(e.sources,8),notes:cleanText(e.notes,400),confidence:e.confidence===null?'':Number(e.confidence),prev:prevAi?prevAi.value:null,prevAsOf:prevAi?prevAi.asOf:''};
      }
    }
    valFinish25(v);ovApply(v,rows.ov);msLoad(v,r,x,fin);poApplyRow(v,r);
    vehicles.push(v);
  }
  nc.vehicles=vehicles;
  // expenses
  DOC_PATHS=[];
  var docById={};
  for(i=0;i<rows.doc.length;i++){docById[rows.doc[i].id]=rows.doc[i];DOC_PATHS.push({id:rows.doc[i].id,path:rows.doc[i].storage_path});}
  for(i=0;i<rows.exp.length;i++){
    var er=rows.exp[i],eu=unpackX(er.notes),ex=eu.x,rdoc=ex.rd?docById[ex.rd]:null;
    var ev=byId(vehicles,er.vehicle_id);
    nc.expenses.push({id:er.id,vehicleId:er.vehicle_id,clientId:er.owner_id,category:ex.cat||er.category,amount:Number(er.amount),date:er.incurred_on,desc:eu.text,valueAdd:ex.va==='yes'?'yes':'no',image:(rdoc&&sd[rdoc.storage_path]&&/^image\//.test(String(rdoc.mime_type||'')))?sd[rdoc.storage_path]:'',rd:ex.rd||'',createdAt:er.created_at,by:er.created_by||''});
  }
  // documents
  for(i=0;i<rows.doc.length;i++){
    var dr=rows.doc[i];
    if(rdIds[dr.id])continue;
    var du=unpackX(dr.title),dx=du.x,url=sd[dr.storage_path]||'',isImg=/^image\//.test(String(dr.mime_type||''));
    var type=dx.type||(dr.kind==='invoice'||dr.kind==='receipt'?'invoice':(dr.kind==='title'||dr.kind==='registration'||dr.kind==='insurance'?dr.kind:'other'));
    nc.docs.push({id:dr.id,vehicleId:dr.vehicle_id,clientId:(byId(vehicles,dr.vehicle_id)||{}).clientId||'',type:type,name:du.text||'Document',expiry:dx.exp||'',notes:dx.notes||'',image:isImg?url:'',fileUrl:(dr.mime_type==='application/pdf')?url:'',mime:dr.mime_type||'',createdAt:dr.created_at,by:dr.uploaded_by,ownerOnly:!!dr.owner_only,ai:docAiFromRow(dr),path:dr.storage_path||'',thumbPath:dr.thumb_path||'',srId:dr.service_record_id||'',bd:dx.bd||'',_x:dx});
    if(dr.thumb_path)DT_THUMBS[dr.id]=dr.thumb_path;if(DT.col===null)DT.col=Object.prototype.hasOwnProperty.call(dr,'thumb_path');
  }
  // advisories
  for(i=0;i<rows.adv.length;i++){
    var ar=rows.adv[i],au=unpackX(ar.body),ax=au.x;
    var rec={id:ar.id,title:ar.title,clientId:ar.owner_id,vehicleId:ar.vehicle_id,category:ax.cat||'maintenance',urgency:URG_FROM_DB[ar.severity]||'green',cost:ax.cost||(ar.estimated_cost!==null?('$'+Math.round(Number(ar.estimated_cost)).toLocaleString('en-US')):''),valueImpact:ax.vi||'neutral',notes:'',description:au.text,status:REC_FROM_DB[ar.status]||'open',date:String(ar.created_at).slice(0,10),createdAt:ar.created_at,by:ar.from_tech_id};
    if(ar.responded_at)rec.response={decision:ar.status==='declined'?'declined':'accepted',note:ar.owner_response||'',at:ar.responded_at,by:ar.owner_id,byName:displayName(profMap[ar.owner_id])||'Owner'};
    if(ar.completed_at){rec.completedAt=ar.completed_at;rec.completedNote='';}
    nc.recs.push(rec);
  }
  // clients
  var cl=[],seenC={};
  function addClientRow(p,canAdd){
    if(!p||seenC[p.id]){if(p&&canAdd){var ex0=byId(cl,p.id);if(ex0)ex0.canAdd=true;}return;}
    seenC[p.id]=1;
    if(p.archived_at)return;   // removed client
    if(p.managed&&p.claimed_by)return;   // claimed placeholder: its data now belongs to the real account
    cl.push({id:p.id,name:displayName(p),email:p.email||'',phone:p.phone||'',location:'',since:String(p.created_at||'').slice(0,7),createdAt:p.created_at,linked:true,canAdd:!!canAdd,
      managed:!!p.managed,claimed:!!p.claimed_by,managedBy:p.managed_by||'',notes:p.notes||''});
  }
  if(mine.role==='owner'){if(CO.of&&profMap[CO.of])addClientRow(profMap[CO.of],true);else if(CO.of){seenC[CO.of]=1;cl.push({id:CO.of,name:'Collection',email:'',phone:'',location:'',createdAt:'',linked:true,canAdd:true});}else addClientRow(mine,true);}
  else if(mine.role==='tech'){
    for(i=0;i<rows.acc.length;i++){var ac=rows.acc[i];if(ac.tech_id===me0&&ac.status==='active')addClientRow(profMap[ac.owner_id],ac.vehicle_id===null||(profMap[ac.owner_id]&&profMap[ac.owner_id].managed));}
  }else{
    for(var pid in profMap)if(profMap.hasOwnProperty(pid)&&profMap[pid].role==='owner'&&!(profMap[pid].managed&&profMap[pid].claimed_by))addClientRow(profMap[pid],true);
    var ownsAny=false;for(i=0;i<vehicles.length;i++)if(vehicles[i].clientId===me0)ownsAny=true;
    if(ownsAny)addClientRow(mine,true);
  }
  for(i=0;i<vehicles.length;i++)if(!seenC[vehicles[i].clientId]){var op=profMap[vehicles[i].clientId];if(op)addClientRow(op,false);else{seenC[vehicles[i].clientId]=1;cl.push({id:vehicles[i].clientId,name:'Owner',email:'',phone:'',location:'',createdAt:'',linked:true,canAdd:false});}}
  cl.sort(function(a,b){return String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());});
  nc.clients=cl;
  // invites + pending clients
  nc.invites=rows.inv;
  var now=new Date().toISOString();
  for(i=0;i<rows.inv.length;i++){
    var iv=rows.inv[i];
    if(iv.kind==='client_owner'&&!iv.redeemed_at&&!iv.revoked_at&&iv.expires_at>now&&iv.created_by===me0&&iv.owner_id&&byId(cl,iv.owner_id)){byId(cl,iv.owner_id).inviteId=iv.id;byId(cl,iv.owner_id).inviteExpires=iv.expires_at;continue;}
    if(iv.kind==='client_owner'&&!iv.redeemed_at&&!iv.revoked_at&&iv.expires_at>now&&iv.created_by===me0)nc.pending.push({id:'inv_'+iv.id,inviteId:iv.id,name:iv.label||iv.email||'Invited client',email:iv.email||'',expiresAt:iv.expires_at,pending:true});
  }
  // access + permissions
  nc.access=rows.acc;nc.permRows=rows.perm;
  for(i=0;i<rows.vis.length;i++){
    var vr=rows.vis[i],o={};
    o.view_service_records=!!vr.can_view_service_records;o.view_expenses=!!vr.can_view_expenses;o.view_documents=!!vr.can_view_documents;o.view_reminders=!!vr.can_view_reminders;
    o.view_value_estimate=!!vr.can_view_value_estimate;o.view_health_estimate=!!vr.can_view_health_estimate;o.view_purchase_info=!!vr.can_view_purchase_info;o.view_photos=!!vr.can_view_photos;
    o.can_add_service=!!vr.can_add_service;o.can_add_documents=!!vr.can_add_documents;o.can_add_expenses=!!vr.can_add_expenses;o.can_create_advisories=!!vr.can_create_advisories;o.can_upload_photos=vr.can_upload_photos!==false;o.can_scan_documents=vr.can_scan_documents!==false;o.can_add_reminders=!!vr.can_add_reminders;o.can_send_estimates=vr.can_send_estimates!==false;
    nc.vis[vr.vehicle_id]=o;
  }
  // transfers (seller side, pending)
  for(i=0;i<rows.xfer.length;i++){var tr=rows.xfer[i];if(tr.status==='pending'&&tr.expires_at>now&&tr.seller_id===me0)nc.transfers[tr.vehicle_id]=tr;}
  // seller archives from completed transfers
  for(i=0;i<rows.arc.length;i++){
    var ar2=rows.arc[i],sn=ar2.snapshot||{},sv=sn.vehicle||{},sf=sn.financials||{},su2=unpackX(sv.notes),sx=su2.x;
    nc.archiveVehicles.push({id:ar2.id,_ar:true,clientId:ar2.owner_id,year:sv.year?String(sv.year):'',make:sv.make||'',model:sv.model||'',trim:sx.trim||'',nickname:sv.nickname||'',color:sv.color||'',mileage:sv.mileage||0,vin:sv.vin||'',notes:su2.text||'',purchasePrice:sf.purchase_price?Number(sf.purchase_price):0,purchaseDate:sf.purchase_date||'',insuredValue:0,archived:true,archivedAt:ar2.created_at,archiveReason:'transferred',salePrice:null,buyerName:'',archiveNote:'',image:null,reminders:[],serviceLog:[],renewals:[],valueLog:[],aiValue:null,aiHealth:null,status:'green',createdAt:ar2.created_at});
  }
  // team (admin)
  if(mine.role==='admin'){for(var tp in profMap)if(profMap.hasOwnProperty(tp)&&(profMap[tp].role==='tech'||profMap[tp].role==='admin'))nc.team.push(profMap[tp]);}
  nc.loadedAt=Date.now();
  C=nc;
  LOCAL_AUDIT=LOCAL_AUDIT.slice(-200);
  buildSnap('vehicles',C.vehicles);buildSnap('inspections',C.inspections);buildSnap('logs',C.logs);buildSnap('expenses',C.expenses);buildSnap('docs',C.docs);buildSnap('recs',C.recs);
  await fetchAudit();
}
var reloading=false;
function reloadAll(silent){
  if(!sb||!session||reloading)return Promise.resolve();
  reloading=true;
  return loadAll().then(function(){reloading=false;if(!silent)showToast('Up to date','success');applyPerms();try{refreshCurrent();refreshDetailIfOpen();}catch(e){}},function(err){reloading=false;showToast(netMsg(err),'error');});
}
function netMsg(err){
  var m=String((err&&err.message)||err||'');
  if(/network|fetch/i.test(m))return 'You seem to be offline. Showing the last loaded data. Check your connection and try again.';
  return 'We could not load your collection just now. Please try again.';
}

// ============ UTILITIES ============
function esc(s){
  if(s===null||s===undefined)return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// ids are interpolated into inline onclick handlers: allow only safe characters.
function jsId(s){return String(s===null||s===undefined?'':s).replace(/[^A-Za-z0-9_-]/g,'');}
function val(id){var el=document.getElementById(id);return el?String(el.value||''):'';}
function setVal(id,v){var el=document.getElementById(id);if(el)el.value=(v===null||v===undefined)?'':v;}
function elText(id,t){var el=document.getElementById(id);if(el)el.textContent=t;}
function elHTML(id,h){var el=document.getElementById(id);if(el)el.innerHTML=h;}
function showEl(id,on,disp){var el=document.getElementById(id);if(el)el.style.display=on?(disp||'block'):'none';}
function money(n){if(n===null||n===undefined||isNaN(n))return '--';var neg=n<0;n=Math.abs(Math.round(n));return (neg?'-$':'$')+n.toLocaleString('en-US');}
function pct(n){if(!isFinite(n))n=0;return (n>=0?'+':'')+n.toFixed(1)+'%';}
function pad2(n){return (n<10?'0':'')+n;}
function isoLocal(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function todayISO(){return isoLocal(new Date());}
function parseDate(s){
  if(!s)return null;
  var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  var d=new Date(s);return isNaN(d.getTime())?null:d;
}
function daysUntil(s){var d=parseDate(s);if(!d)return null;var t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/86400000);}
function fmtDate(s){var d=parseDate(s);return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'--';}
function fmtMonth(s){var d=parseDate(s);return d?d.toLocaleDateString('en-US',{month:'short',year:'numeric'}):'';}
function fmtDateTime(iso){var d=new Date(iso);if(isNaN(d.getTime()))return '';return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
function addMonthsISO(s,n){var d=parseDate(s)||new Date();d.setMonth(d.getMonth()+n);return isoLocal(d);}
function toInt(s){var n=parseInt(String(s).replace(/[^0-9-]/g,''),10);return isNaN(n)?null:n;}
function toNum(s){var n=parseFloat(String(s));return isNaN(n)?null:n;}
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
function byId(list,id){for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list[i];return null;}
function vName(v){return v?(v.nickname||((v.year||'')+' '+(v.make||''))):'Vehicle';}
function nickHTML(v){var n=v&&v.nickname?String(v.nickname).trim():'';return n?'<span class="nick">&ldquo;'+esc(n)+'&rdquo;</span>':'';}
function vFull(v){return v?((v.year||'')+' '+(v.make||'')+' '+(v.model||'')+(v.trim?' '+v.trim:'')):'';}
function emptyCard(msg,extra){return '<div class="empty" style="'+(extra||'')+'">'+msg+'</div>';}
function mutedLine(msg){return '<div class="doc-meta" style="padding:14px 0;border-bottom:1px solid var(--line);">'+msg+'</div>';}
var URG_COLOR={red:'#E08A74',yellow:'#C9AA6B',green:'#7E8A83'};
var STATUS_LABEL={open:'Awaiting owner',accepted:'Accepted',declined:'Declined',completed:'Completed'};
var OWNER_STATUS_LABEL={open:'Needs your response',accepted:'Accepted',declined:'Declined',completed:'Completed'};
function statusChip(s,owner){return '<span class="status-chip st-'+esc(s)+'">'+esc((owner?OWNER_STATUS_LABEL:STATUS_LABEL)[s]||s)+'</span>';}
// ============ APP STATE ============
var session=null;          // {account, role:'advisor'|'client'}
var currentRole='advisor'; // role selected on the sign-in card
var currentClientId=null;
var currentVehicleId=null;
var editingVehicleId=null;
var pendingVehicleImage=null;
var lastEstimate=null;
var respondState=null;
var lastInviteCode='';
var wizardStep=0;
var inspAiVehicleId=null;
var suppressRowClick=false;
var archiveClientFilter=null;
var accountsReady=null;
var failedLogins=0,lockUntil=0;
// Real identity vs effective role. "View as" is an admin-only preview: the effective role is
// derived here, from the REAL signed-in account, so every role check in the app (isOwner,
// isAdvisor, isAdmin, ownerClientId, me) follows it. A non-admin can never have an effective
// role other than their own, whatever is written into session.viewAs.
var VIEWAS_STORE='evoai_viewas';
function realAdmin(){return !!(session&&session.account&&session.account.role==='admin');}
function viewAsActive(){
  if(!realAdmin()||!session.viewAs)return false;
  var va=session.viewAs;
  if(va.role==='advisor')return true;
  if(va.role==='owner')return !!(va.clientId&&byId(getClients(),va.clientId));
  return false;
}
function effRole(){
  if(!session)return null;
  if(viewAsActive())return session.viewAs.role==='owner'?'client':'advisor';
  return session.role;
}
function isOwner(){return effRole()==='client';}
function isAdvisor(){return effRole()==='advisor';}
function isAdmin(){return realAdmin()&&!viewAsActive();}
function viewAsLabel(){return viewAsActive()?(session.viewAs.role==='owner'?'Owner':'Tech'):'Admin';}
function setViewAs(mode,clientId){
  if(!realAdmin()){showToast('View as is only available to the admin.','error');return false;}
  var cl=getClients(),cid;
  if(mode==='advisor'||mode==='tech'){session.viewAs={role:'advisor'};}
  else if(mode==='owner'){
    cid=clientId||(session.viewAs&&session.viewAs.clientId)||(cl[0]&&cl[0].id)||'';
    if(!cid||!byId(cl,cid)){showToast('Add a client first to view as an owner.','error');viewAsRefreshUI();return false;}
    session.viewAs={role:'owner',clientId:cid};
  }else{session.viewAs=null;}
  try{
    if(session.viewAs)window.sessionStorage.setItem(VIEWAS_STORE,JSON.stringify({accountId:session.account.id,role:session.viewAs.role,clientId:session.viewAs.clientId||''}));
    else window.sessionStorage.removeItem(VIEWAS_STORE);
  }catch(e){}
  var ms=document.querySelectorAll('.modal-overlay'),i;
  for(i=0;i<ms.length;i++)if(ms[i].style.display==='flex')closeModal(ms[i].id);
  currentVehicleId=null;respondState=null;
  enterApp();
  return true;
}
function viewAsChange(){
  var r=val('viewas-role'),c=val('viewas-client');
  if(!setViewAs(r,r==='owner'?c:''))viewAsRefreshUI();
}
function viewAsRefreshUI(){
  var bar=document.getElementById('viewas-bar');if(!bar)return;
  var btn=document.getElementById('viewas-btn'),st=document.getElementById('viewas-static');
  if(!session||!session.account){bar.style.display='none';document.documentElement.style.setProperty('--vah','0px');return;}
  if(!realAdmin()){
    var rl=session.account.role==='owner'?'Owner':'Tech';
    if(btn)btn.style.display='none';
    if(st){st.style.display='inline-flex';st.innerHTML='<span class="va-k">Signed in as</span><b style="font-weight:500">'+esc(rl)+'</b>';}
    showEl('viewas-client',false);showEl('viewas-msg',false);viewAsClose();
    bar.classList.remove('on');bar.style.display='flex';
    document.documentElement.style.setProperty('--vah',bar.offsetHeight+'px');return;
  }
  if(btn)btn.style.display='';
  if(st)st.style.display='none';
  var act=viewAsActive(),role=act?(session.viewAs.role==='owner'?'owner':'advisor'):'admin';
  var sel=document.getElementById('viewas-role'),cs=document.getElementById('viewas-client'),clients=getClients(),h='',i;
  if(sel)sel.value=role;
  elText('viewas-cur',role==='owner'?'Owner':(role==='advisor'?'Tech':'Admin'));
  var opts=document.querySelectorAll('#viewas-menu .va-opt');
  for(i=0;i<opts.length;i++)opts[i].setAttribute('aria-selected',opts[i].getAttribute('data-role')===role?'true':'false');
  for(i=0;i<clients.length;i++)h+='<option value="'+esc(clients[i].id)+'"'+(act&&session.viewAs.clientId===clients[i].id?' selected':'')+'>'+esc(collName(clients[i]))+'</option>';
  if(cs){cs.innerHTML=h;cs.style.display=role==='owner'?'':'none';}
  var cn=act&&role==='owner'?byId(clients,session.viewAs.clientId):null;
  elText('viewas-msg',act?('Viewing as '+viewAsLabel()+(cn?' ('+cn.name+')':'')+' - back to Admin'):'');
  showEl('viewas-msg',act,'inline-flex');
  bar.classList.toggle('on',act);
  bar.style.display='flex';
  document.documentElement.style.setProperty('--vah',bar.offsetHeight+'px');
}
function viewAsClose(){
  var m=document.getElementById('viewas-menu'),b=document.getElementById('viewas-btn');
  if(m)m.hidden=true;if(b)b.setAttribute('aria-expanded','false');
}
function viewAsToggle(ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  var m=document.getElementById('viewas-menu'),b=document.getElementById('viewas-btn');if(!m||!b)return;
  var open=m.hidden;m.hidden=!open;b.setAttribute('aria-expanded',open?'true':'false');
  if(open){var cur=m.querySelector('[aria-selected=true]');if(cur&&cur.focus)try{cur.focus({preventScroll:true});}catch(e){}}
}
function viewAsPick(role){
  viewAsClose();
  var sel=document.getElementById('viewas-role');if(sel)sel.value=role;
  viewAsChange();
}
document.addEventListener('click',function(e){var m=document.getElementById('viewas-menu');if(m&&!m.hidden&&!m.contains(e.target))viewAsClose();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')viewAsClose();});
(function(){try{if(window.navigator.standalone||(window.matchMedia&&window.matchMedia('(display-mode:standalone)').matches))document.documentElement.classList.add('standalone');}catch(e){}})();
function viewAsRestore(acct){
  // Only a real admin can restore a preview; anything else is ignored.
  try{
    if(!acct||acct.role!=='admin')return;
    var raw=window.sessionStorage.getItem(VIEWAS_STORE);if(!raw)return;
    var o=JSON.parse(raw);
    if(!o||o.accountId!==acct.id)return;
    if(o.role==='advisor')session.viewAs={role:'advisor'};
    else if(o.role==='owner'&&o.clientId)session.viewAs={role:'owner',clientId:String(o.clientId)};
  }catch(e){}
}
function ownerClientId(){var a=me();return (a&&a.role==='owner')?((typeof CO!=='undefined'&&CO.of)||a.clientId||null):null;}
function ownerClient(){var cid=ownerClientId();return cid?byId(getClients(),cid):null;}
// Archived vehicles stay in storage but leave active totals.
function isArchivedVehicle(v){return !!(v&&v.archived===true);}
function activeVehicles(list){
  var vs=list||getVehicles(),out=[],i;
  for(i=0;i<vs.length;i++)if(vs[i]&&!isArchivedVehicle(vs[i]))out.push(vs[i]);
  return out;
}
function archivedVehicles(list){
  var vs=list||getVehicles(),out=[],i;
  for(i=0;i<vs.length;i++)if(vs[i]&&isArchivedVehicle(vs[i]))out.push(vs[i]);
  return out;
}
function recordIsActive(row){
  if(!row||!row.vehicleId)return true;
  var v=byId(getVehicles(),row.vehicleId);
  if(!v)return true;
  return !isArchivedVehicle(v);
}
function hasSalePrice(v){return !!(v&&v.salePrice!==null&&v.salePrice!==undefined&&v.salePrice!==''&&!isNaN(Number(v.salePrice)));}
function cloneRow(row){try{return JSON.parse(JSON.stringify(row));}catch(e){return null;}}
function rowsForVehicle(list,vid){
  var out=[],i;
  for(i=0;i<list.length;i++)if(list[i]&&list[i].vehicleId===vid)out.push(list[i]);
  return out;
}
function cloneRelated(list,newVid,clientId){
  var out=[],i,c;
  for(i=0;i<list.length;i++){
    c=cloneRow(list[i]);
    if(!c)return null;
    c.id=uid();
    c.vehicleId=newVid;
    c.clientId=clientId;
    out.push(c);
  }
  return out;
}
function retagClient(list,vid,clientId){
  var i;
  for(i=0;i<list.length;i++)if(list[i]&&list[i].vehicleId===vid)list[i].clientId=clientId;
}
function refuseIfArchived(v){
  if(v&&isArchivedVehicle(v)){showToast('Archived vehicles are read-only','error');return true;}
  return false;
}
// Vehicles the current user may see. Archives are separate.
function visibleVehicles(){
  var vs=activeVehicles();
  if(isAdvisor())return vs;
  var cid=ownerClientId();
  if(!cid)return [];
  return vs.filter(function(v){return v.clientId===cid;});
}
function visibleArchives(){
  var vs=archivedVehicles();
  if(isAdvisor())return vs;
  var cid=ownerClientId();
  if(!cid)return [];
  return vs.filter(function(v){return v.clientId===cid;});
}
function canSeeVehicle(v){if(!v)return false;if(isAdvisor())return true;return !!ownerClientId()&&v.clientId===ownerClientId();}
function requireAdmin(){if(!isAdmin()){showToast('Only the admin can do this.','error');return false;}return true;}
// ============ AUDIT TRAIL ============
function auditHTML(entries,emptyMsg){
  if(!entries.length)return mutedLine(emptyMsg||'No activity recorded yet. Changes made in the app are listed here.');
  return entries.map(function(e){
    return '<div class="audit-row"><div class="audit-when">'+esc(fmtDateTime(e.at))+'</div><div style="flex:1;min-width:0;"><div>'+esc(e.text)+'</div><div class="audit-who">'+esc(e.actor)+' &middot; '+esc(e.role==='owner'?'Owner':e.role==='admin'?'Admin':e.role==='advisor'?'Advisor':'System')+'</div></div></div>';
  }).join('');
}
function auditFor(filter,limit){
  var list=getAudit().filter(filter);
  list.sort(function(a,b){return (b.at||'').localeCompare(a.at||'');});
  return limit?list.slice(0,limit):list;
}

// ============ ROLE HELPERS / PERMISSION GATES ============
function requireAdvisor(){return !!session;}
function requireCan(v,perm,msg){
  if(!v||!can(v,perm)){
    showToast(msg||'That is not enabled for you on this vehicle. The owner can turn it on in their permissions.','error');
    return false;
  }
  return true;
}
function requireEdit(v){
  if(!canEditVehicle(v)){showToast('Only the owner can change vehicle details, reminders and archives.','error');return false;}
  return true;
}
function setDisp(sel,on){var els=document.querySelectorAll(sel),i;for(i=0;i<els.length;i++)els[i].style.display=on?'':'none';}
function applyPerms(){
  if(!session)return;
  var vs=visibleVehicles(),ownerLike=realAdmin()||(session.account.role==='owner');
  var tech=!ownerLike;
  setDisp('.perm-service',ownerLike||canAny('can_add_service',vs));
  setDisp('.perm-expense',ownerLike||canAny('can_add_expenses',vs));
  setDisp('.perm-doc',ownerLike||canAny('can_add_documents',vs));
  setDisp('.perm-adv',!!(tech&&canAny('can_create_advisories',vs)));
  setDisp('.perm-rem',ownerLike||C.clients.some(function(c){return managedMine(c.id);}));
  var canAddAny=ownerLike,i;
  if(!canAddAny)for(i=0;i<C.clients.length;i++)if(C.clients[i].canAdd)canAddAny=true;
  setDisp('.perm-addveh',canAddAny);
  setDisp('.perm-nav-expenses',ownerLike||canAny('view_expenses',vs)||canAny('can_add_expenses',vs));
}
// ============ AUTH (Supabase Auth) ============
var failedLogins=0,lockUntil=0,booting=false,recoveryMode=false,currentRole='advisor';
function showLoading(on,msg){
  var el=document.getElementById('boot-loading');if(!el)return;
  el.style.display=on?'flex':'none';
  var t=document.getElementById('boot-loading-text');if(t&&msg)t.textContent=msg;
}
function authPanels(which){
  var ids=['auth-login-panel','auth-signup-panel','auth-confirm-panel','auth-retry-panel','auth-newpw-panel','auth-forgot-panel'],i;
  for(i=0;i<ids.length;i++)showEl(ids[i],ids[i]==='auth-'+which+'-panel');
  var rs=document.querySelector('.role-select');if(rs)rs.style.display=(which==='login'||which==='signup')?'':'none';
}
function selectRole(role){
  currentRole=role==='client'?'client':'advisor';
  var btns=document.querySelectorAll('.role-btn'),i;
  for(i=0;i<btns.length;i++)btns[i].classList.remove('active');
  var btn=document.getElementById('role-'+currentRole);if(btn)btn.classList.add('active');
  elText('auth-error','');
  var em=document.getElementById('auth-email');if(em)em.placeholder=currentRole==='client'?'you@email.com':'you@evolvedetail.com';
  var sn=document.getElementById('su-code-label');if(sn)sn.textContent=currentRole==='client'?'Invite code (optional)':'Invite code from an owner or your advisor (required for techs)';
}
function showSignup(on){authPanels(on?'signup':'login');elText('su-error','');elText('auth-error','');}
function showForgot(on){authPanels(on?'forgot':'login');elText('fg-msg','');elText('auth-error','');if(on)setVal('fg-email',val('auth-email'));}
function refreshAuthView(){authPanels('login');}
function authKey(ev){if(ev&&ev.key==='Enter')login();}
function normEmail(s){return String(s||'').trim().toLowerCase();}
function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);}
function authMsg(err){
  var m=String((err&&err.message)||err||'');
  if(/invalid login credentials/i.test(m))return 'Email or password is incorrect.';
  if(/email not confirmed/i.test(m))return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if(/failed to fetch|network|load failed/i.test(m))return 'You seem to be offline. Please check your connection and try again.';
  if(/rate limit|too many/i.test(m))return 'Too many attempts. Please wait a minute and try again.';
  if(/password.*(short|least|weak)/i.test(m))return 'That password is too weak. Use at least 8 characters.';
  if(/already registered|already been registered/i.test(m))return 'An account with this email already exists. Sign in instead.';
  return 'Something went wrong. Please try again.';
}
function noBackend(){
  if(sb)return false;
  elText('auth-error','The cloud connection is not set up in this build. Please try again later.');
  return true;
}
function login(){
  var email=normEmail(val('auth-email')),pw=val('auth-password');
  elText('auth-error','');
  if(noBackend())return;
  if(Date.now()<lockUntil){elText('auth-error','Too many attempts. Wait a few seconds and try again.');return;}
  if(!email||!pw){elText('auth-error','Enter your email and password.');return;}
  var btn=document.getElementById('auth-login-btn');if(btn)btn.disabled=true;
  sb.auth.signInWithPassword({email:email,password:pw}).then(function(r){
    if(btn)btn.disabled=false;
    if(r.error){
      var m=String(r.error.message||'');
      if(/invalid login credentials/i.test(m)){failedLogins++;if(failedLogins>=5){lockUntil=Date.now()+30000;failedLogins=0;}}
      elText('auth-error',authMsg(r.error));
      showEl('auth-resend-wrap',/email not confirmed/i.test(m));
      return;
    }
    failedLogins=0;setVal('auth-password','');
    if(r.data&&r.data.user)bootWithUser(r.data.user);
  }).catch(function(e){if(btn)btn.disabled=false;elText('auth-error',authMsg(e));});
}
function resendConfirm(){
  var email=normEmail(val('auth-email'))||normEmail(val('su-email'));
  if(!email||!sb){elText('auth-error','Enter your email above first.');return;}
  sb.auth.resend({type:'signup',email:email,options:{emailRedirectTo:redirectUrl()}}).then(function(r){
    if(r.error){showToast(authMsg(r.error),'error');return;}
    showToast('Confirmation email sent. Check your inbox.','success');
  }).catch(function(e){showToast(authMsg(e),'error');});
}
function signupOwner(){
  var name=val('su-name').trim(),email=normEmail(val('su-email')),pw=val('su-password'),code=val('su-code').trim();
  elText('su-error','');
  if(noBackend()){elText('su-error','The cloud connection is not set up in this build.');return;}
  if(!name){elText('su-error','Enter your name.');return;}
  if(!validEmail(email)){elText('su-error','Enter a valid email address.');return;}
  if(pw.length<8){elText('su-error','Password must be at least 8 characters.');return;}
  var key=code.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(code&&key.length<16){elText('su-error','That invite code looks incomplete. Paste the whole code, or leave it blank.');return;}
  if(!code&&currentRole==='advisor'){elText('su-error','Techs need an invite code from an owner or from Evolve. Enter it above, or switch to Owner.');return;}
  var data={display_name:name.slice(0,80)};
  if(key)data.pending_invite=key;
  var btn=document.getElementById('su-btn');if(btn)btn.disabled=true;
  sb.auth.signUp({email:email,password:pw,options:{emailRedirectTo:redirectUrl(),data:data}}).then(function(r){
    if(btn)btn.disabled=false;
    if(r.error){elText('su-error',authMsg(r.error));return;}
    var u=r.data&&r.data.user;
    if(u&&u.identities&&u.identities.length===0){elText('su-error','An account with this email may already exist. Try signing in, or use Forgot password.');return;}
    setVal('su-password','');
    if(r.data&&r.data.session&&u){bootWithUser(u);return;}
    elText('confirm-email-label',email);
    authPanels('confirm');
  }).catch(function(e){if(btn)btn.disabled=false;elText('su-error',authMsg(e));});
}
function resendFromConfirm(){
  var email=elTextGet('confirm-email-label');
  if(!email||!sb)return;
  sb.auth.resend({type:'signup',email:email,options:{emailRedirectTo:redirectUrl()}}).then(function(r){
    showToast(r.error?authMsg(r.error):'Confirmation email sent again.',r.error?'error':'success');
  }).catch(function(e){showToast(authMsg(e),'error');});
}
function elTextGet(id){var el=document.getElementById(id);return el?String(el.textContent||''):'';}
function sendReset(){
  var email=normEmail(val('fg-email'));
  elText('fg-msg','');
  if(noBackend())return;
  if(!validEmail(email)){elText('fg-msg','Enter the email you signed up with.');return;}
  sb.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl()}).then(function(r){
    if(r.error){elText('fg-msg',authMsg(r.error));return;}
    elText('fg-msg','If that email has an account, a reset link is on its way. Open it on this device to choose a new password.');
  }).catch(function(e){elText('fg-msg',authMsg(e));});
}
function saveNewPassword(){
  var a=val('np-new'),b=val('np-confirm');
  elText('np-error','');
  if(a.length<8){elText('np-error','Password must be at least 8 characters.');return;}
  if(a!==b){elText('np-error','Passwords do not match.');return;}
  sb.auth.updateUser({password:a}).then(function(r){
    if(r.error){elText('np-error',authMsg(r.error));return;}
    recoveryMode=false;setVal('np-new','');setVal('np-confirm','');
    showToast('Password updated','success');
    if(r.data&&r.data.user)bootWithUser(r.data.user);
  }).catch(function(e){elText('np-error',authMsg(e));});
}
function showRetry(msg){
  showLoading(false);
  showEl('auth-screen',true,'flex');
  var sh=document.getElementById('app-shell');if(sh)sh.classList.add('hidden');
  elText('retry-msg',msg);
  authPanels('retry');
}
function retryBoot(){
  if(!sb)return;
  showLoading(true,'Loading your collection');
  sb.auth.getSession().then(function(r){
    if(r.data&&r.data.session&&r.data.session.user)bootWithUser(r.data.session.user);
    else{showLoading(false);authPanels('login');applyInviteToAuth();}
  }).catch(function(e){showRetry(netMsg(e));});
}
async function bootWithUser(user){
  if(booting||!user)return;
  booting=true;
  session={account:{id:user.id,email:user.email||'',name:'',role:'owner'},role:'client',viewAs:null};
  showLoading(true,'Loading your collection');
  try{
    await loadAll();
  }catch(e){
    booting=false;session=null;
    if(String(e&&e.message)==='noprofile')showRetry('Your profile is not ready yet. Please wait a moment and try again.');
    else showRetry(netMsg(e));
    return;
  }
  setAccountFromProfile(user);
  var pend=user.user_metadata&&user.user_metadata.pending_invite;
  var urlCode=pendingInviteCode(),codes=[];
  if(pend)codes.push(codeKey(pend));
  if(urlCode&&codes.indexOf(urlCode)<0)codes.push(urlCode);
  if(codes.length){
    var applied=0,lastErr=null,lastRes=null,ci;
    for(ci=0;ci<codes.length;ci++){
      try{
        var rr=await sb.rpc('redeem_invite',{p_code:codes[ci]});if(rr.error)throw rr.error;
        applied++;lastRes=rr.data;
      }catch(e){lastErr=e;}
    }
    if(applied)showToast(inviteDoneText(lastRes)||'Your invite code was applied.','success');
    else if(lastErr)showToast(inviteErrorText(lastErr),'error');
    clearPendingInvite();
    if(pend){try{await sb.auth.updateUser({data:{pending_invite:null}});}catch(e2){}}
    try{await loadAll();setAccountFromProfile(user);}catch(e3){}
  }
  // a tech may have added vehicles for this person before they joined: claim them by verified email (no-op otherwise)
  try{
    var nClaimed=await autoClaim();
    if(nClaimed){await loadAll();setAccountFromProfile(user);showToast('Vehicles your tech already added for you are now in your collection.','success');}
  }catch(e4){}
  booting=false;
  showLoading(false);
  viewAsRestore(session.account);
  enterApp();
}
function setAccountFromProfile(user){
  var p=C.profile||{};
  session.account={id:user.id,email:p.email||user.email||'',name:displayName(p),role:p.role||'owner',phone:p.phone||'',clientId:(p.role==='owner')?user.id:null};
  session.role=session.account.role==='owner'?'client':'advisor';
  currentRole=session.role;
}
function enterApp(){
  showEl('auth-screen',false);
  var shell=document.getElementById('app-shell');
  if(shell)shell.classList.remove('hidden');
  var adv=document.querySelectorAll('.advisor-only'),cli=document.querySelectorAll('.client-only'),adm=document.querySelectorAll('.admin-only'),i;
  var owner=isOwner();
  for(i=0;i<adv.length;i++)adv[i].style.display=owner?'none':'';
  for(i=0;i<cli.length;i++)cli[i].style.display=owner?'':'none';
  for(i=0;i<adm.length;i++)adm[i].style.display=isAdmin()?'':'none';
  var a=me();
  elText('sidebar-user-name',a?(a.name||a.email):'');
  elText('sidebar-user-role',viewAsActive()?('Admin / viewing as '+viewAsLabel()):(owner?'Owner':(isAdmin()?'Admin':'Advisor / Tech')));
  if(document.body)document.body.classList.toggle('owner-mode',owner);
  applyPerms();
  viewAsRefreshUI();
  updateRecBadge();
  if(owner)showPage(ownerClient()?'client-portal':'client-link');
  else showPage('dashboard');
  showDueBanner();
}
function goLoggedOut(){
  session=null;C=emptyCache();SNAP={};
  try{window.location.reload();}catch(e){}
}
function logout(){
  try{window.sessionStorage.removeItem(VIEWAS_STORE);}catch(e){}
  var done=function(){session=null;try{window.location.reload();}catch(e){}};
  try{if(sb)sb.auth.signOut().then(done,done);else done();}catch(e){done();}
}
function forceLogout(msg){showToast(msg,'error');setTimeout(logout,1200);}
function refreshSessionAccount(){return session?session.account:null;}
function restoreSession(){retryBoot();}
function initAuthEvents(){
  if(!sb)return;
  sb.auth.onAuthStateChange(function(ev,s){
    setTimeout(function(){
      if(ev==='PASSWORD_RECOVERY'){recoveryMode=true;showEl('auth-screen',true,'flex');authPanels('newpw');showLoading(false);}
      else if(ev==='SIGNED_IN'&&s&&s.user&&!recoveryMode){if(!session||session.account.id!==s.user.id)bootWithUser(s.user);}
      else if(ev==='SIGNED_OUT'){if(session)goLoggedOut();}
    },0);
  });
}
// ============ INVITE LINK (?invite=CODE), AUTO-CLAIM, FRIENDLY CODE ERRORS ============
var INVITE_KEY='evo_pending_invite';
function pendingInviteCode(){try{return localStorage.getItem(INVITE_KEY)||'';}catch(e){return '';}}
function clearPendingInvite(){try{localStorage.removeItem(INVITE_KEY);}catch(e){}}
function readUrlInvite(){
  try{
    var q=new URLSearchParams(window.location.search||''),c=q.get('invite');
    if(c===null)return;
    var k=String(c).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(k.length>=16&&k.length<=64)localStorage.setItem(INVITE_KEY,k);
    q.delete('invite');
    var qs=q.toString();
    if(window.history&&history.replaceState)history.replaceState(null,'',window.location.pathname+(qs?'?'+qs:'')+(window.location.hash||''));
  }catch(e){}
}
// not signed in + a code in the link/storage: open Create account with the code filled in (owner side)
function applyInviteToAuth(){
  var k=pendingInviteCode();
  if(!k)return;
  try{showSignup(true);selectRole('client');setVal('su-code',groupCode(k));showToast('Invite code added. Create your account, or sign in if you already have one.','success');}catch(e){}
}
function inviteErrorText(e){
  var m=String((e&&(e.message||e.error_description||e))||'');
  if(rpcMissing(e))return NEEDS_BACKEND+'.';
  if(/failed to fetch|network|load failed/i.test(m))return 'You seem to be offline. Try again when you are back online.';
  if(/invalid_or_expired_invite/.test(m))return 'That code did not work. Check that you pasted all of it. A code works once and expires after 14 days, so ask for a new one if needed.';
  if(/cannot_redeem_own_invite/.test(m))return 'You made this code, so you cannot use it. It has to be redeemed from the other person\'s own account.';
  if(/role_not_eligible/.test(m))return 'This account cannot use that kind of code. Client codes work on owner accounts. Tech codes only work on a new account with no vehicles.';
  if(/vin_conflict/.test(m))return 'A vehicle with the same VIN is already in this account, so the transfer stopped. Ask your tech to remove the duplicate and send a new code.';
  if(/not_authenticated|JWT/i.test(m))return 'Your session ended. Please sign in again.';
  return 'That code could not be used right now. Please try again in a moment.';
}
function inviteDoneText(d){
  if(!d)return '';
  var n=0,i,cl=d.claimed||[];
  for(i=0;i<cl.length;i++)n+=Number(cl[i]&&cl[i].vehicles)||0;
  if(d.kind==='client_owner')return n?('Connected. '+n+' vehicle'+(n===1?'':'s')+' your tech already added '+(n===1?'is':'are')+' now in your collection.'):'Connected. Your tech can now see your collection.';
  if(d.kind==='transfer')return 'The vehicle is now in your collection.';
  if(d.kind==='co_owner')return 'You are now a co-owner of this collection.';
  return 'Access added. Look under Clients.';
}
var CAPCLAIM=true;
async function autoClaim(){
  if(!CAPCLAIM||!sb||!session||session.account.role!=='owner')return 0;
  try{
    var r=await sb.rpc('claim_managed_clients');
    if(r.error){if(rpcMissing(r.error))CAPCLAIM=false;return 0;}
    return Number(r.data&&r.data.count)||0;
  }catch(e){return 0;}
}
function redeemCardHTML(pref){
  var c=pendingInviteCode();
  return '<div class="invite-card"><div class="sh first"><h2>Enter invite code</h2></div><div class="doc-meta">Got a code from your tech? Paste it here to connect.</div>'
   +'<div class="flex gap-2" style="margin-top:12px;"><input type="text" id="'+pref+'-code" value="'+esc(c?groupCode(c):'')+'" placeholder="Paste your code" autocapitalize="characters" autocomplete="off" aria-label="Invite code"><button class="btn btn-primary" onclick="redeemCodeFrom(\''+pref+'-code\',\''+pref+'-code-msg\')">Redeem</button></div>'
   +'<div class="doc-meta code-msg" id="'+pref+'-code-msg" role="status"></div></div>';
}
// ============ INVITE CODES (create_invite / redeem_invite / revoke_invite) ============
var CAP={inviteLabel:true};
var lastInviteCode='';
function groupCode(c){return String(c||'').replace(/(.{4})/g,'$1-').replace(/-$/,'');}
async function createInviteRpc(kind,vehicleId,email,label){
  var args={p_kind:kind,p_vehicle_id:vehicleId||null,p_email:email||null},r;
  if(CAP.inviteLabel&&label){
    var a4={p_kind:kind,p_vehicle_id:vehicleId||null,p_email:email||null,p_label:String(label).slice(0,80)};
    r=await sb.rpc('create_invite',a4);
    if(r.error&&(r.error.code==='PGRST202'||/could not find the function|schema cache/i.test(String(r.error.message||'')))){CAP.inviteLabel=false;r=await sb.rpc('create_invite',args);}
  }else r=await sb.rpc('create_invite',args);
  if(r.error)throw r.error;
  var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
  if(!row||!row.code)throw new Error('no code returned');
  return row;
}
var NOTE=' Invitations are not emailed automatically - share this code or link yourself with Share invite, Copy code or Email it.';
var APP_LINK='https://wade0764.github.io/EvoAI/cloud/';
var lastInviteEmail='';
var revealCodes={},revealTried={};
function codeKey(c){return String(c||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function storedCodes(){try{return JSON.parse(localStorage.getItem('evo_invite_codes')||'{}')||{};}catch(e){return {};}}
function saveInviteCode(id,code){if(!id||!code)return;revealCodes[id]=codeKey(code);try{var m=storedCodes();m[id]=codeKey(code);localStorage.setItem('evo_invite_codes',JSON.stringify(m));}catch(e){}}
function forgetInviteCode(id){delete revealCodes[id];try{var m=storedCodes();delete m[id];localStorage.setItem('evo_invite_codes',JSON.stringify(m));}catch(e){}}
function knownInviteCode(id){return revealCodes[id]||storedCodes()[id]||'';}
// Optional owner-only RPC from migration_002_invites.sql. If it is not installed the app just uses codes saved on this device.
var CAPREVEAL=true;
async function revealMissingCodes(ids){
  if(!sb||!CAPREVEAL)return;
  var did=false;
  for(var i=0;i<ids.length;i++){
    var id=ids[i];if(knownInviteCode(id)||revealTried[id])continue;revealTried[id]=1;
    try{
      var r=await sb.rpc('get_invite_code',{p_invite_id:id});
      if(r.error){if(r.error.code==='PGRST202'||/could not find the function|schema cache/i.test(String(r.error.message||''))){CAPREVEAL=false;return;}continue;}
      if(r.data&&typeof r.data==='string'){revealCodes[id]=codeKey(r.data);did=true;}
    }catch(e){}
  }
  if(did)refreshCurrent();
}
function inviteShareText(code,email){
  return 'You are invited to EvoAI. Open '+APP_LINK+'?invite='+codeKey(code)+' , create an account using '+(email?('the email '+email):'the email this invite was sent to')+', then enter this invite code: '+groupCode(codeKey(code));
}
function inviteMailto(code,email){
  return 'mailto:'+encodeURIComponent(email||'').replace(/%40/g,'@')+'?subject='+encodeURIComponent('Your EvoAI invite')+'&body='+encodeURIComponent(inviteShareText(code,email)+'\n\nInvitations are not emailed automatically by the app.');
}
function copyText(txt,msg){
  function fb(){
    try{var t=document.createElement('textarea');t.value=txt;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);showToast(msg,'success');}
    catch(e){showToast('Press and hold the code to copy it','error');}
  }
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){showToast(msg,'success');},fb);else fb();}catch(e){fb();}
}
function shareInviteCode(code,email){
  var text=inviteShareText(code,email);
  if(navigator.share){navigator.share({title:'Your EvoAI invite',text:text}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(text,'Invite message copied');});}
  else copyText(text,'Invite message copied');
}
function copyInviteById(id){var c=knownInviteCode(id);if(c)copyText(groupCode(c),'Code copied');}
function shareInviteById(id,email){var c=knownInviteCode(id);if(c)shareInviteCode(c,email);}
function shareInviteModal(){if(lastInviteCode)shareInviteCode(lastInviteCode,lastInviteEmail);}
function inviteRowExtras(id,email){
  var c=knownInviteCode(id);
  if(!c)return '<div class="doc-meta" style="margin-top:6px;">Code not saved on this device. Revoke it and create a new one to share.</div>';
  return '<div class="invite-row-code" style="font-size:19px;letter-spacing:.08em;color:var(--gold);margin-top:6px;word-break:break-all;user-select:all;-webkit-user-select:all;">'+esc(groupCode(c))+'</div>'
   +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button class="btn btn-sm" onclick="copyInviteById(\''+jsId(id)+'\')">Copy code</button> <button class="btn btn-sm btn-primary" onclick="shareInviteById(\''+jsId(id)+'\',\''+jsId(email||'')+'\')">Share invite</button> <a class="btn btn-sm" href="'+esc(inviteMailto(c,email))+'">Email it</a></div>';
}
function showInviteResult(opts){
  lastInviteEmail=opts.email||'';
  if(opts.id)saveInviteCode(opts.id,opts.code);
  lastInviteCode=groupCode(opts.code);
  elText('invite-title',opts.title);
  elText('invite-client-name',opts.who||'');
  elText('invite-code-text',lastInviteCode);
  elText('invite-expiry','Expires '+fmtDate(String(opts.expires||'').slice(0,10))+' - single use');
  elText('invite-help',opts.help);
  var ml=document.getElementById('invite-mailto');if(ml)ml.href=inviteMailto(opts.code,lastInviteEmail);
  openModal('modal-invite');
}
function copyInviteCode(){
  if(lastInviteCode){copyText(lastInviteCode,'Code copied');return;}
  var code=lastInviteCode;if(!code)return;
  function fallback(){
    var el=document.getElementById('invite-code-text');
    try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');showToast('Code copied','success');}
    catch(e){showToast('Press and hold the code to copy it','error');}
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(function(){showToast('Code copied','success');},fallback);}
    else fallback();
  }catch(e){fallback();}
}
function inviteActive(inv){return inv&&!inv.redeemed_at&&!inv.revoked_at&&String(inv.expires_at)>new Date().toISOString();}
async function revokeInviteById(id){
  if(!window.confirm('Revoke this invite code? It will stop working right away.'))return;
  try{
    var r=await sb.rpc('revoke_invite',{p_invite_id:id});if(r.error)throw r.error;forgetInviteCode(id);
    showToast('Invite code revoked','success');
    await loadAll();refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
async function redeemCodeFrom(inputId,msgId){
  if(!session)return;
  var say=function(t,bad){if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}};
  say('');
  if(viewAsActive()){showToast('Not available while viewing as another role.','error');return;}
  var code=val(inputId),k=code.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!k){say('Paste the invite code first.',true);showToast('Paste the invite code first.','error');return;}
  if(k.length<16){say('That looks too short. Paste the whole code.',true);showToast('Paste the whole invite code.','error');return;}
  say('Checking the code...');
  try{
    var r=await sb.rpc('redeem_invite',{p_code:k});
    if(r.error)throw r.error;
    clearPendingInvite();
    setVal(inputId,'');closeModal('modal-account');
    await loadAll();
    var u=(await sb.auth.getUser()).data.user;
    if(u)setAccountFromProfile(u);
    showToast(inviteDoneText(r.data||{kind:'transfer'}),'success');
    enterApp();
  }catch(e){var t=inviteErrorText(e);say(t,true);showToast(t,'error');}
}
function createInviteFromAccess(){
  var scope=val('inv-scope'),email=normEmail(val('inv-email'));
  if(!email||!validEmail(email)){showToast('Enter your tech\'s email address','error');return;}
  var oid=ownerClientId()||myId();
  var kind=scope?'tech_vehicle':'tech_owner';
  createInviteRpc(kind,scope||null,email||null,null).then(function(row){
    saveInviteCode(row.invite_id,row.code);
    var v=scope?byId(C.vehicles,scope):null;
    showInviteResult({title:'Tech invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:v?('Access to '+vFull(v)):'Access to all of your vehicles',help:'Share this code privately with the tech. They create an account (or enter it under Account > Redeem a code) and get access. You choose what they can see below. The code works once and expires in 14 days.'+NOTE});
    return loadAll().then(function(){renderAccess();});
  }).catch(function(e){showToast(friendlyError(e),'error');});
}
// ============ CLIENTS (tech / admin) ============
function inviteClientOnly(){
  var name=val('ic-name').trim(),email=normEmail(val('ic-email'));
  if(!name){showToast('Client name is required','error');return;}
  if(email&&!validEmail(email)){showToast('Client email looks invalid','error');return;}
  createInviteRpc('client_owner',null,email||null,name).then(function(row){
    closeModal('modal-invite-client');
    setVal('ic-name','');setVal('ic-email','');
    showInviteResult({title:'Client invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:'Client: '+name,help:'Share this code privately with the owner. They choose Owner, tap Create an account, and enter it (or enter it under Account > Enter invite code if they already have an account). It connects them to you. The code works once and expires in 14 days.'+NOTE});
    return loadAll().then(function(){refreshCurrent();});
  }).catch(function(e){showToast(friendlyError(e),'error');});
}
// New client: a managed client (no invite needed). The tech can add vehicles right away; the client claims them later.
async function addClient(){
  var name=val('nc-name').trim(),email=normEmail(val('nc-email')),phone=val('nc-phone').trim(),notes=val('nc-notes').trim();
  elText('nc-error','');
  if(!name){elText('nc-error','Client name is required.');return;}
  if(email&&!validEmail(email)){elText('nc-error','That email address does not look right.');return;}
  var btn=document.getElementById('nc-save-btn');if(btn)btn.disabled=true;
  try{
    var r=await sb.rpc('create_managed_client',{p_name:name,p_email:email||null,p_phone:phone||null,p_notes:notes||null});
    if(r.error)throw r.error;
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.owner_id)throw new Error('no client returned');
    closeModal('modal-add-client');
    setVal('nc-name','');setVal('nc-email','');setVal('nc-phone','');setVal('nc-notes','');
    await loadAll();refreshCurrent();
    showClientCreated(row.owner_id,name);
  }catch(e){
    var t=friendlyError(e);
    elText('nc-error',t);
    showToast(t,'error');
  }
  if(btn)btn.disabled=false;
}
function openNewClient(){
  elText('nc-error','');
  openModal('modal-add-client');
}
function showClientCreated(id,name){
  currentClientId=id;
  elText('cc-name',name);
  var b=document.getElementById('cc-add-btn');if(b)b.textContent='Add vehicle for '+name;
  var ib=document.getElementById('cc-add-btn');if(ib)ib.setAttribute('data-id',id);
  openModal('modal-client-created');
}
function clientCreatedAddVehicle(){
  var b=document.getElementById('cc-add-btn'),id=b?b.getAttribute('data-id'):currentClientId;
  closeModal('modal-client-created');
  openAddVehicleFor(id);
}
// optional: connect a managed client to the app with the normal invite-code flow
async function inviteManagedClient(clientId){
  var c=byId(C.clients,clientId);if(!c||!c.managed)return;
  try{
    var r=await sb.rpc('create_managed_client_invite',{p_managed_id:clientId,p_email:c.email||null});
    if(r.error)throw r.error;
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.code)throw new Error('no code returned');
    showInviteResult({title:'Invite '+c.name+' to the app',id:row.invite_id,email:c.email||'',code:row.code,expires:row.expires_at,who:'Client: '+c.name,help:'Share this link or code privately with '+c.name+'. When they sign up or enter it, the vehicles and records you added move into their own account and you keep access. The code works once and expires in 14 days.'+NOTE});
    await loadAll();refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function managedRowActions(c){
  if(!c||!c.managed||c.claimed)return '';
  var h='<div class="flex gap-2" style="flex-wrap:wrap;margin-top:8px;" onclick="event.stopPropagation()"><button class="btn btn-sm btn-primary" onclick="openAddVehicleFor(\''+jsId(c.id)+'\')">Add vehicle</button>';
  if(!c.inviteId)h+='<button class="btn btn-sm" onclick="inviteManagedClient(\''+jsId(c.id)+'\')">Invite to app</button>';
  h+='</div>';
  if(c.inviteId)h+='<div onclick="event.stopPropagation()"><div class="doc-meta" style="margin-top:6px;">Invite pending'+(c.inviteExpires?' / expires '+esc(fmtDate(String(c.inviteExpires).slice(0,10))):'')+'</div>'+inviteRowExtras(c.inviteId,c.email)+'</div>';
  return h;
}
function managedBadgeHTML(c){return (c&&c.managed&&!c.claimed)?'<span class="badge-soft" title="This client has no account yet. Your records are held for them.">Not on app yet</span>':'';}
function managedBannerHTML(c){
  if(!c||!c.managed||c.claimed)return '';
  var h='<div class="managed-banner"><div>'+managedBadgeHTML(c)+'<span class="doc-meta"> Held under your account until they join.'+(c.email?' It moves to them automatically when they sign up with '+esc(c.email)+'.':'')+'</span></div>';
  if(c.notes)h+='<div class="doc-meta" style="margin-top:6px;">Notes: '+esc(c.notes)+'</div>';
  h+='<div class="flex gap-2" style="flex-wrap:wrap;margin-top:10px;"><button class="btn btn-sm btn-primary" onclick="openAddVehicleFor(\''+jsId(c.id)+'\')">Add vehicle for '+esc(c.name)+'</button>';
  if(!c.inviteId)h+='<button class="btn btn-sm" onclick="inviteManagedClient(\''+jsId(c.id)+'\')">Invite to app</button>';
  h+='</div>';
  if(c.inviteId)h+='<div class="doc-meta" style="margin-top:8px;">Invite pending'+(c.inviteExpires?' / expires '+esc(fmtDate(String(c.inviteExpires).slice(0,10))):'')+'</div>'+inviteRowExtras(c.inviteId,c.email);
  return h+deleteClientBtnHTML(c)+'</div>';
}
function openClientDetail(clientId){
  if(String(clientId).indexOf('inv_')===0)return;
  currentClientId=clientId;showPage('client-detail');
}
async function leaveOrRevokeAccess(accessId){
  if(!window.confirm('End this access? It stops right away. Records already entered stay with the vehicle.'))return;
  try{
    var r=await sb.rpc('revoke_tech_access',{p_access_id:accessId});if(r.error)throw r.error;
    showToast('Access ended','success');
    await loadAll();
    if(isRealTech()&&!byId(C.clients,currentClientId)){currentClientId=null;showPage('clients');}
    else refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function renderClients(){
  var clients=getClients(),vehicles=getVehicles();
  var el=document.getElementById('clients-list');if(!el)return;
  if(!clients.length&&!C.pending.length&&!(C.removed||[]).length){if(isRealTech())loadEnded();el.innerHTML='<div id="ended-notices"></div>'+emptyCard('No clients yet. Add your first client, then add their vehicles. They can join the app later.<div><button class="btn btn-primary" onclick="openModal(\'modal-add-client\')">New client</button></div>');return;}
  var h=clients.map(function(c){
    var owned=vehicles.filter(function(v){return v.clientId===c.id;});
    var cvs=owned.filter(function(v){return !isArchivedVehicle(v);});
    var archN=owned.length-cvs.length;
    var t=portfolioTotals(cvs);
    return '<div class="client-row" onclick="openClientDetail(\''+jsId(c.id)+'\')"><div class="client-info"><div class="client-name">'+esc(c.name)+' '+managedBadgeHTML(c)+'</div><div class="client-meta">'+cvs.length+' vehicle'+(cvs.length!==1?'s':'')+(archN?' / '+archN+' archived':'')+(c.email?' / '+esc(c.email):'')+'</div>'+managedRowActions(c)+'</div><div class="client-val">'+money(t.value)+(t.basis>0?'<div class="client-meta '+(t.gain>=0?'pos':'neg')+'" style="text-align:right;">'+esc(pct(t.pctGain))+'</div>':'')+'</div></div>';
  }).join('');
  h+=C.pending.map(function(p){
    return '<div class="client-row" style="cursor:default;"><div class="client-info"><div class="client-name">'+esc(p.name)+'</div><div class="client-meta">Invite pending / expires '+esc(fmtDate(String(p.expiresAt).slice(0,10)))+(p.email?' / '+esc(p.email):'')+'</div>'+inviteRowExtras(p.inviteId,p.email)+'</div><div class="client-val"><button class="btn btn-sm" onclick="revokeInviteById(\''+jsId(p.inviteId)+'\')">Revoke code</button></div></div>';
  }).join('');
  el.innerHTML='<div id="ended-notices"></div>'+h+removedClientsHTML();decorateClientRows(el);renderEndedNotices();if(isRealTech())loadEnded();
  revealMissingCodes(C.pending.map(function(p){return p.inviteId;}).concat(C.clients.filter(function(c){return c.inviteId;}).map(function(c){return c.inviteId;})));
}
function renderClientAccess(clientId){
  if(clientId!==currentClientId)return;
  var rows=C.access.filter(function(a){return a.owner_id===clientId&&a.status==='active'&&(realAdmin()||a.tech_id===myId());});
  var h='';
  if(rows.length){
    h=rows.map(function(a){
      var tp=C.profiles[a.tech_id],veh=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null;
      var who=a.tech_id===myId()?'You':displayName(tp);
      return '<div class="access-row"><div><div style="font-size:19px;font-weight:300;">'+esc(who)+'</div><div class="doc-meta">'+esc(a.vehicle_id?('Access to '+(veh?vFull(veh):'one vehicle')):'Access to the whole collection')+(a.client_origin?' / you brought this client':'')+'</div></div><button class="btn btn-danger btn-sm" onclick="leaveOrRevokeAccess(\''+jsId(a.id)+'\')">'+(a.tech_id===myId()?'End my access':'Revoke access')+'</button></div>';
    }).join('');
  }else h='<div class="doc-meta" style="padding:14px 0;border-bottom:1px solid var(--line);">No active tech access is recorded for this client.</div>';
  elHTML('cd-access',h);
}
function deleteCurrentClient(){showToast('Clients are accounts. They cannot be deleted here.','error');}
// ============ OWNER: TECH ACCESS AND PERMISSIONS MENU ============
var PERM_LABELS=[
  ['view','What the tech can see',[
    ['view_service_records','Service history'],
    ['view_documents','Documents and invoices'],
    ['view_photos','Photos (also lets them add photos)'],
    ['view_reminders','Reminders'],
    ['view_health_estimate','Health score'],
    ['view_value_estimate','AI value estimate'],
    ['view_expenses','Expenses'],
    ['view_purchase_info','Purchase price and date']]],
  ['add','What the tech can add',[
    ['can_add_service','Log service and inspections'],
    ['can_add_documents','Add documents and invoices'],
    ['can_add_expenses','Add expenses'],
    ['can_create_advisories','Send advisories']]]
];
var PM_SCOPE={};
function permRowFor(accessId,vehicleId){
  var rows=C.permRows,i,def=null,ov=null;
  for(i=0;i<rows.length;i++){if(rows[i].access_id!==accessId)continue;if(rows[i].vehicle_id===null)def=rows[i];else if(vehicleId&&rows[i].vehicle_id===vehicleId)ov=rows[i];}
  return {def:def,ov:ov,eff:ov||def};
}
function pmScopeChange(accessId,sel){PM_SCOPE[accessId]=sel.value||'';renderAccess();var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;}
async function togglePerm(accessId,perm,value,vehicleId){
  try{
    var args={p_access_id:accessId,p_permission:perm,p_value:!!value};
    if(vehicleId)args.p_vehicle_id=vehicleId;
    var r=await sb.rpc('set_tech_permission',args);
    if(r.error)throw r.error;
    var row=r.data;
    if(row&&row.id){
      var i,done=false;
      for(i=0;i<C.permRows.length;i++)if(C.permRows[i].id===row.id){C.permRows[i]=row;done=true;}
      if(!done)C.permRows.push(row);
    }
    renderAccess();
    var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;
    showToast('Permission updated','success');
  }catch(e){
    showToast(friendlyError(e),'error');
    renderAccess();var d2=document.getElementById('pm-'+jsId(accessId));if(d2)d2.open=true;
  }
}
async function resetPermOverride(accessId,vehicleId){
  try{
    var r=await sb.rpc('reset_tech_permission_override',{p_access_id:accessId,p_vehicle_id:vehicleId});
    if(r.error)throw r.error;
    C.permRows=C.permRows.filter(function(p){return !(p.access_id===accessId&&p.vehicle_id===vehicleId);});
    PM_SCOPE[accessId]='';
    renderAccess();var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;
    showToast('Back to the default settings','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
// ============ TEAM (admin, read-only list) ============
function renderTeam(){
  if(!isAdmin())return;
  var h=C.team.map(function(p){
    return '<div class="access-row"><div><div style="font-size:20px;font-weight:300;">'+esc(displayName(p))+'</div><div class="doc-meta">'+esc(p.email||'')+' / '+(p.role==='admin'?'Admin':'Tech')+(p.id===myId()?' / you':'')+'</div></div></div>';
  }).join('');
  var owners=Object.keys(C.profiles).filter(function(k){return C.profiles[k].role==='owner';}).length;
  elHTML('team-list',(h||emptyCard('No team accounts.'))+'<div class="doc-meta" style="padding:16px 0;">'+owners+' owner account'+(owners===1?'':'s')+'. Techs create their own account and enter an invite code from an owner or from you. Roles are set by the database, not in this app.</div>');
}
function addTech(){showToast('Techs create their own account and use an invite code.','error');}
function removeTech(){showToast('Remove a tech from the owner\'s access list.','error');}


function deleteMyAccount(){
  showToast('To delete your account, email your advisor. We keep this simple and safe for now.','error');
}

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

function exportData(){
  if(!session)return;
  var stamp=todayISO(),vs=getVehicles().filter(function(v){return canSeeVehicle(v);}),vids={},j;
  for(j=0;j<vs.length;j++)vids[vs[j].id]=1;
  function mine(x){return vids[x.vehicleId];}
  function strip(o,drop){var r={},k;for(k in o)if(o.hasOwnProperty(k)&&k.charAt(0)!=='_'&&drop.indexOf(k)<0)r[k]=o[k];return r;}
  var a=session.account;
  var out={app:'EvoAI',kind:'export',version:7,exportedAt:new Date().toISOString(),
    account:{name:a.name||'',email:a.email||'',role:a.role},
    vehicles:vs.map(function(v){return strip(v,['image','reminders']);}),
    inspections:getInspections().filter(mine),
    advisories:getRecs().filter(mine).map(function(r){return {title:r.title,vehicleId:r.vehicleId,urgency:r.urgency,status:r.status,cost:r.cost,description:r.description,date:r.date,response:r.response||null,completedAt:r.completedAt||null};}),
    expenses:getExpenses().filter(mine).map(function(e){var o=strip(e,['image']);o.hasReceipt=!!e.image;return o;}),
    documents:getDocs().filter(mine).map(function(d){var o=strip(d,['image','fileUrl']);o.hasFile=!!(d.image||d.fileUrl);return o;}),
    reminders:reminderItems(vs).map(function(it){return {vehicleId:it.vid,kind:it.kind,title:remPhrase(it),due:it.due||'',repeat:it.repeat};})};
  if(downloadJSON(out,'evoai-export-'+stamp+'.json'))showToast('Your data was downloaded','success');
}

function openAccountModal(){
  if(!session)return;
  var a=session.account;
  elText('acct-name',a.name||'');
  elText('acct-email',a.email||'');
  elText('acct-role',isOwner()?'Owner':(isAdmin()?'Admin':'Advisor / Tech'));
  elText('acct-export-note','Downloads a copy of everything you can see in EvoAI as a JSON file. Keep it somewhere private.');
  setVal('pw-current','');setVal('pw-new','');setVal('acct-code',pendingInviteCode()?groupCode(pendingInviteCode()):'');
  elText('acct-code-msg','');
  setDisp('.redeem-sec',!realAdmin());
  openModal('modal-account');
}

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

function reopenRec(id){showToast('The owner declined this one. Send a new advisory if things change.','error');}

function openImageView(kind,id){
  var row=byId(kind==='doc'?getDocs():getExpenses(),id);
  if(!row||!row.image||typeof row.image!=='string'||(row.image.indexOf('data:image/')!==0&&row.image.indexOf(SUPABASE_URL+'/storage/')!==0)){showToast('No photo on this record','error');return;}
  var v=byId(getVehicles(),row.vehicleId);
  if(!v||!canSeeVehicle(v)){showToast('Not available','error');return;}
  var el=document.getElementById('img-view-src');if(el)el.src=row.image;
  elHTML('img-view-actions','');
  openModal('modal-image-view');
}

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
  if(!(file.type&&file.type.indexOf('image/')===0)&&!(!file.type&&/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''))){showToast('Please choose a photo (image file)','error');if(input)input.value='';return;}
  shrinkPhotoToDataUrl(file,MAX_PHOTO_DIM,MAX_PHOTO_BYTES,'#fff').then(cb,function(e){photoShrinkError(e);if(input)input.value='';});
}

function clearPhoto(ctx){
  ctxPhoto[ctx]=null;ctxFile[ctx]=null;
  var i=document.getElementById(ctx+'-img-input');if(i)i.value='';
  var s=document.getElementById(ctx+'-img-src');if(s){s.removeAttribute('src');s.style.display='';}
  var n=document.getElementById(ctx+'-file-name');if(n)n.textContent='';
  showEl(ctx+'-img-preview',false);
}

function openDocModal(vid){
  populateVehicleSelect('doc-vehicle',null,prefVehicleId(vid),'can_add_documents');
  setVal('doc-name','');setVal('doc-notes','');setVal('doc-expiry','');
  var dt=getUI().docType;setVal('doc-type',(dt&&/^(title|registration|insurance|invoice|service|provenance|appraisal|other)$/.test(dt))?dt:'registration');
  clearPhoto('doc');
  openModal('modal-document');
}

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

function openTransferModal(){
  var v=byId(getVehicles(),currentVehicleId);
  if(!v){showToast('Vehicle not found','error');return;}
  if(!requireEdit(v)||refuseIfArchived(v))return;
  if(C.transfers[v.id]){showToast('A transfer is already pending for this vehicle. Cancel it first to start another.','error');return;}
  elText('xfer-vehicle-name',vName(v)+' - '+vFull(v));
  setVal('xfer-email','');
  openModal('modal-transfer');
}

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

function detailActionsHTML(v){
  if(isArchivedVehicle(v))return '';
  var b='';
  if(can(v,'can_add_service'))b+='<button class="btn btn-primary btn-sm" onclick="openServiceFromDetail()">Log service</button>';
  if(can(v,'can_add_expenses'))b+='<button class="btn btn-sm" onclick="openExpenseFromDetail()">Expense</button>';
  if(can(v,'can_add_documents'))b+='<button class="btn btn-sm" onclick="openDocFromDetail()">Document</button>';
  if(canManageReminders(v))b+='<button class="btn btn-sm" onclick="openReminderFromDetail()">Reminder</button>';
  if(can(v,'can_add_service'))b+='<button class="btn btn-sm" onclick="openNoteFromDetail()">Note</button><button class="btn btn-sm" onclick="openInspectionForVehicle()">Inspection</button>';
  if(can(v,'can_create_advisories'))b+='<button class="btn btn-sm" onclick="openRecForVehicle()">Advisory</button>';
  if(canUploadPhotos(v))b+='<button class="btn btn-sm" onclick="pickDetailPhoto()">Photo</button>';
  if(canEditVehicle(v)){
    b+='<button class="btn btn-sm" onclick="editCurrentVehicle()">Edit</button>';
    b+='<button class="btn btn-sm" onclick="goAccessFromDetail()">Share with a tech</button>';
    b+='<button class="btn btn-sm" onclick="openTransferModal()">Sell / transfer</button>';
    b+='<button class="btn btn-sm btn-danger" onclick="archiveCurrentVehicle()">Archive</button>';
  }
  return b;
}

function populateVehicleSelect(id,clientId,selected,perm){
  var sel=document.getElementById(id);if(!sel)return;
  var vehicles=visibleVehicles();
  if(clientId)vehicles=vehicles.filter(function(v){return v.clientId===clientId;});
  if(perm)vehicles=vehicles.filter(function(v){return can(v,perm);});
  var h='<option value="">Select vehicle</option>';
  for(var i=0;i<vehicles.length;i++){var v=vehicles[i];h+='<option value="'+esc(v.id)+'"'+(v.id===selected?' selected':'')+'>'+esc(vName(v)+' - '+v.year+' '+v.make+' '+v.model)+'</option>';}
  sel.innerHTML=h;
}

function populateClientSelect(id,selected,addOnly){
  var sel=document.getElementById(id);if(!sel)return;
  var clients=getClients().filter(function(c){return !addOnly||canAddVehicleFor(c.id);}),h='<option value="">Select client</option>';
  if(!selected&&clients.length===1)selected=clients[0].id;
  for(var i=0;i<clients.length;i++)h+='<option value="'+esc(clients[i].id)+'"'+(clients[i].id===selected?' selected':'')+'>'+esc(clients[i].name)+(clients[i].managed&&!clients[i].claimed?' (not on app yet)':'')+'</option>';
  sel.innerHTML=h;
}

function imgSrc(v){
  if(!v||!v.image||typeof v.image!=='string')return null;
  if(v.image.indexOf('data:image/')===0||v.image.indexOf('blob:')===0)return v.image;
  if(v.image.indexOf(SUPABASE_URL+'/storage/')===0)return v.image;
  return null;
}

function audit(action,text,ref){
  ref=ref||{};
  var a=session?session.account:null,vtag=(session&&viewAsActive())?' [admin viewing as '+viewAsLabel()+']':'';
  LOCAL_AUDIT.push({id:uid(),at:new Date().toISOString(),actorId:a?a.id:'',actor:a?(a.name||a.email):'System',role:a?(a.role==='tech'?'advisor':a.role):'system',action:action,text:(String(text||'')+vtag).slice(0,300),clientId:ref.clientId||'',vehicleId:ref.vehicleId||'',ownerVisible:ref.internal?false:true});
  if(LOCAL_AUDIT.length>400)LOCAL_AUDIT=LOCAL_AUDIT.slice(-400);
}

function me(){
  if(!session)return null;
  var real=session.account;
  if(!viewAsActive())return real;
  if(session.viewAs.role==='advisor')return {id:real.id,name:real.name,email:real.email,role:'advisor',viewAs:true};
  var cl=byId(getClients(),session.viewAs.clientId);
  return {id:real.id,name:cl?cl.name:'Owner',email:cl?cl.email:real.email,role:'owner',clientId:session.viewAs.clientId,viewAs:true};
}

// ============ NOTES ============
function openNoteModal(vid){
  if(!requireAdvisor())return;
  populateVehicleSelect('note-vehicle',null,prefVehicleId(vid),'can_add_service');
  setVal('note-text','');
  openModal('modal-note');
}
function openNoteFromDetail(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v||refuseIfArchived(v))return;
  detailReturnId=v.id;closeModal('modal-vehicle-detail');openNoteModal(v.id);
}
function saveNote(){
  if(!requireAdvisor())return;
  var vid=val('note-vehicle'),text=val('note-text').trim();
  var v=byId(getVehicles(),vid);
  if(!v||!text){showToast('Vehicle and note are required','error');return;}
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_service'))return;
  var logs=getLogs();
  logs.push({id:uid(),vehicleId:vid,clientId:v.clientId,notes:text.slice(0,1500),aiOutput:text.slice(0,1500),date:todayISO(),createdAt:new Date().toISOString(),by:me().id});
  if(!setLogs(logs))return;
  setUI('lastVehicle',vid);
  audit('note.added','Note added for '+vName(v),{clientId:v.clientId,vehicleId:v.id});
  closeModal('modal-note');
  refreshCurrent();
  showToast('Note saved','success');
  afterDetailSave(vid);
}
// ============ NAVIGATION ============
var ADVISOR_PAGES=['dashboard','garage','todo','requests','reminders','clients','client-detail','archives','valuations','inspections','recommendations','expenses','documents','audit','team','access'];
var OWNER_PAGES=['client-portal','garage','todo','requests','client-link','access','reminders','valuations','inspections','expenses','documents','recommendations','archives'];
// Old page names still resolve, so nothing is a dead end.
var PAGE_ALIAS={vehicles:'dashboard','perf-log':'dashboard',reports:'dashboard','client-reminders':'reminders','client-recs':'recommendations','client-docs':'documents','client-reports':'client-portal'};
function showPage(pageId){
  if(!session)return;
  if(PAGE_ALIAS[pageId])pageId=PAGE_ALIAS[pageId];
  if(pageId==='team'&&!isAdmin())pageId='dashboard';
  if(isOwner()&&OWNER_PAGES.indexOf(pageId)<0)pageId='client-portal';
  if(isAdvisor()&&ADVISOR_PAGES.indexOf(pageId)<0)pageId='dashboard';
  if(isOwner()){refreshSessionAccount();if(!session)return;if(!ownerClient()&&pageId!=='client-link')pageId='client-link';}
  var pages=document.querySelectorAll('.page'),navs=document.querySelectorAll('.nav-item'),i;
  for(i=0;i<pages.length;i++)pages[i].classList.remove('active');
  for(i=0;i<navs.length;i++)navs[i].classList.remove('active');
  var pg=document.getElementById('page-'+pageId);
  if(pg)pg.classList.add('active');
  var ni=document.querySelector('.nav-item[data-page="'+pageId+'"]');
  if(ni)ni.classList.add('active');
  if(pageId==='dashboard')renderDashboard();
  else if(pageId==='clients')renderClients();
  else if(pageId==='client-detail')renderClientDetail();
  else if(pageId==='archives')renderArchives();
  else if(pageId==='valuations')renderValuations();
  else if(pageId==='inspections')renderInspections();
  else if(pageId==='recommendations')renderRecs();
  else if(pageId==='expenses')renderExpenses();
  else if(pageId==='documents')renderDocuments();
  else if(pageId==='audit')renderAuditPage();
  else if(pageId==='reminders')renderReminders();
  else if(pageId==='team')renderTeam();
  else if(pageId==='access')renderAccess();
  else if(pageId==='client-portal')renderClientPortal();
  else if(pageId==='todo')renderTodo();
  else if(pageId==='requests')renderRequests();
  updateRecBadge();
  var main=document.querySelector('.main');if(main)main.scrollTop=0;
}
function refreshCurrent(){
  var a=document.querySelector('.page.active');
  if(a&&a.id)showPage(a.id.replace(/^page-/,''));
}

// ============ VALUE / PORTFOLIO MATH ============
var AI_PENDING='No estimate yet';
function vehicleGain(v,exs){
  var pp=Number(v.purchasePrice)||0,cv=aiVal(v);
  var addBasis=0;
  exs=exs||getExpenses();
  for(var i=0;i<exs.length;i++){if(exs[i].vehicleId===v.id&&exs[i].valueAdd==='yes')addBasis+=Number(exs[i].amount)||0;}
  var basis=pp>0?pp+addBasis:0;
  if(!(pp>0)||cv===null)return {basis:basis,value:cv,hasValue:cv!==null,gain:0,hasGain:false,pctGain:0};
  return {basis:basis,value:cv,hasValue:true,gain:cv-basis,hasGain:true,pctGain:basis?((cv-basis)/basis)*100:0};
}
// Vehicles with no AI value are not counted as zero and never feed gain. basis/gain cover only vehicles that have both.
function ytdCosts(vehicles){
  var ids={},i;for(i=0;i<vehicles.length;i++)ids[vehicles[i].id]=1;
  var year=String(new Date().getFullYear()),total=0,exs=getExpenses();
  for(i=0;i<exs.length;i++){var e=exs[i];if(ids[e.vehicleId]&&e.date&&String(e.date).slice(0,4)===year)total+=Number(e.amount)||0;}
  return total;
}
// Dated value points for one vehicle. valueLog entries are the source of truth.
// Legacy valueHistory (12 monthly numbers from older builds) is dated backward
// month by month from the log entry it ends on, so old data still charts.
function valuePoints(v){
  var log=(v.valueLog||[]).filter(function(p){return p&&p.ai===true&&parseDate(p.date)&&Number(p.value)>0;}).map(function(p){return {date:String(p.date).slice(0,10),value:Number(p.value),source:p.source||''};});
  log.sort(function(a,b){return a.date.localeCompare(b.date);});
  var pts=[],hist=null,i;
  if(hist&&hist.length>=2){
    var last=Number(hist[hist.length-1]),anchor=null;
    for(i=log.length-1;i>=0;i--)if(log[i].value===last){anchor=log[i].date;break;}
    if(!anchor)anchor=log.length?log[0].date:(v.createdAt?String(v.createdAt).slice(0,10):todayISO());
    for(i=0;i<hist.length;i++)pts.push({date:addMonthsISO(anchor,-(hist.length-1-i)),value:Number(hist[i])||0,legacy:true});
    for(i=0;i<log.length;i++)if(log[i].date>=anchor)pts.push(log[i]);
  }else pts=log;
  var map={},out=[];
  for(i=0;i<pts.length;i++)map[pts[i].date]=pts[i];
  for(var k in map)if(map.hasOwnProperty(k))out.push(map[k]);
  out.sort(function(a,b){return a.date.localeCompare(b.date);});
  return out;
}
function valueAsOf(pts,dateStr,fallback){
  if(!pts.length)return fallback;
  var v=pts[0].value;
  for(var i=0;i<pts.length;i++){if(pts[i].date<=dateStr)v=pts[i].value;else break;}
  return v;
}
// Portfolio series on an even date grid from the earliest point (max 36 months back) to today.
function portfolioSeries(vehicles){
  var all=[],start=null,i;
  for(i=0;i<vehicles.length;i++){var p=valuePoints(vehicles[i]);all.push(p);if(p.length&&(!start||p[0].date<start))start=p[0].date;}
  var end=todayISO();
  if(!start)return null;
  var minStart=addMonthsISO(end,-36);if(start<minStart)start=minStart;
  var t0=parseDate(start).getTime(),t1=parseDate(end).getTime();
  if(t1-t0<86400000*2)return null;
  var steps=13,values=[];
  for(var s=0;s<steps;s++){
    var d=isoLocal(new Date(t0+(t1-t0)*s/(steps-1))),sum=0;
    for(i=0;i<vehicles.length;i++)sum+=valueAsOf(all[i],d,aiVal(vehicles[i])||0);
    values.push(sum);
  }
  return {values:values,start:start,end:end};
}
function axisHTML(a,b){return '<div class="chart-axis"><span>'+esc(a)+'</span><span>'+esc(b)+'</span></div>';}
function endLabel(d){return d===todayISO()?'Today':fmtDate(d);}
function portfolioChartHTML(vehicles,gain){
  var s=portfolioSeries(vehicles);
  if(!s)return '';
  return areaChart(s.values,600,120,gain>=0?GOLD_HEX:RED_HEX)+axisHTML(fmtMonth(s.start),endLabel(s.end));
}
// ============ CHARTS (inline SVG) ============
function sparkline(data,w,h,color){
  if(!data||data.length<2)return '';
  w=w||110;h=h||30;color=color||GOLD_HEX;
  var min=Math.min.apply(null,data),max=Math.max.apply(null,data);
  var range=max-min||1,pts=[];
  for(var i=0;i<data.length;i++){
    var x=(i/(data.length-1))*w;
    var y=h-((data[i]-min)/range)*(h-4)-2;
    pts.push(x.toFixed(1)+','+y.toFixed(1));
  }
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="display:block;"><polyline fill="none" stroke="'+color+'" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" points="'+pts.join(' ')+'"/></svg>';
}
function areaPath(xy,w,h,color){
  var line='',i;
  for(i=0;i<xy.length;i++)line+=(i===0?'M':'L')+xy[i][0].toFixed(1)+','+xy[i][1].toFixed(1)+' ';
  var last=xy[xy.length-1];
  return '<svg width="100%" viewBox="0 0 '+w+' '+h+'" style="display:block;overflow:visible;"><path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="3.2" fill="'+color+'"/></svg>';
}
function areaChart(data,w,h,color){
  if(!data||data.length<2)return '';
  w=w||600;h=h||120;color=color||GOLD_HEX;
  var min=Math.min.apply(null,data),max=Math.max.apply(null,data),range=max-min||1,xy=[];
  for(var i=0;i<data.length;i++)xy.push([(i/(data.length-1))*(w-8),h-((data[i]-min)/range)*(h-14)-7]);
  return areaPath(xy,w,h,color);
}
// Time-proportional chart for dated points.
function areaChartDated(pts,w,h,color){
  if(!pts||pts.length<2)return '';
  var t0=parseDate(pts[0].date).getTime(),t1=parseDate(pts[pts.length-1].date).getTime(),span=(t1-t0)||1;
  var vals=pts.map(function(p){return p.value;});
  var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),range=max-min||1,xy=[];
  for(var i=0;i<pts.length;i++)xy.push([((parseDate(pts[i].date).getTime()-t0)/span)*(w-8),h-((pts[i].value-min)/range)*(h-14)-7]);
  return areaPath(xy,w,h,color);
}
// ============ ALERT ENGINE ============
// ============ DASHBOARD ============
function bigNum(n){return '<small>$</small>'+Math.round(Number(n)||0).toLocaleString('en-US');}
var CAR_SVG='<svg viewBox="0 0 160 64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 46h8M44 46h72M142 46h8"/><path d="M10 46v-9c0-3 2-5 5-6l26-6 20-12c3-2 6-3 10-3h20c5 0 9 2 12 5l14 13 26 5c4 1 6 3 6 6v7"/><path d="M56 20l-8 11h74l-16-12"/><circle cx="31" cy="46" r="11"/><circle cx="129" cy="46" r="11"/></svg>';
function carFrame(v){
  var src=imgSrc(v);
  if(src)return '<div class="car"><img src="'+esc(src)+'" alt="'+esc(vName(v))+'"></div>';
  return '<div class="car ph" role="img" aria-label="Photo pending">'+CAR_SVG+'<em>Photo pending</em></div>';
}
function showDefault(id,on){var el=document.getElementById(id);if(el)el.style.display=on?'':'none';}
function garageEmptyHTML(){
  var nClients=getClients().length,nArch=archivedVehicles().length;
  var h='<div class="empty" style="padding:44px 0;">';
  h+='<div style="font-size:34px;font-weight:200;letter-spacing:-.02em;color:var(--text);margin-bottom:10px;">No vehicles yet</div>';
  if(!nClients){
    h+='<div>Step 1: add your first client (no invite needed). Step 2: add their vehicles.</div>';
    h+='<button class="btn btn-primary" onclick="openModal(\'modal-add-client\')">New client</button>';
  }else{
    h+='<div>'+nClients+' client'+(nClients===1?'':'s')+' saved. Next, add the first vehicle.'+(nArch?' Archived vehicles stay in Archives.':'')+'</div>';
    h+='<div class="flex gap-2" style="flex-wrap:wrap;"><button class="btn btn-primary" onclick="openAddVehicleModal()">Add first vehicle</button><button class="btn" onclick="openNewClient()">New client</button></div>';
  }
  return h+'</div>';
}
function overviewActivity(owner){
  var cid=ownerClientId();
  return auditFor(function(e){return owner?(e.clientId===cid&&e.ownerVisible):true;},6);
}
function renderOverview(owner,vehicles){
  var p=owner?'cp':'dash',n=owner?'cp':'ph',t=portfolioTotals(vehicles),att=attentionItems(vehicles);
  var archN=visibleArchives().length;
  elHTML(n+'-total-value',valueOverviewNum(t));valueEnsureProbe();
  elHTML(n+'-delta',deltaHTML(t));
  elHTML(n+'-chart',portfolioChartHTML(vehicles,t.gain));vchRenderCollection(p,vehicles);
  elText(n+'-vehicle-count',String(vehicles.length));
  var ac=document.getElementById(n+'-attn-count');
  if(ac){ac.textContent=String(att.length);ac.className=att.length?'hot':'';}
  var ahv=avgHealth(vehicles);elText(n+'-avg-health',ahv===null?'--':String(ahv));
  elHTML(p+'-attention',attentionHTML(vehicles,5));
  elHTML(p+'-brief',collectionBrief(vehicles));
  vehicles=stApply(phSorted(vehicles));elHTML(p+'-vehicles',vehicles.length?wheelHTML(vehicles,p):emptyCard(owner?'Your collection is empty. Add your first vehicle to get started.<div><button class="btn btn-primary" onclick="openAddVehicleModal()">Add first vehicle</button></div>':'No vehicles yet.','grid-column:1/-1;'));
  wheelMount(p+'-vehicles',vehicles);
  if(owner)elHTML('cp-redeem',vehicles.length?'':redeemCardHTML('ov'));
  var al=document.getElementById(p+'-archive-link');if(al){al.textContent=archN?archN+' archived':'';al.style.display=archN?'':'none';}
  elHTML(p+'-activity',auditHTML(overviewActivity(owner),owner?'Nothing yet. Services, values, expenses and documents your advisor records are listed here.':'No activity yet. Add a vehicle or log a service to start the record.'));
}
function renderDashboard(){
  var vehicles=activeVehicles(),empty=!vehicles.length;
  elHTML('dash-empty',empty?garageEmptyHTML():'');
  ['dash-hero','dash-cols','dash-veh-sec','dash-act-sec'].forEach(function(id){showDefault(id,!empty);});
  elText('dash-date','');
  if(!empty)renderOverview(false,vehicles);
}
// ============ CLIENTS ============
function initials(name){return String(name||'').trim().slice(0,1).toUpperCase();}
function renderClientDetail(){
  var c=byId(getClients(),currentClientId);
  if(!c){showPage('clients');return;}
  var owned=getVehicles().filter(function(v){return v.clientId===c.id;});
  var vehicles=owned.filter(function(v){return !isArchivedVehicle(v);});
  var archN=owned.length-vehicles.length;
  var t=portfolioTotals(vehicles);
  ctitleSet('cd-name',collName(c),!!collCustom(c),c);
  elText('cd-meta',[c.location,c.email,c.phone].filter(function(x){return x;}).join(' / '));
  elHTML('cd-managed',managedBannerHTML(c));
  elHTML('cd-stats',
    '<div class="stat-card"><div class="stat-value">'+totalMoney(t)+'</div><div class="stat-label">Collection value</div>'+(t.nValued>t.nOwner?'<div class="ai-disc">Estimate, not an appraisal</div>':'')+(t.basis>0?'<div class="stat-delta '+(t.gain>=0?'':'neg')+'">'+esc(pct(t.pctGain))+'</div>':'')+'</div>'+
    '<div class="stat-card"><div class="stat-value">'+(t.basisAll>0?money(t.basisAll):'--')+'</div><div class="stat-label">Cost basis</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+vehicles.length+'</div><div class="stat-label">Vehicles</div></div>');
  renderClientAccess(c.id);
  elHTML('cd-attention',attentionHTML(vehicles,6));
  elHTML('cd-brief',collectionBrief(vehicles));vchRenderCollection('cd',vehicles);
  elHTML('cd-archive-note',archN?'<div class="doc-meta" style="padding:12px 0 0;">'+archN+' archived vehicle'+(archN===1?' is':'s are')+' kept in Archives and not included in the totals above.</div>':'');
  elHTML('cd-vehicles',vehicles.length?stApply(phSorted(vehicles)).map(function(v){return vehicleCardHTML(v);}).join(''):emptyCard(archN?'No active vehicles. Archived copies are in Archives.':'No vehicles yet for this client.<div><button class="btn btn-primary" onclick="openAddVehicleFor(\''+jsId(c.id)+'\')">Add first vehicle for '+esc(c.name)+'</button></div>','grid-column:1/-1;'));
}

// ============ VEHICLE CARDS ============
var STATUS_TEXT={green:'Optimal',yellow:'Monitor',red:'Attention'};
function safeStatus(s){return STATUS_TEXT[s]?s:'green';}
// ============ ADD / EDIT VEHICLE ============
var VEHICLE_FIELDS=['v-reg-expiry','v-ins-renewal','v-insp-expiry','v-last-service','v-next-service','v-next-service-miles','v-svc-months','v-svc-miles','v-year','v-make','v-model','v-trim','v-nickname','v-color','v-mileage','v-vin','v-purchase-price','v-purchase-date','v-insured-value','v-notes'];
function resetImagePicker(){
  pendingVehicleImage=null;
  if(typeof autoIdReset==='function')autoIdReset();
  var inp=document.getElementById('v-img-input');if(inp)inp.value='';
  showEl('v-img-preview',false);
  var ps=document.getElementById('v-img-preview-src');if(ps)ps.removeAttribute('src');
}
function openAddVehicleModal(presetClientId){
  if(!requireAdvisor())return;
  var addable=getClients().filter(function(c){return canAddVehicleFor(c.id);});
  if(!addable.length){showToast('Add a client first (New client), then add their vehicles.','error');if(isAdvisor())openModal('modal-add-client');return;}
  editingVehicleId=null;
  resetImagePicker();
  elText('av-title','Add vehicle');
  var onClientPage=document.getElementById('page-client-detail');
  populateClientSelect('v-client',(typeof presetClientId==='string'&&presetClientId)||(onClientPage&&onClientPage.classList.contains('active')?currentClientId:null),true);
  var cgrp=document.getElementById('v-client');if(cgrp&&cgrp.parentNode)cgrp.parentNode.style.display=(addable.length===1)?'none':'';
  vehicleClientChanged();
  for(var i=0;i<VEHICLE_FIELDS.length;i++)setVal(VEHICLE_FIELDS[i],'');
  setVal('v-ins-repeat','yearly');
  var vdt=document.getElementById('v-dates');if(vdt)vdt.open=false;
  vinChanged();
  var mre=document.getElementById('v-more');if(mre)mre.open=false;
  vrFormFill(null);msFormFill(null);
  openModal('modal-add-vehicle');
}
function editCurrentVehicle(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v)return;
  if(refuseIfArchived(v))return;
  if(!requireEdit(v))return;
  editingVehicleId=v.id;
  resetImagePicker();
  closeModal('modal-vehicle-detail');
  elText('av-title','Edit vehicle');
  populateClientSelect('v-client',v.clientId);
  var cgrp2=document.getElementById('v-client');if(cgrp2&&cgrp2.parentNode)cgrp2.parentNode.style.display='none';
  toggleFinFields();
  setVal('v-year',v.year);setVal('v-make',v.make);setVal('v-model',v.model);setVal('v-trim',v.trim||'');vrFormFill(v);
  setVal('v-nickname',v.nickname||'');setVal('v-color',v.color||'');setVal('v-mileage',v.mileage||'');
  setVal('v-vin',v.vin||'');setVal('v-purchase-price',v.purchasePrice||'');setVal('v-purchase-date',v.purchaseDate||'');
  setVal('v-insured-value',v.insuredValue||'');setVal('v-notes',v.notes||'');msFormFill(v);
  setVal('v-reg-expiry',dateField(v,'regExpiry'));setVal('v-ins-renewal',dateField(v,'insRenewal'));setVal('v-ins-repeat',v.insRepeat==='6months'?'6months':'yearly');
  setVal('v-insp-expiry',dateField(v,'inspExpiry'));setVal('v-last-service',dateField(v,'lastServiceDate'));setVal('v-next-service',dateField(v,'nextServiceDate'));
  setVal('v-next-service-miles',Number(v.nextServiceMiles)>0?v.nextServiceMiles:'');
  setVal('v-svc-months',(v.svcIntervalMonths===undefined||v.svcIntervalMonths===null)?'':v.svcIntervalMonths);setVal('v-svc-miles',(v.svcIntervalMiles===undefined||v.svcIntervalMiles===null)?'':v.svcIntervalMiles);
  var vdt2=document.getElementById('v-dates');if(vdt2)vdt2.open=false;
  var src=imgSrc(v);
  if(src){var ps=document.getElementById('v-img-preview-src');if(ps)ps.src=src;showEl('v-img-preview',true);}
  vinChanged();
  var mre2=document.getElementById('v-more');if(mre2)mre2.open=false;
  openModal('modal-add-vehicle');
}
function readMoney(id,label,errs){
  var raw=val(id).trim();if(!raw)return 0;
  var n=toNum(raw);
  if(n===null||n<0){errs.push(label+' must be a positive number');return 0;}
  return Math.round(n);
}
function readDateFields(mileage){
  var f={regExpiry:dateField({d:val('v-reg-expiry')},'d'),insRenewal:dateField({d:val('v-ins-renewal')},'d'),insRepeat:val('v-ins-repeat')==='6months'?'6months':'yearly',inspExpiry:dateField({d:val('v-insp-expiry')},'d'),lastServiceDate:dateField({d:val('v-last-service')},'d'),nextServiceDate:dateField({d:val('v-next-service')},'d')};
  var nm=toInt(val('v-next-service-miles'));f.nextServiceMiles=(nm&&nm>0)?nm:'';
  var rm=val('v-svc-months').trim(),ri=val('v-svc-miles').trim(),m=rm===''?6:toInt(rm),mi=ri===''?5000:toInt(ri);
  if(m===null||m<0)m=6;if(mi===null||mi<0)mi=5000;
  f.svcIntervalMonths=Math.min(m,120);f.svcIntervalMiles=Math.min(mi,200000);
  if(f.lastServiceDate){
    if(!f.nextServiceDate&&f.svcIntervalMonths>0)f.nextServiceDate=addMonthsSafe(f.lastServiceDate,f.svcIntervalMonths);
    if(!f.nextServiceMiles&&mileage>0&&f.svcIntervalMiles>0)f.nextServiceMiles=mileage+f.svcIntervalMiles;
  }
  return f;
}
function saveVehicle(){
  if(!requireAdvisor())return;
  var clientId=val('v-client'),year=val('v-year').trim(),make=val('v-make').trim(),model=val('v-model').trim();
  if(!clientId||!year||!make||!model){showToast('Client, year, make and model are required','error');return;}
  if(!byId(getClients(),clientId)){showToast('Select a valid client','error');return;}
  if(!editingVehicleId&&!canAddVehicleFor(clientId)){showToast('You cannot add vehicles for this client.','error');return;}
  var yr=toInt(year),maxYr=new Date().getFullYear()+2;
  if(!yr||yr<1885||yr>maxYr||!/^\d{4}$/.test(year)){showToast('Year must be a 4-digit year between 1885 and '+maxYr,'error');return;}
  var errs=[];
  var pp=readMoney('v-purchase-price','Purchase price',errs),ins=readMoney('v-insured-value','Insured value',errs);
  var mileRaw=val('v-mileage').trim(),mileage=0;
  if(mileRaw){mileage=toInt(mileRaw);if(mileage===null||mileage<0){errs.push('Mileage must be 0 or more');mileage=0;}}
  if(errs.length){showToast(errs[0],'error');return;}
  var vin=val('v-vin').replace(/\s+/g,'').toUpperCase().slice(0,24);
  var pdate=val('v-purchase-date');
  if(pdate&&pdate>todayISO()){showToast('Purchase date cannot be in the future','error');return;}
  var vehicles=getVehicles(),now=new Date().toISOString(),saved=null;
  var fields={clientId:clientId,year:String(yr),make:make.slice(0,40),model:model.slice(0,60),trim:val('v-trim').trim().slice(0,40),isReplica:!!(document.getElementById('v-replica')||{}).checked,builder:(document.getElementById('v-replica')||{}).checked?cleanText(val('v-builder'),80):'',nickname:val('v-nickname').trim().slice(0,40),color:val('v-color').trim().slice(0,40),mileage:mileage,vin:vin,purchasePrice:pp,purchaseDate:pdate,insuredValue:ins,notes:val('v-notes').slice(0,1000)};
  var _ms=msFormRead();for(var _mk in _ms)if(_ms.hasOwnProperty(_mk))fields[_mk]=_ms[_mk];
  var dfs=readDateFields(mileage);if(typeof cbFormFields==='function')cbFormFields(fields);for(var dk in dfs)if(dfs.hasOwnProperty(dk))fields[dk]=dfs[dk];
  if(editingVehicleId){
    var v=byId(vehicles,editingVehicleId);if(!v){showToast('Vehicle no longer exists','error');return;}
    if(refuseIfArchived(v))return;
    if(!requireEdit(v))return;
    if(v.clientId!==clientId){showToast('To hand this vehicle to another client, use Sell / transfer so the current owner keeps an archive.','error');return;}
    for(var k in fields)if(fields.hasOwnProperty(k))v[k]=fields[k];
    if(pendingVehicleImage==='__remove__')v.image=null;
    else if(pendingVehicleImage)v.image=pendingVehicleImage;
    v.updatedAt=now;saved=v;vinFormApply(v,false);
    if(!setVehicles(vehicles))return;
    audit('vehicle.updated','Vehicle details updated: '+vName(v),{clientId:v.clientId,vehicleId:v.id});
    showToast('Vehicle updated','success');
  }else{
    var log=[];
    if(pp&&pdate&&pdate<todayISO())log.push({date:pdate,value:pp,source:'Purchase price'});
    var nv={id:uid(),image:(pendingVehicleImage&&pendingVehicleImage!=='__remove__')?pendingVehicleImage:null,valueLog:log,createdAt:now};
    for(var k2 in fields)if(fields.hasOwnProperty(k2))nv[k2]=fields[k2];
    vinFormApply(nv,true);vehicles.push(nv);saved=nv;
    if(!setVehicles(vehicles))return;
    audit('vehicle.created','Vehicle added: '+vName(nv)+' ('+vFull(nv)+')',{clientId:nv.clientId,vehicleId:nv.id});
    showToast('Vehicle added','success');
  }
  editingVehicleId=null;pendingVehicleImage=null;
  closeModal('modal-add-vehicle');
  refreshCurrent();
}
// ============ PHOTOS (downscaled on device) ============
var MAX_PHOTO_BYTES=1.5*1024*1024,MAX_PHOTO_DIM=1280,MAX_RAW_BYTES=15*1024*1024;
function pickVehicleImage(){var i=document.getElementById('v-img-input');if(i){i.value='';i.click();}}
function clearVehicleImage(){resetImagePicker();if(editingVehicleId)pendingVehicleImage='__remove__';}
function dataUrlBytes(u){var i=u.indexOf(',');return Math.round((u.length-i-1)*3/4);}
// v16b/v17 size fix helpers: shrink first, check only the output
function photoShrinkError(e){showToast(e&&e.message==='decode'?'This image format is not supported here. Try a JPEG or PNG.':'Could not read this photo','error');}
function blobToDataUrl(b){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=function(){rej(new Error('read'));};r.readAsDataURL(b);});}
async function shrinkPhotoBlob(file,maxDim,maxBytes,bg){
  var d=await pfDecode(file).catch(function(){throw new Error('decode');});
  try{
    var dim=Math.min(maxDim,Math.max(d.w,d.h)),last=null,Q=[0.8,0.7,0.6,0.5,0.4];
    for(var s=0;s<8;s++){
      for(var i=0;i<Q.length;i++){last=await pfEncode(d,dim,Q[i],bg);if(last.size<=maxBytes)return last;}
      dim=Math.max(64,Math.round(dim*0.75));
    }
    return last;
  }finally{d.done();}
}
function shrinkPhotoToDataUrl(file,maxDim,maxBytes,bg){return shrinkPhotoBlob(file,maxDim,maxBytes,bg).then(blobToDataUrl);}
function handleVehicleImage(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  if(file.type&&file.type.indexOf('image/')!==0){showToast('Please choose an image file','error');input.value='';return;}
  shrinkPhotoToDataUrl(file,MAX_PHOTO_DIM,MAX_PHOTO_BYTES,'#000').then(function(out){
    pendingVehicleImage=out;
    autoIdIdentify(out);
    var ps=document.getElementById('v-img-preview-src');if(ps)ps.src=out;
    showEl('v-img-preview',true);
    showToast('Photo ready ('+Math.round(dataUrlBytes(out)/1024)+' KB)','success');
  },function(e){photoShrinkError(e);input.value='';});
}
// ============ VIN DECODE (suggestion only, never auto-saved) ============
function withTimeout(promise,ms,ctl){
  return new Promise(function(resolve,reject){
    var t=setTimeout(function(){try{if(ctl)ctl.abort();}catch(e){}reject(new Error('timeout'));},ms);
    promise.then(function(x){clearTimeout(t);resolve(x);},function(e){clearTimeout(t);reject(e);});
  });
}
function cleanText(x,max){return (x===null||x===undefined)?'':String(x).replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);}
function cleanVin(){return val('v-vin').replace(/\s+/g,'').toUpperCase();}
function vinChanged(){
  var ok=cleanVin().length===17;try{if(VIN.form&&VIN.form.vin!==cleanVin())VIN.form=null;vinAutoForm();}catch(e){}
  showEl('v-vin-row',ok);
  var m=document.getElementById('v-vin-msg');if(m){m.textContent='';m.style.display='none';}
}
function setVinMsg(t){var m=document.getElementById('v-vin-msg');if(!m)return;m.textContent=t||'';m.style.display=t?'block':'none';}
function titleCase(s){return String(s||'').toLowerCase().replace(/(^|[\s-])([a-z])/g,function(m,a,b){return a+b.toUpperCase();});}
function fillFromVin(){
  var vin=cleanVin();
  if(vinOk(vin)&&!vinFormReplica()){VIN.form=null;clearTimeout(VIN.tm);vinFormDecode();return;}
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){setVinMsg('A VIN has 17 letters and numbers (no I, O or Q).');return;}
  var btn=document.getElementById('v-vin-btn');if(btn)btn.disabled=true;
  setVinMsg('Looking up VIN...');
  var ctl=null;try{ctl=new AbortController();}catch(e){ctl=null;}
  var p;
  try{p=fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/'+encodeURIComponent(vin)+'?format=json',ctl?{signal:ctl.signal}:undefined);}
  catch(e){if(btn)btn.disabled=false;setVinMsg('Could not reach the VIN lookup. Please type the details.');return;}
  withTimeout(p,15000,ctl).then(function(res){
    if(!res||!res.ok)throw new Error('http');
    return res.json();
  }).then(function(d){
    if(btn)btn.disabled=false;
    var row=d&&d.Results&&d.Results[0];
    var yr=cleanText(row&&row.ModelYear,4),mk=titleCase(cleanText(row&&row.Make,40)),md=cleanText(row&&row.Model,60);
    if(!/^\d{4}$/.test(yr))yr='';
    if(yr&&Number(yr)<1981){setVinMsg('Vehicles before 1981 do not have standard VINs. Please type the details.');return;}
    if(!yr&&!mk&&!md){setVinMsg('The lookup returned nothing for this VIN. Please type the details.');return;}
    var cur={'v-year':val('v-year').trim(),'v-make':val('v-make').trim(),'v-model':val('v-model').trim()};
    var next={'v-year':yr,'v-make':mk,'v-model':md};
    var conflict=false,k;
    for(k in next)if(next.hasOwnProperty(k)&&next[k]&&cur[k]&&cur[k].toLowerCase()!==next[k].toLowerCase())conflict=true;
    var _rh=vrVinHint(row,cur['v-make']);
    if(_rh){vrHint(_rh);if(!val('v-builder').trim()&&VR_KIT.test([row.Make,row.Manufacturer].join(' ')))setVal('v-builder',titleCase(cleanText(row.Manufacturer||row.Make,60)));setVinMsg('VIN decoded as '+[yr,mk,md].filter(function(x){return x;}).join(' ')+'. Your entries were kept.');return;}
    if(conflict&&!window.confirm('Replace the year, make and model you entered with '+[yr,mk,md].join(' ').trim()+'?')){setVinMsg('Left your entries as they are.');return;}
    for(k in next)if(next.hasOwnProperty(k)&&next[k]&&(conflict||!cur[k]))setVal(k,next[k]);
    setVinMsg('Filled from VIN: '+[yr,mk,md].filter(function(x){return x;}).join(' ')+'. Please check before saving.');
  }).catch(function(){
    if(btn)btn.disabled=false;
    setVinMsg('Could not reach the VIN lookup. Your fields were not changed. Please type the details.');
  });
}
// ============ VEHICLE DETAIL ============
function recCountsFor(vid){
  function m(x){return x.vehicleId===vid;}
  return {ins:getInspections().filter(m).length,ex:getExpenses().filter(m).length,dc:getDocs().filter(m).length,rc:getRecs().filter(m).length,lg:getLogs().filter(m).length};
}
function openVehicleDetail(vehicleId){
  var v=byId(getVehicles(),vehicleId);
  if(!v||!canSeeVehicle(v)){showToast('Vehicle not available','error');return;}
  currentVehicleId=vehicleId;
  var owner=isOwner(),g=vehicleGain(v),archived=isArchivedVehicle(v);
  if(!owner&&!archived)setUI('lastVehicle',v.id);
  elText('vd-title',heroHead(v));
  elHTML('vd-nickname',heroSubHTML(v,'hero-sub'));
  elText('vd-sub',v.color||'');
  showEl('vd-autonote',!owner&&!archived);
  elHTML('vd-tag',archived?'<span class="read-only-tag">Read-only archive</span>':'');
  elHTML('vd-img-area',pfHeroHTML(v));pfAfterDetail(v);docAiDetail(v);
  var hasPP=Number(v.purchasePrice)>0,hasV=g.hasValue;
  elHTML('vd-value',valueHeadHTML(v,g)+(hasV&&hasPP?'<div class="delta">'+(g.gain>=0?'+'+money(g.gain)+' above cost basis':'<span class="neg">'+money(g.gain)+' below cost basis</span>')+' <span style="color:var(--text-muted);margin-left:6px;">'+esc(pct(g.pctGain))+'</span></div>':'<div class="delta muted">'+(hasV?(owner?'Cost basis not on file':'Add a purchase price to see gain or loss'):'')+'</div>')+'');
  var insGap=v.insuredValue&&hasV&&g.value>v.insuredValue*1.05;
  var hs=aiHealth(v);
  elHTML('vd-ai',aiPanelHTML(v));vbFinish(v);
  elHTML('vd-photos',photosHTML(v));
  function cell(l,x,style){return '<div><span class="lab">'+l+'</span><b'+(style?' style="'+style+'"':'')+'>'+x+'</b></div>';}
  elHTML('vd-stats',
    cell('Cost basis',hasPP?money(g.basis):'--')+
    cell('Miles',v.mileage?fmtNum(v.mileage):'--')+
    cell('Health',hs===null?'--':hs+' / 100')+
    cell('Insured value',v.insuredValue?money(v.insuredValue)+(insGap?' <span style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;">gap</span>':''):'--',insGap?'color:var(--red);':''));
  var items=archived?[]:reminderItems([v]);
  var nextH='';
  if(items.length)nextH=items.map(function(it){return remRowHTML(it,!archived,false);}).join('');
  else if(!archived)nextH=!canEditVehicle(v)?mutedLine('No dates on file yet. The owner adds registration, insurance and service dates.'):'<div class="empty">No dates yet. Add registration, insurance and service dates once and EvoAI does the counting.<div><button class="btn btn-sm" onclick="editVehicleDates()">Add dates</button></div></div>';
  else nextH=mutedLine('Archived vehicles do not carry reminders.');
  elHTML('vd-next',nextH);dsecRender(v);
  elHTML('vd-brief',vehicleBrief(v));
  elHTML('vd-timeline',timelineHTML(v));
  function row(label,value,style){return '<tr><td style="padding:10px 0;color:var(--text-muted);border-bottom:1px solid var(--line);">'+label+'</td><td style="text-align:right;border-bottom:1px solid var(--line);'+(style||'')+'">'+value+'</td></tr>';}
  elHTML('vd-position','<table style="width:100%;font-size:17px;border-collapse:collapse;font-weight:300;">'+
    row('Acquired',esc(v.purchaseDate?fmtDate(v.purchaseDate):'--'))+
    row('Purchase price',hasPP?money(v.purchasePrice):'--')+
    row('Cost basis (includes value-adding work)',hasPP?money(g.basis):'--')+
    row('Unrealized gain / loss',(hasPP&&hasV)?'<span class="'+(g.gain>=0?'pos':'neg')+'">'+money(g.gain)+' ('+esc(pct(g.pctGain))+')</span>':'--')+
    row('Insured agreed value',v.insuredValue?money(v.insuredValue)+(insGap?' (market value is higher)':''):'--',insGap?'color:var(--red);':'')+
    (v.vin?row('VIN','<span class="mono">'+esc(v.vin)+'</span>'):'')+
    (dateField(v,'lastServiceDate')?row('Last service',esc(fmtDate(v.lastServiceDate))):'')+
    '</table>'+(v.notes?'<div class="doc-meta" style="margin-top:10px;">'+esc(v.notes)+'</div>':''));
  var pts=valuePoints(v);
  var lastLog=(v.valueLog||[]).filter(function(p){return p&&p.ai===true;}).sort(function(a,b){return String(a.date).localeCompare(String(b.date));}).pop();
  elHTML('vd-value-chart',pts.length>=2?areaChartDated(pts,560,100,g.gain>=0?GOLD_HEX:RED_HEX)+axisHTML(fmtDate(pts[0].date),endLabel(pts[pts.length-1].date))+(lastLog?'<div class="doc-meta" style="margin-top:10px;">Latest AI value: '+money(lastLog.value)+' on '+esc(fmtDate(lastLog.date))+'</div>':''):mutedLine('Not enough AI values to chart yet. '+AI_PENDING+'.'));
  var exs=getExpenses().filter(function(e){return e.vehicleId===v.id;}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
  var totalCost=exs.reduce(function(a,e){return a+(Number(e.amount)||0);},0);
  elHTML('vd-costs',exs.length?'<div style="font-size:30px;font-weight:200;letter-spacing:-.02em;margin-bottom:6px;">'+money(totalCost)+' <span class="lab">total expenses</span></div>'+exs.slice(-4).reverse().map(function(e){return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:17px;padding:11px 0;border-top:1px solid var(--line);font-weight:300;"><span style="color:var(--text-secondary);">'+esc(e.date||'')+' / '+esc(e.desc||e.category)+(e.valueAdd==='yes'?' <span class="lab" style="color:var(--gold);">basis</span>':'')+'</span><span>'+money(Number(e.amount))+'</span></div>';}).join(''):mutedLine(owner?'No expenses to show. They appear here when the owner shares them with you.':'No expenses logged. Use Log expense to add the first one.'));
  var recs=getRecs().filter(function(r){return r.vehicleId===v.id;}).reverse();
  elHTML('vd-recs',recs.length?recs.map(function(r){
    return '<div class="alert-item"><div class="alert-dot" style="background:'+URG_COLOR[r.urgency]+';"></div><div style="flex:1;"><div style="font-size:19px;font-weight:300;">'+esc(r.title)+(r.cost?' <span class="doc-meta" style="display:inline;color:var(--gold);">'+esc(r.cost)+'</span>':'')+'</div><div style="margin-top:6px;">'+statusChip(r.status,owner)+'</div>'+responseHTML(r)+(owner&&!archived&&r.status==='open'?'<div class="rec-actions"><button class="btn btn-primary btn-sm" onclick="openRespond(\''+jsId(r.id)+'\',\'accepted\')">Accept</button><button class="btn btn-sm" onclick="openRespond(\''+jsId(r.id)+'\',\'declined\')">Decline</button></div>':'')+'</div></div>';
  }).join(''):mutedLine(owner?'No advisories. Your advisor will send a recommendation here when something needs a decision.':'No advisories. Use New advisory to send the owner a recommendation.'));
  var docs=docAiSort(getDocs().filter(function(d){return d.vehicleId===v.id;}));
  elHTML('vd-docs',docs.length?docs.map(function(d){return docRowHTML(d);}).join(''):mutedLine('No documents yet. Tap Add Documents and AI reads, sorts and dates them for you.'));
  elHTML('vd-banner',transferMetaHTML(v));
  elHTML('vd-history',auditHTML(vehicleHistoryEntries(v,owner),'No recorded changes yet. Edits to this vehicle will be listed here.'));
  var actions=detailActionsHTML(v);
  elHTML('vd-actions',actions);
  showEl('vd-actions',!!actions,'flex');
  msRender(v);
  openModal('modal-vehicle-detail');
}
function editVehicleDates(){
  if(!requireAdvisor())return;
  editCurrentVehicle();
  var d=document.getElementById('v-dates');if(d)d.open=true;
}
function openExpenseFromDetail(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v||refuseIfArchived(v))return;
  detailReturnId=v.id;closeModal('modal-vehicle-detail');openExpenseModal(v.id);
}
function openDocFromDetail(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v||refuseIfArchived(v))return;
  detailReturnId=v.id;closeModal('modal-vehicle-detail');openDocModal(v.id);
}

function vehicleHistoryEntries(v,ownerView){
  return auditFor(function(e){
    if(ownerView&&!e.ownerVisible)return false;
    if(e.vehicleId===v.id)return true;
    if(v.sourceVehicleId&&e.vehicleId===v.sourceVehicleId&&v.archivedAt&&e.at&&e.at<=v.archivedAt)return true;
    return false;
  },10);
}
function archiveCardHTML(v){
  var owner=byId(getClients(),v.clientId);
  var reason=v.archiveReason==='transferred'?'Transferred':'Archived';
  var meta=esc(reason)+' '+esc(fmtDate(String(v.archivedAt||'').slice(0,10)));
  if(isAdvisor()&&owner)meta+=' / '+esc(owner.name);
  if(isAdvisor()&&v.archiveReason==='transferred'&&v.buyerName)meta+=' / to '+esc(v.buyerName);
  if(hasSalePrice(v))meta+=' / '+money(Number(v.salePrice));
  return vehicleCardHTML(v,meta);
}
function openArchivesPage(){archiveClientFilter=null;showPage('archives');}
function openClientArchives(){archiveClientFilter=currentClientId||null;showPage('archives');}
function clearArchiveFilter(){archiveClientFilter=null;renderArchives();}
function renderArchives(){
  var list=visibleArchives(),c=null;
  if(isAdvisor()&&archiveClientFilter){
    c=byId(getClients(),archiveClientFilter);
    list=list.filter(function(v){return v.clientId===archiveClientFilter;});
  }
  elText('archives-sub',isOwner()?'Read-only copies from your collection. Not counted in collection value, counts or health.':'Read-only. Not counted in collection value, counts or health.');
  elHTML('archives-filter-note',(isAdvisor()&&archiveClientFilter)?'<div class="flex gap-2 items-center" style="margin-bottom:12px;"><span class="doc-meta">Showing '+esc(c?c.name:'this client')+'</span><button class="btn btn-sm" onclick="clearArchiveFilter()">All archives</button></div>':'');
  list=list.slice().sort(function(a,b){return String(b.archivedAt||'').localeCompare(String(a.archivedAt||''));});
  elHTML('archives-list',list.length?list.map(archiveCardHTML).join(''):emptyCard(isOwner()?'No archived vehicles. Vehicles that are sold or retired are kept here.':'No archived vehicles yet. Archive keeps the profile and its records, and removes the vehicle from active totals.','grid-column:1/-1;'));
}
function archiveCurrentVehicle(){
  if(!requireAdvisor())return;
  var vs=getVehicles(),v=byId(vs,currentVehicleId);
  if(!v)return;
  if(!requireEdit(v))return;
  if(isArchivedVehicle(v)){showToast('This vehicle is already archived','error');return;}
  var n=recCountsFor(v.id);
  var msg='Archive '+vName(v)+' ('+vFull(v)+')?\n\nNothing is deleted. This keeps the vehicle profile and its records:\n'+
    n.ins+' inspection'+(n.ins===1?'':'s')+', '+n.ex+' expense'+(n.ex===1?'':'s')+', '+n.dc+' document'+(n.dc===1?'':'s')+', '+n.rc+' advisor'+(n.rc===1?'y':'ies')+', '+n.lg+' note'+(n.lg===1?'':'s')+'.\n\n'+
    'It leaves the active collection, so it is not counted in collection value, vehicle counts or health averages. The owner can still open it from Archives. It becomes read-only.';
  if(!window.confirm(msg))return;
  v.archived=true;
  v.archivedAt=new Date().toISOString();
  v.archiveReason='archived';
  v.updatedAt=v.archivedAt;
  if(!setVehicles(vs))return;
  audit('vehicle.archived','Vehicle archived (records kept): '+vName(v)+' ('+vFull(v)+')',{clientId:v.clientId,vehicleId:v.id});
  currentVehicleId=v.id;
  closeModal('modal-vehicle-detail');
  refreshCurrent();
  showToast('Vehicle archived. Records were kept.','success');
}
function docExpiryHTML(expiry){
  var days=daysUntil(expiry);
  if(days===null)return '';
  if(days<0)return '<span style="color:var(--red);">Expired</span>';
  if(days<=45)return '<span style="color:var(--gold);">'+days+' days left</span>';
  return '<span style="color:var(--text-muted);">'+esc(fmtDate(expiry))+'</span>';
}
// ============ VALUATIONS ============
function renderValuations(){
  var vehicles=visibleVehicles(),exs=getExpenses(),adv=isAdvisor();
  var t=portfolioTotals(vehicles);
  elHTML('val-stats',
    '<div class="stat-card"><div class="stat-value">'+totalMoney(t)+'</div><div class="stat-label">Collection value</div>'+(t.nValued>t.nOwner?'<div class="ai-disc">Estimate, not an appraisal</div>':'')+(t.nPending?'<div class="stat-delta muted">'+t.nPending+' without an estimate</div>':(t.nValued?'<div class="stat-delta muted">Estimate, range '+money(t.low)+' to '+money(t.high)+'</div>':''))+'</div>'+
    '<div class="stat-card"><div class="stat-value '+(t.gain>=0?'pos':'neg')+'">'+(t.basis>0?money(t.gain):'--')+'</div><div class="stat-label">Unrealized gain / loss</div>'+(t.basis>0?'<div class="stat-delta '+(t.gain>=0?'':'neg')+'">'+esc(pct(t.pctGain))+'</div>':'')+'</div>'+
    '<div class="stat-card"><div class="stat-value">'+(t.basisAll>0?money(t.basisAll):'--')+'</div><div class="stat-label">Cost basis</div></div>');
  var rows='';
  for(var i=0;i<vehicles.length;i++){
    var v=vehicles[i],g=vehicleGain(v,exs),pts=valuePoints(v).map(function(p){return p.value;});
    var hasPP=Number(v.purchasePrice)>0;
    rows+='<tr onclick="rowOpenVehicle(\''+jsId(v.id)+'\')" style="cursor:pointer;">'+
      '<td>'+esc(vFull(v))+nickHTML(v)+'</td>'+
      '<td>'+esc(v.purchaseDate?fmtDate(v.purchaseDate):'--')+'</td>'+
      '<td>'+(hasPP?money(g.basis):'--')+'</td>'+
      '<td>'+(g.hasValue?money(g.value)+'<small>'+esc('Estimate, as of '+fmtDate(v.aiValue.asOf))+'</small>':'<span style="color:var(--text-muted);">--</span><small>'+esc(noValueText(t))+'</small>')+'</td>'+
      '<td class="'+(g.hasGain?(g.gain>=0?'pos':'neg'):'')+'">'+(g.hasGain?money(g.gain)+'<small>'+esc(pct(g.pctGain))+'</small>':'--')+'</td>'+
      '<td>'+(pts.length>=2?sparkline(pts,90,24,g.gain>=0?GOLD_HEX:RED_HEX):'--')+'</td>'+
      '</tr>';
  }
  elHTML('valuations-table',rows||'<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:34px 0;">No vehicles yet.</td></tr>');
}
// ============ AI VALUE AND HEALTH (read-only; filled by the cloud endpoints) ============
function fmtConfidence(c){
  if(c===null||c===undefined||c==='')return '';
  if(typeof c==='number'){var p=c<=1?c*100:c;return Math.round(clamp(p,0,100))+'% confidence';}
  return String(c).slice(0,20)+' confidence';
}
function aiPayload(v){
  var docs=getDocs().filter(function(d){return d.vehicleId===v.id;}),types={},exp=[],i;
  for(i=0;i<docs.length;i++){var t=String(docs[i].type||'other');types[t]=(types[t]||0)+1;if(docs[i].expiry)exp.push({type:t,expiry:String(docs[i].expiry).slice(0,10)});}
  var svc=(v.serviceLog||[]).slice(-50).map(function(x){return {date:x.date||'',mileage:x.mileage||'',note:String(x.note||'').slice(0,160)};});
  var rem=reminderItems([v]).map(function(it){return {kind:it.kind,title:String(it.title||'').slice(0,100),due:it.due||''};});
  return {vehicleId:v.id,vin:v.vin||'',year:v.year,make:v.make,model:v.model,trim:v.trim||'',mileage:Number(v.mileage)||0,
    serviceHistory:{lastServiceDate:v.lastServiceDate||'',entries:svc},reminders:rem,
    documentsSummary:{count:docs.length,types:types,expiries:exp},requestedAt:new Date().toISOString()};
}
function aiStrList(a,max,len){
  var out=[];if(!a||!a.length)return out;
  for(var i=0;i<a.length&&out.length<max;i++){var x=a[i];if(x&&typeof x==='object')x=x.name||x.url||'';x=String(x||'').trim().slice(0,len);if(x)out.push(x);}
  return out;
}
function aiDate(d){return parseDate(d)?String(d).slice(0,10):todayISO();}
function cleanAIValue(r){
  if(!r||!(Number(r.value)>0))return null;
  var lo=Number(r.low),hi=Number(r.high),c=r.confidence;
  if(typeof c!=='number'&&typeof c!=='string')c='';
  return {value:Math.round(Number(r.value)),low:lo>0?Math.round(lo):0,high:hi>0?Math.round(hi):0,asOf:aiDate(r.asOf),sources:aiStrList(r.sources,8,120),confidence:c};
}
function cleanAIHealth(r){
  if(!r||r.score===undefined||r.score===null||r.score===''||!isFinite(Number(r.score)))return null;
  return {score:clamp(Math.round(Number(r.score)),0,100),reasons:aiStrList(r.reasons,8,200),asOf:aiDate(r.asOf)};
}
function aiPost(url,payload){
  return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}

// ============ EXPENSES ============
function renderExpenses(){
  var vehicles=visibleVehicles(),adv=canRemoveExpenses(),ids={};
  for(var q=0;q<vehicles.length;q++)ids[vehicles[q].id]=1;
  var exs=getExpenses().filter(function(e){return ids[e.vehicleId];});
  var total=exs.reduce(function(a,e){return a+(Number(e.amount)||0);},0);
  var valueAdd=exs.filter(function(e){return e.valueAdd==='yes';}).reduce(function(a,e){return a+(Number(e.amount)||0);},0);
  elHTML('exp-stats',
    '<div class="stat-card"><div class="stat-value">'+money(total)+'</div><div class="stat-label">Total logged</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+money(ytdCosts(vehicles))+'</div><div class="stat-label">This year</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+money(valueAdd)+'</div><div class="stat-label">Added to cost basis</div></div>');
  var sorted=exs.slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));});
  var rows=sorted.map(function(e){
    var vh=byId(vehicles,e.vehicleId);
    return '<tr'+(vh?' onclick="rowOpenVehicle(\''+jsId(vh.id)+'\')" style="cursor:pointer;"':'')+'><td>'+esc(e.date?fmtDate(e.date):'--')+'</td><td>'+(vh?esc(vFull(vh))+nickHTML(vh):'--')+'</td><td style="text-transform:capitalize;">'+esc(e.category)+(e.valueAdd==='yes'?' <span class="lab" style="color:var(--gold);">basis</span>':'')+'</td><td>'+esc(e.desc||'')+(e.image?' <span class="link" onclick="rowReceipt(\''+jsId(e.id)+'\')">Receipt</span>':'')+'</td><td style="text-align:right;">'+money(Number(e.amount))+'</td>'+(adv?'<td><button class="btn btn-sm" onclick="rowDeleteExpense(\''+jsId(e.id)+'\')">Remove</button></td>':'')+'</tr>';
  }).join('');
  elHTML('expenses-table',rows||'<tr><td colspan="'+(adv?6:5)+'" style="text-align:center;color:var(--text-muted);padding:34px 0;">'+(adv?'No expenses logged. Use Log expense to add the first one.':'No expenses to show. They appear here when the owner shares them with you.')+'</td></tr>');
}
function rowDeleteExpense(id){suppressRowClick=true;deleteExpense(id);setTimeout(function(){suppressRowClick=false;},0);}
function deleteExpense(id){
  if(!requireAdvisor())return;
  var exs=getExpenses(),e=byId(exs,id);if(!e)return;
  var v=byId(getVehicles(),e.vehicleId);
  if(v&&refuseIfArchived(v))return;
  if(!canEditVehicle(v)){showToast('Only the owner can remove expenses.','error');return;}
  if(!window.confirm('Remove this expense ('+money(Number(e.amount))+', '+(e.desc||e.category)+')? The owner will no longer see it and totals will drop by that amount.'))return;
  if(!setExpenses(exs.filter(function(x){return x.id!==id;})))return;
  audit('expense.deleted','Expense removed for '+(v?vName(v):'vehicle')+': '+money(Number(e.amount))+' '+(e.desc||e.category),{clientId:e.clientId,vehicleId:e.vehicleId});
  refreshCurrent();refreshDetailIfOpen();
  showToast('Expense removed','success');
}
function deleteDocument(id){
  if(!requireAdvisor())return;
  var docs=getDocs(),d=byId(docs,id);if(!d)return;
  var v=byId(getVehicles(),d.vehicleId);
  if(v&&refuseIfArchived(v))return;
  if(!(canEditVehicle(v)||(d.by===myId()&&can(v,'can_add_documents')))){showToast('Only the owner can remove this document.','error');return;}
  if(!window.confirm('Remove the document "'+d.name+'"? The owner will no longer see it.'))return;
  if(!setDocs(docs.filter(function(x){return x.id!==id;})))return;
  audit('document.deleted','Document removed for '+(v?vName(v):'vehicle')+': '+d.name,{clientId:d.clientId,vehicleId:d.vehicleId});
  refreshCurrent();refreshDetailIfOpen();
  showToast('Document removed','success');
}
function openExpenseModal(vid){
  if(!requireAdvisor())return;
  populateVehicleSelect('ex-vehicle',null,prefVehicleId(vid),'can_add_expenses');
  setVal('ex-amount','');setVal('ex-desc','');setVal('ex-valueadd','no');
  var cat=getUI().exCat;if(cat&&/^(maintenance|detailing|insurance|storage|registration|transport|restoration|other)$/.test(cat))setVal('ex-category',cat);
  setVal('ex-date',todayISO());
  clearPhoto('ex');
  openModal('modal-expense');
}
function saveExpense(){
  if(!requireAdvisor())return;
  var vid=val('ex-vehicle'),amount=toNum(val('ex-amount'));
  if(!vid){showToast('Select a vehicle','error');return;}
  if(amount===null||!(amount>0)){showToast('Amount must be greater than 0','error');return;}
  var v=byId(getVehicles(),vid);if(!v){showToast('Vehicle not found','error');return;}
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_expenses'))return;
  var e={id:uid(),vehicleId:vid,clientId:v.clientId,category:val('ex-category')||'other',amount:Math.round(amount*100)/100,date:val('ex-date')||todayISO(),desc:val('ex-desc').trim().slice(0,160),valueAdd:val('ex-valueadd')==='yes'?'yes':'no',image:ctxPhoto.ex||'',_file:ctxFile.ex||null,createdAt:new Date().toISOString(),by:me().id};
  var exs=getExpenses();exs.push(e);
  if(!setExpenses(exs))return;
  audit('expense.logged','Expense logged for '+vName(v)+': '+money(e.amount)+' '+e.category+(e.valueAdd==='yes'?' (adds to basis)':''),{clientId:v.clientId,vehicleId:v.id});
  setUI('lastVehicle',vid);setUI('exCat',e.category);
  closeModal('modal-expense');
  clearPhoto('ex');
  refreshCurrent();
  showToast('Expense logged','success');
  afterDetailSave(vid);
}
// ============ DOCUMENTS ============
function docAlertsHTML(docs){
  var a=[];
  for(var i=0;i<docs.length;i++){var d=docs[i];if(!d.expiry)continue;var days=daysUntil(d.expiry);if(days!==null&&days<=45)a.push({d:d,days:days});}
  a.sort(function(x,y){return x.days-y.days;});
  return a.length?a.map(function(x){
    return '<div class="alert-item"><div class="alert-dot" style="background:'+(x.days<0?RED_HEX:GOLD_HEX)+';"></div><div style="font-size:18px;font-weight:300;">'+esc(x.d.name)+' '+(x.days<0?'expired '+Math.abs(x.days)+' days ago':'renews in '+x.days+' days')+'</div></div>';
  }).join('')+'<div style="height:10px;"></div>':'';
}
function renderDocumentsList(){
  var vehicles=visibleVehicles(),ids={};
  for(var i=0;i<vehicles.length;i++)ids[vehicles[i].id]=1;
  var docs=getDocs().filter(function(d){return ids[d.vehicleId];});
  elHTML('doc-alerts',docAlertsHTML(docs));
  elHTML('documents-list',docsGroupedHTML(vehicles,docs,isAdvisor()?'No documents on record. Use Add document and snap a photo of a title, registration or policy.':'No documents on record yet. Your advisor adds titles, registrations, insurance and provenance here.'));
}
// ============ INSPECTIONS ============
function renderInspections(){
  var vehicles=visibleVehicles(),ids={},i;
  for(i=0;i<vehicles.length;i++)ids[vehicles[i].id]=vehicles[i];
  var el=document.getElementById('inspections-list');if(!el)return;
  var entries=[];
  getInspections().forEach(function(x){if(ids[x.vehicleId])entries.push({kind:'Inspection',v:ids[x.vehicleId],date:String(x.date||x.createdAt||'').slice(0,10),at:x.createdAt||'',x:x});});
  vehicles.forEach(function(v){(v.serviceLog||[]).forEach(function(s){if(s)entries.push({kind:'Service',v:v,date:String(s.date||'').slice(0,10),at:s.createdAt||'',s:s});});});
  if(!entries.length){el.innerHTML=emptyCard(isAdvisor()?'No service on record. Use Log service for maintenance or New inspection for a preservation visit.':'No service or inspections yet. They appear here when your advisor records them.');return;}
  entries.sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.at||'').localeCompare(a.at||'');});
  el.innerHTML=entries.map(function(en){
    var v=en.v,head,body='',right='';
    if(en.x){
      var x=en.x;
      head=fmtDate(x.date)+' / Inspection'+(x.tech?' / '+x.tech:'');
      body=x.aiSummary||x.notes||'Inspection completed.';
      right=[(x.battery?x.battery+' V':''),(x.condition||''),''].filter(function(t){return t;}).join(' / ');
      if(x.services&&x.services.length)body+='\n';
    }else{
      var s=en.s;
      head=fmtDate(s.date)+' / Service';
      body=(s.note||'Service completed');
      right=Number(s.mileage)>0?fmtNum(s.mileage)+' mi':'';
    }
    var done=(en.x&&en.x.services&&en.x.services.length)?'<div class="doc-meta" style="margin-top:8px;">Work done: '+esc(en.x.services.join(', '))+'</div>':'';
    return '<div class="rec-card" style="cursor:pointer;" onclick="openVehicleDetail(\''+jsId(v.id)+'\')"><div style="flex:1;min-width:220px;"><div class="rec-title">'+esc(vFull(v))+'</div>'+nickHTML(v)+'<div class="doc-meta">'+esc(head)+'</div><div class="rec-desc">'+esc(String(body).replace(/\n+$/,''))+'</div>'+done+'</div><div class="doc-meta" style="text-align:right;">'+esc(right)+'</div></div>';
  }).join('');
}
var INSP_FIELDS=['insp-tech','insp-mileage-start','insp-mileage-end','insp-battery','insp-tire-fl','insp-tire-fr','insp-tire-rl','insp-tire-rr','insp-notes','insp-ai-text'];
function resetInspectionForm(){
  for(var i=0;i<INSP_FIELDS.length;i++)setVal(INSP_FIELDS[i],'');
  setVal('insp-tender','ok');setVal('insp-condition','excellent');
  setVal('insp-date',todayISO());
  var tech=me();if(tech)setVal('insp-tech',tech.name||'');
  var checks=document.querySelectorAll('#modal-inspection .check-item.checked');
  for(var j=0;j<checks.length;j++)checks[j].classList.remove('checked');
  showEl('insp-ai-result',false);inspAiVehicleId=null;
  wizardStep=0;goWizardStep(0,true);
}
function openInspectionModal(){
  if(!requireAdvisor())return;
  resetInspectionForm();
  populateClientSelect('insp-client',null);
  updateInspectionVehicles();
  var pv=byId(getVehicles(),prefVehicleId());
  if(inspOwnerMode()){populateVehicleSelect('insp-vehicle',null,pv?pv.id:null,'can_add_service');}
  else if(pv){populateClientSelect('insp-client',pv.clientId);populateVehicleSelect('insp-vehicle',pv.clientId,pv.id,'can_add_service');}
  inspPickOnly();
  openModal('modal-inspection');
}
function openInspectionForVehicle(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);
  if(!v||refuseIfArchived(v))return;
  closeModal('modal-vehicle-detail');
  resetInspectionForm();
  populateClientSelect('insp-client',v?v.clientId:null);
  populateVehicleSelect('insp-vehicle',v?v.clientId:null,v?v.id:null);
  inspOwnerMode();
  if(v&&v.mileage)setVal('insp-mileage-start',v.mileage);
  openModal('modal-inspection');
}
function updateInspectionVehicles(){populateVehicleSelect('insp-vehicle',val('insp-client')||null,null,'can_add_service');inspPickOnly();}
function inspectionStepError(upTo){
  if(upTo>=1&&!val('insp-vehicle'))return {step:0,msg:'Select a vehicle'};
  if(upTo>=1){var d=val('insp-date');if(d&&d>todayISO())return {step:0,msg:'Service date cannot be in the future'};}
  if(upTo>=3){
    var ms=val('insp-mileage-start').trim();
    var me2=val('insp-mileage-end').trim();
    var a=ms?toInt(ms):null,b=me2?toInt(me2):null;
    if((ms&&(a===null||a<0))||(me2&&(b===null||b<0)))return {step:2,msg:'Mileage must be 0 or more'};
    if(a!==null&&b!==null&&b<a)return {step:2,msg:'Mileage end cannot be less than mileage start'};
    var bat=val('insp-battery').trim();if(bat){var bv=toNum(bat);if(bv===null||bv<0||bv>20)return {step:2,msg:'Battery voltage should be between 0 and 20 V'};}
    var tires=['insp-tire-fl','insp-tire-fr','insp-tire-rl','insp-tire-rr'];
    for(var i=0;i<tires.length;i++){var t=val(tires[i]).trim();if(t){var tv=toNum(t);if(tv===null||tv<0||tv>120)return {step:2,msg:'Tire pressures should be between 0 and 120 PSI'};}}
  }
  return null;
}
function goWizardStep(step,force){
  if(!force&&step>wizardStep){var err=inspectionStepError(step);if(err){showToast(err.msg,'error');step=err.step;}}
  wizardStep=step;
  var steps=document.querySelectorAll('#modal-inspection .wizard-step');
  var panels=document.querySelectorAll('#modal-inspection .wizard-panel');
  for(var i=0;i<steps.length;i++){steps[i].classList.toggle('active',i===step);steps[i].classList.toggle('done',i<step);}
  for(var j=0;j<panels.length;j++)panels[j].classList.toggle('active',j===step);
  inspProg(step);
}
function toggleCheck(el){el.classList.toggle('checked');}
// Draft helper: keyword templates that rephrase the tech's notes. Not a live AI model.
function buildAISummary(notes,vehicleName,battery){
  var n=String(notes||'').toLowerCase();
  var out='The '+vehicleName+' received its scheduled inspection this period. ';
  if(n.indexOf('start')>=0||n.indexOf('idle')>=0||n.indexOf('engine')>=0){
    if(n.indexOf('rough')>=0||n.indexOf('hesitat')>=0||n.indexOf('hard start')>=0)out+='A slight startup hesitation was noted and will be monitored at the next service. ';
    else if(n.indexOf('fine')>=0||n.indexOf('smooth')>=0||n.indexOf('good')>=0||n.indexOf('immediately')>=0||n.indexOf('no issue')>=0)out+='The vehicle started without hesitation and engine behavior was nominal throughout. ';
  }
  if(battery){
    var bv=parseFloat(battery);
    if(bv>=12.6)out+='Battery voltage measured a strong '+battery+'V, indicating excellent charge retention. ';
    else if(bv>=12.2)out+='Battery voltage recorded at '+battery+'V; within range but monitoring is advised. ';
    else if(bv>0)out+='Battery voltage of '+battery+'V is below optimal; replacement evaluation recommended. ';
  }
  if(n.indexOf('brake')>=0&&(n.indexOf('vibration')>=0||n.indexOf('pulsation')>=0||n.indexOf('squeal')>=0))out+='A brake anomaly was detected and logged for follow-up inspection; addressing it promptly protects both safety and asset value. ';
  else if(n.indexOf('brake')>=0&&(n.indexOf('ok')>=0||n.indexOf('good')>=0||n.indexOf('normal')>=0))out+='Brake function confirmed normal. ';
  if(n.indexOf('tire')>=0||n.indexOf('psi')>=0||n.indexOf('pressure')>=0){
    if(n.indexOf('corrected')>=0||n.indexOf('adjusted')>=0)out+='All four tires were corrected to manufacturer specification. ';
    else out+='Tire pressures were verified. ';
  }
  if(n.indexOf('no warning')>=0||n.indexOf('no lights')>=0)out+='No dashboard warning indicators were active. ';
  else if(n.indexOf('warning light')>=0||n.indexOf('check engine')>=0)out+='A dashboard warning indicator was noted and logged for diagnostics. ';
  if(n.indexOf('no leak')>=0)out+='No fluid leaks were observed. ';
  if(out.length<130)out+='All standard inspection items were completed.';
  return out;
}
function generateInspectionAI(){
  var vid=val('insp-vehicle'),v=byId(getVehicles(),vid);
  if(!v){showToast('Select a vehicle first','error');goWizardStep(0,true);return;}
  if(!val('insp-notes').trim()){showToast('Enter your notes first','error');return;}
  setVal('insp-ai-text',buildAISummary(val('insp-notes'),vFull(v),val('insp-battery')));
  inspAiVehicleId=vid;
  showEl('insp-ai-result',true);
}
function saveInspection(){
  if(!requireAdvisor())return;
  var err=inspectionStepError(4);
  if(err){showToast(err.msg,'error');goWizardStep(err.step,true);return;}
  var vid=val('insp-vehicle'),vs=getVehicles(),v=byId(vs,vid);
  if(!v){showToast('Select a vehicle','error');goWizardStep(0,true);return;}
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_service'))return;
  var services=[],condChecks=[],i;
  var checks=document.querySelectorAll('#services-checklist .check-item.checked');
  for(i=0;i<checks.length;i++){var lbl=checks[i].querySelector('.check-label');if(lbl)services.push(lbl.textContent);}
  var cc=document.querySelectorAll('#condition-checklist .check-item.checked');
  for(i=0;i<cc.length;i++){var l2=cc[i].querySelector('.check-label');if(l2)condChecks.push(l2.textContent);}
  var summaryShown=document.getElementById('insp-ai-result');
  var summary='';
  if(summaryShown&&summaryShown.style.display!=='none'){
    summary=inspAiVehicleId===vid?val('insp-ai-text').trim().slice(0,1500):buildAISummary(val('insp-notes'),vFull(v),val('insp-battery'));
  }
  var rec={id:uid(),vehicleId:vid,clientId:v.clientId,date:val('insp-date')||todayISO(),tech:val('insp-tech').trim().slice(0,60),battery:val('insp-battery').trim(),tender:val('insp-tender'),tireFL:val('insp-tire-fl'),tireFR:val('insp-tire-fr'),tireRL:val('insp-tire-rl'),tireRR:val('insp-tire-rr'),mileageStart:val('insp-mileage-start'),mileageEnd:val('insp-mileage-end'),condition:val('insp-condition'),conditionChecks:condChecks,services:services,notes:val('insp-notes').slice(0,2000),aiSummary:summary,createdAt:new Date().toISOString(),by:me().id};
  var inspections=getInspections();inspections.push(rec);
  if(!setInspections(inspections))return;
  var mEnd=toInt(rec.mileageEnd||'');
  if(mEnd!==null&&mEnd>(Number(v.mileage)||0))v.mileage=mEnd;
  setVehicles(vs);
  setUI('lastVehicle',vid);
  audit('inspection.saved','Inspection logged for '+vName(v)+' ('+fmtDate(rec.date)+')'+'',{clientId:v.clientId,vehicleId:v.id});
  closeModal('modal-inspection');
  refreshCurrent();
  showToast('Inspection saved','success');
}

// ============ ADVISORIES (lifecycle: open -> accepted/declined -> completed) ============
function updateRecBadge(){
  var recs=getRecs().filter(recordIsActive),count=0,badge=document.getElementById('recs-badge');
  if(isOwner()){
    var cid=ownerClientId();
    count=cid?recs.filter(function(r){return r.clientId===cid&&r.status==='open';}).length:0;
  }else{
    count=recs.filter(function(r){return r.status==='accepted'||r.status==='declined';}).length;
  }
  if(badge){badge.textContent=String(count);badge.style.display=count?'inline':'none';}
  updateRemBadge();
}
var recFilter='all',recStatusFilter='any';
function setTabActive(btn){
  var tabs=btn?btn.parentElement.querySelectorAll('.tab-btn'):[];
  for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('active');
  if(btn)btn.classList.add('active');
}
function filterRecs(f,btn){recFilter=f;setTabActive(btn);renderRecs();}
function filterRecStatus(f,btn){recStatusFilter=f;setTabActive(btn);renderRecs();}
function responseHTML(r){
  var h='';
  if(r.response&&r.response.at)h+='<div class="owner-note">'+esc(r.response.byName||'Owner')+' '+(r.response.decision==='accepted'?'accepted':'declined')+' on '+esc(fmtDate(String(r.response.at).slice(0,10)))+(r.response.note?': &ldquo;'+esc(r.response.note)+'&rdquo;':'')+'</div>';
  if(r.status==='completed'&&r.completedAt)h+='<div class="owner-note">Completed '+esc(fmtDate(String(r.completedAt).slice(0,10)))+(r.completedNote?': '+esc(r.completedNote):'')+'</div>';
  return h;
}
function renderRecs(){
  updateRecBadge();
  var owner=isOwner(),recs=getRecs().filter(recordIsActive);
  var vehicles=getVehicles(),clients=getClients();
  elText('recs-sub',owner?'Your advisor\'s recommendations. Accept or decline each one.':'Recommendations you send to owners. They accept or decline, and you mark accepted work completed.');
  var el=document.getElementById('recs-list');if(!el)return;
  if(owner){
    var cid=ownerClientId();
    recs=cid?recs.filter(function(r){return r.clientId===cid;}):[];
    if(!recs.length){el.innerHTML=emptyCard('No advisories. Your advisor sends one here when something needs a decision.');return;}
    var order={open:0,accepted:1,declined:2,completed:3};
    recs.sort(function(a,b){return (order[a.status]-order[b.status])||String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
    el.innerHTML=recs.map(function(r){return recCardHTML(r,true,vehicles,clients);}).join('');
    return;
  }
  if(recFilter!=='all')recs=recs.filter(function(r){return r.urgency===recFilter;});
  if(recStatusFilter!=='any')recs=recs.filter(function(r){return r.status===recStatusFilter;});
  if(!recs.length){el.innerHTML=emptyCard('No advisories found. Use New advisory to send a recommendation, or change the filters above.');return;}
  el.innerHTML=recs.slice().reverse().map(function(r){return recCardHTML(r,false,vehicles,clients);}).join('');
}
function openRecModal(presetVehicleId){
  if(!requireAdvisor())return;
  var v=presetVehicleId?byId(getVehicles(),presetVehicleId):null;
  populateClientSelect('rec-client',v?v.clientId:null);
  populateVehicleSelect('rec-vehicle',v?v.clientId:null,v?v.id:null,'can_create_advisories');
  setVal('rec-title','');setVal('rec-cost','');setVal('rec-notes','');setVal('rec-description','');setVal('rec-urgency','green');
  showEl('urgency-suggestion',false);
  openModal('modal-recommendation');
}
function openRecForVehicle(){
  var v=byId(getVehicles(),currentVehicleId);
  if(!v||refuseIfArchived(v))return;
  var id=currentVehicleId;closeModal('modal-vehicle-detail');openRecModal(id);
}
function updateRecVehicles(){populateVehicleSelect('rec-vehicle',val('rec-client')||null,null,'can_create_advisories');}
function saveRecommendation(){
  if(!requireAdvisor())return;
  var title=val('rec-title').trim(),clientId=val('rec-client'),vid=val('rec-vehicle');
  if(!title){showToast('Title is required','error');return;}
  var v=vid?byId(getVehicles(),vid):null;
  if(v&&refuseIfArchived(v))return;
  if(v)clientId=v.clientId;
  if(!v){showToast('Pick the vehicle this advisory is about','error');return;}
  if(!requireCan(v,'can_create_advisories'))return;
  if(!clientId||!byId(getClients(),clientId)){showToast('Select a client','error');return;}
  if(!val('rec-description').trim()){showToast('Add a client-facing description','error');return;}
  var r={id:uid(),title:title.slice(0,100),clientId:clientId,vehicleId:v?v.id:'',category:val('rec-category'),urgency:['red','yellow','green'].indexOf(val('rec-urgency'))>=0?val('rec-urgency'):'green',cost:val('rec-cost').trim().slice(0,40),valueImpact:val('rec-value-impact'),notes:val('rec-notes').slice(0,1000),description:val('rec-description').trim().slice(0,1500),status:'open',date:todayISO(),createdAt:new Date().toISOString(),by:me().id};
  var recs=getRecs();recs.push(r);
  if(!setRecs(recs))return;
  audit('advisory.created','Advisory sent to owner: '+r.title+(v?' ('+vName(v)+')':''),{clientId:clientId,vehicleId:r.vehicleId});
  closeModal('modal-recommendation');
  refreshCurrent();
  showToast('Advisory sent to owner','success');
}
function completeRec(id){
  if(!requireAdvisor())return;
  var recs=getRecs(),r=byId(recs,id);if(!r)return;
  if(refuseIfArchived(byId(getVehicles(),r.vehicleId)))return;
  if(r.status!=='accepted'){showToast('Only accepted advisories can be completed','error');return;}
  var note='';
  r.status='completed';r.completedAt=new Date().toISOString();r.completedBy=me().id;r.completedNote=String(note).trim().slice(0,300);
  if(!setRecs(recs))return;
  audit('advisory.completed','Advisory completed: '+r.title+(r.completedNote?' - '+r.completedNote:''),{clientId:r.clientId,vehicleId:r.vehicleId});
  refreshCurrent();showToast('Marked completed','success');
}
function deleteRec(id){
  if(!requireAdvisor())return;
  var recs=getRecs(),r=byId(recs,id);if(!r)return;
  if(refuseIfArchived(byId(getVehicles(),r.vehicleId)))return;
  if(!window.confirm('Delete advisory "'+r.title+'"? The owner will no longer see it.'))return;
  if(!setRecs(recs.filter(function(x){return x.id!==id;})))return;
  audit('advisory.deleted','Advisory deleted: '+r.title,{clientId:r.clientId,vehicleId:r.vehicleId});
  refreshCurrent();showToast('Advisory deleted','success');
}
// Owner response
function openRespond(id,decision){
  if(!isOwner())return;
  var r=byId(getRecs(),id);
  if(!r||r.clientId!==ownerClientId()){showToast('Advisory not available','error');return;}
  if(refuseIfArchived(byId(getVehicles(),r.vehicleId)))return;
  if(r.status!=='open'){showToast('This advisory already has a response','error');return;}
  respondState={id:id,decision:decision==='accepted'?'accepted':'declined'};
  closeModal('modal-vehicle-detail');
  elText('respond-title',respondState.decision==='accepted'?'Accept advisory':'Decline advisory');
  elHTML('respond-summary','<div style="font-size:22px;font-weight:300;color:var(--text);">'+esc(r.title)+'</div>'+(r.cost?'<div class="doc-meta" style="color:var(--gold);">Estimated '+esc(r.cost)+'</div>':'')+'<div style="margin-top:8px;">'+esc(r.description||'')+'</div>');
  setVal('respond-note','');
  var b=document.getElementById('respond-confirm-btn');
  if(b){b.textContent=respondState.decision==='accepted'?'Accept':'Decline';b.className='btn '+(respondState.decision==='accepted'?'btn-primary':'btn-danger');}
  openModal('modal-respond');
}
function confirmRespond(){
  if(!isOwner()||!respondState)return;
  var recs=getRecs(),r=byId(recs,respondState.id);
  if(!r||r.clientId!==ownerClientId()||r.status!=='open'){showToast('This advisory can no longer be changed','error');closeModal('modal-respond');return;}
  if(refuseIfArchived(byId(getVehicles(),r.vehicleId))){closeModal('modal-respond');return;}
  var a=me();
  r.status=respondState.decision;
  r.response={decision:respondState.decision,note:val('respond-note').trim().slice(0,600),at:new Date().toISOString(),by:a.id,byName:a.name||a.email};
  if(!setRecs(recs))return;
  audit('advisory.'+r.status,'Owner '+r.status+' advisory: '+r.title+(r.response.note?' - "'+r.response.note+'"':''),{clientId:r.clientId,vehicleId:r.vehicleId});
  respondState=null;
  closeModal('modal-respond');
  refreshCurrent();
  showToast(r.status==='accepted'?'Accepted. Your advisor has been updated.':'Declined. Your advisor has been updated.','success');
}
// ============ NOTES ============

// ============ REPORTS ============
// ============ OWNER PORTAL ============
function renderClientPortal(){
  var client=ownerClient();
  if(!client){showPage('client-link');return;}
  var vehicles=visibleVehicles();
  ctitleSet('cp-title',collName(client),!!collCustom(client),client);
  var open=getRecs().filter(function(r){return r.clientId===client.id&&r.status==='open'&&recordIsActive(r);}).length;
  elHTML('cp-banner',open?'<div class="banner" onclick="showPage(\'recommendations\')">'+open+' '+(open!==1?'advisories await':'advisory awaits')+' your response. Review</div>':'');
  var hr=new Date().getHours(),greet=hr<12?'Good morning':(hr<18?'Good afternoon':'Good evening');
  var acct=me(),fn=String((acct&&acct.name)||client.name||'').trim().split(/\s+/)[0].replace(/@.*$/,'');
  var nAtt=attentionItems(vehicles).length;
  var sub=!vehicles.length?'Your collection is being set up.':(nAtt?(nAtt===1?'There is one thing worth a look today.':'There are '+nAtt+' things worth a look today.'):'Everything is in good order.');
  elHTML('cp-welcome','<div class="welcome"><div class="w-line">'+esc(greet+(fn?', '+fn:''))+'.</div><div class="w-sub">'+esc(sub)+'</div></div>');
  renderOverview(true,vehicles);
}
// ============ AUDIT PAGE ============
function renderAuditPage(){
  var sel=document.getElementById('audit-client-select');
  var keep=sel?sel.value:'';
  populateClientSelect('audit-client-select',keep||null);
  if(sel&&sel.options.length)sel.options[0].text='All clients';
  renderAudit();
}
function renderAudit(){
  var cid=val('audit-client-select');
  elHTML('audit-list',auditHTML(auditFor(function(e){return !cid||e.clientId===cid;},300),'No activity recorded yet. Changes made in the app are listed here.'));
}
// ============ ACCOUNT / BACKUP ============
function downloadJSON(obj,filename){
  var text=JSON.stringify(obj,null,2);
  try{
    var blob=new Blob([text],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';
    document.body.appendChild(a);a.click();
    setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},1500);
    return true;
  }catch(e){showToast('Download is not supported in this browser','error');return false;}
}
// ============ v6: DATES, REMINDERS, BRIEFS ============
var REM_KIND_LABEL={registration:'Registration',insurance:'Insurance renewal',inspection:'Inspection / emissions',service:'Service',mileage:'Service',custom:'Reminder',document:'Document'};
var REPEAT_LABEL={none:'Does not repeat',yearly:'Yearly','6months':'Every 6 months',quarterly:'Quarterly'};
var RED_HEX='#E08A74',GOLD_HEX='#C9AA6B',GREEN_HEX='#7E8A83';
var detailReturnId=null;
var dueBannerShown=false;
var ctxPhoto={doc:null,ex:null};
function fmtNum(n){return Number(n).toLocaleString('en-US');}
function plural(n,one,many){return n===1?one:many;}
function repeatMonths(r){return r==='yearly'?12:r==='6months'?6:r==='quarterly'?3:0;}
function safeRepeat(r){return (r==='yearly'||r==='6months'||r==='quarterly')?r:'none';}
function addMonthsSafe(s,n){
  var d=parseDate(s);if(!d)return '';
  var day=d.getDate(),t=new Date(d.getFullYear(),d.getMonth()+n,1);
  var dim=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();
  t.setDate(Math.min(day,dim));return isoLocal(t);
}
function addDaysISO(s,n){var d=parseDate(s);if(!d)return '';d.setDate(d.getDate()+n);return isoLocal(d);}
// Roll a date forward by the interval until it is after today.
function rollForward(due,months){
  if(!months)return due;
  var n=parseDate(due)?String(due).slice(0,10):todayISO(),t=todayISO(),guard=0;
  do{n=addMonthsSafe(n,months);guard++;}while(n<=t&&guard<200);
  return n;
}
function dateField(o,k){var s=o&&o[k];return (s&&parseDate(s))?String(s).slice(0,10):'';}
function svcMonths(v){var n=v?v.svcIntervalMonths:undefined;n=(n===undefined||n===null||n==='')?6:Number(n);return (isNaN(n)||n<0)?6:Math.round(n);}
function svcMiles(v){var n=v?v.svcIntervalMiles:undefined;n=(n===undefined||n===null||n==='')?5000:Number(n);return (isNaN(n)||n<0)?5000:Math.round(n);}
function levelColor(score){return score<14?RED_HEX:(score<=30?GOLD_HEX:GREEN_HEX);}
function dueWords(days){
  if(days<0){var n=-days;return 'overdue by '+n+(n===1?' day':' days');}
  if(days===0)return 'due today';
  if(days===1)return 'due tomorrow';
  return 'due in '+days+' days';
}
function remItem(v,kind,due,repeat,extra){
  var days=due?daysUntil(due):null,id=(extra&&extra.id)||'';
  return {key:v.id+'_'+kind+'_'+id,vid:v.id,kind:kind,due:due,days:days,sortDays:days,repeat:safeRepeat(repeat),label:(extra&&extra.label)||REM_KIND_LABEL[kind],id:id,miles:null};
}
function reminderItems(vehicles){
  var out=[],ids={},i,j,v,d,it;
  for(i=0;i<vehicles.length;i++){
    v=vehicles[i];if(!v||isArchivedVehicle(v))continue;
    ids[v.id]=v;
    d=dateField(v,'regExpiry');if(d)out.push(remItem(v,'registration',d,'yearly'));
    d=dateField(v,'insRenewal');if(d)out.push(remItem(v,'insurance',d,v.insRepeat==='6months'?'6months':'yearly'));
    d=dateField(v,'inspExpiry');if(d)out.push(remItem(v,'inspection',d,'yearly'));
    d=dateField(v,'nextServiceDate');if(d)out.push(remItem(v,'service',d,'none'));
    var nm=Number(v.nextServiceMiles),cm=Number(v.mileage);
    if(nm>0&&cm>0){
      var left=nm-cm;
      it=remItem(v,'mileage','','none');it.miles=left;it.sortDays=left<=0?-1:(left<=500?29:999);
      out.push(it);
    }
    var rl=v.reminders;
    if(Object.prototype.toString.call(rl)==='[object Array]'){
      for(j=0;j<rl.length;j++){
        var r=rl[j];
        if(!r||r.doneAt)continue;
        d=dateField(r,'due');
        if(d)out.push(remItem(v,'custom',d,r.repeat,{id:jsId(r.id),label:String(r.title||'Reminder')}));
      }
    }
  }
  var docs=getDocs();
  for(i=0;i<docs.length;i++){
    var dc=docs[i],ex=dateField(dc,'expiry');
    if(!dc||!ex||!ids[dc.vehicleId])continue;
    v=ids[dc.vehicleId];
    if(dc.type==='registration'&&dateField(v,'regExpiry'))continue;
    if(dc.type==='insurance'&&dateField(v,'insRenewal'))continue;
    out.push(remItem(v,'document',ex,'none',{id:jsId(dc.id),label:String(dc.name||'Document')}));
  }
  out.sort(function(a,b){return (a.sortDays-b.sortDays)||String(a.label).localeCompare(String(b.label));});
  return out;
}
function remBucket(it){return it.sortDays<0?'over':(it.sortDays<=30?'soon':'later');}
function remPhrase(it){
  var n;
  if(it.kind==='mileage'){return it.miles<=0?'Service overdue by '+fmtNum(-it.miles)+' mi':'Service due in '+fmtNum(it.miles)+' mi';}
  if(it.kind==='document'){
    if(it.days<0){n=-it.days;return it.label+' expired '+n+(n===1?' day':' days')+' ago';}
    if(it.days===0)return it.label+' expires today';
    return it.label+' expires in '+it.days+(it.days===1?' day':' days');
  }
  return it.label+' '+dueWords(it.days);
}
function remCounts(items){
  var c={over:0,soon:0,later:0,urgent:0},i;
  for(i=0;i<items.length;i++){c[remBucket(items[i])]++;if(items[i].sortDays<14)c.urgent++;}
  return c;
}
function updateRemBadge(){
  if(!session)return;
  var c=remCounts(reminderItems(visibleVehicles())),n=c.over+c.soon;
  var badge=document.getElementById('rem-badge');
  if(!badge)return;
  badge.textContent=String(n);
  badge.style.display=n?'inline':'none';
  badge.style.color=c.urgent?RED_HEX:GOLD_HEX;
}
function showDueBanner(){
  if(dueBannerShown||!session)return;
  dueBannerShown=true;
  var c=remCounts(reminderItems(visibleVehicles()));
  var parts=[];
  if(c.over)parts.push('<span style="color:'+RED_HEX+';">'+c.over+' overdue</span>');
  if(c.soon)parts.push('<span style="color:'+GOLD_HEX+';">'+c.soon+' due within 30 days</span>');
  if(!parts.length){showEl('due-banner',false);return;}
  elHTML('due-banner-text',parts.join(' and ')+'. Tap to review.');
  showEl('due-banner',true,'flex');
}
function hideDueBanner(el){showEl('due-banner',false);}
function goReminders(){showPage('reminders');}
// ---- attention list (reminders + open advisories), most urgent first ----
function attentionItems(vehicles){
  var out=[],ids={},i,items=reminderItems(vehicles),recs=getRecs(),owner=isOwner();
  for(i=0;i<vehicles.length;i++)ids[vehicles[i].id]=vehicles[i];
  for(i=0;i<items.length;i++){
    if(items[i].sortDays>30)continue;
    var v=ids[items[i].vid];
    out.push({score:items[i].sortDays,vid:items[i].vid,name:vName(v),text:remPhrase(items[i])});
  }
  for(i=0;i<recs.length;i++){
    var r=recs[i],txt=null,score=r.urgency==='red'?0:20;
    if(!ids[r.vehicleId])continue;
    if(owner){
      if(r.status==='open')txt='Advisory: '+r.title+' - needs your response';
      else if(r.status==='accepted'&&r.urgency!=='green')txt='Advisory: '+r.title+' - accepted, your advisor will complete it';
    }else{
      if(r.status==='open'&&r.urgency!=='green')txt='Advisory: '+r.title+' - awaiting owner';
      else if(r.status==='accepted')txt='Advisory: '+r.title+' - accepted, mark completed when done';
      else if(r.status==='declined'&&r.urgency!=='green'){txt='Advisory: '+r.title+' - owner declined';score=15;}
    }
    if(txt)out.push({score:score,vid:r.vehicleId,name:vName(ids[r.vehicleId]),text:txt});
  }
  out.sort(function(a,b){return a.score-b.score;});
  return out;
}
function attentionHTML(vehicles,limit){
  var items=attentionItems(vehicles),i,h='';
  if(!items.length){
    var next=reminderItems(vehicles)[0];
    var msg;
    if(next)msg='Nothing needs attention right now. Next up: '+remPhrase(next)+'.';
    else msg=isOwner()?'Nothing needs attention. Your advisor adds registration, insurance and service dates for each vehicle.':'Nothing needs attention. Open a vehicle, tap Edit, and add its registration and insurance dates to start tracking.';
    if(isOwner())return '<div class="calm"><div class="calm-t">Nothing needs your attention</div><div class="calm-s">'+esc(next?'Next up: '+remPhrase(next)+'.':'Your advisor keeps your dates and records up to date, and anything important will appear here.')+'</div></div>';
    return '<div class="empty">'+esc(msg)+'</div>';
  }
  var shown=items.slice(0,limit||6);
  for(i=0;i<shown.length;i++){
    var a=shown[i],c=levelColor(a.score);
    h+='<div class="alert-item att-item" style="cursor:pointer;" onclick="openVehicleDetail(\''+jsId(a.vid)+'\')"><div class="alert-dot" style="background:'+c+';"></div><div style="flex:1;min-width:0;"><div style="font-size:19px;font-weight:300;color:'+(a.score<30?c:'var(--text)')+';">'+esc(a.text)+'</div><div class="doc-meta">'+esc(a.name)+'</div></div></div>';
  }
  if(items.length>shown.length)h+='<div class="doc-meta" style="padding:12px 0;">+ '+(items.length-shown.length)+' more in Reminders</div>';
  return h;
}
function cardStatusLine(v){
  if(isArchivedVehicle(v))return '';
  var items=reminderItems([v]);
  if(!items.length)return '<div class="st" style="color:var(--text-muted);">No dates on file</div>';
  var it=items[0],c=levelColor(it.sortDays);
  return '<div class="st" style="color:'+(it.sortDays<=30?c:'var(--text-secondary)')+';">'+esc(remPhrase(it))+'</div>';
}
// ---- reminders page ----
function remRowHTML(it,canAct,showVeh){
  var v=byId(getVehicles(),it.vid),c=levelColor(it.sortDays),urgent=it.sortDays<=30,vid=jsId(it.vid);
  canAct=canAct&&canManageReminders(v);
  var who=(showVeh&&v?vName(v):'');
  if(showVeh&&v&&isAdvisor()&&getClients().length>1){var cl=byId(getClients(),v.clientId);if(cl)who+=' ('+cl.name+')';}
  var sub=who+(it.due?(who?' / ':'')+fmtDate(it.due):'')+(it.repeat!=='none'?' / '+REPEAT_LABEL[it.repeat]:'');
  var b='';
  if(canAct){
    if(it.kind==='service'||it.kind==='mileage')b+='<button class="btn btn-primary btn-sm" onclick="serviceDoneToday(\''+vid+'\')">Service done today</button>';
    else if(it.kind==='registration'||it.kind==='insurance'||it.kind==='inspection'||it.kind==='custom')b+='<button class="btn btn-primary btn-sm" onclick="markRenewed(\''+vid+'\',\''+it.kind+'\',\''+jsId(it.id)+'\')">'+(it.kind==='custom'&&it.repeat==='none'?'Done':'Renewed today')+'</button>';
  }
  if(it.due)b+='<button class="btn btn-sm" onclick="downloadICS(\''+jsId(it.key)+'\')">Add to calendar</button>';
  if(showVeh)b+='<button class="btn btn-sm" onclick="openVehicleDetail(\''+vid+'\')">Open</button>';
  if(canAct&&it.kind==='custom')b+='<button class="btn btn-sm" onclick="removeReminder(\''+vid+'\',\''+jsId(it.id)+'\')">Remove</button>';
  return '<div class="rem-row" style="border-left-color:'+c+';"><div class="rem-main"><div class="rem-title" style="color:'+(urgent?c:'var(--text)')+';">'+esc(remPhrase(it))+'</div>'+(sub?'<div class="doc-meta">'+esc(sub)+'</div>':'')+'</div>'+(b?'<div class="rem-actions">'+b+'</div>':'')+'</div>';
}
function remPageHTML(canAct){
  var vs=visibleVehicles(),items=reminderItems(vs),c=remCounts(items);
  var h='<div class="stats-grid">'+
    '<div class="stat-card"><div class="stat-value" style="'+(c.over?'color:'+RED_HEX+';':'')+'">'+c.over+'</div><div class="stat-label">Overdue</div></div>'+
    '<div class="stat-card"><div class="stat-value" style="'+(c.soon?'color:'+GOLD_HEX+';':'')+'">'+c.soon+'</div><div class="stat-label">Due in 30 days</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+c.later+'</div><div class="stat-label">Later</div></div></div>';
  h+='<div class="disclaimer" style="margin:-18px 0 6px;">'+'Mark items done here and the new date is saved. Phone and email alerts are not on yet. For now, use Add to calendar.</div>';
  if(!items.length){
    return h+emptyCard(canAct?'No reminders yet. Open a vehicle, tap Edit, and add its registration and insurance dates, or tap Add reminder.':'No reminders yet. Your advisor adds registration, insurance and service dates for each vehicle, and they will show here.');
  }
  var groups=[['over','Overdue'],['soon','Due in 30 days'],['later','Later']],g,i,list;
  for(g=0;g<groups.length;g++){
    list=items.filter(function(it){return remBucket(it)===groups[g][0];});
    if(!list.length)continue;
    h+='<div class="sh"><h2>'+groups[g][1]+' ('+list.length+')</h2></div>';
    for(i=0;i<list.length;i++)h+=remRowHTML(list[i],canAct,true);
  }
  return h;
}
function renderReminders(){elHTML('rem-body',docAiRemSectionHTML(null,true)+remPageHTML(true));}
// ---- marking done (advisor / admin only; audited) ----
function refreshDetailIfOpen(){
  var m=document.getElementById('modal-vehicle-detail');
  if(m&&m.classList.contains('active')&&currentVehicleId)openVehicleDetail(currentVehicleId);
}
function markRenewed(vid,kind,rid){
  if(!requireAdvisor())return;
  var vs=getVehicles(),v=byId(vs,vid);if(!v)return;
  if(refuseIfArchived(v))return;
  if(!requireEdit(v))return;
  var months=12,field='',label=REM_KIND_LABEL[kind]||'Reminder',from='',to='',i;
  if(kind==='registration')field='regExpiry';
  else if(kind==='insurance'){field='insRenewal';months=v.insRepeat==='6months'?6:12;}
  else if(kind==='inspection')field='inspExpiry';
  else if(kind!=='custom'){showToast('This item cannot be marked here','error');return;}
  if(kind==='custom'){
    var r=null,rl=v.reminders||[];
    for(i=0;i<rl.length;i++)if(rl[i]&&jsId(rl[i].id)===rid)r=rl[i];
    if(!r){showToast('Reminder not found','error');return;}
    label=String(r.title||'Reminder');from=dateField(r,'due');
    var m2=repeatMonths(safeRepeat(r.repeat));
    if(m2){to=rollForward(from,m2);r.due=to;}
    else{r.doneAt=todayISO();}
  }else{
    from=dateField(v,field);to=rollForward(from,months);v[field]=to;
  }
  if(!v.renewals)v.renewals=[];
  v.renewals.push({id:uid(),date:todayISO(),kind:kind,label:label,from:from,to:to,by:me().id});
  v.updatedAt=new Date().toISOString();
  if(!setVehicles(vs))return;
  setUI('lastVehicle',v.id);
  audit('reminder.renewed',label+(to?' renewed for '+vName(v)+', next date '+fmtDate(to):' marked done for '+vName(v)),{clientId:v.clientId,vehicleId:v.id});
  refreshCurrent();refreshDetailIfOpen();
  showToast(to?label.replace(/ renewal$/i,'')+' renewed. Next date: '+fmtDate(to):label+' marked done','success');
}
function applyService(v,date,miles,note){
  if(!v.serviceLog)v.serviceLog=[];
  v.serviceLog.push({id:uid(),date:date,mileage:miles||'',note:String(note||'').slice(0,160),by:me().id,createdAt:new Date().toISOString()});
  var im=svcMonths(v),imi=svcMiles(v),latest=!dateField(v,'lastServiceDate')||date>=dateField(v,'lastServiceDate');
  if(miles&&miles>(Number(v.mileage)||0))v.mileage=miles;
  var parts=[];
  if(latest)v.lastServiceDate=date;
  if(latest&&canManageReminders(v)){
    v.nextServiceDate=im>0?addMonthsSafe(date,im):'';
    if(im>0)parts.push(fmtDate(v.nextServiceDate));
    if(miles&&imi>0){v.nextServiceMiles=miles+imi;parts.push(fmtNum(v.nextServiceMiles)+' mi');}
    else if(!(imi>0))v.nextServiceMiles='';
  }
  v.updatedAt=new Date().toISOString();
  return parts.join(' or ');
}
function serviceDoneToday(vid){
  if(!requireAdvisor())return;
  var vs=getVehicles(),v=byId(vs,vid);if(!v)return;
  if(refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_service'))return;
  var miles=Number(v.mileage)||0;
  var nxt=applyService(v,todayISO(),miles>0?miles:0,'Service completed');
  if(!setVehicles(vs))return;
  setUI('lastVehicle',v.id);
  audit('service.logged','Service logged for '+vName(v)+' ('+fmtDate(todayISO())+')'+(nxt?', next due '+nxt:''),{clientId:v.clientId,vehicleId:v.id});
  refreshCurrent();refreshDetailIfOpen();
  showToast('Service logged.'+(nxt?' Next due '+nxt:''),'success');
}
function removeReminder(vid,rid){
  if(!requireAdvisor())return;
  var vs=getVehicles(),v=byId(vs,vid);if(!v||!v.reminders)return;
  if(!requireEdit(v))return;
  var keep=[],title='',i;
  for(i=0;i<v.reminders.length;i++){if(v.reminders[i]&&jsId(v.reminders[i].id)===rid)title=v.reminders[i].title;else keep.push(v.reminders[i]);}
  if(keep.length===v.reminders.length)return;
  if(!window.confirm('Remove the reminder "'+title+'"?'))return;
  v.reminders=keep;v.updatedAt=new Date().toISOString();
  if(!setVehicles(vs))return;
  audit('reminder.removed','Reminder removed for '+vName(v)+': '+title,{clientId:v.clientId,vehicleId:v.id});
  refreshCurrent();refreshDetailIfOpen();
  showToast('Reminder removed','success');
}
// ---- UI memory (last used vehicle, category) ----
function getUI(){var u=DB.get('evoai_ui',{});return (u&&typeof u==='object'&&!u.length)?u:{};}
function setUI(k,v){try{var u=getUI();u[k]=v;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}}
function prefVehicleId(explicit){
  var vs=activeVehicles(),i,want=[explicit||'',getUI().lastVehicle||''];
  for(var w=0;w<want.length;w++){if(!want[w])continue;for(i=0;i<vs.length;i++)if(vs[i].id===want[w])return want[w];}
  return vs.length===1?vs[0].id:null;
}
function afterDetailSave(vid){
  if(detailReturnId&&detailReturnId===vid){var id=detailReturnId;detailReturnId=null;setTimeout(function(){openVehicleDetail(id);},260);}
  else detailReturnId=null;
}
// ---- service modal ----
function openServiceModal(vid){
  if(!requireAdvisor())return;
  populateVehicleSelect('svc-vehicle',null,prefVehicleId(vid),'can_add_service');
  var v=byId(getVehicles(),val('svc-vehicle'));
  setVal('svc-date',todayISO());setVal('svc-miles',v&&v.mileage?v.mileage:'');setVal('svc-note','');setVal('svc-cost','');
  updateServiceNext();
  openModal('modal-service');
}
function openServiceFromDetail(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v||refuseIfArchived(v))return;
  detailReturnId=v.id;closeModal('modal-vehicle-detail');openServiceModal(v.id);
}
function updateServiceNext(){
  var v=byId(getVehicles(),val('svc-vehicle'));
  if(!v){elText('svc-next','');return;}
  var im=svcMonths(v),imi=svcMiles(v),d=val('svc-date')||todayISO(),mi=toInt(val('svc-miles')),t=[];
  if(im>0)t.push(fmtDate(addMonthsSafe(d,im)));
  if(mi&&imi>0)t.push(fmtNum(mi+imi)+' mi');
  elText('svc-next',t.length?'Next service will be set to '+t.join(' or ')+'. Change the interval under Edit.':'No next-service interval is set for this vehicle.');
}
function saveService(){
  if(!requireAdvisor())return;
  var vid=val('svc-vehicle'),date=val('svc-date')||todayISO();
  if(!vid){showToast('Select a vehicle','error');return;}
  if(date>todayISO()){showToast('Service date cannot be in the future','error');return;}
  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;
  if(!requireCan(v,'can_add_service'))return;
  var miles=toInt(val('svc-miles')),cost=toNum(val('svc-cost'));
  if(val('svc-miles').trim()&&(miles===null||miles<0)){showToast('Mileage must be 0 or more','error');return;}
  if(val('svc-cost').trim()&&(cost===null||cost<0)){showToast('Cost must be 0 or more','error');return;}
  var note=val('svc-note').trim().slice(0,160)||'Service completed';
  var nxt=applyService(v,date,miles||0,note);
  if(cost&&cost>0)v.serviceLog[v.serviceLog.length-1].cost=Math.round(cost*100)/100;
  if(!setVehicles(vs))return;
  if(cost&&cost>0&&can(v,'can_add_expenses')){
    var exs=getExpenses();
    exs.push({id:uid(),vehicleId:vid,clientId:v.clientId,category:'maintenance',amount:Math.round(cost*100)/100,date:date,desc:note,valueAdd:'no',createdAt:new Date().toISOString(),by:me().id});
    setExpenses(exs);
  }
  setUI('lastVehicle',vid);
  audit('service.logged','Service logged for '+vName(v)+' ('+fmtDate(date)+')'+(cost>0?', '+money(cost):'')+(nxt?', next due '+nxt:''),{clientId:v.clientId,vehicleId:v.id});
  closeModal('modal-service');
  refreshCurrent();
  showToast('Service logged.'+(nxt?' Next due '+nxt:''),'success');
  afterDetailSave(vid);
}
// ---- custom reminder modal ----
function openReminderModal(vid){
  if(!requireAdvisor())return;
  populateVehicleSelect('rm-vehicle',null,prefVehicleId(vid));
  setVal('rm-title','');setVal('rm-due','');setVal('rm-repeat','none');
  openModal('modal-reminder');
}
function openReminderFromDetail(){
  if(!requireAdvisor())return;
  var v=byId(getVehicles(),currentVehicleId);if(!v||refuseIfArchived(v))return;
  detailReturnId=v.id;closeModal('modal-vehicle-detail');openReminderModal(v.id);
}
function saveReminder(){
  if(!requireAdvisor())return;
  var vid=val('rm-vehicle'),title=val('rm-title').trim().slice(0,80),due=val('rm-due');
  if(!vid||!title||!parseDate(due)){showToast('Vehicle, title and due date are required','error');return;}
  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;
  if(!requireEdit(v))return;
  if(!v.reminders)v.reminders=[];
  var rep=safeRepeat(val('rm-repeat'));
  v.reminders.push({id:uid(),title:title,due:due,repeat:rep,createdAt:new Date().toISOString(),by:me().id});
  v.updatedAt=new Date().toISOString();
  if(!setVehicles(vs))return;
  setUI('lastVehicle',vid);
  audit('reminder.added','Reminder added for '+vName(v)+': '+title+' ('+fmtDate(due)+')',{clientId:v.clientId,vehicleId:v.id});
  closeModal('modal-reminder');
  refreshCurrent();
  showToast('Reminder added','success');
  afterDetailSave(vid);
}
// ---- calendar (.ics) ----
function icsEsc(s){return String(s===null||s===undefined?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
function icsFold(line){var out=[];while(line.length>72){out.push(line.slice(0,72));line=' '+line.slice(72);}out.push(line);return out.join('\r\n');}
function icsStamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');}
function icsEvent(it){
  var v=byId(getVehicles(),it.vid),name=v?vName(v):'Vehicle';
  var d0=String(it.due).slice(0,10).replace(/-/g,''),d1=addDaysISO(it.due,1).replace(/-/g,'');
  var rr={yearly:'FREQ=YEARLY','6months':'FREQ=MONTHLY;INTERVAL=6',quarterly:'FREQ=MONTHLY;INTERVAL=3'}[it.repeat];
  var lines=['BEGIN:VEVENT','UID:evoai-'+it.key+'-'+d0+'@evoai.local','DTSTAMP:'+icsStamp(),'DTSTART;VALUE=DATE:'+d0,'DTEND;VALUE=DATE:'+d1,
    'SUMMARY:'+icsEsc(name+' - '+it.label),
    'DESCRIPTION:'+icsEsc((v?vFull(v)+'. ':'')+it.label+' - '+fmtDate(it.due)+'. From EvoAI.')];
  if(rr)lines.push('RRULE:'+rr);
  lines.push('BEGIN:VALARM','TRIGGER:-P7D','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(it.label+' for '+name+' is coming up'),'END:VALARM','END:VEVENT');
  return lines.map(icsFold).join('\r\n');
}
function icsCalendar(items){
  var ev=items.filter(function(it){return !!it.due;}).map(icsEvent);
  return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EvoAI//Reminders//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n'+ev.join('\r\n')+'\r\nEND:VCALENDAR\r\n';
}
function downloadText(text,mime,filename){
  try{
    var blob=new Blob([text],{type:mime});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';
    document.body.appendChild(a);a.click();
    setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},1500);
    return true;
  }catch(e){showToast('Download is not supported in this browser','error');return false;}
}
function downloadICS(key){
  var items=reminderItems(visibleVehicles()),it=null,i;
  for(i=0;i<items.length;i++)if(items[i].key===key)it=items[i];
  if(!it||!it.due){showToast('This reminder has no date to add to a calendar','error');return;}
  var slug=String(it.label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'reminder';
  if(downloadText(icsCalendar([it]),'text/calendar;charset=utf-8','evoai-'+slug+'.ics'))showToast('Calendar file ready. Open it to add the reminder.','success');
}
function downloadAllICS(){
  var items=reminderItems(visibleVehicles()).filter(function(it){return !!it.due;});
  if(!items.length){showToast('No dated reminders to add yet. Add a registration or insurance date first.','error');return;}
  if(downloadText(icsCalendar(items),'text/calendar;charset=utf-8','evoai-reminders-'+todayISO()+'.ics'))showToast(items.length+' reminders in your calendar file','success');
}
// ---- written briefs (built only from stored records) ----
function briefHTML(title,paras,facts,missing){
  var h='<div class="brief"><div class="brief-head"><div class="brief-title">'+esc(title)+'</div><span class="brief-chip">Written from your records</span></div>',i;
  for(i=0;i<paras.length;i++)h+='<p>'+esc(paras[i])+'</p>';
  if(facts.length){h+='<ul class="brief-facts">';for(i=0;i<facts.length;i++)h+='<li>'+esc(facts[i])+'</li>';h+='</ul>';}
  if(missing.length)h+='<p class="brief-missing">Not on file yet: '+esc(missing.join(', '))+'.</p>';
  return h+'<div class="disclaimer">Summarised on this device from the records saved in EvoAI. No live AI model and no outside market data were used.</div></div>';
}
function topCategory(exs){
  var by={},k,best='',amt=0,i;
  for(i=0;i<exs.length;i++){k=exs[i].category||'other';by[k]=(by[k]||0)+(Number(exs[i].amount)||0);}
  for(k in by)if(by.hasOwnProperty(k)&&by[k]>amt){amt=by[k];best=k;}
  return best;
}
function costSentence(exs,whoLabel){
  if(!exs.length)return 'No expenses are logged yet, so '+whoLabel+' cost of ownership cannot be shown.';
  var total=0,ytd=0,yr=String(new Date().getFullYear()),i;
  for(i=0;i<exs.length;i++){var a=Number(exs[i].amount)||0;total+=a;if(String(exs[i].date||'').slice(0,4)===yr)ytd+=a;}
  var top=topCategory(exs);
  return 'Logged ownership costs total '+money(total)+' across '+exs.length+' '+plural(exs.length,'entry','entries')+', with '+money(ytd)+' so far this year'+(top?', mostly in '+top:'')+'.';
}
function vehicleBrief(v){
  var allEx=getExpenses(),exs=allEx.filter(function(e){return e.vehicleId===v.id;});
  var g=vehicleGain(v,allEx),pts=valuePoints(v),items=reminderItems([v]);
  var recs=getRecs().filter(function(r){return r.vehicleId===v.id&&(r.status==='open'||r.status==='accepted');});
  var docs=getDocs().filter(function(d){return d.vehicleId===v.id;});
  var name=vFull(v)+(v.nickname?' ("'+v.nickname+'")':'');
  var p1=[],p2=[],p3=[],facts=[],missing=[],i;
  var cv=aiVal(v)||0,pp=Number(v.purchasePrice)||0,ins=Number(v.insuredValue)||0;
  if(cv>0)p1.push(name+' is carried at '+money(cv)+'.');
  else{p1.push(aiVal(v)===null?(noValueText()+' for '+name+'.'):('The current value of '+name+' is an estimate.'));missing.push('value estimate');}
  if(pp>0&&cv>0)p1.push('Against a cost basis of '+money(g.basis)+' (purchase price plus work added to basis), that is an unrealized '+(g.gain>=0?'gain':'loss')+' of '+money(Math.abs(g.gain))+' ('+pct(g.pctGain)+').');
  else if(pp<=0){p1.push('No purchase price is recorded, so gain or loss cannot be worked out.');missing.push('purchase price');}
  if(pts.length>=2){
    var a=pts[0],b=pts[pts.length-1],ch=b.value-a.value;
    p1.push('AI values moved from '+money(a.value)+' ('+fmtMonth(a.date)+(a.legacy?', earlier monthly history':'')+') to '+money(b.value)+' ('+fmtMonth(b.date)+'), '+(ch>=0?'up ':'down ')+money(Math.abs(ch))+' ('+pct(a.value?ch/a.value*100:0)+').');
  }else if(pts.length===1)p1.push('Only one dated AI value so far, so there is no trend yet.');
  else missing.push('dated value history');
  if(ins>0&&cv>ins*1.05)p1.push('The market value is above the insured agreed value of '+money(ins)+', so the coverage may be worth reviewing.');
  else if(ins<=0)missing.push('insured value');
  var over=items.filter(function(it){return remBucket(it)==='over';}),soon=items.filter(function(it){return remBucket(it)==='soon';});
  if(over.length)p2.push('Overdue: '+over.slice(0,3).map(remPhrase).join('; ')+'.');
  if(soon.length)p2.push('Coming up within 30 days: '+soon.slice(0,3).map(remPhrase).join('; ')+'.');
  if(!over.length&&!soon.length){
    if(items.length)p2.push('Nothing is due in the next 30 days. Next up: '+remPhrase(items[0])+(items[0].due?' ('+fmtDate(items[0].due)+')':'')+'.');
    else p2.push('No renewal or service dates are on file, so nothing can be tracked yet.');
  }
  if(!dateField(v,'regExpiry'))missing.push('registration date');
  if(!dateField(v,'insRenewal'))missing.push('insurance renewal date');
  if(!dateField(v,'nextServiceDate')&&!(Number(v.nextServiceMiles)>0))missing.push('next service due');
  var lastSvc=dateField(v,'lastServiceDate');
  if(lastSvc)p2.push('The last service was on '+fmtDate(lastSvc)+'.');
  else{
    var insp=getInspections().filter(function(x){return x.vehicleId===v.id&&x.date;}).sort(function(x,y){return String(y.date).localeCompare(String(x.date));});
    if(insp.length)p2.push('The last preservation inspection was on '+fmtDate(insp[0].date)+'. No mechanical service date is recorded.');
    else p2.push('No service is on record yet.');
  }
  if(recs.length){
    var tl=recs.slice(0,3).map(function(r){return r.title;}).join(', ');
    p2.push(recs.length+' '+plural(recs.length,'advisory is','advisories are')+' open: '+tl+'.');
  }else p2.push('There are no open advisories.');
  p3.push(costSentence(exs,'its'));
  var paras=[p1.join(' '),p2.join(' '),p3.join(' ')];
  if(Number(v.mileage)>0)facts.push('Mileage: '+fmtNum(v.mileage));else missing.push('mileage');
  var sl=(v.serviceLog||[]).filter(function(s){return Number(s.mileage)>0;});
  if(sl.length&&Number(v.mileage)>0){var lm=Number(sl[sl.length-1].mileage);if(Number(v.mileage)>=lm)facts.push('Miles since last logged service: '+fmtNum(Number(v.mileage)-lm));}
  if(aiHealth(v)!==null)facts.push('Health score: '+aiHealth(v)+' of 100 (calculated from records)');else facts.push('Health score: not shared');
  facts.push('Documents on file: '+docs.length);
  if(ins>0)facts.push('Insured agreed value: '+money(ins));
  if(pp>0)facts.push('Purchase price: '+money(pp)+(v.purchaseDate?' on '+fmtDate(v.purchaseDate):''));
  return briefHTML('Vehicle brief',paras,facts,missing);
}
function collectionBrief(vs){
  if(!vs.length)return '<div class="brief"><div class="brief-head"><div class="brief-title">Collection brief</div><span class="brief-chip">Written from your records</span></div><p>'+esc(isOwner()?'No vehicles are in the collection yet. The brief will appear once your advisor adds the first one.':'No vehicles yet. Add a vehicle and the brief will write itself from its records.')+'</p></div>';
  var allEx=getExpenses(),ids={},i,v;
  for(i=0;i<vs.length;i++)ids[vs[i].id]=1;
  var exs=allEx.filter(function(e){return ids[e.vehicleId];});
  var value=0,basis=0,valueB=0,nB=0,withTrend=[],noPP=0,nPend=0;
  for(i=0;i<vs.length;i++){
    v=vs[i];var g=vehicleGain(v,allEx);if(g.hasValue)value+=g.value;else nPend++;
    if(Number(v.purchasePrice)<=0||!(Number(v.purchasePrice)>0))noPP++;
    if(g.hasGain){basis+=g.basis;valueB+=g.value;nB++;}
    var pts=valuePoints(v);
    if(pts.length>=2)withTrend.push({v:v,a:pts[0].value,b:pts[pts.length-1].value});
  }
  var p1=[],p2=[],p3=[],facts=[],missing=[];
  if(nPend<vs.length)p1.push('The collection holds '+vs.length+' '+plural(vs.length,'vehicle','vehicles')+'; the '+(vs.length-nPend)+' with an estimated value total '+money(value)+(nPend?', and '+nPend+' '+plural(nPend,'is','are')+' pending':'')+'.');
  else p1.push('The collection holds '+vs.length+' '+plural(vs.length,'vehicle','vehicles')+'. '+noValueText()+'.');
  if(nB){var gn=valueB-basis;p1.push('For the '+nB+' '+plural(nB,'vehicle','vehicles')+' with a purchase price and an AI value, cost basis is '+money(basis)+', an unrealized '+(gn>=0?'gain':'loss')+' of '+money(Math.abs(gn))+' ('+pct(basis?gn/basis*100:0)+').');}
  if(noPP)missing.push('purchase price for '+noPP+' '+plural(noPP,'vehicle','vehicles'));
  if(withTrend.length){
    var sa=0,sb=0,best=null,worst=null;
    for(i=0;i<withTrend.length;i++){
      var w=withTrend[i];sa+=w.a;sb+=w.b;w.p=w.a?(w.b-w.a)/w.a*100:0;
      if(!best||w.p>best.p)best=w;if(!worst||w.p<worst.p)worst=w;
    }
    p1.push('Across '+withTrend.length+' '+plural(withTrend.length,'vehicle','vehicles')+' with dated value history, recorded values moved from '+money(sa)+' to '+money(sb)+' ('+pct(sa?(sb-sa)/sa*100:0)+').');
    if(best&&best.p>0)p1.push('Strongest: '+vName(best.v)+' ('+pct(best.p)+').');
    if(worst&&worst!==best&&worst.p<0)p1.push('Softest: '+vName(worst.v)+' ('+pct(worst.p)+').');
  }else{p1.push('There is not enough dated value history yet to show a trend.');}
  var items=reminderItems(vs),over=items.filter(function(it){return remBucket(it)==='over';}),soon=items.filter(function(it){return remBucket(it)==='soon';});
  function withVeh(it){var vv=byId(vs,it.vid);return (vv?vName(vv)+': ':'')+remPhrase(it);}
  if(over.length)p2.push(over.length+' '+plural(over.length,'item is','items are')+' overdue: '+over.slice(0,3).map(withVeh).join('; ')+'.');
  if(soon.length)p2.push(soon.length+' '+plural(soon.length,'item is','items are')+' due within 30 days: '+soon.slice(0,3).map(withVeh).join('; ')+'.');
  if(!over.length&&!soon.length)p2.push(items.length?'Nothing is due in the next 30 days.':'No renewal or service dates are on file yet, so nothing can be tracked.');
  var openRecs=getRecs().filter(function(r){return ids[r.vehicleId]&&(r.status==='open'||r.status==='accepted');}).length;
  p2.push(openRecs?openRecs+' '+plural(openRecs,'advisory is','advisories are')+' open.':'There are no open advisories.');
  p3.push(costSentence(exs,'the collection\'s'));
  var gap=0,noReg=0,noIns=0;
  for(i=0;i<vs.length;i++){
    v=vs[i];
    if(Number(v.insuredValue)>0&&aiVal(v)>Number(v.insuredValue)*1.05)gap++;
    if(!dateField(v,'regExpiry'))noReg++;
    if(!dateField(v,'insRenewal'))noIns++;
  }
  if(noReg)missing.push('registration date for '+noReg+' '+plural(noReg,'vehicle','vehicles'));
  if(noIns)missing.push('insurance renewal date for '+noIns+' '+plural(noIns,'vehicle','vehicles'));
  var ahb=avgHealth(vs);facts.push(ahb===null?'Average health score: not available':'Average health score: '+ahb+' of 100 (calculated from records)');
  var miles=0;for(i=0;i<vs.length;i++)miles+=Number(vs[i].mileage)||0;
  if(miles>0)facts.push('Combined mileage: '+fmtNum(miles));
  if(gap)facts.push(gap+' '+plural(gap,'vehicle is','vehicles are')+' valued above its insured amount');
  facts.push('Reminders tracked: '+items.length);
  return briefHTML('Collection brief',[p1.join(' '),p2.join(' '),p3.join(' ')],facts,missing);
}
// ---- vehicle history timeline (newest first) ----
function timelineEntries(v){
  var out=[],i;
  getInspections().filter(function(x){return x.vehicleId===v.id;}).forEach(function(x){
    var t=x.aiSummary||x.notes||'Preservation service completed.';
    out.push({date:String(x.date||x.createdAt||'').slice(0,10),at:x.createdAt||'',tag:'Inspection',color:GREEN_HEX,text:(t.length>150?t.slice(0,150)+'...':t)});
  });
  (v.serviceLog||[]).forEach(function(s){
    if(!s)return;
    out.push({date:String(s.date||'').slice(0,10),at:s.createdAt||'',tag:'Service',color:GREEN_HEX,text:(s.note||'Service completed')+(Number(s.mileage)>0?' at '+fmtNum(s.mileage)+' mi.':'')});
  });
  getExpenses().filter(function(e){return e.vehicleId===v.id;}).forEach(function(e){
    out.push({date:String(e.date||e.createdAt||'').slice(0,10),at:e.createdAt||'',tag:'Expense',color:GOLD_HEX,text:(e.desc||e.category||'Expense')+' / '+money(Number(e.amount)),receipt:e.image?e.id:''});
  });
  getRecs().filter(function(r){return r.vehicleId===v.id;}).forEach(function(r){
    out.push({date:String(r.date||r.createdAt||'').slice(0,10),at:r.createdAt||'',tag:'Advisory',color:r.urgency==='red'?RED_HEX:GOLD_HEX,text:r.title+' ('+(isOwner()?OWNER_STATUS_LABEL[r.status]:STATUS_LABEL[r.status])+')'});
  });
  getLogs().filter(function(l){return l.vehicleId===v.id;}).forEach(function(l){
    var t=String(l.aiOutput||'');
    out.push({date:String(l.date||l.createdAt||'').slice(0,10),at:l.createdAt||'',tag:'Note',color:GREEN_HEX,text:t.length>150?t.slice(0,150)+'...':t});
  });
  (v.valueLog||[]).forEach(function(p){
    if(!p||p.ai!==true||!parseDate(p.date)||!(Number(p.value)>0))return;
    out.push({date:String(p.date).slice(0,10),at:p.date||'',tag:'Value',color:GOLD_HEX,text:'AI value estimate '+money(Number(p.value))});
  });
  getDocs().filter(function(d){return d.vehicleId===v.id;}).forEach(function(d){
    out.push({date:String(d.date||(d.createdAt?isoLocal(new Date(d.createdAt)):'')).slice(0,10),at:d.createdAt||'',tag:'Document',color:GREEN_HEX,text:'Added '+(d.name||d.type||'document')});
  });
  (v.renewals||[]).forEach(function(r){
    if(!r)return;
    out.push({date:String(r.date||'').slice(0,10),at:r.date||'',tag:'Renewed',color:GREEN_HEX,text:(r.label||'Item')+(r.to?' renewed, next '+fmtDate(r.to):' done')});
  });
  out.sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.at||'').localeCompare(a.at||'');});
  return out;
}
function timelineHTML(v){
  var list=timelineEntries(v);
  if(!list.length)return mutedLine(isOwner()?'No history yet. Services, expenses and advisories appear here as your advisor records them.':'No history yet. Use Log service or Log expense to start this vehicle\'s record.');
  function row(e){
    return '<div class="timeline-item"><div class="timeline-date">'+esc(e.date?fmtDate(e.date):'')+'<span class="tg">'+esc(e.tag)+'</span></div><div class="timeline-body">'+esc(e.text)+(e.receipt?' <span class="link" onclick="openImageView(\'ex\',\''+jsId(e.receipt)+'\')">Receipt</span>':'')+'</div></div>';
  }
  var h=list.slice(0,6).map(row).join('');
  if(list.length>6)h+='<details class="more" style="margin-top:0;border-top:0"><summary>Earlier history ('+(list.length-6)+')</summary>'+list.slice(6).map(row).join('')+'</details>';
  return h;
}
// ---- photo attach for documents and receipts (same resize pipeline) ----
function pickPhoto(ctx){var i=document.getElementById(ctx+'-img-input');if(i){i.value='';i.click();}}
function rowReceipt(id){suppressRowClick=true;openImageView('ex',id);setTimeout(function(){suppressRowClick=false;},0);}
// ============ MODALS / TOAST / INIT ============
function openModal(id){
  var m=document.getElementById(id);
  if(m){m._open=1;m.style.display='flex';setTimeout(function(){if(m._open)m.classList.add('active');},10);}
}
function closeModal(id){
  var m=document.getElementById(id);
  if(m){m._open=0;m.classList.remove('active');setTimeout(function(){if(!m.classList.contains('active'))m.style.display='none';},200);}
}
document.addEventListener('click',function(e){
  if(e.target&&e.target.classList&&e.target.classList.contains('modal-overlay'))closeModal(e.target.id);
});
function showToast(msg,type){
  var container=document.getElementById('toast-container');if(!container)return;
  var t=document.createElement('div');
  t.className='toast'+(type==='error'?' toast-error':'');
  t.textContent=msg;
  container.appendChild(t);
  setTimeout(function(){t.classList.add('show');},10);
  setTimeout(function(){t.classList.remove('show');setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},300);},type==='error'?4200:2800);
}
var ctxFile={doc:null,ex:null};
function canRemoveExpenses(){return !!(session&&(realAdmin()||session.account.role==='owner'));}
function handleDetailPhoto(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  var v=byId(getVehicles(),currentVehicleId);
  if(!v||!canUploadPhotos(v)){showToast('Photos are not enabled for you on this vehicle.','error');input.value='';return;}
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

// ============ AUTO-IDENTIFY (photo -> year/make/model/color) ============
// Calls the identify-vehicle Edge Function. Every failure path falls back to manual entry; nothing here can block Save.
var AUTOID={state:'unknown',token:0,busy:false,filled:{}};
var AUTOID_FIELDS=[['year','v-year'],['make','v-make'],['model','v-model'],['trim','v-trim'],['color','v-color']];
var AUTOID_TXT={
  idle:'Add a photo and the year, make, model and color fill in for you. You can change anything.',
  loading:'Identifying your vehicle...',
  off:'Auto-identify is not turned on yet - enter details manually.',
  fail:'Could not identify this photo - enter details manually.',
  limit:'Daily auto-identify limit reached - enter details manually.',
  unsure:'Could not tell what this is from the photo - enter details manually.'
};
function autoIdNote(kind,text){
  var n=document.getElementById('v-autonote');if(!n)return;
  n.setAttribute('data-kind',kind);
  n.textContent='';
  if(kind==='loading'){var sp=document.createElement('span');sp.className='ai-spin evo-spin';sp.setAttribute('aria-hidden','true');sp.innerHTML=evoRingSVG()+'<i class="evo-o"></i>';n.appendChild(sp);}
  n.appendChild(document.createTextNode(text));
}
function autoIdClearTags(){
  var tags=document.querySelectorAll('#modal-add-vehicle .ai-tag');
  for(var i=0;i<tags.length;i++)if(tags[i].parentNode)tags[i].parentNode.removeChild(tags[i]);
  AUTOID.filled={};
}
function autoIdReset(){
  AUTOID.token++;AUTOID.busy=false;autoIdClearTags();
  autoIdNote(AUTOID.state==='off'?'off':'idle',AUTOID.state==='off'?AUTOID_TXT.off:AUTOID_TXT.idle);
}
function autoIdTag(id,conf){
  var el=document.getElementById(id);if(!el||!el.parentNode)return;
  var t=document.createElement('div');t.className='ai-tag';t.setAttribute('data-for',id);
  t.textContent='AI suggested - tap to edit'+(id==='v-year'||id==='v-model'?' ('+Math.round(conf*100)+'%)':'');
  el.parentNode.appendChild(t);
  AUTOID.filled[id]=true;
  if(!el.__aiBound){el.__aiBound=true;el.addEventListener('input',function(){
    var tg=document.querySelector('#modal-add-vehicle .ai-tag[data-for="'+id+'"]');if(tg&&tg.parentNode)tg.parentNode.removeChild(tg);delete AUTOID.filled[id];});}
}
function autoIdConfLabel(c){return c>=0.8?'High':(c>=0.5?'Medium':'Low');}
function autoIdWithCode(txt,code){return txt.replace(/\.$/,'')+' (code: '+code+').';}
// Maps a supabase-js functions error (+ optional JSON body from the function) to {kind,code}. Codes are non-secret diagnostics.
function autoIdClassify(err,body){
  var st=err&&err.context&&err.context.status,nm=err&&err.name,bc=body&&(body.code||body.error);
  if(nm==='Timeout')return {kind:'fail',code:'timeout',msg:'Auto-identify took too long - enter details manually.'};
  if(nm==='FunctionsFetchError')return {kind:'fail',code:'net',msg:'Could not reach auto-identify (offline, or blocked by the browser) - enter details manually.'};
  if(nm==='FunctionsRelayError')return {kind:'fail',code:'relay',msg:'Auto-identify service is not responding - enter details manually.'};
  if(st===404||st===503)return {kind:'off',code:String(st)+(bc&&bc!==String(st)?'/'+bc:'')};
  if(st===401)return {kind:'fail',code:'401',msg:'Your sign-in has expired - sign out and back in, then try again.'};
  if(st===403)return {kind:'fail',code:'403',msg:'Auto-identify is not allowed for this account - enter details manually.'};
  if(st===429)return {kind:'limit',code:'429'};
  if(st===413)return {kind:'fail',code:'413',msg:'That photo is too large to identify - enter details manually.'};
  if(st===400)return {kind:'fail',code:'400'+(bc?'/'+bc:''),msg:'Could not use this photo for auto-identify - enter details manually.'};
  if(st===502)return {kind:'fail',code:String(bc&&bc!=='upstream_error'?bc:'502'),msg:AUTOID_TXT.fail};
  return {kind:'fail',code:String(st||bc||'unknown'),msg:AUTOID_TXT.fail};
}
function autoIdShowErr(err,body){
  var c=autoIdClassify(err,body);
  if(c.kind==='off')AUTOID.state='off';
  var txt=c.msg||AUTOID_TXT[c.kind];
  autoIdNote(c.kind,autoIdWithCode(txt,c.code));
  try{console.warn('identify-vehicle failed',c.code,body&&body.detail?String(body.detail).slice(0,200):'');}catch(e){}
}
function autoIdFail(err){
  // supabase-js puts the failed Response in err.context; read its JSON body (code/detail) when possible.
  var ctx=err&&err.context,rd=null;
  try{if(ctx&&typeof ctx.json==='function')rd=ctx.json();}catch(e){rd=null;}
  return Promise.resolve(rd).then(function(b){return b;},function(){return null;});
}
function autoIdIdentify(dataUrl){
  var my=++AUTOID.token;
  autoIdClearTags();
  if(typeof sb==='undefined'||!sb||!sb.functions||typeof sb.functions.invoke!=='function'){AUTOID.state='off';autoIdNote('off',AUTOID_TXT.off);return;}
  var comma=String(dataUrl||'').indexOf(',');if(comma<0)return;
  var vin=(typeof cleanVin==='function')?cleanVin():'';
  var body={image_base64:dataUrl.slice(comma+1),mime:'image/jpeg'};
  if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))body.vin=vin;
  AUTOID.busy=true;autoIdNote('loading',AUTOID_TXT.loading);
  var call;
  try{call=Promise.resolve(sb.functions.invoke('identify-vehicle',{body:body}));}
  catch(e){call=Promise.resolve({data:null,error:{name:'FunctionsFetchError'}});}
  var timer=new Promise(function(res){setTimeout(function(){res({data:null,error:{name:'Timeout'}});},70000);});
  Promise.race([call,timer]).then(function(r){
    if(my!==AUTOID.token)return;               // photo changed or form reset meanwhile
    AUTOID.busy=false;
    var data=r&&r.data,err=r&&r.error;
    if(!err&&data&&data.error)err={context:{status:data.error==='not_configured'?503:(data.error==='rate_limited'?429:500)}};
    if(err){return autoIdFail(err).then(function(b){if(my!==AUTOID.token)return;autoIdShowErr(err,b||(data&&typeof data==='object'?data:null));});}
    if(!data||typeof data!=='object'){autoIdShowErr({name:'Parse'},{code:'parse'});return;}
    return autoIdSuccess(my,data);
  }).catch(function(){if(my!==AUTOID.token)return;AUTOID.busy=false;autoIdNote('fail',autoIdWithCode(AUTOID_TXT.fail,'exception'));});
}
function autoIdSuccess(my,data){
  (function(){
    AUTOID.state='on';
    var conf=Number(data.confidence);if(!(conf>=0))conf=0;if(conf>1)conf=conf/100;
    var vals={year:/^\d{4}$/.test(String(data.year||''))?String(data.year):'',make:cleanText(data.make,40),model:cleanText(data.model,60),trim:cleanText(data.trim,40),color:cleanText(data.color,40)};
    if(!(vals.make||vals.model||vals.year)||conf<0.25){autoIdNote('fail',AUTOID_TXT.unsure);return;}
    var n=0,i;
    for(i=0;i<AUTOID_FIELDS.length;i++){
      var k=AUTOID_FIELDS[i][0],id=AUTOID_FIELDS[i][1];
      if(vals[k]&&!val(id).trim()){setVal(id,vals[k]);autoIdTag(id,conf);n++;}
    }
    if(data.vin&&typeof vinChanged==='function'&&!val('v-vin').trim()){setVal('v-vin',cleanText(data.vin,24));vinChanged();}
    var msg=n?('AI suggested - tap any field to edit. Confidence: '+autoIdConfLabel(conf)+' ('+Math.round(conf*100)+'%).'):'Your entries were kept. Nothing was changed.';
    if(n&&conf<0.5)msg+=' Not sure - please check the year and model.';
    if(data.notes)msg+=' '+cleanText(data.notes,200);
    autoIdNote(n&&conf<0.5?'low':'done',msg);
    if(data.replica_likely===true)vrHint(cleanText(data.replica_reason,200)||'The photo suggests a replica or kit car.');
  })();
}
// ============ HEALTH SCORE (calculated on the device, $0) + AI VALUE ESTIMATE (estimate-value Edge Function) ============
// Rule: health and value are NEVER typed in by anyone. Health is computed here from the records the viewer can see.
// Value comes only from ai_estimates rows (written by the Edge Function with the service role). Nothing here writes either.
var HEALTH_KEY='evoai_health_v1';
var HEALTH_SNAP=null;
function healthSnaps(){
  if(HEALTH_SNAP)return HEALTH_SNAP;
  try{var s=JSON.parse(localStorage.getItem(HEALTH_KEY)||'{}');HEALTH_SNAP=(s&&typeof s==='object'&&!s.length)?s:{};}catch(e){HEALTH_SNAP={};}
  return HEALTH_SNAP;
}
function monthsBetween(a,b){return (b.getTime()-a.getTime())/86400000/30.44;}
function monYear(d){return d.toLocaleDateString('en-US',{month:'short',year:'numeric'});}
function plur(n,one,many){return n+' '+(n===1?one:many);}
// Pure scoring: 100 minus penalties. ctx={today:Date, docs:[], insp:[], items:[], seeRem:bool, seeDocs:bool}
function healthCompute(v,ctx){
  var pen=[],i,today=ctx.today;
  function add(pts,text,group){pen.push({pts:pts,text:text,group:group});}
  // ---- service history ----
  var recs=[];
  for(i=0;i<(v.serviceLog||[]).length;i++){var s=v.serviceLog[i];var d=parseDate(s.date);if(d)recs.push({d:d,miles:Number(s.mileage)||0});}
  for(i=0;i<ctx.insp.length;i++){var d2=parseDate(ctx.insp[i].date);if(d2)recs.push({d:d2,miles:Number(ctx.insp[i].mileageEnd)||0});}
  recs.sort(function(a,b){return a.d.getTime()-b.d.getTime();});
  var nRec=recs.length,im=svcMonths(v),mi=svcMiles(v);
  var created=v.createdAt?new Date(v.createdAt):null;
  if(!nRec){
    var fresh=created&&!isNaN(created.getTime())&&monthsBetween(created,today)<1;
    add(fresh?10:25,fresh?'No service history has been added yet.':'There is no service history on file.','service');
  }else{
    var last=recs[nRec-1],mSince=monthsBetween(last.d,today),r=0,why='';
    if(im>0&&mSince/im>r){r=mSince/im;why='The last service was '+plur(Math.max(0,Math.floor(mSince)),'month','months')+' ago (every '+im+' is planned).';}
    var lastMiles=0;for(i=nRec-1;i>=0;i--)if(recs[i].miles>0){lastMiles=recs[i].miles;break;}
    var cur=Number(v.mileage)||0;
    if(mi>0&&lastMiles>0&&cur>lastMiles&&(cur-lastMiles)/mi>r){r=(cur-lastMiles)/mi;why=fmtNum(cur-lastMiles)+' miles since the last logged service (every '+fmtNum(mi)+' is planned).';}
    if(r>1)add(r<=1.5?8:(r<=2?15:22),why,'service');
    // gaps inside the history
    var gapMax=Math.max(2*(im||6),12),gaps=0,worst=null;
    for(i=1;i<nRec;i++){var g=monthsBetween(recs[i-1].d,recs[i].d);if(g>gapMax){gaps++;if(!worst||g>worst.g)worst={g:g,a:recs[i-1].d,b:recs[i].d};}}
    if(gaps)add(Math.min(10,5*gaps),'There is a gap of '+plur(Math.round(worst.g),'month','months')+' in the service history ('+monYear(worst.a)+' to '+monYear(worst.b)+').','gap');
    var age=v.year?(today.getFullYear()-Number(v.year)):0;
    if(nRec===1&&age>=3)add(4,'Only one service record for a '+age+'-year-old car.','gap');
  }
  // ---- reminders ----
  var nItems=0;
  if(ctx.seeRem){
    var over=0;nItems=ctx.items.length;
    for(i=0;i<ctx.items.length;i++){
      var it=ctx.items[i];
      if(it.sortDays<0&&over<35){
        var p=(it.kind==='insurance'||it.kind==='registration')?15:8;p=Math.min(p,35-over);over+=p;
        add(p,remPhrase(it)+'.','overdue');
      }
    }
    if(!dateField(v,'nextServiceDate')&&!(Number(v.nextServiceMiles)>0))add(6,'No next service is scheduled.','unscheduled');
  }
  // ---- documents ----
  var nDocs=ctx.docs.length;
  if(ctx.seeDocs){
    var hasIns=!!dateField(v,'insRenewal'),hasReg=!!dateField(v,'regExpiry');
    for(i=0;i<ctx.docs.length;i++){if(ctx.docs[i].type==='insurance')hasIns=true;if(ctx.docs[i].type==='registration')hasReg=true;}
    if(!hasIns)add(8,'No insurance is on file.','docs');
    if(!hasReg)add(5,'No registration is on file.','docs');
  }
  var total=0;for(i=0;i<pen.length;i++)total+=pen[i].pts;
  var score=clamp(Math.round(100-total),0,100);
  pen.sort(function(a,b){return b.pts-a.pts;});
  var reasons=pen.slice(0,5).map(function(x){return x.text;});
  if(!reasons.length)reasons.push('Service history, reminders and documents all look current.');
  var basis='Based on '+plur(nRec,'service record','service records')+(ctx.seeRem?', '+plur(nItems,'reminder','reminders'):'')+(ctx.seeDocs?' and '+plur(nDocs,'document','documents'):'')+'.';
  if(!ctx.seeRem||!ctx.seeDocs)basis+=' Some details are not shared with you, so the score only uses what you can see.';
  return {score:score,label:score>=85?'Strong':(score>=60?'Fair':'Needs attention'),reasons:reasons,basis:basis,counts:{records:nRec,reminders:nItems,documents:nDocs}};
}
// Wrapper: gathers the viewer's data, computes, and stores {score, reasons} per account+vehicle; asOf = the day the result last CHANGED.
function healthInfo(v){
  if(!v||isArchivedVehicle(v)||!session)return null;
  if(!can(v,'view_health_estimate'))return null;
  var seeRem=can(v,'view_reminders'),seeDocs=can(v,'view_documents');
  var docs=seeDocs?getDocs().filter(function(d){return d&&d.vehicleId===v.id;}):[];
  var insp=getInspections().filter(function(x){return x&&x.vehicleId===v.id;});
  var items=seeRem?reminderItems([v]):[];
  var h=healthCompute(v,{today:new Date(),docs:docs,insp:insp,items:items,seeRem:seeRem,seeDocs:seeDocs});
  var key=myId()+':'+v.id,sig=h.score+'|'+h.reasons.join('~')+'|'+h.basis,sn=healthSnaps(),cur=sn[key];
  if(!cur||cur.sig!==sig){cur=sn[key]={sig:sig,score:h.score,asOf:todayISO()};try{localStorage.setItem(HEALTH_KEY,JSON.stringify(sn));}catch(e){}}
  h.asOf=cur.asOf;
  return h;
}
function aiHealth(v){var h=healthInfo(v);return h?h.score:null;}

// ---------- value ----------
var VALUE={state:'unknown',probed:false,busy:{},note:{}};   // state: unknown | on | off
(function(){try{var o=getUI().valueOff;if(o&&Date.now()-Number(o)<12*3600000)VALUE.state='off';}catch(e){}})();
function aiConfigured(){return VALUE.state==='on';}
function valueSetOff(on){
  VALUE.state=on?'off':'on';
  try{var u=getUI();if(on)u.valueOff=Date.now();else delete u.valueOff;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}
}
function noValueText(t){
  if(t&&t.perm===false)return 'Value is not shared with you';
  return VALUE.state==='off'?'Value estimates are not turned on yet':'No value estimates yet';
}
function valueSrcLinks(list){
  var out=[],i;
  for(i=0;i<(list||[]).length&&i<8;i++){
    var s=list[i];if(!s)continue;
    var title=esc(s.title||s.url||'source'),url=String(s.url||'');
    out.push(/^https:\/\//i.test(url)?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+title+'</a>':title);
  }
  return out.join(', ');
}
function valueDeltaText(a){
  if(!a||!(Number(a.prev)>0))return '';
  var d=Math.round(a.value-a.prev);
  if(d===0)return 'No change since '+fmtDate(a.prevAsOf);
  return (d>0?'+':'-')+money(Math.abs(d)).replace('-','')+' since '+fmtDate(a.prevAsOf);
}
function totalMoney(t){return t.nValued?money(t.value):(t.nPending?'--':money(0));}
function pendingBig(){return '<span style="font-size:.34em;color:var(--text-muted);letter-spacing:0;">'+esc(noValueText())+'</span>';}
function valueOverviewNum(t){
  if(t.nValued)return bigNum(t.value);
  if(!t.nPending)return bigNum(0);
  return '<span style="font-size:.34em;color:var(--text-muted);letter-spacing:0;">'+esc(noValueText(t))+'</span>';
}
function pendingNote(t){return (t.nPending&&t.nValued)?' <span style="color:var(--text-muted);margin-left:6px;">'+t.nPending+' without an estimate</span>':'';}
function deltaText(t){if(!t.nValued)return noValueText(t);if(!(t.basis>0))return 'Add purchase prices to see gain or loss';return (t.gain>=0?'+':'')+money(t.gain)+' ('+pct(t.pctGain)+') unrealized';}
function deltaHTML(t){
  if(!t.nValued)return t.nPending?'<span class="muted">'+(t.perm===false||VALUE.state==='off'?'':'Open a vehicle and tap Get estimate.')+'</span>':'';
  var out='<div class="est-line"><span class="est-chip">Estimate</span> range '+money(t.low)+' to '+money(t.high)+(t.nPending?' ('+t.nValued+' of '+t.nTotal+' vehicles)':'')+'</div>';
  if(t.nDelta)out+='<div class="est-line '+(t.delta<0?'neg':'')+'">'+(t.delta>=0?'+':'-')+money(Math.abs(t.delta)).replace('-','')+' since the last estimate</div>';
  if(!(t.basis>0))return out+'<span class="muted">Add purchase prices to see gain or loss</span>'+pendingNote(t);
  return out+(t.gain>=0?'<span>+'+money(t.gain)+' above cost basis</span>':'<span class="neg">'+money(t.gain)+' below cost basis</span>')+' <span style="color:var(--text-muted);margin-left:6px;">'+esc(pct(t.pctGain))+'</span>'+pendingNote(t);
}
function avgHealth(vs){var n=0,sum=0;for(var i=0;i<vs.length;i++){var h=aiHealth(vs[i]);if(h!==null){sum+=h;n++;}}return n?Math.round(sum/n):null;}
function aiValueMeta(v){
  var a=v.aiValue;if(!a)return '';
  var bits=['As of '+fmtDate(a.asOf)];
  if(Number(a.low)>0&&Number(a.high)>0)bits.push('range '+money(a.low)+' to '+money(a.high));
  var c=fmtConfidence(a.confidence);if(c)bits.push(c);
  return bits.join(' / ');
}
function valueRefreshedToday(vid){
  try{var m=getUI().valRef||{},t=Number(m[vid]);return !!(t&&Date.now()-t<86400000);}catch(e){return false;}
}
function valueButtonHTML(v,has){
  if(isArchivedVehicle(v)||!can(v,'view_value_estimate'))return '';
  var busy=!!VALUE.busy[v.id],done=valueRefreshedToday(v.id);
  var label=busy?'Working...':(has?'Refresh estimate':'Get estimate');
  return '<div style="margin-top:10px;"><button class="btn btn-sm" id="val-refresh-btn" onclick="refreshValue(\''+jsId(v.id)+'\')"'+((busy||done)?' disabled':'')+'>'+label+'</button>'+
    (done&&!busy?' <span class="doc-meta">You can refresh once a day per vehicle. Try again tomorrow.</span>':'')+'</div>';
}
// ---- calling the Edge Function ----
function valueRerender(){try{refreshCurrent();refreshDetailIfOpen();}catch(e){}}
function valueEnsureProbe(){
  if(VALUE.probed||!session||typeof sb==='undefined'||!sb||!sb.functions||typeof sb.functions.invoke!=='function')return;
  if(!canAny('view_value_estimate'))return;
  VALUE.probed=true;
  var call;try{call=Promise.resolve(sb.functions.invoke('estimate-value',{body:{probe:true}}));}catch(e){return;}
  call.then(function(r){
    var err=r&&r.error;
    if(!err){if(VALUE.state!=='off')VALUE.state='on';return;}
    var st=err.context&&err.context.status;
    if(st===404||st===503){VALUE.state='off';valueRerender();}
  },function(){});
}
function valueFail(err,body){
  var st=err&&err.context&&err.context.status,nm=err&&err.name,bc=body&&(body.error||body.code),code=String(st||nm||bc||'unknown');
  if(nm==='Timeout')return {kind:'fail',text:'The estimate took too long. Try again in a little while (code: timeout).'};
  if(nm==='FunctionsFetchError')return {kind:'fail',text:'Could not reach the estimate service (offline, or blocked by the browser) (code: net).'};
  if(st===404&&(!body||!body.error))return {kind:'off',text:''};
  if(st===503)return {kind:'off',text:''};
  if(st===401)return {kind:'fail',text:'Your sign-in has expired - sign out and back in, then try again (code: 401).'};
  if(st===403)return {kind:'fail',text:'The owner has not shared value estimates with you (code: 403).'};
  if(st===404)return {kind:'fail',text:'This vehicle could not be found (code: 404).'};
  if(st===429&&bc==='refresh_limited')return {kind:'limit',text:'This vehicle was already refreshed today. You can refresh once a day.',limit:true};
  if(st===429)return {kind:'limit',text:'Daily estimate limit reached. Try again tomorrow (code: 429).'};
  if(st===400&&bc==='incomplete_vehicle')return {kind:'fail',text:'Add the year, make and model first, then try again.'};
  if(st===502)return {kind:'fail',text:'Could not get an estimate right now. Try again later (code: '+String(body&&body.code||'502')+').'};
  return {kind:'fail',text:'Could not get an estimate right now (code: '+code+').'};
}
function refreshValue(vid){
  var v=byId(getVehicles(),vid);if(!v||isArchivedVehicle(v))return;
  if(!can(v,'view_value_estimate')){showToast('The owner has not shared value estimates with you.','error');return;}
  if(VALUE.busy[vid]||valueRefreshedToday(vid))return;
  if(typeof sb==='undefined'||!sb||!sb.functions||typeof sb.functions.invoke!=='function'){valueSetOff(true);valueRerender();return;}
  VALUE.busy[vid]=true;delete VALUE.note[vid];valueRerender();
  var call;try{call=Promise.resolve(sb.functions.invoke('estimate-value',{body:valBody25(vid)}));}
  catch(e){call=Promise.resolve({data:null,error:{name:'FunctionsFetchError'}});}
  var timer=new Promise(function(res){setTimeout(function(){res({data:null,error:{name:'Timeout'}});},150000);});
  function done(){VALUE.busy[vid]=false;}
  Promise.race([call,timer]).then(function(r){
    var data=r&&r.data,err=r&&r.error;
    if(!err&&data&&data.error)err={context:{status:data.error==='not_enabled'||data.error==='not_configured'?503:500}};
    if(err)return autoIdFail(err).then(function(b){
      done();var f=valueFail(err,b||(data&&typeof data==='object'?data:null));
      if(f.kind==='off'){valueSetOff(true);}
      else{VALUE.note[vid]={kind:f.kind,text:f.text};if(f.limit){try{var u=getUI(),m=u.valRef||{};m[vid]=Date.now();u.valRef=m;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}}}
      valueRerender();
    });
    done();
    if(data&&data.skipped){valueRerender();return;}
    if(!data||typeof data!=='object'||!(Number(data.mid)>0)){
      VALUE.note[vid]={kind:'fail',text:(data&&data.notes)?String(data.notes).slice(0,200):'No reliable market prices were found for this vehicle yet.'};valueRerender();return;
    }
    valueSetOff(false);
    try{var u2=getUI(),m2=u2.valRef||{};m2[vid]=Date.now();u2.valRef=m2;localStorage.setItem('evoai_ui',JSON.stringify(u2));}catch(e){}
    VALUE.note[vid]={kind:'done',text:data.cached?'Updated from this week\'s market data for this model, adjusted for your mileage and condition.':'Updated with fresh market prices.'};
    return reloadAll(true).then(valueRerender);
  }).catch(function(){done();VALUE.note[vid]={kind:'fail',text:'Could not get an estimate right now (code: exception).'};valueRerender();});
}
function srcObjList(a,max){
  var out=[],i;
  if(Object.prototype.toString.call(a)!=='[object Array]')return out;
  for(i=0;i<a.length&&out.length<max;i++){
    var x=a[i];if(!x)continue;
    if(typeof x==='string'){x={title:x,url:''};}
    var t=String(x.title||x.name||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,120),u=String(x.url||x.uri||'').trim().slice(0,600);
    if(u&&!/^https:\/\//i.test(u))u='';
    if(t||u)out.push({title:t||u,url:u});
  }
  return out;
}
// ===== remove client (admin / tech who created it), owner My team, ended-access notices (needs migration_005b) =====
var SHEET_EL=null;
function sheetClose(){
  var o=SHEET_EL;if(!o)return;SHEET_EL=null;o.classList.remove('on');
  setTimeout(function(){if(o.parentNode)o.parentNode.removeChild(o);},220);
}
function sheetOpen(o){
  sheetClose();
  var ov=document.createElement('div');ov.className='sheet-ov';ov.id='evo-sheet';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
  var h='<div class="sheet"><h3>'+esc(o.title)+'</h3>'+(o.sub?'<div class="sheet-sub">'+esc(o.sub)+'</div>':'')+(o.html||'')+'<div class="sheet-btns" id="evo-sheet-btns"></div></div>';
  ov.innerHTML=h;
  ov.addEventListener('click',function(e){if(e.target===ov)sheetClose();});
  document.body.appendChild(ov);SHEET_EL=ov;
  sheetButtons(o.buttons||[]);
  setTimeout(function(){ov.classList.add('on');},10);
}
function sheetButtons(list){
  var b=document.getElementById('evo-sheet-btns');if(!b)return;b.innerHTML='';
  list.forEach(function(x){
    var el=document.createElement('button');el.type='button';el.className='btn '+(x.cls||'btn-ghost');el.textContent=x.label;if(x.id)el.id=x.id;if(x.disabled)el.disabled=true;
    el.addEventListener('click',function(){if(!el.disabled)x.fn();});b.appendChild(el);
  });
}
function sheetBody(html){var s=SHEET_EL&&SHEET_EL.querySelector('.sheet-sub');var d=SHEET_EL&&SHEET_EL.querySelector('#sheet-dyn');if(d)d.innerHTML=html;}
var UNDO_TIMER=null;
function showUndo(msg,fn,ms){
  hideUndo();
  var b=document.createElement('div');b.id='undo-bar';b.setAttribute('role','status');
  b.innerHTML='<span>'+esc(msg)+'</span><button type="button" class="btn btn-sm btn-gold" id="undo-btn">Undo</button>';
  document.body.appendChild(b);
  document.getElementById('undo-btn').addEventListener('click',function(){hideUndo();fn();});
  UNDO_TIMER=setTimeout(hideUndo,ms||10000);
}
function hideUndo(){if(UNDO_TIMER){clearTimeout(UNDO_TIMER);UNDO_TIMER=null;}var b=document.getElementById('undo-bar');if(b&&b.parentNode)b.parentNode.removeChild(b);}
function pluralN(n,w,pl){return n+' '+(n===1?w:(pl||w+'s'));}
var TRASH_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>';
// who may remove (the database re-checks every time)
function clientRemovable(c){return !!(c&&c.managed&&!c.claimed&&(realAdmin()||(isRealTech()&&c.managedBy===myId())));}
function rpcRow(r){if(r.error)throw r.error;return Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;}
// ---- swipe-left rows ----
var SWIPE_W=96;
function swipeCloseAll(except){var l=document.querySelectorAll('.swipe-fg.open'),i;for(i=0;i<l.length;i++)if(l[i]!==except){l[i].classList.remove('open');l[i].style.transform='';}}
function decorateClientRows(root){
  var rows=root.querySelectorAll('.client-row[onclick^="openClientDetail"]'),i;
  for(i=0;i<rows.length;i++){
    (function(row){
      var m=/openClientDetail\('([A-Za-z0-9_-]+)'\)/.exec(row.getAttribute('onclick')||'');if(!m)return;
      var id=m[1],c=byId(C.clients,id);
      if(!c||!(realAdmin()||clientRemovable(c)))return;
      var wrap=document.createElement('div');wrap.className='swipe-wrap';wrap.setAttribute('data-client',id);
      var act=document.createElement('button');act.type='button';act.className='swipe-act';act.setAttribute('aria-label','Remove '+c.name);act.innerHTML=TRASH_SVG+'<span>Remove</span>';
      act.addEventListener('click',function(e){e.stopPropagation();swipeCloseAll();openRemoveClient(id);});
      row.parentNode.insertBefore(wrap,row);wrap.appendChild(act);
      var fg=document.createElement('div');fg.className='swipe-fg';wrap.appendChild(fg);fg.appendChild(row);
      var tb=document.createElement('button');tb.type='button';tb.className='swipe-trash';tb.title='Remove client';tb.setAttribute('aria-label','Remove '+c.name);tb.innerHTML=TRASH_SVG;
      tb.addEventListener('click',function(e){e.stopPropagation();openRemoveClient(id);});row.appendChild(tb);
      var x0=0,y0=0,dx=0,mode='',base=0;
      fg.addEventListener('touchstart',function(e){var t=e.touches[0];x0=t.clientX;y0=t.clientY;dx=0;mode='';base=fg.classList.contains('open')?-SWIPE_W:0;swipeCloseAll(fg);},{passive:true});
      fg.addEventListener('touchmove',function(e){
        var t=e.touches[0],ddx=t.clientX-x0,ddy=t.clientY-y0;
        if(!mode){if(Math.abs(ddx)>8&&Math.abs(ddx)>Math.abs(ddy)*1.4)mode='h';else if(Math.abs(ddy)>8)mode='v';}
        if(mode!=='h')return;
        dx=ddx;fg.classList.add('drag');fg.style.transform='translateX('+Math.max(-SWIPE_W-24,Math.min(0,base+dx))+'px)';
      },{passive:true});
      fg.addEventListener('touchend',function(){
        fg.classList.remove('drag');if(mode!=='h')return;
        var pos=base+dx;
        if(pos<-SWIPE_W/2){fg.classList.add('open');fg.style.transform='translateX(-'+SWIPE_W+'px)';}else{fg.classList.remove('open');fg.style.transform='';}
        fg._swiped=Date.now();
      });
      row.addEventListener('click',function(e){
        if(fg._swiped&&Date.now()-fg._swiped<350){e.stopImmediatePropagation();e.preventDefault();return;}
        if(fg.classList.contains('open')){e.stopImmediatePropagation();e.preventDefault();swipeCloseAll();}
      },true);
    })(rows[i]);
  }
}
// ---- remove client: confirmation sheet ----
function removalLines(s,mine){
  var l=[];
  if(s.vehicles>0)l.push('<li>'+pluralN(s.vehicles,'vehicle')+' will be archived and hidden from every list. Nothing is erased.</li>');
  else l.push('<li>This client has no vehicles yet.</li>');
  var kept=[];
  if(s.records)kept.push(pluralN(s.records,'service record'));if(s.documents)kept.push(pluralN(s.documents,'document'));
  if(s.photos)kept.push(pluralN(s.photos,'photo'));if(s.expenses)kept.push(pluralN(s.expenses,'expense'));if(s.reminders)kept.push(pluralN(s.reminders,'reminder'));
  if(kept.length)l.push('<li>Kept, but hidden with the vehicles: '+esc(kept.join(', '))+'.</li>');
  if(s.open_invites>0)l.push('<li>'+pluralN(s.open_invites,'open invite code')+' will stop working. The client cannot sign up and pick up this data until you restore them.</li>');
  l.push('<li>You can undo for 10 seconds right after, or later under Removed clients on the Clients page.</li>');
  l.push(mine?'<li>Only an admin can erase a client permanently.</li>':'<li>To erase permanently you will find the option under Removed clients. You must type the client name.</li>');
  return '<ul>'+l.join('')+'</ul>';
}
async function openRemoveClient(id){
  var c=byId(C.clients,id);if(!c)return;
  sheetOpen({title:'Remove '+c.name+'?',sub:'Checking what is stored...',html:'<div id="sheet-dyn"></div>',buttons:[{label:'Cancel',fn:sheetClose}]});
  var s;
  try{s=rpcRow(await sb.rpc('client_removal_summary',{p_id:id}));}
  catch(e){
    sheetBody('<ul><li class="warn">'+esc(rpcMissing(e)?'Removing clients is not switched on yet (a database update is pending).':friendlyError(e))+'</li></ul>');
    if(SHEET_EL)SHEET_EL.querySelector('.sheet-sub').textContent='';return;
  }
  if(!SHEET_EL)return;
  var sub=SHEET_EL.querySelector('.sheet-sub');
  if(!s.removable){
    sub.textContent='';
    sheetBody('<ul><li class="warn">'+esc(s.reason==='has_own_account'?(c.name+' has their own EvoAI account. Their cars and records belong to them, so they cannot be removed here.'):'You can only remove clients that you created yourself.')+'</li>'+(s.reason==='has_own_account'?'<li>To end a tech\'s access instead, open the client and use Remove access.</li>':'')+'</ul>');
    sheetButtons([{label:'Close',fn:sheetClose}]);return;
  }
  sub.textContent='This archives the client. It does not erase anything yet.';
  sheetBody(removalLines(s,!realAdmin()));
  sheetButtons([{label:'Cancel',fn:sheetClose},{label:'Remove client',cls:'btn-solid-danger',id:'rm-confirm',fn:function(){doRemoveClient(id,c.name);}}]);
}
async function doRemoveClient(id,name){
  var b=document.getElementById('rm-confirm');if(b){b.disabled=true;b.textContent='Removing...';}
  try{
    rpcRow(await sb.rpc('archive_client',{p_id:id}));
    sheetClose();
    if(currentClientId===id){currentClientId=null;}
    await loadAll();
    if(document.getElementById('page-client-detail')&&document.getElementById('page-client-detail').classList.contains('active'))showPage('clients');else refreshCurrent();
    showUndo(name+' was removed.',function(){undoRemoveClient(id,name);},10000);
  }catch(e){sheetClose();showToast(friendlyError(e),'error');}
}
async function undoRemoveClient(id,name){
  try{rpcRow(await sb.rpc('restore_client',{p_id:id}));await loadAll();refreshCurrent();showToast((name||'Client')+' is back','success');}
  catch(e){showToast(friendlyError(e),'error');}
}
// ---- removed clients: restore, admin permanent delete ----
function removedClientsHTML(){
  var rm=C.removed||[];if(!rm.length)return '';
  var h='<div class="removed-sec"><div class="sh"><h2>Removed clients</h2></div><div class="doc-meta" style="margin-bottom:6px;">Hidden from your lists. Restore any time'+(realAdmin()?', or erase permanently.':'.')+'</div>';
  rm.forEach(function(p){
    h+='<div class="access-row"><div><div style="font-size:19px;font-weight:300;">'+esc(displayName(p))+'</div><div class="doc-meta">Removed '+esc(fmtDate(String(p.archived_at).slice(0,10)))+'</div></div><div class="flex gap-2"><button class="btn btn-sm" onclick="undoRemoveClient(\''+jsId(p.id)+'\',\''+jsId(displayName(p)).slice(0,0)+'\')">Restore</button>'+(realAdmin()?'<button class="btn btn-sm btn-danger" onclick="openPurgeClient(\''+jsId(p.id)+'\')">Delete permanently</button>':'')+'</div></div>';
  });
  return h+'</div>';
}
async function openPurgeClient(id){
  var p=C.profiles[id];if(!p||!realAdmin())return;var name=displayName(p);
  sheetOpen({title:'Erase '+name+' permanently?',sub:'Checking what is stored...',html:'<div id="sheet-dyn"></div>',buttons:[{label:'Cancel',fn:sheetClose}]});
  var s;try{s=rpcRow(await sb.rpc('client_removal_summary',{p_id:id}));}catch(e){sheetBody('<ul><li class="warn">'+esc(friendlyError(e))+'</li></ul>');return;}
  if(!SHEET_EL)return;
  SHEET_EL.querySelector('.sheet-sub').textContent='';
  var l=['<li class="warn">This cannot be undone. There is no backup to restore from in the app.</li>',
    '<li class="warn">Permanently erased: '+esc([pluralN(s.vehicles,'vehicle'),pluralN(s.records,'service record'),pluralN(s.documents,'document'),pluralN(s.photos,'photo'),pluralN(s.expenses,'expense'),pluralN(s.reminders,'reminder')].join(', '))+', and every photo and document file.</li>',
    '<li>The client record and tech access are deleted too.</li></ul><div class="doc-meta" style="margin-top:10px;">Type the client name exactly to confirm:</div><input type="text" id="purge-name" autocomplete="off" autocapitalize="none" placeholder="'+esc(name)+'" aria-label="Type the client name">'];
  sheetBody('<ul>'+l.join(''));
  var inp=document.getElementById('purge-name');
  sheetButtons([{label:'Cancel',fn:sheetClose},{label:'Erase permanently',cls:'btn-solid-danger',id:'purge-confirm',disabled:true,fn:function(){doPurgeClient(id,name);}}]);
  inp.addEventListener('input',function(){var b=document.getElementById('purge-confirm');if(b)b.disabled=(inp.value.trim()!==String(name).trim()||!inp.value.trim());});
}
async function doPurgeClient(id,name){
  var typed=val('purge-name'),b=document.getElementById('purge-confirm');if(b){b.disabled=true;b.textContent='Erasing...';}
  try{
    var pr=await sb.rpc('client_storage_paths',{p_id:id});if(pr.error)throw pr.error;
    var by={},i,rows=pr.data||[];
    for(i=0;i<rows.length;i++){(by[rows[i].bucket]=by[rows[i].bucket]||[]).push(rows[i].path);}
    for(var bk in by){if(!by.hasOwnProperty(bk))continue;
      for(i=0;i<by[bk].length;i+=50){var rr=await sb.storage.from(bk).remove(by[bk].slice(i,i+50));if(rr&&rr.error)throw rr.error;}}
    rpcRow(await sb.rpc('purge_client',{p_id:id,p_confirm_name:typed}));
    sheetClose();await loadAll();refreshCurrent();showToast(name+' was erased permanently','success');
  }catch(e){sheetClose();showToast(/name_mismatch/.test(String(e&&e.message))?'The name did not match. Nothing was erased.':friendlyError(e),'error');}
}
function deleteClientBtnHTML(c){
  if(!clientRemovable(c))return '';
  return '<div style="margin-top:12px;"><button class="btn btn-sm btn-danger" id="cd-delete-btn" onclick="openRemoveClient(\''+jsId(c.id)+'\')">Delete client</button><div class="doc-meta" style="margin-top:6px;">You created this client, so you can delete it. You will see exactly what is affected first.</div></div>';
}
// ---- tech: access ended notices ----
var ENDED_AT=0;
function endedDismissed(){try{return JSON.parse(localStorage.getItem('evoai_ended_dismissed')||'[]');}catch(e){return [];}}
function endedKey(n){return String(n.owner_name)+'|'+String(n.revoked_at);}
function dismissEnded(k){var d=endedDismissed();d.push(k);try{localStorage.setItem('evoai_ended_dismissed',JSON.stringify(d.slice(-50)));}catch(e){}renderEndedNotices();}
function renderEndedNotices(){
  var el=document.getElementById('ended-notices');if(!el)return;
  var d=endedDismissed(),list=(C.ended||[]).filter(function(n){return d.indexOf(endedKey(n))<0;});
  el.innerHTML=list.map(function(n){var k=endedKey(n);
    return '<div class="ended-note"><div><strong>Access ended.</strong> '+esc(n.ended_by==='owner'?(n.owner_name+' ended your access'):'Your access to '+n.owner_name+' was ended')+' on '+esc(fmtDate(String(n.revoked_at).slice(0,10)))+'. Their cars and records are no longer visible to you. Anything you entered stays with the car.</div><button class="btn btn-sm btn-ghost" onclick="dismissEnded(\''+jsId(k.replace(/[^A-Za-z0-9_-]/g,'_'))+'\')" data-k="'+esc(k)+'">OK</button></div>';
  }).join('');
  var bs=el.querySelectorAll('button[data-k]'),i;
  for(i=0;i<bs.length;i++)(function(b){b.onclick=function(){dismissEnded(b.getAttribute('data-k'));};})(bs[i]);
}
async function loadEnded(){
  if(!sb||!session||!isRealTech())return;
  if(Date.now()-ENDED_AT<30000&&C.ended){renderEndedNotices();return;}
  ENDED_AT=Date.now();
  try{var r=await sb.rpc('list_ended_access');if(r.error)throw r.error;C.ended=r.data||[];}catch(e){C.ended=C.ended||[];}
  renderEndedNotices();
}
// ---- owner: My team ----
function teamGroups(oid){
  var rows=C.access.filter(function(a){return a.owner_id===oid&&a.status==='active';}),g={},order=[];
  rows.forEach(function(a){if(!g[a.tech_id]){g[a.tech_id]={techId:a.tech_id,grants:[]};order.push(a.tech_id);}g[a.tech_id].grants.push(a);});
  return order.map(function(k){return g[k];});
}
function renderAccess(){
  var oid=ownerClientId()||myId();
  var groups=teamGroups(oid);
  var myVeh=C.vehicles.filter(function(v){return v.clientId===oid&&!v.archived;});
  var h='';
  h+='<div class="sh first"><h2>Your team</h2></div>';
  if(!groups.length)h+=emptyCard('Nobody has access to your collection yet. Invite your tech or advisor below. You choose exactly what they can see.');
  groups.forEach(function(g){
    var tp=C.profiles[g.techId],tn=displayName(tp),tid=jsId(g.techId);
    var scopes=g.grants.map(function(a){var v=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null;return a.vehicle_id?('Only '+(v?vFull(v):'one vehicle')):'All your vehicles';});
    h+='<div class="team-card" data-team="'+tid+'"><div class="team-head"><div><div style="font-size:22px;font-weight:300;">'+esc(tn)+'</div><div class="doc-meta">'+esc((tp&&tp.email)||'')+(tp&&tp.business_name?' / '+esc(tp.business_name):'')+'</div><div class="doc-meta">'+esc(scopes.join(', '))+'</div><span class="team-pill">Tech / advisor</span></div><button class="btn btn-danger btn-sm" onclick="openRemoveMember(\''+tid+'\')">Remove access</button></div>';
    g.grants.forEach(function(a){
    var veh=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null,aid=jsId(a.id);
    var scope=PM_SCOPE[a.id]||'';
    if(scope&&a.vehicle_id&&scope!==a.vehicle_id)scope='';
    var pr=permRowFor(a.id,scope),eff=pr.eff||{};
    var covered=a.vehicle_id?(veh?[veh]:[]):myVeh;
    h+='<details class="more" id="pm-'+aid+'"><summary>Permissions'+(g.grants.length>1?' - '+esc(a.vehicle_id?(veh?vFull(veh):'one vehicle'):'all vehicles'):'')+'</summary><div style="padding-top:10px;">';
    if(covered.length>1||(covered.length===1&&!a.vehicle_id)){
      h+='<div class="input-group"><label>Settings apply to</label><select onchange="pmScopeChange(\''+aid+'\',this)"><option value="">All vehicles (default)</option>'+covered.map(function(v){return '<option value="'+esc(v.id)+'"'+(scope===v.id?' selected':'')+'>'+esc(vName(v))+' only'+(permRowFor(a.id,v.id).ov?' (custom)':'')+'</option>';}).join('')+'</select></div>';
    }
    if(scope&&pr.ov)h+='<div class="doc-meta" style="margin-bottom:8px;">This vehicle has its own settings. <span class="link" onclick="resetPermOverride(\''+aid+'\',\''+jsId(scope)+'\')">Reset to default</span></div>';
    PERM_LABELS.forEach(function(gr){
      h+='<div class="lab" style="margin:14px 0 6px;">'+esc(gr[1])+'</div>';
      gr[2].forEach(function(p){
        h+='<label class="tgl"><input type="checkbox" id="pm-'+aid+'-'+p[0]+'"'+(eff[p[0]]?' checked':'')+' onchange="togglePerm(\''+aid+'\',\''+p[0]+'\',this.checked,\''+jsId(scope)+'\')"><span class="tgl-ui"></span><span class="tgl-t">'+esc(p[1])+'</span></label>';
      });
    });
    h+='<div class="doc-meta" style="margin-top:12px;">Insurance and title documents that you upload are always private to you. Changes apply immediately.</div></div></details>';
    });
    h+='</div>';
  });
  var open=C.invites.filter(function(i){return (i.kind==='tech_owner'||i.kind==='tech_vehicle')&&inviteActive(i)&&i.created_by===myId();});
  h+='<div class="sh"><h2>Invite a tech or advisor</h2></div><div style="max-width:420px;">';
  h+='<div class="input-group"><label>Their email</label><input type="email" id="inv-email" maxlength="120" placeholder="tech@email.com" autocapitalize="none" inputmode="email"></div>';
  h+='<div class="input-group"><label>Access to</label><select id="inv-scope"><option value="">All my vehicles</option>'+myVeh.map(function(v){return '<option value="'+esc(v.id)+'">'+esc(vFull(v))+' only</option>';}).join('')+'</select></div>';
  h+='<button class="btn btn-gold btn-sm" onclick="createInviteFromAccess()">Create invite link and code</button><div class="doc-meta" style="margin-top:8px;">The code only works for this email address. You share it yourself by message, email or copy. After they join you can fine-tune their permissions here.</div></div>';
  if(open.length){
    h+='<div class="sh"><h2>Waiting to join</h2></div>'+open.map(function(i){
      var v=i.vehicle_id?byId(C.vehicles,i.vehicle_id):null;
      return '<div class="access-row"><div><div class="doc-meta">'+esc(i.email||'Any email')+' / '+esc(v?vFull(v):'All vehicles')+' / expires '+esc(fmtDate(String(i.expires_at).slice(0,10)))+'</div>'+inviteRowExtras(i.id,i.email)+'</div><button class="btn btn-sm" onclick="revokeInviteById(\''+jsId(i.id)+'\')">Cancel invite</button></div>';
    }).join('');
  }
  elHTML('access-body',h);coRender();
  revealMissingCodes(open.map(function(i){return i.id;}));
}
function openRemoveMember(techId){
  var oid=ownerClientId()||myId(),g=teamGroups(oid).filter(function(x){return x.techId===techId;})[0];
  if(!g)return;
  var tp=C.profiles[techId],tn=displayName(tp);
  var all=g.grants.some(function(a){return !a.vehicle_id;});
  var cars=C.vehicles.filter(function(v){return v.clientId===oid&&!v.archived;});
  var scopeTxt=all?pluralN(cars.length,'vehicle'):g.grants.map(function(a){var v=byId(C.vehicles,a.vehicle_id);return v?vFull(v):'a vehicle';}).join(', ');
  var html='<ul><li>'+esc(tn)+' loses access right away to '+esc(all?('all of your vehicles ('+scopeTxt+')'):scopeTxt)+': service history, documents, photos, reminders and anything else you had shared.</li>'+
    '<li>Nothing is deleted. All records stay with your cars, including anything '+esc(tn)+' added.</li>'+
    '<li>'+esc(tn)+' will see "Access ended" in their app.</li>'+
    '<li>Any unused invite sent to '+esc((tp&&tp.email)||'their email')+' is cancelled. You can invite them again any time.</li></ul>';
  sheetOpen({title:'Remove '+tn+' from your team?',html:html,buttons:[{label:'Cancel',fn:sheetClose},{label:'Remove access',cls:'btn-solid-danger',id:'rm-member',fn:function(){doRemoveMember(techId,tn);}}]});
}
async function doRemoveMember(techId,name){
  var b=document.getElementById('rm-member');if(b){b.disabled=true;b.textContent='Removing...';}
  try{
    rpcRow(await sb.rpc('remove_team_member',{p_tech_id:techId}));
    sheetClose();await loadAll();renderAccess();showToast(name+' no longer has access','success');
  }catch(e){sheetClose();showToast(/no_active_access/.test(String(e&&e.message))?'That access had already ended.':friendlyError(e),'error');await loadAll();renderAccess();}
}
// ============ HERO TITLE RULE + VEHICLE PORTFOLIO (cinematic gallery, lightbox, add photos) ============
// Hero card rule used everywhere a vehicle hero card exists: Nickname = heading, Year Make Model = sub-heading (same font).
// No nickname: Year Make Model is the heading only.
function heroHead(v){var n=v&&v.nickname?String(v.nickname).trim():'';return n||vFull(v);}
function heroSubHTML(v,cls){var n=v&&v.nickname?String(v.nickname).trim():'';return n?'<div class="'+(cls||'hero-sub')+'">'+esc(vFull(v))+'</div>':'';}
function vehicleCardHTML(v,extra){
  var arch=isArchivedVehicle(v),sub='';
  if(isAdvisor()){var cl=byId(getClients(),v.clientId);if(cl&&getClients().length>1)sub=cl.name;}
  var hasV=aiVal(v)!==null;
  return '<div class="item'+(arch?' arch':'')+'" onclick="openVehicleDetail(\''+jsId(v.id)+'\')">'+carFrame(v)+
    '<div class="cap"><div style="min-width:0;"><div class="nm">'+esc(heroHead(v))+'</div>'+heroSubHTML(v,'ymm')+(sub?'<div class="tt">'+esc(sub)+'</div>':'')+'</div>'+
    '<div><div class="vl"'+(hasV?'':' style="color:var(--text-muted);font-size:17px;"')+'>'+(hasV?money(aiVal(v)):'No estimate')+'</div>'+cardStatusLine(v)+'</div></div>'+(extra?'<div class="meta2">'+extra+'</div>':'')+'</div>';
}

var PF_TAGS=['Exterior','Interior','Engine','Wheels','Details','Documents','Work','Other'];
var PF_NOTICE='Portfolio needs one backend update - Appy is applying it';
var PF={ready:null,probing:null,cache:{},queue:{},qt:0,signCalls:0,signedPaths:0,v:null,tag:'',list:[],idx:0,focusId:'',io:null,tio:null,loaded:{},add:null,lb:null};
var PF_RM=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function pfRM(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function pfIcon(n){
  var P={plus:'<path d="M12 5v14M5 12h14"/>',star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',l:'<path d="M15 5l-7 7 7 7"/>',r:'<path d="M9 5l7 7-7 7"/>',zoom:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'};
  return '<svg viewBox="0 0 24 24" fill="'+(n==='star'?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||'')+'</svg>';
}
function pfProbe(){
  if(PF.ready!==null)return Promise.resolve(PF.ready);
  if(PF.probing)return PF.probing;
  PF.probing=Promise.resolve(sb.from('vehicle_photos').select('thumb_path,display_path,tag').limit(1)).then(function(r){
    var e=r&&r.error;
    if(e&&(e.code==='42703'||e.code==='PGRST204'||/does not exist|schema cache|could not find/i.test(String(e.message||''))))PF.ready=false;
    else if(e&&/failed to fetch|network|load failed/i.test(String(e.message||'')))PF.ready=null;
    else PF.ready=true;
    PF.probing=null;return PF.ready;
  },function(){PF.probing=null;return null;});
  return PF.probing;
}
function pfCanView(v){return !!(v&&!isArchivedVehicle(v)&&can(v,'view_photos'));}
function pfCanAdd(v){return pfCanView(v)&&PF.ready!==false;}
function pfCanModify(v,p){return !!(v&&p&&(canEditVehicle(v)||(p.by===myId()&&canUploadPhotos(v))));}
// ---- batched, cached signing (1 hour URLs, refreshed after 50 min) ----
function pfSign(path){
  if(!path)return Promise.resolve(null);
  var c=PF.cache[path];if(c&&c.exp>Date.now())return c.p;
  var p=new Promise(function(res){(PF.queue[path]=PF.queue[path]||[]).push(res);if(!PF.qt)PF.qt=setTimeout(pfFlush,25);});
  PF.cache[path]={p:p,exp:Date.now()+50*60000};return p;
}
function pfFlush(){
  PF.qt=0;var q=PF.queue;PF.queue={};var paths=Object.keys(q);if(!paths.length)return;
  PF.signCalls++;PF.signedPaths+=paths.length;
  signedMap('vehicle-photos',paths).then(function(m){paths.forEach(function(p){var u=m[p]||null;if(!u)delete PF.cache[p];q[p].forEach(function(r){r(u);});});});
}
function pfDispPath(p){return p.disp||p.path;}
function pfThumbPath(p){return p.thumb||p.disp||p.path;}
function pfFmtDate(s){var d=s?new Date(s):null;return d&&!isNaN(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';}
function pfPhotos(v){return (v._photos||[]).slice();}
function pfFiltered(v){var all=pfPhotos(v);return PF.tag?all.filter(function(p){return p.tag===PF.tag;}):all;}
function pfDisconnect(){
  if(PF.io){PF.io.disconnect();PF.io=null;}
  if(PF.tio){PF.tio.disconnect();PF.tio=null;}
  PF.loaded={};
}
// ---- vehicle page integration ----
function pfHeroHTML(v){
  if(!pfCanView(v)||!pfPhotos(v).length)return carFrame(v)+(pfCanView(v)?'<div id="pfg-empty-cta"></div>':'');
  return '<div class="pfg" id="pfg"><div class="pfg-hero" id="pfg-hero"></div></div>';
}
function pfAfterDetail(v){
  PF.v=v;pfDisconnect();
  var ctl=document.getElementById('vd-pf');
  if(!pfCanView(v)){if(ctl)ctl.innerHTML='';return;}
  if(PF.tag&&!pfPhotos(v).some(function(p){return p.tag===PF.tag;}))PF.tag='';
  PF.list=pfFiltered(v);
  PF.idx=0;
  if(PF.focusId){for(var i=0;i<PF.list.length;i++)if(PF.list[i].id===PF.focusId){PF.idx=i;break;}PF.focusId='';}
  else{for(var j=0;j<PF.list.length;j++)if(PF.list[j].isCover){PF.idx=j;break;}}
  if(pfPhotos(v).length){pfRenderHero();}
  pfRenderControls();
  pfProbe().then(function(ok){if(PF.v===v&&ok===false)pfRenderControls();});
}
function pfRenderHero(){
  var host=document.getElementById('pfg-hero');if(!host)return;
  var v=PF.v,list=PF.list,h='';
  h+='<div class="pfg-track" id="pfg-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Portfolio photos">';
  for(var i=0;i<list.length;i++)h+='<div class="pfg-slide" data-i="'+i+'" role="group" aria-roledescription="slide" aria-label="Photo '+(i+1)+' of '+list.length+'"><span class="pfg-sk"></span></div>';
  h+='</div><div class="pfg-vig" aria-hidden="true"></div>';
  h+='<span class="pfg-cover glx" id="pfg-cover" style="display:none">'+pfIcon('star')+'Cover</span>';
  h+='<div class="pfg-count glx" id="pfg-count" aria-live="polite"></div>';
  h+='<div class="pfg-dots" id="pfg-dots" aria-hidden="true"></div>';
  h+='<button class="pfg-zoom glx" id="pfg-zoom" type="button" onclick="pfOpenLightbox(PF.idx)" aria-label="Open photo full screen">'+pfIcon('zoom')+'<span>Tap to zoom</span></button>';
  h+='<button class="pfg-nav pfg-prev glx" type="button" aria-label="Previous photo" onclick="pfStep(-1)">'+pfIcon('l')+'</button><button class="pfg-nav pfg-next glx" type="button" aria-label="Next photo" onclick="pfStep(1)">'+pfIcon('r')+'</button>';
  host.innerHTML=h;
  var tr=document.getElementById('pfg-track');
  tr.addEventListener('click',function(e){var s=e.target.closest&&e.target.closest('.pfg-slide');if(s&&s.querySelector('img'))pfOpenLightbox(+s.getAttribute('data-i'));});
  tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){e.preventDefault();pfStep(1);}else if(e.key==='ArrowLeft'){e.preventDefault();pfStep(-1);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();pfOpenLightbox(PF.idx);}});
  if('IntersectionObserver' in window){
    PF.io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting&&en.intersectionRatio>=0.6){var i=+en.target.getAttribute('data-i');if(i!==PF.idx||!PF.loaded[i])pfSetCur(i,true);}});},{root:tr,threshold:[0.6]});
    var sl=tr.querySelectorAll('.pfg-slide');for(var k=0;k<sl.length;k++)PF.io.observe(sl[k]);
  }
  pfSetCur(PF.idx,false);
  if(PF.idx>0)requestAnimationFrame(function(){tr.scrollLeft=PF.idx*tr.clientWidth;});
}
function pfSlideLoad(i){
  var tr=document.getElementById('pfg-track');if(!tr||i<0||i>=PF.list.length)return;
  var s=tr.children[i];if(!s||s.querySelector('img'))return;
  var p=PF.list[i],vid=PF.v&&PF.v.id;
  pfSign(pfDispPath(p)).then(function(u){
    if(!u||!s.parentNode||s.querySelector('img')||Math.abs(i-PF.idx)>1)return;
    var im=new Image();im.alt=(p.tag?p.tag+' photo':'Vehicle photo')+' '+(i+1);im.decoding='async';im.draggable=false;
    im.onload=function(){im.classList.add('ld');};im.src=u;s.appendChild(im);
  });
}
function pfSlideUnload(i){
  var tr=document.getElementById('pfg-track');if(!tr)return;var s=tr.children[i];if(!s)return;
  var im=s.querySelector('img');if(im){im.removeAttribute('src');s.removeChild(im);}
}
function pfSetCur(i,fromScroll){
  var n=PF.list.length;if(!n)return;
  i=Math.max(0,Math.min(n-1,i));PF.idx=i;PF.loaded={};PF.loaded[i]=1;
  for(var k=0;k<n;k++){if(Math.abs(k-i)<=1)pfSlideLoad(k);else pfSlideUnload(k);}
  var p=PF.list[i];
  var ct=document.getElementById('pfg-count');if(ct)ct.innerHTML='<b>'+(i+1)+'</b> / '+n;
  var cv=document.getElementById('pfg-cover');if(cv)cv.style.display=p&&p.isCover?'':'none';
  var dots=document.getElementById('pfg-dots');
  if(dots){var h='',a=Math.max(0,Math.min(n-7,i-3)),b=Math.min(n,a+7);for(var d=a;d<b;d++)h+='<i'+(d===i?' class="on"':'')+'></i>';dots.innerHTML=h;}
  var pv=document.getElementById('pfg-prev'),nx=document.getElementById('pfg-next');
  var tr=document.getElementById('pfg-track');
  if(tr&&!fromScroll)tr.scrollLeft=i*tr.clientWidth;
  pfRenderMeta();
  var st=document.getElementById('pfg-strip');
  if(st){var ths=st.querySelectorAll('.pfg-th[data-i]');for(var t=0;t<ths.length;t++){var on=+ths[t].getAttribute('data-i')===i;ths[t].classList.toggle('on',on);if(on){ths[t].setAttribute('aria-current','true');var l=ths[t].offsetLeft-(st.clientWidth-ths[t].offsetWidth)/2;try{st.scrollTo({left:Math.max(0,l),behavior:pfRM()||!fromScroll?'auto':'smooth'});}catch(e){st.scrollLeft=Math.max(0,l);}}else ths[t].removeAttribute('aria-current');}}
}
function pfStep(d){
  var n=PF.list.length;if(!n)return;
  var i=Math.max(0,Math.min(n-1,PF.idx+d));if(i===PF.idx)return;
  var tr=document.getElementById('pfg-track');
  if(tr){try{tr.scrollTo({left:i*tr.clientWidth,behavior:pfRM()?'auto':'smooth'});}catch(e){tr.scrollLeft=i*tr.clientWidth;}}
  pfSetCur(i,true);
}
function pfGoto(i){
  var tr=document.getElementById('pfg-track');
  if(tr){try{tr.scrollTo({left:i*tr.clientWidth,behavior:pfRM()?'auto':'smooth'});}catch(e){tr.scrollLeft=i*tr.clientWidth;}}
  pfSetCur(i,true);
  var h=document.getElementById('pfg-hero');if(h&&h.getBoundingClientRect().top<0&&h.scrollIntoView){try{h.scrollIntoView({block:'nearest'});}catch(e){}}
}
function pfRenderMeta(){
  var el=document.getElementById('pfg-meta');if(!el)return;
  var v=PF.v,p=PF.list[PF.idx];
  if(!p){el.innerHTML='';return;}
  var who='';try{var pr=C.profiles&&C.profiles[p.by];who=pr?displayName(pr):'';}catch(e){}
  var bits=[pfFmtDate(p.at),who?'by '+who:''].filter(function(x){return x;});
  var h='<div class="pfg-mrow"><div class="pfg-mt"><b>'+esc(p.tag||'Untagged')+'</b>'+(bits.length?'<span>'+esc(bits.join(' / '))+'</span>':'')+'</div><span class="pfg-hint">Tap photo to zoom</span></div>';
  if(p.caption)h+='<div class="pfg-cap">'+esc(p.caption)+'</div>';
  var acts='';
  if(canEditVehicle(v)&&!p.isCover)acts+='<button class="pfg-btn" type="button" onclick="pfMakeCover(\''+jsId(p.id)+'\')">'+pfIcon('star')+'Set as cover</button>';
  if(pfCanModify(v,p)&&PF.ready!==false)acts+='<label class="pfg-btn pfg-sel"><span class="vh">Tag</span><select aria-label="Tag for this photo" onchange="pfSetTag(\''+jsId(p.id)+'\',this.value)"><option value="">Untagged</option>'+PF_TAGS.map(function(t){return '<option'+(p.tag===t?' selected':'')+'>'+t+'</option>';}).join('')+'</select></label>';
  if(p.tag==='Documents'&&can(v,'can_add_documents'))acts+='<button class="pfg-btn pt-docbtn" type="button" onclick="ptScanPhoto(\''+jsId(p.id)+'\')">Scan as document?</button>';
  if(pfCanModify(v,p))acts+='<button class="pfg-btn pfg-del" type="button" onclick="pfDelete(\''+jsId(p.id)+'\')">'+pfIcon('trash')+'Delete</button>';
  el.innerHTML=h+(acts?'<div class="pfg-acts">'+acts+'</div>':'');
}
function pfRenderControls(){
  var host=document.getElementById('vd-pf');if(!host)return;
  var v=PF.v;if(!v||!pfCanView(v)){host.innerHTML='';return;}
  var all=pfPhotos(v),n=all.length,h='<div class="pfg-ctl" id="pfg-ctl">';
  var line=n?(n+' photo'+(n===1?'':'s')):'No photos yet';
  var ready=PF.ready;
  h+='<div class="pfg-head"><div class="pfg-sum">'+esc(line)+'</div>';
  if(ready===false)h+='</div><div class="pfg-notice" role="status">'+esc(PF_NOTICE)+'</div>';
  else h+='<button class="pfg-addbtn" id="pfg-addtop" type="button" onclick="pfOpenAdd()" aria-label="Add photos">'+pfIcon('plus')+'<span>Add photos</span></button></div>';
  if(n){
    var cnt={};all.forEach(function(p){if(p.tag)cnt[p.tag]=(cnt[p.tag]||0)+1;});
    h+='<div class="pfg-chips" role="tablist" aria-label="Filter photos by tag"><button class="pfg-chip'+(PF.tag?'':' on')+'" type="button" role="tab" aria-selected="'+(PF.tag?'false':'true')+'" onclick="pfFilter(\'\')">All <em>'+n+'</em></button>';
    PF_TAGS.forEach(function(t){if(cnt[t])h+='<button class="pfg-chip'+(PF.tag===t?' on':'')+'" type="button" role="tab" aria-selected="'+(PF.tag===t?'true':'false')+'" onclick="pfFilter(\''+t+'\')">'+t+' <em>'+cnt[t]+'</em></button>';});
    h+='</div><div id="pfg-meta" class="pfg-meta"></div><div class="pfg-strip" id="pfg-strip" role="list" aria-label="Photo filmstrip">';
    PF.list.forEach(function(p,i){h+='<button class="pfg-th" type="button" role="listitem" data-i="'+i+'" data-p="'+esc(pfThumbPath(p))+'" aria-label="Show photo '+(i+1)+(p.tag?', '+esc(p.tag):'')+'" onclick="pfGoto('+i+')"><span class="pfg-sk"></span></button>';});
    if(ready!==false)h+='<button class="pfg-th pfg-plus" type="button" onclick="pfOpenAdd()" aria-label="Add photos">'+pfIcon('plus')+'</button>';
    h+='</div>';
  }else if(ready!==false){
    h+='<div class="pfg-empty">Build a portfolio: add exterior, interior, engine, detail and work photos.<div><button class="pfg-addbtn big" type="button" onclick="pfOpenAdd()">'+pfIcon('plus')+'<span>Add photos</span></button></div></div>';
  }
  h+='</div>';
  host.innerHTML=h;
  var st=document.getElementById('pfg-strip');
  if(st&&'IntersectionObserver' in window){
    PF.tio=new IntersectionObserver(function(es){
      es.forEach(function(en){if(!en.isIntersecting)return;var b=en.target;PF.tio.unobserve(b);var path=b.getAttribute('data-p');
        pfSign(path).then(function(u){if(!u||!b.parentNode)return;var im=new Image();im.alt='';im.decoding='async';im.draggable=false;im.onload=function(){im.classList.add('ld');};im.src=u;b.appendChild(im);});});
    },{root:st,rootMargin:'0px 240px 0px 240px',threshold:0.01});
    var bs=st.querySelectorAll('.pfg-th[data-p]');for(var k=0;k<bs.length;k++)PF.tio.observe(bs[k]);
  }
  if(n)pfSetCur(Math.min(PF.idx,PF.list.length-1),true);
}
function pfFilter(tag){
  PF.tag=tag||'';PF.list=pfFiltered(PF.v);PF.idx=0;
  pfDisconnect();pfRenderHero();pfRenderControls();
}
// ---- actions on one photo ----
async function pfMakeCover(pid){
  var v=PF.v;if(!v||!canEditVehicle(v))return;
  var prev=(v._photos||[]).filter(function(p){return p.isCover;})[0];
  try{
    chk(await sb.from('vehicle_photos').update({is_cover:false}).eq('vehicle_id',v.id).eq('is_cover',true));
    try{chk(await sb.from('vehicle_photos').update({is_cover:true}).eq('id',pid));}
    catch(e){if(prev)await sb.from('vehicle_photos').update({is_cover:true}).eq('id',prev.id);throw e;}
    PF.focusId=pid;await loadAll();refreshCurrent();refreshDetailIfOpen();showToast('Cover photo updated','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
async function pfDelete(pid){
  var v=PF.v,p=v&&(v._photos||[]).filter(function(x){return x.id===pid;})[0];
  if(!p||!pfCanModify(v,p))return;
  if(!window.confirm('Delete this photo? This cannot be undone.'))return;
  try{
    chk(await sb.from('vehicle_photos').delete().eq('id',pid));
    [p.path,p.thumb,p.disp].forEach(function(x){if(x)removeObject('vehicle-photos',x);});
    if(p.isCover&&canEditVehicle(v)){
      var nx=(v._photos||[]).filter(function(x){return x.id!==pid;})[0];
      if(nx){try{await sb.from('vehicle_photos').update({is_cover:true}).eq('id',nx.id);}catch(e2){}}
    }
    var i=PF.idx;PF.focusId='';
    await loadAll();refreshCurrent();refreshDetailIfOpen();showToast('Photo deleted','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
// legacy single-photo entry points (the vehicle page "Photo" button) now open the portfolio flow
function photosHTML(v){return '';}
function pickDetailPhoto(){pfOpenAdd();}
// ---- lightbox (pinch / double-tap / wheel zoom, swipe, keyboard) ----
function pfOpenLightbox(i){
  var v=PF.v;if(!v||!PF.list.length)return;
  var L=PF.lb;if(L)pfCloseLightbox(true);
  var el=document.createElement('div');el.className='pfl';el.id='pfl';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Photo viewer');
  el.innerHTML='<div class="pfl-stage" id="pfl-stage"><img id="pfl-img" alt="" draggable="false"></div>'+
    '<button class="pfl-x glx" type="button" aria-label="Close viewer" id="pfl-x">'+pfIcon('x')+'</button><div class="pfl-count glx" id="pfl-count" aria-live="polite"></div>'+
    '<button class="pfl-nav pfl-prev glx" type="button" aria-label="Previous photo" id="pfl-prev">'+pfIcon('l')+'</button><button class="pfl-nav pfl-next glx" type="button" aria-label="Next photo" id="pfl-next">'+pfIcon('r')+'</button>'+
    '<div class="pfl-cap" id="pfl-cap"></div><div class="pfl-hint" id="pfl-hint">Pinch or double-tap to zoom</div>';
  document.body.appendChild(el);
  L=PF.lb={el:el,i:i,s:1,x:0,y:0,ptr:{},d0:0,s0:1,mx:0,my:0,sx:0,sy:0,last:0,swipe:null,opener:document.activeElement,gen:0};
  var st=el.querySelector('#pfl-stage'),im=el.querySelector('#pfl-img');
  function apply(anim){im.style.transition=anim&&!pfRM()?'transform .22s ease':'none';im.style.transform='translate3d('+L.x+'px,'+L.y+'px,0) scale('+L.s+')';L.el.classList.toggle('zoomed',L.s>1.02);}
  function clampPan(){var r=st.getBoundingClientRect(),w=im.clientWidth*L.s,h=im.clientHeight*L.s,mx=Math.max(0,(w-r.width)/2),my=Math.max(0,(h-r.height)/2);L.x=Math.max(-mx,Math.min(mx,L.x));L.y=Math.max(-my,Math.min(my,L.y));}
  function reset(){L.s=1;L.x=0;L.y=0;apply(false);}
  function zoomAt(ns,cx,cy){ns=Math.max(1,Math.min(5,ns));var r=st.getBoundingClientRect(),ox=cx-(r.left+r.width/2),oy=cy-(r.top+r.height/2),k=ns/L.s;L.x=ox-(ox-L.x)*k;L.y=oy-(oy-L.y)*k;L.s=ns;if(ns<=1.001){L.s=1;L.x=0;L.y=0;}clampPan();apply(false);}
  function show(n,dir){
    var len=PF.list.length;if(n<0||n>=len)return;L.i=n;L.gen++;var g=L.gen,p=PF.list[n];
    reset();el.querySelector('#pfl-count').innerHTML='<b>'+(n+1)+'</b> / '+len;
    el.querySelector('#pfl-cap').innerHTML=esc(p.tag||'')+(p.caption?' <span>'+esc(p.caption)+'</span>':'');
    el.querySelector('#pfl-prev').style.visibility=n>0?'':'hidden';el.querySelector('#pfl-next').style.visibility=n<len-1?'':'hidden';
    im.classList.remove('ld');im.alt=(p.tag||'Vehicle')+' photo '+(n+1)+' of '+len;
    pfSign(pfDispPath(p)).then(function(u){if(g!==L.gen||!u)return;im.onload=function(){im.classList.add('ld');};im.src=u;});
    [n-1,n+1].forEach(function(k){if(k>=0&&k<len)pfSign(pfDispPath(PF.list[k])).then(function(u){if(u){var pre=new Image();pre.src=u;}});});
    PF.idx=n;
  }
  L.show=show;
  st.addEventListener('pointerdown',function(e){
    try{st.setPointerCapture(e.pointerId);}catch(x){}
    L.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(L.ptr);
    if(ids.length===2){var a=L.ptr[ids[0]],b=L.ptr[ids[1]];L.d0=Math.hypot(a.x-b.x,a.y-b.y)||1;L.s0=L.s;L.swipe=null;}
    else{L.sx=e.clientX;L.sy=e.clientY;L.mx=L.x;L.my=L.y;L.swipe={x:e.clientX,y:e.clientY,t:e.timeStamp,moved:0};}
    var h=el.querySelector('#pfl-hint');if(h)h.style.opacity=0;
  });
  st.addEventListener('pointermove',function(e){
    if(!L.ptr[e.pointerId])return;L.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(L.ptr);
    if(ids.length>=2){var a=L.ptr[ids[0]],b=L.ptr[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y)||1;zoomAt(L.s0*d/L.d0,(a.x+b.x)/2,(a.y+b.y)/2);return;}
    if(!L.swipe)return;var dx=e.clientX-L.sx,dy=e.clientY-L.sy;L.swipe.moved=Math.max(L.swipe.moved,Math.hypot(dx,dy));
    if(L.s>1.02){L.x=L.mx+dx;L.y=L.my+dy;clampPan();apply(false);}
    else{im.style.transition='none';im.style.transform='translate3d('+(Math.abs(dx)>Math.abs(dy)?dx:0)+'px,'+(Math.abs(dy)>Math.abs(dx)&&dy>0?dy:0)+'px,0)';}
  });
  function up(e){
    if(!L.ptr[e.pointerId])return;delete L.ptr[e.pointerId];
    var sw=L.swipe;
    if(Object.keys(L.ptr).length===1){var rest=L.ptr[Object.keys(L.ptr)[0]];L.sx=rest.x;L.sy=rest.y;L.mx=L.x;L.my=L.y;L.swipe={x:rest.x,y:rest.y,t:e.timeStamp,moved:99};return;}
    if(Object.keys(L.ptr).length>0||!sw)return;
    L.swipe=null;
    var dx=e.clientX-sw.x,dy=e.clientY-sw.y;
    if(sw.moved<8){ // tap: double tap toggles zoom
      if(e.timeStamp-L.last<320){L.last=0;if(L.s>1.02){L.s=1;L.x=0;L.y=0;apply(true);}else zoomAt(2.6,e.clientX,e.clientY);}else L.last=e.timeStamp;
      return;
    }
    if(L.s>1.02){apply(false);return;}
    if(dy>90&&Math.abs(dy)>Math.abs(dx)){pfCloseLightbox();return;}
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){var n=L.i+(dx<0?1:-1);if(n>=0&&n<PF.list.length){show(n);return;}}
    L.x=0;L.y=0;apply(true);
  }
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  st.addEventListener('wheel',function(e){e.preventDefault();var dy=e.deltaY*(e.deltaMode===1?16:1);zoomAt(L.s*Math.exp(-Math.max(-400,Math.min(400,dy))*0.002),e.clientX,e.clientY);},{passive:false});
  el.querySelector('#pfl-x').addEventListener('click',function(){pfCloseLightbox();});
  el.querySelector('#pfl-prev').addEventListener('click',function(){show(L.i-1);});
  el.querySelector('#pfl-next').addEventListener('click',function(){show(L.i+1);});
  L.key=function(e){
    if(e.key==='Escape'){e.preventDefault();pfCloseLightbox();}
    else if(e.key==='ArrowRight'){e.preventDefault();show(L.i+1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();show(L.i-1);}
    else if(e.key==='+'||e.key==='='){var r=st.getBoundingClientRect();zoomAt(L.s*1.3,r.left+r.width/2,r.top+r.height/2);}
    else if(e.key==='-'){var r2=st.getBoundingClientRect();zoomAt(L.s/1.3,r2.left+r2.width/2,r2.top+r2.height/2);}
    else if(e.key==='Tab'){e.preventDefault();}
  };
  document.addEventListener('keydown',L.key,true);
  document.body.classList.add('pfl-open');
  show(i);
  setTimeout(function(){el.classList.add('on');var x=el.querySelector('#pfl-x');if(x)x.focus();},10);
}
function pfCloseLightbox(quick){
  var L=PF.lb;if(!L)return;PF.lb=null;
  document.removeEventListener('keydown',L.key,true);document.body.classList.remove('pfl-open');
  var el=L.el;el.classList.remove('on');
  var idx=L.i;
  setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},quick||pfRM()?0:200);
  if(PF.v&&PF.list.length&&document.getElementById('pfg-track'))pfGoto(Math.min(idx,PF.list.length-1));
  try{if(L.opener&&L.opener.focus)L.opener.focus();}catch(e){}
}
// ---- client side image processing (canvas; original colors, no filters, no grading) ----
function pfDecode(file){
  function viaImg(){return new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){res({src:im,w:im.naturalWidth,h:im.naturalHeight,done:function(){URL.revokeObjectURL(u);}});};im.onerror=function(){URL.revokeObjectURL(u);rej(new Error('decode'));};im.src=u;});}
  if(window.createImageBitmap){return createImageBitmap(file,{imageOrientation:'from-image'}).then(function(b){return {src:b,w:b.width,h:b.height,done:function(){if(b.close)b.close();}};},viaImg);}
  return viaImg();
}
function pfEncode(d,max,q,bg){
  return new Promise(function(res,rej){
    var sc=Math.min(1,max/Math.max(d.w,d.h)),w=Math.max(1,Math.round(d.w*sc)),h=Math.max(1,Math.round(d.h*sc));
    var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    x.fillStyle=bg||'#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(d.src,0,0,w,h);
    c.toBlob(function(b){c.width=c.height=0;b?res(b):rej(new Error('encode'));},'image/jpeg',q);
  });
}
async function pfProcess(file){
  if(!file||!/^image\//.test(file.type||'')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''))throw new Error('notimage');
  var d=await pfDecode(file).catch(function(){throw new Error('decode');});
  try{
    var keep=(file.type==='image/jpeg'&&file.size<=14*1024*1024);
    var orig=keep?file:null;
    if(!orig){var PF_ORIG_MAX=14*1024*1024,dm=Math.min(4096,Math.max(d.w,d.h));
      outer:for(var s=0;s<6;s++){for(var qi=0,Q=[0.92,0.85,0.75,0.65];qi<Q.length;qi++){var b=await pfEncode(d,dm,Q[qi]);if(b.size<=PF_ORIG_MAX){orig=b;break outer;}}dm=Math.round(dm*0.75);}
      if(!orig)orig=await pfEncode(d,1600,0.8);}
    var disp=await pfEncode(d,1600,0.86),th=await pfEncode(d,400,0.8);
    return {orig:orig,disp:disp,thumb:th};
  }finally{d.done();}
}
// ---- add photos flow ----
function pfOpenAdd(){
  var v=PF.v||byId(getVehicles(),currentVehicleId);if(!v)return;
  PF.v=v;
  if(!pfCanView(v)){showToast('Photos are not enabled for you on this vehicle.','error');return;}
  pfProbe().then(function(ok){
    if(ok===false){showToast(PF_NOTICE,'error');pfRenderControls();return;}
    pfShowAdd(v);
  });
}
function pfCloseAdd(quick){
  var A=PF.add;if(!A)return;PF.add=null;
  document.removeEventListener('keydown',A.key);document.body.classList.remove('pfa-open');
  A.items.forEach(function(it){if(it.url)URL.revokeObjectURL(it.url);});
  A.el.classList.remove('on');var el=A.el;setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},quick||pfRM()?0:200);
  try{if(A.opener&&A.opener.focus&&!quick)A.opener.focus();}catch(e){}
}
function pfErr(e){
  var m=String((e&&(e.message||e))||'');
  if(m==='notimage')return 'not a photo';if(m==='toolarge')return 'file is too large';
  if(m==='decode')return 'could not read this photo (try a JPEG)';
  return friendlyError(e);
}

// ============ COLLECTION ROUNDABOUT (3D horizontal ring of hero cards) ============
var WHL_ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function wheelCardHTML(v,i){
  var src=imgSrc(v),np=pfCanView(v)?(v._photos||[]).length:0,lv=v.lastServiceDate?fmtDate(v.lastServiceDate):'';
  var nick=v.nickname&&String(v.nickname).trim();
  var cl='';if(isAdvisor()){var c=byId(getClients(),v.clientId);if(c&&getClients().length>1)cl=c.name;}
  var label=heroHead(v)+(nick?', '+vFull(v):'')+(np?', '+np+' photo'+(np===1?'':'s'):'')+(lv?', last visit '+lv:'');
  return '<article class="whl-card" role="option" aria-selected="false" data-i="'+i+'" data-id="'+esc(v.id)+'" aria-label="'+esc(label)+'">'+
    '<div class="whl-ph vig">'+(src?'<img alt="" draggable="false" decoding="async" data-src="'+esc(src)+'">':'<div class="whl-none" role="img" aria-label="Photo pending">'+CAR_SVG+'<em>Photo pending</em></div>')+
    (np?'<span class="whl-badge glx">'+np+' photo'+(np===1?'':'s')+'</span>':'')+(lv?'<span class="whl-badge whl-lvchip glx">Last visit <b>'+esc(lv)+'</b></span>':'')+'</div>'+
    '<div class="whl-info"><div class="whl-r1"><div class="whl-t"><h3 class="whl-nm'+(nick?'':' ymm-only')+'">'+esc(heroHead(v))+'</h3>'+heroSubHTML(v,'whl-ymm')+(cl?'<div class="whl-cl">'+esc(cl)+'</div>':'')+'</div>'+'</div>'+
    '<div class="whl-op"><span>Open vehicle</span><i>'+WHL_ARROW+'</i></div></div><div class="whl-dim"></div></article>';
}
function wheelHTML(vehicles,key){
  var h='<div class="whl" data-key="'+esc(key)+'"><div class="whl-head"><div class="whl-pos glx" aria-live="polite"><b>01</b><span> / '+String(vehicles.length).padStart(2,'0')+'</span></div>'+
    whlHint()+'</div>'+
    '<div class="whl-stage" tabindex="0" role="listbox" aria-orientation="horizontal" aria-label="Vehicle collection. Use arrow keys to turn, Enter to open."><div class="whl-ring">'+
    vehicles.map(function(v,i){return wheelCardHTML(v,i);}).join('')+'</div><div class="whl-guide" aria-hidden="true"></div></div>';
  if(vehicles.length>1)h+='<div class="whl-nav"><button type="button" class="whl-arrow glx" aria-label="Previous vehicle" data-d="-1">'+pfIcon('l')+'</button><button type="button" class="whl-arrow glx" aria-label="Next vehicle" data-d="1">'+pfIcon('r')+'</button></div>';
  return h+'</div>';
}
function wheelMount(hostId,vehicles){
  var host=document.getElementById(hostId);if(!host)return;
  if(host._wheel){host._wheel.destroy();host._wheel=null;}
  var root=host.querySelector('.whl');
  host.classList.toggle('wheel-host',!!root);host.classList.toggle('car-grid',!root);
  if(!root)return;
  host._wheel=wheelInit(root,vehicles);
}
function wheelInit(root,vehicles){
  var N=vehicles.length,stage=root.querySelector('.whl-stage'),ring=root.querySelector('.whl-ring'),guide=root.querySelector('.whl-guide'),posEl=root.querySelector('.whl-pos b');
  var cards=[].slice.call(root.querySelectorAll('.whl-card')),dots=[];
  var G={},pos=0,target=0,vel=0,raf=0,last=0,active=-1,dragging=false,p0=null,moved=0,samples=[],alive=true,ro=null,wt=0,wlock=0;
  var rm=function(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);};
  function mod(a,n){return ((a%n)+n)%n;}
  function pad(n){return String(n).padStart(2,'0');}
  if(window.__WHEEL_START__!==undefined&&N>1){pos=target=Math.min(N-1,window.__WHEEL_START__);}
  if(N>1){for(var d=0;d<N;d++){var di=document.createElement('i');di.className='whl-dot';guide.appendChild(di);dots.push(di);}}
  function load(c){if(c._ld)return;c._ld=1;var im=c.querySelector('img');if(im){im.onload=function(){im.classList.add('ld');};im.src=im.getAttribute('data-src');}}
  function layout(){
    var W=stage.clientWidth;if(!W)return;
    var wide=W>=700,cw=wide?Math.min(320,Math.round(W*.28)):Math.min(240,W-150);cw=Math.max(170,cw);
    var ph=Math.round(cw*(wide?.9:1.02));
    root.style.setProperty('--cw',cw+'px');root.style.setProperty('--ph',ph+'px');
    var ch=cards[0].offsetHeight,SH=ch+64;
    stage.style.height=SH+'px';
    var cy=(SH-44)/2;
    cards.forEach(function(c){c.style.left=((W-cw)/2)+'px';c.style.top=(cy-ch/2)+'px';});
    G={W:W,SH:SH,cw:cw,ch:ch,cy:cy,step:(wide?34:38)*Math.PI/180,R:Math.max(220,cw*(wide?1.5:1.02)),persp:wide?980:720,drag:Math.max(150,cw*.75)};
    ring.style.perspective=G.persp+'px';
    if(N>1){
      var fy=cy+ch/2+20,rx=W*(wide?.36:.46),ry=22;G.fx=W/2;G.rx=rx;G.ry=ry;
      guide.style.cssText='left:0;top:'+(fy-ry)+'px;width:'+W+'px;height:'+(ry*2)+'px';
      var old=guide.querySelector('svg');if(old)guide.removeChild(old);
      guide.insertAdjacentHTML('afterbegin','<svg width="'+W+'" height="'+(ry*2)+'"><defs><linearGradient id="whlg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2F0EB" stop-opacity="0"/><stop offset=".5" stop-color="#F2F0EB" stop-opacity=".2"/><stop offset="1" stop-color="#F2F0EB" stop-opacity="0"/></linearGradient><radialGradient id="whls" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="'+(W/2)+'" cy="'+ry+'" rx="'+(cw*.62)+'" ry="'+(ry*.55)+'" fill="url(#whls)"/><ellipse cx="'+(W/2)+'" cy="'+ry+'" rx="'+rx+'" ry="'+(ry-1)+'" stroke="url(#whlg)" stroke-width="1" fill="none"/></svg>');
    }
    render(true);
  }
  function render(force){
    if(!G.W)return;
    for(var i=0;i<N;i++){
      var c=cards[i],d=i-pos;d=mod(d+N/2,N)-N/2;var a=d*G.step,ad=Math.abs(d),vis=N===1||Math.abs(a)<Math.PI*.5;
      if(!vis){if(c._v!==0||force){c.style.opacity=0;c.style.visibility='hidden';c._v=0;c.style.pointerEvents='none';}if(dots[i])dots[i].style.opacity=0;continue;}
      if(c._v!==1){c.style.visibility='';c._v=1;c.style.pointerEvents='';}
      if(ad<2.6)load(c);
      var tf;
      if(N===1||Math.abs(d)<.0005)tf='translate3d(0,0,0)';
      else tf='translate3d('+(G.R*Math.sin(a)).toFixed(2)+'px,0,'+(G.R*(Math.cos(a)-1)).toFixed(2)+'px) rotateY('+(a*180/Math.PI*.85).toFixed(3)+'deg)';
      c.style.transform=tf;
      var edge=N===1?1:Math.max(0,Math.min(1,(Math.PI*.5-Math.abs(a))/.32));
      c.style.opacity=edge.toFixed(3);
      c._dim=c._dim||c.querySelector('.whl-dim');c._dim.style.opacity=Math.min(.86,ad*.45).toFixed(3);
      c.style.zIndex=100-Math.round(ad*10);
      if(dots[i]){dots[i].style.transform='translate3d('+(G.fx+G.rx*Math.sin(a*1.05)).toFixed(1)+'px,'+(G.ry+(G.ry-1)*Math.cos(a*1.05)).toFixed(1)+'px,0)';dots[i].style.opacity=edge.toFixed(3);}
    }
    var ai=mod(Math.round(pos),N);
    if(ai!==active){
      if(active>=0){cards[active].classList.remove('front');cards[active].setAttribute('aria-selected','false');if(dots[active])dots[active].classList.remove('on');}
      active=ai;cards[ai].classList.add('front');cards[ai].setAttribute('aria-selected','true');if(dots[ai])dots[ai].classList.add('on');
      if(posEl)posEl.textContent=pad(ai+1);stage.setAttribute('aria-activedescendant','');
    }
  }
  function tick(now){
    var dt=Math.min(.034,(now-(last||now))/1000)||.016;last=now;
    if(!dragging){var k=165,cc=2*Math.sqrt(k)*.92;vel+=((target-pos)*k-vel*cc)*dt;pos+=vel*dt;
      if(Math.abs(target-pos)<.0004&&Math.abs(vel)<.003){pos=target;vel=0;render();raf=0;last=0;normalize();stage.classList.remove('mv');return;}}
    render();raf=requestAnimationFrame(tick);
  }
  function kick(){
    if(!alive)return;
    if(rm()&&!dragging){pos=target;vel=0;render();normalize();return;}
    stage.classList.add('mv');if(!raf){last=0;raf=requestAnimationFrame(tick);}
  }
  function normalize(){var r=Math.round(pos/N)*N;if(r){pos-=r;target-=r;}}
  function go(n){if(N<2)return;target=Math.round(target)+n;kick();}
  function openCard(i){var v=vehicles[i];if(v)openVehicleDetail(v.id);}
  stage.addEventListener('pointerdown',function(e){
    if(e.button||N<1)return;
    dragging=true;moved=0;try{stage.setPointerCapture(e.pointerId);}catch(x){}
    stage.classList.add('drag','mv');
    p0={x:e.clientX,y:e.clientY,pos:pos,t:e.timeStamp,card:e.target.closest&&e.target.closest('.whl-card')};samples=[{t:e.timeStamp,p:pos}];vel=0;
    try{stage.focus({preventScroll:true});}catch(x2){}
  });
  stage.addEventListener('pointermove',function(e){
    if(!dragging)return;var dx=e.clientX-p0.x,dy=e.clientY-p0.y;moved=Math.max(moved,Math.hypot(dx,dy));
    if(N<2)return;pos=p0.pos-dx/G.drag;samples.push({t:e.timeStamp,p:pos});if(samples.length>6)samples.shift();
    if(!raf)raf=requestAnimationFrame(tick);
  });
  function end(e){
    if(!dragging)return;dragging=false;stage.classList.remove('drag');
    var s0=samples[0],s1=samples[samples.length-1],dt=(s1.t-s0.t)/1000;
    vel=dt>0.008&&(e.timeStamp-s1.t)<80?(s1.p-s0.p)/dt:0;vel=Math.max(-14,Math.min(14,vel));
    if(moved<7&&p0&&p0.card&&e.type!=='pointercancel'){
      var i=+p0.card.getAttribute('data-i'),d=mod(i-pos+N/2,N)-N/2;
      if(Math.abs(d)<.5){target=Math.round(pos);kick();openCard(i);return;}
      target=Math.round(pos+d);vel=0;kick();return;
    }
    target=Math.round(pos+vel*.22);target=Math.max(Math.round(pos)-3,Math.min(Math.round(pos)+3,target));kick();
  }
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('wheel',function(e){
    if(N<2)return;
    var horiz=Math.abs(e.deltaX)>Math.abs(e.deltaY);
    if(!horiz&&!e.shiftKey&&document.activeElement!==stage)return;   // vertical wheel scrolls the page unless the roundabout has focus
    var dd=(horiz?e.deltaX:(e.deltaY||e.deltaX))*(e.deltaMode===1?16:e.deltaMode===2?400:1);
    e.preventDefault();
    var notch=e.deltaMode!==0||(Math.abs(dd)>=48&&Number.isInteger(dd)&&!e.deltaX);
    if(notch){if(e.timeStamp-wlock<170)return;wlock=e.timeStamp;go(Math.sign(dd));return;}
    stage.classList.add('mv');dragging=true;pos+=dd/(G.drag*1.6);target=pos;vel=0;if(!raf)raf=requestAnimationFrame(tick);
    clearTimeout(wt);wt=setTimeout(function(){dragging=false;target=Math.round(pos);kick();},110);
  },{passive:false});
  stage.addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'){e.preventDefault();go(1);}
    else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){e.preventDefault();go(-1);}
    else if(k==='Home'){e.preventDefault();target=Math.round(pos)-mod(Math.round(pos),N);kick();}
    else if(k==='End'){e.preventDefault();target=Math.round(pos)-mod(Math.round(pos),N)+N-1;kick();}
    else if(k==='Enter'||k===' '){e.preventDefault();openCard(active);}
  });
  [].slice.call(root.querySelectorAll('.whl-arrow')).forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-d'));});});
  if(window.ResizeObserver){ro=new ResizeObserver(function(){if(alive)layout();});ro.observe(stage);}else window.addEventListener('resize',layout);
  layout();
  var api={destroy:function(){alive=false;if(raf)cancelAnimationFrame(raf);raf=0;if(ro)ro.disconnect();window.removeEventListener('resize',layout);},go:go,index:function(){return active;},pos:function(){return pos;}};
  root._api=api;
  return api;
}
// ============ dz: client title + edge swipe-back ============
function ctitleName(n){
  n=String(n||'').trim();if(!n)return 'My Collection';
  var small={'&':1,'and':1,'of':1,'the':1,'de':1};
  return n.split(/\s+/).map(function(w,i){var l=w.toLowerCase();if(i&&small[l])return l;return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ');
}
function ctitleHTML(n){
  var t=ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  return '<div class="ctitle-eyebrow">'+(coll?'The Private Collection':'Private Collection')+'</div><h2 class="ctitle-name">'+esc(t)+'</h2><div class="ctitle-rule" aria-hidden="true"><b></b><i></i></div>';
}
function ctitleSet(id,n){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n);
  el.setAttribute('data-name',String(n||''));
}
// ---- swipe from the left edge = Back ----
var SWB={edge:24,on:null};
function swbTarget(){
  try{if(DT.view){if(DT.view.s>1.02)return null;return {el:DT.view.el,act:function(){dtCloseViewer();}};}}catch(e){}
  try{if(document.getElementById('dt-sheet'))return {el:document.querySelector('#dt-sheet .dt-sheet'),act:function(){dtCloseSheet();}};}catch(e){}
  try{if(window.PF&&PF.lb){if(PF.lb.s>1.02)return null;return {el:PF.lb.el,act:function(){pfCloseLightbox();}};}}catch(e){}
  try{if(typeof SHEET_EL!=='undefined'&&SHEET_EL){var s=SHEET_EL.querySelector('.sheet')||SHEET_EL;return {el:s,act:function(){sheetClose();}};}}catch(e){}
  var ms=[].slice.call(document.querySelectorAll('.modal-overlay')).filter(function(m){return m._open||m.classList.contains('active');});
  if(ms.length){ms.sort(function(a,b){return (+getComputedStyle(a).zIndex||0)-(+getComputedStyle(b).zIndex||0);});var m=ms[ms.length-1];
    var bb=m.querySelector('.backbtn')||m.querySelector('.modal-close');var box=m.querySelector('.modal')||m;
    return {el:box,act:function(){if(bb)bb.click();else closeModal(m.id);}};}
  var pg=document.querySelector('.page.active');if(pg){var b=pg.querySelector('.backbar .backbtn');if(b&&b.offsetParent)return {el:pg,act:function(){b.click();}};}
  return null;
}
function swbInit(){
  if(SWB.init)return;SWB.init=1;
  var bar=document.createElement('div');bar.id='swb-edge';document.body.appendChild(bar);
  function sal(){var v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sal'))||0;return v;}
  window.addEventListener('pointerdown',function(e){
    if(e.pointerType==='mouse')return;
    if(e.clientX>SWB.edge+sal())return;
    if(e.target&&e.target.closest&&e.target.closest('.vch-plot'))return;
    var t=swbTarget();if(!t)return;
    SWB.claim={t:t,x:e.clientX,y:e.clientY};e.stopPropagation();
  },true);
  window.addEventListener('touchstart',function(e){
    if(e.touches.length>1){if(SWB.on)swbEnd(false);SWB.claim=null;return;}
    var p=e.touches[0];if(p.clientX>SWB.edge+sal()){SWB.claim=null;return;}
    if(e.target&&e.target.closest&&e.target.closest('.vch-plot')){SWB.claim=null;return;}
    var t=(SWB.claim&&SWB.claim.t)||swbTarget();SWB.claim=null;if(!t)return;
    SWB.on={t:t,x0:p.clientX,y0:p.clientY,dx:0,mode:0,t0:Date.now()};e.stopPropagation();
  },{capture:true,passive:true});
  window.addEventListener('touchmove',function(e){
    var S=SWB.on;if(!S)return;
    if(e.touches.length>1){swbEnd(false);return;}
    var p=e.touches[0],dx=p.clientX-S.x0,dy=p.clientY-S.y0;
    if(!S.mode){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      if(dx>0&&dx>Math.abs(dy)*1.4){S.mode=1;S.el=S.t.el;S.el.style.transition='none';S.el.style.willChange='transform';S.el.classList.add('swb-shadow');document.getElementById('swb-edge').style.opacity='1';}
      else{SWB.on=null;return;}}
    e.preventDefault();e.stopPropagation();
    S.dx=Math.max(0,dx);S.el.style.transform='translate3d('+S.dx+'px,0,0)';
  },{capture:true,passive:false});
  function endH(e){var S=SWB.on;if(!S)return;if(S.mode){e.stopPropagation();var v=S.dx/Math.max(1,Date.now()-S.t0);swbEnd(S.dx>Math.min(110,innerWidth*.3)||(v>.5&&S.dx>40));}else SWB.on=null;}
  window.addEventListener('touchend',endH,true);
  window.addEventListener('touchcancel',function(){if(SWB.on)swbEnd(false);},true);
}
function swbEnd(go){
  var S=SWB.on;SWB.on=null;if(!S||!S.el){return;}
  var el=S.el;document.getElementById('swb-edge').style.opacity='0';
  el.style.transition='transform .2s ease';
  el.style.transform=go?'translate3d('+innerWidth+'px,0,0)':'translate3d(0,0,0)';
  setTimeout(function(){
    if(go){try{S.t.act();}catch(e){}SWB.last=Date.now();}
    el.style.transition='';el.style.transform='';el.style.willChange='';el.classList.remove('swb-shadow');
  },go?190:210);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',swbInit);else swbInit();
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
  try{var _d=byId(getDocs(),docId),_v=_d&&byId(getVehicles(),_d.vehicleId);if(_v&&!canReviewScan(_v)){docAiState('note','Reviewed scanning is not enabled for you on this vehicle. Enter the details below.');return;}}catch(_e){}

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
  try{if(s.vin&&vinOk(s.vin)&&DOCAI.edit.vehicleId){var _dv=byId(getVehicles(),DOCAI.edit.vehicleId);if(_dv&&vinNorm(_dv.vin)!==vinNorm(s.vin))setTimeout(function(){vinApplyToVehicle(_dv.id,s.vin,'ask','The document shows VIN '+vinNorm(s.vin)+': ');},400);}}catch(e){}
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
  el.innerHTML=kind==='scanning'?evoSpinHTML('dai-spin')+'Reading your document with AI...':esc(msg||'');
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
      try{var _vv=byId(getVehicles(),v.id);if(_vv&&!(_vv.aiValue&&Number(_vv.aiValue.value)>0))valueAutoQueue(v.id,300);}catch(e){}
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
// generated by tools/gen_evoring.py from round6/EvoAI_original_O_spiral_ring_tight.svg (291 gold dots; x,y relative to the O centre, 2*r, opacity%)
var EVR_GRAD='<linearGradient id="evr-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3CF"/><stop offset=".45" stop-color="#E2BC63"/><stop offset="1" stop-color="#8A6424"/></linearGradient>';
var EVR_D=[1648,-460,27,60,-906,1454,27,61,-315,-1685,28,61,1372,1031,28,61,-1709,166,28,61,1149,-1278,28,62,16,1720,28,62,-1175,-1259,29,62,1718,134,29,62,-1359,1062,29,63,285,-1703,29,63,941,1449,30,63,-1674,-433,30,64,1528,-812,30,64,-579,1633,30,64,-677,-1596,30,64,1579,721,31,65,-1652,536,31,65,857,-1512,31,65,390,1696,31,65,-1434,-988,32,66,1726,-240,32,66,-1111,1344,32,66,-89,-1744,32,67,1244,1227,32,67,-1748,-64,32,67,1333,-1134,33,67,-217,1738,33,68,-1015,-1430,33,68,1715,369,33,68,-1515,888,33,68,518,-1679,34,69,753,1590,34,69,-1630,-664,34,69,1652,-612,34,69,-806,1569,34,70,-466,-1702,35,70,1495,941,35,70,-1739,316,35,71,1070,-1409,35,71,163,1763,35,71,-1312,-1191,36,71,1774,-8,36,72,-1303,1205,36,72,147,-1770,36,72,1088,1406,36,72,-1754,-302,36,73,1498,-963,37,73,-455,1723,37,73,-829,-1579,37,73,1680,605,37,74,-1648,689,37,74,750,-1623,38,74,543,1705,38,75,-1554,-891,38,75,1749,-393,38,75,-1025,1472,38,75,-239,-1779,38,76,1379,1152,39,76,-1796,83,39,76,1270,-1275,39,76,-75,1799,39,77,-1161,-1378,39,77,1789,232,40,77,-1477,1038,40,77,388,-1764,40,78,906,1565,40,78,-1726,-542,40,78,1640,-767,40,78,-692,1675,41,79,-622,-1704,41,79,1611,837,41,79,-1754,471,41,79,976,-1534,41,80,316,1792,41,80,-1445,-1108,42,80,1815,-159,42,81,-1232,1344,42,81,0,-1825,42,81,1234,1347,42,81,-1821,-160,42,82,1452,-1113,43,82,-319,1803,43,82,-983,-1546,43,82,1771,476,43,83,-1629,845,43,83,630,-1725,44,83,701,1699,44,83,-1666,-780,44,84,1756,-550,44,84,-924,1594,44,84,-395,-1800,44,84,1509,1061,45,85,-1831,237,45,85,1191,-1412,45,85,76,1848,45,85,-1305,-1312,45,86,1850,86,45,86,-1423,1187,46,86,248,-1838,46,86,1060,1524,46,87,-1812,-408,46,87,1613,-924,46,87,-566,1772,46,87,-780,-1690,46,88,1718,720,47,88,-1754,630,47,88,868,-1651,47,88,475,1806,47,89,-1571,-1011,47,89,1843,-316,47,89,-1146,1479,48,89,-154,-1866,48,90,1375,1273,48,90,-1875,-10,48,90,1390,-1261,48,90,-174,1870,48,91,-1136,-1497,49,91,1850,337,49,91,-1593,1002,49,91,498,-1816,49,92,860,1677,49,92,-1768,-656,49,92,1748,-711,50,92,-810,1707,50,93,-556,-1807,50,93,1632,957,50,93,-1851,397,50,93,1098,-1544,50,94,234,1881,50,94,-1444,-1230,51,94,1897,-69,51,94,-1354,1333,51,95,98,-1899,51,95,1212,1467,51,95,-1886,-264,51,95,1570,-1080,52,96,-428,1858,52,96,-940,-1660,52,96,1816,590,52,96,-1739,792,52,97,747,-1760,52,97,638,1804,52,97,-1690,-900,53,97,1855,-479,53,98,-1045,1608,53,98,-315,-1893,53,98,1512,1184,53,98,-1916,149,53,99,1313,-1405,54,99,-19,1924,54,99,-1286,-1433,54,99,1918,188,54,100,-1542,1158,54,100,355,-1897,54,100,1020,1640,54,100,-1861,-520,55,100,1725,-874,55,100,-682,1811,55,100,-721,-1797,55,100,1747,839,55,100,-1856,562,55,100,990,-1669,56,100,398,1900,56,100,-1578,-1133,56,100,1930,-230,56,100,-1269,1475,56,100,-61,-1946,56,100,1360,1395,56,100,-1946,-110,57,100,1510,-1235,57,100,-280,1932,57,100,-1100,-1615,57,100,1903,448,57,100,-1707,956,57,100,614,-1859,57,100,804,1786,58,100,-1800,-775,58,100,1852,-645,58,100,-930,1728,58,100,-482,-1904,58,100,1642,1079,58,100,-1941,314,58,100,1220,-1544,59,100,143,1964,59,100,-1433,-1353,59,100,1972,29,59,100,-1475,1311,59,100,202,-1964,59,100,1179,1586,60,100,-1942,-373,60,100,1685,-1037,60,100,-542,1904,60,100,-887,-1771,60,100,1852,708,60,100,-1845,729,60,100,868,-1785,61,100,566,1904,61,100,-1704,-1022,61,100,1948,-398,61,100,-1169,1611,61,100,-226,-1978,61,100,1504,1307,61,100,-1993,53,62,100,1435,-1386,62,100,-122,1993,62,100,-1257,-1553,62,100,1977,296,62,100,-1659,1118,62,100,468,-1946,62,100,970,1752,63,100,-1900,-638,63,100,1833,-814,63,100,-802,1840,63,100,-651,-1900,63,100,1765,961,63,100,-1952,484,63,100,1113,-1676,64,100,311,1989,64,100,-1574,-1257,64,100,2011,-136,64,100,-1392,1460,64,100,40,-2018,64,100,1334,1516,64,100,-2009,-216,64,100,1629,-1198,65,100,-392,1985,65,100,-1053,-1730,65,100,1946,565,65,100,-1817,899,65,100,733,-1891,65,100,737,1891,65,100,-1822,-897,66,100,1951,-570,66,100,-1054,1739,66,100,-398,-1996,66,100,1642,1204,66,100,-2025,222,66,100,1344,-1533,66,100,44,2040,67,100,-1411,-1475,67,100,2038,135,67,100,-1595,1278,67,100,313,-2021,67,100,1135,1702,67,100,-1988,-489,67,100,1797,-983,68,100,-662,1940,68,100,-823,-1879,68,100,1877,830,68,100,-1946,657,68,100,992,-1800,68,100,485,1998,68,100,-1708,-1147,68,100,2036,-308,69,100,-1293,1604,69,100,-130,-2057,69,100,1486,1430,69,100,-2063,-51,69,100,1557,-1357,69,100,-231,2053,69,100,-1217,-1671,70,100,2028,410,70,100,-1774,1068,70,100,587,-1986,70,100,910,1862,70,100,-1930,-759,70,100,1937,-744,70,100,-926,1858,70,100,-573,-1997,71,100,1772,1086,71,100,-2042,396,71,100,1239,-1673,71,100,217,2071,71,100,-1560,-1382,71,100,2085,-35,71,100,-1515,1435,72,100,148,-2082,72,100,1298,1636,72,100,-2064,-330,72,100,1746,-1152,72,100,-509,2029,72,100,-996,-1842,72,100,1979,686,72,100,-1924,832,73,100,857,-1914,73,100,661,1992,73,100,-1834,-1022,73,100,2044,-485,73,100,-1180,1740,73,100,-305,-2081,73,100];
// ============ v15: animated gold dot-spiral ring loader (approved round6 logo) ============
// The gold ring rotates gently while a pulse travels round it dot-sector by dot-sector; the Evolve O stays still.
var EVR={svg:''};
function evoRingSVG(){
  if(EVR.svg)return EVR.svg;
  var N=12,g=[],i;for(i=0;i<N;i++)g.push([]);
  for(i=0;i<EVR_D.length;i+=4){var x=EVR_D[i],y=EVR_D[i+1],a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=2*Math.PI;
    g[Math.floor(a/(2*Math.PI)*N)%N].push('<circle cx="'+x+'" cy="'+y+'" r="'+(EVR_D[i+2]/2)+'"'+(EVR_D[i+3]<100?' fill-opacity="'+(EVR_D[i+3]/100)+'"':'')+'/>');}
  EVR.svg='<svg class="evr-svg" viewBox="-2170 -2170 4340 4340" aria-hidden="true" focusable="false"><g class="evr-rot" fill="url(#evr-g)">'+
    g.map(function(c,k){return '<g class="evr-s" style="animation-delay:'+(k*0.14).toFixed(2)+'s">'+c.join('')+'</g>';}).join('')+'</g></svg>';
  return EVR.svg;
}
function evoSpinHTML(cls,label){
  return '<span class="evo-spin '+(cls||'')+'"'+(label?' role="img" aria-label="'+esc(label)+'"':' aria-hidden="true"')+'>'+evoRingSVG()+'<i class="evo-o"></i></span>';
}
function evoInit(){
  if(!document.getElementById('evr-defs')&&document.body){var d=document.createElement('div');d.id='evr-defs';d.setAttribute('aria-hidden','true');
    d.innerHTML='<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" focusable="false"><defs>'+EVR_GRAD+'</defs></svg>';document.body.insertBefore(d,document.body.firstChild);}
  var b=document.getElementById('boot-ring');if(b&&!b.firstChild)b.innerHTML=evoRingSVG()+'<i class="evo-o"></i>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',evoInit);else evoInit();
// ============ v15: calm vehicle page (one value block, one Documentation section), owner value, replica / kit car ============
var VR={cols:null};       // vehicles.is_replica / builder columns present (migration_009)
var OV={on:null,busy:false,edit:null};   // vehicle_owner_values table present (migration_009)
// ---------- replica / kit car ----------
function vrRep(r,x){if(r&&Object.prototype.hasOwnProperty.call(r,'is_replica'))VR.cols=true;else if(r&&VR.cols===null)VR.cols=false;return r&&r.is_replica===true||!!(x&&x.rep);}
function vrBld(r,x){return cleanText((r&&r.builder)||(x&&x.bld)||'',80);}
function vrLabel(v){return v&&v.isReplica?('Replica'+(v.builder?' by '+v.builder:'')):'';}
async function vrSyncCols(v){
  if(VR.cols===false||!v)return;
  try{var r=await sb.from('vehicles').update({is_replica:!!v.isReplica,builder:v.isReplica&&v.builder?String(v.builder).slice(0,80):null}).eq('id',v.id);
    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))VR.cols=false;else if(r&&!r.error)VR.cols=true;}catch(e){}
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
  vchRenderVehicle(v);
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
// ===== v17: value chart (collection + vehicle). Plain SVG + vanilla JS. Real ai_estimates rows only (v.valueLog ai:true, mid), owner value priority. =====
var VCH={st:{},ranges:['1M','3M','1Y','All'],months:{'1M':1,'3M':3,'1Y':12,'All':0},rl:{'1M':'past month','3M':'past 3 months','1Y':'past year','All':'since the first estimate'}};
function vchT(s){var d=parseDate(s);if(!d)return NaN;d.setHours(12,0,0,0);return d.getTime();}
function vchNum(n){n=Number(n);return isFinite(n)?n:0;}
function vchShort(s){var d=parseDate(s);return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';}
// AI points for one vehicle: one per day (the latest of that day), ascending.
function vchAiPts(v){
  var m={},out=[];
  (v&&v.valueLog||[]).forEach(function(p){if(!(p&&p.ai===true&&Number(p.value)>0))return;var dd=String(p.date||'').slice(0,10);
    if(p.ts&&/T\d/.test(String(p.ts))){var t=new Date(p.ts);if(!isNaN(t.getTime()))dd=isoLocal(t);}
    if(isFinite(vchT(dd)))m[dd]=Math.round(Number(p.value));});
  Object.keys(m).sort().forEach(function(d){out.push({d:d,v:m[d]});});
  return out;
}
function vchOwner(v){var o=(typeof ovVal==='function')?ovVal(v):null;if(o===null||!(o>0))return null;var s=v.ownerValue&&v.ownerValue.setAt;return {v:Math.round(o),d:(s&&isFinite(vchT(s)))?String(s).slice(0,10):todayISO()};}
// value of one car as of day d (carry forward). Owner value wins from the day it was set.
function vchValAt(ai,own,d){
  if(own&&own.d<=d)return own.v;
  var r=null;for(var i=0;i<ai.length;i++){if(ai[i].d<=d)r=ai[i].v;else break;}return r;
}
// Collection series: every date any car got a value; sum of each car's latest value as of that date. Ends today at the current total.
function vchCollSeries(vehicles,today){
  today=today||todayISO();
  var cars=[],dates={};
  (vehicles||[]).forEach(function(v){if(!can(v,'view_value_estimate'))return;var ai=vchAiPts(v),own=vchOwner(v);if(!ai.length&&!own)return;
    cars.push({v:v,ai:ai,own:own});ai.forEach(function(p){dates[p.d]=1;});if(own)dates[own.d<=today?own.d:today]=1;});
  var ds=Object.keys(dates).sort(),pts=[];
  ds.forEach(function(d){var sum=0,parts={},n=0;cars.forEach(function(c){var x=vchValAt(c.ai,c.own,d);if(x!==null){sum+=x;parts[c.v.id]=x;n++;}});if(n)pts.push({d:d,v:sum,parts:parts});});
  var real=pts.length;
  if(pts.length&&pts[pts.length-1].d<today){var lp=pts[pts.length-1];pts.push({d:today,v:lp.v,parts:lp.parts,ext:true});}
  return {pts:pts,real:real,cars:cars};
}
// Slice a series to a range; carry the last value before the range start in as the first point.
function vchSlice(pts,r,today){
  if(!pts.length)return [];
  var m=VCH.months[r];if(!m)return pts.slice();
  var t=parseDate(today||todayISO());t.setMonth(t.getMonth()-m);var s=isoLocal(t),out=[],before=null;
  pts.forEach(function(p){if(p.d<s)before=p;else out.push(p);});
  if(before&&out.length&&out[0].d>s)out.unshift({d:s,v:before.v,parts:before.parts,carry:true});
  return out;
}
function vchChange(sl){if(sl.length<2)return null;var a=sl[0].v,b=sl[sl.length-1].v,d=b-a;return {d:d,p:a?d/a*100:0,a:a,b:b};}
function vchChgHTML(c,lbl){
  if(!c)return '';
  var up=c.d>=0,cl=c.d===0?'':(up?'up':'down'),ar=c.d===0?'':(up?'\u25B2 +':'\u25BC \u2212');
  return '<span class="'+cl+'">'+(c.d===0?'No change':ar+money(Math.abs(c.d)).replace('-','')+' ('+(up?'+':'\u2212')+Math.abs(c.p).toFixed(1)+'%)')+'</span> <span class="vch-rl">'+esc(lbl)+'</span>';
}
function vchPct(c){return Math.abs(c.p).toFixed(1)+'%';}
// ---------- insight lines (local, from the real data; no API calls) ----------
function vchFirstText(d){return 'First AI estimate recorded '+vchShort(d)+'. Trends appear after a few weekly updates.';}
function vchCollInsight(S,r,today){
  if(S.real<2){var f=S.pts.length?S.pts[0].d:today;return vchFirstText(f);}
  var sl=vchSlice(S.pts,r,today),c=vchChange(sl);if(!c)return 'Not enough history for this range yet.';
  var a=sl[0],b=sl[sl.length-1],best=null,added=0,txt;
  S.cars.forEach(function(k){var id=k.v.id,x=a.parts[id],y=b.parts[id];if(x===undefined&&y!==undefined){added++;return;}if(x===undefined||y===undefined)return;var dd=y-x;if(!best||Math.abs(dd)>Math.abs(best.d))best={d:dd,n:vName(k.v)};});
  if(c.d===0)txt='Unchanged over the '+VCH.rl[r].replace('since the first estimate','whole history')+'.';
  else txt=(c.d>0?'Up ':'Down ')+vchPct(c)+' ('+(c.d>0?'+':'\u2212')+money(Math.abs(c.d)).replace('-','')+') '+(r==='All'?'since the first estimate':'over the '+VCH.rl[r])+'.';
  if(best&&best.d!==0)txt+=' Biggest mover: '+best.n+' ('+(best.d>0?'+':'\u2212')+money(Math.abs(best.d)).replace('-','')+').';
  if(added)txt+=' '+added+' vehicle'+(added===1?'':'s')+' got a first value in this period.';
  var no=S.cars.filter(function(k){return !!k.own;}).length;if(no)txt+=' Uses your own value for '+no+' vehicle'+(no===1?'':'s')+'.';
  return txt;
}
function vchConfText(v){
  var a=v.aiValue;if(!a)return '';var cf=a.confidence===''||a.confidence===null||a.confidence===undefined?null:Number(a.confidence),ns=(a.sources||[]).length,bits=[];
  if(cf!==null&&isFinite(cf))bits.push((cf<0.3?'low confidence (':'')+Math.round(cf*100)+'% confidence'+(cf<0.3?')':''));
  bits.push(ns?ns+' source'+(ns===1?'':'s'):'no sources returned');
  return 'Latest estimate: '+bits.join(', ')+'.';
}
function vchVehInsight(v,ai,own,r,today){
  var txt='';
  if(ai.length<2)txt=ai.length?vchFirstText(ai[0].d):'No AI estimate yet.';
  else{var c=vchChange(vchSlice(vchExt(ai,today),r,today));
    if(!c)txt='Not enough history for this range yet.';
    else if(c.d===0)txt='AI estimate unchanged over the '+(r==='All'?'whole history':VCH.rl[r])+'.';
    else txt='AI estimate '+(c.d>0?'up ':'down ')+vchPct(c)+' ('+(c.d>0?'+':'\u2212')+money(Math.abs(c.d)).replace('-','')+') '+(r==='All'?'since the first estimate':'over the '+VCH.rl[r])+'.';}
  if(ai.length)txt+=' '+vchConfText(v);
  if(v.isReplica)txt+=' Valued as a replica'+(v.builder?' by '+v.builder:'')+'.';
  if(own&&ai.length){var dd=own.v-ai[ai.length-1].v;txt+=' Your owner value is '+(dd===0?'the same as':money(Math.abs(dd))+(dd>0?' above':' below'))+' the latest AI estimate.';}
  return txt;
}
function vchExt(ai,today){var p=ai.slice();if(p.length&&p[p.length-1].d<today)p.push({d:today,v:p[p.length-1].v,ext:true});return p;}
// ---------- models ----------
function vchCollModel(id,vehicles){
  var today=todayISO(),S=vchCollSeries(vehicles,today);if(!S.pts.length)return null;
  var t=portfolioTotals(vehicles),cur=t.value>0?t.value:S.pts[S.pts.length-1].v;
  if(S.pts.length)S.pts[S.pts.length-1].v=cur; // the line ends at the same total the rest of the app shows
  var basisOk=S.cars.length&&S.cars.every(function(k){return Number(k.v.purchasePrice)>0&&can(k.v,'view_purchase_info');});
  return {id:id,kind:'coll',today:today,label:'Collection value',value:cur,S:S,main:S.pts,real:S.real,
    basis:basisOk?function(p){var b=0;S.cars.forEach(function(k){if(p.parts&&p.parts[k.v.id]!==undefined)b+=Number(k.v.purchasePrice);});return b;}:null,
    insight:function(r){return vchCollInsight(S,r,today);},nOwner:S.cars.filter(function(k){return !!k.own;}).length};
}
function vchVehModel(id,v){
  if(!v||!can(v,'view_value_estimate'))return null;
  var today=todayISO(),ai=vchAiPts(v),own=vchOwner(v);if(!ai.length&&!own)return null;
  var pp=Number(v.purchasePrice)>0&&can(v,'view_purchase_info')?Number(v.purchasePrice):0;
  var m={id:id,kind:'veh',today:today,v:v,own:own,ai:ai,real:ai.length,basis:pp?function(){return pp;}:null,
    label:own?'Owner value':'Estimated value',value:own?own.v:ai[ai.length-1].v,
    insight:function(r){return vchVehInsight(v,ai,own,r,today);}};
  if(own){m.main=[];m.dash=ai;m.real=ai.length+1;}else m.main=vchExt(ai,today);
  return m;
}
function vchHasAi(m){return m.kind==='coll'?m.S.cars.some(function(k){return !k.own&&k.ai.length;}):!!(m.ai&&m.ai.length);}
// ---------- render ----------
function vchSeriesFor(m,r){return m.own?{main:[],dash:vchSlice(m.ai,r,m.today)}:{main:vchSlice(m.main,r,m.today),dash:[]};}
function vchRangeOk(m,r){if(m.real<2)return false;var s=vchSeriesFor(m,r);return (m.own?s.dash.length+1:s.main.length)>=2;}
function vchMount(hostId,m){
  var host=document.getElementById(hostId);if(!host)return;
  if(!m){host.innerHTML='';host.classList.remove('on');delete VCH.st[hostId];return;}
  var key=m.kind+':'+(m.v?m.v.id:m.id),prev=VCH.st[hostId],r=prev&&prev.key===key&&prev.r;
  if(!r||!vchRangeOk(m,r)){r='1Y';if(!vchRangeOk(m,r)){r=null;for(var i=VCH.ranges.length-1;i>=0;i--)if(vchRangeOk(m,VCH.ranges[i])){r=VCH.ranges[i];break;}if(!r)r='All';if(vchRangeOk(m,'1Y'))r='1Y';}}
  var st={m:m,r:r,key:key,host:host,sel:null,raf:0};VCH.st[hostId]=st;
  host.classList.add('on');
  host.innerHTML='<div class="vch" data-kind="'+m.kind+'">'+
    '<div class="vch-head"><div class="vch-lab"><span class="vch-labt"></span>'+'</div><div class="vch-big" aria-live="polite"></div><div class="vch-chg"></div><div class="vch-disc"'+(vchHasAi(m)?'':' hidden')+'>Estimate, not an appraisal</div></div>'+
    '<div class="vch-plot" role="img" tabindex="0"><div class="vch-svg"></div><div class="vch-hit" aria-hidden="true"></div><div class="vch-x" aria-hidden="true"></div><div class="vch-dot" aria-hidden="true"></div><div class="vch-bub" aria-hidden="true"><div class="d"></div><div class="x"></div></div></div>'+
    '<div class="vch-axis" aria-hidden="true"></div>'+
    '<div class="vch-ranges" role="group" aria-label="Chart range">'+VCH.ranges.map(function(k){var ok=vchRangeOk(m,k);return '<button type="button" data-r="'+k+'"'+(ok?'':' disabled aria-disabled="true"')+'>'+k+'</button>';}).join('')+'</div>'+
    '<div class="vch-leg"></div>'+
    '<div class="vch-ins"><span class="tag">AI</span><div class="vch-inst"></div></div></div>';
  host.querySelectorAll('.vch-ranges button').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();if(b.disabled)return;st.r=b.getAttribute('data-r');st.sel=null;vchDraw(st);});});
  vchBind(st);vchDraw(st);
  if(!VCH.rs){VCH.rs=1;var tm=0;window.addEventListener('resize',function(){clearTimeout(tm);tm=setTimeout(function(){Object.keys(VCH.st).forEach(function(k){var s=VCH.st[k];if(s.host&&document.body.contains(s.host))vchDraw(s);});},150);});}
}
function vchGeom(st){
  var m=st.m,plot=st.host.querySelector('.vch-plot'),W=Math.max(260,Math.round(plot.clientWidth||st.host.clientWidth||360)),H=W>640?240:190;
  var s=vchSeriesFor(m,st.r),all=s.main.concat(s.dash),vals=all.map(function(p){return p.v;});
  if(m.own)vals.push(m.own.v);
  var bl=[];if(m.basis&&s.main.length)bl=s.main.map(function(p){return {d:p.d,v:m.basis(p)};}).filter(function(p){return p.v>0;});else if(m.basis&&m.own)bl=[{d:(s.dash[0]||{d:m.today}).d,v:m.basis()},{d:m.today,v:m.basis()}];
  bl.forEach(function(p){vals.push(p.v);});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);if(!isFinite(mn)){mn=0;mx=1;}
  var pad=(mx-mn)*0.14;if(!(pad>0))pad=Math.max(1,mx*0.04);mn-=pad;mx+=pad;
  var t0=Infinity,t1=-Infinity;all.concat(m.own?[{d:m.today}]:[]).forEach(function(p){var t=vchT(p.d);if(t<t0)t0=t;if(t>t1)t1=t;});
  if(!(t1>t0)){t0-=864e5*3;t1+=864e5*3;}
  var PL=W>640?6:4,PR=W>640?10:14,PT=56,PB=12;
  return {W:W,H:H,PL:PL,PR:PR,PT:PT,PB:PB,mn:mn,mx:mx,t0:t0,t1:t1,s:s,bl:bl,
    X:function(d){return PL+(W-PL-PR)*(vchT(d)-t0)/(t1-t0);},Y:function(v){return PT+(H-PT-PB)*(1-(v-mn)/(mx-mn));}};
}
function vchPath(pts,G){
  var P=pts.map(function(p){return [G.X(p.d),G.Y(p.v)];});if(!P.length)return '';
  var d='M'+P[0][0].toFixed(1)+','+P[0][1].toFixed(1);
  for(var i=0;i<P.length-1;i++){var p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;
    // monotone-ish: clamp control points vertically to the segment so the curve never overshoots real values
    var y1=p1[1]+(p2[1]-p0[1])/6,y2=p2[1]-(p3[1]-p1[1])/6,lo=Math.min(p1[1],p2[1]),hi=Math.max(p1[1],p2[1]);y1=Math.min(hi,Math.max(lo,y1));y2=Math.min(hi,Math.max(lo,y2));
    d+=' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+','+y1.toFixed(1)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+','+y2.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);}
  return d;
}
function vchDraw(st){
  var m=st.m,h=st.host,G=vchGeom(st),s=G.s,W=G.W,H=G.H,id='vg'+Math.random().toString(36).slice(2,7),svg;
  st.G=G;st.pts=s.main.length?s.main:s.dash.concat(m.own?[{d:m.today,v:m.own.v,own:true}]:[]);
  h.querySelectorAll('.vch-ranges button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-r')===st.r&&m.real>=2);b.setAttribute('aria-pressed',b.getAttribute('data-r')===st.r&&m.real>=2?'true':'false');});
  svg='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" focusable="false"><defs><linearGradient id="'+id+'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9AA6B" stop-opacity=".34"/><stop offset=".6" stop-color="#C9AA6B" stop-opacity=".08"/><stop offset="1" stop-color="#C9AA6B" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="'+id+'l" x1="0" x2="1"><stop offset="0" stop-color="#9C8350"/><stop offset=".7" stop-color="#C9AA6B"/><stop offset="1" stop-color="#F1DCA8"/></linearGradient>'+
    '<filter id="'+id+'g" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter></defs>';
  for(var g=1;g<4;g++){var gy=G.PT+(H-G.PT-G.PB)*g/4;svg+='<line x1="0" x2="'+W+'" y1="'+gy.toFixed(1)+'" y2="'+gy.toFixed(1)+'" stroke="rgba(255,255,255,.06)"/>';}
  var single=m.real<2,leg=[];
  if(single){
    var p0=st.pts[st.pts.length-1],cx=W/2,cy=G.PT+(H-G.PT-G.PB)*0.55;st.single={x:cx,y:cy,p:p0};
    svg+='<line x1="0" x2="'+W+'" y1="'+cy+'" y2="'+cy+'" stroke="#C9AA6B" stroke-opacity=".28" stroke-dasharray="2 7"/>';
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="22" fill="#C9AA6B" opacity=".12"/><circle cx="'+cx+'" cy="'+cy+'" r="12" fill="#C9AA6B" opacity=".25" filter="url(#'+id+'g)"/><circle cx="'+cx+'" cy="'+cy+'" r="6" fill="#F1DCA8"/>';
    svg+='<text x="'+cx+'" y="'+(cy-30)+'" text-anchor="middle" class="vch-st">'+esc((m.own?'Owner value ':'')+money(p0.v))+'</text>';
    leg.push('<span class="vch-hist">History starts '+esc(fmtDate((m.ai[0]||st.pts[0]||{d:m.today}).d||m.today))+' \u2014 updates weekly</span>');
  }else{
    st.single=null;
    if(G.bl.length>1){var bp='';G.bl.forEach(function(p,i){bp+=(i?' L':'M')+G.X(p.d).toFixed(1)+','+G.Y(p.v).toFixed(1);});
      svg+='<path d="'+bp+'" fill="none" stroke="#DCDDE0" stroke-width="1.6" stroke-dasharray="6 6" opacity=".7"/>';
      var lb=G.bl[G.bl.length-1];var fb=G.bl[0],ly0=G.Y(fb.v),mly=s.main.length?G.Y(s.main[0].v):H;svg+='<text x="'+(G.PL+2)+'" y="'+(mly<ly0?Math.min(H-G.PB-4,ly0+20):Math.max(G.PT-4,ly0-9)).toFixed(1)+'" text-anchor="start" class="vch-bt">Cost basis '+esc(money(lb.v))+'</text>';leg.push('<span><i class="d"></i>Cost basis</span>');}
    if(s.main.length>1){var ln=vchPath(s.main,G),x0=G.X(s.main[0].d),x1=G.X(s.main[s.main.length-1].d);
      svg+='<path d="'+ln+' L'+x1.toFixed(1)+','+(H-G.PB)+' L'+x0.toFixed(1)+','+(H-G.PB)+' Z" fill="url(#'+id+'f)"/>';
      svg+='<path d="'+ln+'" fill="none" stroke="#E6CF9C" stroke-width="6" opacity=".5" filter="url(#'+id+'g)"/><path d="'+ln+'" fill="none" stroke="url(#'+id+'l)" stroke-width="2.8" stroke-linecap="round"/>';
      var lp=s.main[s.main.length-1];svg+='<circle cx="'+x1.toFixed(1)+'" cy="'+G.Y(lp.v).toFixed(1)+'" r="11" fill="#C9AA6B" opacity=".22"/><circle cx="'+x1.toFixed(1)+'" cy="'+G.Y(lp.v).toFixed(1)+'" r="5" fill="#F1DCA8"/>';
      leg.unshift('<span><i></i>'+(m.kind==='coll'&&m.nOwner?'Value (owner values where set)':'AI estimate')+'</span>');}
    if(m.own){
      if(s.dash.length>1)svg+='<path d="'+vchPath(s.dash,G)+'" fill="none" stroke="#C9AA6B" stroke-width="2" stroke-dasharray="5 6" opacity=".8"/>';
      s.dash.forEach(function(p){svg+='<circle cx="'+G.X(p.d).toFixed(1)+'" cy="'+G.Y(p.v).toFixed(1)+'" r="2.6" fill="#C9AA6B" opacity=".9"/>';});
      var ox=G.X(m.today),oy=G.Y(m.own.v);
      svg+='<circle cx="'+ox.toFixed(1)+'" cy="'+oy.toFixed(1)+'" r="13" fill="#C9AA6B" opacity=".22"/><circle cx="'+ox.toFixed(1)+'" cy="'+oy.toFixed(1)+'" r="6.5" fill="#F1DCA8" stroke="#07080A" stroke-width="2" class="vch-own"/>';
      svg+='<text x="'+(ox-14).toFixed(1)+'" y="'+(oy-16).toFixed(1)+'" text-anchor="end" class="vch-ot">Owner value</text>';
      leg=['<span><b class="o"></b>Owner value</span>','<span><i class="a"></i>AI estimate</span>'].concat(leg);
    }
  }
  svg+='</svg>';
  h.querySelector('.vch-svg').innerHTML=svg;
  h.querySelector('.vch-plot').style.height=H+'px';
  var ax=h.querySelector('.vch-axis');
  if(single)ax.innerHTML='';
  else{var a=st.pts[0].d,b=st.pts[st.pts.length-1].d,mid=isoLocal(new Date((vchT(a)+vchT(b))/2)),fm=function(d){if(d===m.today)return 'Today';var dt=parseDate(d);return st.r==='All'&&(vchT(b)-vchT(a))>400*864e5?String(dt.getFullYear()):dt.toLocaleDateString('en-US',st.r==='1Y'||st.r==='All'?{month:'short',year:'2-digit'}:{month:'short',day:'numeric'});};
    ax.innerHTML='<span>'+esc(fm(a))+'</span><span>'+esc(fm(mid))+'</span><span>'+esc(fm(b))+'</span>';}
  h.querySelector('.vch-leg').innerHTML=leg.join('');
  h.querySelector('.vch-inst').textContent=m.insight(st.r);
  h.querySelector('.vch-plot').setAttribute('aria-label',m.label+' chart. '+m.insight(st.r));
  vchHead(st,null);vchOverlay(st);
}
function vchHead(st,p){
  var m=st.m,h=st.host,lab=h.querySelector('.vch-labt'),big=h.querySelector('.vch-big'),chg=h.querySelector('.vch-chg');
  if(p){
    lab.textContent=(p.own?'Owner value':(m.own?'AI estimate':(p.ext?'Value today':'Value on '+vchShort(p.d))));
    big.innerHTML=bigNum(p.v);
    var f=st.pts[0];chg.innerHTML=(p===f||st.pts.length<2)?'<span class="vch-rl">'+esc(fmtDate(p.d))+'</span>':vchChgHTML(vchChange([f,p]),'vs. '+vchShort(f.d));
    return;
  }
  lab.textContent=m.label;big.innerHTML=bigNum(m.value);
  if(m.real<2){chg.innerHTML='<span class="vch-rl">'+esc(m.own?'Set by the owner'+(m.ai.length?' / AI estimate '+money(m.ai[m.ai.length-1].v):''):'First AI estimate, '+fmtDate((m.ai[0]||{}).d||m.today))+'</span>';return;}
  if(m.own){var s=vchSlice(m.ai,st.r,m.today),c=vchChange(s);chg.innerHTML=c?'<span class="vch-rl">AI estimate</span> '+vchChgHTML(c,VCH.rl[st.r]):'<span class="vch-rl">AI estimate '+esc(money(m.ai[m.ai.length-1].v))+'</span>';return;}
  chg.innerHTML=vchChgHTML(vchChange(st.pts),VCH.rl[st.r]);
}
function vchOverlay(st){
  var h=st.host,x=h.querySelector('.vch-x'),dt=h.querySelector('.vch-dot'),bu=h.querySelector('.vch-bub'),G=st.G,p=st.sel;
  if(!p||!G||st.single){x.style.opacity=dt.style.opacity=bu.style.opacity='0';h.querySelector('.vch').classList.remove('scrub');return;}
  var px=G.X(p.d),py=G.Y(p.v),W=G.W;
  x.style.transform='translate3d('+px.toFixed(1)+'px,0,0)';x.style.top=(G.PT-8)+'px';x.style.height=(G.H-G.PT-G.PB+8)+'px';
  dt.style.transform='translate3d('+(px-7).toFixed(1)+'px,'+(py-7).toFixed(1)+'px,0)';
  bu.querySelector('.d').textContent=(p.own?'Owner value / ':(st.m.own?'AI estimate / ':''))+(p.ext?'Today':parseDate(p.d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}));
  bu.querySelector('.x').textContent=money(p.v);
  var bw=bu.offsetWidth||150,bx=Math.min(Math.max(px-bw/2,0),W-bw);bu.style.transform='translate3d('+bx.toFixed(1)+'px,0,0)';
  x.style.opacity=dt.style.opacity=bu.style.opacity='1';h.querySelector('.vch').classList.add('scrub');
}
function vchPick(st,clientX){
  var G=st.G;if(!G||st.single||!st.pts.length)return null;var r=st.host.querySelector('.vch-plot').getBoundingClientRect(),x=clientX-r.left,best=null,bd=Infinity;
  st.pts.forEach(function(p){var d=Math.abs(G.X(p.d)-x);if(d<bd){bd=d;best=p;}});return best;
}
function vchSet(st,p){if(p===st.sel)return;st.sel=p;if(st.raf)return;st.raf=requestAnimationFrame(function(){st.raf=0;vchOverlay(st);vchHead(st,st.sel);});}
function vchBind(st){
  var plot=st.host.querySelector('.vch-plot'),down=null,tm=0;
  function stop(e){e.stopPropagation();}
  plot.addEventListener('pointerdown',function(e){stop(e);if(st.single)return;clearTimeout(tm);down={id:e.pointerId,t:e.pointerType};try{plot.setPointerCapture(e.pointerId);}catch(_){}vchSet(st,vchPick(st,e.clientX));});
  plot.addEventListener('pointermove',function(e){if(down||e.pointerType==='mouse'){if(down)stop(e);if(!st.single)vchSet(st,vchPick(st,e.clientX));}});
  function up(e){if(!down)return;stop(e);var touch=down.t!=='mouse';down=null;if(touch){clearTimeout(tm);tm=setTimeout(function(){vchSet(st,null);},2600);}}
  plot.addEventListener('pointerup',up);plot.addEventListener('pointercancel',up);
  plot.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'&&!down)vchSet(st,null);});
  ['touchstart','touchmove','touchend'].forEach(function(n){plot.addEventListener(n,stop,{passive:true});});
  plot.addEventListener('click',stop);
  plot.addEventListener('keydown',function(e){if(st.single||!st.pts.length)return;var i=st.pts.indexOf(st.sel);
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();i=i<0?st.pts.length-1:Math.max(0,Math.min(st.pts.length-1,i+(e.key==='ArrowLeft'?-1:1)));vchSet(st,st.pts[i]);}
    else if(e.key==='Escape')vchSet(st,null);});
  plot.addEventListener('blur',function(){vchSet(st,null);});
}
// ---------- page hooks ----------
function vchRenderCollection(prefix,vehicles){try{vchMount(prefix+'-vch',vchCollModel(prefix,vehicles));}catch(e){var h=document.getElementById(prefix+'-vch');if(h){h.innerHTML='';h.classList.remove('on');}}}
function vchRenderVehicle(v){
  var p=document.getElementById('val-panel');if(!p)return;
  var m=null;try{m=vchVehModel('vd',v);}catch(e){m=null;}
  var host=document.getElementById('vd-vch');
  if(!m){if(host)host.remove();p.classList.remove('has-vch');delete VCH.st['vd-vch'];return;}
  if(!host){host=document.createElement('div');host.id='vd-vch';host.className='vch-host';p.insertBefore(host,p.firstChild);}
  p.classList.add('has-vch');vchMount('vd-vch',m);
}
// ===== v17: auto estimate on add + pull-to-refresh on the collection screen =====
var AUTOV={q:[],run:false,max:5,stop:false,log:[]};
// Quiet, background estimate for one vehicle. Respects permission, the "off" state, the 1-per-vehicle-per-day client rule and the server 429 limits.
function valueAutoOk(vid){
  var v=byId(getVehicles(),vid);
  if(!v||isArchivedVehicle(v)||!session||!can(v,'view_value_estimate'))return false;
  if(VALUE.state==='off'||VALUE.busy[vid]||valueRefreshedToday(vid))return false;
  if(!(v.year&&v.make&&v.model))return false;
  return typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function';
}
function valueAutoQueue(vid,delay){
  if(AUTOV.q.indexOf(vid)<0)AUTOV.q.push(vid);
  setTimeout(valueAutoPump,delay===undefined?1200:delay);
}
function valueAutoPump(){
  if(AUTOV.run)return;AUTOV.run=true;
  (function next(){
    if(!AUTOV.q.length||AUTOV.stop){AUTOV.q=[];AUTOV.run=false;return;}
    var vid=AUTOV.q.shift();
    if(!valueAutoOk(vid)){next();return;}
    AUTOV.log.push(vid);
    try{refreshValue(vid);}catch(e){}
    var t0=Date.now();
    (function wait(){
      if(VALUE.busy[vid]&&Date.now()-t0<155000){setTimeout(wait,250);return;}
      var n=VALUE.note[vid];
      if(n&&n.kind==='limit'&&!/already refreshed/i.test(n.text))AUTOV.stop=true; // per-user daily limit reached: stop for this session
      if(n&&n.kind!=='done')delete VALUE.note[vid]; // fail quietly in the background
      setTimeout(next,reloading?600:150);
    })();
  })();
}
// Cars with no estimate yet (up to max), queued after a pull-to-refresh.
function valueAutoMissing(max){
  var vs=(typeof visibleVehicles==='function'&&isOwner&&isOwner()?visibleVehicles():activeVehicles()),n=0;
  vs.forEach(function(v){if(n>=(max||AUTOV.max))return;if(!(v.aiValue&&Number(v.aiValue.value)>0)&&valueAutoOk(v.id)){valueAutoQueue(v.id,0);n++;}});
  return n;
}
// ---------- pull-to-refresh (collection screens only) ----------
var PTR={on:null,busy:false,th:72};
function ptrPage(){var p=document.querySelector('.page.active');return p&&(p.id==='page-client-portal'||p.id==='page-dashboard')?p:null;}
function ptrBlocked(t){
  if(document.querySelector('.modal.active'))return true;
  if(t&&t.closest&&t.closest('.vch-plot,.whl-stage,.whl,.pfg,.pf-lb,.lightbox,input,textarea,select,[data-noptr]'))return true;
  return false;
}
function ptrEl(){
  var e=document.getElementById('ptr');
  if(!e){e=document.createElement('div');e.id='ptr';e.setAttribute('aria-hidden','true');e.innerHTML='<div class="ptr-ring">'+(typeof evoRingSVG==='function'?evoRingSVG():'')+'<i class="evo-o"></i></div><div class="ptr-t">Pull to refresh</div>';document.body.appendChild(e);}
  return e;
}
function ptrShow(dy,done){var e=ptrEl(),y=Math.min(dy,PTR.th*1.6);e.style.transform='translate3d(-50%,'+(y-70).toFixed(1)+'px,0)';e.style.opacity=String(Math.min(1,y/PTR.th));e.classList.toggle('ready',y>=PTR.th);e.querySelector('.ptr-t').textContent=done||(y>=PTR.th?'Release to refresh':'Pull to refresh');}
function ptrHide(){var e=document.getElementById('ptr');if(e){e.classList.remove('spin','ready');e.style.transform='translate3d(-50%,-90px,0)';e.style.opacity='0';}}
function ptrRefresh(){
  if(PTR.busy)return Promise.resolve();PTR.busy=true;
  var e=ptrEl();e.classList.add('spin');ptrShow(PTR.th,'Updating values');
  return Promise.resolve(reloadAll(true)).then(function(){return vinBackfill().catch(function(){});}).then(function(){var n=valueAutoMissing(AUTOV.max);ptrShow(PTR.th,n?'Estimating '+n+' vehicle'+(n===1?'':'s'):'Up to date');})
    .catch(function(){}).then(function(){setTimeout(function(){PTR.busy=false;ptrHide();},700);});
}
function ptrInit(){
  if(PTR.init)return;PTR.init=1;
  var main=document.querySelector('.main');if(!main)return;
  main.addEventListener('touchstart',function(e){
    PTR.on=null;
    if(PTR.busy||e.touches.length!==1||!ptrPage()||main.scrollTop>0||ptrBlocked(e.target))return;
    var p=e.touches[0];if(p.clientX<=((typeof SWB!=='undefined'&&SWB.edge)||24)+8)return; // the left edge belongs to swipe-back
    PTR.on={x:p.clientX,y:p.clientY,mode:0,dy:0};
  },{passive:true});
  main.addEventListener('touchmove',function(e){
    var S=PTR.on;if(!S)return;
    if(typeof SWB!=='undefined'&&SWB.on&&SWB.on.mode){PTR.on=null;ptrHide();return;}
    var p=e.touches[0],dx=p.clientX-S.x,dy=p.clientY-S.y;
    if(!S.mode){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;if(dy>0&&dy>Math.abs(dx)*1.5&&main.scrollTop<=0)S.mode=1;else{PTR.on=null;return;}}
    S.dy=dy*0.55;e.preventDefault();ptrShow(S.dy);
  },{passive:false});
  function end(){var S=PTR.on;PTR.on=null;if(!S||!S.mode)return;if(S.dy>=PTR.th)ptrRefresh();else ptrHide();}
  main.addEventListener('touchend',end);main.addEventListener('touchcancel',function(){PTR.on=null;ptrHide();});
}
document.addEventListener('DOMContentLoaded',ptrInit);if(document.readyState!=='loading')setTimeout(ptrInit,0);
// ===== v17: co-owners (migration_010). A collection = the owner profile vehicles.owner_id points to; co-owners are members with equal rights. =====
var CO={on:null,rows:[],of:null,list:null,lastCode:'',busy:false};
async function cmLoad(){
  try{var r=await sb.from('collection_members').select('*');
    if(r&&r.error){CO.on=false;return [];}
    CO.on=true;return (r&&r.data)||[];}catch(e){CO.on=false;return [];}
}
function coOfRows(rows,me0){for(var i=0;i<(rows||[]).length;i++)if(rows[i]&&rows[i].user_id===me0)return rows[i].collection_owner_id;return null;}
function coIsMember(){return !!CO.of;}
function coMembers(){var o=ownerClientId()||myId();return (CO.rows||[]).filter(function(m){return m.collection_owner_id===o;});}
async function coInvite(){
  if(CO.busy)return;if(CO.on===false){showToast('Co-owners need one backend update first.','error');return;}
  CO.busy=true;
  try{
    var r=await sb.rpc('create_co_owner_invite',{p_email:null});
    if(r.error){if(rpcMissing(r.error)){CO.on=false;CO.busy=false;showToast('Co-owners need one backend update first.','error');coRender();return;}throw r.error;}
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.code)throw new Error('no code returned');
    CO.lastCode=codeKey(row.code);saveInviteCode(row.invite_id,row.code);
    CO.busy=false;coRender();
    var el=document.getElementById('co-code');if(el)el.scrollIntoView({block:'center'});
  }catch(e){CO.busy=false;showToast(friendlyError(e),'error');}
}
function coShareText(code){return 'You are invited to co-own a collection on EvoAI. Open '+APP_LINK+'?invite='+codeKey(code)+' , create your own account (a new login), then enter this code: '+groupCode(codeKey(code));}
function coCopy(){if(CO.lastCode)copyText(APP_LINK+'?invite='+CO.lastCode,'Link copied');}
function coCopyCode(){if(CO.lastCode)copyText(groupCode(CO.lastCode),'Code copied');}
function coShare(){if(!CO.lastCode)return;var t=coShareText(CO.lastCode);if(navigator.share)navigator.share({title:'Co-own a collection on EvoAI',text:t}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(t,'Invite message copied');});else copyText(t,'Invite message copied');}
async function coRemove(uid,leave){
  if(!window.confirm(leave?'Leave this collection? You will lose access to its vehicles straight away.':'Remove this co-owner? They lose access to the collection straight away.'))return;
  try{
    var r=await sb.rpc('remove_co_owner',{p_user_id:uid});if(r.error)throw r.error;
    showToast(leave?'You left the collection.':'Co-owner removed.','success');
    await reloadAll(true);if(leave){try{setAccountFromProfile(session.user||{id:myId()});}catch(e){}}refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function coSectionHTML(){
  if(!session||!isOwner())return '';
  var me0=myId(),o=ownerClientId()||me0,primary=o===me0,mem=coMembers(),h='<section class="co-sec" id="co-sec"><div class="sh"><h2>Co-owners</h2></div>';
  h+='<p class="co-desc">Co-owners have their own login and the same owner rights over every vehicle in this collection: photos, documents, values, reminders, team and transfers.</p>';
  if(CO.on===false)return h+'<p class="co-desc co-muted">Co-owners need one backend update before they can be added.</p></section>';
  var po=C.profiles&&C.profiles[o];
  h+='<div class="co-row"><div><div class="co-n">'+esc(primary?'You':(displayName(po)||'Collection owner'))+'</div><div class="co-m">Original owner'+(po&&po.email&&!primary?' / '+esc(po.email):'')+'</div></div></div>';
  mem.forEach(function(m){var p=C.profiles&&C.profiles[m.user_id],mine=m.user_id===me0;
    h+='<div class="co-row" data-co="'+esc(m.user_id)+'"><div><div class="co-n">'+esc(mine?'You':(displayName(p)||'Co-owner'))+'</div><div class="co-m">Co-owner'+(p&&p.email&&!mine?' / '+esc(p.email):'')+' since '+esc(fmtDate(String(m.created_at||'').slice(0,10)))+'</div></div>'+
      (mine?'<button class="btn btn-sm btn-ghost" type="button" onclick="coRemove(\''+jsId(m.user_id)+'\',true)">Leave collection</button>':(primary?'<button class="btn btn-sm btn-ghost" type="button" onclick="coRemove(\''+jsId(m.user_id)+'\',false)">Remove</button>':''))+'</div>';});
  h+='<div class="co-acts"><button class="btn btn-primary" type="button" id="co-invite-btn" onclick="coInvite()">Invite co-owner</button></div>';
  if(CO.lastCode){
    h+='<div class="co-code-box" id="co-code"><div class="co-m">One-time code (valid 14 days). It is not sent automatically - copy or share it yourself.</div>'+
      '<div class="co-code">'+esc(groupCode(CO.lastCode))+'</div><div class="co-link">'+esc(APP_LINK+'?invite='+CO.lastCode)+'</div>'+
      '<div class="co-acts"><button class="btn btn-sm" type="button" onclick="coCopyCode()">Copy code</button><button class="btn btn-sm" type="button" onclick="coCopy()">Copy link</button><button class="btn btn-sm btn-primary" type="button" onclick="coShare()">Share</button></div></div>';
  }
  return h+'</section>';
}
function coRender(){var b=document.getElementById('access-body');if(!b)return;var old=document.getElementById('co-sec');if(old)old.remove();var h=coSectionHTML();if(h)b.insertAdjacentHTML('beforeend',h);}
// ===== v17 (E): automatic VIN decode with the free NHTSA vPIC API (browser, CORS allowed). VIN data wins; conflicts ask once. =====
var VIN={cache:{},form:null,tm:0,cols:null,url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/',bf:{max:5}};
var VIN_T={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},VIN_W=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function vinNorm(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
// 17 chars, no I/O/Q, valid check digit (position 9), and not a 1980 model-year code (pre-1981 cars have no standard VIN).
function vinOk(s){
  var v=vinNorm(s);if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false;
  var sum=0;for(var i=0;i<17;i++){var c=v[i];sum+=(/[0-9]/.test(c)?+c:VIN_T[c])*VIN_W[i];}
  var r=sum%11;if(v[8]!==(r===10?'X':String(r)))return false;
  if(v[9]==='A'&&/[0-9]/.test(v[6]))return false; // 1980 (cars and light trucks: digit in position 7 = 1980-2009 cycle)
  return true;
}
function vinParse(row){
  if(!row)return null;
  var yr=cleanText(row.ModelYear,4);if(!/^\d{4}$/.test(yr))yr='';
  var dl=Number(row.DisplacementL),cy=cleanText(row.EngineCylinders,3),fu=cleanText(row.FuelTypePrimary,40);
  var eng=[dl>0?(Math.round(dl*10)/10).toFixed(1)+'L':'',cy&&/^\d+$/.test(cy)?cy+'-cyl':'',fu].filter(function(x){return x;}).join(' ');
  var o={year:yr,make:titleCase(cleanText(row.Make,40)),model:cleanText(row.Model,60),trim:cleanText(row.Trim||row.Series,60),engine:eng.slice(0,120),body:cleanText(row.BodyClass,80),row:row};
  if(!o.year&&!o.make&&!o.model)return null;
  return o;
}
function vinFetch(vin){
  vin=vinNorm(vin);if(VIN.cache[vin])return Promise.resolve(VIN.cache[vin]);
  var ctl=null;try{ctl=new AbortController();}catch(e){}
  var p;try{p=fetch(VIN.url+encodeURIComponent(vin)+'?format=json',ctl?{signal:ctl.signal}:undefined);}catch(e){return Promise.resolve(null);}
  return withTimeout(p,12000,ctl).then(function(r){if(!r||!r.ok)throw new Error('http');return r.json();})
    .then(function(d){var o=vinParse(d&&d.Results&&d.Results[0]);if(o&&o.year&&Number(o.year)<1981)o=null;if(o)VIN.cache[vin]=o;return o;})
    .catch(function(){return null;});
}
function vinLabel(o){return [o.year,o.make,o.model,o.trim].filter(function(x){return x;}).join(' ');}
function vinSame(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
// one quick confirm sheet. resolve(true) = Use VIN
function vinSheet(o,lead){
  return new Promise(function(res){
    var old=document.getElementById('vin-sheet');if(old)old.remove();
    var s=document.createElement('div');s.id='vin-sheet';s.className='vin-sheet';s.setAttribute('role','dialog');s.setAttribute('aria-modal','true');s.setAttribute('aria-labelledby','vin-sheet-t');
    s.innerHTML='<div class="vin-card"><div class="vin-t" id="vin-sheet-t">'+esc((lead||'VIN says ')+vinLabel(o)+'. Update?')+'</div>'+
      (o.engine||o.body?'<div class="vin-s">'+esc([o.engine,o.body].filter(function(x){return x;}).join(' / '))+'</div>':'')+
      '<div class="vin-a"><button type="button" class="btn btn-primary" id="vin-use">Use VIN</button><button type="button" class="btn btn-ghost" id="vin-keep">Keep mine</button></div></div>';
    document.body.appendChild(s);
    function done(v){s.remove();res(v);}
    s.querySelector('#vin-use').onclick=function(){done(true);};s.querySelector('#vin-keep').onclick=function(){done(false);};
    s.addEventListener('click',function(e){if(e.target===s)done(false);});
    setTimeout(function(){var b=document.getElementById('vin-use');if(b)b.focus();},30);
  });
}
// ---------- add / edit form ----------
function vinFormReplica(){return !!(document.getElementById('v-replica')||{}).checked;}
function vinAutoForm(){clearTimeout(VIN.tm);VIN.tm=setTimeout(vinFormDecode,450);}
async function vinFormDecode(){
  var vin=cleanVin();
  if(!vinOk(vin)||vinFormReplica())return;          // pre-1981 / not 17 / bad check digit / replica: manual entry stays
  if(VIN.form&&VIN.form.vin===vin&&VIN.form.done)return;
  setVinMsg('Reading the VIN...');
  var o=await vinFetch(vin);
  if(cleanVin()!==vin)return;
  if(!o){setVinMsg('The VIN lookup did not answer. Your entries are kept.');return;}
  var _rh=typeof vrVinHint==='function'?vrVinHint(o.row,val('v-make').trim()):'';
  if(_rh){vrHint(_rh);setVinMsg('VIN decoded as '+vinLabel(o)+'. It may be a replica, so nothing was changed.');VIN.form={vin:vin,done:true,o:null};return;}
  var map={'v-year':o.year,'v-make':o.make,'v-model':o.model,'v-trim':o.trim},k,conflict=false;
  for(k in map)if(map[k]&&val(k).trim()&&!vinSame(val(k),map[k]))conflict=true;
  var use=true;if(conflict)use=await vinSheet(o);
  VIN.form={vin:vin,done:true,o:use?o:null};
  if(!use){setVinMsg('Kept your entries.');return;}
  for(k in map)if(map[k])setVal(k,k==='v-trim'?map[k].slice(0,40):map[k]);
  setVinMsg('Filled from VIN: '+vinLabel(o)+(o.engine?' / '+o.engine:'')+(o.body?' / '+o.body:'')+'.');
}
// called from saveVehicle for the saved object
function vinFormApply(v,isNew){
  try{
    var f=VIN.form;if(!v||!f||!f.o||vinNorm(v.vin)!==f.vin||v.isReplica)return;
    v.engine=f.o.engine||v.engine||'';v.bodyClass=f.o.body||v.bodyClass||'';v.vinDecodedAt=new Date().toISOString();
    VIN.form=null;
    if(!isNew)vinRerun(v.id);
  }catch(e){}
}
function vinRerun(vid){try{var u=getUI(),m=u.valRef||{};delete m[vid];u.valRef=m;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}valueAutoQueue(vid,1500);}
async function vinSyncCols(v){
  if(VIN.cols===false||!v||!v.vinDecodedAt)return;
  try{var r=await sb.from('vehicles').update({trim:v.trim?String(v.trim).slice(0,60):null,engine:v.engine||null,body_class:v.bodyClass||null,vin_decoded_at:v.vinDecodedAt}).eq('id',v.id);
    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))VIN.cols=false;else VIN.cols=true;}catch(e){}
}
// ---------- an existing car (document scan, backfill) ----------
// mode 'ask': conflicts open the sheet; 'quiet': fill empty fields only (background backfill)
async function vinApplyToVehicle(vid,vin,mode,lead){
  var v=byId(getVehicles(),vid);vin=vinNorm(vin||(v&&v.vin));
  if(!v||!canEditVehicle(v)||isArchivedVehicle(v)||v.isReplica||!vinOk(vin))return 'skip';
  var o=await vinFetch(vin);if(!o)return 'nodata';
  if(mode!=='ask'&&typeof vrVinHint==='function'&&vrVinHint(o.row,v.make))return 'replica';
  v=byId(getVehicles(),vid);if(!v)return 'skip';
  var F={year:o.year,make:o.make,model:o.model,trim:o.trim},k,conflict=false,changed=false;
  for(k in F)if(F[k]&&String(v[k]||'').trim()&&!vinSame(v[k],F[k]))conflict=true;
  if(vinNorm(v.vin)&&vinNorm(v.vin)!==vin)conflict=true;
  var use=!conflict;
  if(conflict&&mode==='ask')use=await vinSheet(o,lead);
  var list=getVehicles();v=byId(list,vid);if(!v)return 'skip';
  if(use){for(k in F)if(F[k]&&!vinSame(v[k],F[k])){v[k]=k==='trim'?F[k].slice(0,40):F[k];changed=true;}if(vinNorm(v.vin)!==vin){v.vin=vin;changed=true;}}
  else for(k in F)if(F[k]&&!String(v[k]||'').trim()){v[k]=k==='trim'?F[k].slice(0,40):F[k];changed=true;}
  if(o.engine&&!v.engine){v.engine=o.engine;changed=true;}if(o.body&&!v.bodyClass){v.bodyClass=o.body;changed=true;}
  v.vinDecodedAt=new Date().toISOString();v.updatedAt=v.vinDecodedAt;
  setVehicles(list);
  if(changed){vinRerun(vid);}
  return use?(changed?'updated':'same'):'kept';
}
// one-time backfill for cars that already have a VIN (pull-to-refresh), at most VIN.bf.max per refresh
function vinBackfill(){
  var n=0,list=(typeof activeVehicles==='function'?activeVehicles():getVehicles()).filter(function(v){return v&&!v.vinDecodedAt&&!v.isReplica&&vinOk(v.vin)&&canEditVehicle(v);});
  var todo=list.slice(0,VIN.bf.max);
  return todo.reduce(function(p,v){return p.then(function(){n++;return vinApplyToVehicle(v.id,v.vin,'quiet');});},Promise.resolve()).then(function(){return n;});
}
// ============ v18 DOCUMENT THUMBNAILS + VIEWER (tools/p18_docthumbs.js, patches_docthumbs.py) ============
// Every document with a file shows a thumbnail: the stored _t.jpg (migration_011) or, failing that, one made on this device
// from the file (images: canvas downscale; PDFs: page 1 via pdf.js, lazy-loaded from cdnjs only when needed).
// Thumbnails load when scrolled into view and are cached in memory and in Cache Storage ('evoai-dt-v1', kept by sw.js).
// The bucket is private: every URL is a signed URL, cached until 5 minutes before it expires and re-signed on error.
var DT={sig:{},q:{},qt:0,col:null,mem:{},busy:0,wait:[],io:null,mo:null,view:null,pdf:null,open:{},failed:{}};
var DT_CACHE='evoai-dt-v1',DT_W=360,DT_SIGN_S=3600,DT_OPEN_S=600;
var DT_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
var DT_PDFJS_SRI='sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
function dtNow(){return Date.now();}
function dtKind(d){var m=String(d&&d.mime||'');if(/^image\//.test(m))return 'img';if(m==='application/pdf')return 'pdf';return 'none';}
function dtThumbPathFor(path){return String(path||'').replace(/\.[a-z0-9]+$/i,'')+'_t.jpg';}
// ---------- signed URLs (batched, cached, refreshed before expiry) ----------
function dtSign(path,force){
  if(!path)return Promise.resolve(null);
  var c=DT.sig[path];if(!force&&c&&c.exp-dtNow()>300000)return Promise.resolve(c.u);
  return new Promise(function(res){(DT.q[path]||(DT.q[path]=[])).push(res);if(!DT.qt)DT.qt=setTimeout(dtFlush,25);});
}
function dtFlush(){
  DT.qt=0;var q=DT.q;DT.q={};var ps=Object.keys(q);if(!ps.length)return;var t0=dtNow();
  var done=function(m){ps.forEach(function(p){if(m[p])DT.sig[p]={u:m[p],exp:t0+DT_SIGN_S*1000};else delete DT.sig[p];q[p].forEach(function(f){f(m[p]||null);});});};
  try{sb.storage.from('vehicle-documents').createSignedUrls(ps,DT_SIGN_S).then(function(r){var m={};((r&&r.data)||[]).forEach(function(x){if(x&&x.signedUrl&&x.path)m[x.path]=x.signedUrl;});done(m);},function(){done({});});}catch(e){done({});}
}
// a short-lived URL for opening the real file (PDF new window); pre-signed when the row is on screen so a tap opens synchronously
function dtOpenUrl(path){
  var c=DT.open[path];if(c&&c.exp-dtNow()>60000)return Promise.resolve(c.u);
  var t0=dtNow();
  return sb.storage.from('vehicle-documents').createSignedUrl(path,DT_OPEN_S).then(function(r){var u=r&&r.data&&r.data.signedUrl;if(u)DT.open[path]={u:u,exp:t0+DT_OPEN_S*1000};return u||null;},function(){return null;});
}
function dtOpenFresh(path){var c=DT.open[path];return c&&c.exp-dtNow()>60000?c.u:null;}
// ---------- thumbnail cache ----------
function dtKey(d){return 'https://evoai.local/dt/'+encodeURIComponent(d.thumbPath||d.path||d.id);}
function dtCacheGet(d){
  try{if(!window.caches)return Promise.resolve(null);
    return caches.open(DT_CACHE).then(function(c){return c.match(dtKey(d));}).then(function(r){return r?r.blob():null;}).catch(function(){return null;});}catch(e){return Promise.resolve(null);}
}
function dtCachePut(d,blob){try{if(window.caches&&blob)caches.open(DT_CACHE).then(function(c){return c.put(dtKey(d),new Response(blob,{headers:{'content-type':'image/jpeg'}}));}).catch(function(){});}catch(e){}}
function dtCacheDrop(d){try{if(window.caches)caches.open(DT_CACHE).then(function(c){c.delete(dtKey(d));}).catch(function(){});}catch(e){}}
function dtSlot(fn){return new Promise(function(res,rej){var go=function(){DT.busy++;Promise.resolve().then(fn).then(function(v){DT.busy--;dtNext();res(v);},function(e){DT.busy--;dtNext();rej(e);});};if(DT.busy<3)go();else DT.wait.push(go);});}
function dtNext(){if(DT.wait.length&&DT.busy<3)DT.wait.shift()();}
async function dtFetchBlob(path){
  for(var k=0;k<2;k++){
    var u=await dtSign(path,k>0);if(!u)return null;
    try{var r=await fetch(u,{credentials:'omit'});if(r.ok)return await r.blob();}catch(e){}
  }
  return null;
}
function dtCanvasToJpeg(cv,q){return new Promise(function(res){try{cv.toBlob(function(b){res(b);},'image/jpeg',q||0.8);}catch(e){res(null);}});}
async function dtImgThumb(blob){
  var bm=null,w,h,src;
  try{if(window.createImageBitmap){bm=await createImageBitmap(blob);w=bm.width;h=bm.height;src=bm;}}catch(e){bm=null;}
  if(!bm){src=await new Promise(function(res){var u=URL.createObjectURL(blob),im=new Image();im.onload=function(){res(im);setTimeout(function(){URL.revokeObjectURL(u);},0);};im.onerror=function(){URL.revokeObjectURL(u);res(null);};im.src=u;});if(!src)return null;w=src.naturalWidth;h=src.naturalHeight;}
  if(!w||!h)return null;
  var s=Math.min(1,DT_W/w),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(w*s));cv.height=Math.max(1,Math.round(h*s));
  var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(src,0,0,cv.width,cv.height);
  try{if(bm&&bm.close)bm.close();}catch(e){}
  return dtCanvasToJpeg(cv,0.8);
}
function dtLoadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(DT.pdf)return DT.pdf;
  DT.pdf=new Promise(function(res,rej){
    var s=document.createElement('script');s.src=DT_PDFJS+'pdf.min.js';s.integrity=DT_PDFJS_SRI;s.crossOrigin='anonymous';s.async=true;
    var t=setTimeout(function(){rej(new Error('pdfjs timeout'));},20000);
    s.onload=function(){clearTimeout(t);var L=window.pdfjsLib;if(!L){rej(new Error('pdfjs missing'));return;}try{L.GlobalWorkerOptions.workerSrc=DT_PDFJS+'pdf.worker.min.js';}catch(e){}res(L);};
    s.onerror=function(){clearTimeout(t);rej(new Error('pdfjs load failed'));};
    document.head.appendChild(s);
  });
  DT.pdf.catch(function(){DT.pdf=null;DT.pdfFail=dtNow();});
  return DT.pdf;
}
async function dtPdfThumb(blob){
  if(DT.pdfFail&&dtNow()-DT.pdfFail<60000)return null;
  var L=await dtLoadPdfJs(),buf=await blob.arrayBuffer();
  var task=L.getDocument({data:new Uint8Array(buf),isEvalSupported:false,disableFontFace:false}),doc=await task.promise;
  try{
    var pg=await doc.getPage(1),vp0=pg.getViewport({scale:1}),sc=DT_W/vp0.width,vp=pg.getViewport({scale:sc});
    var cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);
    await pg.render({canvasContext:cx,viewport:vp}).promise;
    return await dtCanvasToJpeg(cv,0.82);
  }finally{try{doc.destroy();}catch(e){}}
}
// best effort thumbnail for a new upload (never blocks the upload for long)
async function dtMakeThumb(blob,mime){
  try{
    var p=/^image\//.test(mime)?dtImgThumb(blob):(mime==='application/pdf'?dtPdfThumb(blob):null);if(!p)return null;
    return await Promise.race([p,new Promise(function(r){setTimeout(function(){r(null);},6000);})]);
  }catch(e){return null;}
}
// returns an object URL for the document thumbnail, or null (tile stays)
function dtThumb(d){
  if(!d)return Promise.resolve(null);
  var k=d.id;if(DT.mem[k])return Promise.resolve(DT.mem[k]);
  if(DT.failed[k]&&dtNow()-DT.failed[k]<120000)return Promise.resolve(null);
  var kind=dtKind(d);if(kind==='none'||(!d.path&&!d.thumbPath))return Promise.resolve(null);
  if(DT.mem['p:'+k])return DT.mem['p:'+k];
  var pr=dtSlot(async function(){
    var b=await dtCacheGet(d);
    var fresh=!b;
    if(!b&&d.thumbPath)b=await dtFetchBlob(d.thumbPath);
    if(!b&&d.path){var f=await dtFetchBlob(d.path);if(f){try{b=kind==='img'?await dtImgThumb(f):await dtPdfThumb(f);}catch(e){b=null;}}}
    if(!b)return null;
    if(fresh)dtCachePut(d,b);
    var u=URL.createObjectURL(b);DT.mem[k]=u;return u;
  }).catch(function(){return null;}).then(function(u){delete DT.mem['p:'+k];if(!u)DT.failed[k]=dtNow();return u;});
  DT.mem['p:'+k]=pr;return pr;
}
// ---------- row thumbnail HTML ----------
var DT_ICON={
  repair_invoice:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  service_record:'<path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="M9 11h6M9 15h4"/>',
  registration:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4M7 14h7M16 10h1"/>',
  insurance:'<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  title:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  inspection:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11l2 2 3.5-4"/>',
  warranty:'<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  other:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
};
function dtCat(d){var a=d.ai;if(a&&a.category)return a.category;return (typeof DOCAI_TYPE_TO_CAT!=='undefined'&&DOCAI_TYPE_TO_CAT[d.type])||'other';}
function dtIcon(cat){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(DT_ICON[cat]||DT_ICON.other)+'</svg>';}
function dtThumbHTML(d){
  var kind=dtKind(d),cat=dtCat(d),lab=docAiCatLabel(cat),fmt=kind==='pdf'?'PDF':(kind==='img'?'Photo':'Note');
  var tile='<span class="dt-tile"><span class="dt-ic">'+dtIcon(cat)+'</span><span class="dt-tl">'+esc(lab)+'</span></span><span class="dt-fmt">'+fmt+'</span>';
  var has=kind!=='none'&&(d.path||d.thumbPath);
  var mem=has&&DT.mem[d.id]&&typeof DT.mem[d.id]==='string'?DT.mem[d.id]:'';
  var img='<img class="dt-img'+(mem?' ld':'')+'" alt=""'+(mem?' src="'+esc(mem)+'"':'')+' draggable="false">';
  if(!has)return '<div class="dt-th dt-none" data-cat="'+esc(cat)+'" aria-hidden="true">'+tile+'</div>';
  return '<button class="dt-th'+(mem?' has':'')+'" type="button" data-dt="'+esc(d.id)+'" data-cat="'+esc(cat)+'" aria-label="Open '+esc(lab)+': '+esc(d.name||'Document')+'" onclick="dtOpen(\''+jsId(d.id)+'\')">'+tile+img+'</button>';
}
// ---------- lazy load ----------
function dtFill(el){
  if(!el||el._dt)return;el._dt=1;
  var id=el.getAttribute('data-dt'),d=byId(getDocs(),id);if(!d)return;
  if(dtKind(d)==='pdf'&&d.path)dtOpenUrl(d.path);   // pre-sign so a tap can open synchronously (iOS PWA)
  dtThumb(d).then(function(u){
    if(!u||!el.isConnected)return;var im=el.querySelector('img.dt-img');if(!im)return;
    im.onload=function(){im.classList.add('ld');el.classList.add('has');};im.src=u;
  });
}
function dtScan(){
  var els=document.querySelectorAll('.dt-th[data-dt]');if(!els.length)return;
  if(!('IntersectionObserver' in window)){[].forEach.call(els,dtFill);return;}
  if(!DT.io)DT.io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){DT.io.unobserve(e.target);dtFill(e.target);}});},{rootMargin:'240px 0px'});
  [].forEach.call(els,function(el){if(!el._dto){el._dto=1;DT.io.observe(el);}});
}
function dtInit(){
  if(DT.mo||!window.MutationObserver)return;var t=0;
  DT.mo=new MutationObserver(function(){if(!t)t=setTimeout(function(){t=0;dtScan();},40);});
  DT.mo.observe(document.body,{childList:true,subtree:true});
  dtScan();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',dtInit);else setTimeout(dtInit,0);
// ---------- open ----------
function dtOpen(id){
  var d=byId(getDocs(),id);if(!d)return;
  var kind=dtKind(d);
  if(kind==='img')return dtOpenImage(d);
  if(kind==='pdf')return dtOpenPdf(d);
}
function dtOpenPdf(d){
  var u=dtOpenFresh(d.path);
  if(u){var w0=window.open(u,'_blank');if(!w0)dtPdfSheet(d,u);return;}
  // no fresh URL yet: open the window inside the tap (iOS keeps it), then point it at the file once signed
  var w=null;try{w=window.open('','_blank');}catch(e){w=null;}
  try{if(w&&w.document){w.document.title='Opening document';w.document.body.style.cssText='background:#07080a;color:#c9aa6b;font:16px -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0';w.document.body.textContent='Opening document...';}}catch(e){}
  dtOpenUrl(d.path).then(function(url){
    if(!url){try{if(w)w.close();}catch(e){}showToast('Could not open this document. Check your connection and try again.','error');return;}
    if(w&&!w.closed){try{w.location.replace(url);return;}catch(e){}}
    dtPdfSheet(d,url);
  });
}
// fallback when the browser blocks the new window: one more tap on a real link
function dtPdfSheet(d,url){
  dtCloseSheet();
  var el=document.createElement('div');el.className='dt-sheet-wrap';el.id='dt-sheet';
  el.innerHTML='<div class="dt-sheet" role="dialog" aria-modal="true" aria-label="Open document"><div class="dt-sheet-t">'+esc(d.name||'Document')+'</div><div class="dt-sheet-s">'+esc(docAiCatLabel(dtCat(d)))+' / PDF</div>'+
    '<a class="btn btn-primary dt-sheet-go" href="'+esc(url)+'" target="_blank" rel="noopener" onclick="setTimeout(dtCloseSheet,300)">Open PDF</a><button class="btn dt-sheet-x" type="button" onclick="dtCloseSheet()">Close</button></div>';
  el.addEventListener('click',function(e){if(e.target===el)dtCloseSheet();});
  document.body.appendChild(el);setTimeout(function(){el.classList.add('on');},10);
}
function dtCloseSheet(){var el=document.getElementById('dt-sheet');if(el&&el.parentNode)el.parentNode.removeChild(el);}
// ---------- full-screen image viewer (pinch / double-tap / wheel zoom, swipe down to close) ----------
function dtOpenImage(d){
  if(DT.view)dtCloseViewer(true);
  var el=document.createElement('div');el.className='dtv';el.id='dtv';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Document viewer');
  el.innerHTML='<div class="dtv-stage" id="dtv-stage"><img id="dtv-img" alt="'+esc(d.name||'Document')+'" draggable="false"></div>'+
    '<div class="dtv-top"><div class="dtv-ttl"><b>'+esc(d.name||'Document')+'</b><span>'+esc(docAiCatLabel(dtCat(d))+' / '+fmtDate(docAiDate(d)))+'</span></div>'+
    '<button class="dtv-x" type="button" aria-label="Close document" id="dtv-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
    '<div class="dtv-load" id="dtv-load"><i></i></div><div class="dtv-hint" id="dtv-hint">Pinch or double-tap to zoom</div>';
  document.body.appendChild(el);
  var V=DT.view={el:el,d:d,s:1,x:0,y:0,ptr:{},d0:0,s0:1,mx:0,my:0,sx:0,sy:0,last:0,swipe:null,opener:document.activeElement,tries:0};
  var st=el.querySelector('#dtv-stage'),im=el.querySelector('#dtv-img');
  function apply(anim){im.style.transition=anim?'transform .22s ease':'none';im.style.transform='translate3d('+V.x+'px,'+V.y+'px,0) scale('+V.s+')';el.classList.toggle('zoomed',V.s>1.02);}
  function clampPan(){var r=st.getBoundingClientRect(),w=im.clientWidth*V.s,h=im.clientHeight*V.s,mx=Math.max(0,(w-r.width)/2),my=Math.max(0,(h-r.height)/2);V.x=Math.max(-mx,Math.min(mx,V.x));V.y=Math.max(-my,Math.min(my,V.y));}
  function zoomAt(ns,cx,cy){ns=Math.max(1,Math.min(6,ns));var r=st.getBoundingClientRect(),ox=cx-(r.left+r.width/2),oy=cy-(r.top+r.height/2),k=ns/V.s;V.x=ox-(ox-V.x)*k;V.y=oy-(oy-V.y)*k;V.s=ns;if(ns<=1.001){V.s=1;V.x=0;V.y=0;}clampPan();apply(false);}
  V.zoomAt=zoomAt;V.apply=apply;
  // placeholder: the cached thumbnail, then the full file
  if(DT.mem[d.id]&&typeof DT.mem[d.id]==='string'){im.src=DT.mem[d.id];im.classList.add('ld','ph');}
  function loadFull(force){dtSign(d.path,force).then(function(u){if(DT.view!==V)return;if(!u){el.querySelector('#dtv-load').classList.add('err');el.querySelector('#dtv-load').textContent='Could not load this document.';return;}
    var pre=new Image();pre.onload=function(){if(DT.view!==V)return;im.src=u;im.classList.remove('ph');im.classList.add('ld');el.querySelector('#dtv-load').style.display='none';};
    pre.onerror=function(){if(DT.view!==V)return;if(V.tries++<1)loadFull(true);else{var l=el.querySelector('#dtv-load');l.classList.add('err');l.textContent='Could not load this document.';}};pre.src=u;});}
  loadFull(false);
  st.addEventListener('pointerdown',function(e){
    try{st.setPointerCapture(e.pointerId);}catch(x){}
    V.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(V.ptr);
    if(ids.length===2){var a=V.ptr[ids[0]],b=V.ptr[ids[1]];V.d0=Math.hypot(a.x-b.x,a.y-b.y)||1;V.s0=V.s;V.swipe=null;}
    else{V.sx=e.clientX;V.sy=e.clientY;V.mx=V.x;V.my=V.y;V.swipe={x:e.clientX,y:e.clientY,moved:0};}
    var h=el.querySelector('#dtv-hint');if(h)h.style.opacity=0;
  });
  st.addEventListener('pointermove',function(e){
    if(!V.ptr[e.pointerId])return;V.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(V.ptr);
    if(ids.length>=2){var a=V.ptr[ids[0]],b=V.ptr[ids[1]],dd=Math.hypot(a.x-b.x,a.y-b.y)||1;zoomAt(V.s0*dd/V.d0,(a.x+b.x)/2,(a.y+b.y)/2);return;}
    if(!V.swipe)return;var dx=e.clientX-V.sx,dy=e.clientY-V.sy;V.swipe.moved=Math.max(V.swipe.moved,Math.hypot(dx,dy));
    if(V.s>1.02){V.x=V.mx+dx;V.y=V.my+dy;clampPan();apply(false);}
    else if(dy>0&&Math.abs(dy)>Math.abs(dx)){im.style.transition='none';im.style.transform='translate3d(0,'+dy+'px,0)';el.style.background='rgba(0,0,0,'+Math.max(.4,1-dy/500)+')';}
  });
  function up(e){
    if(!V.ptr[e.pointerId])return;delete V.ptr[e.pointerId];var sw=V.swipe,n=Object.keys(V.ptr).length;
    if(n===1){var r0=V.ptr[Object.keys(V.ptr)[0]];V.sx=r0.x;V.sy=r0.y;V.mx=V.x;V.my=V.y;V.swipe={x:r0.x,y:r0.y,moved:99};return;}
    if(n>0||!sw)return;V.swipe=null;var dy=e.clientY-sw.y,dx=e.clientX-sw.x;el.style.background='';
    if(sw.moved<8){if(e.timeStamp-V.last<320){V.last=0;if(V.s>1.02){V.s=1;V.x=0;V.y=0;apply(true);}else zoomAt(2.5,e.clientX,e.clientY);}else V.last=e.timeStamp;return;}
    if(V.s>1.02){apply(false);return;}
    if(dy>100&&Math.abs(dy)>Math.abs(dx)){dtCloseViewer();return;}
    V.x=0;V.y=0;apply(true);
  }
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  st.addEventListener('wheel',function(e){e.preventDefault();var dy=e.deltaY*(e.deltaMode===1?16:1);zoomAt(V.s*Math.exp(-Math.max(-400,Math.min(400,dy))*0.002),e.clientX,e.clientY);},{passive:false});
  el.querySelector('#dtv-x').addEventListener('click',function(){dtCloseViewer();});
  V.key=function(e){if(e.key==='Escape'){e.preventDefault();dtCloseViewer();}else if(e.key==='+'||e.key==='='){var r=st.getBoundingClientRect();zoomAt(V.s*1.3,r.left+r.width/2,r.top+r.height/2);}else if(e.key==='-'){var r2=st.getBoundingClientRect();zoomAt(V.s/1.3,r2.left+r2.width/2,r2.top+r2.height/2);}else if(e.key==='Tab'){e.preventDefault();el.querySelector('#dtv-x').focus();}};
  document.addEventListener('keydown',V.key,true);
  document.body.classList.add('dtv-open');
  setTimeout(function(){el.classList.add('on');var x=el.querySelector('#dtv-x');if(x)x.focus();},10);
}
function dtCloseViewer(quick){
  var V=DT.view;if(!V)return;DT.view=null;
  document.removeEventListener('keydown',V.key,true);document.body.classList.remove('dtv-open');
  var el=V.el;el.classList.remove('on');setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},quick?0:180);
  try{if(V.opener&&V.opener.focus&&V.opener.isConnected)V.opener.focus();}catch(e){}
}
// ---------- upload: keep the file, add a stored thumbnail when migration_011 is in ----------
function dtMissingCol(err){var c=err&&err.code,m=String(err&&err.message||'');return c==='42703'||c==='PGRST204'||/thumb_path/.test(m)&&/column|schema cache/i.test(m);}
async function dtInsertDoc(row,blob,mime,path){
  var tb=null,tp=null;
  if(DT.col!==false&&blob&&(/^image\//.test(mime)||mime==='application/pdf')){
    tb=await dtMakeThumb(blob,mime);
    if(tb){tp=dtThumbPathFor(path);
      try{var up=await sb.storage.from('vehicle-documents').upload(tp,tb,{contentType:'image/jpeg',upsert:false});if(up&&up.error)tp=null;}catch(e){tp=null;}}
  }
  var r;
  if(tp){var r1=Object.assign({},row,{thumb_path:tp});r=await sb.from('documents').insert(r1);
    if(r&&r.error&&dtMissingCol(r.error)){DT.col=false;try{await removeObject('vehicle-documents',tp);}catch(e){}tp=null;r=await sb.from('documents').insert(row);}
  }else r=await sb.from('documents').insert(row);
  if(r&&r.error&&tp){try{await removeObject('vehicle-documents',tp);}catch(e){}}
  chk(r);
  if(tp)DT_THUMBS[row.id]=tp;
  if(tb){var d={id:row.id,path:path,thumbPath:tp||''};dtCachePut(d,tb);try{DT.mem[row.id]=URL.createObjectURL(tb);}catch(e){}}
  return tp;
}
var DT_THUMBS={};
async function dtRemoveThumb(id){var tp=DT_THUMBS[id];if(!tp)return;delete DT_THUMBS[id];try{await removeObject('vehicle-documents',tp);}catch(e){}if(DT.mem[id]){try{URL.revokeObjectURL(DT.mem[id]);}catch(e){}delete DT.mem[id];}}
// ---------- document row: thumbnail first, AI category + date + newest-first unchanged ----------
function docRowHTML(d){
  var canDel=docAiCanEdit(d),a=d.ai;
  var cat=a&&a.category?docAiCatLabel(a.category):(d.type?d.type.charAt(0).toUpperCase()+d.type.slice(1):'Other');
  var meta=[];if(a&&a.vendor)meta.push(a.vendor);
  if(a&&a.mileage!=null)meta.push(Number(a.mileage).toLocaleString('en-US')+' mi');
  if(a&&a.amount!=null)meta.push(money(a.amount));
  var badge=a&&(a.status==='scanned'||a.status==='edited')?'<span class="dai-pill">'+(a.status==='edited'?'AI / edited':'Read by AI')+'</span>':'';
  var svc=a&&a.services&&a.services.length?'<div class="dai-svc">'+esc(a.services.slice(0,4).join(' / ')+(a.services.length>4?' / +'+(a.services.length-4)+' more':''))+'</div>':'';
  var btns=(canDel?'<button class="btn btn-sm" onclick="docAiOpenEdit(\''+jsId(d.id)+'\')">Details</button>':'')+(canDel?'<button class="btn btn-sm" onclick="deleteDocument(\''+jsId(d.id)+'\')">Remove</button>':'');
  var exp=(d.expiry||(a&&a.expiresOn))?'<div class="doc-expiry">'+docExpiryHTML((a&&a.expiresOn)||d.expiry)+'</div>':'';
  return '<div class="doc-row dai-row dt-row" data-doc="'+esc(d.id)+'">'+dtThumbHTML(d)+'<div class="dt-body">'+
    '<div class="dt-cat"><span class="dt-catl">'+esc(cat)+'</span><span class="dt-date">'+esc(fmtDate(docAiDate(d)))+'</span></div>'+
    '<div class="doc-name">'+esc(d.name)+badge+'</div>'+
    (meta.length||d.notes?'<div class="doc-meta">'+esc(meta.join(' / '))+(d.notes?(meta.length?' / ':'')+esc(d.notes):'')+'</div>':'')+svc+exp+
    (btns?'<div class="dai-btns dt-btns">'+btns+'</div>':'')+'</div></div>';
}
// ============ v20: Missing indicators + completeness count on the vehicle page (p19) ============
// Columns: vehicles.plate / plate_region (base schema), vehicles.location / insurance_carrier and
// vehicle_financials.purchase_currency (migration_012, optional). Everything is mirrored in the notes
// extras (pl, plr, loc, insc, cur) so it works without migration_012.
var MS={cols:null,fcur:null};
var MS_CUR={USD:'$',EUR:'\u20ac',GBP:'\u00a3'};
function msColFlag(r){if(r&&Object.prototype.hasOwnProperty.call(r,'location'))MS.cols=true;else if(r&&MS.cols===null)MS.cols=false;}
function msLoad(v,r,x,fin){
  msColFlag(r);x=x||{};
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'purchase_currency'))MS.fcur=true;else if(fin&&MS.fcur===null)MS.fcur=false;
  v.plate=cleanText((r&&r.plate)||x.pl||'',20);
  v.plateRegion=cleanText((r&&r.plate_region)||x.plr||'',30);
  v.location=cleanText((r&&r.location)||x.loc||'',120);
  v.insurer=cleanText((r&&r.insurance_carrier)||x.insc||'',80);
  var c=String((fin&&fin.purchase_currency)||x.cur||'USD').toUpperCase();v.currency=MS_CUR[c]?c:'USD';
}
function msX(v){return {pl:v.plate||'',plr:v.plateRegion||'',loc:v.location||'',insc:v.insurer||'',cur:(v.currency&&v.currency!=='USD')?v.currency:''};}
async function msSyncCols(v){
  if(!v||!v.id)return;
  try{await sb.from('vehicles').update({plate:v.plate||null,plate_region:v.plateRegion||null}).eq('id',v.id);}catch(e){}
  if(MS.cols===true){try{var r=await sb.from('vehicles').update({location:v.location||null,insurance_carrier:v.insurer||null}).eq('id',v.id);
    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))MS.cols=false;}catch(e2){}}
  if(MS.fcur===true&&Number(v.purchasePrice)>0){try{var r2=await sb.from('vehicle_financials').update({purchase_currency:v.currency||'USD'}).eq('vehicle_id',v.id);
    if(r2&&r2.error&&(r2.error.code==='42703'||r2.error.code==='PGRST204'))MS.fcur=false;}catch(e3){}}
}
// --- which fields count. Year/make/model counts as one ("Car").
var MS_FIELDS=[
  {k:'car',label:'Car',input:'v-year'},
  {k:'vin',label:'VIN / Chassis no.',input:'v-vin',more:1},
  {k:'reg',label:'Registration',input:'v-plate',more:1},
  {k:'color',label:'Colour',input:'v-color'},
  {k:'miles',label:'Mileage',input:'v-mileage',more:1},
  {k:'paid',label:'What you paid',input:'v-purchase-price',more:1,fin:1},
  {k:'loc',label:'Location',input:'v-location',more:1},
  {k:'ins',label:'Insurance',input:'v-insurer',more:1}
];
function msMoney(n,cur){var s=MS_CUR[cur]||'$';var x=Math.round(Number(n)*100)/100;return s+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function msValue(v,f){
  switch(f.k){
    case 'car':return (v.year&&v.make&&v.model)?[v.year,v.make,v.model].join(' '):'';
    case 'vin':return v.vin||'';
    case 'reg':return v.plate?(v.plate+(v.plateRegion?' / '+v.plateRegion:'')):'';
    case 'color':return v.color||'';
    case 'miles':return Number(v.mileage)>0?fmtNum(v.mileage)+' mi':'';
    case 'paid':return Number(v.purchasePrice)>0?msMoney(v.purchasePrice,v.currency):'';
    case 'loc':return v.location||'';
    case 'ins':return v.insurer||'';
  }
  return '';
}
// Missing shows only to the person who can edit this car: never to techs (shared), co-owners, archived cars, or exports.
function msCanSeeMissing(v){
  if(!v||isArchivedVehicle(v))return false;
  if(typeof coIsMember==='function'&&coIsMember())return false;
  return !!canEditVehicle(v);
}
function msFieldsFor(v){return MS_FIELDS.filter(function(f){return !f.fin||can(v,'view_purchase_info')||canEditVehicle(v);});}
function msCount(v){var fs=msFieldsFor(v),n=0;fs.forEach(function(f){if(msValue(v,f))n++;});return {done:n,total:fs.length};}
function msCountOn(){try{return localStorage.getItem('evoai_ms_count')!=='0';}catch(e){return true;}}
function msSetCount(on){try{localStorage.setItem('evoai_ms_count',on?'1':'0');}catch(e){}var v=byId(getVehicles(),currentVehicleId);if(v)msRender(v);}
function msHTML(v){
  var edit=msCanSeeMissing(v),fs=msFieldsFor(v),c=msCount(v);
  var rows=fs.map(function(f){
    var x=msValue(v,f),val;
    if(x)val='<span class="ms-val'+(f.k==='vin'?' mono':'')+'">'+esc(x)+'</span>';
    else if(edit)val='<button type="button" class="ms-miss" data-f="'+f.k+'" onclick="msEdit(\''+f.k+'\')" aria-label="'+esc(f.label)+' missing. Tap to add">Missing</button>';
    else val='<span class="ms-val ms-none">Not on file</span>';
    return '<div class="ms-row" data-k="'+f.k+'"><span class="ms-lab">'+esc(f.label)+'</span>'+val+'</div>';
  }).join('');
  var chip=(edit&&msCountOn())?'<button type="button" class="ms-chip'+(c.done===c.total?' ms-full':'')+'" onclick="msFirst()" aria-label="'+c.done+' of '+c.total+' details complete">'+c.done+' of '+c.total+' complete</button>':'';
  var hint=(edit&&c.done<c.total)?'<p class="ms-hint">Tap <b>Missing</b> to fill it in.</p>':'';
  return '<section class="ms-sec" aria-label="Key details">'+(chip?'<div class="ms-top">'+chip+'</div>':'')+'<div class="ms-card">'+rows+'</div>'+hint+'</section>';
}
function msRender(v){var el=document.getElementById('vd-key');if(el)el.innerHTML=v?msHTML(v):'';}
function msFirst(){var b=document.querySelector('#vd-key .ms-miss');if(b){b.scrollIntoView({block:'center',behavior:'smooth'});b.focus();}}
function msEdit(k){
  var v=byId(getVehicles(),currentVehicleId);if(!v||!msCanSeeMissing(v))return;
  var f=MS_FIELDS.filter(function(x){return x.k===k;})[0];if(!f)return;
  editCurrentVehicle();
  var id=f.input;
  if(k==='car'){id=!v.year?'v-year':(!v.make?'v-make':'v-model');}
  if(f.more){var m=document.getElementById('v-more');if(m)m.open=true;}
  setTimeout(function(){var el=document.getElementById(id);if(!el)return;
    var g=el.closest('.input-group')||el;g.classList.add('ms-focus');setTimeout(function(){g.classList.remove('ms-focus');},4000);
    try{el.focus({preventScroll:true});}catch(e){el.focus();}g.scrollIntoView({block:'center'});},250);
}
function msFormFill(v){
  setVal('v-plate',v&&v.plate||'');setVal('v-plate-region',v&&v.plateRegion||'');setVal('v-location',v&&v.location||'');setVal('v-insurer',v&&v.insurer||'');
  setVal('v-currency',v&&v.currency&&MS_CUR[v.currency]?v.currency:'USD');
  document.querySelectorAll('#modal-add-vehicle .ms-focus').forEach(function(e){e.classList.remove('ms-focus');});
}
function msFormRead(){
  var c=String(val('v-currency')||'USD').toUpperCase();
  return {plate:cleanText(val('v-plate'),20).toUpperCase(),plateRegion:cleanText(val('v-plate-region'),30),location:cleanText(val('v-location'),120),insurer:cleanText(val('v-insurer'),80),currency:MS_CUR[c]?c:'USD'};
}
// ===== v21: master sheet import + portfolios (p20). Spreadsheets are read in the browser (SheetJS); text PDFs with pdf.js.
// Gemini is only used (via the import-sheet edge function) for unclear headers and scanned sheets/photos.
// Nothing is written until the owner approves it. Only the simplified fields are read.
// ---------- portfolios (migration 013; falls back to one implicit portfolio) ----------
var PO={on:false,cols:null,rows:[],loaded:false};
async function poLoad(){
  try{var r=await sb.from('portfolios').select('*');
    if(r&&r.error)return null;
    return (r&&r.data)||[];}catch(e){return null;}
}
function poSet(rows){PO.loaded=Array.isArray(rows);PO.rows=PO.loaded?rows:[];PO.cols=null;poOnCalc();}
function poOnCalc(){PO.on=!!(PO.loaded&&(PO.rows.length>0||PO.cols===true));}
function poColFlag(r){if(r&&typeof r==='object'){if(Object.prototype.hasOwnProperty.call(r,'portfolio_id'))PO.cols=true;else if(PO.cols===null)PO.cols=false;}poOnCalc();}
function poApplyRow(v,r){poColFlag(r);v.portfolioId=(r&&r.portfolio_id)||null;}
function poList(owner){
  if(PO.on){
    var l=PO.rows.filter(function(p){return p.owner_id===owner;}).map(function(p){return {id:p.id,name:p.name,country:p.country||'',currency:p.currency||'USD',isDefault:!!p.is_default,sort:p.sort_order||0};});
    l.sort(function(a,b){return (b.isDefault-a.isDefault)||(a.sort-b.sort)||String(a.name).localeCompare(String(b.name));});
    if(l.length)return l;
  }
  return [{id:null,name:'My collection',country:'',currency:'USD',isDefault:true,implicit:true}];
}
function poDefault(owner){var l=poList(owner);return l[0];}
function poOf(v,owner){var l=poList(owner||v.clientId);if(!PO.on||!v.portfolioId)return l[0];for(var i=0;i<l.length;i++)if(l[i].id===v.portfolioId)return l[i];return l[0];}
function poCount(owner,p){return getVehicles().filter(function(v){return v.clientId===owner&&!isArchivedVehicle(v)&&(poOf(v,owner).id===p.id);}).length;}
async function poCreate(owner,name,country,currency){
  if(!PO.on)throw new Error('Portfolios are not turned on yet.');
  var row={id:uid(),owner_id:owner,name:cleanText(name,80),country:country||null,currency:currency||'USD',sort_order:PO.rows.filter(function(p){return p.owner_id===owner;}).length,is_default:false};
  var r=await sb.from('portfolios').insert(row);
  if(r&&r.error)throw new Error((r.error&&r.error.message)||'Could not create the portfolio.');
  row.created_at=new Date().toISOString();PO.rows.push(row);return row.id;
}
function poFlag(c){c=String(c||'').toUpperCase();if(!/^[A-Z]{2}$/.test(c))return '';return String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65,0x1F1E6+c.charCodeAt(1)-65);}
// ---------- constants ----------
var IM={step:0,busy:false,msg:'',owner:null,file:null,rows:[],pfId:null,newPf:null,res:{},appr:{},add:{},tab:'changes',done:null,id:''};
var IM_SHEETJS='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
var IM_SHEETJS_SRI='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
var IM_CUR={USD:'$',EUR:'\u20ac',GBP:'\u00a3'};
var IM_LABEL={year:'Year',make:'Make',model:'Model',vin:'VIN / chassis',reg:'Registration',color:'Colour',miles:'Mileage',paid:'What you paid',loc:'Location',ins:'Insurance'};
var IM_ORDER=['year','make','model','vin','reg','color','miles','paid','loc','ins'];
var IM_DAY_CAP=5;
// ---------- header mapping ----------
function imNorm(s){return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function imHeaderField(h){
  var s=imNorm(h);if(!s)return '';
  if(/\b(cost|paid|purchase|basis)\b/.test(s)&&!/\bestimat/.test(s))return 'paid';
  if(/\b(check|expiry|expires|expiration|renewal|renew|estimated|est|value|nickname|owner|date|notes?|remarks?|condition|drivetrain|policy no)\b/.test(s)&&!/\binsurance\b/.test(s))return '';
  if(/^(model )?year$|^yr$|^year built$/.test(s))return 'year';
  if(/^(make|manufacturer|marque|brand)$/.test(s))return 'make';
  if(/^model\b|^description$|^item description$/.test(s))return 'model';
  if(/\b(vin|chassis|serial|frame)\b/.test(s))return 'vin';
  if(/\b(registration|plate|licen[cs]e|reg|rego)\b/.test(s))return 'reg';
  if(/\bcolou?r\b/.test(s))return 'color';
  if(/\b(mileage|odometer|miles|kilometres|kilometers|km)\b/.test(s))return 'miles';
  if(/\b(location|garage|stored|storage|kept)\b/.test(s))return 'loc';
  if(/\b(insurance|insurer|carrier)\b/.test(s))return 'ins';
  if(/^(no|#|item|row|id)$/.test(s)||s==='')return '';
  return null; // unknown
}
function imMapHeaders(hdr){var m={},unk=[];hdr.forEach(function(h,i){var f=imHeaderField(h);if(f===null){if(String(h||'').trim())unk.push(i);return;}if(f&&!(f in m))m[f]=i;});return {map:m,unknown:unk};}
// ---------- value cleaning ----------
var IM_BLANK=/^(missing|n\/?a|na|none|nil|tbc|tba|unknown|-+|\u2014|\u2013|\?+)$/i;
function imCell(s){s=String(s==null?'':s).replace(/\s+/g,' ').trim();return IM_BLANK.test(s)?'':s;}
function imUnclear(s){var m=/^unclear\s*:\s*(.*)$/i.exec(s);if(!m)return null;var t=m[1].replace(/\([^)]*\)/g,' ').replace(/\?\s*$/,'').replace(/\?\s*(\/)/,' $1').replace(/\s+/g,' ').trim();return t;}
function imStripDrive(s){return String(s||'').replace(/\(\s*(left|right)[\s-]*hand[\s-]*drive\s*\)/ig,'').replace(/\b(left|right)[\s-]*hand[\s-]*drive\b/ig,'').replace(/\s+/g,' ').replace(/\(\s*\)/g,'').trim();}
function imVinClean(s){s=String(s||'').replace(/^(chassis|vin|serial|frame)(\s*(number|no\.?|#))?\s*[:#-]?\s*/i,'');return s.replace(/\s+/g,'').toUpperCase().slice(0,24);}
var IM_VT={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},IM_VW=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function imVinExpect(v){v=String(v||'').toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return null;var s=0;for(var i=0;i<17;i++){var c=v[i];s+=(/[0-9]/.test(c)?+c:IM_VT[c])*IM_VW[i];}var r=s%11;return r===10?'X':String(r);}
function imMoney(s){
  s=String(s||'').trim();if(!s)return null;
  if(/~|\u2013|\u2014|\bto\b|\d\s*-\s*[$\u20ac\u00a3\d]|\d\s*k\b|approx|est/i.test(s))return {range:true};
  var cur=null;
  if(/\$|\bUSD\b/i.test(s))cur='USD';else if(/\u20ac|\bEUR\b/i.test(s))cur='EUR';else if(/\u00a3|\bGBP\b/i.test(s))cur='GBP';
  else if(/[A-Za-z]{3}|R\s?\d/.test(s.replace(/[\d.,\s]/g,'')))return {bad:true};
  var n=s.replace(/[^0-9.,]/g,'');
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(n))n=n.replace(/\./g,'').replace(',','.');else n=n.replace(/,/g,'');
  var v=parseFloat(n);if(!isFinite(v)||v<=0)return null;
  return {v:Math.round(v*100)/100,cur:cur||'USD',raw:s};
}
function imMiles(s){
  s=String(s||'').trim();if(!s)return null;
  var km=/\bkm\b|kilomet/i.test(s),n=s.replace(/[^0-9.,]/g,'').replace(/,/g,'');
  var v=parseFloat(n);if(!isFinite(v)||v<0||!/\d/.test(s))return null;
  return {v:Math.round(v),km:km};
}
function imSplitReg(s){var p=String(s||'').split(/\s+\/\s+/);return {plate:cleanText(p[0]||'',20),region:cleanText(p.slice(1).join(' / ')||'',30)};}
function imExtColor(s){return cleanText(String(s||'').split(/\s+\/\s+/)[0],40);}
function imInsurer(s){return cleanText(String(s||'').split(/\s+/).filter(function(t){return !/\d/.test(t);}).join(' '),80);}
// Turn one raw record {field:text} into {f:{...},u:{field:{val,note}},label}
function imCleanBase(raw){
  var f={year:'',make:'',model:'',vin:'',plate:'',region:'',color:'',miles:null,paid:null,cur:'USD',loc:'',ins:''},u={};
  function take(k,fn){var s=imCell(raw[k]);if(!s)return;var q=imUnclear(s);if(q!==null){var r=q?fn(q,true):null;if(r!==null&&r!==undefined)u[k]={val:r,raw:s};return;}var r2=fn(s,false);if(r2!==null&&r2!==undefined)set(k,r2);}
  function set(k,r){if(k==='reg'){f.plate=r.plate;f.region=r.region;}else if(k==='miles'){if(r.km){u.miles={val:r,raw:raw.miles,km:true};}else f.miles=r.v;}else if(k==='paid'){f.paid=r.v;f.cur=r.cur;}else f[k]=r;}
  take('year',function(s){var m=/\b(18[89]\d|19\d\d|20\d\d)\b/.exec(s);return m?m[1]:null;});
  take('make',function(s){return cleanText(imStripDrive(s),40)||null;});
  take('model',function(s){return cleanText(imStripDrive(s),60)||null;});
  take('vin',function(s){var v=imVinClean(s);return v.length>=4?v:null;});
  take('reg',function(s){var r=imSplitReg(s);return r.plate?r:null;});
  take('color',function(s){return imExtColor(s)||null;});
  take('miles',function(s){var m=imMiles(s);return m;});
  take('paid',function(s){var m=imMoney(s);return (m&&!m.range&&!m.bad)?m:null;});
  take('loc',function(s){return cleanText(s,120)||null;});
  take('ins',function(s){return imInsurer(s)||null;});
  // unclear values that were set via u: normalise shapes
  if(u.reg&&u.reg.val&&u.reg.val.plate===undefined)delete u.reg;
  if(u.miles&&!u.miles.km&&u.miles.val&&u.miles.val.km){u.miles.km=true;}
  if(u.paid&&u.paid.val&&u.paid.val.v===undefined)delete u.paid;
  return {f:f,u:u};
}
function imIsData(raw){var y=/\b(18[89]\d|19\d\d|20\d\d)\b/.test(String(raw.year||''));var mk=imCell(raw.make)||imCell(raw.model);return !!((y||imCell(raw.vin))&&mk&&!/^unclear/i.test(String(raw.make||'')));}
function imRecords(grid,map){
  var out=[];
  for(var i=0;i<grid.length;i++){
    var row=grid[i]||[],raw={};
    for(var k in map)if(map.hasOwnProperty(k))raw[k]=row[map[k]]==null?'':String(row[map[k]]);
    if(!imIsData(raw))continue;
    var c=imClean(raw);c.n=out.length+1;c.raw=raw;out.push(c);
  }
  return out;
}
// ---------- spreadsheet (xlsx / csv) ----------
function imLoadScript(src,sri,test){
  if(test())return Promise.resolve();
  return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;if(sri){s.integrity=sri;s.crossOrigin='anonymous';}s.async=true;
    var t=setTimeout(function(){rej(new Error('timeout'));},25000);
    s.onload=function(){clearTimeout(t);test()?res():rej(new Error('missing'));};s.onerror=function(){clearTimeout(t);rej(new Error('load failed'));};document.head.appendChild(s);});
}
function imLoadSheetJS(){return imLoadScript(IM_SHEETJS,IM_SHEETJS_SRI,function(){return !!window.XLSX;});}
function imPickGrid(wb){
  var best=null;
  wb.SheetNames.forEach(function(n,si){
    if(/discrep|legend|notes?$|summary of changes/i.test(n)&&wb.SheetNames.length>1)return;
    var grid=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''});
    for(var r=0;r<Math.min(grid.length,15);r++){var m=imMapHeaders(grid[r]);var score=Object.keys(m.map).length;
      if(score>=3&&(!best||score>best.score))best={sheet:n,hr:r,hdr:grid[r],map:m.map,unknown:m.unknown,grid:grid.slice(r+1),score:score};}
  });
  return best;
}
// ---------- PDF with a text layer ----------
async function imPdfLines(buf){
  var L=await dtLoadPdfJs();
  var doc=await L.getDocument({data:new Uint8Array(buf)}).promise,pages=[],chars=0;
  for(var p=1;p<=doc.numPages;p++){
    var pg=await doc.getPage(p),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent({disableCombineTextItems:true}),items=[];
    tc.items.forEach(function(it){var s=String(it.str||'');if(!s.trim())return;chars+=s.trim().length;var x=it.transform[4],y=vp.height-it.transform[5],w=it.width||0,h=Math.abs(it.transform[3])||it.height||8;items.push({s:s.trim(),x:x,y:y,w:w,h:h});});
    items.sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var lines=[];items.forEach(function(it){var l=lines.length?lines[lines.length-1]:null;if(l&&Math.abs(l.y-it.y)<=Math.max(2,it.h*0.35)){l.items.push(it);}else lines.push({y:it.y,h:it.h,items:[it]});});
    lines.forEach(function(l){l.items.sort(function(a,b){return a.x-b.x;});l.text=l.items.map(function(i){return i.s;}).join(' ');});
    pages.push(lines);
  }
  return {pages:pages,chars:chars};
}
function imPdfHeaderCols(line){
  var cols=[];line.items.forEach(function(it){var l=cols.length?cols[cols.length-1]:null;if(l&&it.x-(l.x+l.w)<it.h*0.45){l.s+=' '+it.s;l.w=it.x+it.w-l.x;}else cols.push({s:it.s,x:it.x,w:it.w});});
  return cols;
}
function imPdfTable(pdf){
  var hdrNames=null,recs=[];
  pdf.pages.forEach(function(lines){
    var hi=-1;for(var i=0;i<lines.length;i++){var t=imNorm(lines[i].text);if(/\bmake\b/.test(t)&&(/\bvin\b/.test(t)||/\byear\b/.test(t))){hi=i;break;}}
    if(hi<0)return;
    var cols=imPdfHeaderCols(lines[hi]);if(!hdrNames)hdrNames=cols.map(function(c){return c.s;});
    var cur=null,lastY=null,gap=[];
    function span(j){return [j===0?-1e9:cols[j].x-4,j===cols.length-1?1e9:cols[j+1].x-4];}
    function colOf(it){if(/^[~$\u20ac\u00a3]/.test(it.s)||/^\d[\d,.]*$/.test(it.s)&&it.s.length>4){var e=it.x+it.w-2;for(var q=0;q<cols.length;q++){var sq=span(q);if(e>=sq[0]&&e<sq[1])return q;}}var best=0,bo=-1;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>bo){bo=o;best=j;}}return best;}
    function wide(it){var n=0;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>8)n++;}return n>2;}
    for(var i2=hi+1;i2<lines.length;i2++){
      var ln=lines[i2];
      if(/^page \d+( of \d+)?$/i.test(ln.text.trim()))continue;
      var first=ln.items[0],startsRec=colOf(first)===0&&/^\d{1,3}$/.test(first.s);
      if(!startsRec&&cur&&(colOf(first)===0||ln.items.some(wide))){cur=null;break;}
      if(lastY!==null&&cur){var d=ln.y-lastY,med=gap.length?gap.slice().sort(function(a,b){return a-b;})[Math.floor(gap.length/2)]:ln.h*1.3;if(!startsRec&&d>Math.max(med*2.2,ln.h*2.4)){cur=null;break;}gap.push(d);}
      if(startsRec){cur={cells:cols.map(function(){return '';})};recs.push(cur);}
      lastY=ln.y;
      if(!cur)continue;
      ln.items.forEach(function(it){var k=colOf(it);cur.cells[k]=(cur.cells[k]?cur.cells[k]+' ':'')+it.s;});
    }
  });
  if(!hdrNames)return null;
  return {hdr:hdrNames,grid:recs.map(function(r){return r.cells.map(function(s){return s.replace(/-\s+(?=[a-z])/g,'-').replace(/\s+/g,' ').trim();});})};
}
// ---------- AI (edge function import-sheet; source only until deployed) ----------
function imAiOk(){return typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function';}
function imB64(buf){var b=new Uint8Array(buf),s='',i,ch=0x8000;for(i=0;i<b.length;i+=ch)s+=String.fromCharCode.apply(null,b.subarray(i,i+ch));return btoa(s);}
async function imAi(body){
  if(!imAiOk())throw new Error('AI reading is not turned on yet. Use an Excel or CSV file.');
  body.import_id=IM.id;
  var r;try{r=await sb.functions.invoke('import-sheet',{body:body});}catch(e){r={error:e};}
  if(r&&r.error){var b=null;try{if(r.error.context&&typeof r.error.context.json==='function')b=await r.error.context.json();}catch(e){}
    if(b&&b.error==='daily_limit')throw new Error('You have used today\'s '+IM_DAY_CAP+' AI imports. Try again tomorrow, or use an Excel or CSV file.');
    throw new Error((b&&b.message)||'AI reading is not available right now. Use an Excel or CSV file.');}
  return (r&&r.data)||{};
}
// ---------- read a file into IM.rows ----------
async function imReadFileBase(file){
  var name=String(file.name||'sheet'),low=name.toLowerCase(),type=String(file.type||'');
  if(file.size>15*1024*1024)throw new Error('That file is bigger than 15 MB. Please use a smaller file.');
  var buf=await file.arrayBuffer(),how='';
  var kind=/\.pdf$/.test(low)||type==='application/pdf'?'pdf':(/^image\//.test(type)||/\.(jpe?g|png|heic|webp)$/.test(low))?'image':(/\.(xlsx|xls|xlsm|csv|tsv|ods)$/.test(low)||/sheet|excel|csv/.test(type))?'sheet':'';
  if(!kind)throw new Error('Please choose an Excel (.xlsx), CSV, or PDF file, or a photo of the sheet.');
  var t=null,rows=null;
  if(kind==='sheet'){
    try{await imLoadSheetJS();}catch(e){throw new Error('Could not open the spreadsheet reader. Check your connection and try again.');}
    var wb=/\.(csv|tsv)$/.test(low)?XLSX.read(new TextDecoder().decode(buf),{type:'string'}):XLSX.read(buf,{type:'array'});
    var g=imPickGrid(wb);
    if(!g){t=null;var ws=wb.Sheets[wb.SheetNames[0]],grid=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});if(grid.length)t={hdr:grid[0],grid:grid.slice(1),map:imMapHeaders(grid[0]).map,unknown:imMapHeaders(grid[0]).unknown};}
    else t={hdr:g.hdr,grid:g.grid,map:g.map,unknown:g.unknown};
    how='sheet';
  }else if(kind==='pdf'){
    var pdf=null;try{pdf=await imPdfLines(buf);}catch(e){pdf=null;}
    var tb=pdf&&pdf.chars>40?imPdfTable(pdf):null;
    if(tb){var mh=imMapHeaders(tb.hdr);t={hdr:tb.hdr,grid:tb.grid,map:mh.map,unknown:mh.unknown};how='pdf';}
  }
  if(t){
    var need=['make','year'].filter(function(k){return !(k in t.map);}).concat(('model' in t.map)?[]:['model']).concat(('vin' in t.map)?[]:['vin']);
    if(need.length&&t.unknown.length){ // unclear headers: ask AI for the mapping only
      var hdrs=t.unknown.map(function(i){return String(t.hdr[i]);}),samples=t.grid.slice(0,3).map(function(r){return t.unknown.map(function(i){return String(r[i]==null?'':r[i]).slice(0,60);});});
      try{var a=await imAi({mode:'headers',headers:hdrs,samples:samples});var mp=(a&&a.mapping)||{};
        t.unknown.forEach(function(i,j){var f=mp[hdrs[j]];if(f&&IM_LABEL[f]&&!(f in t.map))t.map[f]=i;});IM.usedAi=true;}catch(e){if(!('make' in t.map)&&!('model' in t.map))throw e;}
    }
    if(!('make' in t.map)&&!('model' in t.map))throw new Error('We could not find Make or Model columns. Please check the header row of your sheet.');
    rows=imRecords(t.grid,t.map);
  }else{
    // scanned PDF or photo: AI reads the rows
    if(buf.byteLength>8*1024*1024)throw new Error('That scan is over 8 MB. Please use a smaller scan.');
    var mime=kind==='pdf'?'application/pdf':(type||'image/jpeg');
    var ai=await imAi({mode:'rows',mime:mime,file_base64:imB64(buf)});IM.usedAi=true;how='ai';
    rows=(Array.isArray(ai.rows)?ai.rows:[]).map(function(r){return {year:r.year,make:r.make,model:r.model,vin:r.vin,reg:[r.registration,r.region].filter(Boolean).join(' / '),color:r.colour||r.color,miles:r.mileage,paid:r.paid,loc:r.location,ins:r.insurance};}).filter(imIsData).map(function(raw,i){var c=imClean(raw);c.n=i+1;c.raw=raw;return c;});
  }
  if(!rows.length)throw new Error('We could not find any vehicles in that file.');
  return {name:name,kind:kind,how:how,rows:rows.slice(0,500)};
}
// ---------- matching + review analysis (pure: rows + resolutions -> changes/new/conflicts) ----------
function imToks(s){return imNorm(imStripDrive(s)).split(' ').filter(function(t){return t&&['the','and','coupe','tribute','car','lhd','rhd'].indexOf(t)<0;});}
function imPlateKey(p){return String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function imCarName(f){return [f.year,f.make,f.model].filter(Boolean).join(' ');}
function imSimilar(f,v){
  var A=imToks(f.make+' '+f.model),B=imToks(v.make+' '+v.model);
  if(!A.length||!B.length||A[0]!==B[0])return 0;
  var a=A.slice(1),b=B.slice(1);if(!a.length||!b.length)return a.length===b.length?1:0.5;
  var hit=a.filter(function(t){return b.indexOf(t)>=0;}).length;
  return hit/Math.min(a.length,b.length);
}
function imCollection(owner){return getVehicles().filter(function(v){return v.clientId===owner&&!isArchivedVehicle(v);});}
function imCur(v,k){
  if(k==='reg')return {plate:v.plate||'',region:v.plateRegion||''};
  if(k==='miles')return Number(v.mileage)>0?Number(v.mileage):null;
  if(k==='paid')return Number(v.purchasePrice)>0?{v:Number(v.purchasePrice),cur:v.currency||'USD'}:null;
  var m={year:'year',make:'make',model:'model',vin:'vin',color:'color',loc:'location',ins:'insurer'};return String(v[m[k]]||'');
}
function imSheetVal(f,k){if(k==='reg')return f.plate?{plate:f.plate,region:f.region}:null;if(k==='paid')return f.paid?{v:f.paid,cur:f.cur}:null;if(k==='miles')return f.miles;return f[k]||'';}
function imEmpty(x){return x===null||x===undefined||x===''||(typeof x==='object'&&x.plate==='');}
function imSame(k,a,b){
  if(imEmpty(a)||imEmpty(b))return imEmpty(a)&&imEmpty(b);
  if(k==='reg')return imPlateKey(a.plate)===imPlateKey(b.plate)&&(!b.region||imNorm(a.region)===imNorm(b.region));
  if(k==='paid')return Math.abs(a.v-b.v)<0.005&&a.cur===b.cur;
  if(k==='miles')return Number(a)===Number(b);
  if(k==='vin')return imVinClean(a)===imVinClean(b);
  if(k==='model')return imNorm(a)===imNorm(b)||imNorm(b).indexOf(imNorm(a))===0;
  return imNorm(a)===imNorm(b);
}
function imFmt(k,x){
  if(imEmpty(x))return '';
  if(k==='reg')return x.plate+(x.region?' / '+x.region:'');
  if(k==='paid')return (IM_CUR[x.cur]||'')+Number(x.v).toLocaleString('en-US',{minimumFractionDigits:x.v%1?2:0,maximumFractionDigits:2})+(IM_CUR[x.cur]?'':' '+x.cur);
  if(k==='miles')return Number(x).toLocaleString('en-US')+' mi';
  return String(x);
}
// effective fields of a sheet row after the owner's conflict choices
function imRowFields(r,ri,res){
  var f=JSON.parse(JSON.stringify(r.f));
  for(var k in r.u)if(r.u.hasOwnProperty(k)){var c=res['u'+ri+':'+k];if(c==='use'){var x=r.u[k];
    if(k==='reg'){f.plate=x.val.plate;f.region=x.val.region;}else if(k==='miles'){f.miles=x.km?Math.round(x.val.v*0.621371):x.val.v;}else if(k==='paid'){f.paid=x.val.v;f.cur=x.val.cur;}else f[k]=x.val;}}
  var ev=res['vin'+ri];if(ev&&ev.edit!==undefined)f.vin=ev.edit;
  return f;
}
function imAnalyze(rows,owner,pfId,res){
  res=res||{};
  var col=imCollection(owner),out={changes:[],news:[],conflicts:[],matched:{},skip:{}},used={};
  var pfName=function(v){return poOf(v,owner).name;},target=pfId;
  rows.forEach(function(r,ri){
    var blocked=false,f;
    // unclear values: owner decides
    for(var k in r.u)if(r.u.hasOwnProperty(k)){
      var key='u'+ri+':'+k,x=r.u[k],core=(k==='year'||k==='make'||k==='model');
      var shown=k==='miles'&&x.km?(Number(x.val.v).toLocaleString('en-US')+' km = '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi'):imFmt(k,k==='miles'?x.val.v:x.val);
      if(res[key]==='skipcar'){out.skip[ri]=1;blocked=true;break;}
      if(!res[key]){out.conflicts.push({key:key,ri:ri,type:'unclear',field:k,title:(x.km?'Mileage in km':IM_LABEL[k]+' unclear on sheet'),car:imCarName(r.f)||('Row '+r.n),lines:[['Sheet says',shown]],opts:[{v:'use',label:x.km?'Use '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi':'Use it',gold:true},{v:core?'skipcar':'skip',label:core?'Skip this car':'Leave blank'}]});
        if(core)blocked=true;}
    }
    if(out.skip[ri]||blocked)return;
    f=imRowFields(r,ri,res);
    // VIN check digit on 17-character VINs
    if(f.vin.length===17&&!(Number(f.year)&&Number(f.year)<1981)){
      var exp=imVinExpect(f.vin),vk='vin'+ri;
      if(exp===null||exp!==f.vin[8]){
        if(!res[vk]){out.conflicts.push({key:vk,ri:ri,type:'vincheck',title:'VIN check failed',car:imCarName(f),vin:f.vin,lines:[['Sheet',f.vin]],note:exp===null?'This VIN has letters that VINs never use (I, O or Q).':'Check digit should be '+exp+', the sheet has '+f.vin[8]+'.',opts:[{v:'keep',label:'Keep as is'},{v:'edit',label:'Edit VIN',gold:true}]});return;}
      }
    }
    if(!f.make&&!f.model){out.skip[ri]=1;return;}
    // matching across the whole collection
    var mk='m'+ri,choice=res[mk],m=null,how='';
    var vin=imVinClean(f.vin),cands=[];
    col.forEach(function(v){
      var vv=imVinClean(v.vin);
      if(vin&&vv&&vin===vv){cands.push({v:v,how:vin.length===17?'vin':'chassis',s:2});return;}
      if(vin&&vv&&vin!==vv)return; // two different VINs: not the same car
      var sim=imSimilar(f,v);if(sim<0.5)return;
      var ye=String(v.year)===String(f.year);
      if(ye)cands.push({v:v,how:'ymm',s:sim});else if(sim>=0.99&&f.year&&v.year)cands.push({v:v,how:'year',s:sim*0.9});
    });
    cands.sort(function(a,b){return b.s-a.s;});
    if(choice==='new'){m=null;}
    else if(choice&&choice!=='skip'){m=col.filter(function(v){return v.id===choice;})[0]||null;how='chosen';}
    else if(choice==='skip'){out.skip[ri]=1;return;}
    else if(cands.length){
      var c0=cands[0],yr=Number(f.year)||Number(c0.v.year)||0,yearDiff=String(c0.v.year)!==String(f.year)&&f.year;
      if(c0.how==='vin'&&!yearDiff){m=c0.v;how='vin';}
      else if(c0.how==='ymm'&&cands.filter(function(c){return c.how==='ymm';}).length===1&&yr>=1981&&!(vin&&c0.v.vin)&&vin.length!==17&&!yearDiff){m=c0.v;how='ymm';}
      else{
        var by=c0.how==='vin'?'VIN '+vin:c0.how==='chassis'?'chassis '+vin:'year, make and model';
        if(yearDiff){
          out.conflicts.push({key:mk,ri:ri,type:'year',title:'Year differs',car:imVName(c0.v),lines:[['Your car',String(c0.v.year)],['Sheet',String(f.year)]],note:'Matched by '+(c0.how==='year'?'make and model':by)+'.',opts:[{v:c0.v.id+'|keep',label:'Keep '+c0.v.year},{v:c0.v.id+'|use',label:'Use '+f.year,gold:true},{v:'new',label:'Not the same car'}]});
        }else{
          var o=cands.slice(0,3).map(function(c){return {v:c.v.id,label:'Same as '+imVName(c.v),gold:true};});o.push({v:'new',label:'No, add as new'});
          out.conflicts.push({key:mk,ri:ri,type:'match',title:'Is this the same car?',car:imCarName(f),lines:[['Sheet',imCarName(f)+(vin?' \u00b7 '+vin:'')],['Your car',imVName(c0.v)+(c0.v.vin?' \u00b7 '+c0.v.vin:'')]],note:(c0.how==='chassis'?'Matched by chassis '+vin+'. Older chassis numbers are never matched automatically.':yr&&yr<1981?'Cars before 1981 are never matched automatically.':'More than one way this could match.'),opts:o});
        }
        return;
      }
    }
    if(choice&&choice.indexOf('|')>0){var pr=choice.split('|');m=col.filter(function(v){return v.id===pr[0];})[0]||null;how='chosen';if(m&&pr[1]==='keep')f.year=String(m.year);}
    if(m){
      if(used[m.id]!==undefined){out.conflicts.push({key:'d'+ri,ri:ri,type:'dupe',title:'Listed twice on the sheet',car:imVName(m),lines:[['Rows',rows[used[m.id]].n+' and '+r.n]],note:'Only the first row is used.',opts:[]});return;}
      used[m.id]=ri;
      if(PO.on&&target&&poOf(m,owner).id!==target&&res['p'+ri]!=='here'){
        if(res['p'+ri]!=='skip')out.conflicts.push({key:'p'+ri,ri:ri,type:'otherpf',title:'Already in another portfolio',car:imVName(m),lines:[['Portfolio',pfName(m)]],note:'This car is already in your collection, in '+pfName(m)+'.',opts:[{v:'here',label:'Update it there',gold:true},{v:'skip',label:'Skip'}]});
        return;
      }
      out.matched[ri]=m.id;
      IM_ORDER.forEach(function(k){
        var sv=imSheetVal(f,k);if(imEmpty(sv))return;var cv=imCur(m,k);
        if(k==='make'||(k==='model'&&!imEmpty(cv)))return; // name differences are not changes
        if(k==='year'&&!(choice&&choice.indexOf('|use')>0))return;
        if(imSame(k,cv,sv))return;
        out.changes.push({key:'c'+ri+':'+k,ri:ri,vid:m.id,field:k,car:imVName(m),cur:imFmt(k,cv),val:imFmt(k,sv),raw:sv,forced:k==='year'});
      });
    }else{
      if(!f.year||!f.make){out.conflicts.push({key:'n'+ri,ri:ri,type:'incomplete',title:'Year or make missing',car:imCarName(f)||('Row '+r.n),lines:[['Sheet row',String(r.n)]],note:'A new car needs a year, make and model. Add this one by hand.',opts:[]});return;}
      out.news.push({key:'a'+ri,ri:ri,f:f});
    }
  });
  return out;
}
function imVName(v){return [v.year,v.make,v.model].filter(Boolean).join(' ')||'Vehicle';}
// ---------- UI ----------
function imE(s){return esc(String(s==null?'':s));}
function imOwnerFor(preset){
  var o=ownerClientId();if(o&&canAddVehicleFor(o))return o;
  if(preset&&canAddVehicleFor(preset))return preset;
  var pg=document.querySelector('.page.active');
  if(pg&&pg.id==='page-client-detail'&&currentClientId&&canAddVehicleFor(currentClientId))return currentClientId;
  var ad=getClients().filter(function(c){return canAddVehicleFor(c.id);});return ad.length===1?ad[0].id:null;
}
function imOpen(preset){
  if(typeof requireAdvisor==='function'&&!requireAdvisor())return;
  if(!getClients().some(function(c){return canAddVehicleFor(c.id);})&&!(ownerClientId()&&canAddVehicleFor(ownerClientId()))){showToast('You cannot add vehicles to this collection.','error');return;}
  IM={step:1,busy:false,msg:'',owner:imOwnerFor(preset),file:null,rows:[],pfId:null,newPf:null,res:{},appr:{},add:{},tab:'changes',done:null,id:uid(),edit:null};
  var r=document.getElementById('im-root');
  if(!r){r=document.createElement('div');r.id='im-root';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label','Import master sheet');document.body.appendChild(r);}
  r.style.display='block';document.body.classList.add('im-open');imRender();
}
function imClose(){var r=document.getElementById('im-root');if(r){r.style.display='none';r.innerHTML='';}document.body.classList.remove('im-open');var ch=IM.done&&!IM.done.undone;IM={step:0};if(ch)refreshCurrent();}
function imBack(){if(IM.busy)return;if(IM.step===2||(IM.step===3)){IM.step--;IM.msg='';imRender();return;}imClose();}
function imHead(){
  var st=Math.min(IM.step,4),bars='';for(var i=1;i<=4;i++)bars+='<span class="im-bar'+(i<=st?' on':'')+'"></span>';
  return '<div class="im-top"><button class="im-x" onclick="'+(IM.step===4?'imClose()':'imBack()')+'" aria-label="'+(IM.step===1||IM.step===4?'Close':'Back')+'">'+(IM.step===1||IM.step===4?'\u2715':'\u2039')+'</button><div class="im-ttl">Import master sheet</div></div>'+
    '<div class="im-steps"><div class="im-bars">'+bars+'</div><div class="im-stepn">STEP '+st+' OF 4</div></div>';
}
function imRender(){
  var r=document.getElementById('im-root');if(!r||!IM.step)return;
  var h='<div class="im-wrap">'+imHead()+'<div class="im-body">';
  if(IM.step===1)h+=imStep1();else if(IM.step===2)h+=imStep2();else if(IM.step===3)h+=imStep3();else h+=imStep4();
  h+='</div></div>';
  var sc=r.scrollTop;r.innerHTML=h;r.scrollTop=sc;
  var fe=document.getElementById('im-edit-in');if(fe)fe.focus();
}
function imErr(){return IM.msg?'<div class="im-err" role="alert">'+imE(IM.msg)+'</div>':'';}
// step 1: upload
function imBatches(){try{var a=JSON.parse(localStorage.getItem('evoai_im_batches')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function imSaveBatches(a){try{localStorage.setItem('evoai_im_batches',JSON.stringify(a.slice(-10)));}catch(e){}}
function imLastBatch(owner){var a=imBatches().filter(function(b){return (!owner||b.owner===owner)&&Date.now()-Date.parse(b.at)<30*864e5;});return a.length?a[a.length-1]:null;}
function imStep1(){
  if(IM.busy)return '<h1 class="im-h1">Reading your sheet</h1><div class="im-card im-busy"><span class="im-spin" aria-hidden="true"></span><div><b>'+imE(IM.file?IM.file.name:'Your file')+'</b><div class="im-txt">'+imE(IM.busyMsg||'Finding your vehicles...')+'</div></div></div>';
  var lb=imLastBatch(IM.owner),h='<h1 class="im-h1">Import master sheet</h1><p class="im-lead">Upload your list. Nothing changes until you approve it.</p>'+imErr()+
    '<label class="im-drop" for="im-file"><span class="im-drop-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6"/><path d="M9.5 13.5 12 11l2.5 2.5"/></svg></span><b>Choose a file</b><span>Excel (.xlsx), CSV, or PDF</span><span>Scans and photos work too</span></label>'+
    '<input type="file" id="im-file" class="im-hide" accept=".xlsx,.xls,.csv,.pdf,application/pdf,image/*" onchange="imPicked(this)">'+
    '<input type="file" id="im-photo" class="im-hide" accept="image/*" capture="environment" onchange="imPicked(this)">'+
    '<button class="im-btn gold" onclick="document.getElementById(\'im-file\').click()">Choose file</button>'+
    '<button class="im-btn line" onclick="document.getElementById(\'im-photo\').click()">Take photo of a sheet</button>'+
    '<div class="im-card"><div class="im-cap">We read only</div><ul class="im-list"><li>Year, make, model</li><li>VIN or chassis number</li><li>Registration</li><li>Colour</li><li>Mileage</li><li>What you paid</li><li>Location and insurance, if listed</li></ul><div class="im-txt">Value estimates, ranges and notes are never imported.</div></div>';
  h+=unRecentCard();
  return h;
}
async function imPicked(inp){
  var f=inp&&inp.files&&inp.files[0];if(!f)return;inp.value='';
  IM.busy=true;IM.msg='';IM.file={name:f.name};IM.busyMsg=/\.(xlsx|xls|csv)$/i.test(f.name)?'Finding your vehicles...':'Reading the pages. Scans can take up to a minute.';imRender();
  try{var out=await imReadFile(f);IM.file=out;IM.rows=out.rows;IM.res={};IM.appr={};IM.add={};IM.step=2;IM.busy=false;
    var l=IM.owner?poList(IM.owner):[];IM.pfId=l.length?l[0].id:null;
  }catch(e){IM.busy=false;IM.msg=(e&&e.message)||'Could not read that file.';}
  imRender();
}
// step 2: which portfolio
var IM_COUNTRIES=[['','No country'],['US','United States'],['GB','United Kingdom'],['IE','Ireland'],['DE','Germany'],['FR','France'],['IT','Italy'],['ES','Spain'],['NL','Netherlands'],['CH','Switzerland'],['MC','Monaco'],['ZA','South Africa'],['AE','UAE'],['CA','Canada'],['AU','Australia']];
function imStep2Base(){
  var h='<h1 class="im-h1">Which portfolio?</h1><div class="im-card im-file"><span class="im-file-ic" aria-hidden="true">'+(IM.file.kind==='pdf'?'PDF':IM.file.kind==='image'?'IMG':'XLS')+'</span><div><b>'+imE(IM.file.name)+'</b><div class="im-txt">'+IM.rows.length+' vehicle'+(IM.rows.length===1?'':'s')+' found</div></div></div>'+imErr();
  var ad=getClients().filter(function(c){return canAddVehicleFor(c.id);});
  if(!ownerClientId()&&ad.length>1){
    h+='<label class="im-lab" for="im-owner">Whose collection?</label><select id="im-owner" class="im-in" onchange="imSetOwner(this.value)"><option value="">Choose a client</option>'+ad.map(function(c){return '<option value="'+imE(c.id)+'"'+(c.id===IM.owner?' selected':'')+'>'+imE(c.name||c.email||'Client')+'</option>';}).join('')+'</select>';
  }
  if(!IM.owner)return h+'<p class="im-lead">Choose whose collection these vehicles belong to.</p>';
  h+='<p class="im-lead">Choose where these vehicles go.</p><div class="im-pfs" role="radiogroup" aria-label="Portfolio">';
  poList(IM.owner).forEach(function(p){
    var on=!IM.newPf&&IM.pfId===p.id,n=poCount(IM.owner,p),fl=poFlag(p.country);
    h+='<button class="im-pf'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" onclick="imPickPf('+(p.id?'\''+p.id+'\'':'null')+')"><span class="im-flag" aria-hidden="true">'+(fl||imE(String(p.name||'C').charAt(0)))+'</span><span class="im-pf-t"><b>'+imE(p.name)+'</b><span>'+(n?n+' vehicle'+(n===1?'':'s')+' now':'Empty')+' \u00b7 '+imE(p.currency)+'</span></span><span class="im-radio" aria-hidden="true"></span></button>';
  });
  if(PO.on){
    if(IM.newPf){var np=IM.newPf;
      h+='<div class="im-pf on im-newpf"><b>New portfolio</b><label class="im-lab" for="im-np-name">Name</label><input id="im-np-name" class="im-in" maxlength="80" value="'+imE(np.name)+'" placeholder="UK &amp; Europe Collection" oninput="IM.newPf.name=this.value">'+
        '<label class="im-lab" for="im-np-country">Country</label><select id="im-np-country" class="im-in" onchange="IM.newPf.country=this.value">'+IM_COUNTRIES.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===np.country?' selected':'')+'>'+imE(c[1])+'</option>';}).join('')+'</select>'+
        '<label class="im-lab" for="im-np-cur">Currency</label><select id="im-np-cur" class="im-in" onchange="IM.newPf.currency=this.value">'+['USD','EUR','GBP'].map(function(c){return '<option'+(c===np.currency?' selected':'')+'>'+c+'</option>';}).join('')+'</select>'+
        '<button class="im-link" onclick="IM.newPf=null;imRender()">Cancel new portfolio</button></div>';
    }else h+='<button class="im-pf im-add" onclick="IM.newPf={name:\'\',country:\'\',currency:\'USD\'};imRender()"><span class="im-flag plus" aria-hidden="true">+</span><span class="im-pf-t"><b>New portfolio for this import</b></span></button>';
  }
  h+='</div><button class="im-btn gold" '+(IM.busy?'disabled':'')+' onclick="imToReview()">'+(IM.busy?'Creating...':'Continue')+'</button>';
  return h;
}
function imSetOwner(o){IM.owner=o||null;IM.newPf=null;var l=IM.owner?poList(IM.owner):[];IM.pfId=l.length?l[0].id:null;imRender();}
function imPickPf(id){IM.pfId=id;IM.newPf=null;imRender();}
async function imToReview(){
  if(!IM.owner){IM.msg='Choose whose collection these vehicles belong to.';imRender();return;}
  if(IM.newPf){var nm=cleanText(IM.newPf.name,80);if(!nm){IM.msg='Give the new portfolio a name.';imRender();return;}
    IM.busy=true;IM.msg='';imRender();
    try{IM.pfId=await poCreate(IM.owner,nm,IM.newPf.country,IM.newPf.currency);IM.newPf=null;audit('portfolio.created','Portfolio created: '+nm,{clientId:IM.owner});}catch(e){IM.busy=false;IM.msg=e.message||'Could not create the portfolio.';imRender();return;}
    IM.busy=false;}
  IM.msg='';IM.step=3;IM.tab='changes';imRender();
}
// step 3: review
function imA(){return imAnalyze(IM.rows,IM.owner,IM.pfId,IM.res);}
function imApprovedCount(A){var c=0;A.changes.forEach(function(x){if(x.forced||IM.appr[x.key]===true)c++;});A.news.forEach(function(x){if(IM.add[x.key]===true)c++;});return c;}
function imStep3(){
  var A=imA(),n=imApprovedCount(A),tabs=[['changes','Changes',A.changes.length],['new','New cars',A.news.length],['conflicts','Conflicts',A.conflicts.length]];
  var h='<h1 class="im-h1">Review</h1><div class="im-tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" aria-selected="'+(IM.tab===t[0])+'" class="im-tab'+(IM.tab===t[0]?' on':'')+(t[0]==='conflicts'&&t[2]?' warn':'')+'" onclick="IM.tab=\''+t[0]+'\';imRender()">'+t[1]+' <span class="im-n">'+t[2]+'</span></button>';}).join('')+'</div>'+imErr();
  if(IM.tab==='changes')h+=imTabChanges(A);else if(IM.tab==='new')h+=imTabNew(A);else h+=imTabConf(A);
  h+='<div class="im-savebar"><button class="im-btn gold" '+(n&&!IM.busy?'':'disabled')+' onclick="imSave()">'+(IM.busy?'Saving...':n?'Save '+n+' approved':'Nothing approved yet')+'</button></div>';
  return h;
}
function imPair(cur,val){return '<div class="im-pair"><div><div class="im-cap">Current</div><div class="im-v'+(cur?'':' blank')+'">'+(cur?imE(cur):'Blank')+'</div></div><div><div class="im-cap gold">Sheet</div><div class="im-v">'+imE(val)+'</div></div></div>';}
function imTabChanges(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var pend=A.changes.filter(function(x){return !x.forced&&IM.appr[x.key]!==true;}).length;
  var h='<p class="im-lead">These are cars you already have. Approve the details to update.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imApproveAll()">Approve all '+pend+' change'+(pend===1?'':'s')+'</button>';
  A.changes.forEach(function(x){
    var st=x.forced?'forced':IM.appr[x.key]===true?'yes':IM.appr[x.key]===false?'no':'';
    h+='<div class="im-item'+(st==='no'?' off':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+'</div>'+imPair(x.cur,x.val)+
      (st==='forced'?'<div class="im-state">Chosen in Conflicts</div>':st==='yes'?'<div class="im-acts"><span class="im-state ok">\u2713 Approved</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':st==='no'?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Approve</button><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>')+'</div>';
  });
  return h;
}
function imNewLines(f){
  var L=[];if(f.vin)L.push(['VIN',f.vin]);if(f.plate)L.push(['Registration',imFmt('reg',{plate:f.plate,region:f.region})]);if(f.color)L.push(['Colour',f.color]);if(f.miles)L.push(['Mileage',imFmt('miles',f.miles)]);if(f.paid)L.push(['What you paid',imFmt('paid',{v:f.paid,cur:f.cur})]);if(f.loc)L.push(['Location',f.loc]);if(f.ins)L.push(['Insurance',f.ins]);
  return L.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('');
}
function imTabNew(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pend=A.news.filter(function(x){return IM.add[x.key]!==true;}).length,pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  var h='<p class="im-lead">These cars are not in your collection yet. They go into '+imE(pf.name)+'.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imAddAll()">Add all '+pend+' car'+(pend===1?'':'s')+'</button>';
  A.news.forEach(function(x){var st=IM.add[x.key];
    h+='<div class="im-item'+(st===false?' off':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(x.f)+
      (st===true?'<div class="im-acts"><span class="im-state ok">\u2713 Will be added</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':st===false?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',true)">Add</button><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>')+'</div>';});
  return h;
}
function imTabConf(A){
  if(!A.conflicts.length)return '<div class="im-empty">All clear. Nothing to check.</div>';
  var h='<p class="im-lead">Please check these before importing.</p>';
  A.conflicts.forEach(function(x){
    h+='<div class="im-item im-conf"><div class="im-ct">'+imE(x.title)+'</div><div class="im-car">'+imE(x.car)+'</div>'+x.lines.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('')+(x.note?'<div class="im-txt">'+imE(x.note)+'</div>':'');
    if(IM.edit===x.key)h+='<label class="im-lab" for="im-edit-in">Correct VIN</label><input id="im-edit-in" class="im-in mono" maxlength="24" value="'+imE(x.vin||'')+'" autocapitalize="characters"><div class="im-acts"><button class="im-btn sm gold" onclick="imEditSave(\''+x.key+'\')">Save VIN</button><button class="im-btn sm line" onclick="IM.edit=null;imRender()">Cancel</button></div>';
    else if(x.opts.length)h+='<div class="im-acts '+(x.type==='match'?'stack':'wrap')+'">'+x.opts.map(function(o){return '<button class="im-btn sm '+(o.gold?'gold':'line')+'" onclick="imResolve(\''+x.key+'\',\''+String(o.v).replace(/'/g,'')+'\')">'+imE(o.label)+'</button>';}).join('')+'</div>';
    h+='</div>';
  });
  return h;
}
function imAppr(k,v){if(v===null)delete IM.appr[k];else IM.appr[k]=v;imRender();}
function imAdd(k,v){if(v===null)delete IM.add[k];else IM.add[k]=v;imRender();}
function imApproveAll(){imA().changes.forEach(function(x){if(IM.appr[x.key]!==false)IM.appr[x.key]=true;});imRender();}
function imAddAll(){imA().news.forEach(function(x){if(IM.add[x.key]!==false)IM.add[x.key]=true;});imRender();}
function imResolve(k,v){if(/^vin/.test(k)){if(v==='edit'){IM.edit=k;imRender();return;}IM.res[k]={keep:true};}else IM.res[k]=v;IM.edit=null;imRender();}
function imEditSave(k){var el=document.getElementById('im-edit-in'),v=imVinClean(el?el.value:'');if(v.length<4){IM.msg='Enter the VIN or chassis number.';imRender();return;}IM.msg='';IM.res[k]={edit:v};IM.edit=null;imRender();}
// ---------- save (normal save path) + undo ----------
var IM_PROPS={year:['year'],make:['make'],model:['model'],vin:['vin'],reg:['plate','plateRegion'],color:['color'],miles:['mileage'],paid:['purchasePrice','currency'],loc:['location'],ins:['insurer']};
function imSetProp(v,k,raw){
  if(k==='reg'){v.plate=cleanText(raw.plate,20);if(raw.region)v.plateRegion=cleanText(raw.region,30);}
  else if(k==='paid'){v.purchasePrice=raw.v;v.currency=IM_CUR[raw.cur]?raw.cur:'USD';}
  else if(k==='miles')v.mileage=Math.max(0,Math.round(Number(raw)||0));
  else if(k==='vin')v.vin=imVinClean(raw);
  else if(k==='year')v.year=String(raw);
  else if(k==='loc')v.location=cleanText(raw,120);
  else if(k==='ins')v.insurer=cleanText(raw,80);
  else if(k==='color')v.color=cleanText(raw,40);
  else if(k==='model')v.model=cleanText(raw,60);
}
function imNewVehicle(f,owner,pfId,now){
  var yr=toInt(f.year),max=new Date().getFullYear()+2;
  if(!yr||yr<1885||yr>max)return null;
  var cur=IM_CUR[f.cur]?f.cur:'USD';
  return {id:uid(),clientId:owner,year:String(yr),make:cleanText(f.make,40),model:cleanText(f.model||'',60),trim:'',isReplica:false,builder:'',nickname:'',color:cleanText(f.color,40),mileage:f.miles?Math.max(0,Math.round(f.miles)):0,vin:imVinClean(f.vin),
    purchasePrice:f.paid||0,purchaseDate:'',insuredValue:0,notes:'',plate:cleanText(f.plate,20),plateRegion:cleanText(f.region,30),location:cleanText(f.loc,120),insurer:cleanText(f.ins,80),currency:cur,portfolioId:pfId||null,
    regExpiry:'',insRenewal:'',insRepeat:'yearly',inspExpiry:'',lastServiceDate:'',nextServiceDate:'',nextServiceMiles:'',svcIntervalMonths:6,svcIntervalMiles:5000,image:null,valueLog:[],createdAt:now,importedAt:now};
}
function imApplyLocal(A,owner,pfId,appr,add){
  var vehicles=getVehicles(),now=new Date().toISOString(),batch={id:IM.id||uid(),at:now,owner:owner,pf:pfId,added:[],changed:[]},byV={},refused=0;
  A.changes.forEach(function(x){if(!(x.forced||appr[x.key]===true))return;(byV[x.vid]=byV[x.vid]||[]).push(x);});
  Object.keys(byV).forEach(function(vid){
    var v=byId(vehicles,vid);if(!v||isArchivedVehicle(v)||!canEditVehicle(v)){refused++;return;}
    var props=[],before={},after={};byV[vid].forEach(function(x){IM_PROPS[x.field].forEach(function(p){props.push(p);});});
    props.forEach(function(p){before[p]=v[p]===undefined?null:v[p];});
    byV[vid].forEach(function(x){imSetProp(v,x.field,x.raw);});
    props.forEach(function(p){after[p]=v[p]===undefined?null:v[p];});
    v.updatedAt=now;batch.changed.push({id:vid,before:before,after:after,fields:byV[vid].map(function(x){return x.field;})});
  });
  var added=[];
  if(canAddVehicleFor(owner))A.news.forEach(function(x){if(add[x.key]!==true)return;var nv=imNewVehicle(x.f,owner,pfId,now);if(!nv){refused++;return;}vehicles.push(nv);added.push(nv);batch.added.push(nv.id);});
  else refused+=A.news.filter(function(x){return add[x.key]===true;}).length;
  if(!batch.changed.length&&!added.length)return {batch:batch,refused:refused,none:true};
  if(!setVehicles(vehicles))return {error:true};
  batch.changed.forEach(function(c){var v=byId(getVehicles(),c.id);audit('vehicle.updated','Updated from master sheet ('+c.fields.map(function(k){return IM_LABEL[k];}).join(', ')+'): '+vName(v),{clientId:owner,vehicleId:c.id});});
  added.forEach(function(nv){audit('vehicle.created','Vehicle added from master sheet: '+vName(nv)+' ('+imVName(nv)+')',{clientId:owner,vehicleId:nv.id});});
  var all=imBatches();all.push(batch);imSaveBatches(all);
  return {batch:batch,refused:refused};
}
function imSave(){
  if(IM.busy)return;var A=imA();
  var r=imApply(A,IM.owner,IM.pfId,IM.appr,IM.add);
  if(r.error){IM.msg='Could not save. Please try again.';imRender();return;}
  if(r.none){IM.msg='Nothing was saved.';imRender();return;}
  var pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  IM.done={batch:r.batch,refused:r.refused,pf:pf.name,skipped:A.conflicts.length};IM.step=4;IM.msg='';imRender();
  showToast('Import saved','success');
}
function imUndoLocal(id){
  var all=imBatches(),b=all.filter(function(x){return x.id===id;})[0];if(!b||b.undone){return null;}
  var vehicles=getVehicles(),gone={},keepAdded=0,reverted=0;
  b.added.forEach(function(vid){var v=byId(vehicles,vid);if(v&&canEditVehicle(v)&&!isArchivedVehicle(v))gone[vid]=1;else if(v)keepAdded++;});
  vehicles=vehicles.filter(function(v){return !gone[v.id];});
  b.changed.forEach(function(c){var v=byId(vehicles,c.id);if(!v||!canEditVehicle(v)||isArchivedVehicle(v))return;var any=false;
    for(var p in c.before)if(c.before.hasOwnProperty(p)){if(JSON.stringify(v[p]===undefined?null:v[p])===JSON.stringify(c.after[p])){v[p]=c.before[p]===null?(p==='mileage'||p==='purchasePrice'?0:''):c.before[p];any=true;}}
    if(any){v.updatedAt=new Date().toISOString();reverted++;}});
  setVehicles(vehicles);
  Object.keys(gone).forEach(function(vid){audit('vehicle.deleted','Import undone: vehicle removed',{clientId:b.owner,vehicleId:vid});});
  if(reverted)audit('vehicle.updated','Import undone: '+reverted+' car'+(reverted===1?'':'s')+' restored',{clientId:b.owner});
  b.undone=new Date().toISOString();imSaveBatches(all);
  return {removed:Object.keys(gone).length,restored:reverted,kept:keepAdded};
}
function imStep4Base(){
  var d=IM.done,b=d.batch;
  if(d.undone)return '<div class="im-done"><div class="im-big">\u21b6</div><h1 class="im-h1">Import undone</h1><p class="im-lead">'+d.undone.removed+' car'+(d.undone.removed===1?'':'s')+' removed, '+d.undone.reverted+' restored to how they were.</p><button class="im-btn gold" onclick="imClose()">Done</button></div>';
  return '<div class="im-done"><div class="im-big ok">\u2713</div><h1 class="im-h1">Import saved</h1>'+
    '<div class="im-card"><div class="im-kv"><span>Cars added to '+imE(d.pf)+'</span><b>'+b.added.length+'</b></div><div class="im-kv"><span>Cars updated</span><b>'+b.changed.length+'</b></div>'+(d.skipped?'<div class="im-kv"><span>Left to check</span><b>'+d.skipped+'</b></div>':'')+'</div>'+
    (b.added.length?'<p class="im-lead">Each new car has its own page. Anything the sheet did not have shows as Missing.</p>':'')+
    '<button class="im-btn gold" onclick="imClose()">View collection</button><button class="im-btn line red" onclick="imUndo(\''+b.id+'\')">\u21b6 Undo this import</button><p class="im-lead un-note">You can undo this for 30 days.</p>'+unRecentCard()+'</div>';
}
// ===== v21b: cost basis check ("What you paid" that looks wrong must be confirmed) =====
// Thresholds (USD equivalent; EUR x1.08, GBP x1.27, rough rates for the check only):
//  - 0, under $1,000 or over $20,000,000: always flagged
//  - malformed text on a sheet (two currencies, more than 9 whole digits, broken thousands groups, 3+ decimals): flagged
//  - vs the car's latest AI estimate when there is one: under 25% or over 400% is flagged
//  - otherwise vs a rough typical price for the make (CB_MAKE): under 25% or over 400% is flagged
var CB={min:1000,max:20000000,lo:0.25,hi:4,fx:{USD:1,EUR:1.08,GBP:1.27},formOk:''};
var CB_MAKE={'acura':40000,'alfa romeo':35000,'aston martin':150000,'audi':55000,'austin healey':60000,'bentley':120000,'bmw':55000,'bugatti':2500000,'cadillac':55000,'chevrolet':50000,'datsun':35000,'dodge':45000,'ferrari':300000,'fiat':20000,'ford':45000,'honda':30000,'jaguar':70000,'jeep':45000,'koenigsegg':3000000,'lamborghini':350000,'lancia':60000,'land rover':70000,'lexus':55000,'lotus':80000,'maserati':80000,'mclaren':250000,'mercedes-benz':80000,'mercedes':80000,'mg':25000,'mini':25000,'nissan':35000,'pagani':3000000,'porsche':120000,'range rover':90000,'renault':25000,'rolls-royce':350000,'shelby':150000,'tesla':60000,'toyota':40000,'triumph':25000,'volkswagen':30000,'vw':30000,'volvo':35000};
function cbUsd(v,cur){return Number(v)*(CB.fx[cur]||1);}
function cbMoneyStr(v,cur){var s={USD:'$',EUR:'\u20ac',GBP:'\u00a3'}[cur]||'';return s+Number(v).toLocaleString('en-US',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})+(s?'':' '+cur);}
function cbMalformed(raw){
  raw=String(raw||'').trim();if(!raw)return '';
  var n=0;[/\$|\bUSD\b/i,/\u20ac|\bEUR\b/i,/\u00a3|\bGBP\b/i].forEach(function(re){if(re.test(raw))n++;});
  if(n>1)return 'Two currencies in one amount';
  var d=raw.replace(/[^0-9.,]/g,'');if(!d)return '';
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(d))d=d.replace(/\./g,'').replace(',','.');
  else if(/,/.test(d)&&!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(d))return 'The number looks wrong';
  else d=d.replace(/,/g,'');
  if((d.match(/\./g)||[]).length>1)return 'The number looks wrong';
  var p=d.split('.');if(p[0].replace(/^0+/,'').length>9)return 'Too many digits';
  if(p[1]&&p[1].length>2)return 'Too many digits after the point';
  return '';
}
function cbTypical(make){var m=String(make||'').toLowerCase().replace(/\s+/g,' ').trim();if(CB_MAKE[m])return CB_MAKE[m];for(var k in CB_MAKE)if(CB_MAKE.hasOwnProperty(k)&&m.indexOf(k)===0)return CB_MAKE[k];return null;}
// returns null when fine, else {reason, kind}
function cbCheck(o){
  if(o.amount===null||o.amount===undefined||o.amount==='')return null;
  var a=Number(o.amount),cur=o.cur||'USD';
  var bad=cbMalformed(o.raw);if(bad)return {kind:'malformed',reason:bad};
  if(!isFinite(a))return {kind:'malformed',reason:'The number looks wrong'};
  var u=cbUsd(a,cur);
  if(a<=0)return {kind:'zero',reason:'The amount is 0'};
  if(u<CB.min)return {kind:'low',reason:'Under $1,000. Looks low for this car'};
  if(u>CB.max)return {kind:'high',reason:'Over $20 million. Looks high for this car'};
  var est=o.estimate&&Number(o.estimate)>0?Number(o.estimate):null,src='ai';
  if(!est){est=cbTypical(o.make);src='make';}
  if(est){if(u<est*CB.lo)return {kind:'low',reason:'Looks low for this car',src:src};if(u>est*CB.hi)return {kind:'high',reason:'Looks high for this car',src:src};}
  return null;
}
function cbSig(v,cur){return Number(v)+'|'+(cur||'USD');}
function cbBox(amt,flag,state,acts,ask){
  return '<div class="cb-box'+(state==='ok'?' ok':'')+'" data-cb="'+(state||'need')+'"><div class="cb-amt">'+esc(amt)+'</div>'+
    (state==='ok'?'<div class="cb-ok">\u2713 Confirmed as correct</div>':'<div class="cb-why">'+esc(flag.reason)+'</div><div class="cb-ask">'+(ask||'Please confirm this is what was paid.')+'</div>')+(acts||'')+'</div>';
}
// ---------- import review ----------
var _cbClean=imClean;imClean=function(raw){var o=_cbClean(raw);o.paidRaw=imCell(raw&&raw.paid);return o;};
var _cbRowFields=imRowFields;imRowFields=function(r,ri,res){var f=_cbRowFields(r,ri,res),e=res&&res['cbv'+ri];if(e){f.paid=e.v;f.cur=e.cur;}return f;};
function cbImFlag(ri,f,vid){
  if(!f||!f.paid)return null;var r=IM.rows[ri]||{},m=vid?byId(getVehicles(),vid):null;
  var edited=IM.res&&IM.res['cbv'+ri];
  return cbCheck({amount:f.paid,cur:f.cur,raw:edited?'':r.paidRaw,estimate:m?aiVal(m):null,make:f.make||(m&&m.make)});
}
function cbImHeld(ri,f,vid){var fl=cbImFlag(ri,f,vid);return !!(fl&&IM.res['cbok'+ri]!==cbSig(f.paid,f.cur));}
function cbImRowF(ri){return imRowFields(IM.rows[ri],ri,IM.res);}
function cbImPending(A){var n=0;A.changes.forEach(function(x){if(x.field==='paid'&&(x.forced||IM.appr[x.key]===true)&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid))n++;});A.news.forEach(function(x){if(IM.add[x.key]===true&&cbImHeld(x.ri,x.f,null))n++;});return n;}
function cbImUI(ri,f,vid){
  var fl=cbImFlag(ri,f,vid);if(!fl)return '';
  var amt=cbMoneyStr(f.paid,f.cur);
  if(IM.res['cbok'+ri]===cbSig(f.paid,f.cur))return cbBox(amt,fl,'ok','<div class="im-acts"><button class="im-btn sm line" onclick="cbImUndo('+ri+')">Undo</button><button class="im-btn sm line" onclick="cbImEdit('+ri+')">Edit</button></div>');
  if(IM.cbEdit===ri)return '<div class="cb-box" data-cb="edit"><label class="im-lab" for="cb-in">Correct amount</label><div class="cb-row"><select id="cb-cur" class="im-in" aria-label="Currency">'+['USD','EUR','GBP'].map(function(c){return '<option'+(c===f.cur?' selected':'')+'>'+c+'</option>';}).join('')+'</select><input id="cb-in" class="im-in" inputmode="decimal" value="'+f.paid+'"></div><div class="im-acts"><button class="im-btn sm gold" onclick="cbImEditSave('+ri+')">Save amount</button><button class="im-btn sm line" onclick="IM.cbEdit=null;imRender()">Cancel</button></div></div>';
  return cbBox(amt,fl,'need','<div class="im-acts"><button class="im-btn sm gold" onclick="cbImOk('+ri+')">Yes, this is correct</button><button class="im-btn sm line" onclick="cbImEdit('+ri+')">Edit</button></div>','Saved for confirming later if you do not confirm now.');
}
function cbImOk(ri){var f=cbImRowF(ri);IM.res['cbok'+ri]=cbSig(f.paid,f.cur);imRender();}
function cbImUndo(ri){delete IM.res['cbok'+ri];imRender();}
function cbImEdit(ri){IM.cbEdit=ri;imRender();setTimeout(function(){var e=document.getElementById('cb-in');if(e){e.focus();e.select();}},30);}
function cbImEditSave(ri){
  var e=document.getElementById('cb-in'),c=document.getElementById('cb-cur'),s=String(e?e.value:'').replace(/[^0-9.]/g,''),v=parseFloat(s);
  if(!isFinite(v)||v<0||(s.match(/\./g)||[]).length>1){IM.msg='Enter the amount paid as a number.';imRender();return;}
  IM.msg='';IM.res['cbv'+ri]={v:Math.round(v*100)/100,cur:(c&&c.value)||'USD'};delete IM.res['cbok'+ri];IM.cbEdit=null;imRender();
}
imTabChanges=function(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var pend=A.changes.filter(function(x){return !x.forced&&IM.appr[x.key]!==true;}).length;
  var h='<p class="im-lead">These are cars you already have. Approve the details to update.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imApproveAll()">Approve all '+pend+' change'+(pend===1?'':'s')+'</button>';
  A.changes.forEach(function(x){
    var st=x.forced?'forced':IM.appr[x.key]===true?'yes':IM.appr[x.key]===false?'no':'';
    var cb=x.field==='paid'&&st!=='no'?cbImUI(x.ri,cbImRowF(x.ri),x.vid):'',held=cb&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid);
    h+='<div class="im-item'+(st==='no'?' off':'')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+'</div>'+
      (cb?'<div class="im-pair one"><div><div class="im-cap">Current</div><div class="im-v'+(x.cur?'':' blank')+'">'+(x.cur?imE(x.cur):'Blank')+'</div></div></div><div class="im-cap gold cb-cap">Sheet</div>'+cb:imPair(x.cur,x.val))+
      (st==='forced'?'<div class="im-state">Chosen in Conflicts</div>':st==='yes'?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Approved \u00b7 confirm later':'\u2713 Approved')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':st==='no'?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Approve</button><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>')+'</div>';
  });
  return h;
};
imTabNew=function(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pend=A.news.filter(function(x){return IM.add[x.key]!==true;}).length,pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  var h='<p class="im-lead">These cars are not in your collection yet. They go into '+imE(pf.name)+'.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imAddAll()">Add all '+pend+' car'+(pend===1?'':'s')+'</button>';
  A.news.forEach(function(x){var st=IM.add[x.key],cb=st!==false?cbImUI(x.ri,x.f,null):'',held=cb&&cbImHeld(x.ri,x.f,null),f=x.f;
    if(cb){f=JSON.parse(JSON.stringify(x.f));f.paid=null;}
    h+='<div class="im-item'+(st===false?' off':'')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(f)+(cb?'<div class="im-cap gold cb-cap">What you paid</div>'+cb:'')+
      (st===true?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be added \u00b7 confirm later':'\u2713 Will be added')+'</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':st===false?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',true)">Add</button><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>')+'</div>';});
  return h;
};

// v21c (Wade): flagged costs are NOT blocked. They save as unconfirmed (costOk=false) and keep the red box
// on the vehicle page until the owner/admin confirms or edits them.
var _cbStep3=imStep3;imStep3=function(){
  var h=_cbStep3(),n=cbImPending(imA());
  if(n)h=h.replace('<div class="im-savebar">','<div class="im-savebar"><div class="cb-need-bar" role="status">'+n+' cost'+(n===1?'':'s')+' will be saved for confirming later</div>');
  return h;
};
IM_PROPS.paid=IM_PROPS.paid.concat(['costOk','costFlag']);
var _cbSetProp=imSetProp;imSetProp=function(v,k,raw){_cbSetProp(v,k,raw);if(k==='paid'){v.costOk=!(raw&&raw.cbFlag);v.costFlag=(raw&&raw.cbFlag)||'';}};
var _cbNewV=imNewVehicle;imNewVehicle=function(f,owner,pfId,now){var nv=_cbNewV(f,owner,pfId,now);if(nv){nv.costOk=!(f.paid&&f.cbFlag);nv.costFlag=(f.paid&&f.cbFlag)||'';}return nv;};
function cbImReason(ri,f,vid){var fl=cbImFlag(ri,f,vid);return (fl&&IM.res['cbok'+ri]!==cbSig(f.paid,f.cur))?fl.reason:'';}
var _cbApply=imApply;imApply=function(A,owner,pfId,appr,add){
  var later=0;
  A.changes.forEach(function(x){if(x.field!=='paid')return;var r=cbImReason(x.ri,cbImRowF(x.ri),x.vid);x.raw=JSON.parse(JSON.stringify(x.raw));x.raw.cbFlag=r;if(r&&(x.forced||appr[x.key]===true))later++;});
  A.news.forEach(function(x){var r=cbImReason(x.ri,x.f,null);x.f.cbFlag=r;if(r&&add[x.key]===true)later++;});
  IM.cbLater=later;return _cbApply(A,owner,pfId,appr,add);
};
var _cbSave=imSave;imSave=function(){IM.cbLater=0;_cbSave();if(IM.step===4&&IM.done){IM.done.cbLater=IM.cbLater;imRender();}};
var _cbStep4=imStep4;imStep4=function(){var h=_cbStep4(),d=IM.done;if(d&&!d.undone&&d.cbLater)h=h.replace('<div class="im-kv"><span>Cars updated</span>','<div class="im-kv cb-kv"><span>Costs to confirm</span><b>'+d.cbLater+'</b></div><div class="im-kv"><span>Cars updated</span>');return h;};
// ---------- storage: vehicle_financials.cost_confirmed / cost_flag_reason (migration_015) or notes extras cfc/cfr ----------
CB.fcol=null;
var _cbMsLoad=msLoad;msLoad=function(v,r,x,fin){
  _cbMsLoad(v,r,x,fin);x=x||{};
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'cost_confirmed'))CB.fcol=true;else if(fin&&CB.fcol===null)CB.fcol=false;
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'cost_confirmed')){v.costOk=fin.cost_confirmed!==false;v.costFlag=v.costOk?'':cleanText(fin.cost_flag_reason||x.cfr||'',120);}
  else{v.costOk=x.cfc!=='0';v.costFlag=v.costOk?'':cleanText(x.cfr||'',120);}
};
function cbX(v){var no=v&&v.costOk===false&&Number(v.purchasePrice)>0;return {cfc:no?'0':'',cfr:no?(v.costFlag||''):''};}
var _cbSync=msSyncCols;msSyncCols=async function(v){
  await _cbSync(v);
  if(v&&v.id&&CB.fcol===true&&Number(v.purchasePrice)>0){var no=v.costOk===false;
    try{var r=await sb.from('vehicle_financials').update({cost_confirmed:!no,cost_flag_reason:no?(v.costFlag||null):null}).eq('vehicle_id',v.id);
      if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))CB.fcol=false;}catch(e){}}
};
// ---------- vehicle page: red box until confirmed (owner/admin/client with edit rights; never shared/tech/co-owner views) ----------
function cbCanConfirm(v){return !!(v&&!isArchivedVehicle(v)&&msCanSeeMissing(v)&&(can(v,'view_purchase_info')||canEditVehicle(v)));}
function cbPending(v){return !!(v&&v.costOk===false&&Number(v.purchasePrice)>0);}
var _cbMsRender=msRender;msRender=function(v){
  _cbMsRender(v);
  if(!v||!cbPending(v)||!cbCanConfirm(v))return;
  var row=document.querySelector('#vd-key .ms-row[data-k="paid"]');if(!row)return;
  var d=document.createElement('div');d.className='cb-page';d.id='cb-page';
  d.innerHTML=cbBox(msValue(v,{k:'paid'}),{reason:v.costFlag||'Please check this amount'},'need','<div class="cb-acts"><button type="button" class="btn btn-primary" onclick="cbPageOk()">Yes, this is correct</button><button type="button" class="btn" onclick="cbPageEdit()">Edit</button></div>','Saved, not yet confirmed. Please confirm this is what was paid.');
  row.classList.add('cb-row-flag');row.parentNode.insertBefore(d,row.nextSibling);
};
function cbPageOk(){
  var vehicles=getVehicles(),v=byId(vehicles,currentVehicleId);if(!v||!cbCanConfirm(v))return;
  v.costOk=true;v.costFlag='';v.updatedAt=new Date().toISOString();
  if(!setVehicles(vehicles))return;
  audit('vehicle.updated','What you paid confirmed as correct: '+vName(v),{clientId:v.clientId,vehicleId:v.id});
  showToast('Confirmed','success');msRender(byId(getVehicles(),v.id));
}
function cbPageEdit(){msEdit('paid');}
// ---------- vehicle form: never blocks; saves the flag ----------
function cbFormState(){
  var inp=document.getElementById('v-purchase-price');if(!inp)return null;
  var raw=String(inp.value||'').trim();if(!raw)return null;
  var cur=(document.getElementById('v-currency')||{}).value||'USD',amt=Number(raw);
  var v=editingVehicleId?byId(getVehicles(),editingVehicleId):null,same=v&&Number(v.purchasePrice)===Math.round(amt)&&(v.currency||'USD')===cur;
  var sig=(editingVehicleId||'new')+'|'+cbSig(Math.round(amt),cur);
  if(same)return cbPending(v)?{flag:{reason:v.costFlag||'Please check this amount'},amt:amt,cur:cur,sig:sig,same:true}:null;
  var fl=cbCheck({amount:amt,cur:cur,raw:'',estimate:v?aiVal(v):null,make:val('v-make')});
  return fl?{flag:fl,amt:amt,cur:cur,sig:sig}:null;
}
function cbFormRender(){
  var box=document.getElementById('cb-form'),inp=document.getElementById('v-purchase-price');if(!box)return;var s=cbFormState();
  if(!s){box.style.display='none';box.innerHTML='';if(inp)inp.classList.remove('cb-in-bad');return;}
  var ok=CB.formOk===s.sig;box.style.display='';var dt=box.closest('details');if(dt&&!ok)dt.open=true;
  if(inp)inp.classList.toggle('cb-in-bad',!ok);
  box.innerHTML=cbBox(cbMoneyStr(Math.round(s.amt),s.cur),s.flag,ok?'ok':'need',ok?'':'<div class="cb-acts"><button type="button" class="btn btn-primary" onclick="cbFormOk()">Yes, this is correct</button><button type="button" class="btn" onclick="cbFormEdit()">Edit</button></div>','You can save now. It stays marked until confirmed.');
}
function cbFormOk(){var s=cbFormState();if(s)CB.formOk=s.sig;cbFormRender();}
function cbFormEdit(){var e=document.getElementById('v-purchase-price');if(e){e.focus();try{e.select();}catch(x){}}}
// called from saveVehicle (patched) with the fields about to be saved
function cbFormFields(fields){
  var v=editingVehicleId?byId(getVehicles(),editingVehicleId):null;
  if(!(Number(fields.purchasePrice)>0)){fields.costOk=true;fields.costFlag='';return;}
  var s=cbFormState();
  if(s&&CB.formOk!==s.sig){if(!s.same||!v){fields.costOk=false;fields.costFlag=s.flag.reason;}return;}
  if(s||!v||Number(v.purchasePrice)!==Number(fields.purchasePrice)||(v.currency||'USD')!==(val('v-currency')||'USD')){fields.costOk=true;fields.costFlag='';}
}
document.addEventListener('input',function(e){var t=e.target;if(t&&(t.id==='v-purchase-price'||t.id==='v-currency'||t.id==='v-make'))cbFormRender();});
document.addEventListener('change',function(e){var t=e.target;if(t&&(t.id==='v-currency'))cbFormRender();});
var _cbOpenAdd=openAddVehicleModal;openAddVehicleModal=function(){var r=_cbOpenAdd.apply(this,arguments);CB.formOk='';cbFormRender();return r;};
var _cbOpenEdit=editCurrentVehicle;editCurrentVehicle=function(){var r=_cbOpenEdit.apply(this,arguments);CB.formOk='';cbFormRender();return r;};
// Shared: toggles .nav-at-start/.nav-at-end on the bottom bar (passive scroll, rAF-throttled). No touch handlers -> swipe-back untouched.
window.__navEdges=function(sb,cb){var t=0;function u(){t=0;var m=sb.scrollWidth-sb.clientWidth;sb.classList.toggle('nav-at-start',sb.scrollLeft<4);sb.classList.toggle('nav-at-end',sb.scrollLeft>m-4);cb&&cb(sb.scrollLeft,m);}
sb.addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});addEventListener('resize',u,{passive:true});u();var a=sb.querySelector('.nav-item.active');if(a&&a.scrollIntoView)a.scrollIntoView({inline:'center',block:'nearest'});return u;};
// Option A: raised gold-edged glass bar, right/left edge fade, sticky gold chevron that pages the bar.
function navAInit(){if(document.getElementById('nav-A'))return;var css=`.nav-chev{display:none}
@media(max-width:899px){
.sidebar{position:relative;background:linear-gradient(180deg,rgba(28,26,22,.82),rgba(10,10,12,.94))!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1.5px solid rgba(201,170,107,.85)!important;box-shadow:0 -10px 28px rgba(0,0,0,.65),0 -1px 0 rgba(201,170,107,.35) inset;border-radius:18px 18px 0 0;
-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 56px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 56px),transparent 100%)}
.sidebar.nav-at-start{-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 56px),transparent 100%);mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 56px),transparent 100%)}
.sidebar.nav-at-end{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28px);mask-image:linear-gradient(90deg,transparent 0,#000 28px)}
.sidebar .nav-item{color:#F2F0EB!important;font-size:15px!important;font-weight:600!important;letter-spacing:.08em!important}
.sidebar .nav-item.active{color:#E6C989!important}
.sidebar .nav-item.active::before{height:3px!important;background:#C9AA6B!important;border-radius:0 0 3px 3px;top:0!important}
.nav-chev{position:sticky;right:0;flex:0 0 auto;align-self:center;width:44px;height:44px;margin-left:4px;border-radius:50%;border:1.5px solid #C9AA6B;background:rgba(7,8,10,.92);color:#E6C989;font-size:24px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:-14px 0 18px rgba(7,8,10,.95)}
.sidebar.nav-at-end .nav-chev{transform:scaleX(-1)}}`;
var s=document.createElement('style');s.id='nav-A';s.textContent=css;document.head.appendChild(s);
var sb=document.querySelector('.sidebar');var b=document.createElement('button');b.className='nav-chev';b.type='button';b.setAttribute('aria-label','More tabs');b.textContent='\u203A';
b.onclick=function(){var end=sb.classList.contains('nav-at-end');sb.scrollBy({left:end?-sb.scrollWidth:sb.clientWidth*.7,behavior:'smooth'})};sb.appendChild(b);__navEdges(sb);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navAInit);else navAInit();
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
// ===== v24 import fix (p24): every sheet row ends in one bucket; new cars added by default; blanks filled,
// replacements need approval; exact VIN/chassis/plate matching only (else "Same car?"); per-car cloud save
// with loud errors; sturdier PDF table reading with an AI fallback. Overrides p20/p23 functions by name.
var IM_MULTI_MAKES=['alfa romeo','land rover','aston martin','mercedes benz','rolls royce','de tomaso','austin healey','mclaren'];
var IM_MAKE_ALIAS={vw:'volkswagen',mercedes:'mercedes benz',benz:'mercedes benz',chevy:'chevrolet',alfa:'alfa romeo',landrover:'land rover',aston:'aston martin'};
var IM_PDF={expect:0};
// ---------- cleaning: "Fiat 500" / "Mini Cooper Countryman" in the Make column ----------
function imClean(raw){
  var c=imCleanBase(raw),f=c.f;
  if(f.make){var mk=imNorm(f.make),hit='';
    IM_MULTI_MAKES.forEach(function(m){if((mk+' ').indexOf(m+' ')===0&&m.length>hit.length)hit=m;});
    var words=String(f.make).split(/\s+/),n=hit?hit.split(' ').length:1;
    if(words.length>n){var rest=words.slice(n).join(' ');f.make=words.slice(0,n).join(' ');f.model=cleanText((rest+' '+(f.model||'')).trim(),60);}
  }
  return c;
}
function imMakeKey(s){var k=imNorm(s);if(IM_MAKE_ALIAS[k])return IM_MAKE_ALIAS[k];var w=k.split(' ')[0];if(IM_MAKE_ALIAS[w]&&k.indexOf(IM_MAKE_ALIAS[w])!==0)return IM_MAKE_ALIAS[w];return k;}
function imModelToks(s){return imNorm(imStripDrive(s)).split(' ').filter(function(t){return t&&['the','and','coupe','tribute','replica','car','lhd','rhd','pink','left','right','hand','drive'].indexOf(t)<0;});}
// 0..1 how alike two models are; -1 when their numbers say they are different models (Defender 90 vs 110)
function imModelSim(a,b){
  var A=imModelToks(a),B=imModelToks(b);if(!A.length||!B.length)return 0;
  var na=A.filter(function(t){return /^\d+$/.test(t);}),nb=B.filter(function(t){return /^\d+$/.test(t);});
  if(na.length&&nb.length&&!na.some(function(t){return nb.indexOf(t)>=0;}))return -1;
  var hit=A.filter(function(t){return B.indexOf(t)>=0;}).length;return hit/Math.min(A.length,B.length);
}
// ---------- records: rows we cannot use are kept with a reason, never dropped ----------
function imRecords(grid,map){
  var out=[];
  for(var i=0;i<grid.length;i++){
    var row=grid[i]||[],raw={};
    for(var k in map)if(map.hasOwnProperty(k))raw[k]=row[map[k]]==null?'':String(row[map[k]]);
    if(imIsData(raw)){var c=imClean(raw);c.n=out.length+1;c.raw=raw;out.push(c);continue;}
    var name=(imCell(raw.make)+' '+imCell(raw.model)).trim();
    var other=['model','reg','color','paid','loc','miles'].filter(function(k){return imCell(raw[k]);}).length;
    if(name&&imCell(raw.make)&&other>=1&&name.split(/\s+/).length<=6&&name.length<=60&&!/^unclear/i.test(imCell(raw.make))){var b=imClean(raw);b.n=out.length+1;b.raw=raw;b.bad='No year or VIN on the sheet';out.push(b);}
  }
  return out;
}
// ---------- PDF: split merged text runs into words, keep reading past headings and gaps ----------
var IM_CTX=null;
function imWords(it){
  var ws=it.s.split(/\s+/).filter(Boolean);if(ws.length<2)return [it];
  if(!IM_CTX){try{IM_CTX=document.createElement('canvas').getContext('2d');}catch(e){IM_CTX=null;}}
  var wid=function(s){if(IM_CTX){IM_CTX.font=Math.max(6,it.h)+'px Helvetica, Arial, sans-serif';return IM_CTX.measureText(s).width;}return s.length;};
  var lens=ws.map(wid),sp=wid(' '),tot=lens.reduce(function(a,b){return a+b;},0)+sp*(ws.length-1),k=tot>0?it.w/tot:1,x=it.x,out=[];
  ws.forEach(function(s,i){out.push({s:s,x:x,y:it.y,w:lens[i]*k,h:it.h});x+=(lens[i]+sp)*k;});
  return out;
}
function imPdfTable(pdf){
  var hdrNames=null,recs=[],cols=null,expect=0,yc=-1,vc=-1;
  pdf.pages.forEach(function(lines){
    var hi=-1;for(var i=0;i<lines.length;i++){var t=imNorm(lines[i].text);if(/\bmake\b/.test(t)&&(/\bvin\b/.test(t)||/\byear\b/.test(t))){hi=i;break;}}
    if(hi>=0){cols=imPdfHeaderCols(lines[hi]);if(!hdrNames){hdrNames=cols.map(function(c){return c.s;});hdrNames.forEach(function(h,j){var f=imHeaderField(h);if(f==='year'&&yc<0)yc=j;if(f==='vin'&&vc<0)vc=j;});}}
    else if(!cols)return; // no header seen yet
    var cur=null,lastY=null,gap=[];
    function span(j){return [j===0?-1e9:cols[j].x-4,j===cols.length-1?1e9:cols[j+1].x-4];}
    function colOf(it){if(/^[~$\u20ac\u00a3]/.test(it.s)||/^\d[\d,.]*$/.test(it.s)&&it.s.length>4){var e=it.x+it.w-2;for(var q=0;q<cols.length;q++){var sq=span(q);if(e>=sq[0]&&e<sq[1])return q;}}var best=0,bo=-1;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>bo){bo=o;best=j;}}return best;}
    for(var i2=hi+1;i2<lines.length;i2++){
      var ln=lines[i2],words=[];ln.items.forEach(function(it){imWords(it).forEach(function(w){words.push(w);});});
      if(!words.length||/^page \d+( of \d+)?$/i.test(ln.text.trim()))continue;
      if(yc>=0&&words.some(function(w){return colOf(w)===yc&&/^(18[89]\d|19\d\d|20\d\d)$/.test(w.s);}))expect++;
      var first=words[0],startsRec=colOf(first)===0&&/^\d{1,3}$/.test(first.s);
      var wide=ln.items.some(function(it){var n=0;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>8)n++;}return n>2&&it.s.split(/\s+/).length>6;});
      if(!startsRec&&(colOf(first)===0||wide)){cur=null;lastY=null;continue;} // heading or note: skip it, keep reading
      if(lastY!==null&&cur&&!startsRec){var d=ln.y-lastY,med=gap.length?gap.slice().sort(function(a,b){return a-b;})[Math.floor(gap.length/2)]:ln.h*1.3;if(d>Math.max(med*2.2,ln.h*2.4)){cur=null;lastY=null;continue;}gap.push(d);}
      if(startsRec){cur={cells:cols.map(function(){return '';})};recs.push(cur);gap=[];words=words.slice(1);}
      lastY=ln.y;if(!cur)continue;
      words.forEach(function(w){var k=colOf(w);cur.cells[k]=(cur.cells[k]?cur.cells[k]+' ':'')+w.s;});
    }
  });
  if(!hdrNames)return null;
  var grid=recs.map(function(r){var c=r.cells.map(function(s){return s.replace(/-\s+(?=[a-z])/g,'-').replace(/\s+/g,' ').trim();});
    // a year cell that swallowed the VIN: "1961 229451" -> year 1961, VIN 229451
    if(yc>=0){var m=/^(18[89]\d|19\d\d|20\d\d)\b\s*(.*)$/.exec(c[yc]);if(m&&m[2]){c[yc]=m[1];if(vc>=0)c[vc]=(m[2]+' '+(c[vc]||'')).trim();}}
    return c;});
  IM_PDF.expect=Math.max(expect,recs.length);
  return {hdr:hdrNames,grid:grid};
}
// ---------- reading: count what the sheet had vs what we read; AI fallback for PDFs ----------
async function imReadFile(file){
  IM_PDF.expect=0;
  var out=await imReadFileBase(file),good=out.rows.filter(function(r){return !r.bad;}).length;
  out.expected=Math.max(IM_PDF.expect||0,out.rows.length);
  if(out.how==='pdf'&&good<out.expected&&imAiOk()){
    try{var buf=await file.arrayBuffer();var ai=await imAi({mode:'rows',mime:'application/pdf',file_base64:imB64(buf)});IM.usedAi=true;
      var rows=(Array.isArray(ai.rows)?ai.rows:[]).map(function(r){return {year:r.year,make:r.make,model:r.model,vin:r.vin,reg:[r.registration,r.region].filter(Boolean).join(' / '),color:r.colour||r.color,miles:r.mileage,paid:r.paid,loc:r.location,ins:r.insurance};}).filter(imIsData).map(function(raw,i){var c=imClean(raw);c.n=i+1;c.raw=raw;return c;});
      if(rows.length>good){out.rows=rows.slice(0,500);out.how='ai';out.aiFallback=true;}
    }catch(e){out.aiError=(e&&e.message)||'AI reading failed';}
  }
  out.read=out.rows.filter(function(r){return !r.bad;}).length;
  return out;
}
function imReadNote(){
  var f=IM.file||{},n=f.expected||0,m=f.read!=null?f.read:(IM.rows||[]).length;
  if(n&&m<n)return '<div class="im-err" role="alert"><b>The sheet has '+n+' rows. We could read '+m+'.</b> Check the missing cars before saving, or try an Excel or CSV copy.'+(f.aiError?' AI reading did not work: '+imE(f.aiError):'')+'</div>';
  return '<div class="im-ok">The sheet has '+(n||m)+' row'+((n||m)===1?'':'s')+'. All '+m+' were read'+(f.aiFallback?' (by AI)':'')+'.</div>';
}
function imStep2(){var h=imStep2Base();var i=h.indexOf('</div></div>');return i>0?h.slice(0,i+12)+imReadNote()+h.slice(i+12):imReadNote()+h;}
// ---------- analysis ----------
function imFlags(f){var L=[];
  if(f.vin&&f.vin.length===17&&!(Number(f.year)&&Number(f.year)<1981)){var e=imVinExpect(f.vin);if(e===null||e!==f.vin[8])L.push(e===null?'VIN has letters VINs never use (I, O or Q)':'VIN check digit should be '+e+', the sheet has '+f.vin[8]);}
  if(f.paid&&f.paid<100)L.push('What you paid looks too low ('+imFmt('paid',{v:f.paid,cur:f.cur})+'). Check the sheet');
  return L;}
function imAnalyze(rows,owner,pfId,res){
  res=res||{};
  var col=imCollection(owner),out={rows:[],changes:[],news:[],conflicts:[],prompts:[],matched:{},skip:{}},taken={};
  var pre=rows.map(function(r,ri){
    var o={ri:ri,n:r.n,r:r,f:null,block:null};
    if(r.bad){o.block={type:'bad',reason:r.bad};return o;}
    for(var k in r.u)if(r.u.hasOwnProperty(k)){
      var key='u'+ri+':'+k,x=r.u[k],core=(k==='year'||k==='make'||k==='model');
      var shown=k==='miles'&&x.km?(Number(x.val.v).toLocaleString('en-US')+' km = '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi'):imFmt(k,k==='miles'?x.val.v:x.val);
      if(res[key]==='skipcar'){o.block={type:'skipped',reason:'You chose to skip this car'};return o;}
      if(!res[key])out.conflicts.push({key:key,ri:ri,type:'unclear',field:k,blocking:core,title:(x.km?'Mileage in km':IM_LABEL[k]+' unclear on sheet'),car:imCarName(r.f)||('Row '+r.n),lines:[['Sheet says',shown]],note:core?'This car is waiting for your answer.':'Left blank unless you choose Use it.',opts:[{v:'use',label:x.km?'Use '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi':'Use it',gold:true},{v:core?'skipcar':'skip',label:core?'Skip this car':'Leave blank'}]});
      if(core&&!res[key])o.block={type:'needs',reason:IM_LABEL[k]+' unclear on the sheet'};
    }
    o.f=imRowFields(r,ri,res);
    if(!o.block&&!o.f.make&&!o.f.model)o.block={type:'bad',reason:'No make or model'};
    return o;
  });
  // pass 1: exact VIN / chassis or plate
  pre.forEach(function(o){if(o.block)return;var f=o.f,vin=imVinClean(f.vin),pk=imPlateKey(f.plate);
    var m=col.filter(function(v){var vv=imVinClean(v.vin);if(vin&&vv&&vv!==vin)return false;return (vin.length>=5&&vv&&vv===vin)||(pk.length>=3&&imPlateKey(v.plate)===pk&&!(vin&&!vv&&imVinRulesOut(vin,v)));})[0];
    if(m&&!taken[m.id]){o.m=m;o.how=imVinClean(m.vin)===vin&&vin?(vin.length===17?'VIN':'chassis number'):'registration';taken[m.id]=o.ri;}});
  imPass2v25(pre,col,taken,out,res);
  pre.forEach(function(o){
    var f=o.f,row={ri:o.ri,n:o.n,car:o.f?(imCarName(o.f)||('Row '+o.n)):('Row '+o.n),flags:o.f?imFlags(o.f):[]};
    if(o.block){row.bucket=o.block.type==='skipped'?'skipped':'needs';row.reason=o.block.reason;out.rows.push(row);if(o.block.type==='skipped')out.skip[o.ri]=1;return;}
    if(o.m&&typeof PO!=='undefined'&&PO.on&&pfId&&poOf(o.m,owner).id!==pfId){var pk='p'+o.ri,pc=res[pk],pfName=function(v){return poOf(v,owner).name;};
      if(pc==='skip'){row.bucket='skipped';row.reason='You chose to skip it (it is in '+pfName(o.m)+')';out.skip[o.ri]=1;out.rows.push(row);return;}
      if(pc!=='here')out.conflicts.push({key:pk,ri:o.ri,type:'otherpf',title:'Already in another portfolio',car:imVName(o.m),lines:[['Portfolio',pfName(o.m)]],note:'This car is already in your collection, in '+pfName(o.m)+'. It will be updated there and stays in that portfolio.',opts:[{v:'here',label:'Update it there',gold:true},{v:'skip',label:'Skip'}]});}
    if(o.m){var m=o.m;out.matched[o.ri]=m.id;row.vid=m.id;row.match=imVName(m);row.how=o.how;var fills=0,reps=0;
      IM_ORDER.forEach(function(k){
        var sv=imSheetVal(f,k);if(imEmpty(sv))return;var cv=imCur(m,k);
        if(k==='make')return;if(k==='model'&&!imEmpty(cv))return;
        if(imSame(k,cv,sv))return;
        var kind=imEmpty(cv)?'fill':'replace',ck='c'+o.ri+':'+k;
        out.changes.push({key:ck,ri:o.ri,vid:m.id,field:k,car:imVName(m),cur:imFmt(k,cv),val:imFmt(k,sv),raw:sv,kind:kind});
        if(kind==='fill')fills++;else reps++;});
      row.fills=fills;row.reps=reps;row.bucket=(fills||reps)?'update':'unchanged';
      row.reason=(/answer|same/.test(o.how)?'Suggested match ('+o.how+'): your ':'Matched by '+o.how+' to your ')+imVName(m)+(fills?' \u00b7 '+fills+' blank'+(fills===1?'':'s')+' filled':'')+(reps?' \u00b7 '+reps+' different value'+(reps===1?'':'s')+' to approve':'')+(!fills&&!reps?' \u00b7 nothing new on the sheet':'');
      out.rows.push(row);return;}
    if(!f.year||!f.make){row.bucket='needs';row.reason='Year or make missing, so it cannot be added';out.rows.push(row);
      out.conflicts.push({key:'n'+o.ri,ri:o.ri,type:'incomplete',blocking:true,title:'Year or make missing',car:row.car,lines:[['Sheet row',String(o.n)]],note:'A new car needs a year and make. Add this one by hand.',opts:[]});return;}
    var y=toInt(f.year);if(!y||y<1885||y>new Date().getFullYear()+2){row.bucket='needs';row.reason='Year '+f.year+' is not valid';out.rows.push(row);return;}
    var ak='a'+o.ri;
    out.news.push({key:ak,ri:o.ri,f:f,prompt:!!o.prompt});
    if(IM.add[ak]===false){row.bucket='skipped';row.reason='You chose Skip';}
    else{row.bucket='new';row.reason=o.prompt?'Not matched (you can say it is the same as one of your cars)':'Not in your app yet';}
    out.rows.push(row);
  });
  out.rows.forEach(function(r){r.flags.forEach(function(fl){out.conflicts.push({key:'f'+r.ri+fl.length,ri:r.ri,type:'flag',blocking:false,title:'Please check',car:r.car,lines:[],note:fl,opts:/^VIN/.test(fl)?[{v:'edit',label:'Edit VIN',gold:true}]:[]});});});
  out.conflicts.forEach(function(c){if(c.type==='flag'&&c.opts.length)c.key='vin'+c.ri;});
  return out;
}
function imChangeOn(x){return x.kind==='fill'?IM.appr[x.key]!==false:IM.appr[x.key]===true;}
function imAddOn(x){return IM.add[x.key]!==false;}
function imPlanCounts(A){var vids={};A.changes.forEach(function(x){if(imChangeOn(x))vids[x.vid]=1;});return {add:A.news.filter(imAddOn).length,upd:Object.keys(vids).length};}
function imApprovedCount(A){var c=imPlanCounts(A);return c.add+c.upd;}
// ---------- review ----------
function imToReview(){
  if(!IM.owner){IM.msg='Choose whose collection these vehicles belong to.';imRender();return;}
  return (async function(){
    if(IM.newPf){var nm=cleanText(IM.newPf.name,80);if(!nm){IM.msg='Give the new portfolio a name.';imRender();return;}
      IM.busy=true;IM.msg='';imRender();
      try{IM.pfId=await poCreate(IM.owner,nm,IM.newPf.country,IM.newPf.currency);IM.newPf=null;audit('portfolio.created','Portfolio created: '+nm,{clientId:IM.owner});}catch(e){IM.busy=false;IM.msg=e.message||'Could not create the portfolio.';imRender();return;}
      IM.busy=false;}
    var A=imA();IM.msg='';IM.step=3;IM.tab=A.prompts.length||A.conflicts.some(function(c){return c.blocking;})?'check':(A.news.length?'new':'changes');imRender();
  })();
}
function imBucketCounts(A){var c={new:0,update:0,unchanged:0,needs:0,skipped:0};A.rows.forEach(function(r){c[r.bucket]=(c[r.bucket]||0)+1;});return c;}
function imStep3(){
  var A=imA(),pc=imPlanCounts(A),bc=imBucketCounts(A),nCheck=A.prompts.length+A.conflicts.length+A.changes.filter(function(x){return x.kind==='replace';}).length;
  var tabs=[['new','New cars',A.news.length],['changes','Updates',A.changes.length],['check','Check',nCheck],['all','All rows',A.rows.length]];
  var h='<h1 class="im-h1">Review</h1>'+
    '<div class="im-card im-sum"><div class="im-sum-g"><div><b>'+bc.new+'</b><span>New</span></div><div><b>'+bc.update+'</b><span>Update</span></div><div><b>'+bc.unchanged+'</b><span>Unchanged</span></div><div'+(bc.needs?' class="warn"':'')+'><b>'+bc.needs+'</b><span>Needs you</span></div></div>'+
    '<div class="im-txt">'+A.rows.length+' row'+(A.rows.length===1?'':'s')+' from the sheet'+(bc.skipped?' \u00b7 '+bc.skipped+' skipped':'')+'</div></div>';
  h+='<div class="im-tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" aria-selected="'+(IM.tab===t[0])+'" class="im-tab'+(IM.tab===t[0]?' on':'')+(t[0]==='check'&&t[2]?' warn':'')+'" onclick="IM.tab=\''+t[0]+'\';imRender()">'+t[1]+' <span class="im-n">'+t[2]+'</span></button>';}).join('')+'</div>'+imErr();
  if(IM.tab==='new')h+=imTabNew(A);else if(IM.tab==='changes')h+=imTabChanges(A);else if(IM.tab==='check')h+=imTabCheck(A);else h+=imTabAll(A);
  var lbl=IM.busy?'Saving... '+(IM.prog||''):(pc.add||pc.upd)?'Save: add '+pc.add+' car'+(pc.add===1?'':'s')+', update '+pc.upd:'Nothing to save';
  h+='<div class="im-savebar"><button class="im-btn gold" '+((pc.add||pc.upd)&&!IM.busy?'':'disabled')+' onclick="imSave()">'+lbl+'</button></div>';
  return h;
}
function imTabNew24(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner),on=A.news.filter(imAddOn).length;
  var h='<p class="im-lead">'+on+' of '+A.news.length+' car'+(A.news.length===1?'':'s')+' will be added to '+imE(pf.name)+'. Anything the sheet does not have shows as Missing.</p>';
  A.news.forEach(function(x){var st=imAddOn(x),cb=st?cbImUI(x.ri,x.f,null):'',held=cb&&cbImHeld(x.ri,x.f,null),f=x.f;
    if(cb){f=JSON.parse(JSON.stringify(x.f));f.paid=null;}
    h+='<div class="im-item'+(st?'':' off')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(f)+(cb?'<div class="im-cap gold cb-cap">What you paid</div>'+cb:'')+(x.prompt?'<div class="im-txt gold">Might be one of your cars. See Check.</div>':'')+
      (st?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be added \u00b7 confirm later':'\u2713 Will be added')+'</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>':
      '<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',null)">Add it</button></div>')+'</div>';});
  return h;
}
function imTabChanges24(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var reps=A.changes.filter(function(x){return x.kind==='replace'&&!imChangeOn(x);}).length;
  var h='<p class="im-lead">Blank details are filled in for you. A different value only replaces yours if you approve it.</p>';
  if(reps)h+='<button class="im-btn line" onclick="imApproveAll()">Approve all '+reps+' replacement'+(reps===1?'':'s')+'</button>';
  A.changes.forEach(function(x){var on=imChangeOn(x),cb=x.field==='paid'&&on?cbImUI(x.ri,cbImRowF(x.ri),x.vid):'',held=cb&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid);
    h+='<div class="im-item'+(on?'':' off')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+(x.kind==='fill'?' \u00b7 blank, will be filled':' \u00b7 replaces your value')+'</div>'+
      (cb?'<div class="im-pair one"><div><div class="im-cap">Current</div><div class="im-v'+(x.cur?'':' blank')+'">'+(x.cur?imE(x.cur):'Blank')+'</div></div></div><div class="im-cap gold cb-cap">Sheet</div>'+cb:imPair(x.cur,x.val))+
      (x.kind==='fill'?(on?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be filled \u00b7 confirm later':'\u2713 Will be filled')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>':'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',null)">Fill it</button></div>'):
      (on?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will replace \u00b7 confirm later':'\u2713 Will replace')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Keep mine</button></div>':'<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Replace</button><span class="im-state">Keeping yours</span></div>'))+'</div>';});
  return h;
}
function imTabCheck(A){
  var reps=A.changes.filter(function(x){return x.kind==='replace';});
  if(!A.prompts.length&&!A.conflicts.length&&!reps.length)return '<div class="im-empty">All clear. Nothing to check.</div>';
  var h='';
  if(A.prompts.length){h+='<p class="im-lead"><b>Same car?</b> These look like cars you already have. We matched these by name and year (and known other names, like Jolly for a Fiat 500), so please check.</p>';
    A.prompts.forEach(function(p){
      h+='<div class="im-item im-conf"><div class="im-ct">Same car?</div><div class="im-car">'+imE(p.car)+'</div>'+(p.note?'<div class="im-txt im-note25">'+imE(p.note)+'</div>':'')+p.cands.map(function(c){return '<div class="im-kv"><span>Your car</span><b>'+imE(c.name)+(c.dy&&c.dy<99?' ('+c.dy+' yr apart)':'')+'</b></div>';}).join('')+
        '<div class="im-txt">'+(p.pick==='new'?'Will be added as a new car.':p.pick==='skip'?'Skipped.':'Will update your '+imE((p.cands.filter(function(c){return c.id===p.pick;})[0]||{}).name||'car')+'.')+(p.chosen?'':' (suggested)')+'</div>'+
        '<div class="im-acts stack">'+p.cands.map(function(c){return '<button class="im-btn sm '+(p.pick===c.id?'gold':'line')+'" onclick="imResolve(\''+p.key+'\',\''+c.id+'\')">'+(p.pick===c.id?'\u2713 ':'')+'Same as '+imE(c.name)+'</button>';}).join('')+
        '<button class="im-btn sm '+(p.pick==='new'?'gold':'line')+'" onclick="imResolve(\''+p.key+'\',\'new\')">'+(p.pick==='new'?'\u2713 ':'')+'No, add as new</button></div></div>';});}
  if(A.conflicts.length){h+='<p class="im-lead"><b>Please check</b></p>';
    A.conflicts.forEach(function(x){
      h+='<div class="im-item im-conf"><div class="im-ct">'+imE(x.title)+'</div><div class="im-car">'+imE(x.car)+'</div>'+x.lines.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('')+(x.note?'<div class="im-txt">'+imE(x.note)+'</div>':'');
      if(IM.edit===x.key)h+='<label class="im-lab" for="im-edit-in">Correct VIN</label><input id="im-edit-in" class="im-in mono" maxlength="24" value="'+imE((A.rows.filter(function(r){return r.ri===x.ri;})[0]||{}).vin||'')+'" autocapitalize="characters"><div class="im-acts"><button class="im-btn sm gold" onclick="imEditSave(\''+x.key+'\')">Save VIN</button><button class="im-btn sm line" onclick="IM.edit=null;imRender()">Cancel</button></div>';
      else if(x.opts.length)h+='<div class="im-acts wrap">'+x.opts.map(function(o){return '<button class="im-btn sm '+(o.gold?'gold':'line')+'" onclick="imResolve(\''+x.key+'\',\''+String(o.v).replace(/'/g,'')+'\')">'+imE(o.label)+'</button>';}).join('')+'</div>';
      h+='</div>';});}
  if(reps.length)h+='<p class="im-lead"><b>'+reps.length+' different value'+(reps.length===1?'':'s')+'</b> on the sheet. Yours are kept unless you approve them in Updates.</p><button class="im-btn line" onclick="IM.tab=\'changes\';imRender()">Open Updates</button>';
  return h;
}
var IM_BLABEL={new:'New',update:'Update',unchanged:'Unchanged',needs:'Needs you',skipped:'Skipped',added:'Added',updated:'Updated',failed:'Not saved'};
function imTabAll(A){return '<p class="im-lead">Every row on the sheet, and what happens to it.</p>'+A.rows.map(function(r){return '<div class="im-row b-'+r.bucket+'"><div class="im-row-t"><b>'+r.n+'. '+imE(r.car)+'</b><span>'+imE(r.reason)+'</span></div><span class="im-bk">'+IM_BLABEL[r.bucket]+'</span></div>';}).join('');}
function imAppr(k,v){if(v===null)delete IM.appr[k];else IM.appr[k]=v;imRender();}
function imAdd(k,v){if(v===null)delete IM.add[k];else IM.add[k]=v;imRender();}
function imApproveAll(){imA().changes.forEach(function(x){if(x.kind==='replace')IM.appr[x.key]=true;});imRender();}
function imAddAll(){imA().news.forEach(function(x){delete IM.add[x.key];});imRender();}
function imResolve(k,v){if(/^vin/.test(k)){if(v==='edit'){IM.edit=k;imRender();return;}IM.res[k]={keep:true};}else IM.res[k]=v;IM.edit=null;imRender();}
// ---------- save: one car at a time, wait for the cloud, report every failure ----------
function imErrText(e){var m=(e&&(e.message||e.details||e.hint))||String(e||'');if(/row-level security|permission|42501/i.test(m))return 'Not allowed to save this car (permissions).';if(/network|fetch|Failed to fetch/i.test(m))return 'No connection. Try again.';return m?m.slice(0,140):'Could not save.';}
async function imSave24(){
  if(IM.busy)return;var A=imA(),owner=IM.owner,pfId=IM.pfId,now=new Date().toISOString();
  var plan=imPlanCounts(A);if(!plan.add&&!plan.upd){IM.msg='Nothing to save.';imRender();return;}
  IM.busy=true;IM.msg='';IM.prog='';imRender();
  var cloud=typeof sb!=='undefined'&&sb&&session,results={},batch={id:IM.id||uid(),at:now,owner:owner,pf:pfId,added:[],changed:[],file:(IM.file&&IM.file.name)||''},fails=0;
  A.rows.forEach(function(r){results[r.ri]={n:r.n,car:r.car,bucket:r.bucket==='new'||r.bucket==='update'?r.bucket:r.bucket,reason:r.reason,fields:[],vid:r.vid};});
  try{if(cloud&&Q&&Q.chain)await Q.chain;}catch(e){}
  var later=0;
  A.changes.forEach(function(x){if(x.field!=='paid')return;var r=cbImReason(x.ri,cbImRowF(x.ri),x.vid);x.raw=JSON.parse(JSON.stringify(x.raw));x.raw.cbFlag=r;if(r&&imChangeOn(x))later++;});
  A.news.forEach(function(x){var r=cbImReason(x.ri,x.f,null);x.f.cbFlag=r;if(r&&imAddOn(x))later++;});
  var vehicles=getVehicles(),byV={},jobs=[];
  A.changes.forEach(function(x){if(imChangeOn(x))(byV[x.vid]=byV[x.vid]||[]).push(x);});
  Object.keys(byV).forEach(function(vid){var v=byId(vehicles,vid);var ri=byV[vid][0].ri;
    if(!v||isArchivedVehicle(v)||!canEditVehicle(v)){results[ri].bucket='failed';results[ri].reason='You cannot edit this car';fails++;return;}
    jobs.push({type:'update',vid:vid,ri:ri,xs:byV[vid]});});
  var canAdd=canAddVehicleFor(owner);
  A.news.forEach(function(x){if(!imAddOn(x))return;
    if(!canAdd){results[x.ri].bucket='failed';results[x.ri].reason='You cannot add cars to this collection';fails++;return;}
    var nv=imNewVehicle(x.f,owner,pfId,now);if(!nv){results[x.ri].bucket='failed';results[x.ri].reason='Year is not valid';fails++;return;}
    jobs.push({type:'add',nv:nv,ri:x.ri});});
  // rows matched but with nothing applied are unchanged
  A.rows.forEach(function(r){if(r.bucket==='update'&&!byV[r.vid])results[r.ri].bucket='unchanged';});
  for(var i=0;i<jobs.length;i++){var j=jobs[i];IM.prog=(i+1)+' of '+jobs.length;imRender();
    if(j.type==='add'){
      try{if(cloud)await KIND.vehicles.insert(j.nv);
        C.vehicles.push(j.nv);if(cloud&&SNAP){SNAP.vehicles=SNAP.vehicles||{};SNAP.vehicles[j.nv.id]={sig:KIND.vehicles.sig(j.nv),item:snapClone(j.nv)};}
        batch.added.push(j.nv.id);results[j.ri].bucket='added';results[j.ri].vid=j.nv.id;results[j.ri].fields=imNewLinesTxt(j.nv);
      }catch(e){fails++;results[j.ri].bucket='failed';results[j.ri].reason=imErrText(e);}
    }else{
      var cur=byId(getVehicles(),j.vid),nv2=JSON.parse(JSON.stringify(cur)),props=[],before={},after={};
      j.xs.forEach(function(x){IM_PROPS[x.field].forEach(function(p){if(props.indexOf(p)<0)props.push(p);});});
      props.forEach(function(p){before[p]=nv2[p]===undefined?null:nv2[p];});
      j.xs.forEach(function(x){imSetProp(nv2,x.field,x.raw);});
      props.forEach(function(p){after[p]=nv2[p]===undefined?null:nv2[p];});nv2.updatedAt=now;
      try{var prev=cloud&&SNAP&&SNAP.vehicles&&SNAP.vehicles[j.vid]?SNAP.vehicles[j.vid].item:cur;
        if(cloud)await KIND.vehicles.update(nv2,prev);
        C.vehicles=C.vehicles.map(function(v){return v.id===j.vid?nv2:v;});
        if(cloud&&SNAP&&SNAP.vehicles)SNAP.vehicles[j.vid]={sig:KIND.vehicles.sig(nv2),item:snapClone(nv2)};
        batch.changed.push({id:j.vid,before:before,after:after,fields:j.xs.map(function(x){return x.field;})});
        results[j.ri].bucket='updated';results[j.ri].fields=j.xs.map(function(x){return IM_LABEL[x.field]+': '+(x.cur||'Blank')+' \u2192 '+x.val;});
      }catch(e){fails++;results[j.ri].bucket='failed';results[j.ri].reason=imErrText(e);}
    }
  }
  if(!cloud)setVehicles(C.vehicles);
  IM.prog='';
  if(batch.added.length||batch.changed.length){
    batch.changed.forEach(function(c){var v=byId(getVehicles(),c.id);audit('vehicle.updated','Updated from master sheet ('+c.fields.map(function(k){return IM_LABEL[k];}).join(', ')+'): '+vName(v),{clientId:owner,vehicleId:c.id});});
    batch.added.forEach(function(id){var nv=byId(getVehicles(),id);audit('vehicle.created','Vehicle added from master sheet: '+vName(nv)+' ('+imVName(nv)+')',{clientId:owner,vehicleId:id});});
    var sigs={},vs=getVehicles();batch.added.forEach(function(id){var v=byId(vs,id);if(v)sigs[id]=unSig(v);});batch.sigs=sigs;batch.db=false;
    var all=imBatches();all.push(batch);imSaveBatches(all);
    if(cloud){try{var r=await sb.rpc('record_import_batch',{p_id:batch.id,p_owner:owner,p_portfolio:isUuid(pfId)?pfId:null,p_file:batch.file,p_added:batch.added.slice(),p_changed:unChangedForDb(batch.changed)});if(r&&!r.error)unMark(batch.id,{db:true});}catch(e){}}
  }
  var pf=poList(owner).filter(function(p){return p.id===pfId;})[0]||poDefault(owner);
  IM.busy=false;
  IM.done={cbLater:later,batch:batch,results:Object.keys(results).map(function(k){return results[k];}).sort(function(a,b){return a.n-b.n;}),fails:fails,pf:pf.name,expected:(IM.file&&IM.file.expected)||0,read:(IM.file&&IM.file.read!=null)?IM.file.read:A.rows.length};
  IM.step=4;IM.view='';imRender();
  if(fails)showToast(fails+' car'+(fails===1?'':'s')+' could not be saved. See the list.','error');else showToast('Import saved','success');
}
function imNewLinesTxt(v){var L=[];if(v.vin)L.push('VIN '+v.vin);if(v.plate)L.push('Reg '+v.plate);if(v.color)L.push(v.color);if(Number(v.purchasePrice)>0)L.push(imFmt('paid',{v:Number(v.purchasePrice),cur:v.currency||'USD'}));if(v.location)L.push(v.location);return L;}
function imRetry(){IM.step=3;IM.done=null;IM.tab='all';imRender();}
function imStep4Base(){
  var d=IM.done,b=d.batch,R=d.results||[],g=function(k){return R.filter(function(r){return r.bucket===k;});};
  var ad=g('added'),up=g('updated'),un=g('unchanged'),nd=g('needs'),sk=g('skipped'),fl=g('failed');
  var h='<div class="im-done"><div class="im-big '+(fl.length?'bad':'ok')+'">'+(fl.length?'!':'\u2713')+'</div><h1 class="im-h1">'+(fl.length?'Saved, with problems':'Import saved')+'</h1>'+
    '<p class="im-lead im-sumline"><b>'+ad.length+' added, '+up.length+' updated, '+un.length+' unchanged</b>'+(nd.length?', '+nd.length+' need you':'')+(sk.length?', '+sk.length+' skipped':'')+(fl.length?', '+fl.length+' not saved':'')+'.</p>';
  if(d.expected&&d.read<d.expected)h+='<div class="im-err" role="alert"><b>The sheet has '+d.expected+' rows. We read '+d.read+'.</b> The others are not in this import.</div>';
  else h+='<div class="im-ok">All '+R.length+' rows on the sheet are accounted for.</div>';
  if(d.cbLater&&!d.undone)h+='<div class="im-kv cb-kv"><span>Costs to confirm</span><b>'+d.cbLater+'</b></div><p class="im-lead">Open each car to confirm or fix what you paid.</p>';
  function sec(title,list,cls,lines){if(!list.length)return '';return '<div class="im-card im-res '+cls+'"><div class="im-cap">'+title+' \u00b7 '+list.length+'</div>'+list.map(function(r){return '<div class="im-res-r"><b>'+imE(r.car)+'</b>'+(lines?lines(r):'')+'</div>';}).join('')+'</div>';}
  h+=sec('Could not save',fl,'bad',function(r){return '<span class="bad">'+imE(r.reason)+'</span>';});
  h+=sec('Added to '+imE(d.pf),ad,'',function(r){return r.fields&&r.fields.length?'<span>'+imE(r.fields.join(' \u00b7 '))+'</span>':'<span>Details missing. Add them on the car page.</span>';});
  h+=sec('Updated',up,'',function(r){return r.fields.map(function(f){return '<span>'+imE(f)+'</span>';}).join('');});
  h+=sec('Needs you',nd,'warn',function(r){return '<span>'+imE(r.reason)+'</span>';});
  h+=sec('Unchanged',un,'',function(r){return '<span>'+imE(r.reason)+'</span>';});
  h+=sec('Skipped',sk,'',function(r){return '<span>'+imE(r.reason)+'</span>';});
  if(fl.length||nd.length)h+='<button class="im-btn gold" onclick="imRetry()">'+(fl.length?'Try the failed cars again':'Review the rows that need you')+'</button>';
  h+='<button class="im-btn '+(fl.length||nd.length?'line':'gold')+'" onclick="imClose()">View collection</button>';
  if(b.added.length||b.changed.length)h+='<button class="im-btn line red" onclick="imUndo(\''+b.id+'\')">\u21b6 Undo this import</button><p class="im-lead un-note">You can undo this for 30 days.</p>';
  return h+unRecentCard()+'</div>';
}

function cbImPending(A){var n=0;A.changes.forEach(function(x){if(x.field==='paid'&&imChangeOn(x)&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid))n++;});A.news.forEach(function(x){if(imAddOn(x)&&cbImHeld(x.ri,x.f,null))n++;});return n;}
// p21 assigns its own imTabNew/imTabChanges/imSave at run time; install the v24 versions after it.
imTabNew=imTabNew24;imTabChanges=imTabChanges24;imSave=imSave24;

// ---------- v24b (Wade): VIN/chassis decides identity ----------
// Normalized VIN: uppercase, no spaces or dashes. Same VIN = same car; both VINs present and different = different cars.
function imVinClean(s){s=String(s||'').replace(/^(chassis|vin|serial|frame)(\s*(number|no\.?|#))?\s*[:#-]?\s*/i,'');return s.replace(/[\s\-\u2013\u2014.\/]+/g,'').toUpperCase().slice(0,24);}
var IM_WMI={SAL:'Land Rover',SAJ:'Jaguar',SCB:'Bentley',SCA:'Rolls Royce',SCF:'Aston Martin',SD7:'Aston Martin',ZAR:'Alfa Romeo',ZAS:'Alfa Romeo',ZFA:'Fiat',ZFF:'Ferrari',ZHW:'Lamborghini',WMW:'Mini',WUA:'Audi',WAU:'Audi',WP0:'Porsche',WP1:'Porsche',WBA:'BMW',WDB:'Mercedes Benz',WDD:'Mercedes Benz',WVW:'Volkswagen',WV2:'Volkswagen',VF1:'Renault',SFD:'Ford',WF0:'Ford'};
// Model from the VDS, only where the code is unambiguous.
function imVinDecode(vin){vin=imVinClean(vin);if(vin.length!==17||/[IOQ]/.test(vin))return null;
  var make=IM_WMI[vin.slice(0,3)]||null,model=null,c4=vin[3],c45=vin.slice(3,5);if(!make)return null;
  if(make==='Land Rover'){if(c4==='E'||c45==='LD')model='Defender';else if(c4==='G'||c4==='K'||c4==='M')model='Range Rover';else if(c4==='W'||c4==='Y')model='Range Rover Sport';else if(c4==='V'||c4==='Z')model='Range Rover Evoque';else if(c4==='R'||c45==='LN'||c45==='LA')model='Discovery';}
  else if(make==='Bentley'&&c4==='C')model='Continental';
  else if(make==='Mini'&&c45==='ZC')model='Countryman';
  else if(make==='Alfa Romeo'&&vin.slice(3,6)==='916')model='Spider';
  return {make:make,model:model};}
// Does the VIN on one side rule out the car on the other? (used when only one side has a VIN)
function imVinRulesOut(vin,v){var d=imVinDecode(vin);if(!d)return '';
  if(imMakeKey(d.make)!==imMakeKey(v.make))return 'VIN is a '+d.make;
  if(d.model){var a=String(d.model).toLowerCase(),b=String(v.model||'').toLowerCase();if(b&&b.indexOf(a)<0&&a.indexOf(b)<0&&imModelSim(d.model,v.model)<0.5)return 'VIN is a '+d.make+' '+d.model;}
  return '';}
var _imFlags24=imFlags;imFlags=function(f){var L=_imFlags24(f),d=f.vin?imVinDecode(f.vin):null;
  if(d&&f.make&&imMakeKey(d.make)!==imMakeKey(f.make))L.push('VIN belongs to a '+d.make+', the sheet says '+f.make);
  else if(d&&d.model&&f.model&&imVinRulesOut(f.vin,{make:f.make,model:f.model}))L.push('VIN looks like a '+d.model+', the sheet says '+f.model);
  return L;};
/* ===== p25: import duplicate check with model aliases (same release as press and hold) ===== */
var IM_FAM25=[
 {mk:'fiat',id:'fiat-500',label:'Fiat 500 / 600 family',re:/\b(jolly|500|600|nuova|giardiniera|topolino)\b/,
  ranges:[[/\bjolly\b/,1957,1974,'Fiat Jolly']]},
 {mk:'volkswagen',id:'vw-type2',label:'VW Type 2 (bus)',re:/\b(t1|t2|type 2|type ii|samba|kombi|bus|microbus|transporter|westfalia|split screen|splitscreen|bay window)\b/,
  ranges:[[/\b(t1|samba|split screen|splitscreen)\b/,1950,1967,'VW T1'],[/\b(t2|bay window)\b/,1967,1979,'VW T2']]},
 {mk:'porsche',id:'porsche-356-550',label:'Porsche 356 / 550',re:/\b(speedster|spyder|spider|550|356|replica|tribute)\b/,
  ranges:[[/\bspeedster\b/,1954,1958,'356 Speedster'],[/\b550\b/,1953,1956,'550 Spyder'],[/\b356\b/,1948,1965,'Porsche 356']],soft:/\b(replica|tribute|recreation|kit)\b/}
];
function imFam25(make,model){var mk=imMakeKey(make),m=imNorm(model);if(!m)return null;
  for(var i=0;i<IM_FAM25.length;i++){var F=IM_FAM25[i];if(F.mk===mk&&F.re.test(m))return F;}return null;}
// why the year on this side may not be the real model year ('' when it looks fine)
function imYearDoubt25(F,model,year){if(!F)return '';var m=imNorm(model),y=Number(year);
  if(F.soft&&F.soft.test(m))return 'It is a replica, so its year may be the build year.';
  if(!y)return 'The year is missing.';
  for(var i=0;i<F.ranges.length;i++){var r=F.ranges[i];if(r[0].test(m)&&(y<r[1]||y>r[2]))return 'The '+r[3]+' was made '+r[1]+'\u2013'+r[2]+', so '+y+' may be wrong.';}
  return '';}
function imPass2v25(pre,col,taken,out,res){
  var todo=[];
  pre.forEach(function(o){if(o.block||o.m)return;var f=o.f,mk=imMakeKey(f.make),vin=imVinClean(f.vin),F=imFam25(f.make,f.model),cands=[];
    var dF=imYearDoubt25(F,f.model,f.year);
    col.forEach(function(v){if(taken[v.id]!==undefined)return;if(imMakeKey(v.make)!==mk)return;var vv=imVinClean(v.vin);
      if(vin&&vv&&vin!==vv)return; // both VINs present and different = different cars
      if(vin&&!vv&&imVinRulesOut(vin,v))return;if(vv&&!vin&&f.make&&imVinRulesOut(vv,{make:f.make,model:f.model}))return;
      var sim=imModelSim(f.model,v.model),dy=(Number(f.year)&&Number(v.year))?Math.abs(Number(f.year)-Number(v.year)):99,G=imFam25(v.make,v.model);
      if(F&&G&&F.id===G.id){var dV=imYearDoubt25(G,v.model,v.year),gap=(dF||dV)?15:3;
        if(dy<=gap)cands.push({v:v,sim:Math.max(sim,0.9),dy:dy,alias:true,doubt:dF||dV,strong:dy<=2&&sim>=0.5});return;}
      if(F&&G&&F.id!==G.id)return;
      if(F&&!G&&sim<0.5)return; // e.g. a Speedster is not a 912
      if(sim<0)return;
      if((sim>=0.5&&dy<=3)||dy===0)cands.push({v:v,sim:sim,dy:dy,strong:sim===1&&dy<=2});});
    if(!cands.length)return;
    cands.sort(function(a,b){return (b.strong-a.strong)||(a.dy-b.dy)||(b.sim-a.sim);});
    todo.push({o:o,cands:cands,dF:dF});});
  // best evidence first, so a weak row cannot take a car a strong row needs
  todo.sort(function(a,b){var x=a.cands[0],y=b.cands[0];return (y.strong-x.strong)||(x.dy-y.dy)||((y.alias?1:0)-(x.alias?1:0))||(a.o.ri-b.o.ri);});
  var prompts=[];
  todo.forEach(function(t){var o=t.o,f=o.f,live=t.cands.filter(function(c){return taken[c.v.id]===undefined;});
    if(!live.length)live=t.cands; // shown for the record; picking a taken car does nothing
    var key='m'+o.ri,ch=res[key],c0=live[0],free=live.filter(function(c){return taken[c.v.id]===undefined;});
    var def='new';
    if(free.length===1&&(free[0].alias||free[0].strong))def=free[0].v.id;
    else if(free.length>1&&free[0].strong&&!(free[1].strong&&free[1].dy===free[0].dy))def=free[0].v.id;
    o.prompt={key:key,ri:o.ri,cands:live.slice(0,3),def:def};
    var pick=ch||def;
    if(pick==='skip'){o.block={type:'skipped',reason:'You chose to skip this car'};}
    else if(pick!=='new'){var mv=col.filter(function(v){return v.id===pick;})[0];var pc=live.filter(function(c){return c.v.id===pick;})[0]||c0;
      if(mv&&taken[mv.id]===undefined){o.m=mv;o.how=ch?'your answer':(pc.alias?'same car, other name: '+(f.model||'')+' = '+(mv.model||''):(pc.dy===0?'same year, make and model':'same make and model (year differs)'));taken[mv.id]=o.ri;}}
    var note=t.dF||(live.filter(function(c){return c.doubt;})[0]||{}).doubt||'';
    prompts.push({key:key,ri:o.ri,car:imCarName(f)+(f.vin?' \u00b7 '+f.vin:''),note:note,cands:o.prompt.cands.map(function(c){return {id:c.v.id,name:imVName(c.v)+(c.v.vin?' \u00b7 '+c.v.vin:''),dy:c.dy,alias:!!c.alias};}),pick:pick,def:def,chosen:!!ch});});
  prompts.sort(function(a,b){return a.ri-b.ri;});
  prompts.forEach(function(p){out.prompts.push(p);});
}

/* ===== p25: press and hold on a car (ph-01..05) + Merge duplicates (mg-01..03) ===== */
var PH={pend:{},timer:null,st:null,suppress:0,move:null,mg:null,toastT:null};
function phE(s){return esc(String(s==null?'':s));}
function phPfName(v){try{return (typeof PO!=='undefined'&&PO.on)?poOf(v,v.clientId).name:'your collection';}catch(e){return 'your collection';}}
function phPfKey(v){return (v&&v.clientId||'')+'|'+((typeof PO!=='undefined'&&PO.on&&v&&v.portfolioId)||'');}
function phLocalOrder(){try{return JSON.parse(localStorage.getItem('evo.order25')||'{}');}catch(e){return {};}}
function phSorted(list){var lo=phLocalOrder();var a=(list||[]).map(function(v,i){var so=v.sortOrder;if(so==null){var l=lo[phPfKey(v)];if(l){var k=l.indexOf(v.id);if(k>=0)so=k+1;}}return {v:v,i:i,so:so};});
  a.sort(function(x,y){var xs=x.so==null?1e9:x.so,ys=y.so==null?1e9:y.so;return (xs-ys)||(x.i-y.i);});return a.map(function(x){return x.v;});}
function phFind(id){return getVehicles().filter(function(v){return v.id===id;})[0];}
function phCanMove(v){return !!v&&canEditVehicle(v)&&!isArchivedVehicle(v);}
function phCanDelete(v){if(!v)return false;try{if(realAdmin()||isRealOwnerOf(v))return true;}catch(e){}return !!v.createdBy&&v.createdBy===myId();}
function phCanRemove(v){return !!v&&(canEditVehicle(v)||phCanDelete(v));}
function phThumb(v){var s='';try{s=imgSrc(v);}catch(e){}return s?'<img src="'+phE(s)+'" alt="">':'<span class="ph-noimg">'+(typeof CAR_SVG!=='undefined'?CAR_SVG:'')+'</span>';}
function phVibe(){try{if(navigator.vibrate)navigator.vibrate(15);}catch(e){}}
function phLayer(){var r=document.getElementById('ph-root');if(!r){r=document.createElement('div');r.id='ph-root';document.body.appendChild(r);}return r;}
function phClose(){var r=document.getElementById('ph-root');if(r)r.innerHTML='';document.documentElement.classList.remove('ph-open');}
function phOpenLayer(html,label){var r=phLayer();r.innerHTML='<div class="ph-back" onclick="if(event.target===this&&Date.now()-PH.opened>450)phClose()"></div>'+html;PH.opened=Date.now();document.documentElement.classList.add('ph-open');
  var d=r.querySelector('[role=dialog]');if(d){d.setAttribute('aria-label',label||'Car options');var b=d.querySelector('button');if(b)try{b.focus({preventScroll:true});}catch(e){}}}
/* --- gesture (v25b: document-level delegation; touch events drive touch holds so iOS pointercancel cannot kill them) --- */
function phFrontCard(t){var c=t&&t.closest&&t.closest('.whl-card');if(!c||!c.classList.contains('front')||!c.closest('.whl-stage'))return null;if(t.closest('.whl-arrow,.whl-dots,.whl-dot'))return null;return c;}
function phCancelHold(){if(PH.timer){clearTimeout(PH.timer);PH.timer=null;}if(PH.ringT){clearTimeout(PH.ringT);PH.ringT=null;}
  var c=document.querySelector('.ph-holding');if(c)c.classList.remove('ph-holding');PH.st=null;}
function phStart(x,y,target,kind,pid){if(PH.st&&PH.st.kind==='touch'&&kind==='pointer')return; // touch already tracking this press
  phCancelHold();var card=phFrontCard(target);if(!card)return;
  if(x<24)return; // left edge belongs to swipe-back
  PH.st={sy:window.scrollY,x:x,y:y,id:card.getAttribute('data-id'),card:card,stage:card.closest('.whl-stage'),kind:kind,pid:pid};
  PH.ringT=setTimeout(function(){if(PH.st)PH.st.card.classList.add('ph-holding');},150);
  PH.timer=setTimeout(phFire,500);}
function phMoved(x,y){if(!PH.st)return;var dx=x-PH.st.x,dy=y-PH.st.y;if(dx*dx+dy*dy>100)phCancelHold();}
document.addEventListener('touchstart',function(e){if(!e.touches||e.touches.length!==1){phCancelHold();return;}var t=e.touches[0];phStart(t.clientX,t.clientY,e.target,'touch',null);},{passive:true,capture:true});
document.addEventListener('touchmove',function(e){if(PH.st&&PH.st.kind==='touch'){if(e.touches.length!==1){phCancelHold();return;}phMoved(e.touches[0].clientX,e.touches[0].clientY);}},{passive:true,capture:true});
document.addEventListener('touchend',function(e){if(PH.st&&PH.st.kind==='touch')phCancelHold();},{passive:true,capture:true});
document.addEventListener('touchcancel',function(e){if(PH.st&&PH.st.kind==='touch')phCancelHold();},{passive:true,capture:true});
document.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')return;if(e.button&&e.button!==0)return;if(e.isPrimary===false)return;phStart(e.clientX,e.clientY,e.target,'pointer',e.pointerId);},true);
// Chrome/iOS hold back touchmove inside the touch slop, so pointermove also counts for touch holds
document.addEventListener('pointermove',function(e){if(!PH.st||e.isPrimary===false)return;if(PH.st.kind==='pointer'?e.pointerId===PH.st.pid:e.pointerType==='touch')phMoved(e.clientX,e.clientY);},true);
['pointerup','pointercancel'].forEach(function(t){document.addEventListener(t,function(e){if(e._ph25)return;if(PH.st&&PH.st.kind==='pointer'&&e.pointerId===PH.st.pid)phCancelHold();},true);});
document.addEventListener('contextmenu',function(e){if(e.target.closest&&e.target.closest('.whl-card')){e.preventDefault();}},true);
document.addEventListener('selectstart',function(e){if(e.target.closest&&e.target.closest('.whl-stage'))e.preventDefault();},true);
document.addEventListener('dragstart',function(e){if(e.target.closest&&e.target.closest('.whl-stage'))e.preventDefault();},true);
// after a hold the finger lifts over the new sheet: swallow that click (and the mouseup click) so it cannot close the sheet or open the car
document.addEventListener('click',function(e){if(PH.suppress&&Date.now()-PH.suppress<900){e.preventDefault();e.stopPropagation();PH.suppress=0;}},true);
document.addEventListener('keydown',function(e){if((e.key==='ContextMenu')||(e.shiftKey&&e.key==='F10')){var st=e.target.closest&&e.target.closest('.whl-stage');var c=st&&st.querySelector('.whl-card.front');if(c){e.preventDefault();phSheet(c.getAttribute('data-id'));}}});
window.addEventListener('scroll',function(){if(PH.st&&Math.abs(window.scrollY-PH.st.sy)>10)phCancelHold();},{passive:true,capture:true});
function phFire(){var st=PH.st;PH.timer=null;if(!st)return;st.card.classList.remove('ph-holding');PH.st=null;
  if(!document.contains(st.card))return;
  phVibe();PH.suppress=Date.now();
  try{var ev=new PointerEvent('pointercancel',{bubbles:true,pointerId:st.pid==null?1:st.pid});ev._ph25=1;st.stage.dispatchEvent(ev);}catch(e){}
  phSheet(st.id);}
var _wheelMount25=wheelMount;
wheelMount=function(id,list){var r=_wheelMount25.apply(this,arguments);try{var host=document.getElementById(id);
  if(host&&!host.querySelector('.ph-hint')&&(list||[]).length){var h=document.createElement('div');h.className='ph-hint';h.textContent='Hold a car for options';host.appendChild(h);}}catch(e){}return r;};
/* --- action sheet (ph-02) --- */
function phHead(v){return '<div class="ph-head"><div class="ph-th">'+phThumb(v)+'</div><div><div class="ph-nm">'+phE(vFull(v))+'</div><div class="ph-pf">'+phE(phPfName(v))+'</div></div></div>';}
function phSheet(id){var v=phFind(id);if(!v)return;var h='<div class="ph-sheet" role="dialog" aria-modal="true">'+phHead(v);
  if(phCanMove(v))h+='<button class="ph-row" onclick="phMoveOpen(\''+v.id+'\')"><span class="ph-ic">\u2194</span><span><b>Move to another spot</b><small>Change the order of your cars</small></span></button>';
  if(phCanMove(v)&&mgOthers(v).length)h+='<button class="ph-row" onclick="mgOpen(\''+v.id+'\')"><span class="ph-ic">\u29c9</span><span><b>Merge with\u2026</b><small>Two entries for the same car? Combine them</small></span></button>';
  if(phCanRemove(v))h+='<button class="ph-row" onclick="phRemove(\''+v.id+'\')"><span class="ph-ic">\u2715</span><span><b>Remove from portfolio</b><small>Archive or delete this car</small></span></button>';
  if(!phCanMove(v)&&!phCanRemove(v))h+='<p class="ph-rtxt">'+(isArchivedVehicle(v)?'This car is archived. Bring it back from Archived cars to move or merge it.':'You can view this car, but only its owner or the admin can move, merge or remove it.')+'</p>';
  h+='<button class="ph-cancel" onclick="phClose()">'+(phCanMove(v)||phCanRemove(v)?'Cancel':'OK')+'</button></div>';phOpenLayer(h,'Options for '+vFull(v));}
/* --- move mode (ph-03) --- */
function phPortfolioCars(v){var key=phPfKey(v);return phSorted(activeVehicles(getVehicles()).filter(function(x){return phPfKey(x)===key&&!isArchivedVehicle(x);}));}
function phMoveOpen(id){var v=phFind(id);if(!v)return;PH.move={pf:v.portfolioId||null,owner:v.clientId,key:phPfKey(v),name:phPfName(v),ids:phPortfolioCars(v).map(function(x){return x.id;}),focus:id};phMoveRender();}
function phMoveRender(){var M=PH.move;if(!M)return;var n=M.ids.length;
  var h='<div class="ph-move" role="dialog" aria-modal="true"><div class="ph-mtop"><b>Move cars</b><button class="ph-done" onclick="phMoveDone()">Done</button></div>'+
   '<p class="ph-mtxt">Drag a car to a new spot, or use the arrows. Everyone who views this collection sees the new order.</p><div class="ph-grid" id="ph-grid">'+
   M.ids.map(function(id,i){var v=phFind(id)||{};return '<div class="ph-tile'+(id===M.focus?' sel':'')+'" data-id="'+id+'"><span class="ph-num">'+(i+1)+'</span><div class="ph-tth">'+phThumb(v)+'</div><b>'+phE(vFull(v))+'</b>'+
     '<div class="ph-ar"><button aria-label="Move '+phE(vFull(v))+' earlier" '+(i===0?'disabled':'')+' onclick="phStep(\''+id+'\',-1)">\u2039</button><button aria-label="Move '+phE(vFull(v))+' later" '+(i===n-1?'disabled':'')+' onclick="phStep(\''+id+'\',1)">\u203a</button></div></div>';}).join('')+
   '</div><div class="ph-mfoot">Order saves for '+phE(M.name)+' when you tap Done</div><div class="ph-live" aria-live="polite" id="ph-live"></div></div>';
  phOpenLayer(h,'Move cars');phDragWire();}
function phAnnounce(t){var l=document.getElementById('ph-live');if(l)l.textContent=t;}
function phStep(id,d){var M=PH.move,i=M.ids.indexOf(id),j=i+d;if(i<0||j<0||j>=M.ids.length)return;M.ids.splice(i,1);M.ids.splice(j,0,id);M.focus=id;phMoveRender();
  var b=document.querySelector('.ph-tile[data-id="'+id+'"] .ph-ar button:'+(d<0?'first-child':'last-child'));if(b&&!b.disabled)b.focus();else{b=document.querySelector('.ph-tile[data-id="'+id+'"] .ph-ar button:not([disabled])');if(b)b.focus();}
  phAnnounce(vFull(phFind(id))+' is now number '+(j+1)+' of '+M.ids.length);}
function phDragWire(){var g=document.getElementById('ph-grid');if(!g)return;var D=null;
  g.addEventListener('pointerdown',function(e){var t=e.target.closest('.ph-tile');if(!t||e.target.closest('button'))return;
    D={t:t,id:t.getAttribute('data-id'),x:e.clientX,y:e.clientY,on:false,pid:e.pointerId};
    var start=function(){if(!D)return;D.on=true;t.classList.add('drag');try{g.setPointerCapture(D.pid);}catch(x){}};
    if(e.pointerType==='mouse')start();else D.tm=setTimeout(start,250);});
  g.addEventListener('pointermove',function(e){if(!D)return;if(!D.on){if(Math.abs(e.clientX-D.x)+Math.abs(e.clientY-D.y)>10){clearTimeout(D.tm);D=null;}return;}
    e.preventDefault();D.t.style.transform='translate('+(e.clientX-D.x)+'px,'+(e.clientY-D.y)+'px)';
    var over=null;Array.prototype.forEach.call(g.querySelectorAll('.ph-tile'),function(o){o.classList.remove('over');if(o===D.t)return;var r=o.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)over=o;});
    if(over){over.classList.add('over');D.over=over.getAttribute('data-id');}else D.over=null;});
  var end=function(){if(!D)return;clearTimeout(D.tm);var d=D;D=null;if(!d.on)return;d.t.style.transform='';
    if(d.over){var M=PH.move,i=M.ids.indexOf(d.id),j=M.ids.indexOf(d.over);M.ids.splice(i,1);M.ids.splice(j,0,d.id);M.focus=d.id;phMoveRender();phAnnounce(vFull(phFind(d.id))+' is now number '+(j+1)+' of '+M.ids.length);}
    else d.t.classList.remove('drag');};
  g.addEventListener('pointerup',end);g.addEventListener('pointercancel',end);}
async function phMoveDone(){var M=PH.move;if(!M)return;PH.move=null;var ids=M.ids.slice(),saved=false,err=null;
  try{var r=await sb.rpc('save_vehicle_order',{p_portfolio:M.pf,p_ids:ids});if(r.error)err=r.error;else saved=true;}catch(e){err=e;}
  if(!saved&&err&&err.code!=='PGRST202'&&err.code!=='42883'){phClose();showToast(err.code==='42501'?'You cannot change the order of this collection.':'Could not save the order. Try again.');return;}
  ids.forEach(function(id,i){var v=phFind(id);if(v){v.sortOrder=saved?i+1:null;if(SNAP.vehicles&&SNAP.vehicles[id])SNAP.vehicles[id].sortOrder=v.sortOrder;}});
  if(!saved){var lo=phLocalOrder();lo[M.key]=ids;try{localStorage.setItem('evo.order25',JSON.stringify(lo));}catch(e){}}
  phClose();try{audit('vehicle.reordered','Changed the order of '+ids.length+' cars in '+M.name);}catch(e){}
  showToast(saved?'Order saved for '+M.name:'Order saved on this device');refreshCurrent();}
/* --- remove (ph-04) + toast (ph-05) --- */
function phRemove(id){var v=phFind(id);if(!v)return;var del=phCanDelete(v),arc=canEditVehicle(v);
  var h='<div class="ph-sheet" role="dialog" aria-modal="true"><div class="ph-rt">Remove '+phE(vFull(v))+'?</div>'+
   '<p class="ph-rtxt">Archive keeps its history, photos and documents. You can bring it back any time from Archived cars.</p>'+
   (arc?'<button class="ph-btn gold" onclick="phArchive(\''+id+'\')">Archive</button>':'')+
   (del?'<button class="ph-btn red" onclick="phDelete(\''+id+'\')">Delete permanently</button>':'')+
   '<p class="ph-note">Archive keeps completed jobs with the car. Delete permanently is refused when a completed job is on file. It is only for a car with no completed work, and it frees that VIN.</p>'+
   '<button class="ph-cancel" onclick="phClose()">Cancel</button></div>';phOpenLayer(h,'Remove '+vFull(v));}
function phToast(text,undo){var t=document.getElementById('ph-toast');if(!t){t=document.createElement('div');t.id='ph-toast';t.setAttribute('role','status');document.body.appendChild(t);}
  t.innerHTML='<span>'+phE(text)+'</span>'+(undo?'<button onclick="phUndo()">Undo</button>':'');t.className='on';PH.undo=undo||null;clearTimeout(PH.toastT);
  PH.toastT=setTimeout(function(){t.className='';var u=PH.undo;PH.undo=null;if(u&&u.expire)u.expire();},10000);}
function phUndo(){var u=PH.undo;PH.undo=null;clearTimeout(PH.toastT);var t=document.getElementById('ph-toast');if(t)t.className='';if(u&&u.undo)u.undo();}
function phArchive(id){var v=phFind(id);if(!v)return;phClose();var before={a:v.archived,at:v.archivedAt,r:v.archiveReason};
  v.archived=true;v.archivedAt=new Date().toISOString();v.archiveReason='archived';setVehicles(getVehicles());try{audit('vehicle.archived','Archived '+vFull(v),v.id);}catch(e){}refreshCurrent();
  phToast(vFull(v)+' archived',{undo:function(){var w=phFind(id);if(!w)return;w.archived=before.a||false;w.archivedAt=before.at||null;w.archiveReason=before.r||null;setVehicles(getVehicles());try{audit('vehicle.unarchived','Undo archive of '+vFull(w),w.id);}catch(e){}refreshCurrent();}});}
var _activeVehicles25=activeVehicles;
activeVehicles=function(list){var r=_activeVehicles25.apply(this,arguments);return Array.isArray(r)?r.filter(function(v){return !(v&&PH.pend[v.id]);}):r;};
function phDelete(id){var v=phFind(id);if(!v)return;phClose();PH.pend[id]=1;refreshCurrent();var name=vFull(v);
  phToast(name+' deleted',{undo:function(){delete PH.pend[id];refreshCurrent();showToast(name+' kept');},
    expire:async function(){var ok=false;try{var r=await sb.rpc('delete_vehicle_permanently',{p_id:id});
      if(!r.error)ok=true;else if(r.error.code==='PGRST202'||r.error.code==='42883'){setVehicles(getVehicles().filter(function(x){return x.id!==id;}));ok=true;}
      else{delete PH.pend[id];refreshCurrent();showToast(/Archive/.test(String(r.error&&r.error.message||''))?r.error.message:(r.error.code==='42501'?'You can only delete cars you added. '+name+' was not deleted.':'Could not delete '+name+'. It is still here.'));return;}}
      catch(e){delete PH.pend[id];refreshCurrent();showToast('Could not delete '+name+'. It is still here.');return;}
      if(ok){try{audit('vehicle.deleted','Deleted '+name,id);}catch(e){}delete PH.pend[id];try{await reloadAll(true);}catch(e){}refreshCurrent();}}});}
window.addEventListener('pagehide',function(){var u=PH.undo;if(u&&u.expire){PH.undo=null;u.expire();}});

/* ===== Merge duplicates (mg-01..03) ===== */
var MG_F=[['year','Year'],['make','Make'],['model','Model'],['color','Colour'],['nickname','Nickname'],['vin','VIN / chassis'],['plate','Plate'],['plateRegion','Plate region'],['mileage','Mileage'],['purchasePrice','Purchase price'],['purchaseDate','Purchase date']];
var MG_COL={year:'year',make:'make',model:'model',color:'color',nickname:'nickname',vin:'vin',plate:'plate',plateRegion:'plate_region',mileage:'mileage',purchasePrice:'fin_purchase_price',purchaseDate:'fin_purchase_date'};
function mgBlank(x){return x==null||x===''||x===0;}
function mgFmt(k,x){if(mgBlank(x))return '\u2014';if(k==='mileage')return Number(x).toLocaleString('en-US')+' mi';if(k==='purchasePrice')return '$'+Number(x).toLocaleString('en-US');return String(x);}
function mgSame(k,a,b){if(k==='vin')return imVinClean(a)===imVinClean(b);return imNorm(a)===imNorm(b);}
function mgScore(a,b){if(a.id===b.id||a.clientId!==b.clientId||imMakeKey(a.make)!==imMakeKey(b.make))return -1;var va=imVinClean(a.vin),vb=imVinClean(b.vin);if(va&&vb&&va!==vb)return -1;
  if(va&&vb&&va===vb)return 100;var dy=(Number(a.year)&&Number(b.year))?Math.abs(a.year-b.year):99,F=imFam25(a.make,a.model),G=imFam25(b.make,b.model),sim=imModelSim(a.model,b.model);
  if(F&&G&&F.id===G.id){var gap=(imYearDoubt25(F,a.model,a.year)||imYearDoubt25(G,b.model,b.year))?15:3;if(dy<=gap)return 60-dy;}
  if(sim>=0.5&&dy<=3)return 70-dy+sim*10;return 0;}
function mgOthers(v){return activeVehicles(getVehicles()).filter(function(x){return x.id!==v.id&&x.clientId===v.clientId&&!isArchivedVehicle(x)&&!x.mergedInto;});}
function mgPairs(owner,prefer){var l=activeVehicles(getVehicles()).filter(function(x){return x.clientId===owner&&!isArchivedVehicle(x);}),out=[];
  for(var i=0;i<l.length;i++)for(var j=i+1;j<l.length;j++){var s=mgScore(l[i],l[j]);if(s>0){if(prefer&&(prefer[l[i].id]||prefer[l[j].id]))s+=5;out.push({a:l[i],b:l[j],s:s});}}
  out.sort(function(x,y){return y.s-x.s;});return out.slice(0,8);}
function mgOpen(id,prefer){var v=id?phFind(id):null;PH.mg={a:id||null,b:null,keep:null,pick:{},prefer:prefer||null,owner:v?v.clientId:(typeof IM!=='undefined'&&IM.owner)||ownerClientId()};mgStep1();}
function mgStep1(){var G=PH.mg,h='<div class="ph-move mg" role="dialog" aria-modal="true"><div class="ph-mtop"><b>Merge duplicates</b><button class="ph-done line" onclick="phClose()">Close</button></div>';
  if(G.a){var a=phFind(G.a),others=mgOthers(a).map(function(x){return {v:x,s:mgScore(a,x)};}).filter(function(o){return o.s>=0;});others.sort(function(x,y){return y.s-x.s;});
    h+='<p class="ph-mtxt">Which car is the same as <b>'+phE(vFull(a))+'</b>?</p>'+others.map(function(o){return '<button class="mg-car'+(G.b===o.v.id?' on':'')+'" onclick="mgPickB(\''+o.v.id+'\')"><span class="ph-th">'+phThumb(o.v)+'</span><span><b>'+phE(vFull(o.v))+'</b><small>'+phE((o.v.vin?o.v.vin+' \u00b7 ':'')+phPfName(o.v))+(o.s>0?' \u00b7 Looks like the same car':'')+'</small></span></button>';}).join('');
    if(!others.length)h+='<p class="ph-mtxt">No other car in this collection can be merged with it. Cars with two different VINs are always different cars.</p>';}
  else{var ps=mgPairs(G.owner,G.prefer);h+='<p class="ph-mtxt">These look like the same car entered twice. Pick a pair to merge.</p>'+(ps.length?ps.map(function(p){return '<button class="mg-car" onclick="mgPickPair(\''+p.a.id+'\',\''+p.b.id+'\')"><span><b>'+phE(vFull(p.a))+'</b><small>and '+phE(vFull(p.b))+'</small></span></button>';}).join(''):'<p class="ph-mtxt">No likely duplicates found. You can also hold a car on the home screen and choose Merge with\u2026</p>');}
  if(G.a&&G.b){var A=phFind(G.a),B=phFind(G.b);h+='<p class="ph-mtxt"><b>Which one do you keep?</b> The other is archived after its photos, documents and records move over.</p><div class="mg-keep">'+[A,B].map(function(x){return '<button class="mg-k'+(G.keep===x.id?' on':'')+'" onclick="mgKeep(\''+x.id+'\')">'+(G.keep===x.id?'\u2713 ':'')+'Keep '+phE(vFull(x))+'<small>'+phE(x.vin?'VIN / chassis '+x.vin:'No VIN')+(x.color?' \u00b7 '+x.color:'')+'</small></button>';}).join('')+'</div>'+
    '<button class="ph-btn gold" '+(G.keep?'':'disabled')+' onclick="mgStep2()">Next: check details</button>';}
  h+='</div>';phOpenLayer(h,'Merge duplicates');}
function mgPickB(id){PH.mg.b=id;PH.mg.keep=null;mgStep1();}
function mgPickPair(a,b){PH.mg.a=a;PH.mg.b=b;PH.mg.keep=null;mgStep1();}
function mgKeep(id){PH.mg.keep=id;mgStep1();}
function mgCounts(v){var c={ins:0,ex:0,dc:0,rc:0,lg:0};try{c=recCountsFor(v.id)||c;}catch(e){}var ph=(v._photos||[]).length,n={photos:ph,docs:c.dc||0,reminders:c.rc||0,expenses:c.ex||0,service:c.lg||0};n.total=ph+(c.dc||0)+(c.rc||0)+(c.ex||0)+(c.lg||0);return n;}
function mgPair(){var G=PH.mg,k=phFind(G.keep),d=phFind(G.keep===G.a?G.b:G.a);return {k:k,d:d};}
var MG_T=[['vehicle_photos','photo'],['documents','document'],['reminders','reminder'],['expenses','expense'],['service_records','service record']];
async function mgLoadCounts(id){var out={};await Promise.all(MG_T.map(async function(t){try{var r=await sb.from(t[0]).select('id').eq('vehicle_id',id);out[t[0]]=r.error?null:(r.data||[]).length;}catch(e){out[t[0]]=null;}}));return out;}
function mgStep2(){var G=PH.mg,P=mgPair(),k=P.k,d=P.d,rows='',nc=0;
  if(!G.cnt||G.cnt.id!==d.id){G.cnt={id:d.id,n:null};mgLoadCounts(d.id).then(function(n){if(PH.mg===G&&G.cnt.id===d.id){G.cnt.n=n;if(document.querySelector('.mg-mv'))mgStep2();}});}
  MG_F.forEach(function(f){var key=f[0],kv=k[key],dv=d[key];if(mgBlank(kv)&&mgBlank(dv))return;
    if(mgBlank(dv)||mgSame(key,kv,dv)){rows+='<div class="mg-f"><span>'+f[1]+'</span><b>'+phE(mgFmt(key,kv))+'</b><i>Kept</i></div>';return;}
    if(mgBlank(kv)){if(G.pick[key]===undefined)G.pick[key]='d';rows+='<div class="mg-f fill"><span>'+f[1]+'</span><b>'+phE(mgFmt(key,dv))+'</b><i>Filled in from the other car</i></div>';return;}
    nc++;var p=G.pick[key]||'k';rows+='<div class="mg-f conf"><span>'+f[1]+' \u00b7 pick one</span><div class="mg-ch">'+
      '<button class="'+(p==='k'?'on':'')+'" onclick="mgChoose(\''+key+'\',\'k\')">'+(p==='k'?'\u2713 ':'')+phE(mgFmt(key,kv))+'</button>'+
      '<button class="'+(p==='d'?'on':'')+'" onclick="mgChoose(\''+key+'\',\'d\')">'+(p==='d'?'\u2713 ':'')+phE(mgFmt(key,dv))+'</button></div></div>';});
  var cn=G.cnt.n,mv=cn?MG_T.map(function(t){var n=cn[t[0]];return n==null?null:n+' '+t[1]+(n===1?'':'s');}).filter(Boolean):['Counting\u2026'];
  var h='<div class="ph-move mg" role="dialog" aria-modal="true"><div class="ph-mtop"><b>Check details</b><button class="ph-done line" onclick="mgStep1()">Back</button></div>'+
   '<p class="ph-mtxt">Keeping <b>'+phE(vFull(k))+'</b>. Blanks are filled from <b>'+phE(vFull(d))+'</b>'+(nc?'. Pick the right value where they differ.':'.')+'</p>'+rows+
   '<div class="mg-mv"><b>Moves to the car you keep</b><span>'+mv.join(' \u00b7 ')+', plus estimates and money records</span></div>'+
   '<p class="ph-rtxt">'+phE(vFull(d))+' is then archived and marked as merged. You can undo the merge.</p>'+
   '<button class="ph-btn gold" onclick="mgDo()">Merge cars</button><button class="ph-cancel" onclick="phClose()">Cancel</button></div>';
  phOpenLayer(h,'Check details');}
function mgChoose(k,v){PH.mg.pick[k]=v;mgStep2();}
async function mgDo(){var G=PH.mg,P=mgPair(),k=P.k,d=P.d,f={};
  MG_F.forEach(function(x){var key=x[0];if(G.pick[key]==='d'&&!mgBlank(d[key])){var v=d[key];if(key==='vin')v=imVinClean(v)||v;f[MG_COL[key]]=v;}});
  var r;try{r=await sb.rpc('merge_vehicles',{p_keep:k.id,p_drop:d.id,p_fields:f});}catch(e){r={error:e};}
  if(r.error){var c=r.error.code;showToast(c==='PGRST202'||c==='42883'?'Merging needs database update 017. Nothing was changed.':c==='42501'?'You cannot merge cars in this collection.':'Could not merge: '+(r.error.message||'try again'));return;}
  var res=r.data||{},kn=vFull(k),dn=vFull(d);try{audit('vehicle.merged','Merged '+dn+' into '+kn,k.id);}catch(e){}
  try{await reloadAll(true);}catch(e){}refreshCurrent();
  var m=res.moved||{},tot=0;for(var t in m)if(m.hasOwnProperty(t))tot+=Number(m[t])||0;
  phOpenLayer('<div class="ph-sheet" role="dialog" aria-modal="true"><div class="ph-rt">Cars merged</div><p class="ph-rtxt"><b>'+phE(kn)+'</b> now has everything from '+phE(dn)+' ('+tot+' item'+(tot===1?'':'s')+' moved). '+phE(dn)+' is archived.</p>'+
   '<button class="ph-btn gold" onclick="phClose()">Done</button><button class="ph-btn line" onclick="mgUndo(\''+phE(res.merge_id||'')+'\')">Undo merge</button></div>','Cars merged');
  PH.lastMerge=res.merge_id;}
async function mgUndo(id){var r;try{r=await sb.rpc('undo_merge',{p_merge:id});}catch(e){r={error:e};}
  if(r.error){showToast('Could not undo the merge: '+(r.error.message||'try again'));return;}
  phClose();try{audit('vehicle.merge_undone','Undid a merge',id);}catch(e){}try{await reloadAll(true);}catch(e){}refreshCurrent();showToast('Merge undone. Both cars are back.');}
/* ===== import: cars of yours not on the sheet ===== */
function imUnmatched25(A){if(!A||typeof IM==='undefined'||!IM.owner)return [];var got={};for(var k in A.matched)if(A.matched.hasOwnProperty(k))got[A.matched[k]]=1;
  return imCollection(IM.owner).filter(function(v){return !got[v.id];});}
function imUnmLine25(l){if(!l||!l.length)return '';var names=l.slice(0,3).map(imVName).join(', ')+(l.length>3?' and '+(l.length-3)+' more':'');
  return '<div class="im-card mg-unm"><b>'+l.length+' of your car'+(l.length===1?' is':'s are')+' not on this sheet</b><span>'+imE(names)+'. If one of them is a sheet car under another name, merge them after importing.</span><button class="im-btn sm line" onclick="mgFromImport()">Merge duplicates</button></div>';}
function mgFromImport(){var p={};(IM._unm25||[]).forEach(function(v){p[v.id]=1;});mgOpen(null,p);}
var _phStep3=imStep3;imStep3=function(){var h=_phStep3();try{IM._unm25=imUnmatched25(imA());var l=imUnmLine25(IM._unm25);if(l)h=h.replace('<div class="im-tabs"',l+'<div class="im-tabs"');}catch(e){}return h;};
var _phStep4=imStep4;imStep4=function(){var h=_phStep4();try{var d=IM.done;if(d&&!d.undone&&IM._unm25){var l=imUnmLine25(IM._unm25.filter(function(v){var w=phFind(v.id);return w&&!isArchivedVehicle(w);}));var i=h.indexOf('</p>');if(l&&i>=0)h=h.slice(0,i+4)+l+h.slice(i+4);}}catch(e){}return h;};
// ===== v25b: automatic first values (queued, with progress), "Refresh values now", review flags, honest trends =====
// Server (estimate-value): reason "first" = only when the car has no value (not counted against the user's 5/day);
// mode "collection_start" + reason "collection" = once per day per collection, skips cars valued in the last 7 days;
// a monthly live-call cap keeps Gemini under the $10/month budget.
var VQ={q:[],total:0,done:0,fail:0,run:false,reason:{},msg:'',stopped:''};
VALUE.reason=VALUE.reason||{};
function vqKey(){return 'evoai_valfirst';}
function vqTried(){try{return JSON.parse(localStorage.getItem(vqKey())||'{}')||{};}catch(e){return {};}}
function vqMark(id){try{var m=vqTried();m[id]=Date.now();localStorage.setItem(vqKey(),JSON.stringify(m));}catch(e){}}
function vqHasValue(v){return !!(v&&v.aiValue&&Number(v.aiValue.value)>0);}
function vqComplete(v){return !!(v&&Number(v.year)>=1886&&v.make&&v.model);}
function vqMissing(v){var m=[];if(!(Number(v.year)>=1886))m.push('year');if(!v.make)m.push('make');if(!v.model)m.push('model');return m;}
function vqOk(v){return !!(v&&!isArchivedVehicle(v)&&session&&can(v,'view_value_estimate')&&VALUE.state!=='off'&&vqComplete(v)&&typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function');}
function vqAdd(ids,reason){
  var n=0;
  (ids||[]).forEach(function(id){
    if(VQ.q.some(function(x){return x.id===id;})||VALUE.busy[id])return;
    var v=byId(getVehicles(),id);if(!vqOk(v))return;
    if(reason==='first'&&vqHasValue(v))return;
    VQ.q.push({id:id,reason:reason});n++;
  });
  if(n){if(!VQ.run){VQ.total=0;VQ.done=0;VQ.fail=0;VQ.msg='';VQ.stopped='';}VQ.total+=n;vqBar();setTimeout(vqPump,300);}
  return n;
}
function vqPump(){
  if(VQ.run)return;VQ.run=true;
  (function next(){
    if(!VQ.q.length||VQ.stopped){VQ.q=[];VQ.run=false;vqBar(true);return;}
    var it=VQ.q.shift(),vid=it.id;
    VALUE.reason[vid]=it.reason;if(it.reason==='first')vqMark(vid);
    vqBar();
    try{refreshValue(vid);}catch(e){}
    var t0=Date.now();
    (function wait(){
      if(VALUE.busy[vid]&&Date.now()-t0<155000){setTimeout(wait,250);return;}
      delete VALUE.reason[vid];
      var n=VALUE.note[vid];VQ.done++;
      if(n&&n.kind==='limit'){VQ.stopped=n.text;}
      else if(n&&n.kind!=='done'){VQ.fail++;}
      try{rbNoteWhy(vid,n||{kind:'done'});}catch(e){}
      if(n&&n.kind!=='done'&&it.reason!=='user')delete VALUE.note[vid];
      vqBar();setTimeout(next,150);
    })();
  })();
}
function vqBar(finished){
  var t;
  if(VQ.run||VQ.q.length)t='Valuing '+Math.min(VQ.total,VQ.done+1)+' of '+VQ.total+'\u2026';
  else if(VQ.stopped)t=VQ.stopped;
  else if(finished&&VQ.total)t='Values updated for '+(VQ.done-VQ.fail)+' of '+VQ.total+(VQ.fail?' ('+VQ.fail+' could not be valued yet)':'')+'.';
  else t='';
  VQ.msg=t;
  var els=document.querySelectorAll('.vq-status');
  for(var i=0;i<els.length;i++){els[i].textContent=t;els[i].style.display=t?'':'none';}
  var g=document.getElementById('vq-toast');
  if(!g){g=document.createElement('div');g.id='vq-toast';g.setAttribute('role','status');g.setAttribute('aria-live','polite');document.body.appendChild(g);}
  g.textContent=t;g.className=t?'on':'';
  if(finished&&t){clearTimeout(VQ.tm);VQ.tm=setTimeout(function(){if(!VQ.run){g.className='';}},6000);}
}
// cars with no value yet that have not been tried in the last 20 hours: new, imported, or pending from before v25b
function vqSweep(){
  if(!session||window.__VQ_OFF__)return 0;var tr=vqTried(),now=Date.now(),ids=[];
  (getVehicles()||[]).forEach(function(v){if(!vqHasValue(v)&&vqOk(v)&&!(tr[v.id]&&now-tr[v.id]<72e6))ids.push(v.id);});
  return vqAdd(ids,'first');
}
var _vqReload=loadAll;
loadAll=function(){var r=_vqReload.apply(this,arguments);Promise.resolve(r).then(function(){if(!VQ.run)setTimeout(vqSweep,1500);}).catch(function(){});return r;};
// single add (p15 queued a "user" estimate that used up the 5/day): route new cars to the first-value queue
var _vqAuto=valueAutoQueue;
valueAutoQueue=function(vid,delay){var v=byId(getVehicles(),vid);if(v&&!vqHasValue(v)){setTimeout(function(){vqAdd([vid],'first');},delay===undefined?500:delay);return;}return _vqAuto(vid,delay);};
var _vqRT=valueRefreshedToday;
valueRefreshedToday=function(vid){if(VALUE.reason&&(VALUE.reason[vid]==='first'||VALUE.reason[vid]==='collection'))return false;return _vqRT(vid);};
function valBody25(vid){var r=VALUE.reason&&VALUE.reason[vid];return r?{vehicle_id:vid,reason:r}:{vehicle_id:vid};}
var _vqFail=valueFail;
valueFail=function(err,body){
  var st=err&&err.context&&err.context.status,bc=body&&body.error;
  if(st===429&&(bc==='monthly_cap'||bc==='first_limited'||bc==='collection_limited'))return {kind:'limit',text:String(body.message||'Value limit reached.').slice(0,200)};
  if(st===400&&bc==='incomplete_vehicle'&&body.missing&&body.missing.length)return {kind:'fail',text:'Add the '+vqList(body.missing)+' so this car can be valued.'};
  return _vqFail(err,body);
};
function vqList(a){a=a.slice();if(a.length<2)return a.join('');var l=a.pop();return a.join(', ')+' and '+l;}
// ---------- Refresh values now (owner or admin, once per day per collection) ----------
function vqCanRefresh(vs){var v=vs&&vs[0];return !!(v&&session&&(realAdmin()||(typeof isRealOwnerOf==='function'&&isRealOwnerOf(v))));}
function vqRefreshNow(owner){
  var vs=(getVehicles()||[]).filter(function(v){return v.clientId===owner&&!isArchivedVehicle(v);});
  if(!vs.length||VQ.run)return;
  var b=document.querySelectorAll('.vq-btn');for(var i=0;i<b.length;i++)b[i].disabled=true;
  Promise.resolve(sb.functions.invoke('estimate-value',{body:{mode:'collection_start',owner_id:owner}})).then(function(r){
    var err=r&&r.error;
    if(err){return autoIdFail(err).then(function(bd){var m=(bd&&bd.message)||'Could not start the refresh right now.';VQ.msg=m;showToast(m,'error');valueRerender();});}
    try{var u=getUI(),m=u.valCol||{};m[owner]=Date.now();u.valCol=m;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}
    var fresh=0,ids=[];vs.forEach(function(v){var a=v.aiValue,t=a&&a.asOf?new Date(a.asOf).getTime():0;if(vqHasValue(v)&&t&&Date.now()-t<7*864e5)fresh++;else ids.push(v.id);});
    var n=vqAdd(ids,'collection');
    if(!n){VQ.msg='All values are up to date ('+fresh+' valued in the last 7 days).';vqBar(true);showToast(VQ.msg,'success');}
    valueRerender();
  }).catch(function(){showToast('Could not reach the estimate service.','error');valueRerender();});
}
function vqColDoneToday(owner){try{var t=Number((getUI().valCol||{})[owner]);return !!(t&&Date.now()-t<864e5);}catch(e){return false;}}
// ---------- what is missing / what needs review ----------
function vqPanel(vs){
  if(!vs||!vs.length||!session)return '';
  var vis=vs.filter(function(v){return can(v,'view_value_estimate')&&!isArchivedVehicle(v);});if(!vis.length)return '';
  var miss=vis.filter(function(v){return !vqComplete(v);}),rev=vis.filter(function(v){return (v.aiValue&&v.aiValue.review)||v.aiReview||v._swing;});
  var weak=vis.filter(function(v){return vqComplete(v)&&!(Number(v.mileage)>0);});
  var h='<div class="vq" data-noptr>';
  h+='<div class="vq-status" role="status" aria-live="polite"'+(VQ.msg?'':' style="display:none"')+'>'+esc(VQ.msg)+'</div>';
  if(miss.length)h+='<p class="vq-p"><b>Can\'t be valued yet:</b> '+miss.slice(0,6).map(function(v){return esc(vName(v)||'Unnamed car')+' (add the '+esc(vqList(vqMissing(v)))+')';}).join('; ')+(miss.length>6?'; and '+(miss.length-6)+' more':'')+'.</p>';
  if(weak.length)h+='<p class="vq-p">'+weak.length+' '+plural(weak.length,'car is','cars are')+' valued at typical mileage because no mileage is on file. Adding mileage, the VIN and the variant makes estimates more accurate.</p>';
  if(rev.length)h+='<p class="vq-p"><b>Needs review:</b> '+rev.slice(0,6).map(function(v){var r=(v.aiValue&&v.aiValue.review)||(v.aiReview&&v.aiReview.why)||[];return esc(vName(v))+' ('+esc(v._swing?('value jumped '+pct(v._swing.p)+' on '+fmtDate(v._swing.date)+'; not counted in the trend'):r.join(', '))+')';}).join('; ')+'.</p>';
  var o=vis[0].clientId;
  if(vqCanRefresh(vis)){
    var dis=VQ.run||vqColDoneToday(o);
    h+='<button type="button" class="btn vq-btn" '+(dis?'disabled ':'')+'onclick="vqRefreshNow(\''+esc(o)+'\')">'+(vqColDoneToday(o)?'Values refreshed today':'Refresh values now')+'</button>';
    h+='<p class="vq-p vq-note">New and imported cars are valued automatically and every car is refreshed weekly. This button is a backup and works once a day.</p>';
  }
  return h+'</div>';
}
var _vqCB=collectionBrief;
collectionBrief=function(vs){return _vqCB(vs)+vqPanel(vs);};
// ---------- loader: review flags, same-basis history ----------
// e.inputs.review (server sanity checks) keeps a number out of the trend; a change of basis (cache_key, e.g. a car later marked as a replica) restarts the history.
function valFinish25(v){
  if(v.aiValue&&v._lastRv)v.aiValue.review=v._lastRv;
  delete v._lastRv;
  var ai=(v.valueLog||[]).filter(function(p){return p&&p.ai===true;}),K='';
  for(var i=ai.length-1;i>=0;i--)if(!ai[i].review&&ai[i].key){K=ai[i].key;break;}
  v.valueLog=(v.valueLog||[]).filter(function(p){return !(p&&p.ai===true)||(!p.review&&(!K||!p.key||p.key===K));});
}
// a jump of more than 30% between two consecutive AI values is not a market move we can trust: the trend restarts after it and the car is listed under Needs review
var VQ_SWING=0.30;
var _vqVP=valuePoints;
valuePoints=function(v){
  var pts=_vqVP(v);if(!v)return pts;v._swing=null;
  if(!pts||pts.length<2)return pts;
  var cut=0;
  for(var i=1;i<pts.length;i++){var a=Number(pts[i-1].value),b=Number(pts[i].value);if(a>0&&Math.abs(b-a)/a>VQ_SWING){cut=i;v._swing={p:(b-a)/a*100,date:pts[i].date,from:a,to:b};}}
  return cut?pts.slice(cut):pts;
};
// ============ v27 SIMPLE SECURE SIGN-UP (short invite codes, email code / magic link, admin test mode) ============
// Codes: 8 chars from an unambiguous alphabet (no 0 O 1 I L), shown as ABCD-EFGH. Legacy 32-char hex codes still work.
var SU_ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function suNorm(s){
  var raw=String(s||'').replace(/[^A-Za-z0-9]/g,'');
  if(raw.length===8)return raw.toUpperCase();          // new short code
  return raw.toLowerCase();                              // legacy hex code
}
function suIsShort(k){return /^[A-HJ-KMNP-Z2-9]{8}$/.test(k);}
function suValid(k){return suIsShort(k)||(k.length>=16&&k.length<=64&&/^[a-z0-9]+$/.test(k));}
function codeKey(c){return suNorm(c);}
function suLink(k){return APP_LINK+'?invite='+encodeURIComponent(k);}
function readUrlInvite(){
  try{
    var q=new URLSearchParams(window.location.search||''),c=q.get('invite');
    if(c===null)return;
    var k=suNorm(c);
    if(suValid(k))localStorage.setItem(INVITE_KEY,k);
    q.delete('invite');
    var qs=q.toString();
    if(window.history&&history.replaceState)history.replaceState(null,'',window.location.pathname+(qs?'?'+qs:'')+(window.location.hash||''));
  }catch(e){}
}
// ---- link landing: code prefilled, email -> 6-digit code or magic link, no password ----
var SU={email:'',sentAt:0,step:'email'};
function suLandingHTML(k){
  return '<div id="su-landing" class="invite-card" style="margin-bottom:16px;">'
   +'<div class="sh first"><h2>You are invited to EvoAI</h2></div>'
   +'<div class="doc-meta">Your invite code is filled in. Enter your email and we will send you a 6-digit sign-in code. No password needed.</div>'
   +'<div class="input-group" style="margin-top:12px;"><label for="sl-code">Invite code</label><input type="text" id="sl-code" value="'+esc(groupCode(k))+'" autocapitalize="characters" autocomplete="off" maxlength="40"></div>'
   +'<div id="sl-step-email"><div class="input-group"><label for="sl-name">Your name</label><input type="text" id="sl-name" maxlength="80" autocomplete="name"></div>'
   +'<div class="input-group"><label for="sl-email">Email</label><input type="email" id="sl-email" maxlength="120" autocapitalize="none" inputmode="email" autocomplete="email" placeholder="you@email.com"></div>'
   +'<button class="btn btn-primary" style="width:100%;" id="sl-send" type="button" onclick="suSendCode()">Email me a sign-in code</button></div>'
   +'<div id="sl-step-code" style="display:none;"><div class="doc-meta" id="sl-sent-to"></div>'
   +'<div class="input-group" style="margin-top:10px;"><label for="sl-otp">6-digit code</label><input type="text" id="sl-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="123456" style="font-size:22px;letter-spacing:.3em;text-align:center;"></div>'
   +'<button class="btn btn-primary" style="width:100%;" id="sl-verify" type="button" onclick="suVerify()">Verify and join</button>'
   +'<div class="doc-meta" style="margin-top:8px;">Or tap the sign-in link in the same email on this device. <span class="link" onclick="suResend()">Send again</span> / <span class="link" onclick="suBack()">Use another email</span></div></div>'
   +'<div class="doc-meta code-msg" id="sl-msg" role="status" style="margin-top:8px;"></div>'
   +'<div class="doc-meta" style="margin-top:10px;">Already have an account? Sign in below and the code is applied automatically.</div></div>';
}
function applyInviteToAuth(){
  var k=pendingInviteCode();
  if(!k)return;
  try{
    showSignup(true);selectRole('client');setVal('su-code',groupCode(k));
    var pan=document.getElementById('auth-signup-panel');
    if(pan&&!document.getElementById('su-landing')){var d=document.createElement('div');d.innerHTML=suLandingHTML(k);pan.insertBefore(d.firstChild,pan.firstChild);}
    setTimeout(function(){var l=document.getElementById('su-landing');if(l&&l.scrollIntoView)l.scrollIntoView({block:'start'});},60);
    showToast('Invite code added. Enter your email to join.','success');
  }catch(e){}
}
function suSay(t,bad){var m=document.getElementById('sl-msg');if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}
function suOtpMsg(e){
  var m=String((e&&(e.message||e.error_description))||e||'');
  if(/rate limit|too many|over_email_send_rate|429/i.test(m))return 'Too many emails were sent just now. Wait a few minutes and try again, or ask for a new link by text.';
  if(/expired|invalid|token/i.test(m))return 'That code did not work or has expired. Check the 6 digits, or tap Send again.';
  if(/signups not allowed|not allowed/i.test(m))return 'New sign-ups are turned off right now. Ask the person who invited you.';
  return authMsg(e);
}
async function suSendCode(again){
  if(noBackend()){suSay('The cloud connection is not set up in this build.',true);return;}
  var k=suNorm(val('sl-code')),email=again?SU.email:normEmail(val('sl-email')),name=(val('sl-name')||'').trim();
  if(!suValid(k)){suSay('Check the invite code. It has 8 letters and numbers, like ABCD-EFGH.',true);return;}
  if(!validEmail(email)){suSay('Enter a valid email address.',true);return;}
  var wait=60000-(Date.now()-SU.sentAt);
  if(SU.sentAt&&wait>0){suSay('Please wait '+Math.ceil(wait/1000)+' seconds before sending another code.',true);return;}
  try{localStorage.setItem(INVITE_KEY,k);}catch(e){}
  var b=document.getElementById('sl-send');if(b)b.disabled=true;
  suSay('Sending...');
  try{
    var data={pending_invite:k};if(name)data.display_name=name.slice(0,80);
    var r=await sb.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,emailRedirectTo:suLink(k),data:data}});
    if(b)b.disabled=false;
    if(r.error){suSay(suOtpMsg(r.error),true);return;}
    SU.email=email;SU.sentAt=Date.now();SU.step='code';
    showEl('sl-step-email',false);showEl('sl-step-code',true);
    elText('sl-sent-to','We emailed a 6-digit code to '+email+'. It expires in 1 hour.');
    suSay('');var o=document.getElementById('sl-otp');if(o)o.focus();
  }catch(e){if(b)b.disabled=false;suSay(suOtpMsg(e),true);}
}
function suResend(){suSendCode(true);}
function suBack(){SU.step='email';showEl('sl-step-email',true);showEl('sl-step-code',false);suSay('');}
async function suVerify(){
  var t=String(val('sl-otp')||'').replace(/\D/g,'');
  if(t.length!==6){suSay('Enter the 6 digits from the email.',true);return;}
  var b=document.getElementById('sl-verify');if(b)b.disabled=true;
  suSay('Checking...');
  try{
    var r=await sb.auth.verifyOtp({email:SU.email,token:t,type:'email'});
    if(b)b.disabled=false;
    if(r.error){suSay(suOtpMsg(r.error),true);return;}
    var u=r.data&&(r.data.user||(r.data.session&&r.data.session.user));
    SU.justJoined=true;
    if(u)await bootWithUser(u);
  }catch(e){if(b)b.disabled=false;suSay(suOtpMsg(e),true);}
}
function suSuccess(d){
  if(!SU.justJoined)return;SU.justJoined=false;
  var t=inviteDoneText(d)||'Your account is ready.';
  try{sheetOpen({title:'Welcome to EvoAI',html:'<p>'+esc(t)+'</p><p class="doc-meta">Next time just enter your email and we will send a new code. No password to remember.</p>',buttons:[{label:'Get started',cls:'btn-primary',fn:sheetClose}]});}catch(e){}
}
// wrap the existing auto-redeem toast so the joiner also gets a clear success sheet
var _suDone=inviteDoneText;
inviteDoneText=function(d){var t=_suDone(d);if(SU.justJoined&&d)setTimeout(function(){suSuccess(d);},50);return t;};
// ---- redeem while signed in ----
function suAdminBlock(msgId){
  var k=suNorm(val(msgId&&msgId.replace(/-msg$/,'')))||pendingInviteCode(),link=suValid(k)?suLink(k):APP_LINK;
  var t="You're signed in as admin. To test sign-up, open this link in a private tab or on another device.";
  if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t;m.style.color='var(--gold)';}}
  try{sheetOpen({title:'Test sign-up as a new person',html:'<p id="su-admin-msg">'+esc(t)+'</p><div class="invite-code" style="font-size:15px;word-break:break-all;user-select:all;-webkit-user-select:all;">'+esc(link)+'</div><p class="doc-meta">Admin accounts cannot redeem invite codes, and a code cannot be used by the account that made it. Use a different email (for example a +test address) in the private tab.</p>',
    buttons:[{label:'Close',fn:sheetClose},{label:'Copy link',cls:'btn-primary',id:'su-admin-copy',fn:function(){copyText(link,'Link copied');}}]});}catch(e){}
}
async function redeemCodeFrom(inputId,msgId){
  suWrapRpc();
  if(!session)return;
  var say=function(t,bad){if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}};
  say('');
  if(viewAsActive()||realAdmin()){suAdminBlock(msgId);return;}
  var k=suNorm(val(inputId));
  if(!k){say('Paste the invite code first.',true);showToast('Paste the invite code first.','error');return;}
  if(!suValid(k)){say(k.length<8?'That looks too short. Codes have 8 letters and numbers, like ABCD-EFGH.':'That code is not complete. Check it and try again.',true);showToast('Check the invite code.','error');return;}
  say('Checking the code...');
  try{
    var r=await sb.rpc('redeem_invite',{p_code:k});
    if(r.error)throw r.error;
    clearPendingInvite();
    setVal(inputId,'');closeModal('modal-account');
    await loadAll();
    var u=(await sb.auth.getUser()).data.user;
    if(u)setAccountFromProfile(u);
    showToast(inviteDoneText(r.data||{kind:'transfer'}),'success');
    enterApp();
  }catch(e){var t=inviteErrorText(e);say(t,true);showToast(t,'error');}
}
var _suErr=inviteErrorText;
inviteErrorText=function(e){
  var m=String((e&&(e.message||e))||'');
  if(/too_many_attempts|rate_limited/.test(m))return 'Too many tries. Wait an hour and try again, or ask for a new code.';
  if(/invalid_or_expired_invite/.test(m))return 'That code did not work. Check the 8 letters and numbers. A code works once and expires after 7 days, so ask for a new one if needed.';
  return _suErr(e);
};
// ---- invite sheet: short code + link, Share via text / Copy link / Send email ----
function inviteShareText(code,email){
  var k=codeKey(code);
  return 'You are invited to EvoAI. Tap to join: '+suLink(k)+'  (invite code '+groupCode(k)+', expires in 7 days)';
}
function inviteMailto(code,email){
  return 'mailto:'+encodeURIComponent(email||'').replace(/%40/g,'@')+'?subject='+encodeURIComponent('Your EvoAI invite')+'&body='+encodeURIComponent(inviteShareText(code,email)+'\n\nOpen the link, enter your email and type the 6-digit code we send you. No password needed.');
}
function suShareText(){
  if(!lastInviteCode)return;var t=inviteShareText(lastInviteCode,lastInviteEmail);
  if(navigator.share){navigator.share({title:'Your EvoAI invite',text:t}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(t,'Invite message copied');});return;}
  try{window.location.href='sms:?&body='+encodeURIComponent(t);}catch(e){copyText(t,'Invite message copied');}
}
function suCopyLink(){if(lastInviteCode)copyText(suLink(codeKey(lastInviteCode)),'Link copied');}
function showInviteResult(opts){
  lastInviteEmail=opts.email||'';
  if(opts.id)saveInviteCode(opts.id,opts.code);
  lastInviteCode=groupCode(codeKey(opts.code));
  elText('invite-title',opts.title);
  elText('invite-client-name',opts.who||'');
  elText('invite-code-text',lastInviteCode);
  elText('invite-expiry','Expires '+fmtDate(String(opts.expires||'').slice(0,10))+' - works once');
  elText('invite-help',opts.help);
  var ml=document.getElementById('invite-mailto');if(ml)ml.href=inviteMailto(opts.code,lastInviteEmail);
  var mod=document.querySelector('#modal-invite .modal');
  if(mod&&!document.getElementById('su-sheet')){
    var d=document.createElement('div');d.id='su-sheet';
    d.innerHTML='<div class="doc-meta" style="margin-top:6px;">Invite link</div><div id="su-link" style="font-size:13px;word-break:break-all;color:var(--gold);user-select:all;-webkit-user-select:all;"></div>'
     +'<div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px;"><button class="btn btn-primary" type="button" id="su-share" onclick="suShareText()">Share via text</button>'
     +'<button class="btn btn-ghost" type="button" id="su-copy" onclick="suCopyLink()">Copy link</button>'
     +'<a class="btn btn-ghost" id="sx-email" href="#" style="text-align:center;">Send email</a></div>'
     +'<div class="doc-meta" id="sx-email-note" style="margin-top:8px;">Send email opens your own mail app with the link ready, so it always arrives. They join by entering their email and a 6-digit code.</div>';
    var ex=document.getElementById('invite-expiry');ex.parentNode.insertBefore(d,ex.nextSibling);
    var old=mod.querySelector('.flex.gap-2.mt-4');if(old){var bs=old.querySelectorAll('button,a'),i;for(i=0;i<bs.length;i++)if(!/Done/.test(bs[i].textContent))bs[i].style.display='none';}
    var dis=mod.querySelectorAll('.disclaimer');for(i=0;i<dis.length;i++)if(/not emailed automatically/.test(dis[i].textContent))dis[i].style.display='none';
  }
  elText('su-link',suLink(codeKey(opts.code)));
  var se=document.getElementById('sx-email');if(se)se.href=inviteMailto(opts.code,lastInviteEmail);
  openModal('modal-invite');
}
// migration_019 returns redeem failures as {error:"..."} (so the rate-limit attempt row is kept). Map that back to a normal error.
function suWrapRpc(){
  try{if(typeof sb==='undefined'||!sb||sb.__suRpc||typeof sb.rpc!=='function')return;
    var o=sb.rpc.bind(sb);sb.__suRpc=1;
    sb.rpc=function(n,a,x){var p=o(n,a,x);if(n!=='redeem_invite')return p;
      return Promise.resolve(p).then(function(r){if(r&&!r.error&&r.data&&typeof r.data==='object'&&r.data.error&&!r.data.kind)return {data:null,error:{code:'P0001',message:String(r.data.error)}};return r;});};
  }catch(e){}
}
window.addEventListener('load',suWrapRpc);
// ============ v27 FORM SAFETY: no pull-to-refresh, autosaved drafts, unsaved-changes warning ============
(function(){try{var st=document.createElement('style');st.id='fs-css';
  st.textContent='html,body{overscroll-behavior-y:none;overscroll-behavior-x:none}.modal-overlay,.modal,.main-content,.page,#app-shell,.sheet-ov{overscroll-behavior-y:contain}'
   +'.fs-banner{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--gold,#c9a85c);border-radius:4px;padding:10px 12px;margin:0 0 12px;font-size:14px;color:var(--text,#eee)}'
   +'.trim-sug{margin-top:6px;font-size:15px;color:#F2F0EB}.trim-chip{display:inline-block;margin:4px 6px 0 0;padding:4px 10px;border:1px solid var(--border,#444);border-radius:14px;background:transparent;color:inherit;font-size:15px}.trim-chip.on{border-color:var(--gold,#c9a85c);color:var(--gold,#c9a85c)}';
  document.head.appendChild(st);}catch(e){}})();
var FS={forms:{'modal-add-vehicle':'saveVehicle','modal-service':'saveService','modal-expense':'saveExpense','modal-add-client':'addClient','modal-note':'saveNote','modal-inspection':'saveInspection'},dirty:{},saving:{},snap:{},key:'evo_draft_'};
function fsSub(mid){return mid==='modal-add-vehicle'?(typeof editingVehicleId!=='undefined'&&editingVehicleId?String(editingVehicleId):'new'):'x';}
function fsFields(mid){var m=document.getElementById(mid);if(!m)return [];return Array.prototype.filter.call(m.querySelectorAll('input[id],select[id],textarea[id]'),function(e){return e.type!=='file'&&e.type!=='password'&&e.type!=='hidden';});}
function fsRead(mid){var o={};fsFields(mid).forEach(function(e){o[e.id]=(e.type==='checkbox'||e.type==='radio')?(e.checked?'1':''):e.value;});return o;}
function fsWrite(mid,o){fsFields(mid).forEach(function(e){if(!(e.id in o))return;if(e.type==='checkbox'||e.type==='radio')e.checked=!!o[e.id];else e.value=o[e.id];});}
function fsGet(mid){try{var d=JSON.parse(localStorage.getItem(FS.key+mid)||'null');if(d&&d.sub===fsSub(mid)&&Date.now()-d.t<7*864e5)return d;}catch(e){}return null;}
function fsClear(mid){FS.dirty[mid]=false;try{localStorage.removeItem(FS.key+mid);}catch(e){}var b=document.getElementById('fs-banner-'+mid);if(b)b.remove();}
function fsSave(mid){var cur=fsRead(mid),sn=FS.snap[mid]||{},diff=Object.keys(cur).some(function(k){return cur[k]!==(sn[k]===undefined?'':sn[k]);});
  FS.dirty[mid]=diff;try{if(diff)localStorage.setItem(FS.key+mid,JSON.stringify({sub:fsSub(mid),t:Date.now(),f:cur}));else localStorage.removeItem(FS.key+mid);}catch(e){}}
function fsDiscard(mid){fsWrite(mid,FS.snap[mid]||{});fsClear(mid);try{if(mid==='modal-add-vehicle'&&typeof vinChanged==='function')vinChanged();}catch(e){}showToast('Unsaved details discarded','success');}
function fsOpened(mid){
  var m=document.getElementById(mid);if(!m)return;
  var old=document.getElementById('fs-banner-'+mid);if(old)old.remove();
  FS.snap[mid]=fsRead(mid);FS.dirty[mid]=false;
  if(!m._fsBound){m._fsBound=1;var h=function(e){if(e.target&&e.target.id&&e.target.type!=='file')fsSave(mid);};m.addEventListener('input',h,true);m.addEventListener('change',h,true);}
  var d=fsGet(mid);if(!d)return;
  fsWrite(mid,d.f);FS.dirty[mid]=true;
  var b=document.createElement('div');b.className='fs-banner';b.id='fs-banner-'+mid;b.setAttribute('role','status');
  b.innerHTML='<span>Restored your unsaved details.</span><button type="button" class="btn btn-ghost btn-sm" onclick="fsDiscard(\''+mid+'\')">Discard</button>';
  var hd=m.querySelector('.modal-header');if(hd&&hd.parentNode)hd.parentNode.insertBefore(b,hd.nextSibling);
}
var _fsOpen=openModal,_fsClose=closeModal;
openModal=function(id){_fsOpen(id);if(FS.forms[id])setTimeout(function(){fsOpened(id);},0);};
closeModal=function(id){if(FS.forms[id]){if(FS.saving[id]&&Date.now()-FS.saving[id]<15000)fsClear(id);else FS.dirty[id]=false;FS.saving[id]=0;}_fsClose(id);};
Object.keys(FS.forms).forEach(function(mid){var fn=FS.forms[mid],orig=window[fn];if(typeof orig!=='function')return;
  window[fn]=function(){FS.saving[mid]=Date.now();return orig.apply(this,arguments);};});
function fsAnyDirty(){return Object.keys(FS.dirty).some(function(k){var m=document.getElementById(k);return FS.dirty[k]&&m&&m._open;});}
window.addEventListener('beforeunload',function(e){if(fsAnyDirty()){e.preventDefault();e.returnValue='';return '';}});
window.addEventListener('pagehide',function(){Object.keys(FS.dirty).forEach(function(k){if(FS.dirty[k])fsSave(k);});});

// ============ v27 PHOTO IDENTIFY: small upload (1024px), short timeout, progress text ============
var ID_DIM=1024,ID_BYTES=300*1024,ID_TIMEOUT=30000;
var _fsId=autoIdIdentify;
function idShrinkDataUrl(dataUrl){
  return new Promise(function(res){
    try{var im=new Image();im.onload=function(){
      var w=im.naturalWidth,h=im.naturalHeight,s=Math.min(1,ID_DIM/Math.max(w,h));
      if(s===1&&dataUrl.length*0.75<=ID_BYTES)return res(dataUrl);
      var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
      var x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      var q=0.8,out=c.toDataURL('image/jpeg',q);while(out.length*0.75>ID_BYTES&&q>0.4){q-=0.1;out=c.toDataURL('image/jpeg',q);}res(out);
    };im.onerror=function(){res(dataUrl);};im.src=dataUrl;}catch(e){res(dataUrl);}
  });
}
var ID_STEPS=[[0,'Preparing the photo...'],[1500,'Identifying your vehicle...'],[9000,'Still working - checking the trim and year...'],[20000,'Almost there. You can keep typing; nothing you enter is replaced.']];
autoIdIdentify=function(dataUrl){
  var my=AUTOID.token+1,t0=Date.now();
  ID_STEPS.forEach(function(s){setTimeout(function(){if(AUTOID.busy&&AUTOID.token===my&&s[0]>0)autoIdNote('loading',s[1]);},s[0]);});
  idShrinkDataUrl(dataUrl).then(function(small){
    window.__ID_LAST_BYTES__=Math.round(small.length*0.75);
    _fsId(small);
    // replace the 70 s race with a 30 s budget
    setTimeout(function(){if(AUTOID.busy&&AUTOID.token===my){AUTOID.token++;AUTOID.busy=false;autoIdNote('fail','Auto-identify took too long - enter details manually, or add the VIN for an exact match.');}},ID_TIMEOUT-(Date.now()-t0));
  });
};

// ============ v27 TRIM: VIN beats the photo guess; trim is a suggestion with alternatives ============
var TRIMS={
  'toyota|tacoma':['SR','SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited','Trailhunter'],
  'toyota|tundra':['SR','SR5','Limited','Platinum','1794 Edition','TRD Pro','Capstone'],
  'toyota|4runner':['SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited','Trailhunter','Platinum'],
  'toyota|*':['SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited'],
  'ford|f-150':['XL','XLT','Lariat','King Ranch','Platinum','Limited','Tremor','Raptor'],
  'ford|bronco':['Base','Big Bend','Black Diamond','Outer Banks','Badlands','Wildtrak','Raptor'],
  'chevrolet|silverado 1500':['WT','Custom','LT','RST','LTZ','Trail Boss','ZR2','High Country'],
  'jeep|wrangler':['Sport','Sport S','Sahara','Rubicon','Rubicon 392']
};
function trimNorm(t){return String(t||'').replace(/\bTRD[\s-]*Off[\s-]*Road\b/i,'TRD Off-Road').replace(/\bTRD[\s-]*Pro\b/i,'TRD Pro').replace(/\bTRD[\s-]*Sport\b/i,'TRD Sport').trim();}
function trimOptions(make,model){var a=String(make||'').toLowerCase().trim(),b=String(model||'').toLowerCase().trim();return TRIMS[a+'|'+b]||TRIMS[a+'|*']||[];}
function trimSuggest(src){
  var inp=document.getElementById('v-trim');if(!inp)return;
  var box=document.getElementById('trim-sug');if(!box){box=document.createElement('div');box.id='trim-sug';box.className='trim-sug';inp.parentNode.appendChild(box);}
  var cur=val('v-trim').trim(),opts=trimOptions(val('v-make'),val('v-model'));
  if(!cur&&!opts.length){box.innerHTML='';return;}
  if(cur&&opts.indexOf(cur)<0)opts=[cur].concat(opts);
  box.innerHTML=(cur?'Trim '+(src==='vin'?'from VIN':(src==='photo'?'suggested from photo':''))+' - tap to change:':'Pick a trim:')+'<br>'+opts.map(function(o){return '<button type="button" class="trim-chip'+(o===cur?' on':'')+'" onclick="trimPick(this)" data-t="'+esc(o)+'">'+esc(o)+'</button>';}).join('');
  box.dataset.src=src||'';
  if(cur&&(src==='vin'||src==='photo')){var dt=inp.closest&&inp.closest('details');if(dt)dt.open=true;}
}
function trimPick(b){setVal('v-trim',b.getAttribute('data-t'));try{if(AUTOID.filled['v-trim']){delete AUTOID.filled['v-trim'];var tg=document.querySelector('#modal-add-vehicle .ai-tag[data-for="v-trim"]');if(tg)tg.remove();}}catch(e){}trimSuggest('user');var m=document.getElementById('modal-add-vehicle');if(m)m.dispatchEvent(new Event('input'));try{fsSave('modal-add-vehicle');}catch(e){}}
var _fsVp=vinParse;
vinParse=function(row){var o=_fsVp(row);if(o&&o.trim)o.trim=trimNorm(o.trim);return o;};
var _fsVd=vinFormDecode;
vinFormDecode=async function(){
  // fields the photo AI filled are guesses: let the VIN replace them without a conflict question
  try{var vin=cleanVin();if(vinOk(vin)&&!vinFormReplica()){var o=await vinFetch(vin);if(o&&cleanVin()===vin){['v-year','v-make','v-model','v-trim'].forEach(function(id){if(AUTOID.filled[id]){setVal(id,'');delete AUTOID.filled[id];var tg=document.querySelector('#modal-add-vehicle .ai-tag[data-for="'+id+'"]');if(tg)tg.remove();}});}}}catch(e){}
  await _fsVd();
  if(VIN.form&&VIN.form.o)trimSuggest('vin');else trimSuggest(AUTOID.filled['v-trim']?'photo':'');
};
var _fsAs=autoIdSuccess;
autoIdSuccess=function(my,data){
  if(data&&data.trim)data.trim=trimNorm(data.trim);
  // a decoded VIN already filled trim/model: do not let the photo override (fields are only filled when empty anyway)
  _fsAs(my,data);trimSuggest(AUTOID.filled['v-trim']?'photo':'');
};
// ============ v28 RENAME COLLECTION (profiles.collection_name via set_collection_name RPC, migration_020) ============
function collCustom(c){var id=c&&c.id,p=id&&C.profiles&&C.profiles[id];var n=(p&&p.collection_name)||(c&&c.collectionName)||'';return String(n).trim();}
function collName(c){return collCustom(c)||(c&&c.name)||'';}
function collTitle(c){var cu=collCustom(c);if(cu)return cu;var t=ctitleName(c&&c.name);return /\b(collection|collective|garage|stable)\b/i.test(t)?t:'The '+t.replace(/^the\s+/i,'')+' Collection';}
function ctitleHTML(n,exact){
  var t=exact?String(n||'').trim():ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!exact&&!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  return '<div class="ctitle-eyebrow">'+(coll||exact?'The Private Collection':'Private Collection')+'</div><h2 class="ctitle-name">'+esc(t)+'</h2><div class="ctitle-rule" aria-hidden="true"><b></b><i></i></div>';
}
function ctitleSet(id,n,exact){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n,exact);
  el.setAttribute('data-name',String(n||''));
}
// which collection the Account line renames, or null when not allowed
function rnTarget(){
  if(!session)return null;
  var c=ownerClient();                                   // owner (or co-owner), or admin viewing as an owner
  if(c)return c;
  if(currentClientId){var d=byId(getClients(),currentClientId);
    if(d&&(realAdmin()||managedMine(d.id)))return d;}   // admin anywhere; tech only on a client they manage (edit rights)
  if(realAdmin()&&!viewAsActive()){var me0=C.profiles&&C.profiles[myId()];if(me0)return {id:myId(),name:me0.display_name||session.account.name||'',own:true};}
  return null;
}
function rnLineRender(){
  var m=document.querySelector('#modal-account .modal');if(!m)return;
  var row=document.getElementById('rn-line');
  if(!row){row=document.createElement('button');row.type='button';row.id='rn-line';row.className='rn-line';row.onclick=openRenameSheet;
    var hd=m.querySelector('.modal-header');var blk=hd&&hd.nextElementSibling;(blk&&blk.parentNode?blk.parentNode.insertBefore(row,blk.nextSibling):m.appendChild(row));}
  var t=rnTarget();
  if(!t){row.style.display='none';return;}
  row.style.display='';
  row.innerHTML='<span class="rn-l"><span class="rn-k">Rename collection</span><span class="rn-v">'+esc(collTitle(t))+'</span></span><span class="rn-chev" aria-hidden="true">&#8250;</span>';
}
var _rnAcct=openAccountModal;
openAccountModal=function(){_rnAcct.apply(this,arguments);rnLineRender();};
function rnClean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function openRenameSheet(){
  var t=rnTarget();if(!t)return;
  var cur=collTitle(t);
  sheetOpen({title:'Rename collection',html:'<div class="rn-cur">'+esc(cur)+'</div>'
    +'<div class="input-group" style="margin-top:14px;"><label for="rn-input">New name</label><input type="text" id="rn-input" maxlength="60" value="'+esc(cur)+'" autocomplete="off" oninput="rnCount()"></div>'
    +'<div class="rn-meta"><span id="rn-err" role="status"></span><span id="rn-count"></span></div>',
    buttons:[{label:'Cancel',fn:sheetClose},{label:'Save',cls:'btn-primary',id:'rn-save',fn:function(){saveCollectionName(t.id);}}]});
  rnCount();setTimeout(function(){var i=document.getElementById('rn-input');if(i){i.focus();i.select();}},50);
}
function rnCount(){var v=val('rn-input');elText('rn-count',v.length+'/60');elText('rn-err','');}
async function saveCollectionName(ownerId){
  var n=rnClean(val('rn-input'));
  if(!n){elText('rn-err','Enter a name.');return;}
  if(n.length>60){elText('rn-err','Keep it to 60 characters.');return;}
  var b=document.getElementById('rn-save');if(b){b.disabled=true;b.textContent='Saving...';}
  try{
    var r=await sb.rpc('set_collection_name',{p_owner:ownerId,p_name:n});
    if(r.error)throw r.error;
    var saved=(typeof r.data==='string'&&r.data)||n;
    if(C.profiles[ownerId])C.profiles[ownerId].collection_name=saved;
    var c=byId(getClients(),ownerId);if(c)c.collectionName=saved;
    sheetClose();rnLineRender();try{viewAsRefreshUI();}catch(e){}
    refreshCurrent();showToast('Collection renamed','success');
  }catch(e){
    if(b){b.disabled=false;b.textContent='Save';}
    var m=String((e&&e.message)||e||'');
    elText('rn-err',rpcMissing(e)?NEEDS_BACKEND+'.':(/not_allowed|42501/.test(m+(e&&e.code))?'You cannot rename this collection.':(/invalid_name/.test(m)?'Use 1 to 60 characters.':friendlyError(e))));
  }
}
(function(){try{var st=document.createElement('style');
  st.textContent='.rn-line{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;background:transparent;border:0;border-bottom:1px solid var(--line);padding:16px 0;margin:0 0 6px;text-align:left;cursor:pointer;color:#fff;min-height:44px}'
   +'.rn-l{display:flex;flex-direction:column;gap:4px;min-width:0}.rn-k{font-size:19px;color:#fff;font-weight:400}.rn-v{font-size:17px;color:var(--gold,#c9a85c);overflow-wrap:anywhere}.rn-chev{font-size:28px;color:var(--gold,#c9a85c)}'
   +'.rn-cur{font-size:22px;color:var(--gold,#c9a85c);font-weight:300;overflow-wrap:anywhere}#rn-input{font-size:20px;color:#fff}.rn-meta{display:flex;justify-content:space-between;font-size:15px;color:#fff}#rn-err{color:var(--gold,#c9a85c)}label[for=rn-input]{color:#fff;font-size:15px}';
  document.head.appendChild(st);}catch(e){}})();
// ============ v29 SORT BY (carousel + collection lists). Per user + per portfolio in localStorage. Move mode keeps My order. ============
var ST_OPTS=[{k:'my',l:'My order',s:'My order'},{k:'year_desc',l:'Year, newest first',s:'Year \u2193'},{k:'year_asc',l:'Year, oldest first',s:'Year \u2191'},
  {k:'name',l:'Name A\u2013Z',s:'Name A\u2013Z'},{k:'added',l:'Date added, newest',s:'Newest added'},{k:'value',l:'Value, highest',s:'Value \u2193'}];
function stKeyFor(list){var v=(list||[])[0];return 'evo_sort_'+(myId()||'anon')+'_'+(v?phPfKey(v):'none');}
function stGet(key){try{var k=localStorage.getItem(key);return ST_OPTS.some(function(o){return o.k===k;})?k:'my';}catch(e){return 'my';}}
function stVal(v){try{if(!can(v,'view_value_estimate')&&!realAdmin()&&!isOwner())return null;var x=Number(aiVal(v));return isFinite(x)&&x>0?x:null;}catch(e){return null;}}
function stSort(list,mode){
  var a=(list||[]).map(function(v,i){return {v:v,i:i};}),nm=function(v){return (String(v.make||'')+' '+String(v.model||'')).trim().toLowerCase();},
      nul=function(x,y,f){var p=x==null,q=y==null;return p&&q?0:p?1:q?-1:f();};
  var cmp={year_desc:function(x,y){return nul(Number(x.year)||null,Number(y.year)||null,function(){return Number(y.year)-Number(x.year);});},
    year_asc:function(x,y){return nul(Number(x.year)||null,Number(y.year)||null,function(){return Number(x.year)-Number(y.year);});},
    name:function(x,y){return nm(x).localeCompare(nm(y));},
    added:function(x,y){return String(y.createdAt||'').localeCompare(String(x.createdAt||''));},
    value:function(x,y){var p=stVal(x),q=stVal(y);return nul(p,q,function(){return q-p;});}}[mode];
  if(!cmp)return list;
  return a.sort(function(x,y){return cmp(x.v,y.v)||x.i-y.i;}).map(function(o){return o.v;});
}
function stApply(list){if(typeof PH!=='undefined'&&PH.move)return list;return stSort(list,stGet(stKeyFor(list)));}
var ST_CUR=null;
function stLabel(k){var o=ST_OPTS.filter(function(x){return x.k===k;})[0]||ST_OPTS[0];return 'Sort: '+o.s;}
function stButton(host,list){
  if(!host||!(list||[]).length)return;
  var key=stKeyFor(list),b=host.querySelector('.st-btn');
  if(!b){b=document.createElement('button');b.type='button';b.className='st-btn';var h=host.querySelector('.ph-hint');(h&&h.nextSibling)?host.insertBefore(b,h.nextSibling):host.appendChild(b);}
  b.setAttribute('data-key',key);b.textContent=stLabel(stGet(key));b.setAttribute('aria-haspopup','dialog');
  b.onclick=function(){stOpen(key);};
}
function stOpen(key){
  ST_CUR=key;var cur=stGet(key);
  sheetOpen({title:'Sort by',html:'<div class="st-list" role="radiogroup">'+ST_OPTS.map(function(o){
    return '<button type="button" class="st-opt'+(o.k===cur?' on':'')+'" role="radio" aria-checked="'+(o.k===cur)+'" data-k="'+o.k+'" onclick="stPick(\''+o.k+'\')"><span>'+esc(o.l)+(o.k==='my'?'<small>Hold a car to reorder</small>':'')+'</span><b aria-hidden="true">'+(o.k===cur?'\u2713':'')+'</b></button>';}).join('')+'</div>',
    buttons:[{label:'Close',fn:sheetClose}]});
}
function stPick(k){try{if(k==='my')localStorage.removeItem(ST_CUR);else localStorage.setItem(ST_CUR,k);}catch(e){}sheetClose();refreshCurrent();}
var _wheelMount29=wheelMount;
wheelMount=function(id,list){var r=_wheelMount29.apply(this,arguments);try{stButton(document.getElementById(id),list);}catch(e){}return r;};
(function(){try{var st=document.createElement('style');
  st.textContent='.st-btn{display:block;margin:14px auto 0;background:transparent;border:1px solid var(--gold,#c9a85c);border-radius:999px;color:var(--gold,#c9a85c);font-size:17px;padding:10px 22px;min-height:44px;cursor:pointer}'
   +'.st-list{display:flex;flex-direction:column;margin:8px 0}.st-opt{display:flex;justify-content:space-between;align-items:center;background:transparent;border:0;border-bottom:1px solid var(--line);padding:16px 2px;color:#fff;font-size:19px;text-align:left;min-height:52px;cursor:pointer}'
   +'.st-opt small{display:block;font-size:15px;color:var(--gold,#c9a85c);margin-top:3px}.st-opt.on{color:var(--gold,#c9a85c)}.st-opt b{color:var(--gold,#c9a85c);font-size:20px}';
  document.head.appendChild(st);}catch(e){}})();
var _rcd29=renderClientDetail;
renderClientDetail=function(){var r=_rcd29.apply(this,arguments);try{
  var list=document.getElementById('cd-vehicles'),c=byId(getClients(),currentClientId);if(!list||!c)return r;
  var vs=activeVehicles(getVehicles()).filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);});
  var bar=document.getElementById('cd-sortbar');if(!bar){bar=document.createElement('div');bar.id='cd-sortbar';list.parentNode.insertBefore(bar,list);}
  bar.innerHTML='';stButton(bar,vs);}catch(e){}return r;};
// ===== v28 (p30): refresh updates everything, brief always current, like-for-like trend, All range from collection start, clear valuation failures =====
var RB={pend:null,gen:0,cache:{},why:{},fin:0};
try{RB.why=(getUI().vqWhy)||{};}catch(e){RB.why={};}
// (1) a reload requested while one is running is no longer dropped: it runs once the current one ends
var _rbReload=reloadAll;
reloadAll=function(silent){
  if(typeof reloading!=='undefined'&&reloading){
    if(!RB.pend)RB.pend=new Promise(function(res){(function w(){if(reloading){setTimeout(w,120);return;}Promise.resolve(_rbReload(true)).then(res,res);})();}).then(function(){RB.pend=null;});
    return RB.pend;
  }
  return _rbReload(silent);
};
function rbRerenderAll(){try{refreshCurrent();}catch(e){}try{refreshDetailIfOpen();}catch(e){}try{if(typeof updateRecBadge==='function')updateRecBadge();}catch(e){}}
// when the value queue (first values after add/import/merge/archive, or Refresh values now) finishes: reload once, re-render every dependent view, then show the result
var _rbBar=vqBar;
vqBar=function(finished){
  if(finished&&VQ.total&&!VQ.run&&!VQ.q.length){
    var seq=++RB.fin;
    Promise.resolve(session?reloadAll(true):null).then(function(){if(seq!==RB.fin)return;rbRerenderAll();_rbBar(true);RB.done=seq;},function(){rbRerenderAll();_rbBar(true);});
    return;
  }
  return _rbBar(finished);
};
// (2) Collection Brief: built locally from records, recomputed only when something it reads changed
function rbSig(vs){
  var ids={},s=[todayISO(),VQ.msg||'',VQ.run?1:0];
  (vs||[]).forEach(function(v){ids[v.id]=1;var a=v.aiValue||{},o=v.ownerValue||{};
    s.push([v.id,v.archived?1:0,v.year,v.make,v.model,v.trim||'',v.mileage,v.purchasePrice,v.insuredValue,v.isReplica?1:0,a.value,a.asOf,a.review?1:0,o.value,o.setAt,(v.valueLog||[]).length,(v.reminders||[]).length,v.regExpiry||'',v.insRenewal||'',v.updatedAt||'',aiHealth(v),RB.why[v.id]||''].join('|'));});
  var ex=0,ne=0;(getExpenses()||[]).forEach(function(e){if(ids[e.vehicleId]){ne++;ex+=Number(e.amount)||0;}});
  var rc=(getRecs()||[]).filter(function(r){return ids[r.vehicleId];}).map(function(r){return r.id+r.status;}).join(',');
  var dc=(typeof getDocs==='function'?(getDocs()||[]).filter(function(d){return ids[d.vehicleId];}).length:0);
  try{s.push(vqColDoneToday((vs[0]||{}).clientId)?1:0);}catch(e){}
  return s.join('~')+'#'+ne+':'+ex+'#'+rc+'#'+dc;
}
var _rbCB=collectionBrief;
collectionBrief=function(vs){
  var k=(vs||[]).map(function(v){return v.id;}).join(','),sig=rbSig(vs),c=RB.cache[k];
  if(c&&c.sig===sig)return c.html;
  RB.gen++;var h=_rbCB(vs);RB.cache[k]={sig:sig,html:h};return h;
};
// (3) like-for-like trend: only cars that had a value at the start of the period; first values are reported separately
function vchLfl(S,sl){
  if(!sl||sl.length<2)return null;var a=sl[0],b=sl[sl.length-1],sa=0,sb=0,n=0,added=0,best=null;
  S.cars.forEach(function(k){var id=k.v.id,x=a.parts&&a.parts[id],y=b.parts&&b.parts[id];
    if(x===undefined&&y!==undefined){added++;return;}if(x===undefined||y===undefined)return;
    sa+=x;sb+=y;n++;var dd=y-x;if(dd!==0&&(!best||Math.abs(dd)>Math.abs(best.d)))best={d:dd,n:vName(k.v)};});
  return {d:sb-sa,p:sa?(sb-sa)/sa*100:0,a:sa,b:sb,n:n,added:added,best:best};
}
VCH.rl.All='since the collection started';
function rbSign(d){return (d>0?'+':'\u2212')+money(Math.abs(d)).replace('-','');}
vchCollInsight=function(S,r,today){
  if(S.real<2){var f=S.pts.length?S.pts[0].d:today;return vchFirstText(f);}
  var sl=vchSlice(S.pts,r,today),c=vchLfl(S,sl),txt;if(!c)return 'Not enough history for this range yet.';
  var per=r==='All'?'since the collection started':'over the '+VCH.rl[r];
  if(!c.n)txt='No price movement to compare yet: no vehicle had a value at the start of this period.';
  else if(c.d===0)txt='Unchanged '+(r==='All'?'since the collection started':'over the '+VCH.rl[r])+' for the '+c.n+' '+plural(c.n,'vehicle','vehicles')+' valued throughout.';
  else txt=(c.d>0?'Up ':'Down ')+Math.abs(c.p).toFixed(1)+'% ('+rbSign(c.d)+') '+per+', across the '+c.n+' '+plural(c.n,'vehicle','vehicles')+' valued throughout.';
  if(c.best)txt+=' Biggest mover: '+c.best.n+' ('+rbSign(c.best.d)+').';
  if(c.added)txt+=' '+c.added+' '+plural(c.added,'vehicle','vehicles')+' got a first value in this period (not counted as a gain).';
  var no=S.cars.filter(function(k){return !!k.own;}).length;if(no)txt+=' Uses your own value for '+no+' vehicle'+(no===1?'':'s')+'.';
  return txt;
};
var _rbHead=vchHead;
vchHead=function(st,p){
  _rbHead(st,p);var m=st.m;
  if(p||m.kind!=='coll'||m.real<2)return;
  var c=vchLfl(m.S,st.pts),chg=st.host.querySelector('.vch-chg');if(!chg)return;
  if(!c||!c.n){chg.innerHTML='<span class="vch-rl">'+esc(c&&c.added?c.added+' '+plural(c.added,'vehicle','vehicles')+' got a first value':'No price movement yet')+'</span>';return;}
  chg.innerHTML=vchChgHTML(c,VCH.rl[st.r]);
};
// (4) "All" starts at the collection's start: earlier of the account / collection creation and the first vehicle upload
function vchCollStart(vehicles){
  var best=null;function t(s){if(!s)return;var d=String(s).slice(0,10);if(isFinite(vchT(d))&&(!best||d<best))best=d;}
  (vehicles||[]).forEach(function(v){t(v.createdAt);var c=byId(getClients()||[],v.clientId);if(c)t(c.createdAt);});
  return best;
}
var _rbCM=vchCollModel;
vchCollModel=function(id,vehicles){var m=_rbCM(id,vehicles);if(m){var all=(getVehicles()||[]).filter(function(x){return vehicles.length&&x.clientId===vehicles[0].clientId;});m.start=vchCollStart(vehicles.concat(all));}return m;};
var _rbGeom=vchGeom;
vchGeom=function(st){
  var G=_rbGeom(st),m=st.m;
  if(st.r==='All'&&m.start){var t=vchT(m.start);if(isFinite(t)&&t<G.t0){G.t0=t;var W=G.W,PL=G.PL,PR=G.PR,t0=G.t0,t1=G.t1;G.X=function(d){return PL+(W-PL-PR)*(vchT(d)-t0)/(t1-t0);};}}
  return G;
};
// evenly spaced axis labels (equal time steps), never two identical labels
function vchAxisLabels(t0,t1,today,r){
  var span=t1-t0,day=864e5,fmt;
  if(r==='All'&&span>400*day)fmt=function(d){return String(d.getFullYear());};
  else if(span>75*day)fmt=function(d){return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'});};
  else fmt=function(d){return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  var tt=vchT(today);
  for(var n=4;n>=2;n--){
    var out=[],seen={},dup=false;
    for(var i=0;i<n;i++){var t=t0+span*i/(n-1),d=new Date(t),iso=isoLocal(d),l=(i===n-1&&Math.abs(t-tt)<day/2)||iso===today?'Today':fmt(d);if(seen[l]){dup=true;break;}seen[l]=1;out.push(l);}
    if(!dup)return out;
  }
  return [fmt(new Date(t0)),'Today'];
}
var _rbDraw=vchDraw;
vchDraw=function(st){
  _rbDraw(st);
  var ax=st.host.querySelector('.vch-axis');if(!ax||!st.G||st.single)return;
  ax.innerHTML=vchAxisLabels(st.G.t0,st.G.t1,st.m.today,st.r).map(function(l){return '<span>'+esc(l)+'</span>';}).join('');
};
// (5) say plainly why a car could not be valued, and keep that reason after the queue ends
function rbWhyText(v,note){
  var t=String(note&&note.text||''),car=[v&&v.year,v&&v.make,v&&v.model].filter(function(x){return x;}).join(' ');
  if(/timeout|too long/i.test(t))return 'The price lookup took too long. It is tried again in the weekly run, or tap Refresh estimate on the car.';
  if(/No reliable market prices|No market prices/i.test(t))return 'No market prices were found for a '+(car||'car like this')+'. Check the model name, or add the variant (trim) or VIN.';
  if(/^Add the /.test(t))return t;
  if(/402|409|code: 409/.test(t))return 'The refresh run expired. Tap Refresh values now again tomorrow.';
  return t||'The estimate service had an error. It is tried again in the weekly run.';
}
function rbSaveWhy(){try{var u=getUI();u.vqWhy=RB.why;localStorage.setItem('evoai_ui',JSON.stringify(u));}catch(e){}}
function rbNoteWhy(vid,n){var v=byId(getVehicles(),vid);if(!n||n.kind==='done'){if(RB.why[vid]){delete RB.why[vid];rbSaveWhy();}return;}if(n.kind==='fail'){RB.why[vid]=rbWhyText(v,n);rbSaveWhy();}}
function rbMissText(v){var m=vqMissing(v);return 'Add the '+vqList(m)+' to get a value';}
var _rbPanel=vqPanel;
vqPanel=function(vs){
  var h=_rbPanel(vs);if(!h)return h;
  // clearer missing-field wording
  (vs||[]).forEach(function(v){if(!vqComplete(v)){var o='('+esc('add the '+vqList(vqMissing(v)))+')';h=h.split(esc(vName(v)||'Unnamed car')+' '+o).join(esc(vName(v)||'Unnamed car')+' ('+esc('add the '+vqList(vqMissing(v)))+' to get a value)');}});
  var bad=(vs||[]).filter(function(v){return !isArchivedVehicle(v)&&vqComplete(v)&&!vqHasValue(v)&&RB.why[v.id];});
  if(bad.length){var p='<p class="vq-p vq-why"><b>Could not be valued yet:</b> '+bad.slice(0,6).map(function(v){return esc(vName(v))+' \u2014 '+esc(RB.why[v.id]);}).join('; ')+'</p>';h=h.replace('<div class="vq" data-noptr>','<div class="vq" data-noptr>'+p);}
  return h;
};
// v31 inspection report: one-line step label + bar, owner gets no client picker, single car preselected
var INSP_STEPS=['Vehicle','Work done','Vitals','Condition','Notes'];
function inspProg(step){
  var l=document.getElementById('ins-prog-lbl'),b=document.getElementById('ins-bar-fill');
  if(l)l.innerHTML='Step '+(step+1)+' of '+INSP_STEPS.length+' &middot; <b>'+INSP_STEPS[step]+'</b>';
  if(b)b.style.width=((step+1)/INSP_STEPS.length*100)+'%';
}
function inspOwnerMode(){
  var own=isOwner(),g=document.getElementById('insp-client-group');
  if(g)g.style.display=own?'none':'';
  var ti=document.getElementById('insp-tech'),tl=ti&&ti.parentNode.querySelector('label');if(tl)tl.textContent=own?'Done by':'Tech';
  var intro=document.getElementById('ins-intro');
  if(intro)intro.textContent=own?'Write down a check-up you did on your car: work done, battery and tyre readings, condition and notes. It is saved to the car\u2019s service history. This does not book or request an inspection.':'Record a check-up visit on a client\u2019s car: work done, battery and tyre readings, condition and notes. It is saved to the car\u2019s service history and the owner can read it. This does not book or request an inspection.';
  return own;
}
function inspPickOnly(){
  var s=document.getElementById('insp-vehicle');if(!s||s.value)return;
  var o=[].filter.call(s.options,function(x){return x.value;});
  if(o.length===1)s.value=o[0].value;
}
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
  var my=++SS.tok;
  try{var _sv=byId(getVehicles(),val('svc-vehicle'));if(_sv&&!canReviewScan(_sv)){ssShow('entry','Reviewed scanning is not enabled for you on this vehicle. Enter the details below.');return;}}catch(_e){}
ssClearTags();SS.scan=null;
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
// ===== v33 (p33): "Which portfolio?" import step - approved mockup pf-04 (Option B, Oct 25).
// Adds on top of p20/p24: one portfolio -> preselected with a clear "goes into X" line; the chosen
// portfolio is always valid (falls back to the default); ZAR (South Africa) in the new-portfolio
// currency list; picking a country sets its currency. Portfolio rows need migration_013 (+021 for
// ZAR purchase prices). Without 013 the app keeps one implicit portfolio and this step only confirms it.
var PF_CUR_LIST=['USD','EUR','GBP','ZAR'];
var PF_COUNTRY_CUR={US:'USD',CA:'USD',GB:'GBP',ZA:'ZAR',IE:'EUR',DE:'EUR',FR:'EUR',IT:'EUR',ES:'EUR',NL:'EUR',MC:'EUR'};
function pfImValid(owner,id){var l=poList(owner);for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null;}
function pfImEnsure(){if(!IM.owner||IM.newPf)return;if(!pfImValid(IM.owner,IM.pfId))IM.pfId=poDefault(IM.owner).id;}
function pfImSetCountry(c){if(!IM.newPf)return;IM.newPf.country=c||'';var cu=PF_COUNTRY_CUR[IM.newPf.country];if(cu)IM.newPf.currency=cu;imRender();}
var pfImStep2Base=imStep2;
imStep2=function(){
  pfImEnsure();
  var h=pfImStep2Base();
  if(IM.owner&&!IM.newPf){var l=poList(IM.owner);
    if(l.length===1){var nm=imE(l[0].name);
      h=h.replace('<p class="im-lead">Choose where these vehicles go.</p>','<p class="im-lead pf-only">You have one portfolio, so these vehicles go into <b>'+nm+'</b>.'+(PO.on?' Or start a new one below.':'')+'</p>');}
  }
  // currency list with ZAR, country picks currency
  h=h.replace(/<select id="im-np-cur"([^>]*)>[\s\S]*?<\/select>/,function(m,a){var np=IM.newPf||{};return '<select id="im-np-cur"'+a+'>'+PF_CUR_LIST.map(function(c){return '<option'+(c===np.currency?' selected':'')+'>'+c+'</option>';}).join('')+'</select>';});
  h=h.replace('id="im-np-country" class="im-in" onchange="IM.newPf.country=this.value"','id="im-np-country" class="im-in" onchange="pfImSetCountry(this.value)"');
  return h;
};
var pfImToReviewBase=imToReview;
imToReview=async function(){pfImEnsure();return pfImToReviewBase();};
// ===== v34 (p34): Records vault - AI auto-files every document into a binder =====
// No DB change: the binder is derived from doc_category / kind / service_record_id / title,
// and a manual move is stored on the existing documents.title extras ({bd:'...'}) so it follows the row.
var BND_LIST=[['service','Service'],['insurance','Insurance'],['title','Title'],['registration','Registration'],['warranty','Warranty'],['inspections','Inspections'],['purchase','Purchase & Loan'],['sticker','Sticker & VIN'],['other','Other']];
var BND_IC={service:'&#128295;',insurance:'&#128737;',title:'&#128220;',registration:'&#129706;',warranty:'&#10022;',inspections:'&#9678;',purchase:'&#129534;',sticker:'&#9635;',other:'&#128193;'};
var BND_CAT={repair_invoice:'service',service_record:'service',receipt:'service',insurance:'insurance',title:'title',registration:'registration',inspection:'inspections',warranty:'warranty'};
var BND_TO_CAT={service:'service_record',insurance:'insurance',title:'title',registration:'registration',warranty:'warranty',inspections:'inspection',purchase:'other',sticker:'other',other:'other'};
var BND_REM_KIND={insurance:'insurance',registration:'tag',inspections:'inspection',warranty:'custom',title:'custom',purchase:'custom',sticker:'custom',service:'service',other:'custom'};
var BND_LOW=0.7,BND_ALERT_DAYS=60;
var BND={vid:null,bd:null,q:'',auto:{}};
function bndLabel(k){for(var i=0;i<BND_LIST.length;i++)if(BND_LIST[i][0]===k)return BND_LIST[i][1];return 'Other';}
function bndValid(k){return BND_LIST.some(function(b){return b[0]===k;});}
function bndMem(){try{return JSON.parse(localStorage.getItem('evo_bnd_moves')||'{}')||{};}catch(e){return {};}}
function bndText(d){var a=d.ai||{};return [d.name,a.vendor,a.summary,(a.services||[]).join(' '),d.notes].join(' ').toLowerCase();}
// Auto-file: manual move wins, then strong keywords, then the AI category, then the old type field
function bndAuto(d){
  var t=bndText(d),a=d.ai||{},c=a.category||'';
  if(/window sticker|monroney|vin plate|vin tag|vin photo|build sheet/.test(t))return 'sticker';
  if(/bill of sale|purchase agreement|buyer.?s order|loan|financ|lien|lender/.test(t))return 'purchase';
  if(d.srId)return 'service';
  if(BND_CAT[c])return BND_CAT[c];
  if(/warrant/.test(t))return 'warranty';
  if(/inspection|smog|emissions|ppi\b/.test(t))return 'inspections';
  if(!c){var ty=d.type;if(ty==='invoice'||ty==='service')return 'service';if(ty==='title'||ty==='registration'||ty==='insurance')return ty;}
  return 'other';
}
function bndOf(d){var m=d.bd||bndMem()[d.id];return bndValid(m)?m:bndAuto(d);}
function bndMoved(d){var m=d.bd||bndMem()[d.id];return bndValid(m);}
function bndConf(d){return d.ai&&d.ai.confidence!=null?+d.ai.confidence:null;}
function bndLowConf(d){if(bndMoved(d))return false;var c=bndConf(d);return (c!=null&&c<BND_LOW)||(d.ai&&d.ai.status&&d.ai.status!=='manual'&&bndAuto(d)==='other');}
function bndExp(d){return (d.ai&&d.ai.expiresOn)||d.expiry||'';}
function bndDays(s){if(!s)return null;var t=Date.parse(String(s).slice(0,10)+'T00:00:00');if(!isFinite(t))return null;var n=new Date();n.setHours(0,0,0,0);return Math.round((t-n.getTime())/86400000);}
function bndDate(d){return (d.ai&&d.ai.docDate)||String(d.createdAt||'').slice(0,10);}
function bndMoney(n){return '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});}
function bndDocs(vid){var ids={};visibleVehicles().forEach(function(v){ids[v.id]=1;});return getDocs().filter(function(d){return ids[d.vehicleId]&&(!vid||d.vehicleId===vid);});}
function bndAlerts(docs){
  var out=[];docs.forEach(function(d){var e=bndExp(d),n=bndDays(e);if(n!=null&&n<=BND_ALERT_DAYS)out.push({d:d,days:n,exp:e,bd:bndOf(d)});});
  // only the newest document per vehicle+binder counts (a renewed policy replaces the old one)
  var best={};out.forEach(function(a){var k=a.d.vehicleId+'|'+a.bd;var newer=docs.some(function(o){return o.vehicleId===a.d.vehicleId&&bndOf(o)===a.bd&&bndDays(bndExp(o))!=null&&bndDays(bndExp(o))>a.days;});if(!newer&&(!best[k]||best[k].days>a.days))best[k]=a;});
  return Object.keys(best).map(function(k){return best[k];}).sort(function(a,b){return a.days-b.days;});
}
function bndDue(n){return n<0?'expired '+(-n)+' day'+(n===-1?'':'s')+' ago':(n===0?'expires today':'expires in '+n+' day'+(n===1?'':'s'));}
function bndMatch(d,q){if(!q)return true;q=q.toLowerCase();return (bndText(d)+' '+bndLabel(bndOf(d)).toLowerCase()+' '+vName(byId(getVehicles(),d.vehicleId)).toLowerCase()).indexOf(q)>=0;}
function bndSearchHTML(ph){return '<div class="bnd-search"><span aria-hidden="true">&#8981;</span><input id="bnd-q" type="search" placeholder="'+esc(ph)+'" value="'+esc(BND.q)+'" oninput="bndSearch(this.value)" aria-label="Search records"></div>';}
function bndSearch(q){BND.q=q;var r=document.getElementById('bnd-results');if(r)r.innerHTML=bndResultsHTML();}
function bndResultsHTML(){
  if(!BND.q)return '';
  var l=bndDocs(BND.vid).filter(function(d){return (!BND.bd||bndOf(d)===BND.bd)&&bndMatch(d,BND.q);});
  return '<div class="bnd-h">'+l.length+' match'+(l.length===1?'':'es')+'</div>'+(l.length?l.map(bndRowHTML).join(''):'<div class="bnd-card">Nothing found for "'+esc(BND.q)+'"</div>');
}
function bndAlertHTML(al,showVeh){
  if(!al.length)return '';
  return '<div class="bnd-card bnd-alert" id="bnd-alerts"><div class="bnd-at">&#9888; '+al.length+' item'+(al.length===1?' needs':'s need')+' attention</div>'+al.map(function(a){var v=byId(getVehicles(),a.d.vehicleId);
    return '<button type="button" class="bnd-al" onclick="bndOpen(\''+jsId(a.d.vehicleId)+'\',\''+a.bd+'\')">'+esc(bndLabel(a.bd))+(showVeh?' &middot; '+esc(vName(v)):'')+' &mdash; '+esc(bndDue(a.days))+' ('+esc(fmtDate(a.exp))+')</button>';}).join('')+'</div>';
}
function bndTileHTML(k,docs,vid){
  var l=docs.filter(function(d){return bndOf(d)===k;}),al=bndAlerts(l),low=l.filter(bndLowConf).length,s;
  if(al.length)s='<span class="bnd-red">'+esc(al[0].days<0?'Expired':'Due '+fmtDate(al[0].exp).replace(/, \d{4}$/,''))+'</span>';
  else if(low)s='<span class="bnd-red">'+low+' to check</span>';
  else if(!l.length)s='Empty';
  else if(k==='service'){var tot=l.reduce(function(t,d){return t+(d.ai&&d.ai.amount?+d.ai.amount:0);},0);s=tot?bndMoney(tot)+' total':'Last '+fmtDate(bndDate(docAiSort?docAiSort(l)[0]:l[0]));}
  else{var e=l.map(bndExp).filter(Boolean).sort().pop();s=e?'Valid to '+fmtDate(e):'Last '+fmtDate(bndDate(l[0]));}
  return '<button type="button" class="bnd-tile'+(al.length||low?' alert':'')+(l.length?'':' empty')+'" data-bd="'+k+'" onclick="bndOpen('+(vid?'\''+jsId(vid)+'\'':'null')+',\''+k+'\')"><span class="bnd-ic" aria-hidden="true">'+BND_IC[k]+'</span><span class="bnd-n">'+l.length+'</span><span class="bnd-t">'+esc(bndLabel(k))+'</span><span class="bnd-s">'+s+'</span></button>';
}
function bndRowHTML(d){
  var low=bndLowConf(d),e=bndExp(d),n=bndDays(e),a=d.ai||{},sub=[fmtDate(bndDate(d))];
  if(a.amount)sub.push(bndMoney(a.amount));if(a.mileage)sub.push(Number(a.mileage).toLocaleString('en-US')+' mi');
  var th=typeof dtThumbHTML==='function'?dtThumbHTML(d):'<div class="bnd-th"></div>';
  var bits='<div class="bnd-rt">'+esc(d.name||'Document')+'</div><div class="bnd-rs">'+esc(sub.join(' / '))+'</div>'+(a.vendor?'<div class="bnd-rv">'+esc(a.vendor)+'</div>':'');
  if(e)bits+='<div class="'+(n!=null&&n<=BND_ALERT_DAYS?'bnd-red':'bnd-rs')+'">'+(n!=null&&n<0?'Expired ':'Expires ')+esc(fmtDate(e))+'</div>';
  if(low)bits+='<div class="bnd-red">AI not sure ('+Math.round((bndConf(d)||0)*100)+'%) - check the binder</div>';
  if(!BND.vid||!BND.bd)bits+='<div class="bnd-rv">'+esc(bndLabel(bndOf(d)))+' &middot; '+esc(vName(byId(getVehicles(),d.vehicleId)))+'</div>';
  return '<div class="bnd-row'+(low?' low':'')+'" data-doc="'+esc(d.id)+'"><span class="bnd-dot" aria-hidden="true"></span>'+th+'<div class="bnd-rb">'+bits+'<button type="button" class="bnd-move'+(low?' hot':'')+'" onclick="bndMoveOpen(\''+jsId(d.id)+'\')">&#8644; Move to another binder</button></div></div>';
}
function bndCollectionHTML(){
  var vs=visibleVehicles(),docs=bndDocs(null);
  var h='<div class="bnd-k">COLLECTION VAULT</div><div class="bnd-title">All vehicles</div><div class="bnd-sub">'+vs.length+' vehicle'+(vs.length===1?'':'s')+' &middot; '+docs.length+' document'+(docs.length===1?'':'s')+'</div>'+bndSearchHTML('Search every record')+'<div id="bnd-results">'+bndResultsHTML()+'</div>';
  h+=bndAlertHTML(bndAlerts(docs),true);
  h+='<div class="bnd-h">Across the garage</div><div class="bnd-grid">'+BND_LIST.filter(function(b){return b[0]!=='other'||docs.some(function(d){return bndOf(d)==='other';});}).map(function(b){return bndTileHTML(b[0],docs,null);}).join('')+'</div>';
  h+='<div class="bnd-h">Vehicles</div><div class="bnd-card">'+vs.map(function(v){var n=docs.filter(function(d){return d.vehicleId===v.id;}).length,al=bndAlerts(docs.filter(function(d){return d.vehicleId===v.id;})).length;
    return '<button type="button" class="bnd-vrow" onclick="bndOpen(\''+jsId(v.id)+'\',null)"><span>'+esc(vName(v)+(v.model&&!v.nickname?' '+v.model:''))+(al?' <span class="bnd-red">&#9888; '+al+'</span>':'')+'</span><b>'+n+' &rsaquo;</b></button>';}).join('')+'</div>';
  return h;
}
function bndVaultHTML(v){
  var docs=bndDocs(v.id),al=bndAlerts(docs);
  var h='<button type="button" class="bnd-back" onclick="bndOpen(null,null)">&lsaquo; All vehicles</button><div class="bnd-k">RECORDS VAULT</div><div class="bnd-title">'+esc(vName(v)+(v.model&&!v.nickname?' '+v.model:''))+'</div><div class="bnd-sub">'+(v.vin?'VIN '+esc(v.vin)+' &middot; ':'')+docs.length+' document'+(docs.length===1?'':'s')+'</div>';
  h+=bndSearchHTML('Search records, e.g. "brake pads"')+'<div id="bnd-results">'+bndResultsHTML()+'</div>'+bndAlertHTML(al,false);
  h+='<div class="bnd-grid">'+BND_LIST.filter(function(b){return b[0]!=='other'||docs.some(function(d){return bndOf(d)==='other';});}).map(function(b){return bndTileHTML(b[0],docs,v.id);}).join('')+'</div>';
  if(typeof openDocModal==='function'&&canEditVehicle(v))h+='<button type="button" class="bnd-cta" onclick="openDocModal(\''+jsId(v.id)+'\')">&#65291; Upload &mdash; AI will file it</button>';
  return h;
}
function bndBinderHTML(v,k){
  var l=bndDocs(v?v.id:null).filter(function(d){return bndOf(d)===k;});l=typeof docAiSort==='function'?docAiSort(l):l;
  var h='<button type="button" class="bnd-back" onclick="bndOpen('+(v?'\''+jsId(v.id)+'\'':'null')+',null)">&lsaquo; '+(v?'Vault':'All vehicles')+'</button><div class="bnd-title"><span aria-hidden="true">'+BND_IC[k]+'</span> '+esc(bndLabel(k))+'</div><div class="bnd-sub">'+l.length+' document'+(l.length===1?'':'s')+' &middot; '+esc(v?vName(v)+(v.model&&!v.nickname?' '+v.model:''):'All vehicles')+'</div>';
  if(k==='service'){var tot=0,mi=0;l.forEach(function(d){var a=d.ai||{};tot+=a.amount?+a.amount:0;if(a.mileage&&+a.mileage>mi)mi=+a.mileage;});
    if(v)(v.serviceLog||[]).forEach(function(s){if(s&&+s.mileage>mi)mi=+s.mileage;});
    h+='<div class="bnd-stats" id="bnd-totals"><div class="bnd-card"><div>Total spent</div><b>'+bndMoney(tot)+'</b></div><div class="bnd-card"><div>Last mileage</div><b>'+(mi?mi.toLocaleString('en-US')+' mi':'--')+'</b></div></div>';}
  h+=bndAlertHTML(bndAlerts(l),!v)+bndSearchHTML('Search '+bndLabel(k))+'<div id="bnd-results">'+bndResultsHTML()+'</div>';
  h+='<div class="bnd-h">Timeline</div>'+(l.length?'<div class="bnd-tl">'+l.map(bndRowHTML).join('')+'</div>':'<div class="bnd-card">No documents here yet. Upload one and the AI files it.</div>');
  return h;
}
function bndRender(){
  var el=document.getElementById('bnd-root');if(!el)return;
  var v=BND.vid?byId(getVehicles(),BND.vid):null;if(BND.vid&&!v){BND.vid=null;BND.bd=null;}
  el.innerHTML=BND.bd?bndBinderHTML(v,BND.bd):(v?bndVaultHTML(v):bndCollectionHTML());
  var legacy=document.getElementById('bnd-legacy');if(legacy)legacy.style.display=(v||BND.bd)?'none':'';
  if(typeof dtScan==='function')try{dtScan();}catch(e){}
  bndAutoReminders();
}
function bndOpen(vid,bd){BND.vid=vid||null;BND.bd=bd||null;BND.q='';if(document.getElementById('page-documents').classList.contains('active'))bndRender();else showPage('documents');var m=document.querySelector('.main');if(m)m.scrollTop=0;}
// ---------- move (one tap, remembered on the row) ----------
function bndMoveOpen(id){
  var d=byId(getDocs(),id);if(!d)return;var cur=bndOf(d);bndClose();
  var w=document.createElement('div');w.id='bnd-sheet';w.className='bnd-sheet';w.setAttribute('role','dialog');w.setAttribute('aria-label','Move to another binder');
  w.innerHTML='<div class="bnd-sheet-in"><div class="bnd-title">Move to another binder</div><div class="bnd-sub">'+esc(d.name||'Document')+'</div><div class="bnd-grid">'+BND_LIST.map(function(b){return '<button type="button" class="bnd-pick'+(b[0]===cur?' cur':'')+'" data-bd="'+b[0]+'" onclick="bndMove(\''+jsId(id)+'\',\''+b[0]+'\')"><span aria-hidden="true">'+BND_IC[b[0]]+'</span> '+esc(b[1])+(b[0]===cur?' &#10003;':'')+'</button>';}).join('')+'</div><button type="button" class="bnd-cta ghost" onclick="bndClose()">Cancel</button></div>';
  w.addEventListener('click',function(e){if(e.target===w)bndClose();});document.body.appendChild(w);
}
function bndClose(){['bnd-sheet','bnd-filed'].forEach(function(i){var e=document.getElementById(i);if(e&&e.parentNode)e.parentNode.removeChild(e);});}
async function bndMove(id,k){
  var d=byId(getDocs(),id);if(!d||!bndValid(k))return;bndClose();
  var mem=bndMem();mem[id]=k;try{localStorage.setItem('evo_bnd_moves',JSON.stringify(mem));}catch(e){}
  d.bd=k;bndRender();
  if(typeof docAiCanEdit==='function'&&docAiCanEdit(d)){
    try{var x=Object.assign({},d._x||{});x.bd=k;if(!x.type&&d.type)x.type=d.type;
      chk(await sb.from('documents').update({title:packX(d.name||'Document',x)}).eq('id',id));d._x=x;
      try{audit('document.updated','Document moved to '+bndLabel(k)+' binder: '+(d.name||'Document'),{clientId:d.clientId,vehicleId:d.vehicleId});}catch(e){}
    }catch(e){showToast('Moved on this device. '+friendlyError(e),'error');return;}
  }
  showToast('Moved to '+bndLabel(k),'success');
}
// ---------- auto reminders from AI-read expiry dates (existing reminders table) ----------
function bndRemTitle(d,k){return (bndLabel(k)+' expires').slice(0,60)+' - '+String(d.name||'Document').slice(0,50);}
async function bndAutoReminders(){
  var al=[];bndDocs(null).forEach(function(d){var e=bndExp(d),n=bndDays(e),k=bndOf(d);if(n!=null&&n>=0&&k!=='service')al.push({d:d,e:e,k:k});});
  for(var i=0;i<al.length;i++){var a=al[i],v=byId(getVehicles(),a.d.vehicleId),t=bndRemTitle(a.d,a.k),key=a.d.id+'|'+a.e;
    if(!v||BND.auto[key]||isArchivedVehicle(v)||!canManageReminders(v))continue;
    BND.auto[key]=1;
    if((v.reminders||[]).some(function(r){return r.title===t||(r.due===a.e&&/expire|renew/i.test(r.title||''));}))continue;
    try{var row={id:uid(),vehicle_id:v.id,kind:BND_REM_KIND[a.k]||'custom',title:t,notes:('From the '+bndLabel(a.k)+' binder. AI-read expiry '+a.e+'.').slice(0,1000),due_date:a.e,remind_days_before:30,created_by:myId()};
      chk(await sb.from('reminders').insert(row));
      (v.reminders=v.reminders||[]).push({id:row.id,title:t,due:a.e,repeat:'',doneAt:'',createdAt:new Date().toISOString(),by:myId()});
    }catch(e){}
  }
}
// ---------- the "Filed to X" moment after an upload is scanned ----------
function bndFiledHTML(d){
  var k=bndOf(d),a=d.ai||{},c=bndConf(d),e=bndExp(d),n=bndDays(e),rows=[];
  if(a.vendor)rows.push(['Issuer',a.vendor]);
  var pol=(String(a.summary||'')+' '+(d.name||'')).match(/(?:policy|pol\.?|no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i);if(pol)rows.push([k==='insurance'?'Policy no.':'Number',pol[1]]);
  if(a.docDate)rows.push(['Dated',fmtDate(a.docDate)]);if(a.amount)rows.push(['Amount',bndMoney(a.amount)]);if(a.mileage)rows.push(['Mileage',Number(a.mileage).toLocaleString('en-US')+' mi']);
  if(e)rows.push(['Expires',fmtDate(e),n!=null&&n<=BND_ALERT_DAYS]);
  var cnt=bndDocs(d.vehicleId).filter(function(o){return bndOf(o)===k;}).length,low=bndLowConf(d);
  return '<div class="bnd-sheet-in"><div class="bnd-k">AI SCAN COMPLETE</div><div class="bnd-title">Filed to '+esc(bndLabel(k))+' &#10003;</div><div class="bnd-sub">'+esc(d.name||'Document')+(c!=null?' &middot; '+Math.round(c*100)+'% confident':'')+'</div>'+
    '<div class="bnd-card bnd-big"><div class="bnd-bigic" aria-hidden="true">'+BND_IC[k]+'</div><div class="bnd-bigt">'+esc(bndLabel(k).toUpperCase())+'</div><div>Binder now holds '+cnt+' document'+(cnt===1?'':'s')+'</div></div>'+
    (low?'<div class="bnd-card bnd-alert"><span class="bnd-red">The AI is not sure about this one. Check the binder.</span></div>':'')+
    (rows.length?'<div class="bnd-h">Key facts the AI read</div><div class="bnd-card" id="bnd-facts">'+rows.map(function(r){return '<div class="bnd-kv"><span>'+esc(r[0])+'</span><b class="'+(r[2]?'bnd-red':'')+'">'+esc(r[1])+'</b></div>';}).join('')+'</div>':'')+
    (e&&n!=null&&n>=0?'<div class="bnd-card"><b class="bnd-gold">&#9200; Reminder set</b><div>We will alert you 30 days before it expires.</div></div>':'')+
    '<button type="button" class="bnd-cta" onclick="bndClose()">Done</button><button type="button" class="bnd-cta ghost" onclick="bndMoveOpen(\''+jsId(d.id)+'\')">Wrong binder? Move it</button></div>';
}
function bndShowFiled(id){var d=byId(getDocs(),id);if(!d)return;bndClose();var w=document.createElement('div');w.id='bnd-filed';w.className='bnd-sheet full';w.setAttribute('role','dialog');w.setAttribute('aria-label','Filed');w.innerHTML=bndFiledHTML(d);document.body.appendChild(w);bndAutoReminders();}
if(typeof docAiSave==='function'){var _bndDocAiSave=docAiSave;docAiSave=async function(){var id=DOCAI.edit&&DOCAI.edit.id;await _bndDocAiSave.apply(this,arguments);if(id&&!DOCAI.edit)bndShowFiled(id);};}
function renderDocuments(){
  var root=document.getElementById('bnd-root');
  if(!root){var pg=document.getElementById('page-documents');if(pg){root=document.createElement('div');root.id='bnd-root';root.className='bnd';var al=document.getElementById('doc-alerts');pg.insertBefore(root,al);
    var lg=document.createElement('div');lg.id='bnd-legacy';lg.innerHTML='<div class="bnd-h">All files</div>';al.parentNode.insertBefore(lg,al);lg.appendChild(al);lg.appendChild(document.getElementById('documents-list'));}}
  renderDocumentsList();bndRender();
}
(function(){function fix(){
 document.querySelectorAll('.ms-chip').forEach(function(c){if(c.querySelector('.em-ring'))return;var m=c.textContent.match(/(\d+)\s*of\s*(\d+)/);if(!m)return;var f=m[1]/m[2],C=2*Math.PI*14;
  c.insertAdjacentHTML('afterbegin','<svg class="em-ring" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="4"/><circle cx="17" cy="17" r="14" fill="none" stroke="#2B8F68" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(C*f)+' '+C+'" transform="rotate(-90 17 17)"/></svg>');});
 document.querySelectorAll('body *').forEach(function(e){if(!e.childNodes.length||e.closest('svg'))return;var has=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});if(!has)return;var cs=getComputedStyle(e),fs=parseFloat(cs.fontSize);if(fs<15)e.style.fontSize='15px';
  var c=cs.color.match(/\d+(\.\d+)?/g);if(c&&+c[0]>=60&&+c[0]<200&&Math.abs(c[0]-c[1])<20&&Math.abs(c[1]-c[2])<20)e.style.color='#ECEEF0';});}
 new MutationObserver(function(){clearTimeout(window.__emT);window.__emT=setTimeout(fix,60);}).observe(document.documentElement,{subtree:true,childList:true});})();
// ============ v36 To Do (p36): every car with Missing details, filled in place. Same completeness logic (msCount) and the same save path (editCurrentVehicle + saveVehicle). No DB change. ============
var TD={draft:{},saving:null};
var TD_IN={car:[{id:'v-year',l:'Year',t:'number',ph:'1968',im:'numeric'},{id:'v-make',l:'Make',t:'text',ph:'Porsche'},{id:'v-model',l:'Model',t:'text',ph:'912 Coupe'}],
 vin:[{id:'v-vin',l:'VIN / Chassis no.',t:'text',ph:'WP0ZZZ...',mono:1}],
 reg:[{id:'v-plate',l:'Registration (plate)',t:'text',ph:'K9 JOLLY',caps:1},{id:'v-plate-region',l:'State / region',t:'text',ph:'FL',opt:1}],
 color:[{id:'v-color',l:'Colour',t:'text',ph:'Aubergine'}],
 miles:[{id:'v-mileage',l:'Mileage (mi)',t:'number',ph:'52100',im:'numeric'}],
 paid:[{id:'v-purchase-price',l:'What you paid',t:'number',ph:'229000',im:'decimal'},{id:'v-currency',l:'Currency',t:'select',opts:[['USD','USD ($)'],['EUR','EUR (\u20ac)'],['GBP','GBP (\u00a3)']]}],
 loc:[{id:'v-location',l:'Location',t:'text',ph:'Hickory Vaults'}],
 ins:[{id:'v-insurer',l:'Insurance',t:'text',ph:'Chubb'}]};
function tdMissing(v){return msFieldsFor(v).filter(function(f){return !msValue(v,f);});}
function tdCars(){
  var vs=visibleVehicles().filter(function(v){return msCanSeeMissing(v)&&tdMissing(v).length>0;});
  var cl=getClients().map(function(c){return c.id;}),groups=[],gi={};
  var owners=[];vs.forEach(function(v){if(owners.indexOf(v.clientId)<0)owners.push(v.clientId);});
  owners.sort(function(a,b){return cl.indexOf(a)-cl.indexOf(b);});
  owners.forEach(function(o){poList(o).forEach(function(p){
    var mine=vs.filter(function(v){return v.clientId===o&&poOf(v,o).id===p.id;});if(!mine.length)return;
    var ordered=stApply(phSorted(activeVehicles(getVehicles()).filter(function(x){return x.clientId===o&&poOf(x,o).id===p.id;}))).filter(function(x){return mine.indexOf(x)>=0;});
    var c=byId(getClients(),o);groups.push({owner:o,pf:p,client:c,cars:ordered});});});
  return groups;
}
function tdCount(){try{if(!session)return 0;var n=0;tdCars().forEach(function(g){n+=g.cars.length;});return n;}catch(e){return 0;}}
function tdBadge(){var b=document.getElementById('todo-badge');if(!b)return;var n=tdCount();b.textContent=n;b.style.display=n?'':'none';
  var ni=document.querySelector('.nav-item[data-page="todo"]');if(ni)ni.setAttribute('aria-label','To Do'+(n?', '+n+' vehicle'+(n===1?'':'s')+' need details':''));}
function tdRing(d,t){var C=2*Math.PI*14,f=t?d/t:0;return '<svg class="em-ring td-ring" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="4"/><circle cx="17" cy="17" r="14" fill="none" stroke="#2B8F68" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(C*f)+' '+C+'" transform="rotate(-90 17 17)"/></svg>';}
function tdInput(v,f,s,solo){
  var key=v.id+'|'+s.id,cur=TD.draft.hasOwnProperty(key)?TD.draft[key]:(s.id==='v-currency'?(v.currency||'USD'):(s.id==='v-year'?(v.year||''):s.id==='v-make'?(v.make||''):s.id==='v-model'?(v.model||''):s.id==='v-plate-region'?(v.plateRegion||''):''));
  var fid='td-'+v.id.slice(-8)+'-'+s.id,a=' id="'+fid+'" data-v="'+esc(v.id)+'" data-in="'+s.id+'" oninput="tdDraft(this)" onchange="tdDraft(this)"';
  var el=s.t==='select'?'<select'+a+'>'+s.opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select>'
    :'<input type="'+s.t+'"'+a+(solo?' aria-label="'+esc(f.label)+'"':'')+' value="'+esc(String(cur))+'" placeholder="'+esc(s.ph?'e.g. '+s.ph:'')+'"'+(s.im?' inputmode="'+s.im+'" min="0"':'')+(s.caps?' autocapitalize="characters"':'')+' autocomplete="off"'+(s.mono?' class="mono"':'')+'>';
  return '<label class="td-f'+(solo?' td-solo':'')+'" for="'+fid+'"><span class="td-l">'+esc(s.l)+(s.opt?' <i>(optional)</i>':'')+'</span>'+el+'</label>';
}
function tdCard(v){
  var miss=tdMissing(v),c=msCount(v);
  var flds=miss.map(function(f){return '<div class="td-fld" data-f="'+f.k+'"><div class="td-fh"><span class="td-fn">'+esc(f.label)+'</span><span class="td-miss">Missing</span></div><div class="td-ins">'+(TD_IN[f.k]||[]).map(function(s){return tdInput(v,f,s,(TD_IN[f.k]||[]).length===1);}).join('')+'</div></div>';}).join('');
  return '<article class="td-card" data-v="'+esc(v.id)+'"><div class="td-head" onclick="openVehicleDetail(\''+esc(v.id)+'\')" role="button" tabindex="0" aria-label="Open '+esc(vFull(v))+'"><div class="td-th">'+phThumb(v)+'</div><div class="td-nm"><div class="td-name">'+esc(vFull(v).trim()||vName(v))+'</div>'+(v.nickname?'<div class="td-nick">'+esc(v.nickname)+'</div>':'')+'</div>'+
    '<div class="td-cnt" aria-label="'+c.done+' of '+c.total+' complete">'+tdRing(c.done,c.total)+'<span>'+c.done+' of '+c.total+'</span></div></div>'+
    '<div class="td-body">'+flds+'</div><div class="td-act"><button type="button" class="btn btn-primary td-save" onclick="tdSave(\''+esc(v.id)+'\')">Save '+(miss.length===1?'detail':'details')+'</button></div></article>';
}
function tdDraft(el){TD.draft[el.getAttribute('data-v')+'|'+el.getAttribute('data-in')]=el.value;}
function renderTodo(){
  var r=document.getElementById('todo-root');if(!r)return;var gs=tdCars(),n=0;gs.forEach(function(g){n+=g.cars.length;});
  var sub=document.getElementById('todo-sub');if(sub)sub.textContent=n?(n+' vehicle'+(n===1?' needs':'s need')+' details. Fill them in here.'):'Every vehicle has its key details on file.';
  if(!n){r.innerHTML='<div class="td-empty" role="status">'+tdRing(8,8)+'<div class="td-et">All records complete</div><div class="td-es">Every vehicle has its key details on file.</div></div>';tdBadge();return;}
  var multi=gs.length>1||isAdvisor();
  r.innerHTML=gs.map(function(g){var h=(isAdvisor()&&g.client?esc(g.client.name||'')+' \u00b7 ':'')+esc(g.pf.name);
    return '<section class="td-grp" aria-label="'+h+'">'+(multi||!g.pf.implicit?'<h2 class="td-gh">'+h+' <span>'+g.cars.length+'</span></h2>':'')+g.cars.map(tdCard).join('')+'</section>';}).join('');
  tdBadge();
}
function tdSave(id){
  var v=byId(getVehicles(),id);if(!v||!msCanSeeMissing(v))return;
  var card=document.querySelector('.td-card[data-v="'+id+'"]');if(!card)return;
  var ins=[].slice.call(card.querySelectorAll('[data-in]')),any=false;
  ins.forEach(function(el){if(el.tagName!=='SELECT'&&String(el.value).trim())any=true;});
  if(!any){showToast('Fill in at least one detail first','error');var f=card.querySelector('input');if(f)f.focus();return;}
  var prevCur=currentVehicleId;currentVehicleId=id;
  editCurrentVehicle();
  if(editingVehicleId!==id){currentVehicleId=prevCur;return;}
  ins.forEach(function(el){var x=String(el.value).trim();if(el.tagName==='SELECT'||x)setVal(el.getAttribute('data-in'),el.getAttribute('data-in')==='v-plate'?x.toUpperCase():x);});
  var before=msCount(v).done;
  saveVehicle();
  if(editingVehicleId===id){/* validation failed: keep the form closed, keep drafts */editingVehicleId=null;closeModal('modal-add-vehicle');return;}
  ins.forEach(function(el){delete TD.draft[id+'|'+el.getAttribute('data-in')];});
  var nv=byId(getVehicles(),id),c=nv?msCount(nv):{done:0,total:8};
  var tc=document.getElementById('toast-container');if(tc){[].slice.call(tc.querySelectorAll('.toast')).forEach(function(t){if(t.textContent==='Vehicle updated'||t.textContent==='Fill in at least one detail first')t.remove();});}
  showToast(vName(nv)+(c.done>=c.total?': all details complete':': saved, '+(c.total-c.done)+' still missing'),'success');
  if(!document.getElementById('page-todo').classList.contains('active'))showPage('todo');else renderTodo();
}
(function(){if(typeof updateRecBadge==='function'){var _u=updateRecBadge;updateRecBadge=function(){var r=_u.apply(this,arguments);try{tdBadge();}catch(e){}return r;};}})();
// ============ v37 headings (p37): eyebrow + hairline rule on every page header ============
var HD_EYEBROW={todo:'Records to complete',reminders:'Dates & renewals',clients:'Your clients','client-detail':'Client',valuations:'Market values',inspections:'Service history',expenses:'Ownership costs',documents:'Records vault',recommendations:'From your advisor',archives:'Past vehicles',audit:'Activity log',team:'Administration',access:'Who can see',"client-link":'Getting started'};
function hdDecorate(){
  document.querySelectorAll('.page').forEach(function(pg){var t=pg.querySelector('.page-header .page-title');if(!t||t.getAttribute('data-hd'))return;t.setAttribute('data-hd','1');
    var id=pg.id.replace(/^page-/,''),eb=HD_EYEBROW[id];
    if(eb){var e=document.createElement('div');e.className='hd-eyebrow';e.setAttribute('aria-hidden','true');e.textContent=eb;t.parentNode.insertBefore(e,t);}
    var r=document.createElement('div');r.className='hd-rule';r.setAttribute('aria-hidden','true');r.innerHTML='<i></i><b></b><i></i>';t.parentNode.insertBefore(r,t.nextSibling);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hdDecorate);else hdDecorate();
// ============ v38 collection crest (p38): THE / NAME / COLLECTION hero on owner Overview, client page and View-as. Real data only. ============
var CN_SUFFIX=/^(?:(the)\s+)?(.+?)\s+(collection|collective|garage|stable|motor\s+house|motorhouse|heritage|archive|estate)$/i;
function cnParse(t){t=String(t||'').trim();var m=t.match(CN_SUFFIX);if(m&&m[2]&&m[2].length>=2)return {the:m[1]||'',hero:m[2],suf:m[3]};
  var m2=t.match(/^(the)\s+(.+)$/i);if(m2)return {the:m2[1],hero:m2[2],suf:''};return {the:'',hero:t,suf:''};}
function cnMeta(c){
  if(!c)return '';var vs=getVehicles().filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);}),yrs=[];
  vs.forEach(function(v){[v.purchaseDate,v.createdAt].forEach(function(d){var y=parseInt(String(d||'').slice(0,4),10);if(y>1900&&y<3000)yrs.push(y);});});
  var cy=parseInt(String(c.createdAt||'').slice(0,4),10);if(cy>1900&&cy<3000)yrs.push(cy);
  var parts=[];if(yrs.length)parts.push('Est. '+Math.min.apply(null,yrs));
  parts.push(vs.length+' vehicle'+(vs.length===1?'':'s'));return parts.join(' \u00b7 ');
}
function cnSize(hero){var w=String(hero).split(/\s+/),lw=0;w.forEach(function(x){lw=Math.max(lw,x.length);});var n=hero.length;
  var fs=n<=12?46:n<=18?42:n<=26?38:34;if(lw>11)fs=Math.min(fs,Math.max(34,Math.floor(470/lw)));var ls=lw>13?'.06em':lw>10?'.1em':'.14em';return {fs:fs,ls:ls};}
function ctitleHTML(n,exact,c){
  var t=exact?String(n||'').trim():ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!exact&&!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  var p=cnParse(t),sz=cnSize(p.hero),meta=cnMeta(c);
  var rule='<div class="ctitle-rule cn-rule" aria-hidden="true"><i></i><b></b><i></i></div>';
  return '<div class="cn-crest"><div class="ctitle-eyebrow">Private Collection</div><div class="cn-top" aria-hidden="true"><i></i><b></b><i></i></div>'+
    '<h2 class="ctitle-name cn-name" style="font-size:'+sz.fs+'px">'+(p.the?'<span class="cn-the">'+esc(p.the)+'</span> ':'')+'<span class="cn-hero" style="letter-spacing:'+sz.ls+'">'+esc(p.hero)+'</span>'+(p.suf?' <span class="cn-suf">'+esc(p.suf)+'</span>':'')+'</h2>'+
    rule+(meta?'<div class="cn-meta">'+esc(meta)+'</div>':'')+'</div>';
}
function ctitleSet(id,n,exact,c){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n,exact,c);
  el.setAttribute('data-name',String(n||''));
  var hd=el.closest('.page-header');if(hd)hd.classList.add('cn-hd');
}
// ============ v39 logo (p39): loader ring = final dotted ring (Desi), centre = obsidian/emerald-star disc ============
EVR_D=[-306,-2020,79,100,135,-2021,77,100,-136,-1997,74,100,295,-1962,72,100,29,-1959,69,100,-566,-1938,75,100,-396,-1937,71,100,561,-1928,75,100,-230,-1921,67,100,187,-1906,64,100,446,-1888,68,100,-69,-1888,62,100,824,-1858,78,100,-643,-1844,68,100,-478,-1848,64,100,-317,-1837,58,100,85,-1843,57,100,336,-1841,60,100,704,-1836,72,100,-810,-1824,73,100,-159,-1810,53,100,588,-1804,63,100,-978,-1787,78,100,232,-1783,51,100,-9,-1771,47,100,475,-1763,55,100,-550,-1754,55,100,956,-1747,73,100,-711,-1744,60,100,-394,-1747,50,100,835,-1732,65,100,-872,-1719,66,100,-242,-1727,43,100,134,-1718,41,100,369,-1713,46,100,718,-1708,57,100,-1033,-1678,70,100,-96,-1692,36,100,604,-1674,49,100,-615,-1653,46,100,-768,-1640,53,100,-463,-1652,40,100,267,-1652,34,100,-1194,-1622,74,100,1073,-1626,68,100,1196,-1623,77,100,-315,-1635,31,100,494,-1629,39,100,953,-1620,61,100,-924,-1611,57,100,835,-1601,51,100,-1079,-1566,62,100,721,-1575,42,100,-668,-1549,35,100,-816,-1532,42,100,-1231,-1506,67,100,1177,-1497,63,100,-965,-1500,48,100,1058,-1498,56,100,1298,-1487,72,100,940,-1488,46,100,824,-1467,35,100,-1114,-1452,55,100,-1382,-1431,72,100,-1261,-1389,59,100,-996,-1387,38,100,1149,-1370,51,100,1269,-1362,58,100,1032,-1367,40,100,-1526,-1340,77,100,1385,-1344,67,100,-1139,-1337,45,100,1506,-1316,74,100,-1403,-1311,64,100,-1279,-1272,51,100,1109,-1240,32,100,1226,-1237,44,100,-1541,-1219,68,100,1343,-1222,55,100,-1153,-1220,32,100,1460,-1197,62,100,-1415,-1193,57,100,1575,-1161,69,100,-1287,-1154,40,100,1689,-1116,77,100,-1671,-1112,74,100,-1544,-1098,60,100,1287,-1098,37,100,1403,-1078,48,100,-1414,-1074,46,100,1517,-1047,57,100,1630,-1004,66,100,-1793,-990,78,100,-1667,-990,66,100,-1538,-979,53,100,1738,-952,73,100,-1405,-957,35,100,1448,-932,42,100,1559,-894,52,100,-1782,-868,72,100,-1654,-871,58,100,-1521,-862,44,100,1668,-846,61,100,1774,-788,69,100,1478,-786,34,100,-1760,-750,64,100,-1630,-754,48,100,-1886,-734,75,100,1586,-743,46,100,1874,-720,75,100,1691,-687,55,100,-1729,-634,55,100,-1596,-641,39,100,1793,-624,63,100,-1858,-616,67,100,1598,-592,39,100,1888,-550,71,100,1699,-531,50,100,-1688,-524,45,100,-1819,-502,59,100,-1943,-472,72,100,1979,-468,79,100,1795,-462,60,100,1594,-443,31,100,-1638,-417,34,100,-1772,-393,52,100,1886,-383,67,100,1691,-378,43,100,-1897,-359,65,100,-2017,-317,77,100,1971,-296,74,100,1783,-303,54,100,-1716,-290,42,100,-1844,-253,57,100,1868,-220,62,100,-1964,-206,70,100,1670,-229,36,100,-1780,-152,47,100,1757,-151,47,100,1947,-129,71,100,-1903,-103,62,100,1836,-63,57,100,-2017,-45,74,100,-1709,-58,37,100,2019,-29,76,100,-1834,-6,53,100,1717,-4,41,100,1908,32,65,100,-1949,55,67,100,-1757,85,44,100,1790,88,51,100,1973,136,73,100,-1873,148,59,100,1661,135,33,100,-1672,166,33,100,1856,187,59,100,-1980,220,71,100,1731,231,45,100,-1790,234,51,100,1914,292,68,100,-1897,309,64,100,-1701,311,39,100,1791,332,55,100,1659,363,37,100,-1995,390,76,100,-1810,391,56,100,1963,403,74,100,1841,441,63,100,-1907,474,69,100,-1715,462,46,100,1713,468,49,100,-1617,525,35,100,1883,553,70,100,-1814,551,61,100,1756,577,57,100,1624,592,42,100,-1716,617,52,100,-1902,642,73,100,1916,671,78,100,-1613,675,43,100,1792,692,65,100,-1804,714,66,100,1662,704,53,100,1526,704,36,100,-1700,775,58,100,-1881,813,76,100,1817,812,73,100,1690,820,60,100,1558,818,47,100,-1594,827,48,100,-1777,878,70,100,-1483,868,38,100,-1669,934,63,100,1444,920,40,100,1579,934,56,100,1706,939,69,100,-1560,978,54,100,-1447,1013,45,100,1324,1007,33,100,-1735,1042,74,100,1458,1037,49,100,-1331,1037,33,100,1588,1054,64,100,1715,1061,76,100,-1623,1091,67,100,-1509,1130,59,100,1332,1124,43,100,1461,1155,59,100,-1394,1159,51,100,1588,1175,71,100,-1278,1176,41,100,1200,1197,37,100,-1561,1247,72,100,1328,1242,53,100,-1444,1279,64,100,1454,1275,66,100,-1325,1301,56,100,-1209,1312,47,100,-1090,1312,35,100,1191,1314,48,100,1314,1360,61,100,1049,1372,40,100,1435,1396,74,100,-1482,1400,76,100,-1363,1424,70,100,-891,1419,30,100,906,1414,34,100,1169,1431,57,100,-1244,1439,61,100,-1124,1443,54,100,-1006,1436,42,100,1288,1479,71,100,1021,1486,51,100,872,1526,45,100,-794,1529,39,100,1137,1547,65,100,-1268,1563,74,100,-909,1554,50,100,722,1551,39,100,-1147,1571,67,100,-1026,1568,59,100,1253,1596,77,100,983,1599,60,100,-573,1592,34,100,-682,1633,46,100,827,1635,54,100,1095,1661,73,100,672,1657,48,100,-797,1664,56,100,369,1653,35,100,519,1662,42,100,-1158,1696,79,100,-1035,1696,71,100,-915,1685,64,100,-452,1680,42,100,6,1677,32,100,-220,1695,38,100,935,1709,68,100,-560,1728,52,100,148,1719,40,100,772,1741,64,100,298,1748,47,100,-82,1754,43,100,453,1761,52,100,612,1758,58,100,-673,1766,61,100,-320,1758,48,100,-790,1793,68,100,-911,1811,76,100,64,1801,51,100,876,1816,75,100,-427,1811,57,100,-179,1823,53,100,218,1834,57,100,708,1844,70,100,-536,1856,65,100,378,1852,62,100,542,1856,66,100,-281,1883,61,100,-28,1875,59,100,-653,1892,72,100,130,1914,65,100,-390,1935,70,100,294,1939,70,100,633,1941,78,100,-128,1942,67,100,462,1948,73,100,-504,1978,78,100,33,1988,71,100,-236,2001,74,100,201,2019,75,100];EVR.svg='';
(function(){var b=document.getElementById('boot-ring');if(b&&b.firstChild)b.innerHTML=evoRingSVG()+'<i class="evo-o"></i>';})();
// ============ v36b intro splash (p39b): the ring splash on every app open (cold start + home-screen launch) ============
// Root cause it vanished: #boot-loading started display:none and was only shown inside bootWithUser() while loadAll() ran,
// so signed-out opens never saw it and cached/fast signed-in opens saw it for a frame or two.
window.__EVO_INTRO=window.__EVO_INTRO||{t0:(window.performance&&performance.timeOrigin)?Math.round(performance.timeOrigin):Date.now(),done:false,want:false};
var _evoShowLoading=showLoading;
showLoading=function(on,msg){
  var I=window.__EVO_INTRO,el=document.getElementById('boot-loading');if(!el)return;
  var t=document.getElementById('boot-loading-text');if(t&&msg)t.textContent=msg;
  if(!I.done){I.want=!!on;return;}   // keep the intro up; remember what boot wants
  if(on){clearTimeout(I.ft);el.classList.remove('evo-fade');el.style.display='flex';return;}
  if(el.style.display==='none')return;
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){el.style.display='none';return;}
  el.classList.add('evo-fade');clearTimeout(I.ft);I.ft=setTimeout(function(){el.style.display='none';el.classList.remove('evo-fade');},520);
};
(function(){
  var I=window.__EVO_INTRO,MIN=1700,left=Math.max(0,MIN-(Date.now()-I.t0));
  setTimeout(function(){I.done=true;var el=document.getElementById('boot-loading');
    if(I.want){if(el)el.classList.remove('evo-intro');}       // data still loading: stays as the loading screen, hides when loadAll ends
    else showLoading(false);                                  // smooth fade into sign-in or the app
  },left);
})();
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
// v41 (p41): roles, estimates, tech dashboard, worldwide portfolios, vehicle conversation, filtered activity.
// Server rules live in migration_023. Without that migration the new writes say so and the old screens keep working.
var HX={on:null,rows:[]};
var ISO_PAIRS="AF:Afghanistan,AX:\u00c5land Islands,AL:Albania,DZ:Algeria,AS:American Samoa,AD:Andorra,AO:Angola,AI:Anguilla,AQ:Antarctica,AG:Antigua and Barbuda,AR:Argentina,AM:Armenia,AW:Aruba,AU:Australia,AT:Austria,AZ:Azerbaijan,BS:Bahamas,BH:Bahrain,BD:Bangladesh,BB:Barbados,BY:Belarus,BE:Belgium,BZ:Belize,BJ:Benin,BM:Bermuda,BT:Bhutan,BO:Bolivia  Plurinational State of,BQ:Bonaire  Sint Eustatius and Saba,BA:Bosnia and Herzegovina,BW:Botswana,BV:Bouvet Island,BR:Brazil,IO:British Indian Ocean Territory,BN:Brunei Darussalam,BG:Bulgaria,BF:Burkina Faso,BI:Burundi,CV:Cabo Verde,KH:Cambodia,CM:Cameroon,CA:Canada,KY:Cayman Islands,CF:Central African Republic,TD:Chad,CL:Chile,CN:China,CX:Christmas Island,CC:Cocos (Keeling) Islands,CO:Colombia,KM:Comoros,CG:Congo,CD:Congo  Democratic Republic of the,CK:Cook Islands,CR:Costa Rica,CI:C\u00f4te d'Ivoire,HR:Croatia,CU:Cuba,CW:Cura\u00e7ao,CY:Cyprus,CZ:Czechia,DK:Denmark,DJ:Djibouti,DM:Dominica,DO:Dominican Republic,EC:Ecuador,EG:Egypt,SV:El Salvador,GQ:Equatorial Guinea,ER:Eritrea,EE:Estonia,SZ:Eswatini,ET:Ethiopia,FK:Falkland Islands (Malvinas),FO:Faroe Islands,FJ:Fiji,FI:Finland,FR:France,GF:French Guiana,PF:French Polynesia,TF:French Southern Territories,GA:Gabon,GM:Gambia,GE:Georgia,DE:Germany,GH:Ghana,GI:Gibraltar,GR:Greece,GL:Greenland,GD:Grenada,GP:Guadeloupe,GU:Guam,GT:Guatemala,GG:Guernsey,GN:Guinea,GW:Guinea-Bissau,GY:Guyana,HT:Haiti,HM:Heard Island and McDonald Islands,VA:Holy See,HN:Honduras,HK:Hong Kong,HU:Hungary,IS:Iceland,IN:India,ID:Indonesia,IR:Iran  Islamic Republic of,IQ:Iraq,IE:Ireland,IM:Isle of Man,IL:Israel,IT:Italy,JM:Jamaica,JP:Japan,JE:Jersey,JO:Jordan,KZ:Kazakhstan,KE:Kenya,KI:Kiribati,KP:Korea  Democratic People's Republic of,KR:Korea  Republic of,KW:Kuwait,KG:Kyrgyzstan,LA:Lao People's Democratic Republic,LV:Latvia,LB:Lebanon,LS:Lesotho,LR:Liberia,LY:Libya,LI:Liechtenstein,LT:Lithuania,LU:Luxembourg,MO:Macao,MG:Madagascar,MW:Malawi,MY:Malaysia,MV:Maldives,ML:Mali,MT:Malta,MH:Marshall Islands,MQ:Martinique,MR:Mauritania,MU:Mauritius,YT:Mayotte,MX:Mexico,FM:Micronesia  Federated States of,MD:Moldova  Republic of,MC:Monaco,MN:Mongolia,ME:Montenegro,MS:Montserrat,MA:Morocco,MZ:Mozambique,MM:Myanmar,NA:Namibia,NR:Nauru,NP:Nepal,NL:Netherlands  Kingdom of the,NC:New Caledonia,NZ:New Zealand,NI:Nicaragua,NE:Niger,NG:Nigeria,NU:Niue,NF:Norfolk Island,MK:North Macedonia,MP:Northern Mariana Islands,NO:Norway,OM:Oman,PK:Pakistan,PW:Palau,PS:Palestine  State of,PA:Panama,PG:Papua New Guinea,PY:Paraguay,PE:Peru,PH:Philippines,PN:Pitcairn,PL:Poland,PT:Portugal,PR:Puerto Rico,QA:Qatar,RE:R\u00e9union,RO:Romania,RU:Russian Federation,RW:Rwanda,BL:Saint Barth\u00e9lemy,SH:Saint Helena  Ascension and Tristan da Cunha,KN:Saint Kitts and Nevis,LC:Saint Lucia,MF:Saint Martin (French part),PM:Saint Pierre and Miquelon,VC:Saint Vincent and the Grenadines,WS:Samoa,SM:San Marino,ST:Sao Tome and Principe,SA:Saudi Arabia,SN:Senegal,RS:Serbia,SC:Seychelles,SL:Sierra Leone,SG:Singapore,SX:Sint Maarten (Dutch part),SK:Slovakia,SI:Slovenia,SB:Solomon Islands,SO:Somalia,ZA:South Africa,GS:South Georgia and the South Sandwich Islands,SS:South Sudan,ES:Spain,LK:Sri Lanka,SD:Sudan,SR:Suriname,SJ:Svalbard and Jan Mayen,SE:Sweden,CH:Switzerland,SY:Syrian Arab Republic,TW:Taiwan  Province of China,TJ:Tajikistan,TZ:Tanzania  United Republic of,TH:Thailand,TL:Timor-Leste,TG:Togo,TK:Tokelau,TO:Tonga,TT:Trinidad and Tobago,TN:Tunisia,TR:T\u00fcrkiye,TM:Turkmenistan,TC:Turks and Caicos Islands,TV:Tuvalu,UG:Uganda,UA:Ukraine,AE:United Arab Emirates,GB:United Kingdom of Great Britain and Northern Ireland,US:United States of America,UM:United States Minor Outlying Islands,UY:Uruguay,UZ:Uzbekistan,VU:Vanuatu,VE:Venezuela  Bolivarian Republic of,VN:Viet Nam,VG:Virgin Islands (British),VI:Virgin Islands (U.S.),WF:Wallis and Futuna,EH:Western Sahara,YE:Yemen,ZM:Zambia,ZW:Zimbabwe";
function canUploadPhotos(v){
  if(!v||!can(v,'view_photos'))return false;
  var row=C.vis&&C.vis[v.id];
  if(row&&row.can_upload_photos===false)return false;
  return true;
}
function canReviewScan(v){
  if(!v)return false;
  if(canEditVehicle(v)||(typeof realAdmin==='function'&&realAdmin())||(typeof managedMine==='function'&&managedMine(v.clientId)))return true;
  if(!can(v,'can_add_documents'))return false;
  var row=C.vis&&C.vis[v.id];
  if(row&&row.can_scan_documents===false)return false;
  return true;
}
function coRank(){
  if(!session||!isOwner())return '';
  if(typeof CO==='undefined'||CO.on==null)return '';
  if(!CO.of)return 'primary';
  var me0=myId(),m=(CO.rows||[]).filter(function(x){return x.user_id===me0;})[0];
  return (m&&m.management)||'full';
}
(function(){
  var prev=canEditVehicle;
  canEditVehicle=function(v){
    if(!prev(v))return false;
    if(coRank()==='limited')return false;
    return true;
  };
})();
(function(){
  if(typeof PERM_LABELS==='undefined')return;
  var add=PERM_LABELS.filter(function(g){return g[0]==='add';})[0];
  if(!add)return;
  [['can_upload_photos','Upload photos'],['can_scan_documents','Reviewed document scan'],['can_add_reminders','Add date and mileage reminders'],['can_send_estimates','Send a formal estimate']].forEach(function(p){
    if(!add[2].some(function(x){return x[0]===p[0];}))add[2].push(p);
  });
  var see=PERM_LABELS.filter(function(g){return g[0]==='view';})[0];
  if(see)see[2].forEach(function(x){if(x[0]==='view_photos')x[1]='Photos';});
})();
function invAll(box){
  [].slice.call(document.querySelectorAll('.inv-car')).forEach(function(c){c.checked=false;c.disabled=!!box.checked;});
}
(function(){
  var legacy=createInviteFromAccess;
  createInviteFromAccess=function(){
    var allEl=document.getElementById('inv-all');
    var picked=[].slice.call(document.querySelectorAll('.inv-car:checked')).map(function(x){return x.value;});
    if(!allEl||(!allEl.checked&&!picked.length))return legacy();
    var email=normEmail(val('inv-email'));
    if(!email||!validEmail(email)){showToast('Enter your tech\'s email address','error');return;}
    var all=!!allEl.checked;
    sb.rpc('create_tech_invite',{p_vehicle_ids:all?null:picked,p_all:all,p_email:email,p_perms:null}).then(function(r){
      if(r.error){
        if(typeof rpcMissing==='function'&&rpcMissing(r.error)){showToast('Choosing several vehicles needs one backend update. Use the list above for a single car until then.','error');return;}
        throw r.error;
      }
      var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
      if(!row||!row.code)throw new Error('no code returned');
      saveInviteCode(row.invite_id,row.code);
      showInviteResult({title:'Tech invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:all?'Access to all of your vehicles':('Access to '+picked.length+' vehicle'+(picked.length===1?'':'s')),help:'Share this code privately. You choose what they can see after they join.'});
      return loadAll().then(function(){renderAccess();});
    }).catch(function(e){showToast(friendlyError(e),'error');});
  };
  var prevAccess=renderAccess;
  renderAccess=function(){
    prevAccess();
    var sel=document.getElementById('inv-scope');
    if(!sel||document.getElementById('inv-cars'))return;
    var oid=ownerClientId()||myId();
    var cars=(C.vehicles||[]).filter(function(v){return v.clientId===oid&&!v.archived;});
    var box=document.createElement('div');
    box.id='inv-cars';box.className='inv-cars';
    box.innerHTML='<div class="lab">Vehicles this person may open</div>'
      +'<label class="tgl"><input type="checkbox" id="inv-all" onchange="invAll(this)"><span class="tgl-ui"></span><span class="tgl-t">All vehicles</span></label>'
      +cars.map(function(v){return '<label class="tgl"><input type="checkbox" class="inv-car" value="'+esc(v.id)+'"><span class="tgl-ui"></span><span class="tgl-t">'+esc(vFull(v))+'</span></label>';}).join('');
    sel.parentNode.insertAdjacentElement('afterend', box);
  };
})();
(function(){
  var prevHTML=coSectionHTML;
  coSectionHTML=function(){
    var h=prevHTML();
    if(!h)return h;
    h=h.replace('Co-owners have their own login and the same owner rights over every vehicle in this collection: photos, documents, values, reminders, team and transfers.',
      'Full management can run the collection with you. Only you, the original owner, can invite another co-owner. Limited management can look, comment, and ask a question on an estimate. It cannot see title documents unless you turn that on, and it cannot change vehicles, permissions, or invites.');
    if(coRank()==='primary'){
      h=h.replace('onclick="coInvite()">Invite co-owner</button>',
        'onclick="coInvite(\'full\')">Invite with full management</button><button class="btn" type="button" id="co-invite-lim" onclick="coInvite(\'limited\')">Invite with limited management</button>');
    } else {
      h=h.replace(/<div class="co-acts"><button class="btn btn-primary" type="button" id="co-invite-btn"[\s\S]*?<\/div>/,'');
    }
    return h;
  };
  coInvite=function(mgmt){
    mgmt=mgmt||'full';
    if(CO.busy)return;
    if(coRank()!=='primary'){showToast('Only the original owner can invite a co-owner.','error');return;}
    if(CO.on===false){showToast('Co-owners need one backend update first.','error');return;}
    CO.busy=true;
    sb.rpc('create_co_owner_invite',{p_email:null,p_management:mgmt}).then(function(r){
      if(r.error){
        if(typeof rpcMissing==='function'&&rpcMissing(r.error)){CO.on=false;CO.busy=false;showToast('Co-owner management needs one backend update first.','error');coRender();return;}
        throw r.error;
      }
      var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
      if(!row||!row.code)throw new Error('no code returned');
      CO.lastCode=codeKey(row.code);saveInviteCode(row.invite_id,row.code);CO.lastMgmt=mgmt;
      CO.busy=false;coRender();
      var el=document.getElementById('co-code');if(el)el.scrollIntoView({block:'center'});
    }).catch(function(e){CO.busy=false;showToast(friendlyError(e),'error');});
  };
})();
(function(){
  IM_COUNTRIES=[['','No country']].concat(ISO_PAIRS.split(',').map(function(s){var i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
  var prev=imRender;
  imRender=function(){
    prev();
    var sel=document.getElementById('im-np-country');
    if(!sel||document.getElementById('pf-world-note'))return;
    sel.insertAdjacentHTML('afterend','<p class="pf-world" id="pf-world-note">A portfolio can sit in any country. Adding one does not move service dates or mileage reminders, and it does not change who can see a car.</p>');
  };
})();
function rqMoney(r){
  var n=Number(r.price_amount);
  if(!isFinite(n))return '';
  return (r.price_currency?r.price_currency+' ':'')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function rqEstimateCard(r){
  var staff=rqCanStaff(),v=byId(getVehicles(),r.vehicle_id),id=jsId(r.id),dec=r.decision||'pending',done=r.status==='done';
  var when=r.proposed_start?fmtDateTime(r.proposed_start):'Time not set';
  var acts='';
  if(dec==='advisor_removed'&&!done&&r.status!=='declined'){
    acts='<p class="od-lead">Advisor removed. This estimate is no longer a live decision.</p>'+(staff?'':'<div class="rq-acts"><button type="button" class="btn" onclick="rqDismissRemoved(this)">Dismiss</button></div>');
  } else if(!staff&&coRank()==='limited'&&!done&&dec!=='approved'&&dec!=='denied'){
    acts='<div class="rq-acts"><button type="button" class="btn" onclick="rqAsk(this)">Ask a question</button></div>';
  } else if(!staff&&!done&&dec!=='approved'&&dec!=='denied'&&dec!=='advisor_removed'){
    acts='<div class="rq-acts"><button type="button" class="btn btn-primary" onclick="rqDecide(this,\'approved\')">Approve</button><button type="button" class="btn" onclick="rqDecide(this,\'denied\')">Deny</button><button type="button" class="btn" onclick="rqAsk(this)">Ask a question</button></div>';
  } else if(staff&&dec==='approved'&&!done){
    acts='<div class="rq-acts"><button type="button" class="btn btn-primary" onclick="rqCompleteOpen(this)">Mark job complete</button></div>';
  }
  if(RQ.open[r.id]==='ask'){
    acts='<div class="rq-inline"><label class="rq-lab" for="rq-ask-'+id+'">Question</label><textarea id="rq-ask-'+id+'" rows="3" placeholder="Ask in the linked conversation"></textarea><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqDecide(this,\'question\')">Send question</button></div></div>';
  }
  if(RQ.open[r.id]==='done'){
    acts='<div class="rq-inline"><label class="rq-lab" for="rq-note-'+id+'">What was done</label><textarea id="rq-note-'+id+'" rows="3" placeholder="Work completed, no customer personal details"></textarea><label class="rq-lab" for="rq-mi-'+id+'">Mileage now</label><input id="rq-mi-'+id+'" inputmode="numeric" placeholder="Optional"><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqComplete(this)">Archive into the vehicle history</button></div></div>';
  }
  return '<article class="rq-card rq-est" data-id="'+id+'" data-kind="estimate"><div class="rq-kicker">Estimate</div>'
    +'<div class="rq-top"><div class="rq-who">'+(staff?'<div class="rq-cl">'+esc(rqClientName(r.owner_id))+'</div>':'')+'<div class="rq-veh">'+esc(v?(v.nickname||vFull(v)):'Vehicle')+'</div></div><span class="rq-pill">'+esc(done?'Complete':(dec==='advisor_removed'?'Advisor removed':dec==='approved'?'Approved':dec==='denied'?'Denied':dec==='question'?'Question':'Pending'))+'</span></div>'
    +'<dl class="rq-dl"><div><dt>Work</dt><dd>'+esc(r.work_summary||'')+'</dd></div>'
    +'<div><dt>Price</dt><dd>'+esc(rqMoney(r))+'</dd></div>'
    +'<div><dt>Proposed</dt><dd>'+esc(when)+(r.proposed_tz?' '+esc(r.proposed_tz):'')+'</dd></div>'
    +'<div><dt>Duration</dt><dd>'+esc(r.duration_minutes? (r.duration_minutes+' minutes'):'')+'</dd></div>'
    +(r.completion_note?'<div><dt>Completed</dt><dd>'+esc(r.completion_note)+'</dd></div>':'')
    +'</dl>'+acts+'</article>';
}
(function(){
  var prevCard=rqCard;
  rqCard=function(r){if(r&&r.request_kind==='estimate')return rqEstimateCard(r);return prevCard(r);};
  var prev=renderRequests;
  renderRequests=function(){
    prev();
    var act=document.getElementById('rq-actions');
    if(act&&rqCanStaff()&&canAny('can_send_estimates')&&!document.getElementById('rq-est-btn')){
      act.insertAdjacentHTML('afterbegin','<button class="btn btn-primary" id="rq-est-btn" type="button" onclick="rqOpenEstimate()">Send an estimate</button>');
    }
  };
})();
function rqZones(){
  var z=['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Rome','Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland'];
  try{var mine=Intl.DateTimeFormat().resolvedOptions().timeZone;if(mine&&z.indexOf(mine)<0)z.unshift(mine);}catch(e){}
  return z;
}
function rqOpenEstimate(){
  if(!rqCanStaff())return;
  var vs=visibleVehicles();
  if(!vs.length){showToast('No authorized vehicles yet.','error');return;}
  var zones=rqZones();
  elHTML('rq-form',
    '<div class="rq-intro">A formal estimate stays on this request. The owner can approve, deny, or ask a question in the linked conversation. No price is suggested.</div>'
    +'<div class="rq-lab">Vehicle</div><select id="rq-ev" class="rq-in">'+vs.map(function(v){return '<option value="'+esc(v.id)+'">'+esc(v.nickname||vFull(v))+'</option>';}).join('')+'</select>'
    +'<label class="rq-lab" for="rq-work">Exact work</label><textarea id="rq-work" rows="4" maxlength="1000" placeholder="What you will do"></textarea>'
    +'<div class="rq-row2"><div class="rq-f"><label class="rq-lab" for="rq-price">Price</label><input id="rq-price" inputmode="decimal" placeholder="Amount"></div><div class="rq-f"><label class="rq-lab" for="rq-cur">Currency</label><input id="rq-cur" maxlength="3" placeholder="USD" value="USD"></div></div>'
    +'<div class="rq-row2"><div class="rq-f"><label class="rq-lab" for="rq-when">Proposed start</label><input id="rq-when" type="datetime-local"></div><div class="rq-f"><label class="rq-lab" for="rq-tz">Timezone</label><select id="rq-tz">'+zones.map(function(z){return '<option>'+esc(z)+'</option>';}).join('')+'</select></div></div>'
    +'<label class="rq-lab" for="rq-dur">Estimated duration in minutes</label><input id="rq-dur" inputmode="numeric" placeholder="120">'
    +'<div class="rq-acts rq-foot"><button type="button" class="btn" onclick="closeModal(\'modal-req\')">Cancel</button><button type="button" class="btn btn-primary" id="rq-est-send" onclick="rqSendEstimate()">Send estimate</button></div>');
  var t=document.getElementById('rq-mt');if(t)t.textContent='Send an estimate';
  openModal('modal-req');
}
async function rqSendEstimate(){
  var btn=document.getElementById('rq-est-send');if(btn&&btn.disabled)return;
  var v=byId(visibleVehicles(),val('rq-ev'));
  var work=String(val('rq-work')||'').trim();
  var price=Number(String(val('rq-price')||'').replace(/,/g,''));
  var cur=String(val('rq-cur')||'').trim().toUpperCase();
  var when=val('rq-when'),tz=val('rq-tz')||'UTC',dur=parseInt(val('rq-dur'),10);
  if(!v){showToast('Choose a vehicle','error');return;}
  if(work.length<3){showToast('Describe the exact work','error');return;}
  if(!isFinite(price)||price<0){showToast('Enter the price you are offering','error');return;}
  if(!/^[A-Z]{3}$/.test(cur)){showToast('Use a 3-letter currency code','error');return;}
  if(!when){showToast('Choose a proposed date and time','error');return;}
  if(!dur||dur<15){showToast('Enter a duration of at least 15 minutes','error');return;}
  var start=new Date(when);
  if(isNaN(start.getTime())){showToast('That date and time is not valid','error');return;}
  var row={id:rqId(),owner_id:v.clientId,vehicle_id:v.id,created_by:rqUid(),assigned_tech:rqUid(),service:'maintenance',request_kind:'estimate',work_summary:work,price_amount:price,price_currency:cur,proposed_start:start.toISOString(),proposed_tz:tz,duration_minutes:dur,decision:'pending',status:'new'};
  if(btn){btn.disabled=true;btn.textContent='Sending';}
  try{
    var r=await sb.from('service_requests').insert(row).select();
    if(r.error||!(r.data&&r.data.length)){showToast(rqMissing(r.error)?'Estimates need one backend update':'Could not send the estimate','error');return;}
    RQ.rows.unshift(r.data[0]);
    closeModal('modal-req');
    showToast('Estimate sent. The owner has an official notice.');
    renderRequests();
  }finally{if(btn){btn.disabled=false;btn.textContent='Send estimate';}}
}
async function rqDecide(btn,decision){
  var card=btn.closest('.rq-card');if(!card)return;
  var id=card.dataset.id;
  if(decision==='question'&&RQ.open[id]!=='ask'){RQ.open[id]='ask';renderRequests();return;}
  var q=decision==='question'?String((document.getElementById('rq-ask-'+id)||{}).value||'').trim():null;
  if(decision==='question'&&!q){showToast('Write the question first','error');return;}
  var r=await sb.rpc('decide_estimate',{p_id:id,p_decision:decision,p_question:q});
  if(r.error){showToast(rqMissing(r.error)?'Decisions need one backend update':friendlyError(r.error),'error');return;}
  var row=byId(RQ.rows,id);
  if(row){row.decision=decision;if(decision==='approved')row.status='accepted';if(decision==='denied')row.status='declined';}
  delete RQ.open[id];
  showToast(decision==='approved'?'Estimate approved':decision==='denied'?'Estimate denied':'Question sent in the conversation');
  renderRequests();
}
function rqAsk(btn){var card=btn.closest('.rq-card');if(!card)return;RQ.open[card.dataset.id]='ask';renderRequests();}
function rqCompleteOpen(btn){var card=btn.closest('.rq-card');if(!card)return;RQ.open[card.dataset.id]='done';renderRequests();}
async function rqComplete(btn){
  var card=btn.closest('.rq-card');if(!card)return;
  var id=card.dataset.id;
  var note=String((document.getElementById('rq-note-'+id)||{}).value||'').trim();
  var mi=String((document.getElementById('rq-mi-'+id)||{}).value||'').trim();
  var mileage=mi?parseInt(mi,10):null;
  if(mi&&(!isFinite(mileage)||mileage<0)){showToast('Mileage must be a number','error');return;}
  if(note.length<3){showToast('Describe what was completed','error');return;}
  var r=await sb.rpc('complete_service_job',{p_id:id,p_note:note,p_mileage:mileage});
  if(r.error){showToast(rqMissing(r.error)?'Completion needs one backend update':friendlyError(r.error),'error');return;}
  var row=byId(RQ.rows,id);
  if(row){row.status='done';row.completion_note=note;row.history_id=r.data&&r.data.history_id;}
  delete RQ.open[id];
  showToast('Job archived into the vehicle history');
  renderRequests();
}
function tdRender(){
  if(!session||!isAdvisor())return;
  var page=document.getElementById('page-dashboard');if(!page)return;
  var host=document.getElementById('td-board');
  if(!host){
    host=document.createElement('section');
    host.id='td-board';host.className='td-board';
    var anchor=document.getElementById('dash-empty')||page.firstChild;
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(host, anchor.nextSibling);
    else page.insertBefore(host, page.firstChild);
  }
  var clients=getClients().filter(function(c){return c&&c.id;});
  var openE=RQ.rows.filter(function(r){return r.request_kind==='estimate'&&r.status!=='done'&&r.decision!=='denied';});
  var h='<div class="td-kicker">Authorized clients</div><h2 class="td-h">Across your clients</h2>';
  if(!clients.length)h+='<p class="td-empty">No clients yet. Invite a client or add one you manage. Each collection stays private from the others.</p>';
  else h+='<div class="td-grid">'+clients.map(function(c){
    var vs=getVehicles().filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);});
    var n=openE.filter(function(r){return r.owner_id===c.id;}).length;
    var on=window.TDASH&&window.TDASH.client===c.id;
    return '<button type="button" class="td-card'+(on?' td-on':'')+'" onclick="tdPickClient(\''+jsId(c.id)+'\')"><span class="td-name">'+esc(c.name||'Client')+'</span><span class="td-meta">'+vs.length+' vehicle'+(vs.length===1?'':'s')+(n?' / '+n+' open estimate'+(n===1?'':'s'):'')+'</span></button>';
  }).join('')+'</div>';
  host.innerHTML=h;
}
(function(){
  var prev=renderDashboard;
  renderDashboard=function(){prev();tdRender();};
})();
function overviewActivity(owner){
  var cid=ownerClientId();
  var base=auditFor(function(e){
    if(owner)return e.clientId===cid&&e.ownerVisible!==false;
    if(!e.vehicleId)return true;
    var v=byId(getVehicles(),e.vehicleId);
    if(!v)return false;
    return !!(can(v,'view_service_records')||can(v,'view_documents')||can(v,'view_reminders')||can(v,'view_photos')||can(v,'view_expenses'));
  },12);
  var extra=(HX.rows||[]).filter(function(h){
    var v=byId(getVehicles(),h.vehicle_id);if(!v)return false;
    if(owner)return v.clientId===cid;
    if(h.kind==='reminder')return can(v,'view_reminders');
    if(h.kind==='field_change')return can(v,'view_service_records');
    return can(v,'view_service_records')||can(v,'can_add_service');
  }).map(function(h){return {at:h.created_at,actor:'Record',role:'system',text:h.summary,clientId:h.owner_id,vehicleId:h.vehicle_id,ownerVisible:true};});
  return base.concat(extra).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));}).slice(0,8);
}
async function hxLoad(){
  if(!sb||!session||HX.busy)return;
  HX.busy=true;
  try{
    var r=await sb.from('vehicle_history').select('*').order('created_at',{ascending:false}).limit(80);
    if(r.error){HX.on=false;HX.rows=[];}
    else{HX.on=true;HX.rows=r.data||[];}
  }catch(e){HX.on=false;}
  HX.busy=false;
}
(function(){
  var prev=renderOverview;
  renderOverview=function(owner,vehicles){
    prev(owner,vehicles);
    hxLoad();
    tdRender();
    odRender();
    covLoad();
    if(sb&&session&&!window.__NT_CLEAR){window.__NT_CLEAR=1;sb.rpc('clear_expired_notices').then(function(){},function(){});}
  };
})();
function vxRender(vid){
  var v=byId(getVehicles(),vid);if(!v)return;
  var host=document.getElementById('vx-sec');
  if(!host){
    host=document.createElement('section');
    host.id='vx-sec';host.className='dsec vx-sec';
    var doc=document.getElementById('vd-doc');
    if(doc&&doc.parentNode)doc.parentNode.insertBefore(host, doc.nextSibling);
  }
  var rows=(CM.rows||[]).filter(function(c){return c.vehicle_id===vid;});
  host.innerHTML='<div class="sh first"><h2>Conversation</h2></div><p class="vx-lead">Messages linked to this vehicle. They stay with the car, including after a job is archived.</p>'
    +(rows.length?rows.slice(-8).map(function(c){return '<div class="cm-msg"><div class="cm-body">'+esc(c.body)+'</div><div class="cm-meta">'+esc(fmtDateTime(c.created_at))+'</div></div>';}).join(''):'<p class="vx-lead">No messages on this vehicle yet.</p>')
    +'<div class="rq-inline"><label class="rq-lab" for="vx-body">Message</label><textarea id="vx-body" rows="3" placeholder="Write to the people authorized on this vehicle"></textarea><div class="rq-acts"><button type="button" class="btn btn-primary" onclick="vxSend(\''+jsId(vid)+'\')">Send</button></div></div>'
    +'<div class="sh"><h2>Change history</h2></div><div id="vx-hist"></div>';
  var hist=(HX.rows||[]).filter(function(h){return h.vehicle_id===vid;});
  var box=document.getElementById('vx-hist');
  if(box)box.innerHTML=hist.length?hist.slice(0,8).map(function(h){return '<div class="vx-row"><b>'+esc(h.summary)+'</b><span>'+esc(fmtDateTime(h.created_at))+'</span></div>';}).join(''):'<p class="vx-lead">Mileage, reminders, estimates and completed jobs are listed here when the history update is on.</p>';
}
async function vxSend(vid){
  var v=byId(getVehicles(),vid);if(!v)return;
  var t=String((document.getElementById('vx-body')||{}).value||'').trim();
  if(!t){showToast('Write a message first','error');return;}
  if(await cmPost(v.clientId,t,v.id,null))vxRender(vid);
}
(function(){
  var prev=openVehicleDetail;
  openVehicleDetail=function(id){var r=prev(id);vxRender(id);return r;};
})();
function odRender(){
  if(!session||!isOwner())return;
  var cm=document.getElementById('cp-cm-sec');if(!cm)return;
  var host=document.getElementById('cp-decide');
  if(!host){host=document.createElement('section');host.id='cp-decide';host.className='sec od-band';cm.parentNode.insertBefore(host,cm);}
  var cid=ownerClientId();
  var rows=(typeof RQ!=='undefined'?RQ.rows:[]).filter(function(r){
    return r.owner_id===cid&&r.request_kind==='estimate'&&r.status!=='done'&&r.status!=='declined'&&r.decision!=='approved'&&r.decision!=='denied';
  });
  var h='<p class="od-eye">Needs your decision</p><h2>Pending decisions</h2>';
  if(!rows.length)h+='<p class="od-lead">Nothing is waiting. Estimates from your advisor appear here, between the collection tabs and comments.</p>';
  else h+=rows.map(rqEstimateCard).join('');
  host.innerHTML=h;
}
function covPaint(rows){
  if(!session||!isOwner())return;
  var cm=document.getElementById('cp-cm-sec');if(!cm)return;
  var host=document.getElementById('cp-cov');
  if(!host){
    host=document.createElement('section');host.id='cp-cov';host.className='sec od-band';
    var band=document.getElementById('cp-decide');
    (band||cm).parentNode.insertBefore(host, band||cm);
  }
  rows=rows||[];
  if(!rows.length){host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  host.innerHTML='<p class="od-eye">Notice</p><h2>Already covered</h2>'+rows.map(function(n){return '<p class="od-lead">'+esc(n.body||n.title||'This vehicle is already covered, so a second coverage was not started.')+'</p>';}).join('');
}
async function covLoad(){
  if(!sb||!session||!isOwner())return;
  try{
    var r=await sb.from('notifications').select('*').eq('kind','coverage_blocked').order('created_at',{ascending:false}).limit(5);
    if(!r.error)covPaint(r.data||[]);
  }catch(e){}
}
(function(){
  if(typeof p40Refresh==='function'){var prev=p40Refresh;p40Refresh=function(){prev();odRender();};}
  var prevSave=saveVehicle;
  saveVehicle=function(){
    var vin=String(val('v-vin')||'').replace(/\s+/g,'').toUpperCase();
    prevSave();
    if(!vin||!sb||!sb.rpc)return;
    sb.rpc('claim_vehicle_coverage',{p_vin:vin,p_vehicle_id:null}).then(function(r){
      if(r.error||!r.data||r.data.ok!==false)return;
      covPaint([r.data]);
      showToast(r.data.body||'This vehicle is already covered, so a second coverage was not started.','error');
      if(typeof reloadAll==='function')reloadAll(true);
    },function(){});
  };
  var prevCo=coRender;
  coRender=function(){
    prevCo();
    if(coRank()!=='primary')return;
    (CO.rows||[]).forEach(function(m){
      var row=document.querySelector('.co-row[data-co="'+m.user_id+'"]');
      if(!row||row.querySelector('.co-mgmt'))return;
      var on=!!m.see_title_documents;
      var mgmt=m.management||'full';
      row.insertAdjacentHTML('beforeend',
        '<div class="co-tools"><label class="co-mgmt">Management <select aria-label="Management" onchange="coMgmt(this,\''+jsId(m.user_id)+'\')"><option value="full"'+(mgmt==='full'?' selected':'')+'>Full</option><option value="limited"'+(mgmt==='limited'?' selected':'')+'>Limited</option></select></label>'
        +(mgmt==='limited'?'<label class="tgl co-title"><input type="checkbox" '+(on?'checked':'')+' onchange="coTitleToggle(\''+jsId(m.user_id)+'\',this)"><span class="tgl-ui"></span><span class="tgl-t">Title documents</span></label>':'')+'</div>');
    });
  };
})();
async function rqDismissRemoved(btn){
  var card=btn.closest('.rq-card');if(!card)return;
  var id=card.dataset.id;
  var r=await sb.rpc('dismiss_removed_estimate',{p_id:id});
  if(r.error){showToast(friendlyError(r.error),'error');return;}
  var row=byId(RQ.rows,id);if(row)row.status='declined';
  showToast('Estimate dismissed');
  if(typeof odRender==='function')odRender();
  if(typeof renderRequests==='function')renderRequests();
}
canManageReminders=function(v){return canEditVehicle(v)||(!!v&&can(v,'can_add_reminders'));};
(function(){
  var prev=reminderItems;
  reminderItems=function(vehicles){
    var list=(vehicles||[]).filter(function(v){
      if(!v)return false;
      var rank=coRank();
      if(rank==='primary'||rank==='full'||rank==='limited')return true;
      return can(v,'view_reminders');
    });
    return prev(list);
  };
  var prevMs=msCanSeeMissing;
  msCanSeeMissing=function(v){
    if(!v||(typeof isArchivedVehicle==='function'&&isArchivedVehicle(v)))return false;
    var rank=coRank();
    if(rank==='limited')return false;
    if(rank==='full')return true;
    return prevMs(v);
  };
  var TDASH={on:0,client:null};
  window.TDASH=TDASH;
  var prevAV=activeVehicles;
  activeVehicles=function(){
    var r=prevAV.apply(this,arguments);
    if(TDASH.on&&TDASH.client&&Array.isArray(r))return r.filter(function(v){return v.clientId===TDASH.client;});
    return r;
  };
  var prevArc=visibleArchives;
  visibleArchives=function(){
    var r=prevArc.apply(this,arguments);
    if(TDASH.on&&TDASH.client&&Array.isArray(r))return r.filter(function(v){return v.clientId===TDASH.client;});
    return r;
  };
  var prevDash=renderDashboard;
  renderDashboard=function(){
    var scope=typeof isAdvisor==='function'&&isAdvisor()&&!(typeof realAdmin==='function'&&realAdmin());
    var clients=(typeof getClients==='function'?getClients():[]).filter(function(c){return c&&c.id;});
    if(scope&&(!TDASH.client||!clients.some(function(c){return c.id===TDASH.client;})))TDASH.client=clients[0]?clients[0].id:null;
    TDASH.on=scope?1:0;
    try{prevDash();}finally{TDASH.on=0;}
    tdRender();
  };
})();
function tdPickClient(id){if(window.TDASH)window.TDASH.client=id;if(typeof renderDashboard==='function')renderDashboard();}
async function coMgmt(sel,uid){
  var v=sel.value;
  var r=await sb.rpc('set_co_owner_management',{p_user_id:uid,p_management:v});
  if(r.error){showToast(friendlyError(r.error),'error');coRender();return;}
  (CO.rows||[]).forEach(function(m){if(m.user_id===uid)m.management=v;});
  coRender();
  showToast(v==='full'?'Co-owner set to full management':'Co-owner set to limited management');
}
async function coTitleToggle(uid,box){
  var r=await sb.rpc('set_co_owner_title_access',{p_user_id:uid,p_allow:!!box.checked});
  if(r.error){box.checked=!box.checked;showToast(typeof rpcMissing==='function'&&rpcMissing(r.error)?'Title access needs one backend update':friendlyError(r.error),'error');return;}
  (CO.rows||[]).forEach(function(m){if(m.user_id===uid)m.see_title_documents=!!box.checked;});
  showToast(box.checked?'Title documents are visible to this co-owner':'Title documents are hidden from this co-owner');
}
// Deterministic reader for a tech's own services page. No network and no model.
function sameHost(base, link) {
  try {
    var a = new URL(base);
    var b = new URL(link, base);
    return a.protocol === 'https:' && b.protocol === 'https:' && a.host === b.host;
  } catch (e) {
    return false;
  }
}

function safeHttps(raw) {
  try {
    var u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname || u.hostname === 'localhost') return null;
    return u;
  } catch (e) {
    return null;
  }
}

// Honor User-agent: * Disallow rules. A missing file allows the fetch.
function robotsAllows(robots, path) {
  var text = String(robots || '');
  if (!text.trim()) return true;
  var lines = text.split(/\r?\n/);
  var star = false;
  var rules = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    var m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (!m) continue;
    var key = m[1].trim().toLowerCase();
    var val = m[2].trim();
    if (key === 'user-agent') {
      star = val === '*';
    } else if (star && key === 'disallow' && val) {
      rules.push(val);
    }
  }
  var p = path || '/';
  for (var r = 0; r < rules.length; r++) {
    if (p === rules[r] || p.indexOf(rules[r]) === 0) return false;
  }
  return true;
}

function plParseStrip(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, function (tag) {
      var name = (tag.match(/^<\/?\s*([a-z0-9]+)/i) || [])[1];
      if (!name) return ' ';
      name = name.toLowerCase();
      if (tag.charAt(1) === '/') return (name === 'p' || name === 'li' || name === 'div' || name === 'h2' || name === 'h3') ? '\n' : ' ';
      if (name === 'h2') return '\n[[H2]]';
      if (name === 'h3') return '\n[[H3]]';
      if (name === 'p' || name === 'li' || name === 'br' || name === 'div') return '\n';
      return ' ';
    })
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function plParseMoney(chunk) {
  var from = chunk.match(/from\s*\$\s*([0-9][0-9,]*)/i);
  if (from) return { mode: 'from', amount: Number(from[1].replace(/,/g, '')) };
  var fixed = chunk.match(/\$\s*([0-9][0-9,]*)/);
  if (fixed) return { mode: 'fixed', amount: Number(fixed[1].replace(/,/g, '')) };
  if (/on request|price on request|call for price|poa/i.test(chunk)) return { mode: 'on_request', amount: null };
  return null;
}

function plParseDuration(chunk) {
  var m = chunk.match(/(\d+)\s*(hours|hour|hrs|hr|minutes|minute|mins|min|days|day)/i);
  if (!m) return null;
  var unit = m[2].toLowerCase();
  if (unit.charAt(0) === 'h') return m[1] + (m[1] === '1' ? ' hour' : ' hours');
  if (unit.charAt(0) === 'd') return m[1] + (m[1] === '1' ? ' day' : ' days');
  return m[1] + ' min';
}

function parsePricePage(html, pageUrl) {
  var text = plParseStrip(html);
  var parts = text.split('\n');
  var category = 'Services';
  var current = null;
  var out = [];
  function finish() {
    if (!current || !current.name) { current = null; return; }
    var blob = current.bits.join(' ');
    var price = plParseMoney(blob);
    var dur = plParseDuration(blob);
    var desc = current.bits.filter(function (b) { return !plParseMoney(b) && !plParseDuration(b); }).join(' ').replace(/\s+/g, ' ').trim();
    if (desc.length > 280) desc = desc.slice(0, 277) + '...';
    var needs = !price;
    out.push({
      category: category.slice(0, 40),
      name: current.name.slice(0, 120),
      description: desc,
      price_mode: price ? price.mode : 'on_request',
      amount: price ? price.amount : null,
      currency: price && price.amount != null ? 'USD' : null,
      duration_label: dur,
      source_url: pageUrl,
      needs_review: needs
    });
    current = null;
  }
  for (var i = 0; i < parts.length; i++) {
    var line = parts[i].trim();
    if (!line) continue;
    if (line.indexOf('[[H2]]') === 0) {
      finish();
      category = line.replace('[[H2]]', '').trim() || 'Services';
      continue;
    }
    if (line.indexOf('[[H3]]') === 0) {
      finish();
      current = { name: line.replace('[[H3]]', '').trim(), bits: [] };
      continue;
    }
    if (current) current.bits.push(line);
  }
  finish();
  return out;
}

// Tech price list and client service requests. No in-app payment.
var PL={mode:'empty',website:'',pay:'',attest:false,draft:[],live:[],publishedAt:null,tech:null,menu:[],scope:{all:true,vehicle_ids:[]},picked:{},service:null,sent:null,diff:[]};
function plMoney(s){
  if(!s||s.price_mode==='on_request'||s.amount==null||s.amount==='')return 'On request';
  var n=Number(s.amount),t=(n%1)?n.toFixed(2):String(Math.round(n));
  return (s.price_mode==='from'?'from $':'$')+t;
}
function plFound(url){
  try{var u=new URL(url);return 'Found on '+u.host+u.pathname;}catch(e){return 'Found on your site';}
}
function plRule(){return '<div class="pl-rule"><i></i><b></b><i></i></div>';}
function plHead(eye,title,sub){return '<div class="pl-eye">'+esc(eye)+'</div><h2 class="pl-title">'+esc(title)+'</h2>'+plRule()+(sub?'<p class="pl-sub">'+esc(sub)+'</p>':'');}
function plBtn(cls,label,fn){return '<button type="button" class="'+cls+'" onclick="'+fn+'">'+esc(label)+'</button>';}
function plGroup(rows){
  var order=[],map={};
  (rows||[]).forEach(function(s){var c=s.category||'Services';if(!map[c]){map[c]=[];order.push(c);}map[c].push(s);});
  return order.map(function(c){return '<div class="pl-cat">'+esc(c)+'</div>'+map[c].map(plRow).join('');}).join('');
}
function plRow(s){
  var i=PL.draft.indexOf(s);
  var flag=s.needs_review?' <span class="pl-flag">Please check</span>':'';
  var meta=[s.duration_label,s.source_url?plFound(s.source_url):''].filter(Boolean).join(' - ');
  var edit=(PL.mode==='review'&&i>=0)?'<div class="pl-acts"><button type="button" onclick="plEdit('+i+')">Edit</button><button type="button" onclick="plRemove('+i+')">Remove</button></div>':'';
  return '<article class="pl-svc"><div class="pl-top"><div class="pl-name">'+esc(s.name)+'</div><div class="pl-price">'+esc(plMoney(s))+'</div></div>'+
    (s.description?'<div class="pl-desc">'+esc(s.description)+'</div>':'')+
    '<div class="pl-meta">'+esc(meta)+flag+'</div>'+edit+'</article>';
}
function plScreen(){
  var el=document.getElementById('pl-screen');
  if(!el){el=document.createElement('div');el.id='pl-screen';el.className='pl-screen';document.body.appendChild(el);}
  return el;
}
function plClose(){var el=document.getElementById('pl-screen');if(el)el.remove();}
function plOpen(mode){
  if(mode)PL.mode=mode;
  closeModal('modal-account');
  plRender();
}
function plRender(){
  var el=plScreen(),html='<div class="pl-bar">EVOAI</div><div class="pl-body">';
  html+='<button type="button" class="pl-back" onclick="plClose()">Back</button>';
  if(PL.mode==='empty')html+=plEmpty();
  else if(PL.mode==='review')html+=plReview();
  else if(PL.mode==='published')html+=plPublished();
  else if(PL.mode==='refresh')html+=plRefresh();
  else if(PL.mode==='menu')html+=plMenu();
  else if(PL.mode==='request')html+=plRequest();
  else if(PL.mode==='sent')html+=plSent();
  html+='</div>';
  el.innerHTML=html;
}
function plEmpty(){
  var name=(session&&session.account&&session.account.name)||'Your profile';
  return plHead('Account',name,'Advisor / Tech')+
    '<div class="sh"><h2>My website &amp; price list</h2></div>'+
    '<p class="pl-lead">Clients see a services menu only after you publish. A draft stays on your profile.</p>'+
    '<label class="pl-lab" for="pl-web">Business website</label><input id="pl-web" class="pl-in" placeholder="Paste your website address" value="'+esc(PL.website)+'" oninput="PL.website=this.value">'+
    '<label class="pl-check"><input type="checkbox" '+(PL.attest?'checked':'')+' onchange="PL.attest=this.checked"> I own this website, or I am allowed to use its wording and prices.</label>'+
    '<label class="pl-lab" for="pl-pay">Pay / book on my site <span style="color:#E2C58E">Optional</span></label><input id="pl-pay" class="pl-in" placeholder="Paste a pay or booking page" value="'+esc(PL.pay)+'" oninput="PL.pay=this.value">'+
    '<p class="pl-help">Opens your own page in the browser. Shown on your profile as your site. EvoAI does not take payment.</p>'+
    plBtn('btn btn-primary','Draft my price list with AI','plDraft()')+
    '<div class="pl-note" style="margin-top:12px;border:1px solid rgba(201,170,107,.35);border-radius:14px;padding:12px">No services yet. The draft is for you to edit. Clients see nothing until you publish.</div>';
}
function plReview(){
  return plHead('Price list','Review draft','From your website - private until you publish')+
    plGroup(PL.draft)+
    '<button type="button" class="pl-add" onclick="plAdd()">+ Add a service</button>'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Publish to my clients','plPublish()')+
    '<p class="pl-note">Nothing is visible to clients until you publish.</p></div>';
}
function plPublished(){
  var when=PL.publishedAt?fmtDate(String(PL.publishedAt).slice(0,10)):'';
  var host='';
  try{host=new URL(PL.website).host;}catch(e){host=PL.website;}
  var pay='';
  try{pay=PL.pay?new URL(PL.pay).host+new URL(PL.pay).pathname:'';}catch(e2){pay=PL.pay;}
  return plHead('Price list','Published','Clients with access can open this menu')+
    '<div class="pl-row"><b>Last updated</b><span>'+esc(when)+'</span></div>'+
    '<div class="pl-row"><b>'+esc(host)+'</b><span>Your website</span></div>'+
    (pay?'<div class="pl-row"><b>'+esc(pay)+'</b><span>Pay / book - your site</span></div><p class="pl-help">The pay link opens your own page, outside EvoAI. Nothing is charged in the app.</p>':'')+
    plGroup(PL.live)+
    '<p class="pl-help">Reads your site again and opens a draft. It does not change the live menu.</p>'+
    plBtn('btn','Refresh from website','plRunRefresh()');
}
function plRefresh(){
  var rows=(PL.diff||[]).map(function(d){
    if(d.kind==='price')return '<article class="pl-svc"><div class="pl-meta">PRICE CHANGE</div><div class="pl-name">'+esc(d.name)+'</div><div class="pl-desc">'+esc(d.from)+' published <span style="color:#C9AA6B">-&gt;</span> <b style="color:#E2C58E">'+esc(d.to)+' on your site</b></div><div class="pl-meta">'+esc(d.meta||'')+'</div></article>';
    return '<article class="pl-svc"><div class="pl-meta">NEW SERVICE <span class="pl-flag">Please check</span></div><div class="pl-top"><div class="pl-name">'+esc(d.name)+'</div><div class="pl-price">'+esc(d.price)+'</div></div><div class="pl-desc">'+esc(d.description||'')+'</div><div class="pl-meta">'+esc(d.meta||'')+'</div></article>';
  }).join('');
  return plHead('Price list','Changes to approve','Your published menu is unchanged')+
    '<div class="pl-row"><b>Still live</b><span>'+esc(PL.publishedAt?fmtDate(String(PL.publishedAt).slice(0,10)):'')+'</span></div>'+rows+
    '<p class="pl-lead">The other published services match the site.</p>'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Publish these changes','plPublish()')+
    '<div style="height:8px"></div>'+plBtn('btn','Keep current list','plKeep()')+
    '<p class="pl-note">Clients still see the current menu until you publish.</p></div>';
}
function plMenu(){
  var tech=PL.tech||{};
  var pay=tech.pay_url||'';
  var host='';
  try{if(pay){var u=new URL(pay);host=u.host+u.pathname;}}catch(e){host=pay;}
  var picked=PL.service;
  return plHead('Your team',tech.business_name||tech.name||'Your tech',(tech.name||'')+' - Detailer')+
    '<p class="pl-lead">Prices are as listed by '+(esc(tech.business_name||tech.name||'your tech'))+'. Each one is an estimate until they confirm.</p>'+
    (pay?'<a class="pl-ext" href="'+esc(pay)+'" target="_blank" rel="noopener noreferrer"><span><b>Pay / book on their site</b><div class="pl-meta">'+esc(host)+' - Leaves EvoAI. This is their own site.</div></span><i>OPEN</i></a>':'')+
    '<div class="sh"><h2>Services &amp; prices</h2></div>'+
    (PL.menu||[]).map(function(s){
      var on=picked&&picked.id===s.id;
      var body='<div class="pl-top"><div class="pl-name">'+esc(s.name)+'</div><div class="pl-price">'+esc(plMoney(s))+'</div></div>'+
        (s.description?'<div class="pl-desc">'+esc(s.description)+'</div>':'')+
        '<div class="pl-meta">Listed estimate'+(s.duration_label?' - '+esc(s.duration_label):'')+'</div>'+
        (on?plBtn('btn btn-primary','Request this service','plAsk()'):'');
      return on?'<div class="pl-pick">'+body+'</div>':'<article class="pl-svc" onclick="plPickSvc(\''+jsId(s.id)+'\')">'+body+'</article>';
    }).join('');
}
function plRequest(){
  var s=PL.service||{};
  var cars=plCars();
  return plHead('Request','Request this service','')+
    '<div class="pl-sub" style="margin-top:0">'+esc(s.name||'')+'</div>'+
    '<p class="pl-meta" style="text-align:center">Listed '+esc(plMoney(s))+' - an estimate until they confirm</p>'+
    '<label class="pl-lab">Which vehicles</label>'+
    cars.map(function(v){
      var on=!!PL.picked[v.id];
      var note=v.share==='granted'?'On their access':'Shared for this request only. Standing access stays as it is.';
      return '<button type="button" class="pl-car'+(on?' on':'')+'" onclick="plToggleCar(\''+jsId(v.id)+'\')"><span><strong>'+esc((v.year?v.year+' ':'')+(v.make||'')+' '+(v.model||''))+'</strong><em>'+esc(v.plate||'')+'</em><div>'+esc(note)+'</div></span></button>';
    }).join('')+
    '<p class="pl-help">Choose cars they may already see, or share another car with this request only.</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="pl-lab" for="pl-from">From</label><input id="pl-from" class="pl-in" type="date"></div><div><label class="pl-lab" for="pl-to">To</label><input id="pl-to" class="pl-in" type="date"></div></div>'+
    '<label class="pl-lab" for="pl-note">Note <span style="color:#E2C58E">Optional</span></label><input id="pl-note" class="pl-in" maxlength="1000">'+
    '<div class="pl-photos"><div><div class="pl-photos-t">Add photos</div><div class="pl-photos-s">Tap to choose from library or camera</div></div><label class="pl-photos-btn" for="pl-photo">+<br>Photos</label><input id="pl-photo" class="pl-photo-in" type="file" accept="image/*"></div>'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Send request','plSend()')+'</div>';
}
function plSent(){
  var s=PL.sent||{};
  return plHead('Client request','Request sent','This went to '+(s.tech||'your tech'))+
    '<div class="pl-sum"><div><dt>Service</dt><dd>'+esc(s.service||'')+'</dd></div><div><dt>Listed price</dt><dd>'+esc(s.price||'')+' - estimate</dd></div><div><dt>Vehicles</dt><dd>'+esc(s.vehicles||'')+'</dd></div><div><dt>Window</dt><dd>'+esc(s.window||'')+'</dd></div><div><dt>Sent to</dt><dd>'+esc(s.tech||'')+' - Client Request</dd></div></div>'+
    '<p class="pl-lead">They will confirm a time or send an estimate. You are not charged in EvoAI. A pay link, if they show one, opens their own site.</p>';
}
function plCars(){
  var oid=typeof ownerClientId==='function'?ownerClientId():null;
  var cars=(typeof getVehicles==='function'?getVehicles():[]).filter(function(v){return !oid||v.clientId===oid;});
  var all=PL.scope&&PL.scope.all;
  var ids=PL.scope&&PL.scope.vehicle_ids||[];
  return cars.map(function(v){
    var granted=all||ids.indexOf(v.id)>=0;
    return {id:v.id,year:v.year,make:v.make,model:v.model,plate:v.plate,share:granted?'granted':'request_only'};
  });
}
function plPickSvc(id){PL.service=(PL.menu||[]).filter(function(s){return s.id===id;})[0]||null;plRender();}
function plAsk(){PL.mode='request';plRender();}
function plToggleCar(id){PL.picked[id]=!PL.picked[id];plRender();}
function plEdit(i){
  var s=PL.draft[i];if(!s)return;
  var name=prompt('Service name',s.name);if(name==null)return;
  var price=prompt('Price, from price, or On request',plMoney(s));if(price==null)return;
  s.name=name.trim()||s.name;
  if(/on request/i.test(price)){s.price_mode='on_request';s.amount=null;}
  else if(/^from/i.test(price)){s.price_mode='from';s.amount=Number(price.replace(/[^0-9.]/g,''));}
  else {s.price_mode='fixed';s.amount=Number(price.replace(/[^0-9.]/g,''));}
  plRender();
}
function plRemove(i){PL.draft.splice(i,1);plRender();}
function plAdd(){PL.draft.push({category:'Services',name:'New service',description:'',price_mode:'on_request',amount:null,needs_review:true,source_url:PL.website});plRender();}
async function plDraft(){
  PL.website=(document.getElementById('pl-web')||{}).value||PL.website;
  PL.pay=(document.getElementById('pl-pay')||{}).value||PL.pay;
  PL.attest=!!(document.querySelector('#pl-screen input[type=checkbox]')||{}).checked;
  if(!PL.attest){showToast('Confirm you may use this website','error');return;}
  if(!safeHttps(PL.website)){showToast('Paste an https website','error');return;}
  try{await sb.rpc('save_price_draft',{p_website:PL.website,p_pay:PL.pay||'',p_attest:true,p_services:null});}catch(e){}
  var inv=await sb.functions.invoke('draft-price-list',{body:{url:PL.website,attest:true,fixture:!!window.__PL_OFFLINE__}});
  if(inv.error||!inv.data||!inv.data.services){showToast('Drafting from your site is not switched on yet','error');return;}
  PL.draft=inv.data.services;PL.mode='review';plRender();
}
async function plPublish(){
  try{
    await sb.rpc('save_price_draft',{p_website:PL.website,p_pay:PL.pay||'',p_attest:true,p_services:PL.draft});
    var r=await sb.rpc('publish_price_list');
    if(r.error){showToast(rqMissing(r.error)?'Price lists are not switched on yet':'Could not publish','error');return;}
    plApplyMine(r.data);PL.mode='published';plRender();showToast('Published to your clients');
  }catch(e){showToast('Could not publish','error');}
}
async function plRunRefresh(){
  var inv=await sb.functions.invoke('draft-price-list',{body:{url:PL.website,attest:true,fixture:!!window.__PL_OFFLINE__}});
  if(inv.error||!inv.data){showToast('Drafting from your site is not switched on yet','error');return;}
  PL.diff=plDiff(PL.live,inv.data.services||[]);
  PL.draft=inv.data.services||[];
  PL.mode='refresh';plRender();
}
function plDiff(live,draft){
  var out=[],by={};
  (live||[]).forEach(function(s){by[s.name]=s;});
  (draft||[]).forEach(function(s){
    var old=by[s.name];
    if(!old)out.push({kind:'new',name:s.name,price:plMoney(s),description:s.description,meta:plFound(s.source_url)});
    else if(Number(old.amount)!==Number(s.amount)||old.price_mode!==s.price_mode)out.push({kind:'price',name:s.name,from:plMoney(old),to:plMoney(s),meta:plFound(s.source_url)});
  });
  return out;
}
async function plKeep(){
  var r=await sb.rpc('keep_price_list');
  if(r&&r.data)plApplyMine(r.data);
  PL.mode='published';plRender();
}
function plApplyMine(data){
  if(!data)return;
  var list=data.list||{};
  PL.website=list.website_url||PL.website;
  PL.pay=list.pay_url||'';
  PL.attest=!!list.attested_at;
  PL.publishedAt=list.published_at||null;
  PL.draft=data.draft||[];
  PL.live=data.live||[];
}
async function plOpenMenu(techId){
  PL.tech={id:techId};
  var menu=await sb.rpc('get_tech_menu',{p_tech:techId});
  var scope=await sb.rpc('list_tech_scope',{p_tech:techId});
  if(menu&&menu.data){
    PL.tech.name=menu.data.name;PL.tech.business_name=menu.data.business_name;PL.tech.pay_url=menu.data.pay_url;
    PL.menu=menu.data.services||[];
  }
  if(scope&&scope.data)PL.scope=scope.data;
  if(PL.menu[0])PL.service=PL.menu[PL.menu.length-1];
  PL.mode='menu';plRender();
}
async function plSend(){
  var ids=Object.keys(PL.picked).filter(function(id){return PL.picked[id];});
  if(!ids.length){showToast('Choose a vehicle','error');return;}
  if(!PL.service){showToast('Choose a service','error');return;}
  var start=(document.getElementById('pl-from')||{}).value||null;
  var end=(document.getElementById('pl-to')||{}).value||null;
  var note=(document.getElementById('pl-note')||{}).value||'';
  var r=await sb.rpc('submit_service_request',{p_tech:PL.tech.id,p_service:PL.service.id,p_vehicles:ids,p_start:start,p_end:end,p_note:note});
  if(r.error){showToast(rqMissing(r.error)?'Requests are not switched on yet':'Could not send the request','error');return;}
  var names=plCars().filter(function(c){return PL.picked[c.id];}).map(function(c){return c.model;}).join(', ');
  PL.sent={service:PL.service.name,price:plMoney(PL.service),vehicles:names,window:(start||'')+(end?' - '+end:''),tech:(PL.tech.business_name||PL.tech.name||'your tech')};
  PL.mode='sent';plRender();
  if(typeof p40Load==='function')p40Load(true);
}
function plMountAccount(){
  if(typeof isAdvisor!=='function'||!isAdvisor())return;
  var box=document.querySelector('#modal-account .modal');if(!box||document.getElementById('pl-entry'))return;
  var host=document.createElement('div');host.id='pl-entry';
  host.innerHTML='<div class="sh"><h2>My website &amp; price list</h2></div><p class="pl-lead">Clients see a services menu only after you publish.</p>'+plBtn('btn btn-primary','Open my price list','plOpen(\'empty\')');
  var anchor=document.getElementById('acct-role');
  if(anchor&&anchor.parentNode)anchor.parentNode.insertAdjacentElement('afterend',host);
  else box.appendChild(host);
}
function plTeamButtons(){
  [].slice.call(document.querySelectorAll('.team-card')).forEach(function(card){
    if(card.querySelector('.pl-team'))return;
    var id=card.getAttribute('data-team');if(!id)return;
    var b=document.createElement('button');
    b.type='button';b.className='btn btn-primary pl-team';b.textContent='Services and prices';
    b.onclick=function(){plOpenMenu(id);};
    card.appendChild(b);
  });
}
function plDecorateCard(html,row){
  if(!row||row.request_kind==='estimate'||!row.service_name)return html;
  var cars=(row._cards||[]).map(function(c){
    var tag=c.share==='request_only'?'shared for this request only':'on your access';
    return esc((c.year?c.year+' ':'')+(c.make||'')+' '+(c.model||'')+(c.plate?' - '+c.plate:'')+' - '+tag);
  }).join('<br>');
  var extra='<div class="pl-extra"><div><dt>Service</dt><dd>'+esc(row.service_name)+'</dd></div><div><dt>Listed price</dt><dd>'+esc(row.listed_label||'')+' - your list, an estimate until you confirm</dd></div>'+
    (cars?'<div><dt>Vehicles</dt><dd>'+cars+'</dd></div>':'')+
    (row.preferred_end?'<div><dt>Window</dt><dd>'+esc(fmtDate(row.preferred_date))+' - '+esc(fmtDate(row.preferred_end))+'</dd></div>':'')+
    '<p class="pl-note">Send estimate uses your existing estimate. Accepting does not charge the client.</p>'+
    '<div class="rq-acts"><button type="button" class="btn" onclick="rqOpenEstimate()">Send estimate</button></div></div>';
  return html.replace('<div class="rq-acts">',extra+'<div class="rq-acts">');
}
(function(){
  if(typeof openAccountModal==='function'){
    var prev=openAccountModal;
    openAccountModal=function(){var r=prev.apply(this,arguments);try{plMountAccount();}catch(e){}return r;};
  }
  if(typeof renderAccess==='function'){
    var ra=renderAccess;
    renderAccess=function(){var r=ra.apply(this,arguments);try{plTeamButtons();}catch(e){}return r;};
  }
  if(typeof rqCard==='function'){
    var rc=rqCard;
    rqCard=function(row){return plDecorateCard(rc(row),row);};
  }
})();
/* v40 cleanup behaviour. Existing save paths stay; this only changes how they are reached. */
function whlHint(){
  var coarse=false;
  try{coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;}catch(e){}
  return coarse?'<span class="whl-hint">Swipe</span>':'<span class="whl-hint">Swipe, drag or use arrow keys</span>';
}
function moreClose(){
  var s=document.getElementById('more-sheet');
  if(s)s.setAttribute('hidden','');
  var t=document.querySelector('.nav-more');
  if(t)t.classList.remove('active');
}
function moreOpen(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  var s=document.getElementById('more-sheet');
  if(!s)return;
  if(s.hasAttribute('hidden')){s.removeAttribute('hidden');var t=document.querySelector('.nav-more');if(t)t.classList.add('active');}
  else moreClose();
}
function moreBadge(){
  var n=0,rb=document.getElementById('rem-badge'),ab=document.getElementById('recs-badge'),b=document.getElementById('more-badge');
  if(rb&&rb.style.display!=='none')n+=parseInt(rb.textContent,10)||0;
  if(ab&&ab.style.display!=='none')n+=parseInt(ab.textContent,10)||0;
  if(b){b.textContent=String(n);b.style.display=n?'':'none';}
}
function renderGarage(){
  var vs=visibleVehicles(),host=document.getElementById('garage-vehicles');
  if(!host)return;
  var sub=document.getElementById('garage-sub');
  if(sub)sub.textContent=isOwner()?('Your '+vs.length+' '+(vs.length===1?'car':'cars')):('Cars you can open');
  host.innerHTML=vs.length?wheelHTML(vs,'garage'):emptyCard(isOwner()?'Your garage is empty. Add a vehicle from Overview.':'No cars on your access yet.');
  if(vs.length)wheelMount('garage-vehicles',vs);
}
function dueChip(owner){
  var id=owner?'cp-due-chip':'dash-due-chip';
  var host=document.getElementById(owner?'cp-vch':'dash-vch')||document.getElementById(owner?'cp-hero':'dash-hero');
  if(!host)return;
  var el=document.getElementById(id);
  if(!el){el=document.createElement('button');el.id=id;el.type='button';el.className='due-chip';el.onclick=function(){ovcSet(owner?'cp':'dash','stats');};host.appendChild(el);}
  var c=remCounts(reminderItems(visibleVehicles())),n=c.over+c.soon;
  el.style.display=n?'inline-flex':'none';
  el.textContent=n+' due within 30 days';
}
function valueHomeHTML(vehicles){
  var t=portfolioTotals(vehicles),exs=getExpenses(),i,h='';
  h+='<div class="vh-card card-em"><div class="vh-top"><div><div class="lab">Collection value</div><div class="vh-num">'+valueOverviewNum(t)+'</div><div class="vh-disc">Estimate, not an appraisal</div>';
  if(t.low||t.high)h+='<div class="vh-range">Range '+money(t.low)+' - '+money(t.high)+'</div>';
  h+='</div><div><div class="vh-basis">Cost basis '+(t.basisAll>0?money(t.basisAll):'--')+'</div>'+deltaHTML(t)+'</div></div>';
  for(i=0;i<vehicles.length;i++){
    var v=vehicles[i],g=vehicleGain(v,exs);
    var asOf=(g.hasValue&&v.aiValue&&v.aiValue.asOf)?('Estimate, as of '+fmtDate(v.aiValue.asOf)):'Estimate, not an appraisal';
    h+='<div class="vh-row"><span>'+esc(vName(v))+'</span><b>'+(g.hasValue?money(g.value)+'<small>'+esc(asOf)+'</small>':'--')+'</b></div>';
  }
  return h+'</div>';
}
function mountValueHome(owner,vehicles){
  var id=owner?'cp-value-home':'dash-value-home';
  var panel=document.getElementById(owner?'cp-ovc-stats':'dash-ovc-stats');
  if(!panel)return;
  var el=document.getElementById(id);
  if(!el){el=document.createElement('div');el.id=id;panel.appendChild(el);}
  el.innerHTML=valueHomeHTML(vehicles);
}
function attAct(vid,kind,id){
  if(kind==='service'||kind==='mileage'){serviceDoneToday(vid);return;}
  if(kind==='adv'){showPage('recommendations');return;}
  markRenewed(vid,kind,id||'');
}
attentionItems=function(vehicles){
  var out=[],ids={},i,items=reminderItems(vehicles),recs=getRecs(),owner=isOwner();
  for(i=0;i<vehicles.length;i++)ids[vehicles[i].id]=vehicles[i];
  for(i=0;i<items.length;i++){
    if(items[i].sortDays>30)continue;
    var it=items[i],v=ids[it.vid];
    out.push({score:it.sortDays,vid:it.vid,name:vName(v),text:remPhrase(it),kind:it.kind,rid:it.id||'',src:'Reminders'});
  }
  for(i=0;i<recs.length;i++){
    var r=recs[i];
    if(!ids[r.vehicleId])continue;
    var show=owner?(r.status==='open'||(r.status==='accepted'&&r.urgency!=='green')):(r.status==='open'||r.status==='accepted'||(r.status==='declined'&&r.urgency!=='green'));
    if(!show)continue;
    out.push({score:r.urgency==='red'?0:20,vid:r.vehicleId,name:vName(ids[r.vehicleId]),text:r.title+(r.cost?' - '+r.cost:''),kind:'adv',rid:r.id,src:'Advisory'});
  }
  out.sort(function(a,b){return a.score-b.score;});
  return out;
};
attentionHTML=function(vehicles){
  var items=attentionItems(vehicles),i,h='';
  if(!items.length){
    h='<div class="calm"><div class="calm-t">Nothing needs your attention</div><div class="calm-s">Dates and advisories will collect here.</div></div>';
  }else{
    for(i=0;i<items.length;i++){
      var a=items[i],hot=a.score<14||a.kind==='adv'&&a.score===0;
      var act=a.kind==='adv'?'Review':'Done';
      h+='<div class="att-card'+(hot?' hot':'')+'" onclick="openVehicleDetail(\''+jsId(a.vid)+'\')"><div><b>'+esc(a.text)+'</b><span>'+esc(a.name)+' - '+esc(a.src)+'</span></div>';
      h+='<button type="button" class="btn '+(a.kind==='adv'?'btn-primary':'btn-sm')+'" onclick="event.stopPropagation();attAct(\''+jsId(a.vid)+'\',\''+jsId(a.kind)+'\',\''+jsId(a.rid)+'\')">'+act+'</button></div>';
    }
  }
  var miss=0;
  try{miss=typeof tdCount==='function'?tdCount():0;}catch(e){}
  if(miss)h+='<div class="att-card"><div><b>Records to complete ('+miss+')</b><span>Missing details</span></div><button type="button" class="btn btn-sm" onclick="showPage(\'todo\')">To do</button></div>';
  h+='<p class="att-note">Phone and email alerts are off. Use Add to calendar in Reminders.</p>';
  return h;
};
var _collectionBrief=collectionBrief;
collectionBrief=function(vs){
  var html=_collectionBrief(vs),n=0;
  return html.replace(/<p>[\s\S]*?<\/p>/g,function(p){
    n++;
    if(n===2)return '<p>Anything due within 30 days, and open advisories, live on the one attention list under Stats.</p>';
    return p;
  });
};
var _showDueBanner=showDueBanner;
showDueBanner=function(){dueBannerShown=true;showEl('due-banner',false);};
var _valueOverviewNum=valueOverviewNum;
valueOverviewNum=function(t){
  if(t&&t.nValued)return _valueOverviewNum(t);
  return '<span class="val-empty">'+esc(noValueText(t))+'</span>';
};
var _renderOverview=renderOverview;
renderOverview=function(owner,vehicles){
  _renderOverview(owner,vehicles);
  dueChip(!!owner);
  mountValueHome(!!owner,vehicles);
  if(owner){
    var page=document.getElementById('page-client-portal');
    var actions=page&&page.querySelector('.topline .head-actions');
    if(actions){
      var slot=document.getElementById('cp-actions');
      if(!slot){slot=document.createElement('div');slot.id='cp-actions';slot.className='ov-actions';page.appendChild(slot);}
      if(actions.parentNode!==slot)slot.appendChild(actions);
    }
  }
};
var _showPage=showPage;
showPage=function(pageId){
  if(pageId==='valuations'){
    var home=isOwner()?'client-portal':'dashboard';
    _showPage(home);
    try{ovcSet(isOwner()?'cp':'dash','stats');}catch(e){}
    moreClose();
    return;
  }
  _showPage(pageId);
  if(pageId==='garage')renderGarage();
  moreClose();
  moreBadge();
  var primary={dashboard:1,'client-portal':1,garage:1,requests:1,todo:1};
  var moreTab=document.querySelector('.nav-more');
  if(moreTab&&!primary[pageId])moreTab.classList.add('active');
};
var _detailActionsHTML=detailActionsHTML;
detailActionsHTML=function(v){
  if(isArchivedVehicle(v))return '';
  var primary='',more='';
  function b(cls,label,fn){return '<button type="button" class="btn '+cls+'" onclick="'+fn+'">'+label+'</button>';}
  if(can(v,'can_add_service'))primary+=b('btn-primary','Log service','openServiceFromDetail()');
  if(canEditVehicle(v))primary+=b('','Share / request','goAccessFromDetail()');
  if(can(v,'can_add_expenses'))more+=b('btn-sm','Expense','openExpenseFromDetail()');
  if(can(v,'can_add_documents'))more+=b('btn-sm','Document','openDocFromDetail()');
  if(canManageReminders(v))more+=b('btn-sm','Reminder','openReminderFromDetail()');
  if(can(v,'can_add_service')){more+=b('btn-sm','Note','openNoteFromDetail()');more+=b('btn-sm','Inspection','openRecordModal(\'inspection\')');}
  if(can(v,'can_create_advisories'))more+=b('btn-sm','Advisory','openRecForVehicle()');
  if(canUploadPhotos(v))more+=b('btn-sm','Photo','pickDetailPhoto()');
  if(canEditVehicle(v)){
    more+=b('btn-sm','Edit details','editCurrentVehicle()');
    more+=b('btn-sm','Sell / transfer','openTransferModal()');
    more+=b('btn-sm btn-danger','Archive','archiveCurrentVehicle()');
  }
  if(!primary&&!more)return '';
  return '<div class="vd-primary">'+primary+'</div>'+(more?'<div class="vd-morebox"><div class="vd-morelab">More actions</div><div class="vd-moregrid">'+more+'</div></div>':'');
};
function openRecordModal(kind){
  if(kind==='inspection'){closeModal('modal-service');openInspectionModal();return;}
  closeModal('modal-inspection');
  openServiceModal();
}
var _openVehicleDetail=openVehicleDetail;
openVehicleDetail=function(id){
  _openVehicleDetail(id);
  var box=document.getElementById('vd-recs');
  if(box&&!box.querySelector('[data-adv-link]')){
    var n=box.querySelectorAll('.alert-item').length;
    if(n)box.innerHTML='<div class="att-card"><div><b>Open advisory'+(n===1?'':' - '+n)+'</b><span>Accept or decline on Advisories</span></div><button type="button" class="btn btn-sm" data-adv-link="1" onclick="closeModal(\'modal-vehicle-detail\');showPage(\'recommendations\')">Advisories</button></div>';
  }
};
function openPriceList(){
  if(typeof isAdvisor==='function'&&isAdvisor()){plOpen('empty');moreClose();return;}
  _showPage('access');
  var btn=document.querySelector('.team-card .pl-team');
  if(btn)btn.click();
  moreClose();
}
var _renderRequests=renderRequests;
renderRequests=function(){
  _renderRequests();
  var root=document.getElementById('rq-root');
  if(!root||document.getElementById('rq-pl-entry'))return;
  var bar=document.createElement('div');
  bar.id='rq-pl-entry';bar.className='rq-pl-entry';
  bar.innerHTML=(typeof isOwner==='function'&&isOwner())
    ?'<button type="button" class="btn" onclick="openPriceList()">Services and price list</button>'
    :'<button type="button" class="btn" onclick="plOpen(\'empty\')">My price list</button>';
  root.parentNode.insertBefore(bar,root);
};
var _updateRemBadge=updateRemBadge;
updateRemBadge=function(){_updateRemBadge();moreBadge();};
var _updateRecBadge=updateRecBadge;
updateRecBadge=function(){_updateRecBadge();moreBadge();};
navAInit=function(){
  var s=document.getElementById('nav-A');if(s)s.remove();
  var c=document.querySelector('.nav-chev');if(c)c.remove();
  var sb=document.querySelector('.sidebar');
  if(sb){sb.classList.remove('nav-at-start');sb.classList.remove('nav-at-end');sb.style.webkitMaskImage='none';sb.style.maskImage='none';}
};
if(document.getElementById('nav-A'))navAInit();

