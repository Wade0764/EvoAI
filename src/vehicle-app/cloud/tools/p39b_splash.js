// ============ v36b intro splash (p39b): the ring splash on every app open (cold start + home-screen launch) ============
// Root cause it vanished: #boot-loading started display:none and was only shown inside bootWithUser() while loadAll() ran,
// so signed-out opens never saw it and cached/fast signed-in opens saw it for a frame or two.
window.__EVO_INTRO=window.__EVO_INTRO||{t0:(window.performance&&performance.timeOrigin)?Math.round(performance.timeOrigin):Date.now(),done:false,want:false};
var _evoShowLoading=showLoading;
showLoading=function(on,msg){
  var I=window.__EVO_INTRO,el=document.getElementById('boot-loading');if(!el)return;
  var t=document.getElementById('boot-loading-text');if(t&&msg)t.textContent=msg;
  if(!I.done){I.want=!!on;return;}   // keep the intro up; remember what boot wants
  if(on){clearTimeout(I.ft);el.classList.remove('evo-fade');el.style.display='flex';return;}
  if(el.style.display==='none')return;
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){el.style.display='none';return;}
  el.classList.add('evo-fade');clearTimeout(I.ft);I.ft=setTimeout(function(){el.style.display='none';el.classList.remove('evo-fade');},520);
};
(function(){
  var I=window.__EVO_INTRO,MIN=1700,left=Math.max(0,MIN-(Date.now()-I.t0));
  setTimeout(function(){I.done=true;var el=document.getElementById('boot-loading');
    if(I.want){if(el)el.classList.remove('evo-intro');}       // data still loading: stays as the loading screen, hides when loadAll ends
    else showLoading(false);                                  // smooth fade into sign-in or the app
  },left);
})();
