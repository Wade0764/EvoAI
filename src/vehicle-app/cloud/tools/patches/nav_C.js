// Option C: gold "MORE ›" gradient edge + one-time first-load nudge (bar glides left and back, transform only, respects reduced-motion).
(function(){var css=`@media(max-width:899px){
.sidebar{border-top:2px solid #C9AA6B!important;background:linear-gradient(180deg,#14130F,#07080A)!important}
.sidebar .nav-item{color:#F2F0EB!important;font-size:15px!important;font-weight:600!important}
.sidebar .nav-item.active{color:#E6C989!important}
.sidebar .nav-item.active::before{height:3px!important;background:#C9AA6B!important;top:0!important}
.nav-more{position:sticky;right:calc(-6px - var(--sar));flex:0 0 auto;display:flex;align-items:center;padding:0 12px 0 40px;margin-left:-30px;color:#07080A;font-size:15px;font-weight:800;letter-spacing:.1em;background:linear-gradient(90deg,rgba(201,170,107,0),rgba(201,170,107,.9) 45%,#C9AA6B);border:0;z-index:2;transition:opacity .25s}
.sidebar.nav-at-end .nav-more{opacity:0;pointer-events:none}
@keyframes navNudge{0%,100%{transform:translateX(0)}40%{transform:translateX(-64px)}70%{transform:translateX(-50px)}}
.sidebar.nav-nudge .nav-item{animation:navNudge 1.1s cubic-bezier(.3,.7,.3,1) .5s 2}
@media(prefers-reduced-motion:reduce){.sidebar.nav-nudge .nav-item{animation:none}}}`;
var s=document.createElement('style');s.id='nav-C';s.textContent=css;document.head.appendChild(s);
var sb=document.querySelector('.sidebar');var b=document.createElement('button');b.className='nav-more';b.type='button';b.textContent='MORE \u203A';
b.onclick=function(){sb.scrollBy({left:sb.clientWidth*.7,behavior:'smooth'})};sb.appendChild(b);__navEdges(sb);
try{if(!localStorage.getItem('nav_nudged')){sb.classList.add('nav-nudge');localStorage.setItem('nav_nudged','1');setTimeout(function(){sb.classList.remove('nav-nudge')},3200);sb.addEventListener('touchstart',function(){sb.classList.remove('nav-nudge')},{passive:true,once:true});}}catch(e){}})();
