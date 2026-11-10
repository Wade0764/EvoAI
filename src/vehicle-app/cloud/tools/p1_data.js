// ============ CLOUD CONFIG (public values only; the anon key is safe for clients, RLS protects the data) ============
var SUPABASE_URL='https://xosbchskdtkxogppmkex.supabase.co';
var SUPABASE_ANON_KEY='__ANON_KEY__';
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
function isRealOwnerOf(v){return !!(v&&v.clientId&&v.clientId===myId());}
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
  if(clientId===myId())return true;
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
function vx(v){return {trim:v.trim||'',ins:Number(v.insuredValue)>0?Number(v.insuredValue):'',svcM:svcMonths(v),svcI:svcMiles(v),insRep:v.insRepeat==='6months'?'6months':'yearly'};}
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
      var c=vCore(v),row={id:v.id,owner_id:v.clientId,year:c.year,make:c.make,model:c.model,color:c.color,nickname:c.nickname,vin:c.vin,mileage:c.mileage,notes:c.notes,archived:false};
      chk(await sb.from('vehicles').insert(row));
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
  var ownerOnly=!!(d.type==='insurance'||d.type==='title')&&(realAdmin()||d.clientId===myId()||managedMine(d.clientId));
  try{
    chk(await sb.from('documents').insert({id:d.id,vehicle_id:d.vehicleId,uploaded_by:myId(),kind:kind,title:packX(String(d.name||'Document').slice(0,120),{type:d.type,exp:d.expiry,notes:d.notes}),storage_path:path,mime_type:mime,size_bytes:blob.size||null,owner_only:ownerOnly}));
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
  var res=await Promise.all([tbl('vehicles'),tbl('vehicle_financials'),tbl('reminders'),tbl('service_records'),tbl('expenses'),tbl('documents'),tbl('vehicle_photos'),tbl('advisories'),tbl('ai_estimates'),tbl('tech_access'),tbl('tech_permissions'),tbl('invites'),tbl('transfers'),tbl('vehicle_archives'),mine.role==='tech'?tbl('my_tech_visibility'):Promise.resolve([])]);
  var rows={veh:res[0],fin:res[1],rem:res[2],svc:res[3],exp:res[4],doc:res[5],pho:res[6],adv:res[7],est:res[8],acc:res[9],perm:res[10],inv:res[11],xfer:res[12],arc:res[13],vis:res[14]};
  var nc=emptyCache();
  nc.profile=mine;nc.profiles=profMap;
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
    var v={id:r.id,clientId:r.owner_id,year:r.year?String(r.year):'',make:r.make||'',model:r.model||'',trim:x.trim||'',nickname:r.nickname||'',color:r.color||'',mileage:r.mileage||0,vin:r.vin||'',notes:un.text,
      purchasePrice:fin&&fin.purchase_price!==null?Number(fin.purchase_price):0,purchaseDate:fin&&fin.purchase_date?fin.purchase_date:'',insuredValue:Number(x.ins)>0?Number(x.ins):0,
      archived:!!r.archived,archivedAt:r.archived_at||null,archiveReason:r.archived?'archived':'',createdAt:r.created_at,updatedAt:r.updated_at,
      regExpiry:'',insRenewal:'',insRepeat:x.insRep==='6months'?'6months':'yearly',inspExpiry:'',lastServiceDate:'',nextServiceDate:'',nextServiceMiles:'',
      svcIntervalMonths:(x.svcM===undefined?6:Number(x.svcM)),svcIntervalMiles:(x.svcI===undefined?5000:Number(x.svcI)),
      reminders:[],serviceLog:[],renewals:[],valueLog:[],aiValue:null,aiHealth:null,status:'green',image:null,_rem:{},_photos:[]};
    // reminders
    var seenKind={};
    rems=latestBy(rems,'created_at');
    for(j=0;j<rems.length;j++){
      var rm=rems[j];
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
      v._photos.push({id:ph.id,path:ph.storage_path,thumb:ph.thumb_path||'',disp:ph.display_path||'',tag:ph.tag||'',sort:Number(ph.sort_order)||0,at:ph.created_at||'',url:sp[ph.display_path||ph.storage_path]||null,isCover:!!ph.is_cover,caption:ph.caption||'',by:ph.uploaded_by});
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
        var mid=Math.round((Number(e.value_low)+Number(e.value_high))/2);
        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true});
        v.aiValue={value:mid,low:Math.round(Number(e.value_low)),high:Math.round(Number(e.value_high)),asOf:String(e.as_of).slice(0,10),sources:strList(e.sources,8),confidence:e.confidence===null?'':Number(e.confidence)};
      }else if(e.kind==='health'&&e.health_score!==null){
        v.aiHealth={score:e.health_score,reasons:strList(e.reasons,8),asOf:String(e.as_of).slice(0,10)};
      }
    }
    if(v.aiHealth)v.status=v.aiHealth.score>=85?'green':(v.aiHealth.score>=60?'yellow':'red');
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
    nc.docs.push({id:dr.id,vehicleId:dr.vehicle_id,clientId:(byId(vehicles,dr.vehicle_id)||{}).clientId||'',type:type,name:du.text||'Document',expiry:dx.exp||'',notes:dx.notes||'',image:isImg?url:'',fileUrl:(dr.mime_type==='application/pdf')?url:'',mime:dr.mime_type||'',createdAt:dr.created_at,by:dr.uploaded_by,ownerOnly:!!dr.owner_only});
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
    if(p.managed&&p.claimed_by)return;   // claimed placeholder: its data now belongs to the real account
    cl.push({id:p.id,name:displayName(p),email:p.email||'',phone:p.phone||'',location:'',since:String(p.created_at||'').slice(0,7),createdAt:p.created_at,linked:true,canAdd:!!canAdd,
      managed:!!p.managed,claimed:!!p.claimed_by,managedBy:p.managed_by||'',notes:p.notes||''});
  }
  if(mine.role==='owner'){addClientRow(mine,true);}
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
    o.can_add_service=!!vr.can_add_service;o.can_add_documents=!!vr.can_add_documents;o.can_add_expenses=!!vr.can_add_expenses;o.can_create_advisories=!!vr.can_create_advisories;
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
