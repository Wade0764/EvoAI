// ============ v38 collection crest (p38): THE / NAME / COLLECTION hero on owner Overview, client page and View-as. Real data only. ============
var CN_SUFFIX=/^(?:(the)\s+)?(.+?)\s+(collection|collective|garage|stable|motor\s+house|motorhouse|heritage|archive|estate)$/i;
function cnParse(t){t=String(t||'').trim();var m=t.match(CN_SUFFIX);if(m&&m[2]&&m[2].length>=2)return {the:m[1]||'',hero:m[2],suf:m[3]};
  var m2=t.match(/^(the)\s+(.+)$/i);if(m2)return {the:m2[1],hero:m2[2],suf:''};return {the:'',hero:t,suf:''};}
function cnMeta(c){
  if(!c)return '';var vs=getVehicles().filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);}),yrs=[];
  vs.forEach(function(v){[v.purchaseDate,v.createdAt].forEach(function(d){var y=parseInt(String(d||'').slice(0,4),10);if(y>1900&&y<3000)yrs.push(y);});});
  var cy=parseInt(String(c.createdAt||'').slice(0,4),10);if(cy>1900&&cy<3000)yrs.push(cy);
  var parts=[];if(yrs.length)parts.push('Est. '+Math.min.apply(null,yrs));
  parts.push(vs.length+' vehicle'+(vs.length===1?'':'s'));return parts.join(' \u00b7 ');
}
function cnSize(hero){var w=String(hero).split(/\s+/),lw=0;w.forEach(function(x){lw=Math.max(lw,x.length);});var n=hero.length;
  var fs=n<=12?46:n<=18?42:n<=26?38:34;if(lw>11)fs=Math.min(fs,Math.max(34,Math.floor(470/lw)));var ls=lw>13?'.06em':lw>10?'.1em':'.14em';return {fs:fs,ls:ls};}
function ctitleHTML(n,exact,c){
  var t=exact?String(n||'').trim():ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!exact&&!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  var p=cnParse(t),sz=cnSize(p.hero),meta=cnMeta(c);
  var rule='<div class="ctitle-rule cn-rule" aria-hidden="true"><i></i><b></b><i></i></div>';
  return '<div class="cn-crest"><div class="ctitle-eyebrow">Private Collection</div><div class="cn-top" aria-hidden="true"><i></i><b></b><i></i></div>'+
    '<h2 class="ctitle-name cn-name" style="font-size:'+sz.fs+'px">'+(p.the?'<span class="cn-the">'+esc(p.the)+'</span> ':'')+'<span class="cn-hero" style="letter-spacing:'+sz.ls+'">'+esc(p.hero)+'</span>'+(p.suf?' <span class="cn-suf">'+esc(p.suf)+'</span>':'')+'</h2>'+
    rule+(meta?'<div class="cn-meta">'+esc(meta)+'</div>':'')+'</div>';
}
function ctitleSet(id,n,exact,c){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n,exact,c);
  el.setAttribute('data-name',String(n||''));
  var hd=el.closest('.page-header');if(hd)hd.classList.add('cn-hd');
}
