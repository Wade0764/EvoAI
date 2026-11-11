// ============ v36 To Do (p36): every car with Missing details, filled in place. Same completeness logic (msCount) and the same save path (editCurrentVehicle + saveVehicle). No DB change. ============
var TD={draft:{},saving:null};
var TD_IN={car:[{id:'v-year',l:'Year',t:'number',ph:'1968',im:'numeric'},{id:'v-make',l:'Make',t:'text',ph:'Porsche'},{id:'v-model',l:'Model',t:'text',ph:'912 Coupe'}],
 vin:[{id:'v-vin',l:'VIN / Chassis no.',t:'text',ph:'WP0ZZZ...',mono:1}],
 reg:[{id:'v-plate',l:'Registration (plate)',t:'text',ph:'K9 JOLLY',caps:1},{id:'v-plate-region',l:'State / region',t:'text',ph:'FL',opt:1}],
 color:[{id:'v-color',l:'Colour',t:'text',ph:'Aubergine'}],
 miles:[{id:'v-mileage',l:'Mileage (mi)',t:'number',ph:'52100',im:'numeric'}],
 paid:[{id:'v-purchase-price',l:'What you paid',t:'number',ph:'229000',im:'decimal'},{id:'v-currency',l:'Currency',t:'select',opts:[['USD','USD ($)'],['EUR','EUR (\u20ac)'],['GBP','GBP (\u00a3)']]}],
 loc:[{id:'v-location',l:'Location',t:'text',ph:'Hickory Vaults'}],
 ins:[{id:'v-insurer',l:'Insurance',t:'text',ph:'Chubb'}]};
function tdMissing(v){return msFieldsFor(v).filter(function(f){return !msValue(v,f);});}
function tdCars(){
  var vs=visibleVehicles().filter(function(v){return msCanSeeMissing(v)&&tdMissing(v).length>0;});
  var cl=getClients().map(function(c){return c.id;}),groups=[],gi={};
  var owners=[];vs.forEach(function(v){if(owners.indexOf(v.clientId)<0)owners.push(v.clientId);});
  owners.sort(function(a,b){return cl.indexOf(a)-cl.indexOf(b);});
  owners.forEach(function(o){poList(o).forEach(function(p){
    var mine=vs.filter(function(v){return v.clientId===o&&poOf(v,o).id===p.id;});if(!mine.length)return;
    var ordered=stApply(phSorted(activeVehicles(getVehicles()).filter(function(x){return x.clientId===o&&poOf(x,o).id===p.id;}))).filter(function(x){return mine.indexOf(x)>=0;});
    var c=byId(getClients(),o);groups.push({owner:o,pf:p,client:c,cars:ordered});});});
  return groups;
}
function tdCount(){try{if(!session)return 0;var n=0;tdCars().forEach(function(g){n+=g.cars.length;});return n;}catch(e){return 0;}}
function tdBadge(){var b=document.getElementById('todo-badge');if(!b)return;var n=tdCount();b.textContent=n;b.style.display=n?'':'none';
  var ni=document.querySelector('.nav-item[data-page="todo"]');if(ni)ni.setAttribute('aria-label','To Do'+(n?', '+n+' vehicle'+(n===1?'':'s')+' need details':''));}
function tdRing(d,t){var C=2*Math.PI*14,f=t?d/t:0;return '<svg class="em-ring td-ring" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="4"/><circle cx="17" cy="17" r="14" fill="none" stroke="#10D98A" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(C*f)+' '+C+'" transform="rotate(-90 17 17)"/></svg>';}
function tdInput(v,f,s,solo){
  var key=v.id+'|'+s.id,cur=TD.draft.hasOwnProperty(key)?TD.draft[key]:(s.id==='v-currency'?(v.currency||'USD'):(s.id==='v-year'?(v.year||''):s.id==='v-make'?(v.make||''):s.id==='v-model'?(v.model||''):s.id==='v-plate-region'?(v.plateRegion||''):''));
  var fid='td-'+v.id.slice(-8)+'-'+s.id,a=' id="'+fid+'" data-v="'+esc(v.id)+'" data-in="'+s.id+'" oninput="tdDraft(this)" onchange="tdDraft(this)"';
  var el=s.t==='select'?'<select'+a+'>'+s.opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select>'
    :'<input type="'+s.t+'"'+a+(solo?' aria-label="'+esc(f.label)+'"':'')+' value="'+esc(String(cur))+'" placeholder="'+esc(s.ph?'e.g. '+s.ph:'')+'"'+(s.im?' inputmode="'+s.im+'" min="0"':'')+(s.caps?' autocapitalize="characters"':'')+' autocomplete="off"'+(s.mono?' class="mono"':'')+'>';
  return '<label class="td-f'+(solo?' td-solo':'')+'" for="'+fid+'"><span class="td-l">'+esc(s.l)+(s.opt?' <i>(optional)</i>':'')+'</span>'+el+'</label>';
}
function tdCard(v){
  var miss=tdMissing(v),c=msCount(v);
  var flds=miss.map(function(f){return '<div class="td-fld" data-f="'+f.k+'"><div class="td-fh"><span class="td-fn">'+esc(f.label)+'</span><span class="td-miss">Missing</span></div><div class="td-ins">'+(TD_IN[f.k]||[]).map(function(s){return tdInput(v,f,s,(TD_IN[f.k]||[]).length===1);}).join('')+'</div></div>';}).join('');
  return '<article class="td-card" data-v="'+esc(v.id)+'"><div class="td-head" onclick="openVehicleDetail(\''+esc(v.id)+'\')" role="button" tabindex="0" aria-label="Open '+esc(vFull(v))+'"><div class="td-th">'+phThumb(v)+'</div><div class="td-nm"><div class="td-name">'+esc(vFull(v).trim()||vName(v))+'</div>'+(v.nickname?'<div class="td-nick">'+esc(v.nickname)+'</div>':'')+'</div>'+
    '<div class="td-cnt" aria-label="'+c.done+' of '+c.total+' complete">'+tdRing(c.done,c.total)+'<span>'+c.done+' of '+c.total+'</span></div></div>'+
    '<div class="td-body">'+flds+'</div><div class="td-act"><button type="button" class="btn btn-primary td-save" onclick="tdSave(\''+esc(v.id)+'\')">Save '+(miss.length===1?'detail':'details')+'</button></div></article>';
}
function tdDraft(el){TD.draft[el.getAttribute('data-v')+'|'+el.getAttribute('data-in')]=el.value;}
function renderTodo(){
  var r=document.getElementById('todo-root');if(!r)return;var gs=tdCars(),n=0;gs.forEach(function(g){n+=g.cars.length;});
  var sub=document.getElementById('todo-sub');if(sub)sub.textContent=n?(n+' vehicle'+(n===1?' needs':'s need')+' details. Fill them in here.'):'Every vehicle has its key details on file.';
  if(!n){r.innerHTML='<div class="td-empty" role="status">'+tdRing(8,8)+'<div class="td-et">All records complete</div><div class="td-es">Every vehicle has its key details on file.</div></div>';tdBadge();return;}
  var multi=gs.length>1||isAdvisor();
  r.innerHTML=gs.map(function(g){var h=(isAdvisor()&&g.client?esc(g.client.name||'')+' \u00b7 ':'')+esc(g.pf.name);
    return '<section class="td-grp" aria-label="'+h+'">'+(multi||!g.pf.implicit?'<h2 class="td-gh">'+h+' <span>'+g.cars.length+'</span></h2>':'')+g.cars.map(tdCard).join('')+'</section>';}).join('');
  tdBadge();
}
function tdSave(id){
  var v=byId(getVehicles(),id);if(!v||!msCanSeeMissing(v))return;
  var card=document.querySelector('.td-card[data-v="'+id+'"]');if(!card)return;
  var ins=[].slice.call(card.querySelectorAll('[data-in]')),any=false;
  ins.forEach(function(el){if(el.tagName!=='SELECT'&&String(el.value).trim())any=true;});
  if(!any){showToast('Fill in at least one detail first','error');var f=card.querySelector('input');if(f)f.focus();return;}
  var prevCur=currentVehicleId;currentVehicleId=id;
  editCurrentVehicle();
  if(editingVehicleId!==id){currentVehicleId=prevCur;return;}
  ins.forEach(function(el){var x=String(el.value).trim();if(el.tagName==='SELECT'||x)setVal(el.getAttribute('data-in'),el.getAttribute('data-in')==='v-plate'?x.toUpperCase():x);});
  var before=msCount(v).done;
  saveVehicle();
  if(editingVehicleId===id){/* validation failed: keep the form closed, keep drafts */editingVehicleId=null;closeModal('modal-add-vehicle');return;}
  ins.forEach(function(el){delete TD.draft[id+'|'+el.getAttribute('data-in')];});
  var nv=byId(getVehicles(),id),c=nv?msCount(nv):{done:0,total:8};
  var tc=document.getElementById('toast-container');if(tc){[].slice.call(tc.querySelectorAll('.toast')).forEach(function(t){if(t.textContent==='Vehicle updated'||t.textContent==='Fill in at least one detail first')t.remove();});}
  showToast(vName(nv)+(c.done>=c.total?': all details complete':': saved, '+(c.total-c.done)+' still missing'),'success');
  if(!document.getElementById('page-todo').classList.contains('active'))showPage('todo');else renderTodo();
}
(function(){if(typeof updateRecBadge==='function'){var _u=updateRecBadge;updateRecBadge=function(){var r=_u.apply(this,arguments);try{tdBadge();}catch(e){}return r;};}})();
