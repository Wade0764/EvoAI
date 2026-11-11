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
function aiVal(v){
  if(!v||!session||!can(v,'view_value_estimate'))return null;
  var a=v.aiValue;return (a&&Number(a.value)>0)?Number(a.value):null;
}
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
function portfolioTotals(vehicles){
  var value=0,low=0,high=0,basis=0,basisAll=0,gain=0,nValued=0,nPending=0,dsum=0,nDelta=0,perm=false,exs=getExpenses();
  for(var i=0;i<vehicles.length;i++){
    var v=vehicles[i],g=vehicleGain(v,exs);
    if(can(v,'view_value_estimate'))perm=true;
    basisAll+=g.basis;
    if(g.hasValue){value+=g.value;nValued++;var a=v.aiValue;low+=Number(a.low)>0?Number(a.low):g.value;high+=Number(a.high)>0?Number(a.high):g.value;if(Number(a.prev)>0){dsum+=a.value-a.prev;nDelta++;}}else nPending++;
    if(g.hasGain){basis+=g.basis;gain+=g.gain;}
  }
  return {value:value,low:low,high:high,basis:basis,basisAll:basisAll,gain:gain,pctGain:basis?(gain/basis)*100:0,nValued:nValued,nPending:nPending,nTotal:vehicles.length,delta:dsum,nDelta:nDelta,perm:vehicles.length?perm:true};
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
function valueHeadHTML(v,g){
  var perm=can(v,'view_value_estimate');
  var h='<div class="lab">Estimated value'+(g.hasValue?' <span class="est-chip">Estimate</span>':'')+'</div><div class="num">';
  if(g.hasValue)h+=bigNum(g.value);
  else h+='<span style="font-size:.34em;color:var(--text-muted);letter-spacing:0;">'+esc(perm?noValueText():'Value is not shared with you')+'</span>';
  h+='</div>';
  if(g.hasValue){
    var a=v.aiValue,dl=valueDeltaText(a);
    h+='<div class="doc-meta" style="margin-top:6px;">'+(Number(a.low)>0?'Range '+money(a.low)+' to '+money(a.high)+' / ':'')+'as of '+esc(fmtDate(a.asOf))+(dl?' / '+esc(dl):'')+'</div>';
  }
  return h;
}
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
function aiPanelHTML(v){
  var a=v.aiValue,out='',perm=can(v,'view_value_estimate'),hv=aiVal(v)!==null,nt=VALUE.note[v.id];
  out+='<div class="brief" style="margin-top:22px;" id="val-panel"><div class="brief-head"><div class="brief-title">Value estimate</div><span class="brief-chip">Estimate, not an appraisal</span></div>';
  if(hv){
    out+='<p>'+esc(money(a.value))+' estimated. '+esc(aiValueMeta(v))+'.</p>';
    var dl=valueDeltaText(a);if(dl)out+='<p class="'+(a.value<a.prev?'neg':'')+'">'+esc(dl)+'.</p>';
    if(a.notes)out+='<p style="color:var(--text-muted);">'+esc(a.notes)+'</p>';
    out+='<p style="color:var(--text-muted);">Sources: '+(a.sources&&a.sources.length?valueSrcLinks(a.sources):'none listed')+'</p>';
    out+='<p class="doc-meta">Found with Google Search and updated weekly. Market prices for this year, make, model and trim, adjusted for the mileage and condition on file. Nobody can type a value in.</p>';
  }else if(!perm){
    out+='<p style="color:var(--text-muted);">The owner has not shared the value estimate with you.</p>';
  }else if(VALUE.state==='off'){
    out+='<p style="color:var(--text-muted);" id="val-off">Value estimates are not turned on yet. Nothing is wrong with your vehicle or your data. The estimate will appear here once it is switched on.</p>';
  }else out+='<p style="color:var(--text-muted);">No estimate yet. Tap Get estimate to look up current market prices.</p>';
  if(nt)out+='<p class="val-note" data-kind="'+esc(nt.kind)+'">'+esc(nt.text)+'</p>';
  out+=valueButtonHTML(v,hv);
  out+='</div>';
  var h=healthInfo(v);
  out+='<div class="brief" style="margin-top:14px;" id="health-panel"><div class="brief-head"><div class="brief-title">Health score</div><span class="brief-chip">Calculated from your records</span></div>';
  if(h){
    out+='<p><b>'+h.score+' of 100</b> ('+esc(h.label)+'). Updated '+esc(fmtDate(h.asOf))+'.</p>';
    out+='<ul style="margin:6px 0 0 18px;padding:0;">'+h.reasons.map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul>';
    out+='<p class="doc-meta" style="margin-top:8px;">'+esc(h.basis)+' Worked out on this device from service history and intervals, reminders, documents and gaps. It updates when your records change and cannot be typed in.</p>';
  }else out+='<p style="color:var(--text-muted);">The owner has not shared the health score with you.</p>';
  out+='</div>';
  return out;
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
  var call;try{call=Promise.resolve(sb.functions.invoke('estimate-value',{body:{vehicle_id:vid}}));}
  catch(e){call=Promise.resolve({data:null,error:{name:'FunctionsFetchError'}});}
  var timer=new Promise(function(res){setTimeout(function(){res({data:null,error:{name:'Timeout'}});},90000);});
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
