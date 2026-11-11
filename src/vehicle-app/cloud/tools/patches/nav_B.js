// Option B: larger pill tabs, solid gold active pill, last tab peeks cut off, page dots above the bar.
(function(){var css=`@media(max-width:899px){
.sidebar{gap:8px;padding-top:22px!important;padding-bottom:calc(10px + var(--sab))!important;background:#0B0C0F!important;border-top:1px solid rgba(201,170,107,.5)!important;scroll-snap-type:x proximity;scroll-padding:0 16px}
.sidebar .nav-item{scroll-snap-align:start;padding:0 18px!important;min-height:48px;border-radius:999px;border:1.5px solid rgba(242,240,235,.55);color:#F2F0EB!important;font-size:16px!important;font-weight:600!important;letter-spacing:.04em!important;text-transform:none!important;align-self:center}
.sidebar .nav-item:first-of-type{margin-left:10px}
.sidebar .nav-item.active{background:#C9AA6B;border-color:#C9AA6B;color:#07080A!important;box-shadow:0 0 16px rgba(201,170,107,.45)}
.sidebar .nav-item.active::before{display:none}
.sidebar .nav-item.active .nav-badge{color:#07080A}
.nav-dots{position:fixed;left:0;right:0;display:flex;justify-content:center;gap:8px;pointer-events:none;z-index:101}
.nav-dots i{width:8px;height:8px;border-radius:50%;background:rgba(242,240,235,.45);transition:all .2s}
.nav-dots i.on{width:22px;border-radius:4px;background:#C9AA6B}}`;
var s=document.createElement('style');s.id='nav-B';s.textContent=css;document.head.appendChild(s);
var sb=document.querySelector('.sidebar');var d=document.createElement('div');d.className='nav-dots';document.body.appendChild(d);
function place(){var r=sb.getBoundingClientRect();d.style.top=(r.top+8)+'px';d.style.display=r.width&&innerWidth<900?'flex':'none';}
var n=0;__navEdges(sb,function(x,m){var k=Math.max(1,Math.ceil(sb.scrollWidth/sb.clientWidth));if(k!==n){n=k;d.innerHTML=Array(k+1).join('<i></i>');}var i=m>0?Math.round(x/m*(k-1)):0;[].forEach.call(d.children,function(e,j){e.classList.toggle('on',j===i)});place();});
addEventListener('resize',place,{passive:true});})();
