// ============ v18 DOCUMENT THUMBNAILS + VIEWER (tools/p18_docthumbs.js, patches_docthumbs.py) ============
// Every document with a file shows a thumbnail: the stored _t.jpg (migration_011) or, failing that, one made on this device
// from the file (images: canvas downscale; PDFs: page 1 via pdf.js, lazy-loaded from cdnjs only when needed).
// Thumbnails load when scrolled into view and are cached in memory and in Cache Storage ('evoai-dt-v1', kept by sw.js).
// The bucket is private: every URL is a signed URL, cached until 5 minutes before it expires and re-signed on error.
var DT={sig:{},q:{},qt:0,col:null,mem:{},busy:0,wait:[],io:null,mo:null,view:null,pdf:null,open:{},failed:{}};
var DT_CACHE='evoai-dt-v1',DT_W=360,DT_SIGN_S=3600,DT_OPEN_S=600;
var DT_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
var DT_PDFJS_SRI='sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
function dtNow(){return Date.now();}
function dtKind(d){var m=String(d&&d.mime||'');if(/^image\//.test(m))return 'img';if(m==='application/pdf')return 'pdf';return 'none';}
function dtThumbPathFor(path){return String(path||'').replace(/\.[a-z0-9]+$/i,'')+'_t.jpg';}
// ---------- signed URLs (batched, cached, refreshed before expiry) ----------
function dtSign(path,force){
  if(!path)return Promise.resolve(null);
  var c=DT.sig[path];if(!force&&c&&c.exp-dtNow()>300000)return Promise.resolve(c.u);
  return new Promise(function(res){(DT.q[path]||(DT.q[path]=[])).push(res);if(!DT.qt)DT.qt=setTimeout(dtFlush,25);});
}
function dtFlush(){
  DT.qt=0;var q=DT.q;DT.q={};var ps=Object.keys(q);if(!ps.length)return;var t0=dtNow();
  var done=function(m){ps.forEach(function(p){if(m[p])DT.sig[p]={u:m[p],exp:t0+DT_SIGN_S*1000};else delete DT.sig[p];q[p].forEach(function(f){f(m[p]||null);});});};
  try{sb.storage.from('vehicle-documents').createSignedUrls(ps,DT_SIGN_S).then(function(r){var m={};((r&&r.data)||[]).forEach(function(x){if(x&&x.signedUrl&&x.path)m[x.path]=x.signedUrl;});done(m);},function(){done({});});}catch(e){done({});}
}
// a short-lived URL for opening the real file (PDF new window); pre-signed when the row is on screen so a tap opens synchronously
function dtOpenUrl(path){
  var c=DT.open[path];if(c&&c.exp-dtNow()>60000)return Promise.resolve(c.u);
  var t0=dtNow();
  return sb.storage.from('vehicle-documents').createSignedUrl(path,DT_OPEN_S).then(function(r){var u=r&&r.data&&r.data.signedUrl;if(u)DT.open[path]={u:u,exp:t0+DT_OPEN_S*1000};return u||null;},function(){return null;});
}
function dtOpenFresh(path){var c=DT.open[path];return c&&c.exp-dtNow()>60000?c.u:null;}
// ---------- thumbnail cache ----------
function dtKey(d){return 'https://evoai.local/dt/'+encodeURIComponent(d.thumbPath||d.path||d.id);}
function dtCacheGet(d){
  try{if(!window.caches)return Promise.resolve(null);
    return caches.open(DT_CACHE).then(function(c){return c.match(dtKey(d));}).then(function(r){return r?r.blob():null;}).catch(function(){return null;});}catch(e){return Promise.resolve(null);}
}
function dtCachePut(d,blob){try{if(window.caches&&blob)caches.open(DT_CACHE).then(function(c){return c.put(dtKey(d),new Response(blob,{headers:{'content-type':'image/jpeg'}}));}).catch(function(){});}catch(e){}}
function dtCacheDrop(d){try{if(window.caches)caches.open(DT_CACHE).then(function(c){c.delete(dtKey(d));}).catch(function(){});}catch(e){}}
function dtSlot(fn){return new Promise(function(res,rej){var go=function(){DT.busy++;Promise.resolve().then(fn).then(function(v){DT.busy--;dtNext();res(v);},function(e){DT.busy--;dtNext();rej(e);});};if(DT.busy<3)go();else DT.wait.push(go);});}
function dtNext(){if(DT.wait.length&&DT.busy<3)DT.wait.shift()();}
async function dtFetchBlob(path){
  for(var k=0;k<2;k++){
    var u=await dtSign(path,k>0);if(!u)return null;
    try{var r=await fetch(u,{credentials:'omit'});if(r.ok)return await r.blob();}catch(e){}
  }
  return null;
}
function dtCanvasToJpeg(cv,q){return new Promise(function(res){try{cv.toBlob(function(b){res(b);},'image/jpeg',q||0.8);}catch(e){res(null);}});}
async function dtImgThumb(blob){
  var bm=null,w,h,src;
  try{if(window.createImageBitmap){bm=await createImageBitmap(blob);w=bm.width;h=bm.height;src=bm;}}catch(e){bm=null;}
  if(!bm){src=await new Promise(function(res){var u=URL.createObjectURL(blob),im=new Image();im.onload=function(){res(im);setTimeout(function(){URL.revokeObjectURL(u);},0);};im.onerror=function(){URL.revokeObjectURL(u);res(null);};im.src=u;});if(!src)return null;w=src.naturalWidth;h=src.naturalHeight;}
  if(!w||!h)return null;
  var s=Math.min(1,DT_W/w),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(w*s));cv.height=Math.max(1,Math.round(h*s));
  var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(src,0,0,cv.width,cv.height);
  try{if(bm&&bm.close)bm.close();}catch(e){}
  return dtCanvasToJpeg(cv,0.8);
}
function dtLoadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(DT.pdf)return DT.pdf;
  DT.pdf=new Promise(function(res,rej){
    var s=document.createElement('script');s.src=DT_PDFJS+'pdf.min.js';s.integrity=DT_PDFJS_SRI;s.crossOrigin='anonymous';s.async=true;
    var t=setTimeout(function(){rej(new Error('pdfjs timeout'));},20000);
    s.onload=function(){clearTimeout(t);var L=window.pdfjsLib;if(!L){rej(new Error('pdfjs missing'));return;}try{L.GlobalWorkerOptions.workerSrc=DT_PDFJS+'pdf.worker.min.js';}catch(e){}res(L);};
    s.onerror=function(){clearTimeout(t);rej(new Error('pdfjs load failed'));};
    document.head.appendChild(s);
  });
  DT.pdf.catch(function(){DT.pdf=null;DT.pdfFail=dtNow();});
  return DT.pdf;
}
async function dtPdfThumb(blob){
  if(DT.pdfFail&&dtNow()-DT.pdfFail<60000)return null;
  var L=await dtLoadPdfJs(),buf=await blob.arrayBuffer();
  var task=L.getDocument({data:new Uint8Array(buf),isEvalSupported:false,disableFontFace:false}),doc=await task.promise;
  try{
    var pg=await doc.getPage(1),vp0=pg.getViewport({scale:1}),sc=DT_W/vp0.width,vp=pg.getViewport({scale:sc});
    var cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);
    await pg.render({canvasContext:cx,viewport:vp}).promise;
    return await dtCanvasToJpeg(cv,0.82);
  }finally{try{doc.destroy();}catch(e){}}
}
// best effort thumbnail for a new upload (never blocks the upload for long)
async function dtMakeThumb(blob,mime){
  try{
    var p=/^image\//.test(mime)?dtImgThumb(blob):(mime==='application/pdf'?dtPdfThumb(blob):null);if(!p)return null;
    return await Promise.race([p,new Promise(function(r){setTimeout(function(){r(null);},6000);})]);
  }catch(e){return null;}
}
// returns an object URL for the document thumbnail, or null (tile stays)
function dtThumb(d){
  if(!d)return Promise.resolve(null);
  var k=d.id;if(DT.mem[k])return Promise.resolve(DT.mem[k]);
  if(DT.failed[k]&&dtNow()-DT.failed[k]<120000)return Promise.resolve(null);
  var kind=dtKind(d);if(kind==='none'||(!d.path&&!d.thumbPath))return Promise.resolve(null);
  if(DT.mem['p:'+k])return DT.mem['p:'+k];
  var pr=dtSlot(async function(){
    var b=await dtCacheGet(d);
    var fresh=!b;
    if(!b&&d.thumbPath)b=await dtFetchBlob(d.thumbPath);
    if(!b&&d.path){var f=await dtFetchBlob(d.path);if(f){try{b=kind==='img'?await dtImgThumb(f):await dtPdfThumb(f);}catch(e){b=null;}}}
    if(!b)return null;
    if(fresh)dtCachePut(d,b);
    var u=URL.createObjectURL(b);DT.mem[k]=u;return u;
  }).catch(function(){return null;}).then(function(u){delete DT.mem['p:'+k];if(!u)DT.failed[k]=dtNow();return u;});
  DT.mem['p:'+k]=pr;return pr;
}
// ---------- row thumbnail HTML ----------
var DT_ICON={
  repair_invoice:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  service_record:'<path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="M9 11h6M9 15h4"/>',
  registration:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4M7 14h7M16 10h1"/>',
  insurance:'<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  title:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  inspection:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11l2 2 3.5-4"/>',
  warranty:'<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  other:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
};
function dtCat(d){var a=d.ai;if(a&&a.category)return a.category;return (typeof DOCAI_TYPE_TO_CAT!=='undefined'&&DOCAI_TYPE_TO_CAT[d.type])||'other';}
function dtIcon(cat){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(DT_ICON[cat]||DT_ICON.other)+'</svg>';}
function dtThumbHTML(d){
  var kind=dtKind(d),cat=dtCat(d),lab=docAiCatLabel(cat),fmt=kind==='pdf'?'PDF':(kind==='img'?'Photo':'Note');
  var tile='<span class="dt-tile"><span class="dt-ic">'+dtIcon(cat)+'</span><span class="dt-tl">'+esc(lab)+'</span></span><span class="dt-fmt">'+fmt+'</span>';
  var has=kind!=='none'&&(d.path||d.thumbPath);
  var mem=has&&DT.mem[d.id]&&typeof DT.mem[d.id]==='string'?DT.mem[d.id]:'';
  var img='<img class="dt-img'+(mem?' ld':'')+'" alt=""'+(mem?' src="'+esc(mem)+'"':'')+' draggable="false">';
  if(!has)return '<div class="dt-th dt-none" data-cat="'+esc(cat)+'" aria-hidden="true">'+tile+'</div>';
  return '<button class="dt-th'+(mem?' has':'')+'" type="button" data-dt="'+esc(d.id)+'" data-cat="'+esc(cat)+'" aria-label="Open '+esc(lab)+': '+esc(d.name||'Document')+'" onclick="dtOpen(\''+jsId(d.id)+'\')">'+tile+img+'</button>';
}
// ---------- lazy load ----------
function dtFill(el){
  if(!el||el._dt)return;el._dt=1;
  var id=el.getAttribute('data-dt'),d=byId(getDocs(),id);if(!d)return;
  if(dtKind(d)==='pdf'&&d.path)dtOpenUrl(d.path);   // pre-sign so a tap can open synchronously (iOS PWA)
  dtThumb(d).then(function(u){
    if(!u||!el.isConnected)return;var im=el.querySelector('img.dt-img');if(!im)return;
    im.onload=function(){im.classList.add('ld');el.classList.add('has');};im.src=u;
  });
}
function dtScan(){
  var els=document.querySelectorAll('.dt-th[data-dt]');if(!els.length)return;
  if(!('IntersectionObserver' in window)){[].forEach.call(els,dtFill);return;}
  if(!DT.io)DT.io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){DT.io.unobserve(e.target);dtFill(e.target);}});},{rootMargin:'240px 0px'});
  [].forEach.call(els,function(el){if(!el._dto){el._dto=1;DT.io.observe(el);}});
}
function dtInit(){
  if(DT.mo||!window.MutationObserver)return;var t=0;
  DT.mo=new MutationObserver(function(){if(!t)t=setTimeout(function(){t=0;dtScan();},40);});
  DT.mo.observe(document.body,{childList:true,subtree:true});
  dtScan();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',dtInit);else setTimeout(dtInit,0);
// ---------- open ----------
function dtOpen(id){
  var d=byId(getDocs(),id);if(!d)return;
  var kind=dtKind(d);
  if(kind==='img')return dtOpenImage(d);
  if(kind==='pdf')return dtOpenPdf(d);
}
function dtOpenPdf(d){
  var u=dtOpenFresh(d.path);
  if(u){var w0=window.open(u,'_blank');if(!w0)dtPdfSheet(d,u);return;}
  // no fresh URL yet: open the window inside the tap (iOS keeps it), then point it at the file once signed
  var w=null;try{w=window.open('','_blank');}catch(e){w=null;}
  try{if(w&&w.document){w.document.title='Opening document';w.document.body.style.cssText='background:#07080a;color:#c9aa6b;font:16px -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0';w.document.body.textContent='Opening document...';}}catch(e){}
  dtOpenUrl(d.path).then(function(url){
    if(!url){try{if(w)w.close();}catch(e){}showToast('Could not open this document. Check your connection and try again.','error');return;}
    if(w&&!w.closed){try{w.location.replace(url);return;}catch(e){}}
    dtPdfSheet(d,url);
  });
}
// fallback when the browser blocks the new window: one more tap on a real link
function dtPdfSheet(d,url){
  dtCloseSheet();
  var el=document.createElement('div');el.className='dt-sheet-wrap';el.id='dt-sheet';
  el.innerHTML='<div class="dt-sheet" role="dialog" aria-modal="true" aria-label="Open document"><div class="dt-sheet-t">'+esc(d.name||'Document')+'</div><div class="dt-sheet-s">'+esc(docAiCatLabel(dtCat(d)))+' / PDF</div>'+
    '<a class="btn btn-primary dt-sheet-go" href="'+esc(url)+'" target="_blank" rel="noopener" onclick="setTimeout(dtCloseSheet,300)">Open PDF</a><button class="btn dt-sheet-x" type="button" onclick="dtCloseSheet()">Close</button></div>';
  el.addEventListener('click',function(e){if(e.target===el)dtCloseSheet();});
  document.body.appendChild(el);setTimeout(function(){el.classList.add('on');},10);
}
function dtCloseSheet(){var el=document.getElementById('dt-sheet');if(el&&el.parentNode)el.parentNode.removeChild(el);}
// ---------- full-screen image viewer (pinch / double-tap / wheel zoom, swipe down to close) ----------
function dtOpenImage(d){
  if(DT.view)dtCloseViewer(true);
  var el=document.createElement('div');el.className='dtv';el.id='dtv';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Document viewer');
  el.innerHTML='<div class="dtv-stage" id="dtv-stage"><img id="dtv-img" alt="'+esc(d.name||'Document')+'" draggable="false"></div>'+
    '<div class="dtv-top"><div class="dtv-ttl"><b>'+esc(d.name||'Document')+'</b><span>'+esc(docAiCatLabel(dtCat(d))+' / '+fmtDate(docAiDate(d)))+'</span></div>'+
    '<button class="dtv-x" type="button" aria-label="Close document" id="dtv-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
    '<div class="dtv-load" id="dtv-load"><i></i></div><div class="dtv-hint" id="dtv-hint">Pinch or double-tap to zoom</div>';
  document.body.appendChild(el);
  var V=DT.view={el:el,d:d,s:1,x:0,y:0,ptr:{},d0:0,s0:1,mx:0,my:0,sx:0,sy:0,last:0,swipe:null,opener:document.activeElement,tries:0};
  var st=el.querySelector('#dtv-stage'),im=el.querySelector('#dtv-img');
  function apply(anim){im.style.transition=anim?'transform .22s ease':'none';im.style.transform='translate3d('+V.x+'px,'+V.y+'px,0) scale('+V.s+')';el.classList.toggle('zoomed',V.s>1.02);}
  function clampPan(){var r=st.getBoundingClientRect(),w=im.clientWidth*V.s,h=im.clientHeight*V.s,mx=Math.max(0,(w-r.width)/2),my=Math.max(0,(h-r.height)/2);V.x=Math.max(-mx,Math.min(mx,V.x));V.y=Math.max(-my,Math.min(my,V.y));}
  function zoomAt(ns,cx,cy){ns=Math.max(1,Math.min(6,ns));var r=st.getBoundingClientRect(),ox=cx-(r.left+r.width/2),oy=cy-(r.top+r.height/2),k=ns/V.s;V.x=ox-(ox-V.x)*k;V.y=oy-(oy-V.y)*k;V.s=ns;if(ns<=1.001){V.s=1;V.x=0;V.y=0;}clampPan();apply(false);}
  V.zoomAt=zoomAt;V.apply=apply;
  // placeholder: the cached thumbnail, then the full file
  if(DT.mem[d.id]&&typeof DT.mem[d.id]==='string'){im.src=DT.mem[d.id];im.classList.add('ld','ph');}
  function loadFull(force){dtSign(d.path,force).then(function(u){if(DT.view!==V)return;if(!u){el.querySelector('#dtv-load').classList.add('err');el.querySelector('#dtv-load').textContent='Could not load this document.';return;}
    var pre=new Image();pre.onload=function(){if(DT.view!==V)return;im.src=u;im.classList.remove('ph');im.classList.add('ld');el.querySelector('#dtv-load').style.display='none';};
    pre.onerror=function(){if(DT.view!==V)return;if(V.tries++<1)loadFull(true);else{var l=el.querySelector('#dtv-load');l.classList.add('err');l.textContent='Could not load this document.';}};pre.src=u;});}
  loadFull(false);
  st.addEventListener('pointerdown',function(e){
    try{st.setPointerCapture(e.pointerId);}catch(x){}
    V.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(V.ptr);
    if(ids.length===2){var a=V.ptr[ids[0]],b=V.ptr[ids[1]];V.d0=Math.hypot(a.x-b.x,a.y-b.y)||1;V.s0=V.s;V.swipe=null;}
    else{V.sx=e.clientX;V.sy=e.clientY;V.mx=V.x;V.my=V.y;V.swipe={x:e.clientX,y:e.clientY,moved:0};}
    var h=el.querySelector('#dtv-hint');if(h)h.style.opacity=0;
  });
  st.addEventListener('pointermove',function(e){
    if(!V.ptr[e.pointerId])return;V.ptr[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(V.ptr);
    if(ids.length>=2){var a=V.ptr[ids[0]],b=V.ptr[ids[1]],dd=Math.hypot(a.x-b.x,a.y-b.y)||1;zoomAt(V.s0*dd/V.d0,(a.x+b.x)/2,(a.y+b.y)/2);return;}
    if(!V.swipe)return;var dx=e.clientX-V.sx,dy=e.clientY-V.sy;V.swipe.moved=Math.max(V.swipe.moved,Math.hypot(dx,dy));
    if(V.s>1.02){V.x=V.mx+dx;V.y=V.my+dy;clampPan();apply(false);}
    else if(dy>0&&Math.abs(dy)>Math.abs(dx)){im.style.transition='none';im.style.transform='translate3d(0,'+dy+'px,0)';el.style.background='rgba(0,0,0,'+Math.max(.4,1-dy/500)+')';}
  });
  function up(e){
    if(!V.ptr[e.pointerId])return;delete V.ptr[e.pointerId];var sw=V.swipe,n=Object.keys(V.ptr).length;
    if(n===1){var r0=V.ptr[Object.keys(V.ptr)[0]];V.sx=r0.x;V.sy=r0.y;V.mx=V.x;V.my=V.y;V.swipe={x:r0.x,y:r0.y,moved:99};return;}
    if(n>0||!sw)return;V.swipe=null;var dy=e.clientY-sw.y,dx=e.clientX-sw.x;el.style.background='';
    if(sw.moved<8){if(e.timeStamp-V.last<320){V.last=0;if(V.s>1.02){V.s=1;V.x=0;V.y=0;apply(true);}else zoomAt(2.5,e.clientX,e.clientY);}else V.last=e.timeStamp;return;}
    if(V.s>1.02){apply(false);return;}
    if(dy>100&&Math.abs(dy)>Math.abs(dx)){dtCloseViewer();return;}
    V.x=0;V.y=0;apply(true);
  }
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  st.addEventListener('wheel',function(e){e.preventDefault();var dy=e.deltaY*(e.deltaMode===1?16:1);zoomAt(V.s*Math.exp(-Math.max(-400,Math.min(400,dy))*0.002),e.clientX,e.clientY);},{passive:false});
  el.querySelector('#dtv-x').addEventListener('click',function(){dtCloseViewer();});
  V.key=function(e){if(e.key==='Escape'){e.preventDefault();dtCloseViewer();}else if(e.key==='+'||e.key==='='){var r=st.getBoundingClientRect();zoomAt(V.s*1.3,r.left+r.width/2,r.top+r.height/2);}else if(e.key==='-'){var r2=st.getBoundingClientRect();zoomAt(V.s/1.3,r2.left+r2.width/2,r2.top+r2.height/2);}else if(e.key==='Tab'){e.preventDefault();el.querySelector('#dtv-x').focus();}};
  document.addEventListener('keydown',V.key,true);
  document.body.classList.add('dtv-open');
  setTimeout(function(){el.classList.add('on');var x=el.querySelector('#dtv-x');if(x)x.focus();},10);
}
function dtCloseViewer(quick){
  var V=DT.view;if(!V)return;DT.view=null;
  document.removeEventListener('keydown',V.key,true);document.body.classList.remove('dtv-open');
  var el=V.el;el.classList.remove('on');setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},quick?0:180);
  try{if(V.opener&&V.opener.focus&&V.opener.isConnected)V.opener.focus();}catch(e){}
}
// ---------- upload: keep the file, add a stored thumbnail when migration_011 is in ----------
function dtMissingCol(err){var c=err&&err.code,m=String(err&&err.message||'');return c==='42703'||c==='PGRST204'||/thumb_path/.test(m)&&/column|schema cache/i.test(m);}
async function dtInsertDoc(row,blob,mime,path){
  var tb=null,tp=null;
  if(DT.col!==false&&blob&&(/^image\//.test(mime)||mime==='application/pdf')){
    tb=await dtMakeThumb(blob,mime);
    if(tb){tp=dtThumbPathFor(path);
      try{var up=await sb.storage.from('vehicle-documents').upload(tp,tb,{contentType:'image/jpeg',upsert:false});if(up&&up.error)tp=null;}catch(e){tp=null;}}
  }
  var r;
  if(tp){var r1=Object.assign({},row,{thumb_path:tp});r=await sb.from('documents').insert(r1);
    if(r&&r.error&&dtMissingCol(r.error)){DT.col=false;try{await removeObject('vehicle-documents',tp);}catch(e){}tp=null;r=await sb.from('documents').insert(row);}
  }else r=await sb.from('documents').insert(row);
  if(r&&r.error&&tp){try{await removeObject('vehicle-documents',tp);}catch(e){}}
  chk(r);
  if(tp)DT_THUMBS[row.id]=tp;
  if(tb){var d={id:row.id,path:path,thumbPath:tp||''};dtCachePut(d,tb);try{DT.mem[row.id]=URL.createObjectURL(tb);}catch(e){}}
  return tp;
}
var DT_THUMBS={};
async function dtRemoveThumb(id){var tp=DT_THUMBS[id];if(!tp)return;delete DT_THUMBS[id];try{await removeObject('vehicle-documents',tp);}catch(e){}if(DT.mem[id]){try{URL.revokeObjectURL(DT.mem[id]);}catch(e){}delete DT.mem[id];}}
// ---------- document row: thumbnail first, AI category + date + newest-first unchanged ----------
function docRowHTML(d){
  var canDel=docAiCanEdit(d),a=d.ai;
  var cat=a&&a.category?docAiCatLabel(a.category):(d.type?d.type.charAt(0).toUpperCase()+d.type.slice(1):'Other');
  var meta=[];if(a&&a.vendor)meta.push(a.vendor);
  if(a&&a.mileage!=null)meta.push(Number(a.mileage).toLocaleString('en-US')+' mi');
  if(a&&a.amount!=null)meta.push(money(a.amount));
  var badge=a&&(a.status==='scanned'||a.status==='edited')?'<span class="dai-pill">'+(a.status==='edited'?'AI / edited':'Read by AI')+'</span>':'';
  var svc=a&&a.services&&a.services.length?'<div class="dai-svc">'+esc(a.services.slice(0,4).join(' / ')+(a.services.length>4?' / +'+(a.services.length-4)+' more':''))+'</div>':'';
  var btns=(canDel?'<button class="btn btn-sm" onclick="docAiOpenEdit(\''+jsId(d.id)+'\')">Details</button>':'')+(canDel?'<button class="btn btn-sm" onclick="deleteDocument(\''+jsId(d.id)+'\')">Remove</button>':'');
  var exp=(d.expiry||(a&&a.expiresOn))?'<div class="doc-expiry">'+docExpiryHTML((a&&a.expiresOn)||d.expiry)+'</div>':'';
  return '<div class="doc-row dai-row dt-row" data-doc="'+esc(d.id)+'">'+dtThumbHTML(d)+'<div class="dt-body">'+
    '<div class="dt-cat"><span class="dt-catl">'+esc(cat)+'</span><span class="dt-date">'+esc(fmtDate(docAiDate(d)))+'</span></div>'+
    '<div class="doc-name">'+esc(d.name)+badge+'</div>'+
    (meta.length||d.notes?'<div class="doc-meta">'+esc(meta.join(' / '))+(d.notes?(meta.length?' / ':'')+esc(d.notes):'')+'</div>':'')+svc+exp+
    (btns?'<div class="dai-btns dt-btns">'+btns+'</div>':'')+'</div></div>';
}
