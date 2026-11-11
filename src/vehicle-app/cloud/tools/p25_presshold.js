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
   '<p class="ph-note">Delete permanently is only for the owner or admin. Technicians can only delete cars they added. This cannot be undone after 10 seconds.</p>'+
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
      else{delete PH.pend[id];refreshCurrent();showToast(r.error.code==='42501'?'You can only delete cars you added. '+name+' was not deleted.':'Could not delete '+name+'. It is still here.');return;}}
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
