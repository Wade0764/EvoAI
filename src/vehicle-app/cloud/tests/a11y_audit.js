// In-page audit: min font size, WCAG contrast of visible text, tap targets, horizontal overflow. Returns findings.
module.exports=function audit(opts){opts=opts||{};
  var root=opts.root?document.querySelector(opts.root):document.body;var out={font:[],contrast:[],tap:[],overflow:[]};if(!root)return out;
  var W=innerWidth,H=innerHeight;
  function vis(e){var r=e.getBoundingClientRect();if(r.width<1||r.height<1)return null;if(r.bottom<0||r.top>H||r.right<0||r.left>W)return null;
    for(var n=e;n&&n.nodeType===1;n=n.parentElement){var c=getComputedStyle(n);if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0)return null;}return r;}
  function rgb(s){var m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;var p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function lum(c){function f(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);}return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);}
  function mix(t,b){return {r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1};}
  function bgOf(e){var stack=[];for(var n=e;n&&n.nodeType===1;n=n.parentElement){var c=getComputedStyle(n);if(c.backgroundImage&&c.backgroundImage!=='none')return null; // over an image or gradient: skip (checked visually)
      var b=rgb(c.backgroundColor);if(b&&b.a>0){stack.push(b);if(b.a>=.99)break;}}
    var base={r:7,g:8,b:10,a:1};for(var i=stack.length-1;i>=0;i--)base=mix(stack[i],base);return base;}
  function op(e){var o=1;for(var n=e;n&&n.nodeType===1;n=n.parentElement)o*=+getComputedStyle(n).opacity;return o;}
  var all=root.querySelectorAll('*');
  for(var i=0;i<all.length;i++){var e=all[i];
    if(/^(SCRIPT|STYLE|SVG|svg|path|circle|g|OPTION)$/.test(e.tagName)||e.closest('svg'))continue;
    var own=[].some.call(e.childNodes,function(t){return t.nodeType===3&&t.textContent.trim().length>0;});
    if(own){var r=vis(e);if(!r)continue;var cs=getComputedStyle(e),fz=parseFloat(cs.fontSize),txt=e.textContent.trim().slice(0,40);
      if(e.closest('[aria-hidden="true"]')&&!opts.hidden)continue;
      if(fz<(opts.minFont||13))out.font.push(fz+'px '+(e.className||e.tagName)+' "'+txt+'"');
      var fg=rgb(cs.color),bg=bgOf(e);
      if(fg&&bg&&!e.closest('.pfa-it,.pfg-slide,.whl-card .whl-img,#vd-img-area')&&!(e.disabled||e.closest('[disabled]'))){fg.a*=op(e);var f2=mix(fg,bg),L1=lum(f2),L2=lum(bg),cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
        var large=fz>=24||(fz>=18.66&&+cs.fontWeight>=700);if(cr<(large?3:4.5))out.contrast.push(cr.toFixed(2)+' '+fz+'px '+(e.className||e.tagName)+' "'+txt+'"');}}
    if(e.matches('button,a[href],a[onclick],[role=button],select,input:not([type=hidden]):not([type=file]),[onclick]')&&!e.matches('input[type=checkbox],input[type=radio]')){var r2=vis(e);
      if(r2&&!e.closest('[aria-hidden="true"]')&&!e.matches('.pfg-slide,.pfa-it,.whl-card,.pfg-th,label *')&&(r2.width<(opts.tap||44)-0.5||r2.height<(opts.tap||44)-0.5))out.tap.push(Math.round(r2.width)+'x'+Math.round(r2.height)+' '+(e.className||e.tagName)+' "'+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,30)+'"');}
  }
  if(document.documentElement.scrollWidth>W+1)out.overflow.push('document '+document.documentElement.scrollWidth);
  [].forEach.call(document.querySelectorAll('.modal.active .modal,.modal-overlay.active .modal,.pfa-sheet,.boot-card,#cp-vehicles,.vd-wrap,nav,.tabbar,.bottom-nav'),function(m){var ox=getComputedStyle(m).overflowX;if(ox!=='auto'&&ox!=='scroll'&&m.scrollWidth>m.clientWidth+1)out.overflow.push((m.id||m.className)+' '+m.scrollWidth+'>'+m.clientWidth);});
  return out;};
