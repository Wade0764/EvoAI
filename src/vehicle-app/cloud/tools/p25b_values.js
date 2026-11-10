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
      if(VALUE.busy[vid]&&Date.now()-t0<95000){setTimeout(wait,250);return;}
      delete VALUE.reason[vid];
      var n=VALUE.note[vid];VQ.done++;
      if(n&&n.kind==='limit'){VQ.stopped=n.text;}
      else if(n&&n.kind!=='done'){VQ.fail++;}
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
