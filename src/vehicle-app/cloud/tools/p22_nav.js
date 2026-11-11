// Shared: toggles .nav-at-start/.nav-at-end on the bottom bar (passive scroll, rAF-throttled). No touch handlers -> swipe-back untouched.
window.__navEdges=function(sb,cb){var t=0;function u(){t=0;var m=sb.scrollWidth-sb.clientWidth;sb.classList.toggle('nav-at-start',sb.scrollLeft<4);sb.classList.toggle('nav-at-end',sb.scrollLeft>m-4);cb&&cb(sb.scrollLeft,m);}
sb.addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});addEventListener('resize',u,{passive:true});u();var a=sb.querySelector('.nav-item.active');if(a&&a.scrollIntoView)a.scrollIntoView({inline:'center',block:'nearest'});return u;};
// Option A: raised gold-edged glass bar, right/left edge fade, sticky gold chevron that pages the bar.
function navAInit(){if(document.getElementById('nav-A'))return;var css=`.nav-chev{display:none}
@media(max-width:899px){
.sidebar{position:relative;background:linear-gradient(180deg,rgba(28,26,22,.82),rgba(10,10,12,.94))!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1.5px solid rgba(201,170,107,.85)!important;box-shadow:0 -10px 28px rgba(0,0,0,.65),0 -1px 0 rgba(201,170,107,.35) inset;border-radius:18px 18px 0 0;
-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 56px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 56px),transparent 100%)}
.sidebar.nav-at-start{-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 56px),transparent 100%);mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 56px),transparent 100%)}
.sidebar.nav-at-end{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28px);mask-image:linear-gradient(90deg,transparent 0,#000 28px)}
.sidebar .nav-item{color:#F2F0EB!important;font-size:15px!important;font-weight:600!important;letter-spacing:.08em!important}
.sidebar .nav-item.active{color:#E6C989!important}
.sidebar .nav-item.active::before{height:3px!important;background:#C9AA6B!important;border-radius:0 0 3px 3px;top:0!important}
.nav-chev{position:sticky;right:0;flex:0 0 auto;align-self:center;width:44px;height:44px;margin-left:4px;border-radius:50%;border:1.5px solid #C9AA6B;background:rgba(7,8,10,.92);color:#E6C989;font-size:24px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:-14px 0 18px rgba(7,8,10,.95)}
.sidebar.nav-at-end .nav-chev{transform:scaleX(-1)}}`;
var s=document.createElement('style');s.id='nav-A';s.textContent=css;document.head.appendChild(s);
var sb=document.querySelector('.sidebar');var b=document.createElement('button');b.className='nav-chev';b.type='button';b.setAttribute('aria-label','More tabs');b.textContent='\u203A';
b.onclick=function(){var end=sb.classList.contains('nav-at-end');sb.scrollBy({left:end?-sb.scrollWidth:sb.clientWidth*.7,behavior:'smooth'})};sb.appendChild(b);__navEdges(sb);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navAInit);else navAInit();
