/* v40 cleanup behaviour. Existing save paths stay; this only changes how they are reached. */
function whlHint(){
  var coarse=false;
  try{coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;}catch(e){}
  return coarse?'<span class="whl-hint">Swipe</span>':'<span class="whl-hint">Swipe, drag or use arrow keys</span>';
}
function moreClose(){
  var s=document.getElementById('more-sheet');
  if(s)s.setAttribute('hidden','');
  var t=document.querySelector('.nav-more');
  if(t)t.classList.remove('active');
}
function moreOpen(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  var s=document.getElementById('more-sheet');
  if(!s)return;
  if(s.hasAttribute('hidden')){s.removeAttribute('hidden');var t=document.querySelector('.nav-more');if(t)t.classList.add('active');}
  else moreClose();
}
function moreBadge(){
  var n=0,rb=document.getElementById('rem-badge'),ab=document.getElementById('recs-badge'),b=document.getElementById('more-badge');
  if(rb&&rb.style.display!=='none')n+=parseInt(rb.textContent,10)||0;
  if(ab&&ab.style.display!=='none')n+=parseInt(ab.textContent,10)||0;
  if(b){b.textContent=String(n);b.style.display=n?'':'none';}
}
function renderGarage(){
  var vs=visibleVehicles(),host=document.getElementById('garage-vehicles');
  if(!host)return;
  var sub=document.getElementById('garage-sub');
  if(sub)sub.textContent=isOwner()?('Your '+vs.length+' '+(vs.length===1?'car':'cars')):('Cars you can open');
  host.innerHTML=vs.length?wheelHTML(vs,'garage'):emptyCard(isOwner()?'Your garage is empty. Add a vehicle from Overview.':'No cars on your access yet.');
  if(vs.length)wheelMount('garage-vehicles',vs);
}
function dueChip(owner){
  var id=owner?'cp-due-chip':'dash-due-chip';
  var host=document.getElementById(owner?'cp-vch':'dash-vch')||document.getElementById(owner?'cp-hero':'dash-hero');
  if(!host)return;
  var el=document.getElementById(id);
  if(!el){el=document.createElement('button');el.id=id;el.type='button';el.className='due-chip';el.onclick=function(){ovcSet(owner?'cp':'dash','stats');};host.appendChild(el);}
  var c=remCounts(reminderItems(visibleVehicles())),n=c.over+c.soon;
  el.style.display=n?'inline-flex':'none';
  el.textContent=n+' due within 30 days';
}
function valueHomeHTML(vehicles){
  var t=portfolioTotals(vehicles),exs=getExpenses(),i,h='';
  h+='<div class="vh-card card-em"><div class="vh-top"><div><div class="lab">Collection value</div><div class="vh-num">'+valueOverviewNum(t)+'</div><div class="vh-disc">Estimate, not an appraisal</div>';
  if(t.low||t.high)h+='<div class="vh-range">Range '+money(t.low)+' - '+money(t.high)+'</div>';
  h+='</div><div><div class="vh-basis">Cost basis '+(t.basisAll>0?money(t.basisAll):'--')+'</div>'+deltaHTML(t)+'</div></div>';
  for(i=0;i<vehicles.length;i++){
    var v=vehicles[i],g=vehicleGain(v,exs);
    var asOf=(g.hasValue&&v.aiValue&&v.aiValue.asOf)?('Estimate, as of '+fmtDate(v.aiValue.asOf)):'Estimate, not an appraisal';
    h+='<div class="vh-row"><span>'+esc(vName(v))+'</span><b>'+(g.hasValue?money(g.value)+'<small>'+esc(asOf)+'</small>':'--')+'</b></div>';
  }
  return h+'</div>';
}
function mountValueHome(owner,vehicles){
  var id=owner?'cp-value-home':'dash-value-home';
  var panel=document.getElementById(owner?'cp-ovc-stats':'dash-ovc-stats');
  if(!panel)return;
  var el=document.getElementById(id);
  if(!el){el=document.createElement('div');el.id=id;panel.appendChild(el);}
  el.innerHTML=valueHomeHTML(vehicles);
}
function attAct(vid,kind,id){
  if(kind==='service'||kind==='mileage'){serviceDoneToday(vid);return;}
  if(kind==='adv'){showPage('recommendations');return;}
  markRenewed(vid,kind,id||'');
}
attentionItems=function(vehicles){
  var out=[],ids={},i,items=reminderItems(vehicles),recs=getRecs(),owner=isOwner();
  for(i=0;i<vehicles.length;i++)ids[vehicles[i].id]=vehicles[i];
  for(i=0;i<items.length;i++){
    if(items[i].sortDays>30)continue;
    var it=items[i],v=ids[it.vid];
    out.push({score:it.sortDays,vid:it.vid,name:vName(v),text:remPhrase(it),kind:it.kind,rid:it.id||'',src:'Reminders'});
  }
  for(i=0;i<recs.length;i++){
    var r=recs[i];
    if(!ids[r.vehicleId])continue;
    var show=owner?(r.status==='open'||(r.status==='accepted'&&r.urgency!=='green')):(r.status==='open'||r.status==='accepted'||(r.status==='declined'&&r.urgency!=='green'));
    if(!show)continue;
    out.push({score:r.urgency==='red'?0:20,vid:r.vehicleId,name:vName(ids[r.vehicleId]),text:r.title+(r.cost?' - '+r.cost:''),kind:'adv',rid:r.id,src:'Advisory'});
  }
  out.sort(function(a,b){return a.score-b.score;});
  return out;
};
attentionHTML=function(vehicles){
  var items=attentionItems(vehicles),i,h='';
  if(!items.length){
    h='<div class="calm"><div class="calm-t">Nothing needs your attention</div><div class="calm-s">Dates and advisories will collect here.</div></div>';
  }else{
    for(i=0;i<items.length;i++){
      var a=items[i],hot=a.score<14||a.kind==='adv'&&a.score===0;
      var act=a.kind==='adv'?'Review':'Done';
      h+='<div class="att-card'+(hot?' hot':'')+'" onclick="openVehicleDetail(\''+jsId(a.vid)+'\')"><div><b>'+esc(a.text)+'</b><span>'+esc(a.name)+' - '+esc(a.src)+'</span></div>';
      h+='<button type="button" class="btn '+(a.kind==='adv'?'btn-primary':'btn-sm')+'" onclick="event.stopPropagation();attAct(\''+jsId(a.vid)+'\',\''+jsId(a.kind)+'\',\''+jsId(a.rid)+'\')">'+act+'</button></div>';
    }
  }
  var miss=0;
  try{miss=typeof tdCount==='function'?tdCount():0;}catch(e){}
  if(miss)h+='<div class="att-card"><div><b>Records to complete ('+miss+')</b><span>Missing details</span></div><button type="button" class="btn btn-sm" onclick="showPage(\'todo\')">To do</button></div>';
  h+='<p class="att-note">Phone and email alerts are off. Use Add to calendar in Reminders.</p>';
  return h;
};
var _collectionBrief=collectionBrief;
collectionBrief=function(vs){
  var html=_collectionBrief(vs),n=0;
  return html.replace(/<p>[\s\S]*?<\/p>/g,function(p){
    n++;
    if(n===2)return '<p>Anything due within 30 days, and open advisories, live on the one attention list under Stats.</p>';
    return p;
  });
};
var _showDueBanner=showDueBanner;
showDueBanner=function(){dueBannerShown=true;showEl('due-banner',false);};
var _valueOverviewNum=valueOverviewNum;
valueOverviewNum=function(t){
  if(t&&t.nValued)return _valueOverviewNum(t);
  return '<span class="val-empty">'+esc(noValueText(t))+'</span>';
};
var _renderOverview=renderOverview;
renderOverview=function(owner,vehicles){
  _renderOverview(owner,vehicles);
  dueChip(!!owner);
  mountValueHome(!!owner,vehicles);
  if(owner){
    var page=document.getElementById('page-client-portal');
    var actions=page&&page.querySelector('.topline .head-actions');
    if(actions){
      var slot=document.getElementById('cp-actions');
      if(!slot){slot=document.createElement('div');slot.id='cp-actions';slot.className='ov-actions';page.appendChild(slot);}
      if(actions.parentNode!==slot)slot.appendChild(actions);
    }
  }
};
var _showPage=showPage;
showPage=function(pageId){
  if(pageId==='valuations'){
    var home=isOwner()?'client-portal':'dashboard';
    _showPage(home);
    try{ovcSet(isOwner()?'cp':'dash','stats');}catch(e){}
    moreClose();
    return;
  }
  _showPage(pageId);
  if(pageId==='garage')renderGarage();
  moreClose();
  moreBadge();
  var primary={dashboard:1,'client-portal':1,garage:1,requests:1,todo:1};
  var moreTab=document.querySelector('.nav-more');
  if(moreTab&&!primary[pageId])moreTab.classList.add('active');
};
var _detailActionsHTML=detailActionsHTML;
detailActionsHTML=function(v){
  if(isArchivedVehicle(v))return '';
  var primary='',more='';
  function b(cls,label,fn){return '<button type="button" class="btn '+cls+'" onclick="'+fn+'">'+label+'</button>';}
  if(can(v,'can_add_service'))primary+=b('btn-primary','Log service','openServiceFromDetail()');
  if(canEditVehicle(v))primary+=b('','Share / request','goAccessFromDetail()');
  if(can(v,'can_add_expenses'))more+=b('btn-sm','Expense','openExpenseFromDetail()');
  if(can(v,'can_add_documents'))more+=b('btn-sm','Document','openDocFromDetail()');
  if(canManageReminders(v))more+=b('btn-sm','Reminder','openReminderFromDetail()');
  if(can(v,'can_add_service')){more+=b('btn-sm','Note','openNoteFromDetail()');more+=b('btn-sm','Inspection','openRecordModal(\'inspection\')');}
  if(can(v,'can_create_advisories'))more+=b('btn-sm','Advisory','openRecForVehicle()');
  if(canUploadPhotos(v))more+=b('btn-sm','Photo','pickDetailPhoto()');
  if(canEditVehicle(v)){
    more+=b('btn-sm','Edit details','editCurrentVehicle()');
    more+=b('btn-sm','Sell / transfer','openTransferModal()');
    more+=b('btn-sm btn-danger','Archive','archiveCurrentVehicle()');
  }
  if(!primary&&!more)return '';
  return '<div class="vd-primary">'+primary+'</div>'+(more?'<div class="vd-morebox"><div class="vd-morelab">More actions</div><div class="vd-moregrid">'+more+'</div></div>':'');
};
function openRecordModal(kind){
  if(kind==='inspection'){closeModal('modal-service');openInspectionModal();return;}
  closeModal('modal-inspection');
  openServiceModal();
}
var _openVehicleDetail=openVehicleDetail;
openVehicleDetail=function(id){
  _openVehicleDetail(id);
  var box=document.getElementById('vd-recs');
  if(box&&!box.querySelector('[data-adv-link]')){
    var n=box.querySelectorAll('.alert-item').length;
    if(n)box.innerHTML='<div class="att-card"><div><b>Open advisory'+(n===1?'':' - '+n)+'</b><span>Accept or decline on Advisories</span></div><button type="button" class="btn btn-sm" data-adv-link="1" onclick="closeModal(\'modal-vehicle-detail\');showPage(\'recommendations\')">Advisories</button></div>';
  }
};
function openPriceList(){
  if(typeof isAdvisor==='function'&&isAdvisor()){plOpen('empty');moreClose();return;}
  _showPage('access');
  var btn=document.querySelector('.team-card .pl-team');
  if(btn)btn.click();
  moreClose();
}
var _renderRequests=renderRequests;
renderRequests=function(){
  _renderRequests();
  var root=document.getElementById('rq-root');
  if(!root||document.getElementById('rq-pl-entry'))return;
  var bar=document.createElement('div');
  bar.id='rq-pl-entry';bar.className='rq-pl-entry';
  bar.innerHTML=(typeof isOwner==='function'&&isOwner())
    ?'<button type="button" class="btn" onclick="openPriceList()">Services and price list</button>'
    :'<button type="button" class="btn" onclick="plOpen(\'empty\')">My price list</button>';
  root.parentNode.insertBefore(bar,root);
};
var _updateRemBadge=updateRemBadge;
updateRemBadge=function(){_updateRemBadge();moreBadge();};
var _updateRecBadge=updateRecBadge;
updateRecBadge=function(){_updateRecBadge();moreBadge();};
navAInit=function(){
  var s=document.getElementById('nav-A');if(s)s.remove();
  var c=document.querySelector('.nav-chev');if(c)c.remove();
  var sb=document.querySelector('.sidebar');
  if(sb){sb.classList.remove('nav-at-start');sb.classList.remove('nav-at-end');sb.style.webkitMaskImage='none';sb.style.maskImage='none';}
};
if(document.getElementById('nav-A'))navAInit();
