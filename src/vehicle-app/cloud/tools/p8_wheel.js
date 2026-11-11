// ============ COLLECTION ROUNDABOUT (3D horizontal ring of hero cards) ============
var WHL_ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function wheelCardHTML(v,i){
  var src=imgSrc(v),np=pfCanView(v)?(v._photos||[]).length:0,lv=v.lastServiceDate?fmtDate(v.lastServiceDate):'';
  var nick=v.nickname&&String(v.nickname).trim();
  var cl='';if(isAdvisor()){var c=byId(getClients(),v.clientId);if(c&&getClients().length>1)cl=c.name;}
  var label=heroHead(v)+(nick?', '+vFull(v):'')+(np?', '+np+' photo'+(np===1?'':'s'):'')+(lv?', last visit '+lv:'');
  return '<article class="whl-card" role="option" aria-selected="false" data-i="'+i+'" data-id="'+esc(v.id)+'" aria-label="'+esc(label)+'">'+
    '<div class="whl-ph vig">'+(src?'<img alt="" draggable="false" decoding="async" data-src="'+esc(src)+'">':'<div class="whl-none" role="img" aria-label="Photo pending">'+CAR_SVG+'<em>Photo pending</em></div>')+
    (np?'<span class="whl-badge glx">'+np+' photo'+(np===1?'':'s')+'</span>':'')+(lv?'<span class="whl-badge whl-lvchip glx">Last visit <b>'+esc(lv)+'</b></span>':'')+'</div>'+
    '<div class="whl-info"><div class="whl-r1"><div class="whl-t"><h3 class="whl-nm'+(nick?'':' ymm-only')+'">'+esc(heroHead(v))+'</h3>'+heroSubHTML(v,'whl-ymm')+(cl?'<div class="whl-cl">'+esc(cl)+'</div>':'')+'</div>'+'</div>'+
    '<div class="whl-op"><span>Open vehicle</span><i>'+WHL_ARROW+'</i></div></div><div class="whl-dim"></div></article>';
}
function wheelHTML(vehicles,key){
  var h='<div class="whl" data-key="'+esc(key)+'"><div class="whl-head"><div class="whl-pos glx" aria-live="polite"><b>01</b><span> / '+String(vehicles.length).padStart(2,'0')+'</span></div>'+
    (vehicles.length>1?'<span class="whl-hint">Swipe, drag or use arrow keys</span>':'')+'</div>'+
    '<div class="whl-stage" tabindex="0" role="listbox" aria-orientation="horizontal" aria-label="Vehicle collection. Use arrow keys to turn, Enter to open."><div class="whl-ring">'+
    vehicles.map(function(v,i){return wheelCardHTML(v,i);}).join('')+'</div><div class="whl-guide" aria-hidden="true"></div></div>';
  if(vehicles.length>1)h+='<div class="whl-nav"><button type="button" class="whl-arrow glx" aria-label="Previous vehicle" data-d="-1">'+pfIcon('l')+'</button><button type="button" class="whl-arrow glx" aria-label="Next vehicle" data-d="1">'+pfIcon('r')+'</button></div>';
  return h+'</div>';
}
function wheelMount(hostId,vehicles){
  var host=document.getElementById(hostId);if(!host)return;
  if(host._wheel){host._wheel.destroy();host._wheel=null;}
  var root=host.querySelector('.whl');
  host.classList.toggle('wheel-host',!!root);host.classList.toggle('car-grid',!root);
  if(!root)return;
  host._wheel=wheelInit(root,vehicles);
}
function wheelInit(root,vehicles){
  var N=vehicles.length,stage=root.querySelector('.whl-stage'),ring=root.querySelector('.whl-ring'),guide=root.querySelector('.whl-guide'),posEl=root.querySelector('.whl-pos b');
  var cards=[].slice.call(root.querySelectorAll('.whl-card')),dots=[];
  var G={},pos=0,target=0,vel=0,raf=0,last=0,active=-1,dragging=false,p0=null,moved=0,samples=[],alive=true,ro=null,wt=0,wlock=0;
  var rm=function(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);};
  function mod(a,n){return ((a%n)+n)%n;}
  function pad(n){return String(n).padStart(2,'0');}
  if(window.__WHEEL_START__!==undefined&&N>1){pos=target=Math.min(N-1,window.__WHEEL_START__);}
  if(N>1){for(var d=0;d<N;d++){var di=document.createElement('i');di.className='whl-dot';guide.appendChild(di);dots.push(di);}}
  function load(c){if(c._ld)return;c._ld=1;var im=c.querySelector('img');if(im){im.onload=function(){im.classList.add('ld');};im.src=im.getAttribute('data-src');}}
  function layout(){
    var W=stage.clientWidth;if(!W)return;
    var wide=W>=700,cw=wide?Math.min(320,Math.round(W*.28)):Math.min(240,W-150);cw=Math.max(170,cw);
    var ph=Math.round(cw*(wide?.9:1.02));
    root.style.setProperty('--cw',cw+'px');root.style.setProperty('--ph',ph+'px');
    var ch=cards[0].offsetHeight,SH=ch+64;
    stage.style.height=SH+'px';
    var cy=(SH-44)/2;
    cards.forEach(function(c){c.style.left=((W-cw)/2)+'px';c.style.top=(cy-ch/2)+'px';});
    G={W:W,SH:SH,cw:cw,ch:ch,cy:cy,step:(wide?34:38)*Math.PI/180,R:Math.max(220,cw*(wide?1.5:1.02)),persp:wide?980:720,drag:Math.max(150,cw*.75)};
    ring.style.perspective=G.persp+'px';
    if(N>1){
      var fy=cy+ch/2+20,rx=W*(wide?.36:.46),ry=22;G.fx=W/2;G.rx=rx;G.ry=ry;
      guide.style.cssText='left:0;top:'+(fy-ry)+'px;width:'+W+'px;height:'+(ry*2)+'px';
      var old=guide.querySelector('svg');if(old)guide.removeChild(old);
      guide.insertAdjacentHTML('afterbegin','<svg width="'+W+'" height="'+(ry*2)+'"><defs><linearGradient id="whlg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2F0EB" stop-opacity="0"/><stop offset=".5" stop-color="#F2F0EB" stop-opacity=".2"/><stop offset="1" stop-color="#F2F0EB" stop-opacity="0"/></linearGradient><radialGradient id="whls" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="'+(W/2)+'" cy="'+ry+'" rx="'+(cw*.62)+'" ry="'+(ry*.55)+'" fill="url(#whls)"/><ellipse cx="'+(W/2)+'" cy="'+ry+'" rx="'+rx+'" ry="'+(ry-1)+'" stroke="url(#whlg)" stroke-width="1" fill="none"/></svg>');
    }
    render(true);
  }
  function render(force){
    if(!G.W)return;
    for(var i=0;i<N;i++){
      var c=cards[i],d=i-pos;d=mod(d+N/2,N)-N/2;var a=d*G.step,ad=Math.abs(d),vis=N===1||Math.abs(a)<Math.PI*.5;
      if(!vis){if(c._v!==0||force){c.style.opacity=0;c.style.visibility='hidden';c._v=0;c.style.pointerEvents='none';}if(dots[i])dots[i].style.opacity=0;continue;}
      if(c._v!==1){c.style.visibility='';c._v=1;c.style.pointerEvents='';}
      if(ad<2.6)load(c);
      var tf;
      if(N===1||Math.abs(d)<.0005)tf='translate3d(0,0,0)';
      else tf='translate3d('+(G.R*Math.sin(a)).toFixed(2)+'px,0,'+(G.R*(Math.cos(a)-1)).toFixed(2)+'px) rotateY('+(a*180/Math.PI*.85).toFixed(3)+'deg)';
      c.style.transform=tf;
      var edge=N===1?1:Math.max(0,Math.min(1,(Math.PI*.5-Math.abs(a))/.32));
      c.style.opacity=edge.toFixed(3);
      c._dim=c._dim||c.querySelector('.whl-dim');c._dim.style.opacity=Math.min(.86,ad*.45).toFixed(3);
      c.style.zIndex=100-Math.round(ad*10);
      if(dots[i]){dots[i].style.transform='translate3d('+(G.fx+G.rx*Math.sin(a*1.05)).toFixed(1)+'px,'+(G.ry+(G.ry-1)*Math.cos(a*1.05)).toFixed(1)+'px,0)';dots[i].style.opacity=edge.toFixed(3);}
    }
    var ai=mod(Math.round(pos),N);
    if(ai!==active){
      if(active>=0){cards[active].classList.remove('front');cards[active].setAttribute('aria-selected','false');if(dots[active])dots[active].classList.remove('on');}
      active=ai;cards[ai].classList.add('front');cards[ai].setAttribute('aria-selected','true');if(dots[ai])dots[ai].classList.add('on');
      if(posEl)posEl.textContent=pad(ai+1);stage.setAttribute('aria-activedescendant','');
    }
  }
  function tick(now){
    var dt=Math.min(.034,(now-(last||now))/1000)||.016;last=now;
    if(!dragging){var k=165,cc=2*Math.sqrt(k)*.92;vel+=((target-pos)*k-vel*cc)*dt;pos+=vel*dt;
      if(Math.abs(target-pos)<.0004&&Math.abs(vel)<.003){pos=target;vel=0;render();raf=0;last=0;normalize();stage.classList.remove('mv');return;}}
    render();raf=requestAnimationFrame(tick);
  }
  function kick(){
    if(!alive)return;
    if(rm()&&!dragging){pos=target;vel=0;render();normalize();return;}
    stage.classList.add('mv');if(!raf){last=0;raf=requestAnimationFrame(tick);}
  }
  function normalize(){var r=Math.round(pos/N)*N;if(r){pos-=r;target-=r;}}
  function go(n){if(N<2)return;target=Math.round(target)+n;kick();}
  function openCard(i){var v=vehicles[i];if(v)openVehicleDetail(v.id);}
  stage.addEventListener('pointerdown',function(e){
    if(e.button||N<1)return;
    dragging=true;moved=0;try{stage.setPointerCapture(e.pointerId);}catch(x){}
    stage.classList.add('drag','mv');
    p0={x:e.clientX,y:e.clientY,pos:pos,t:e.timeStamp,card:e.target.closest&&e.target.closest('.whl-card')};samples=[{t:e.timeStamp,p:pos}];vel=0;
    try{stage.focus({preventScroll:true});}catch(x2){}
  });
  stage.addEventListener('pointermove',function(e){
    if(!dragging)return;var dx=e.clientX-p0.x,dy=e.clientY-p0.y;moved=Math.max(moved,Math.hypot(dx,dy));
    if(N<2)return;pos=p0.pos-dx/G.drag;samples.push({t:e.timeStamp,p:pos});if(samples.length>6)samples.shift();
    if(!raf)raf=requestAnimationFrame(tick);
  });
  function end(e){
    if(!dragging)return;dragging=false;stage.classList.remove('drag');
    var s0=samples[0],s1=samples[samples.length-1],dt=(s1.t-s0.t)/1000;
    vel=dt>0.008&&(e.timeStamp-s1.t)<80?(s1.p-s0.p)/dt:0;vel=Math.max(-14,Math.min(14,vel));
    if(moved<7&&p0&&p0.card&&e.type!=='pointercancel'){
      var i=+p0.card.getAttribute('data-i'),d=mod(i-pos+N/2,N)-N/2;
      if(Math.abs(d)<.5){target=Math.round(pos);kick();openCard(i);return;}
      target=Math.round(pos+d);vel=0;kick();return;
    }
    target=Math.round(pos+vel*.22);target=Math.max(Math.round(pos)-3,Math.min(Math.round(pos)+3,target));kick();
  }
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('wheel',function(e){
    if(N<2)return;
    var horiz=Math.abs(e.deltaX)>Math.abs(e.deltaY);
    if(!horiz&&!e.shiftKey&&document.activeElement!==stage)return;   // vertical wheel scrolls the page unless the roundabout has focus
    var dd=(horiz?e.deltaX:(e.deltaY||e.deltaX))*(e.deltaMode===1?16:e.deltaMode===2?400:1);
    e.preventDefault();
    var notch=e.deltaMode!==0||(Math.abs(dd)>=48&&Number.isInteger(dd)&&!e.deltaX);
    if(notch){if(e.timeStamp-wlock<170)return;wlock=e.timeStamp;go(Math.sign(dd));return;}
    stage.classList.add('mv');dragging=true;pos+=dd/(G.drag*1.6);target=pos;vel=0;if(!raf)raf=requestAnimationFrame(tick);
    clearTimeout(wt);wt=setTimeout(function(){dragging=false;target=Math.round(pos);kick();},110);
  },{passive:false});
  stage.addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'){e.preventDefault();go(1);}
    else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){e.preventDefault();go(-1);}
    else if(k==='Home'){e.preventDefault();target=Math.round(pos)-mod(Math.round(pos),N);kick();}
    else if(k==='End'){e.preventDefault();target=Math.round(pos)-mod(Math.round(pos),N)+N-1;kick();}
    else if(k==='Enter'||k===' '){e.preventDefault();openCard(active);}
  });
  [].slice.call(root.querySelectorAll('.whl-arrow')).forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-d'));});});
  if(window.ResizeObserver){ro=new ResizeObserver(function(){if(alive)layout();});ro.observe(stage);}else window.addEventListener('resize',layout);
  layout();
  var api={destroy:function(){alive=false;if(raf)cancelAnimationFrame(raf);raf=0;if(ro)ro.disconnect();window.removeEventListener('resize',layout);},go:go,index:function(){return active;},pos:function(){return pos;}};
  root._api=api;
  return api;
}
