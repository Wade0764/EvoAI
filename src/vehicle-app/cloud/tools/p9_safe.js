// ============ dz: client title + edge swipe-back ============
function ctitleName(n){
  n=String(n||'').trim();if(!n)return 'My Collection';
  var small={'&':1,'and':1,'of':1,'the':1,'de':1};
  return n.split(/\s+/).map(function(w,i){var l=w.toLowerCase();if(i&&small[l])return l;return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ');
}
function ctitleHTML(n){
  var t=ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  return '<div class="ctitle-eyebrow">'+(coll?'The Private Collection':'Private Collection')+'</div><h2 class="ctitle-name">'+esc(t)+'</h2><div class="ctitle-rule" aria-hidden="true"><b></b><i></i></div>';
}
function ctitleSet(id,n){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n);
  el.setAttribute('data-name',String(n||''));
}
// ---- swipe from the left edge = Back ----
var SWB={edge:24,on:null};
function swbTarget(){
  try{if(window.PF&&PF.lb){if(PF.lb.s>1.02)return null;return {el:PF.lb.el,act:function(){pfCloseLightbox();}};}}catch(e){}
  try{if(typeof SHEET_EL!=='undefined'&&SHEET_EL){var s=SHEET_EL.querySelector('.sheet')||SHEET_EL;return {el:s,act:function(){sheetClose();}};}}catch(e){}
  var ms=[].slice.call(document.querySelectorAll('.modal-overlay')).filter(function(m){return m._open||m.classList.contains('active');});
  if(ms.length){ms.sort(function(a,b){return (+getComputedStyle(a).zIndex||0)-(+getComputedStyle(b).zIndex||0);});var m=ms[ms.length-1];
    var bb=m.querySelector('.backbtn')||m.querySelector('.modal-close');var box=m.querySelector('.modal')||m;
    return {el:box,act:function(){if(bb)bb.click();else closeModal(m.id);}};}
  var pg=document.querySelector('.page.active');if(pg){var b=pg.querySelector('.backbar .backbtn');if(b&&b.offsetParent)return {el:pg,act:function(){b.click();}};}
  return null;
}
function swbInit(){
  if(SWB.init)return;SWB.init=1;
  var bar=document.createElement('div');bar.id='swb-edge';document.body.appendChild(bar);
  function sal(){var v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sal'))||0;return v;}
  window.addEventListener('pointerdown',function(e){
    if(e.pointerType==='mouse')return;
    if(e.clientX>SWB.edge+sal())return;
    var t=swbTarget();if(!t)return;
    SWB.claim={t:t,x:e.clientX,y:e.clientY};e.stopPropagation();
  },true);
  window.addEventListener('touchstart',function(e){
    if(e.touches.length>1){if(SWB.on)swbEnd(false);SWB.claim=null;return;}
    var p=e.touches[0];if(p.clientX>SWB.edge+sal()){SWB.claim=null;return;}
    var t=(SWB.claim&&SWB.claim.t)||swbTarget();SWB.claim=null;if(!t)return;
    SWB.on={t:t,x0:p.clientX,y0:p.clientY,dx:0,mode:0,t0:Date.now()};e.stopPropagation();
  },{capture:true,passive:true});
  window.addEventListener('touchmove',function(e){
    var S=SWB.on;if(!S)return;
    if(e.touches.length>1){swbEnd(false);return;}
    var p=e.touches[0],dx=p.clientX-S.x0,dy=p.clientY-S.y0;
    if(!S.mode){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      if(dx>0&&dx>Math.abs(dy)*1.4){S.mode=1;S.el=S.t.el;S.el.style.transition='none';S.el.style.willChange='transform';S.el.classList.add('swb-shadow');document.getElementById('swb-edge').style.opacity='1';}
      else{SWB.on=null;return;}}
    e.preventDefault();e.stopPropagation();
    S.dx=Math.max(0,dx);S.el.style.transform='translate3d('+S.dx+'px,0,0)';
  },{capture:true,passive:false});
  function endH(e){var S=SWB.on;if(!S)return;if(S.mode){e.stopPropagation();var v=S.dx/Math.max(1,Date.now()-S.t0);swbEnd(S.dx>Math.min(110,innerWidth*.3)||(v>.5&&S.dx>40));}else SWB.on=null;}
  window.addEventListener('touchend',endH,true);
  window.addEventListener('touchcancel',function(){if(SWB.on)swbEnd(false);},true);
}
function swbEnd(go){
  var S=SWB.on;SWB.on=null;if(!S||!S.el){return;}
  var el=S.el;document.getElementById('swb-edge').style.opacity='0';
  el.style.transition='transform .2s ease';
  el.style.transform=go?'translate3d('+innerWidth+'px,0,0)':'translate3d(0,0,0)';
  setTimeout(function(){
    if(go){try{S.t.act();}catch(e){}SWB.last=Date.now();}
    el.style.transition='';el.style.transform='';el.style.willChange='';el.classList.remove('swb-shadow');
  },go?190:210);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',swbInit);else swbInit();
