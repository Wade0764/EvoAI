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
    '<div><div class="vl"'+(hasV?'':' style="color:var(--text-muted);font-size:14px;"')+'>'+(hasV?money(aiVal(v)):'No estimate')+'</div>'+cardStatusLine(v)+'</div></div>'+(extra?'<div class="meta2">'+extra+'</div>':'')+'</div>';
}

var PF_TAGS=['Exterior','Interior','Engine','Detail','Work'];
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
function pfCanModify(v,p){return !!(v&&p&&(canEditVehicle(v)||(p.by===myId()&&can(v,'view_photos'))));}
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
async function pfSetTag(pid,tag){
  var v=PF.v;if(!v)return;
  try{chk(await sb.from('vehicle_photos').update({tag:tag||null}).eq('id',pid));
    PF.focusId=pid;await loadAll();refreshDetailIfOpen();showToast(tag?'Tagged '+tag:'Tag removed','success');
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
function pfEncode(d,max,q){
  return new Promise(function(res,rej){
    var sc=Math.min(1,max/Math.max(d.w,d.h)),w=Math.max(1,Math.round(d.w*sc)),h=Math.max(1,Math.round(d.h*sc));
    var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(d.src,0,0,w,h);
    c.toBlob(function(b){c.width=c.height=0;b?res(b):rej(new Error('encode'));},'image/jpeg',q);
  });
}
async function pfProcess(file){
  if(!file||!/^image\//.test(file.type||'')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''))throw new Error('notimage');
  if(file.size>40*1024*1024)throw new Error('toolarge');
  var d=await pfDecode(file).catch(function(){throw new Error('decode');});
  try{
    var keep=(file.type==='image/jpeg'&&file.size<=14*1024*1024);
    var orig=keep?file:await pfEncode(d,4096,0.92);
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
function pfShowAdd(v){
  pfCloseAdd(true);
  var el=document.createElement('div');el.className='pfa';el.id='pfa';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Add photos');
  el.innerHTML='<div class="pfa-sheet"><div class="pfa-top"><div class="pfa-title">Add photos</div><button class="pfa-x" type="button" aria-label="Close" onclick="pfCloseAdd()">'+pfIcon('x')+'</button></div>'+
    '<div class="pfa-sub">'+esc(heroHead(v))+(v.nickname?' / '+esc(vFull(v)):'')+'</div>'+
    '<input type="file" id="pfa-input" accept="image/*" multiple style="display:none">'+
    '<button class="pfa-pick" type="button" id="pfa-pick" onclick="document.getElementById(\'pfa-input\').click()">'+pfIcon('plus')+'<span>Choose photos</span><em>Up to 20 at a time</em></button>'+
    '<div class="pfa-tagall" id="pfa-tagall"></div><div class="pfa-grid" id="pfa-grid"></div><div class="pfa-msg" id="pfa-msg" role="status" aria-live="polite"></div>'+
    '<div class="pfa-bar"><div class="pfa-prog" id="pfa-prog"><i></i></div><button class="pfa-go" id="pfa-go" type="button" disabled onclick="pfUploadAll()">Upload</button></div></div>';
  document.body.appendChild(el);
  PF.add={el:el,items:[],busy:false,seq:0,tag:'Exterior',opener:document.activeElement};
  el.addEventListener('click',function(e){if(e.target===el&&!PF.add.busy)pfCloseAdd();});
  PF.add.key=function(e){if(e.key==='Escape'&&PF.add&&!PF.add.busy){e.preventDefault();pfCloseAdd();}};
  document.addEventListener('keydown',PF.add.key);
  document.getElementById('pfa-input').addEventListener('change',function(){pfAddFiles(this.files);this.value='';});
  document.body.classList.add('pfa-open');
  pfAddRender();
  setTimeout(function(){el.classList.add('on');var b=document.getElementById('pfa-pick');if(b)b.focus();},10);
}
function pfCloseAdd(quick){
  var A=PF.add;if(!A)return;PF.add=null;
  document.removeEventListener('keydown',A.key);document.body.classList.remove('pfa-open');
  A.items.forEach(function(it){if(it.url)URL.revokeObjectURL(it.url);});
  A.el.classList.remove('on');var el=A.el;setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},quick||pfRM()?0:200);
  try{if(A.opener&&A.opener.focus&&!quick)A.opener.focus();}catch(e){}
}
function pfAddFiles(files){
  var A=PF.add;if(!A||A.busy||!files)return;
  var room=20-A.items.length,added=0,skipped=0;
  for(var i=0;i<files.length;i++){
    var f=files[i];
    if(added>=room){skipped++;continue;}
    if(!/^image\//.test(f.type||'')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name||'')){skipped++;continue;}
    A.items.push({id:++A.seq,file:f,url:URL.createObjectURL(f),tag:A.tag,state:'ready',err:''});added++;
  }
  var m=document.getElementById('pfa-msg');if(m)m.textContent=skipped?(skipped+' file'+(skipped===1?' was':'s were')+' skipped (not a photo, or more than 20).'):'';
  pfAddRender();
}
function pfAddRender(){
  var A=PF.add;if(!A)return;
  var tg=document.getElementById('pfa-tagall');
  if(tg)tg.innerHTML=A.items.length?'<span class="lab">Tag all</span>'+PF_TAGS.map(function(t){return '<button type="button" class="pfg-chip'+(A.tag===t?' on':'')+'" onclick="pfAddTagAll(\''+t+'\')">'+t+'</button>';}).join(''):'';
  var g=document.getElementById('pfa-grid');
  if(g)g.innerHTML=A.items.map(function(it){
    return '<div class="pfa-it '+it.state+'" data-id="'+it.id+'"><img alt="Selected photo" src="'+esc(it.url)+'" decoding="async"><button type="button" class="pfa-tg" aria-label="Tag: '+esc(it.tag)+'. Tap to change" onclick="pfAddCycle('+it.id+')">'+esc(it.tag)+'</button>'+
      (A.busy?'':'<button type="button" class="pfa-rm" aria-label="Remove photo" onclick="pfAddRemove('+it.id+')">'+pfIcon('x')+'</button>')+
      (it.state==='done'?'<span class="pfa-st ok">Added</span>':it.state==='fail'?'<span class="pfa-st bad" title="'+esc(it.err)+'">Failed</span>':it.state==='work'?'<span class="pfa-st">Uploading</span>':'')+'</div>';}).join('');
  var go=document.getElementById('pfa-go'),ready=A.items.filter(function(i){return i.state==='ready'||i.state==='fail';}).length;
  if(go){go.disabled=A.busy||!ready;go.textContent=A.busy?'Uploading...':(ready?'Upload '+ready+' photo'+(ready===1?'':'s'):'Upload');}
  var pk=document.getElementById('pfa-pick');if(pk)pk.disabled=A.busy;
}
function pfAddTagAll(t){var A=PF.add;if(!A||A.busy)return;A.tag=t;A.items.forEach(function(i){if(i.state!=='done')i.tag=t;});pfAddRender();}
function pfAddCycle(id){var A=PF.add;if(!A||A.busy)return;A.items.forEach(function(i){if(i.id===id){i.tag=PF_TAGS[(PF_TAGS.indexOf(i.tag)+1)%PF_TAGS.length];}});pfAddRender();}
function pfAddRemove(id){var A=PF.add;if(!A||A.busy)return;A.items=A.items.filter(function(i){if(i.id===id&&i.url)URL.revokeObjectURL(i.url);return i.id!==id;});pfAddRender();}
function pfUploadAll(){
  var A=PF.add,v=PF.v;if(!A||A.busy||!v)return;
  var todo=A.items.filter(function(i){return i.state==='ready'||i.state==='fail';});if(!todo.length)return;
  if(!pfCanAdd(v)){showToast('Photos are not enabled for you on this vehicle.','error');return;}
  A.busy=true;var done=0,fails=0,first='';
  var hasCover=(v._photos||[]).some(function(p){return p.isCover;});
  var base=(v._photos||[]).reduce(function(m,p){return Math.max(m,(Number(p.sort)||0)+1);},(v._photos||[]).length);if(!isFinite(base))base=(v._photos||[]).length;
  var msg=document.getElementById('pfa-msg'),bar=document.querySelector('#pfa-prog i');
  pfAddRender();
  function setP(){if(bar)bar.style.width=Math.round(100*(done+fails)/todo.length)+'%';if(msg)msg.textContent='Uploading '+Math.min(todo.length,done+fails+1)+' of '+todo.length+'...';}
  setP();
  var chain=Promise.resolve();
  todo.forEach(function(it,ix){
    chain=chain.then(async function(){
      if(!PF.add)return;
      it.state='work';pfAddRender();
      var id=uid(),b=v.clientId+'/'+v.id+'/portfolio/'+id,paths={o:b+'.jpg',t:b+'_t.jpg',d:b+'_d.jpg'},up=[];
      try{
        var out=await pfProcess(it.file);
        async function put(path,blob){chk(await sb.storage.from('vehicle-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false}));up.push(path);}
        await put(paths.d,out.disp);await put(paths.t,out.thumb);await put(paths.o,out.orig);
        var cover=!hasCover&&!first;
        var r=await sb.from('vehicle_photos').insert({id:id,vehicle_id:v.id,uploaded_by:myId(),storage_path:paths.o,thumb_path:paths.t,display_path:paths.d,tag:it.tag,is_cover:cover,sort_order:base+ix});
        chk(r);
        if(cover)hasCover=true;
        if(!first)first=id;
        it.state='done';done++;
      }catch(e){
        up.forEach(function(p){removeObject('vehicle-photos',p);});
        if(e&&(e.code==='42703'||e.code==='PGRST204')){PF.ready=false;}
        it.state='fail';it.err=pfErr(e);fails++;
      }
      setP();pfAddRender();
    });
  });
  chain.then(async function(){
    if(!PF.add)return;
    A.busy=false;
    if(msg=document.getElementById('pfa-msg'))msg.textContent=(done?done+' photo'+(done===1?'':'s')+' added. ':'')+(fails?fails+' failed: '+(todo.filter(function(i){return i.state==='fail';})[0]||{}).err+'. Tap Upload to retry.':'');
    pfAddRender();
    if(done){
      PF.focusId=first;PF.tag='';
      try{await loadAll();}catch(e){}
      refreshCurrent();refreshDetailIfOpen();
      if(!fails){showToast(done+' photo'+(done===1?'':'s')+' added to the portfolio','success');setTimeout(function(){pfCloseAdd();},350);}
    }
    if(PF.ready===false){pfCloseAdd();showToast(PF_NOTICE,'error');pfRenderControls();}
  });
}
function pfErr(e){
  var m=String((e&&(e.message||e))||'');
  if(m==='notimage')return 'not a photo';if(m==='toolarge')return 'file is too large';
  if(m==='decode')return 'could not read this photo (try a JPEG)';
  return friendlyError(e);
}
