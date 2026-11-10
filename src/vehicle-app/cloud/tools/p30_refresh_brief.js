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
