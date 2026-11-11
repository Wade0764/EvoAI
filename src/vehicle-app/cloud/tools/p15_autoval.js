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
      if(VALUE.busy[vid]&&Date.now()-t0<95000){setTimeout(wait,250);return;}
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
  return Promise.resolve(reloadAll(true)).then(function(){var n=valueAutoMissing(AUTOV.max);ptrShow(PTR.th,n?'Estimating '+n+' vehicle'+(n===1?'':'s'):'Up to date');})
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
