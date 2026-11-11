(function(){function fix(){
 document.querySelectorAll('.ms-chip').forEach(function(c){if(c.querySelector('.em-ring'))return;var m=c.textContent.match(/(\d+)\s*of\s*(\d+)/);if(!m)return;var f=m[1]/m[2],C=2*Math.PI*14;
  c.insertAdjacentHTML('afterbegin','<svg class="em-ring" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="4"/><circle cx="17" cy="17" r="14" fill="none" stroke="#10D98A" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(C*f)+' '+C+'" transform="rotate(-90 17 17)"/></svg>');});
 document.querySelectorAll('body *').forEach(function(e){if(!e.childNodes.length||e.closest('svg'))return;var has=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});if(!has)return;var cs=getComputedStyle(e),fs=parseFloat(cs.fontSize);if(fs<15)e.style.fontSize='15px';
  var c=cs.color.match(/\d+(\.\d+)?/g);if(c&&+c[0]>=60&&+c[0]<200&&Math.abs(c[0]-c[1])<20&&Math.abs(c[1]-c[2])<20)e.style.color='#ECEEF0';});}
 new MutationObserver(function(){clearTimeout(window.__emT);window.__emT=setTimeout(fix,60);}).observe(document.documentElement,{subtree:true,childList:true});})();
