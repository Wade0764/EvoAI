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
  if(kind==='loading'){var sp=document.createElement('span');sp.className='ai-spin';n.appendChild(sp);}
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
  })();
}
