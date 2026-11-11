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
