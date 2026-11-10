// Browser-side mock of supabase-js v2 + a tiny RLS emulation. Validates every column and enum against the real schema.
(function(){
var COLS=window.__SCHEMA_COLS__, ENUM={
  expenses:{category:['fuel','insurance','registration','storage','maintenance','repair','parts','modification','detailing','tax','other']},
  documents:{kind:['invoice','receipt','title','registration','insurance','inspection','manual','photo','pdf','other']},
  reminders:{kind:['tag','insurance','inspection','service','custom']},
  advisories:{severity:['info','recommended','urgent'],status:['pending','accepted','declined','completed']},
  service_records:{category:['maintenance','repair','inspection','detail','modification','other']}};
var S=window.__MOCK_STATE__={tables:{},users:[],session:null,log:[],violations:[],storage:{},listeners:[],rpcs:[],emails:[],seq:1};
function uuid(){var h='0123456789abcdef',s='';for(var i=0;i<32;i++)s+=h[Math.floor(Math.random()*16)];return s.slice(0,8)+'-'+s.slice(8,12)+'-4'+s.slice(13,16)+'-a'+s.slice(17,20)+'-'+s.slice(20,32);}
function T(n){return S.tables[n]||(S.tables[n]=[]);}
function uid(){return S.session?S.session.user.id:null;}
function prof(id){return T('profiles').filter(function(p){return p.id===id;})[0];}
function role(){var p=prof(uid());return p?p.role:null;}
function vis(vid){var r=T('my_tech_visibility').filter(function(x){return x.vehicle_id===vid&&x.__tech===uid();})[0];return r||null;}
// unclaimed managed client of the signed-in tech: tech acts as owner (mirrors private.is_managing_tech)
function managedMine(o){var p=prof(o);return !!(p&&p.managed&&!p.claimed_by&&p.managed_by===uid());}
// v17 co-owners (mirrors private.is_collection_owner): the owner profile itself or a collection_members row
function own(o){var u=uid();if(!u||!o)return false;if(o===u)return true;return (S.tables.collection_members||[]).some(function(m){return m.collection_owner_id===o&&m.user_id===u;});}
function vehOwner(vid){var v=T('vehicles').filter(function(x){return x.id===vid;})[0];return v?v.owner_id:null;}
// ---- read visibility ----
function canRead(t,row){
  var r=role(),u=uid();if(!u)return false;
  if(r==='admin')return true;
  if(t==='profiles')return true;
  if(t==='my_tech_visibility')return row.__tech===u;
  if(t==='collection_members')return row.user_id===u||own(row.collection_owner_id);
  if(t==='ai_estimates'){var o=vehOwner(row.vehicle_id);if(own(o))return true;var v=vis(row.vehicle_id);return !!(v&&(row.kind==='value'?v.can_view_value_estimate:v.can_view_health_estimate));}
  if(t==='vehicles'){if(own(row.owner_id)||managedMine(row.owner_id))return true;return !!vis(row.id);}
  if(t==='vehicle_archives')return own(row.owner_id);
  if(t==='portfolios')return own(row.owner_id); // v21 migration_013 (tests add the table)
  if(t==='transfers')return row.seller_id===u||row.buyer_id===u;
  if(t==='invites')return row.created_by===u||row.owner_id===u;
  if(t==='tech_access')return own(row.owner_id)||row.tech_id===u;
  if(t==='tech_permissions')return own(row.owner_id)||row.tech_id===u;
  if(t==='audit_log')return row.owner_id===u;
  var vid=row.vehicle_id,o2=vehOwner(vid);
  if(own(o2)||managedMine(o2))return true;
  var v2=vis(vid);if(!v2)return false;
  if(t==='vehicle_financials')return v2.can_view_purchase_info;
  if(t==='service_records')return v2.can_view_service_records||row.created_by===u;
  if(t==='expenses')return v2.can_view_expenses;
  if(t==='documents')return v2.can_view_documents&&!row.owner_only;
  if(t==='reminders')return v2.can_view_reminders;
  if(t==='vehicle_photos')return v2.can_view_photos;
  if(t==='advisories')return row.from_tech_id===u;
  return false;
}
function rlsErr(m){return {code:'42501',message:m||'new row violates row-level security policy'};}
function canWrite(t,op,row){
  var r=role(),u=uid();if(r==='admin')return t!=='ai_estimates'&&t!=='audit_log';
  var o=row.vehicle_id?vehOwner(row.vehicle_id):row.owner_id;
  var own_=(t==='vehicles'?own(row.owner_id):own(o))||managedMine(o);
  if(t==='collection_members')return false;
  if(t==='ai_estimates'||t==='audit_log'||t==='tech_access'||t==='tech_permissions'||t==='transfers'||t==='vehicle_archives'||t==='invites')return false;
  if(t==='vehicles'){if(op==='insert')return own_||S.addVeh===true;return own_;}
  if(t==='vehicle_financials'&&!own_)return false;
  if(own_)return true;
  var v=vis(row.vehicle_id);if(!v)return false;
  if(op==='insert'){
    if(t==='service_records')return v.can_add_service;
    if(t==='documents')return v.can_add_documents;
    if(t==='expenses')return v.can_add_expenses;
    if(t==='advisories')return v.can_create_advisories&&row.from_tech_id===u;
    if(t==='vehicle_photos')return v.can_view_photos;
  }
  if(op==='delete'){if(t==='documents')return row.uploaded_by===u;if(t==='vehicle_photos')return row.uploaded_by===u;}
  return false;
}
function check(t,row,op){
  var cols=COLS[t];
  if(!cols){S.violations.push('unknown table '+t);return;}
  Object.keys(row).forEach(function(k){if(cols.indexOf(k)<0)S.violations.push(op+' '+t+': unknown column '+k);});
  var en=ENUM[t]||{};Object.keys(en).forEach(function(k){if(row[k]!==undefined&&row[k]!==null&&en[k].indexOf(row[k])<0)S.violations.push(op+' '+t+'.'+k+': bad enum '+row[k]);});
  if(t==='vehicles'&&row.vin&&!/^[A-Z0-9]{5,25}$/.test(row.vin))S.violations.push('vehicles.vin violates check: '+row.vin);
  if(t==='reminders'&&op==='insert'&&row.due_date==null&&row.due_mileage==null)S.violations.push('reminders check due_date/due_mileage');
  if(t==='documents'&&op==='insert'){var p=String(row.storage_path||'').split('/');if(p[1]!==row.vehicle_id||!p[2])S.violations.push('documents path check '+row.storage_path);}
  if(t==='vehicle_photos'&&op==='insert'){var p2=String(row.storage_path||'').split('/');if(p2[1]!==row.vehicle_id||!p2[2])S.violations.push('photos path check '+row.storage_path);}
}
function Q(t){
  var q={_t:t,_op:'select',_f:[],_ord:null,_lim:null,_one:false,_may:false,_payload:null};
  ['eq','neq','in','is','gte','lte'].forEach(function(f){q[f]=function(c,v){q._f.push([f,c,v]);return q;};});
  q.select=function(c){q._cols=c;return q;};
  q.order=function(c,o){q._ord=[c,o&&o.ascending===false];return q;};
  q.limit=function(n){q._lim=n;return q;};
  q.single=function(){q._one=true;return q;};
  q.maybeSingle=function(){q._may=true;return q;};
  q.insert=function(p){q._op='insert';q._payload=p;return q;};
  q.update=function(p){q._op='update';q._payload=p;return q;};
  q.delete=function(){q._op='delete';return q;};
  q.upsert=function(p){q._op='upsert';q._payload=p;return q;};
  q.then=function(res,rej){return run(q).then(res,rej);};
  return q;
}
function match(row,f){
  return f.every(function(x){var v=row[x[1]];
    if(x[0]==='eq')return v===x[2];if(x[0]==='neq')return v!==x[2];if(x[0]==='in')return x[2].indexOf(v)>=0;
    if(x[0]==='is')return x[2]===null?(v===null||v===undefined):v===x[2];if(x[0]==='gte')return v>=x[2];if(x[0]==='lte')return v<=x[2];return true;});
}
function strip(r){var o={};Object.keys(r).forEach(function(k){if(k.indexOf('__')!==0)o[k]=r[k];});return o;}
function run(q){
  return new Promise(function(resolve){
    setTimeout(function(){
      if(S.offline){resolve({data:null,error:{message:'Failed to fetch'}});return;}
      var t=q._t,out;
      if(!S.session){resolve({data:null,error:{code:'42501',message:'permission denied for table '+t}});return;}
      S.log.push({op:q._op,table:t,payload:q._payload,filters:q._f});
      if(S.noPortfolio&&t==='vehicle_photos'){
        var _pc=/thumb_path|display_path|\btag\b/;
        var _bad=(q._op==='select'&&_pc.test(String(q._cols||'')))||((q._op==='insert'||q._op==='update')&&_pc.test(Object.keys((Array.isArray(q._payload)?q._payload[0]:q._payload)||{}).join(',')));
        if(_bad){resolve({data:null,error:{code:'42703',message:'column vehicle_photos.thumb_path does not exist'}});return;}
      }
      if(t==='documents'&&(q._op==='insert'||q._op==='update')&&COLS.documents.indexOf('thumb_path')<0&&('thumb_path' in ((Array.isArray(q._payload)?q._payload[0]:q._payload)||{}))){resolve({data:null,error:{code:'PGRST204',message:"Could not find the 'thumb_path' column of 'documents' in the schema cache"}});return;}  // PostgREST: migration_011 not applied
      if(t==='vehicle_photos'&&q._op==='insert'){var _r0=JSON.parse(JSON.stringify(Array.isArray(q._payload)?q._payload[0]:q._payload));
        if('sort_order' in _r0&&_r0.sort_order===null){resolve({data:null,error:{code:'23502',message:'null value in column "sort_order" of relation "vehicle_photos" violates not-null constraint'}});return;}}
      if(S.failOn&&S.failOn.table===t&&S.failOn.op===q._op){resolve({data:null,error:{code:'XX000',message:S.failOn.msg||'boom'}});return;}
      if(q._op==='select'){
        var rows=T(t).filter(function(r){return canRead(t,r)&&match(r,q._f);});
        if(q._ord){var c=q._ord[0],d=q._ord[1]?-1:1;rows=rows.slice().sort(function(a,b){return String(a[c]).localeCompare(String(b[c]))*d;});}
        if(q._lim)rows=rows.slice(0,q._lim);
        rows=rows.map(strip);
        if(q._one){resolve(rows.length===1?{data:rows[0],error:null}:{data:null,error:{code:'PGRST116',message:'no rows'}});return;}
        if(q._may){resolve({data:rows[0]||null,error:null});return;}
        resolve({data:rows,error:null});return;
      }
      var list=T(t);
      if(q._op==='insert'||q._op==='upsert'){
        var arr=Array.isArray(q._payload)?q._payload:[q._payload];
        for(var i=0;i<arr.length;i++){
          var row=Object.assign({},arr[i]);check(t,row,'insert');
          if(t==='vehicles'||t==='expenses'||t==='reminders'||t==='advisories'){}
          if(t==='expenses'&&!row.owner_id)row.owner_id=vehOwner(row.vehicle_id);
          if(t==='reminders'&&!row.owner_id)row.owner_id=vehOwner(row.vehicle_id);
          if(t==='advisories'){if(!row.owner_id)row.owner_id=vehOwner(row.vehicle_id);if(!row.from_tech_id)row.from_tech_id=uid();}
          if(t==='vehicle_financials'&&!row.owner_id)row.owner_id=vehOwner(row.vehicle_id);
          if(!row.id&&t!=='vehicle_financials')row.id=uuid();
          row.created_at=row.created_at||new Date().toISOString();
          if(!canWrite(t,'insert',row)){resolve({data:null,error:rlsErr()});return;}
          var dupe=list.filter(function(r){return r.id===row.id&&t!=='vehicle_financials'||(t==='vehicle_financials'&&r.vehicle_id===row.vehicle_id);})[0];
          if(dupe){if(q._op==='upsert'){Object.assign(dupe,row);continue;}resolve({data:null,error:{code:'23505',message:'duplicate key'}});return;}
          if(t==='vehicles'&&role()!=='admin')row.owner_id=row.owner_id||uid();
          list.push(row);
        }
        resolve({data:null,error:null});return;
      }
      if(q._op==='update'){
        var hit=list.filter(function(r){return match(r,q._f);});
        check(t,q._payload,'update');
        for(var j=0;j<hit.length;j++){if(!canWrite(t,'update',hit[j])){resolve({data:null,error:null,__denied:true});return;}Object.assign(hit[j],q._payload);}
        resolve({data:null,error:null});return;
      }
      if(q._op==='delete'){
        var del=list.filter(function(r){return match(r,q._f);});
        for(var k=0;k<del.length;k++){if(!canWrite(t,'delete',del[k])){resolve({data:null,error:null});return;}}
        S.tables[t]=list.filter(function(r){return del.indexOf(r)<0;});
        resolve({data:null,error:null});return;
      }
    },5);
  });
}
function rpc(name,args){
  return new Promise(function(resolve){setTimeout(function(){
    S.rpcs.push({name:name,args:args});
    if(S.offline){resolve({data:null,error:{message:'Failed to fetch'}});return;}
    var h=(S.rpcHandlers&&S.rpcHandlers[name])||(!S.no017&&R017[name]);
    if(h){resolve(h(args));return;}
    resolve({data:null,error:{code:'PGRST202',message:'Could not find the function public.'+name+' in the schema cache'}});
  },5);});
}
var auth={
  getSession:function(){return Promise.resolve({data:{session:S.session},error:null});},
  getUser:function(){return Promise.resolve({data:{user:S.session?S.session.user:null},error:null});},
  signInWithPassword:function(c){return new Promise(function(res){setTimeout(function(){
    if(S.offline){res({data:null,error:{message:'Failed to fetch'}});return;}
    var u=S.users.filter(function(x){return x.email===c.email&&x.password===c.password;})[0];
    if(!u){res({data:null,error:{message:'Invalid login credentials'}});return;}
    if(!u.confirmed){res({data:null,error:{message:'Email not confirmed'}});return;}
    S.session={access_token:'t',user:{id:u.id,email:u.email,user_metadata:u.meta||{}}};emit('SIGNED_IN');res({data:{session:S.session,user:S.session.user},error:null});},5);});},
  signUp:function(c){return new Promise(function(res){setTimeout(function(){
    if(S.users.some(function(x){return x.email===c.email;})){res({data:{user:{identities:[]},session:null},error:null});return;}
    var u={id:uuid(),email:c.email,password:c.password,confirmed:false,meta:(c.options&&c.options.data)||{}};S.users.push(u);
    S.emails.push({type:'signup',to:c.email,redirect:c.options&&c.options.emailRedirectTo});
    res({data:{user:{id:u.id,email:u.email,identities:[{}]},session:null},error:null});},5);});},
  resend:function(c){S.emails.push({type:'resend',to:c.email,redirect:c.options&&c.options.emailRedirectTo});return Promise.resolve({data:{},error:null});},
  resetPasswordForEmail:function(e,o){S.emails.push({type:'reset',to:e,redirect:o&&o.redirectTo});return Promise.resolve({data:{},error:null});},
  updateUser:function(p){var u=S.users.filter(function(x){return S.session&&x.id===S.session.user.id;})[0];if(u&&p.password)u.password=p.password;if(u&&p.data)u.meta=Object.assign(u.meta||{},p.data);if(S.session&&p.data)S.session.user.user_metadata=Object.assign(S.session.user.user_metadata||{},p.data);return Promise.resolve({data:{user:S.session?S.session.user:null},error:null});},
  signOut:function(){S.session=null;emit('SIGNED_OUT');return Promise.resolve({error:null});},
  onAuthStateChange:function(cb){S.listeners.push(cb);return {data:{subscription:{unsubscribe:function(){}}}};}
};
function emit(ev){S.listeners.forEach(function(cb){try{cb(ev,S.session);}catch(e){}});}
S.emit=emit;
var storage={from:function(b){return {
  upload:function(path,blob,o){return new Promise(function(res){setTimeout(function(){
    if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(portfolio\/)?[^/]+$/.test(path)){S.violations.push('bad storage path '+path);}
    S.blobs=S.blobs||{};S.blobs[path]=blob;S.storageUp=(S.storageUp||[]);S.storageUp.push({b:b,path:path,size:blob.size});
    if(blob.size>15*1024*1024){res({data:null,error:{statusCode:'413',error:'Payload too large',message:'The object exceeded the maximum allowed size'}});return;}
    if(S.failUpload){res({data:null,error:{message:'upload failed'}});return;}
    S.storage[b+'/'+path]={size:blob.size,type:blob.type};res({data:{path:path},error:null});},5);});},
  remove:function(ps){ps.forEach(function(p){delete S.storage[b+'/'+p];});return Promise.resolve({data:[],error:null});},
  createSignedUrl:function(p){return Promise.resolve({data:{signedUrl:'https://xosbchskdtkxogppmkex.supabase.co/storage/v1/object/sign/'+b+'/'+p+'?token=x'},error:null});},
  createSignedUrls:function(ps){S.signed=S.signed||[];S.signed.push(ps.slice());return Promise.resolve({data:ps.map(function(p){return {path:p,signedUrl:'https://xosbchskdtkxogppmkex.supabase.co/storage/v1/object/sign/'+b+'/'+p+'?token=x',error:null};}),error:null});}
};}};
// Edge Functions mock. S.fn.mode: ok | missing (404) | nokey (503) | ratelimit (429) | fail (500) | e502 | e401 | e413 | parse | network | slow | unsure | vin
S.fn={mode:'missing',calls:[],delay:60};
S.est={mode:'ok',delay:80};
function FE(name,status,body){return {name:name,message:name,context:status?{status:status,json:body?function(){return Promise.resolve(body);}:undefined}:undefined};}
var functions={invoke:function(name,opts){return new Promise(function(res){
  S.fn.calls.push({name:name,body:opts&&opts.body});
  if(name==='estimate-value'){
    var eb=(opts&&opts.body)||{},em=S.est.mode;
    setTimeout(function(){
      if(em==='missing')return res({data:null,error:FE('FunctionsHttpError',404)});
      if(em==='off'||em==='notconf'){return res({data:null,error:FE('FunctionsHttpError',503,{error:em==='off'?'not_enabled':'not_configured',message:'Value estimates are not turned on yet.'})});}
      if(em==='network')return res({data:null,error:FE('FunctionsFetchError')});
      if(eb.probe)return res({data:{enabled:true,remaining:20},error:null});
      if(em==='g429')return res({data:null,error:FE('FunctionsHttpError',503,{error:'not_enabled',code:'provider_429',message:'Value estimates are not turned on yet.'})});
      if(em==='ratelimit')return res({data:null,error:FE('FunctionsHttpError',429,{error:'rate_limited'})});
      if(em==='refreshlimit')return res({data:null,error:FE('FunctionsHttpError',429,{error:'refresh_limited',retry_after_s:3600})});
      if(em==='e502')return res({data:null,error:FE('FunctionsHttpError',502,{error:'upstream_error',code:'provider_timeout'})});
      if(em==='noprice')return res({data:{low:null,mid:null,high:null,as_of:null,sources:[],confidence:0,notes:'No reliable market prices were found for this vehicle.',cached:false},error:null});
      if(em==='e403')return res({data:null,error:FE('FunctionsHttpError',403,{error:'forbidden'})});
      // v25b: first / collection / cap / incomplete
      S.est.reasons=S.est.reasons||[];S.est.reasons.push(eb.mode||eb.reason||'user');
      if(eb.mode==='collection_start'){var cr=(S.est.col=S.est.col||{});if(cr[eb.owner_id]&&Date.now()-cr[eb.owner_id]<864e5)return res({data:null,error:FE('FunctionsHttpError',429,{error:'collection_limited',message:'Values for this collection were already refreshed today.'})});cr[eb.owner_id]=Date.now();return res({data:{started:true},error:null});}
      if(em==='cap')return res({data:null,error:FE('FunctionsHttpError',429,{error:'monthly_cap',message:"This month's value-estimate budget is used up. Values refresh again next month."})});
      var _vr=(S.tables.vehicles||[]).filter(function(x){return x.id===eb.vehicle_id;})[0];
      if(_vr){var _ms=[];if(!(Number(_vr.year)>=1886))_ms.push('year');if(!_vr.make)_ms.push('make');if(!_vr.model)_ms.push('model');if(_ms.length)return res({data:null,error:FE('FunctionsHttpError',400,{error:'incomplete_vehicle',missing:_ms,message:'Add the '+_ms.join(' and ')+' first.'})});}
      var _ex=(S.tables.ai_estimates||[]).filter(function(x){return x.vehicle_id===eb.vehicle_id&&x.kind==='value';});
      if(eb.reason==='first'&&_ex.length)return res({data:{skipped:'has_value'},error:null});
      if(eb.reason==='collection'&&_ex.some(function(x){return Date.now()-new Date(x.as_of).getTime()<7*864e5;}))return res({data:{skipped:'fresh'},error:null});
      // ok: emulate the service-role write into ai_estimates, then answer
      var vid=eb.vehicle_id,n=(S.est.n=(S.est.n||0)+1),mid=100000+n*2500,rows=(S.tables.ai_estimates||(S.tables.ai_estimates=[]));
      var src=[{title:'bringatrailer.com',url:'https://example.com/bat'},{title:'hagerty.com',url:'https://example.com/hagerty'}];
      rows.push({id:'ae-'+n,vehicle_id:vid,kind:'value',value_low:mid-9000,value_mid:mid,value_high:mid+11000,currency:'USD',confidence:0.72,sources:src,health_score:null,reasons:[],notes:'Based on recent sales. Adjusted for mileage and condition.',model_version:'gemini-3.5-flash',as_of:new Date().toISOString(),created_at:new Date().toISOString()});
      res({data:{low:mid-9000,mid:mid,high:mid+11000,as_of:new Date().toISOString().slice(0,10),sources:src,confidence:0.72,notes:'Based on recent sales.',cached:false},error:null});
    },S.est.delay||80);return;
  }
  setTimeout(function(){
    var m=S.fn.mode;
    if(m==='ok')return res({data:{year:1996,make:'Porsche',model:'911 Carrera',trim:null,color:'Guards Red',confidence:0.62,notes:'Looks like a 993, built 1995-1998.',vin:null,source:'vision'},error:null});
    if(m==='vin')return res({data:{year:1995,make:'Porsche',model:'911',trim:'Carrera',color:'Silver',confidence:0.95,notes:'Year, make and model come from the VIN (NHTSA decode).',vin:'WP0AA2991SS320000',source:'vin+vision'},error:null});
    if(m==='unsure')return res({data:{year:null,make:null,model:null,trim:null,color:null,confidence:0,notes:'No vehicle visible.',vin:null},error:null});
    if(m==='missing')return res({data:null,error:FE('FunctionsHttpError',404)});
    if(m==='nokey')return res({data:null,error:FE('FunctionsHttpError',503)});
    if(m==='ratelimit')return res({data:null,error:FE('FunctionsHttpError',429)});
    if(m==='network')return res({data:null,error:FE('FunctionsFetchError')});
    if(m==='slow')return;
    if(m==='e502')return res({data:null,error:FE('FunctionsHttpError',502,{error:'upstream_error',code:'provider_404',detail:'NOT_FOUND: model no longer available'})});
    if(m==='e401')return res({data:null,error:FE('FunctionsHttpError',401)});
    if(m==='e413')return res({data:null,error:FE('FunctionsHttpError',413,{error:'too_large'})});
    if(m==='parse')return res({data:'<html>oops</html>',error:null});
    res({data:null,error:FE('FunctionsHttpError',500)});
  },S.fn.delay);});}};

// ---- migration_017 RPCs (sort order, permanent delete, merge). S.no017=true simulates the migration not applied ----
function canEditColl(o){return role()==='admin'||own(o)||managedMine(o);}
function vrow(id){return T('vehicles').filter(function(x){return x.id===id;})[0];}
function techOn(v){var u=uid();return T('tech_access').some(function(a){return a.tech_id===u&&a.owner_id===v.owner_id&&a.status==='active'&&(!a.vehicle_id||a.vehicle_id===v.id);})||managedMine(v.owner_id);}
function canDel(v){if(!v||!uid())return false;if(T('vehicle_merges').some(function(m){return m.drop_id===v.id&&!m.undone_at;}))return false;return role()==='admin'||own(v.owner_id)||(v.created_by===uid()&&techOn(v));}
var E42={data:null,error:{code:'42501',message:'not_allowed'}};
var R017={
 save_vehicle_order:function(a){var ids=a.p_ids||[],pf=a.p_portfolio,first=vrow(ids[0]);if(!first)return E42;
   if(ids.some(function(id){var v=vrow(id);return !v||v.owner_id!==first.owner_id||(pf&&v.portfolio_id&&v.portfolio_id!==pf);}))return {data:null,error:{code:'42501',message:'car_not_in_portfolio'}};
   if(!canEditColl(first.owner_id))return E42;ids.forEach(function(id,i){vrow(id).sort_order=i+1;});return {data:ids.length,error:null};},
 can_delete_vehicles:function(a){return {data:(a.p_ids||[]).filter(vrow).map(function(id){return {id:id,can_delete:canDel(vrow(id))};}),error:null};},
 delete_vehicle_permanently:function(a){var v=vrow(a.p_id);if(!canDel(v))return E42;S.tables.vehicles=T('vehicles').filter(function(x){return x!==v;});
   ['vehicle_photos','documents','reminders','expenses','service_records','ai_estimates','advisories','vehicle_financials'].forEach(function(t){S.tables[t]=T(t).filter(function(r){return r.vehicle_id!==v.id;});});
   S.log.push({op:'rpc-delete',t:'vehicles',id:v.id});return {data:true,error:null};},
 merge_vehicles:function(a){var k=vrow(a.p_keep),d=vrow(a.p_drop),f=a.p_fields||{};if(!k||!d||k===d)return {data:null,error:{code:'22023',message:'pick_two_cars'}};
   if(k.owner_id!==d.owner_id||!canEditColl(k.owner_id))return E42;if(k.archived)return {data:null,error:{code:'22023',message:'keep_car_archived'}};if(d.merged_into)return {data:null,error:{code:'22023',message:'already_merged'}};
   var AL=['year','make','model','color','nickname','vin','plate','plate_region','mileage','notes'],kb={},moved={},fin={};AL.forEach(function(c){kb[c]=k[c]===undefined?null:k[c];});
   var db={archived:d.archived,vin:d.vin||null,sort_order:d.sort_order==null?null:d.sort_order};
   if(f.vin&&f.vin===d.vin)d.vin=null;AL.forEach(function(c){if(f.hasOwnProperty(c))k[c]=f[c];});
   ['vehicle_photos','documents','reminders','expenses','service_records','ai_estimates','advisories'].forEach(function(t){moved[t]=[];T(t).forEach(function(r){if(r.vehicle_id===d.id){if(!r.id)r.id=uuid();r.vehicle_id=k.id;moved[t].push(r.id);}});});
   var kf=T('vehicle_financials').filter(function(r){return r.vehicle_id===k.id;})[0],df=T('vehicle_financials').filter(function(r){return r.vehicle_id===d.id;})[0];
   if(df){if(!kf){df.vehicle_id=k.id;fin.moved=true;}else{var fb={},any=false;Object.keys(df).forEach(function(c){if(['vehicle_id','owner_id','created_at','updated_at'].indexOf(c)>=0)return;
       if(f.hasOwnProperty('fin_'+c)){fb[c]=kf[c]===undefined?null:kf[c];kf[c]=f['fin_'+c];any=true;}else if((kf[c]==null)&&df[c]!=null){fb[c]=kf[c]===undefined?null:kf[c];kf[c]=df[c];any=true;}});if(any){fin.filled=true;fin.keep_before=fb;}}}
   d.archived=true;d.archived_at=new Date().toISOString();d.merged_into=k.id;d.sort_order=null;
   var id=uuid();T('vehicle_merges').push({id:id,owner_id:k.owner_id,user_id:uid(),keep_id:k.id,drop_id:d.id,keep_before:kb,drop_before:db,fields:f,moved:moved,financials:fin,created_at:new Date().toISOString(),undone_at:null});
   var cnt={};Object.keys(moved).forEach(function(t){cnt[t]=moved[t].length;});return {data:{merge_id:id,keep_id:k.id,drop_id:d.id,moved:cnt,financials:fin},error:null};},
 undo_merge:function(a){var m=T('vehicle_merges').filter(function(x){return x.id===a.p_merge;})[0];if(!m||!canEditColl(m.owner_id))return E42;if(m.undone_at)return {data:null,error:{code:'22023',message:'already_undone'}};
   var n=0;Object.keys(m.moved).forEach(function(t){T(t).forEach(function(r){if(r.vehicle_id===m.keep_id&&m.moved[t].indexOf(r.id)>=0){r.vehicle_id=m.drop_id;n++;}});});
   if(m.financials.moved){var f2=T('vehicle_financials').filter(function(r){return r.vehicle_id===m.keep_id;})[0];if(f2)f2.vehicle_id=m.drop_id;}
   else if(m.financials.filled){var f3=T('vehicle_financials').filter(function(r){return r.vehicle_id===m.keep_id;})[0];if(f3)Object.keys(m.financials.keep_before).forEach(function(c){f3[c]=m.financials.keep_before[c];});}
   var k=vrow(m.keep_id),d=vrow(m.drop_id);Object.keys(m.keep_before).forEach(function(c){k[c]=m.keep_before[c];});
   d.archived=!!m.drop_before.archived;d.archived_at=d.archived?d.archived_at:null;if(m.drop_before.vin)d.vin=m.drop_before.vin;d.merged_into=null;d.sort_order=m.drop_before.sort_order;
   m.undone_at=new Date().toISOString();return {data:{merge_id:m.id,moved_back:n,restored:m.drop_id},error:null};}
};
var client={auth:auth,from:function(t){return Q(t);},rpc:rpc,storage:storage,functions:functions};
var lib={createClient:function(){return client;}};
Object.defineProperty(window,'supabase',{get:function(){return lib;},set:function(){}});
})();
