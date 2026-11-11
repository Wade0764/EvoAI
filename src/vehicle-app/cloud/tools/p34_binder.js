// ===== v34 (p34): Records vault - AI auto-files every document into a binder =====
// No DB change: the binder is derived from doc_category / kind / service_record_id / title,
// and a manual move is stored on the existing documents.title extras ({bd:'...'}) so it follows the row.
var BND_LIST=[['service','Service'],['insurance','Insurance'],['title','Title'],['registration','Registration'],['warranty','Warranty'],['inspections','Inspections'],['purchase','Purchase & Loan'],['sticker','Sticker & VIN'],['other','Other']];
var BND_IC={service:'&#128295;',insurance:'&#128737;',title:'&#128220;',registration:'&#129706;',warranty:'&#10022;',inspections:'&#9678;',purchase:'&#129534;',sticker:'&#9635;',other:'&#128193;'};
var BND_CAT={repair_invoice:'service',service_record:'service',receipt:'service',insurance:'insurance',title:'title',registration:'registration',inspection:'inspections',warranty:'warranty'};
var BND_TO_CAT={service:'service_record',insurance:'insurance',title:'title',registration:'registration',warranty:'warranty',inspections:'inspection',purchase:'other',sticker:'other',other:'other'};
var BND_REM_KIND={insurance:'insurance',registration:'tag',inspections:'inspection',warranty:'custom',title:'custom',purchase:'custom',sticker:'custom',service:'service',other:'custom'};
var BND_LOW=0.7,BND_ALERT_DAYS=60;
var BND={vid:null,bd:null,q:'',auto:{}};
function bndLabel(k){for(var i=0;i<BND_LIST.length;i++)if(BND_LIST[i][0]===k)return BND_LIST[i][1];return 'Other';}
function bndValid(k){return BND_LIST.some(function(b){return b[0]===k;});}
function bndMem(){try{return JSON.parse(localStorage.getItem('evo_bnd_moves')||'{}')||{};}catch(e){return {};}}
function bndText(d){var a=d.ai||{};return [d.name,a.vendor,a.summary,(a.services||[]).join(' '),d.notes].join(' ').toLowerCase();}
// Auto-file: manual move wins, then strong keywords, then the AI category, then the old type field
function bndAuto(d){
  var t=bndText(d),a=d.ai||{},c=a.category||'';
  if(/window sticker|monroney|vin plate|vin tag|vin photo|build sheet/.test(t))return 'sticker';
  if(/bill of sale|purchase agreement|buyer.?s order|loan|financ|lien|lender/.test(t))return 'purchase';
  if(d.srId)return 'service';
  if(BND_CAT[c])return BND_CAT[c];
  if(/warrant/.test(t))return 'warranty';
  if(/inspection|smog|emissions|ppi\b/.test(t))return 'inspections';
  if(!c){var ty=d.type;if(ty==='invoice'||ty==='service')return 'service';if(ty==='title'||ty==='registration'||ty==='insurance')return ty;}
  return 'other';
}
function bndOf(d){var m=d.bd||bndMem()[d.id];return bndValid(m)?m:bndAuto(d);}
function bndMoved(d){var m=d.bd||bndMem()[d.id];return bndValid(m);}
function bndConf(d){return d.ai&&d.ai.confidence!=null?+d.ai.confidence:null;}
function bndLowConf(d){if(bndMoved(d))return false;var c=bndConf(d);return (c!=null&&c<BND_LOW)||(d.ai&&d.ai.status&&d.ai.status!=='manual'&&bndAuto(d)==='other');}
function bndExp(d){return (d.ai&&d.ai.expiresOn)||d.expiry||'';}
function bndDays(s){if(!s)return null;var t=Date.parse(String(s).slice(0,10)+'T00:00:00');if(!isFinite(t))return null;var n=new Date();n.setHours(0,0,0,0);return Math.round((t-n.getTime())/86400000);}
function bndDate(d){return (d.ai&&d.ai.docDate)||String(d.createdAt||'').slice(0,10);}
function bndMoney(n){return '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});}
function bndDocs(vid){var ids={};visibleVehicles().forEach(function(v){ids[v.id]=1;});return getDocs().filter(function(d){return ids[d.vehicleId]&&(!vid||d.vehicleId===vid);});}
function bndAlerts(docs){
  var out=[];docs.forEach(function(d){var e=bndExp(d),n=bndDays(e);if(n!=null&&n<=BND_ALERT_DAYS)out.push({d:d,days:n,exp:e,bd:bndOf(d)});});
  // only the newest document per vehicle+binder counts (a renewed policy replaces the old one)
  var best={};out.forEach(function(a){var k=a.d.vehicleId+'|'+a.bd;var newer=docs.some(function(o){return o.vehicleId===a.d.vehicleId&&bndOf(o)===a.bd&&bndDays(bndExp(o))!=null&&bndDays(bndExp(o))>a.days;});if(!newer&&(!best[k]||best[k].days>a.days))best[k]=a;});
  return Object.keys(best).map(function(k){return best[k];}).sort(function(a,b){return a.days-b.days;});
}
function bndDue(n){return n<0?'expired '+(-n)+' day'+(n===-1?'':'s')+' ago':(n===0?'expires today':'expires in '+n+' day'+(n===1?'':'s'));}
function bndMatch(d,q){if(!q)return true;q=q.toLowerCase();return (bndText(d)+' '+bndLabel(bndOf(d)).toLowerCase()+' '+vName(byId(getVehicles(),d.vehicleId)).toLowerCase()).indexOf(q)>=0;}
function bndSearchHTML(ph){return '<div class="bnd-search"><span aria-hidden="true">&#8981;</span><input id="bnd-q" type="search" placeholder="'+esc(ph)+'" value="'+esc(BND.q)+'" oninput="bndSearch(this.value)" aria-label="Search records"></div>';}
function bndSearch(q){BND.q=q;var r=document.getElementById('bnd-results');if(r)r.innerHTML=bndResultsHTML();}
function bndResultsHTML(){
  if(!BND.q)return '';
  var l=bndDocs(BND.vid).filter(function(d){return (!BND.bd||bndOf(d)===BND.bd)&&bndMatch(d,BND.q);});
  return '<div class="bnd-h">'+l.length+' match'+(l.length===1?'':'es')+'</div>'+(l.length?l.map(bndRowHTML).join(''):'<div class="bnd-card">Nothing found for "'+esc(BND.q)+'"</div>');
}
function bndAlertHTML(al,showVeh){
  if(!al.length)return '';
  return '<div class="bnd-card bnd-alert" id="bnd-alerts"><div class="bnd-at">&#9888; '+al.length+' item'+(al.length===1?' needs':'s need')+' attention</div>'+al.map(function(a){var v=byId(getVehicles(),a.d.vehicleId);
    return '<button type="button" class="bnd-al" onclick="bndOpen(\''+jsId(a.d.vehicleId)+'\',\''+a.bd+'\')">'+esc(bndLabel(a.bd))+(showVeh?' &middot; '+esc(vName(v)):'')+' &mdash; '+esc(bndDue(a.days))+' ('+esc(fmtDate(a.exp))+')</button>';}).join('')+'</div>';
}
function bndTileHTML(k,docs,vid){
  var l=docs.filter(function(d){return bndOf(d)===k;}),al=bndAlerts(l),low=l.filter(bndLowConf).length,s;
  if(al.length)s='<span class="bnd-red">'+esc(al[0].days<0?'Expired':'Due '+fmtDate(al[0].exp).replace(/, \d{4}$/,''))+'</span>';
  else if(low)s='<span class="bnd-red">'+low+' to check</span>';
  else if(!l.length)s='Empty';
  else if(k==='service'){var tot=l.reduce(function(t,d){return t+(d.ai&&d.ai.amount?+d.ai.amount:0);},0);s=tot?bndMoney(tot)+' total':'Last '+fmtDate(bndDate(docAiSort?docAiSort(l)[0]:l[0]));}
  else{var e=l.map(bndExp).filter(Boolean).sort().pop();s=e?'Valid to '+fmtDate(e):'Last '+fmtDate(bndDate(l[0]));}
  return '<button type="button" class="bnd-tile'+(al.length||low?' alert':'')+(l.length?'':' empty')+'" data-bd="'+k+'" onclick="bndOpen('+(vid?'\''+jsId(vid)+'\'':'null')+',\''+k+'\')"><span class="bnd-ic" aria-hidden="true">'+BND_IC[k]+'</span><span class="bnd-n">'+l.length+'</span><span class="bnd-t">'+esc(bndLabel(k))+'</span><span class="bnd-s">'+s+'</span></button>';
}
function bndRowHTML(d){
  var low=bndLowConf(d),e=bndExp(d),n=bndDays(e),a=d.ai||{},sub=[fmtDate(bndDate(d))];
  if(a.amount)sub.push(bndMoney(a.amount));if(a.mileage)sub.push(Number(a.mileage).toLocaleString('en-US')+' mi');
  var th=typeof dtThumbHTML==='function'?dtThumbHTML(d):'<div class="bnd-th"></div>';
  var bits='<div class="bnd-rt">'+esc(d.name||'Document')+'</div><div class="bnd-rs">'+esc(sub.join(' / '))+'</div>'+(a.vendor?'<div class="bnd-rv">'+esc(a.vendor)+'</div>':'');
  if(e)bits+='<div class="'+(n!=null&&n<=BND_ALERT_DAYS?'bnd-red':'bnd-rs')+'">'+(n!=null&&n<0?'Expired ':'Expires ')+esc(fmtDate(e))+'</div>';
  if(low)bits+='<div class="bnd-red">AI not sure ('+Math.round((bndConf(d)||0)*100)+'%) - check the binder</div>';
  if(!BND.vid||!BND.bd)bits+='<div class="bnd-rv">'+esc(bndLabel(bndOf(d)))+' &middot; '+esc(vName(byId(getVehicles(),d.vehicleId)))+'</div>';
  return '<div class="bnd-row'+(low?' low':'')+'" data-doc="'+esc(d.id)+'"><span class="bnd-dot" aria-hidden="true"></span>'+th+'<div class="bnd-rb">'+bits+'<button type="button" class="bnd-move'+(low?' hot':'')+'" onclick="bndMoveOpen(\''+jsId(d.id)+'\')">&#8644; Move to another binder</button></div></div>';
}
function bndCollectionHTML(){
  var vs=visibleVehicles(),docs=bndDocs(null);
  var h='<div class="bnd-k">COLLECTION VAULT</div><div class="bnd-title">All vehicles</div><div class="bnd-sub">'+vs.length+' vehicle'+(vs.length===1?'':'s')+' &middot; '+docs.length+' document'+(docs.length===1?'':'s')+'</div>'+bndSearchHTML('Search every record')+'<div id="bnd-results">'+bndResultsHTML()+'</div>';
  h+=bndAlertHTML(bndAlerts(docs),true);
  h+='<div class="bnd-h">Across the garage</div><div class="bnd-grid">'+BND_LIST.filter(function(b){return b[0]!=='other'||docs.some(function(d){return bndOf(d)==='other';});}).map(function(b){return bndTileHTML(b[0],docs,null);}).join('')+'</div>';
  h+='<div class="bnd-h">Vehicles</div><div class="bnd-card">'+vs.map(function(v){var n=docs.filter(function(d){return d.vehicleId===v.id;}).length,al=bndAlerts(docs.filter(function(d){return d.vehicleId===v.id;})).length;
    return '<button type="button" class="bnd-vrow" onclick="bndOpen(\''+jsId(v.id)+'\',null)"><span>'+esc(vName(v)+(v.model&&!v.nickname?' '+v.model:''))+(al?' <span class="bnd-red">&#9888; '+al+'</span>':'')+'</span><b>'+n+' &rsaquo;</b></button>';}).join('')+'</div>';
  return h;
}
function bndVaultHTML(v){
  var docs=bndDocs(v.id),al=bndAlerts(docs);
  var h='<button type="button" class="bnd-back" onclick="bndOpen(null,null)">&lsaquo; All vehicles</button><div class="bnd-k">RECORDS VAULT</div><div class="bnd-title">'+esc(vName(v)+(v.model&&!v.nickname?' '+v.model:''))+'</div><div class="bnd-sub">'+(v.vin?'VIN '+esc(v.vin)+' &middot; ':'')+docs.length+' document'+(docs.length===1?'':'s')+'</div>';
  h+=bndSearchHTML('Search records, e.g. "brake pads"')+'<div id="bnd-results">'+bndResultsHTML()+'</div>'+bndAlertHTML(al,false);
  h+='<div class="bnd-grid">'+BND_LIST.filter(function(b){return b[0]!=='other'||docs.some(function(d){return bndOf(d)==='other';});}).map(function(b){return bndTileHTML(b[0],docs,v.id);}).join('')+'</div>';
  if(typeof openDocModal==='function'&&canEditVehicle(v))h+='<button type="button" class="bnd-cta" onclick="openDocModal(\''+jsId(v.id)+'\')">&#65291; Upload &mdash; AI will file it</button>';
  return h;
}
function bndBinderHTML(v,k){
  var l=bndDocs(v?v.id:null).filter(function(d){return bndOf(d)===k;});l=typeof docAiSort==='function'?docAiSort(l):l;
  var h='<button type="button" class="bnd-back" onclick="bndOpen('+(v?'\''+jsId(v.id)+'\'':'null')+',null)">&lsaquo; '+(v?'Vault':'All vehicles')+'</button><div class="bnd-title"><span aria-hidden="true">'+BND_IC[k]+'</span> '+esc(bndLabel(k))+'</div><div class="bnd-sub">'+l.length+' document'+(l.length===1?'':'s')+' &middot; '+esc(v?vName(v)+(v.model&&!v.nickname?' '+v.model:''):'All vehicles')+'</div>';
  if(k==='service'){var tot=0,mi=0;l.forEach(function(d){var a=d.ai||{};tot+=a.amount?+a.amount:0;if(a.mileage&&+a.mileage>mi)mi=+a.mileage;});
    if(v)(v.serviceLog||[]).forEach(function(s){if(s&&+s.mileage>mi)mi=+s.mileage;});
    h+='<div class="bnd-stats" id="bnd-totals"><div class="bnd-card"><div>Total spent</div><b>'+bndMoney(tot)+'</b></div><div class="bnd-card"><div>Last mileage</div><b>'+(mi?mi.toLocaleString('en-US')+' mi':'--')+'</b></div></div>';}
  h+=bndAlertHTML(bndAlerts(l),!v)+bndSearchHTML('Search '+bndLabel(k))+'<div id="bnd-results">'+bndResultsHTML()+'</div>';
  h+='<div class="bnd-h">Timeline</div>'+(l.length?'<div class="bnd-tl">'+l.map(bndRowHTML).join('')+'</div>':'<div class="bnd-card">No documents here yet. Upload one and the AI files it.</div>');
  return h;
}
function bndRender(){
  var el=document.getElementById('bnd-root');if(!el)return;
  var v=BND.vid?byId(getVehicles(),BND.vid):null;if(BND.vid&&!v){BND.vid=null;BND.bd=null;}
  el.innerHTML=BND.bd?bndBinderHTML(v,BND.bd):(v?bndVaultHTML(v):bndCollectionHTML());
  var legacy=document.getElementById('bnd-legacy');if(legacy)legacy.style.display=(v||BND.bd)?'none':'';
  if(typeof dtScan==='function')try{dtScan();}catch(e){}
  bndAutoReminders();
}
function bndOpen(vid,bd){BND.vid=vid||null;BND.bd=bd||null;BND.q='';if(document.getElementById('page-documents').classList.contains('active'))bndRender();else showPage('documents');var m=document.querySelector('.main');if(m)m.scrollTop=0;}
// ---------- move (one tap, remembered on the row) ----------
function bndMoveOpen(id){
  var d=byId(getDocs(),id);if(!d)return;var cur=bndOf(d);bndClose();
  var w=document.createElement('div');w.id='bnd-sheet';w.className='bnd-sheet';w.setAttribute('role','dialog');w.setAttribute('aria-label','Move to another binder');
  w.innerHTML='<div class="bnd-sheet-in"><div class="bnd-title">Move to another binder</div><div class="bnd-sub">'+esc(d.name||'Document')+'</div><div class="bnd-grid">'+BND_LIST.map(function(b){return '<button type="button" class="bnd-pick'+(b[0]===cur?' cur':'')+'" data-bd="'+b[0]+'" onclick="bndMove(\''+jsId(id)+'\',\''+b[0]+'\')"><span aria-hidden="true">'+BND_IC[b[0]]+'</span> '+esc(b[1])+(b[0]===cur?' &#10003;':'')+'</button>';}).join('')+'</div><button type="button" class="bnd-cta ghost" onclick="bndClose()">Cancel</button></div>';
  w.addEventListener('click',function(e){if(e.target===w)bndClose();});document.body.appendChild(w);
}
function bndClose(){['bnd-sheet','bnd-filed'].forEach(function(i){var e=document.getElementById(i);if(e&&e.parentNode)e.parentNode.removeChild(e);});}
async function bndMove(id,k){
  var d=byId(getDocs(),id);if(!d||!bndValid(k))return;bndClose();
  var mem=bndMem();mem[id]=k;try{localStorage.setItem('evo_bnd_moves',JSON.stringify(mem));}catch(e){}
  d.bd=k;bndRender();
  if(typeof docAiCanEdit==='function'&&docAiCanEdit(d)){
    try{var x=Object.assign({},d._x||{});x.bd=k;if(!x.type&&d.type)x.type=d.type;
      chk(await sb.from('documents').update({title:packX(d.name||'Document',x)}).eq('id',id));d._x=x;
      try{audit('document.updated','Document moved to '+bndLabel(k)+' binder: '+(d.name||'Document'),{clientId:d.clientId,vehicleId:d.vehicleId});}catch(e){}
    }catch(e){showToast('Moved on this device. '+friendlyError(e),'error');return;}
  }
  showToast('Moved to '+bndLabel(k),'success');
}
// ---------- auto reminders from AI-read expiry dates (existing reminders table) ----------
function bndRemTitle(d,k){return (bndLabel(k)+' expires').slice(0,60)+' - '+String(d.name||'Document').slice(0,50);}
async function bndAutoReminders(){
  var al=[];bndDocs(null).forEach(function(d){var e=bndExp(d),n=bndDays(e),k=bndOf(d);if(n!=null&&n>=0&&k!=='service')al.push({d:d,e:e,k:k});});
  for(var i=0;i<al.length;i++){var a=al[i],v=byId(getVehicles(),a.d.vehicleId),t=bndRemTitle(a.d,a.k),key=a.d.id+'|'+a.e;
    if(!v||BND.auto[key]||isArchivedVehicle(v)||!canManageReminders(v))continue;
    BND.auto[key]=1;
    if((v.reminders||[]).some(function(r){return r.title===t||(r.due===a.e&&/expire|renew/i.test(r.title||''));}))continue;
    try{var row={id:uid(),vehicle_id:v.id,kind:BND_REM_KIND[a.k]||'custom',title:t,notes:('From the '+bndLabel(a.k)+' binder. AI-read expiry '+a.e+'.').slice(0,1000),due_date:a.e,remind_days_before:30,created_by:myId()};
      chk(await sb.from('reminders').insert(row));
      (v.reminders=v.reminders||[]).push({id:row.id,title:t,due:a.e,repeat:'',doneAt:'',createdAt:new Date().toISOString(),by:myId()});
    }catch(e){}
  }
}
// ---------- the "Filed to X" moment after an upload is scanned ----------
function bndFiledHTML(d){
  var k=bndOf(d),a=d.ai||{},c=bndConf(d),e=bndExp(d),n=bndDays(e),rows=[];
  if(a.vendor)rows.push(['Issuer',a.vendor]);
  var pol=(String(a.summary||'')+' '+(d.name||'')).match(/(?:policy|pol\.?|no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i);if(pol)rows.push([k==='insurance'?'Policy no.':'Number',pol[1]]);
  if(a.docDate)rows.push(['Dated',fmtDate(a.docDate)]);if(a.amount)rows.push(['Amount',bndMoney(a.amount)]);if(a.mileage)rows.push(['Mileage',Number(a.mileage).toLocaleString('en-US')+' mi']);
  if(e)rows.push(['Expires',fmtDate(e),n!=null&&n<=BND_ALERT_DAYS]);
  var cnt=bndDocs(d.vehicleId).filter(function(o){return bndOf(o)===k;}).length,low=bndLowConf(d);
  return '<div class="bnd-sheet-in"><div class="bnd-k">AI SCAN COMPLETE</div><div class="bnd-title">Filed to '+esc(bndLabel(k))+' &#10003;</div><div class="bnd-sub">'+esc(d.name||'Document')+(c!=null?' &middot; '+Math.round(c*100)+'% confident':'')+'</div>'+
    '<div class="bnd-card bnd-big"><div class="bnd-bigic" aria-hidden="true">'+BND_IC[k]+'</div><div class="bnd-bigt">'+esc(bndLabel(k).toUpperCase())+'</div><div>Binder now holds '+cnt+' document'+(cnt===1?'':'s')+'</div></div>'+
    (low?'<div class="bnd-card bnd-alert"><span class="bnd-red">The AI is not sure about this one. Check the binder.</span></div>':'')+
    (rows.length?'<div class="bnd-h">Key facts the AI read</div><div class="bnd-card" id="bnd-facts">'+rows.map(function(r){return '<div class="bnd-kv"><span>'+esc(r[0])+'</span><b class="'+(r[2]?'bnd-red':'')+'">'+esc(r[1])+'</b></div>';}).join('')+'</div>':'')+
    (e&&n!=null&&n>=0?'<div class="bnd-card"><b class="bnd-gold">&#9200; Reminder set</b><div>We will alert you 30 days before it expires.</div></div>':'')+
    '<button type="button" class="bnd-cta" onclick="bndClose()">Done</button><button type="button" class="bnd-cta ghost" onclick="bndMoveOpen(\''+jsId(d.id)+'\')">Wrong binder? Move it</button></div>';
}
function bndShowFiled(id){var d=byId(getDocs(),id);if(!d)return;bndClose();var w=document.createElement('div');w.id='bnd-filed';w.className='bnd-sheet full';w.setAttribute('role','dialog');w.setAttribute('aria-label','Filed');w.innerHTML=bndFiledHTML(d);document.body.appendChild(w);bndAutoReminders();}
if(typeof docAiSave==='function'){var _bndDocAiSave=docAiSave;docAiSave=async function(){var id=DOCAI.edit&&DOCAI.edit.id;await _bndDocAiSave.apply(this,arguments);if(id&&!DOCAI.edit)bndShowFiled(id);};}
function renderDocuments(){
  var root=document.getElementById('bnd-root');
  if(!root){var pg=document.getElementById('page-documents');if(pg){root=document.createElement('div');root.id='bnd-root';root.className='bnd';var al=document.getElementById('doc-alerts');pg.insertBefore(root,al);
    var lg=document.createElement('div');lg.id='bnd-legacy';lg.innerHTML='<div class="bnd-h">All files</div>';al.parentNode.insertBefore(lg,al);lg.appendChild(al);lg.appendChild(document.getElementById('documents-list'));}}
  renderDocumentsList();bndRender();
}
