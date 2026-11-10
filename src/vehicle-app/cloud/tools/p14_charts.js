// ===== v17: value chart (collection + vehicle). Plain SVG + vanilla JS. Real ai_estimates rows only (v.valueLog ai:true, mid), owner value priority. =====
var VCH={st:{},ranges:['1M','3M','1Y','All'],months:{'1M':1,'3M':3,'1Y':12,'All':0},rl:{'1M':'past month','3M':'past 3 months','1Y':'past year','All':'since the first estimate'}};
function vchT(s){var d=parseDate(s);if(!d)return NaN;d.setHours(12,0,0,0);return d.getTime();}
function vchNum(n){n=Number(n);return isFinite(n)?n:0;}
function vchShort(s){var d=parseDate(s);return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';}
// AI points for one vehicle: one per day (the latest of that day), ascending.
function vchAiPts(v){
  var m={},out=[];
  (v&&v.valueLog||[]).forEach(function(p){if(!(p&&p.ai===true&&Number(p.value)>0))return;var dd=String(p.date||'').slice(0,10);
    if(p.ts&&/T\d/.test(String(p.ts))){var t=new Date(p.ts);if(!isNaN(t.getTime()))dd=isoLocal(t);}
    if(isFinite(vchT(dd)))m[dd]=Math.round(Number(p.value));});
  Object.keys(m).sort().forEach(function(d){out.push({d:d,v:m[d]});});
  return out;
}
function vchOwner(v){var o=(typeof ovVal==='function')?ovVal(v):null;if(o===null||!(o>0))return null;var s=v.ownerValue&&v.ownerValue.setAt;return {v:Math.round(o),d:(s&&isFinite(vchT(s)))?String(s).slice(0,10):todayISO()};}
// value of one car as of day d (carry forward). Owner value wins from the day it was set.
function vchValAt(ai,own,d){
  if(own&&own.d<=d)return own.v;
  var r=null;for(var i=0;i<ai.length;i++){if(ai[i].d<=d)r=ai[i].v;else break;}return r;
}
// Collection series: every date any car got a value; sum of each car's latest value as of that date. Ends today at the current total.
function vchCollSeries(vehicles,today){
  today=today||todayISO();
  var cars=[],dates={};
  (vehicles||[]).forEach(function(v){if(!can(v,'view_value_estimate'))return;var ai=vchAiPts(v),own=vchOwner(v);if(!ai.length&&!own)return;
    cars.push({v:v,ai:ai,own:own});ai.forEach(function(p){dates[p.d]=1;});if(own)dates[own.d<=today?own.d:today]=1;});
  var ds=Object.keys(dates).sort(),pts=[];
  ds.forEach(function(d){var sum=0,parts={},n=0;cars.forEach(function(c){var x=vchValAt(c.ai,c.own,d);if(x!==null){sum+=x;parts[c.v.id]=x;n++;}});if(n)pts.push({d:d,v:sum,parts:parts});});
  var real=pts.length;
  if(pts.length&&pts[pts.length-1].d<today){var lp=pts[pts.length-1];pts.push({d:today,v:lp.v,parts:lp.parts,ext:true});}
  return {pts:pts,real:real,cars:cars};
}
// Slice a series to a range; carry the last value before the range start in as the first point.
function vchSlice(pts,r,today){
  if(!pts.length)return [];
  var m=VCH.months[r];if(!m)return pts.slice();
  var t=parseDate(today||todayISO());t.setMonth(t.getMonth()-m);var s=isoLocal(t),out=[],before=null;
  pts.forEach(function(p){if(p.d<s)before=p;else out.push(p);});
  if(before&&out.length&&out[0].d>s)out.unshift({d:s,v:before.v,parts:before.parts,carry:true});
  return out;
}
function vchChange(sl){if(sl.length<2)return null;var a=sl[0].v,b=sl[sl.length-1].v,d=b-a;return {d:d,p:a?d/a*100:0,a:a,b:b};}
function vchChgHTML(c,lbl){
  if(!c)return '';
  var up=c.d>=0,cl=c.d===0?'':(up?'up':'down'),ar=c.d===0?'':(up?'\u25B2 +':'\u25BC \u2212');
  return '<span class="'+cl+'">'+(c.d===0?'No change':ar+money(Math.abs(c.d)).replace('-','')+' ('+(up?'+':'\u2212')+Math.abs(c.p).toFixed(1)+'%)')+'</span> <span class="vch-rl">'+esc(lbl)+'</span>';
}
function vchPct(c){return Math.abs(c.p).toFixed(1)+'%';}
// ---------- insight lines (local, from the real data; no API calls) ----------
function vchFirstText(d){return 'First AI estimate recorded '+vchShort(d)+'. Trends appear after a few weekly updates.';}
function vchCollInsight(S,r,today){
  if(S.real<2){var f=S.pts.length?S.pts[0].d:today;return vchFirstText(f);}
  var sl=vchSlice(S.pts,r,today),c=vchChange(sl);if(!c)return 'Not enough history for this range yet.';
  var a=sl[0],b=sl[sl.length-1],best=null,added=0,txt;
  S.cars.forEach(function(k){var id=k.v.id,x=a.parts[id],y=b.parts[id];if(x===undefined&&y!==undefined){added++;return;}if(x===undefined||y===undefined)return;var dd=y-x;if(!best||Math.abs(dd)>Math.abs(best.d))best={d:dd,n:vName(k.v)};});
  if(c.d===0)txt='Unchanged over the '+VCH.rl[r].replace('since the first estimate','whole history')+'.';
  else txt=(c.d>0?'Up ':'Down ')+vchPct(c)+' ('+(c.d>0?'+':'\u2212')+money(Math.abs(c.d)).replace('-','')+') '+(r==='All'?'since the first estimate':'over the '+VCH.rl[r])+'.';
  if(best&&best.d!==0)txt+=' Biggest mover: '+best.n+' ('+(best.d>0?'+':'\u2212')+money(Math.abs(best.d)).replace('-','')+').';
  if(added)txt+=' '+added+' vehicle'+(added===1?'':'s')+' got a first value in this period.';
  var no=S.cars.filter(function(k){return !!k.own;}).length;if(no)txt+=' Uses your own value for '+no+' vehicle'+(no===1?'':'s')+'.';
  return txt;
}
function vchConfText(v){
  var a=v.aiValue;if(!a)return '';var cf=a.confidence===''||a.confidence===null||a.confidence===undefined?null:Number(a.confidence),ns=(a.sources||[]).length,bits=[];
  if(cf!==null&&isFinite(cf))bits.push((cf<0.3?'low confidence (':'')+Math.round(cf*100)+'% confidence'+(cf<0.3?')':''));
  bits.push(ns?ns+' source'+(ns===1?'':'s'):'no sources returned');
  return 'Latest estimate: '+bits.join(', ')+'.';
}
function vchVehInsight(v,ai,own,r,today){
  var txt='';
  if(ai.length<2)txt=ai.length?vchFirstText(ai[0].d):'No AI estimate yet.';
  else{var c=vchChange(vchSlice(vchExt(ai,today),r,today));
    if(!c)txt='Not enough history for this range yet.';
    else if(c.d===0)txt='AI estimate unchanged over the '+(r==='All'?'whole history':VCH.rl[r])+'.';
    else txt='AI estimate '+(c.d>0?'up ':'down ')+vchPct(c)+' ('+(c.d>0?'+':'\u2212')+money(Math.abs(c.d)).replace('-','')+') '+(r==='All'?'since the first estimate':'over the '+VCH.rl[r])+'.';}
  if(ai.length)txt+=' '+vchConfText(v);
  if(v.isReplica)txt+=' Valued as a replica'+(v.builder?' by '+v.builder:'')+'.';
  if(own&&ai.length){var dd=own.v-ai[ai.length-1].v;txt+=' Your owner value is '+(dd===0?'the same as':money(Math.abs(dd))+(dd>0?' above':' below'))+' the latest AI estimate.';}
  return txt;
}
function vchExt(ai,today){var p=ai.slice();if(p.length&&p[p.length-1].d<today)p.push({d:today,v:p[p.length-1].v,ext:true});return p;}
// ---------- models ----------
function vchCollModel(id,vehicles){
  var today=todayISO(),S=vchCollSeries(vehicles,today);if(!S.pts.length)return null;
  var t=portfolioTotals(vehicles),cur=t.value>0?t.value:S.pts[S.pts.length-1].v;
  if(S.pts.length)S.pts[S.pts.length-1].v=cur; // the line ends at the same total the rest of the app shows
  var basisOk=S.cars.length&&S.cars.every(function(k){return Number(k.v.purchasePrice)>0&&can(k.v,'view_purchase_info');});
  return {id:id,kind:'coll',today:today,label:'Collection value',value:cur,S:S,main:S.pts,real:S.real,
    basis:basisOk?function(p){var b=0;S.cars.forEach(function(k){if(p.parts&&p.parts[k.v.id]!==undefined)b+=Number(k.v.purchasePrice);});return b;}:null,
    insight:function(r){return vchCollInsight(S,r,today);},nOwner:S.cars.filter(function(k){return !!k.own;}).length};
}
function vchVehModel(id,v){
  if(!v||!can(v,'view_value_estimate'))return null;
  var today=todayISO(),ai=vchAiPts(v),own=vchOwner(v);if(!ai.length&&!own)return null;
  var pp=Number(v.purchasePrice)>0&&can(v,'view_purchase_info')?Number(v.purchasePrice):0;
  var m={id:id,kind:'veh',today:today,v:v,own:own,ai:ai,real:ai.length,basis:pp?function(){return pp;}:null,
    label:own?'Owner value':'Estimated value',value:own?own.v:ai[ai.length-1].v,
    insight:function(r){return vchVehInsight(v,ai,own,r,today);}};
  if(own){m.main=[];m.dash=ai;m.real=ai.length+1;}else m.main=vchExt(ai,today);
  return m;
}
function vchHasAi(m){return m.kind==='coll'?m.S.cars.some(function(k){return !k.own&&k.ai.length;}):!!(m.ai&&m.ai.length);}
// ---------- render ----------
function vchSeriesFor(m,r){return m.own?{main:[],dash:vchSlice(m.ai,r,m.today)}:{main:vchSlice(m.main,r,m.today),dash:[]};}
function vchRangeOk(m,r){if(m.real<2)return false;var s=vchSeriesFor(m,r);return (m.own?s.dash.length+1:s.main.length)>=2;}
function vchMount(hostId,m){
  var host=document.getElementById(hostId);if(!host)return;
  if(!m){host.innerHTML='';host.classList.remove('on');delete VCH.st[hostId];return;}
  var key=m.kind+':'+(m.v?m.v.id:m.id),prev=VCH.st[hostId],r=prev&&prev.key===key&&prev.r;
  if(!r||!vchRangeOk(m,r)){r='1Y';if(!vchRangeOk(m,r)){r=null;for(var i=VCH.ranges.length-1;i>=0;i--)if(vchRangeOk(m,VCH.ranges[i])){r=VCH.ranges[i];break;}if(!r)r='All';if(vchRangeOk(m,'1Y'))r='1Y';}}
  var st={m:m,r:r,key:key,host:host,sel:null,raf:0};VCH.st[hostId]=st;
  host.classList.add('on');
  host.innerHTML='<div class="vch" data-kind="'+m.kind+'">'+
    '<div class="vch-head"><div class="vch-lab"><span class="vch-labt"></span>'+'</div><div class="vch-big" aria-live="polite"></div><div class="vch-chg"></div><div class="vch-disc"'+(vchHasAi(m)?'':' hidden')+'>Estimate, not an appraisal</div></div>'+
    '<div class="vch-plot" role="img" tabindex="0"><div class="vch-svg"></div><div class="vch-hit" aria-hidden="true"></div><div class="vch-x" aria-hidden="true"></div><div class="vch-dot" aria-hidden="true"></div><div class="vch-bub" aria-hidden="true"><div class="d"></div><div class="x"></div></div></div>'+
    '<div class="vch-axis" aria-hidden="true"></div>'+
    '<div class="vch-ranges" role="group" aria-label="Chart range">'+VCH.ranges.map(function(k){var ok=vchRangeOk(m,k);return '<button type="button" data-r="'+k+'"'+(ok?'':' disabled aria-disabled="true"')+'>'+k+'</button>';}).join('')+'</div>'+
    '<div class="vch-leg"></div>'+
    '<div class="vch-ins"><span class="tag">AI</span><div class="vch-inst"></div></div></div>';
  host.querySelectorAll('.vch-ranges button').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();if(b.disabled)return;st.r=b.getAttribute('data-r');st.sel=null;vchDraw(st);});});
  vchBind(st);vchDraw(st);
  if(!VCH.rs){VCH.rs=1;var tm=0;window.addEventListener('resize',function(){clearTimeout(tm);tm=setTimeout(function(){Object.keys(VCH.st).forEach(function(k){var s=VCH.st[k];if(s.host&&document.body.contains(s.host))vchDraw(s);});},150);});}
}
function vchGeom(st){
  var m=st.m,plot=st.host.querySelector('.vch-plot'),W=Math.max(260,Math.round(plot.clientWidth||st.host.clientWidth||360)),H=W>640?240:190;
  var s=vchSeriesFor(m,st.r),all=s.main.concat(s.dash),vals=all.map(function(p){return p.v;});
  if(m.own)vals.push(m.own.v);
  var bl=[];if(m.basis&&s.main.length)bl=s.main.map(function(p){return {d:p.d,v:m.basis(p)};}).filter(function(p){return p.v>0;});else if(m.basis&&m.own)bl=[{d:(s.dash[0]||{d:m.today}).d,v:m.basis()},{d:m.today,v:m.basis()}];
  bl.forEach(function(p){vals.push(p.v);});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);if(!isFinite(mn)){mn=0;mx=1;}
  var pad=(mx-mn)*0.14;if(!(pad>0))pad=Math.max(1,mx*0.04);mn-=pad;mx+=pad;
  var t0=Infinity,t1=-Infinity;all.concat(m.own?[{d:m.today}]:[]).forEach(function(p){var t=vchT(p.d);if(t<t0)t0=t;if(t>t1)t1=t;});
  if(!(t1>t0)){t0-=864e5*3;t1+=864e5*3;}
  var PL=W>640?6:4,PR=W>640?10:14,PT=56,PB=12;
  return {W:W,H:H,PL:PL,PR:PR,PT:PT,PB:PB,mn:mn,mx:mx,t0:t0,t1:t1,s:s,bl:bl,
    X:function(d){return PL+(W-PL-PR)*(vchT(d)-t0)/(t1-t0);},Y:function(v){return PT+(H-PT-PB)*(1-(v-mn)/(mx-mn));}};
}
function vchPath(pts,G){
  var P=pts.map(function(p){return [G.X(p.d),G.Y(p.v)];});if(!P.length)return '';
  var d='M'+P[0][0].toFixed(1)+','+P[0][1].toFixed(1);
  for(var i=0;i<P.length-1;i++){var p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;
    // monotone-ish: clamp control points vertically to the segment so the curve never overshoots real values
    var y1=p1[1]+(p2[1]-p0[1])/6,y2=p2[1]-(p3[1]-p1[1])/6,lo=Math.min(p1[1],p2[1]),hi=Math.max(p1[1],p2[1]);y1=Math.min(hi,Math.max(lo,y1));y2=Math.min(hi,Math.max(lo,y2));
    d+=' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+','+y1.toFixed(1)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+','+y2.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);}
  return d;
}
function vchDraw(st){
  var m=st.m,h=st.host,G=vchGeom(st),s=G.s,W=G.W,H=G.H,id='vg'+Math.random().toString(36).slice(2,7),svg;
  st.G=G;st.pts=s.main.length?s.main:s.dash.concat(m.own?[{d:m.today,v:m.own.v,own:true}]:[]);
  h.querySelectorAll('.vch-ranges button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-r')===st.r&&m.real>=2);b.setAttribute('aria-pressed',b.getAttribute('data-r')===st.r&&m.real>=2?'true':'false');});
  svg='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" focusable="false"><defs><linearGradient id="'+id+'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9AA6B" stop-opacity=".34"/><stop offset=".6" stop-color="#C9AA6B" stop-opacity=".08"/><stop offset="1" stop-color="#C9AA6B" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="'+id+'l" x1="0" x2="1"><stop offset="0" stop-color="#9C8350"/><stop offset=".7" stop-color="#C9AA6B"/><stop offset="1" stop-color="#F1DCA8"/></linearGradient>'+
    '<filter id="'+id+'g" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter></defs>';
  for(var g=1;g<4;g++){var gy=G.PT+(H-G.PT-G.PB)*g/4;svg+='<line x1="0" x2="'+W+'" y1="'+gy.toFixed(1)+'" y2="'+gy.toFixed(1)+'" stroke="rgba(255,255,255,.06)"/>';}
  var single=m.real<2,leg=[];
  if(single){
    var p0=st.pts[st.pts.length-1],cx=W/2,cy=G.PT+(H-G.PT-G.PB)*0.55;st.single={x:cx,y:cy,p:p0};
    svg+='<line x1="0" x2="'+W+'" y1="'+cy+'" y2="'+cy+'" stroke="#C9AA6B" stroke-opacity=".28" stroke-dasharray="2 7"/>';
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="22" fill="#C9AA6B" opacity=".12"/><circle cx="'+cx+'" cy="'+cy+'" r="12" fill="#C9AA6B" opacity=".25" filter="url(#'+id+'g)"/><circle cx="'+cx+'" cy="'+cy+'" r="6" fill="#F1DCA8"/>';
    svg+='<text x="'+cx+'" y="'+(cy-30)+'" text-anchor="middle" class="vch-st">'+esc((m.own?'Owner value ':'')+money(p0.v))+'</text>';
    leg.push('<span class="vch-hist">History starts '+esc(fmtDate((m.ai[0]||st.pts[0]||{d:m.today}).d||m.today))+' \u2014 updates weekly</span>');
  }else{
    st.single=null;
    if(G.bl.length>1){var bp='';G.bl.forEach(function(p,i){bp+=(i?' L':'M')+G.X(p.d).toFixed(1)+','+G.Y(p.v).toFixed(1);});
      svg+='<path d="'+bp+'" fill="none" stroke="#DCDDE0" stroke-width="1.6" stroke-dasharray="6 6" opacity=".7"/>';
      var lb=G.bl[G.bl.length-1];var fb=G.bl[0],ly0=G.Y(fb.v),mly=s.main.length?G.Y(s.main[0].v):H;svg+='<text x="'+(G.PL+2)+'" y="'+(mly<ly0?Math.min(H-G.PB-4,ly0+20):Math.max(G.PT-4,ly0-9)).toFixed(1)+'" text-anchor="start" class="vch-bt">Cost basis '+esc(money(lb.v))+'</text>';leg.push('<span><i class="d"></i>Cost basis</span>');}
    if(s.main.length>1){var ln=vchPath(s.main,G),x0=G.X(s.main[0].d),x1=G.X(s.main[s.main.length-1].d);
      svg+='<path d="'+ln+' L'+x1.toFixed(1)+','+(H-G.PB)+' L'+x0.toFixed(1)+','+(H-G.PB)+' Z" fill="url(#'+id+'f)"/>';
      svg+='<path d="'+ln+'" fill="none" stroke="#E6CF9C" stroke-width="6" opacity=".5" filter="url(#'+id+'g)"/><path d="'+ln+'" fill="none" stroke="url(#'+id+'l)" stroke-width="2.8" stroke-linecap="round"/>';
      var lp=s.main[s.main.length-1];svg+='<circle cx="'+x1.toFixed(1)+'" cy="'+G.Y(lp.v).toFixed(1)+'" r="11" fill="#C9AA6B" opacity=".22"/><circle cx="'+x1.toFixed(1)+'" cy="'+G.Y(lp.v).toFixed(1)+'" r="5" fill="#F1DCA8"/>';
      leg.unshift('<span><i></i>'+(m.kind==='coll'&&m.nOwner?'Value (owner values where set)':'AI estimate')+'</span>');}
    if(m.own){
      if(s.dash.length>1)svg+='<path d="'+vchPath(s.dash,G)+'" fill="none" stroke="#C9AA6B" stroke-width="2" stroke-dasharray="5 6" opacity=".8"/>';
      s.dash.forEach(function(p){svg+='<circle cx="'+G.X(p.d).toFixed(1)+'" cy="'+G.Y(p.v).toFixed(1)+'" r="2.6" fill="#C9AA6B" opacity=".9"/>';});
      var ox=G.X(m.today),oy=G.Y(m.own.v);
      svg+='<circle cx="'+ox.toFixed(1)+'" cy="'+oy.toFixed(1)+'" r="13" fill="#C9AA6B" opacity=".22"/><circle cx="'+ox.toFixed(1)+'" cy="'+oy.toFixed(1)+'" r="6.5" fill="#F1DCA8" stroke="#07080A" stroke-width="2" class="vch-own"/>';
      svg+='<text x="'+(ox-14).toFixed(1)+'" y="'+(oy-16).toFixed(1)+'" text-anchor="end" class="vch-ot">Owner value</text>';
      leg=['<span><b class="o"></b>Owner value</span>','<span><i class="a"></i>AI estimate</span>'].concat(leg);
    }
  }
  svg+='</svg>';
  h.querySelector('.vch-svg').innerHTML=svg;
  h.querySelector('.vch-plot').style.height=H+'px';
  var ax=h.querySelector('.vch-axis');
  if(single)ax.innerHTML='';
  else{var a=st.pts[0].d,b=st.pts[st.pts.length-1].d,mid=isoLocal(new Date((vchT(a)+vchT(b))/2)),fm=function(d){if(d===m.today)return 'Today';var dt=parseDate(d);return st.r==='All'&&(vchT(b)-vchT(a))>400*864e5?String(dt.getFullYear()):dt.toLocaleDateString('en-US',st.r==='1Y'||st.r==='All'?{month:'short',year:'2-digit'}:{month:'short',day:'numeric'});};
    ax.innerHTML='<span>'+esc(fm(a))+'</span><span>'+esc(fm(mid))+'</span><span>'+esc(fm(b))+'</span>';}
  h.querySelector('.vch-leg').innerHTML=leg.join('');
  h.querySelector('.vch-inst').textContent=m.insight(st.r);
  h.querySelector('.vch-plot').setAttribute('aria-label',m.label+' chart. '+m.insight(st.r));
  vchHead(st,null);vchOverlay(st);
}
function vchHead(st,p){
  var m=st.m,h=st.host,lab=h.querySelector('.vch-labt'),big=h.querySelector('.vch-big'),chg=h.querySelector('.vch-chg');
  if(p){
    lab.textContent=(p.own?'Owner value':(m.own?'AI estimate':(p.ext?'Value today':'Value on '+vchShort(p.d))));
    big.innerHTML=bigNum(p.v);
    var f=st.pts[0];chg.innerHTML=(p===f||st.pts.length<2)?'<span class="vch-rl">'+esc(fmtDate(p.d))+'</span>':vchChgHTML(vchChange([f,p]),'vs. '+vchShort(f.d));
    return;
  }
  lab.textContent=m.label;big.innerHTML=bigNum(m.value);
  if(m.real<2){chg.innerHTML='<span class="vch-rl">'+esc(m.own?'Set by the owner'+(m.ai.length?' / AI estimate '+money(m.ai[m.ai.length-1].v):''):'First AI estimate, '+fmtDate((m.ai[0]||{}).d||m.today))+'</span>';return;}
  if(m.own){var s=vchSlice(m.ai,st.r,m.today),c=vchChange(s);chg.innerHTML=c?'<span class="vch-rl">AI estimate</span> '+vchChgHTML(c,VCH.rl[st.r]):'<span class="vch-rl">AI estimate '+esc(money(m.ai[m.ai.length-1].v))+'</span>';return;}
  chg.innerHTML=vchChgHTML(vchChange(st.pts),VCH.rl[st.r]);
}
function vchOverlay(st){
  var h=st.host,x=h.querySelector('.vch-x'),dt=h.querySelector('.vch-dot'),bu=h.querySelector('.vch-bub'),G=st.G,p=st.sel;
  if(!p||!G||st.single){x.style.opacity=dt.style.opacity=bu.style.opacity='0';h.querySelector('.vch').classList.remove('scrub');return;}
  var px=G.X(p.d),py=G.Y(p.v),W=G.W;
  x.style.transform='translate3d('+px.toFixed(1)+'px,0,0)';x.style.top=(G.PT-8)+'px';x.style.height=(G.H-G.PT-G.PB+8)+'px';
  dt.style.transform='translate3d('+(px-7).toFixed(1)+'px,'+(py-7).toFixed(1)+'px,0)';
  bu.querySelector('.d').textContent=(p.own?'Owner value / ':(st.m.own?'AI estimate / ':''))+(p.ext?'Today':parseDate(p.d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}));
  bu.querySelector('.x').textContent=money(p.v);
  var bw=bu.offsetWidth||150,bx=Math.min(Math.max(px-bw/2,0),W-bw);bu.style.transform='translate3d('+bx.toFixed(1)+'px,0,0)';
  x.style.opacity=dt.style.opacity=bu.style.opacity='1';h.querySelector('.vch').classList.add('scrub');
}
function vchPick(st,clientX){
  var G=st.G;if(!G||st.single||!st.pts.length)return null;var r=st.host.querySelector('.vch-plot').getBoundingClientRect(),x=clientX-r.left,best=null,bd=Infinity;
  st.pts.forEach(function(p){var d=Math.abs(G.X(p.d)-x);if(d<bd){bd=d;best=p;}});return best;
}
function vchSet(st,p){if(p===st.sel)return;st.sel=p;if(st.raf)return;st.raf=requestAnimationFrame(function(){st.raf=0;vchOverlay(st);vchHead(st,st.sel);});}
function vchBind(st){
  var plot=st.host.querySelector('.vch-plot'),down=null,tm=0;
  function stop(e){e.stopPropagation();}
  plot.addEventListener('pointerdown',function(e){stop(e);if(st.single)return;clearTimeout(tm);down={id:e.pointerId,t:e.pointerType};try{plot.setPointerCapture(e.pointerId);}catch(_){}vchSet(st,vchPick(st,e.clientX));});
  plot.addEventListener('pointermove',function(e){if(down||e.pointerType==='mouse'){if(down)stop(e);if(!st.single)vchSet(st,vchPick(st,e.clientX));}});
  function up(e){if(!down)return;stop(e);var touch=down.t!=='mouse';down=null;if(touch){clearTimeout(tm);tm=setTimeout(function(){vchSet(st,null);},2600);}}
  plot.addEventListener('pointerup',up);plot.addEventListener('pointercancel',up);
  plot.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'&&!down)vchSet(st,null);});
  ['touchstart','touchmove','touchend'].forEach(function(n){plot.addEventListener(n,stop,{passive:true});});
  plot.addEventListener('click',stop);
  plot.addEventListener('keydown',function(e){if(st.single||!st.pts.length)return;var i=st.pts.indexOf(st.sel);
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();i=i<0?st.pts.length-1:Math.max(0,Math.min(st.pts.length-1,i+(e.key==='ArrowLeft'?-1:1)));vchSet(st,st.pts[i]);}
    else if(e.key==='Escape')vchSet(st,null);});
  plot.addEventListener('blur',function(){vchSet(st,null);});
}
// ---------- page hooks ----------
function vchRenderCollection(prefix,vehicles){try{vchMount(prefix+'-vch',vchCollModel(prefix,vehicles));}catch(e){var h=document.getElementById(prefix+'-vch');if(h){h.innerHTML='';h.classList.remove('on');}}}
function vchRenderVehicle(v){
  var p=document.getElementById('val-panel');if(!p)return;
  var m=null;try{m=vchVehModel('vd',v);}catch(e){m=null;}
  var host=document.getElementById('vd-vch');
  if(!m){if(host)host.remove();p.classList.remove('has-vch');delete VCH.st['vd-vch'];return;}
  if(!host){host=document.createElement('div');host.id='vd-vch';host.className='vch-host';p.insertBefore(host,p.firstChild);}
  p.classList.add('has-vch');vchMount('vd-vch',m);
}
