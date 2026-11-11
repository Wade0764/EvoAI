// ============ v29 SORT BY (carousel + collection lists). Per user + per portfolio in localStorage. Move mode keeps My order. ============
var ST_OPTS=[{k:'my',l:'My order',s:'My order'},{k:'year_desc',l:'Year, newest first',s:'Year \u2193'},{k:'year_asc',l:'Year, oldest first',s:'Year \u2191'},
  {k:'name',l:'Name A\u2013Z',s:'Name A\u2013Z'},{k:'added',l:'Date added, newest',s:'Newest added'},{k:'value',l:'Value, highest',s:'Value \u2193'}];
function stKeyFor(list){var v=(list||[])[0];return 'evo_sort_'+(myId()||'anon')+'_'+(v?phPfKey(v):'none');}
function stGet(key){try{var k=localStorage.getItem(key);return ST_OPTS.some(function(o){return o.k===k;})?k:'my';}catch(e){return 'my';}}
function stVal(v){try{if(!can(v,'view_value_estimate')&&!realAdmin()&&!isOwner())return null;var x=Number(aiVal(v));return isFinite(x)&&x>0?x:null;}catch(e){return null;}}
function stSort(list,mode){
  var a=(list||[]).map(function(v,i){return {v:v,i:i};}),nm=function(v){return (String(v.make||'')+' '+String(v.model||'')).trim().toLowerCase();},
      nul=function(x,y,f){var p=x==null,q=y==null;return p&&q?0:p?1:q?-1:f();};
  var cmp={year_desc:function(x,y){return nul(Number(x.year)||null,Number(y.year)||null,function(){return Number(y.year)-Number(x.year);});},
    year_asc:function(x,y){return nul(Number(x.year)||null,Number(y.year)||null,function(){return Number(x.year)-Number(y.year);});},
    name:function(x,y){return nm(x).localeCompare(nm(y));},
    added:function(x,y){return String(y.createdAt||'').localeCompare(String(x.createdAt||''));},
    value:function(x,y){var p=stVal(x),q=stVal(y);return nul(p,q,function(){return q-p;});}}[mode];
  if(!cmp)return list;
  return a.sort(function(x,y){return cmp(x.v,y.v)||x.i-y.i;}).map(function(o){return o.v;});
}
function stApply(list){if(typeof PH!=='undefined'&&PH.move)return list;return stSort(list,stGet(stKeyFor(list)));}
var ST_CUR=null;
function stLabel(k){var o=ST_OPTS.filter(function(x){return x.k===k;})[0]||ST_OPTS[0];return 'Sort: '+o.s;}
function stButton(host,list){
  if(!host||!(list||[]).length)return;
  var key=stKeyFor(list),b=host.querySelector('.st-btn');
  if(!b){b=document.createElement('button');b.type='button';b.className='st-btn';var h=host.querySelector('.ph-hint');(h&&h.nextSibling)?host.insertBefore(b,h.nextSibling):host.appendChild(b);}
  b.setAttribute('data-key',key);b.textContent=stLabel(stGet(key));b.setAttribute('aria-haspopup','dialog');
  b.onclick=function(){stOpen(key);};
}
function stOpen(key){
  ST_CUR=key;var cur=stGet(key);
  sheetOpen({title:'Sort by',html:'<div class="st-list" role="radiogroup">'+ST_OPTS.map(function(o){
    return '<button type="button" class="st-opt'+(o.k===cur?' on':'')+'" role="radio" aria-checked="'+(o.k===cur)+'" data-k="'+o.k+'" onclick="stPick(\''+o.k+'\')"><span>'+esc(o.l)+(o.k==='my'?'<small>Hold a car to reorder</small>':'')+'</span><b aria-hidden="true">'+(o.k===cur?'\u2713':'')+'</b></button>';}).join('')+'</div>',
    buttons:[{label:'Close',fn:sheetClose}]});
}
function stPick(k){try{if(k==='my')localStorage.removeItem(ST_CUR);else localStorage.setItem(ST_CUR,k);}catch(e){}sheetClose();refreshCurrent();}
var _wheelMount29=wheelMount;
wheelMount=function(id,list){var r=_wheelMount29.apply(this,arguments);try{stButton(document.getElementById(id),list);}catch(e){}return r;};
(function(){try{var st=document.createElement('style');
  st.textContent='.st-btn{display:block;margin:14px auto 0;background:transparent;border:1px solid var(--gold,#c9a85c);border-radius:999px;color:var(--gold,#c9a85c);font-size:17px;padding:10px 22px;min-height:44px;cursor:pointer}'
   +'.st-list{display:flex;flex-direction:column;margin:8px 0}.st-opt{display:flex;justify-content:space-between;align-items:center;background:transparent;border:0;border-bottom:1px solid var(--line);padding:16px 2px;color:#fff;font-size:19px;text-align:left;min-height:52px;cursor:pointer}'
   +'.st-opt small{display:block;font-size:15px;color:var(--gold,#c9a85c);margin-top:3px}.st-opt.on{color:var(--gold,#c9a85c)}.st-opt b{color:var(--gold,#c9a85c);font-size:20px}';
  document.head.appendChild(st);}catch(e){}})();
var _rcd29=renderClientDetail;
renderClientDetail=function(){var r=_rcd29.apply(this,arguments);try{
  var list=document.getElementById('cd-vehicles'),c=byId(getClients(),currentClientId);if(!list||!c)return r;
  var vs=activeVehicles(getVehicles()).filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);});
  var bar=document.getElementById('cd-sortbar');if(!bar){bar=document.createElement('div');bar.id='cd-sortbar';list.parentNode.insertBefore(bar,list);}
  bar.innerHTML='';stButton(bar,vs);}catch(e){}return r;};
