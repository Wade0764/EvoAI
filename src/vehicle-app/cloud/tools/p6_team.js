// ===== remove client (admin / tech who created it), owner My team, ended-access notices (needs migration_005b) =====
var SHEET_EL=null;
function sheetClose(){
  var o=SHEET_EL;if(!o)return;SHEET_EL=null;o.classList.remove('on');
  setTimeout(function(){if(o.parentNode)o.parentNode.removeChild(o);},220);
}
function sheetOpen(o){
  sheetClose();
  var ov=document.createElement('div');ov.className='sheet-ov';ov.id='evo-sheet';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
  var h='<div class="sheet"><h3>'+esc(o.title)+'</h3>'+(o.sub?'<div class="sheet-sub">'+esc(o.sub)+'</div>':'')+(o.html||'')+'<div class="sheet-btns" id="evo-sheet-btns"></div></div>';
  ov.innerHTML=h;
  ov.addEventListener('click',function(e){if(e.target===ov)sheetClose();});
  document.body.appendChild(ov);SHEET_EL=ov;
  sheetButtons(o.buttons||[]);
  setTimeout(function(){ov.classList.add('on');},10);
}
function sheetButtons(list){
  var b=document.getElementById('evo-sheet-btns');if(!b)return;b.innerHTML='';
  list.forEach(function(x){
    var el=document.createElement('button');el.type='button';el.className='btn '+(x.cls||'btn-ghost');el.textContent=x.label;if(x.id)el.id=x.id;if(x.disabled)el.disabled=true;
    el.addEventListener('click',function(){if(!el.disabled)x.fn();});b.appendChild(el);
  });
}
function sheetBody(html){var s=SHEET_EL&&SHEET_EL.querySelector('.sheet-sub');var d=SHEET_EL&&SHEET_EL.querySelector('#sheet-dyn');if(d)d.innerHTML=html;}
var UNDO_TIMER=null;
function showUndo(msg,fn,ms){
  hideUndo();
  var b=document.createElement('div');b.id='undo-bar';b.setAttribute('role','status');
  b.innerHTML='<span>'+esc(msg)+'</span><button type="button" class="btn btn-sm btn-gold" id="undo-btn">Undo</button>';
  document.body.appendChild(b);
  document.getElementById('undo-btn').addEventListener('click',function(){hideUndo();fn();});
  UNDO_TIMER=setTimeout(hideUndo,ms||10000);
}
function hideUndo(){if(UNDO_TIMER){clearTimeout(UNDO_TIMER);UNDO_TIMER=null;}var b=document.getElementById('undo-bar');if(b&&b.parentNode)b.parentNode.removeChild(b);}
function pluralN(n,w,pl){return n+' '+(n===1?w:(pl||w+'s'));}
var TRASH_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>';
// who may remove (the database re-checks every time)
function clientRemovable(c){return !!(c&&c.managed&&!c.claimed&&(realAdmin()||(isRealTech()&&c.managedBy===myId())));}
function rpcRow(r){if(r.error)throw r.error;return Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;}
// ---- swipe-left rows ----
var SWIPE_W=96;
function swipeCloseAll(except){var l=document.querySelectorAll('.swipe-fg.open'),i;for(i=0;i<l.length;i++)if(l[i]!==except){l[i].classList.remove('open');l[i].style.transform='';}}
function decorateClientRows(root){
  var rows=root.querySelectorAll('.client-row[onclick^="openClientDetail"]'),i;
  for(i=0;i<rows.length;i++){
    (function(row){
      var m=/openClientDetail\('([A-Za-z0-9_-]+)'\)/.exec(row.getAttribute('onclick')||'');if(!m)return;
      var id=m[1],c=byId(C.clients,id);
      if(!c||!(realAdmin()||clientRemovable(c)))return;
      var wrap=document.createElement('div');wrap.className='swipe-wrap';wrap.setAttribute('data-client',id);
      var act=document.createElement('button');act.type='button';act.className='swipe-act';act.setAttribute('aria-label','Remove '+c.name);act.innerHTML=TRASH_SVG+'<span>Remove</span>';
      act.addEventListener('click',function(e){e.stopPropagation();swipeCloseAll();openRemoveClient(id);});
      row.parentNode.insertBefore(wrap,row);wrap.appendChild(act);
      var fg=document.createElement('div');fg.className='swipe-fg';wrap.appendChild(fg);fg.appendChild(row);
      var tb=document.createElement('button');tb.type='button';tb.className='swipe-trash';tb.title='Remove client';tb.setAttribute('aria-label','Remove '+c.name);tb.innerHTML=TRASH_SVG;
      tb.addEventListener('click',function(e){e.stopPropagation();openRemoveClient(id);});row.appendChild(tb);
      var x0=0,y0=0,dx=0,mode='',base=0;
      fg.addEventListener('touchstart',function(e){var t=e.touches[0];x0=t.clientX;y0=t.clientY;dx=0;mode='';base=fg.classList.contains('open')?-SWIPE_W:0;swipeCloseAll(fg);},{passive:true});
      fg.addEventListener('touchmove',function(e){
        var t=e.touches[0],ddx=t.clientX-x0,ddy=t.clientY-y0;
        if(!mode){if(Math.abs(ddx)>8&&Math.abs(ddx)>Math.abs(ddy)*1.4)mode='h';else if(Math.abs(ddy)>8)mode='v';}
        if(mode!=='h')return;
        dx=ddx;fg.classList.add('drag');fg.style.transform='translateX('+Math.max(-SWIPE_W-24,Math.min(0,base+dx))+'px)';
      },{passive:true});
      fg.addEventListener('touchend',function(){
        fg.classList.remove('drag');if(mode!=='h')return;
        var pos=base+dx;
        if(pos<-SWIPE_W/2){fg.classList.add('open');fg.style.transform='translateX(-'+SWIPE_W+'px)';}else{fg.classList.remove('open');fg.style.transform='';}
        fg._swiped=Date.now();
      });
      row.addEventListener('click',function(e){
        if(fg._swiped&&Date.now()-fg._swiped<350){e.stopImmediatePropagation();e.preventDefault();return;}
        if(fg.classList.contains('open')){e.stopImmediatePropagation();e.preventDefault();swipeCloseAll();}
      },true);
    })(rows[i]);
  }
}
// ---- remove client: confirmation sheet ----
function removalLines(s,mine){
  var l=[];
  if(s.vehicles>0)l.push('<li>'+pluralN(s.vehicles,'vehicle')+' will be archived and hidden from every list. Nothing is erased.</li>');
  else l.push('<li>This client has no vehicles yet.</li>');
  var kept=[];
  if(s.records)kept.push(pluralN(s.records,'service record'));if(s.documents)kept.push(pluralN(s.documents,'document'));
  if(s.photos)kept.push(pluralN(s.photos,'photo'));if(s.expenses)kept.push(pluralN(s.expenses,'expense'));if(s.reminders)kept.push(pluralN(s.reminders,'reminder'));
  if(kept.length)l.push('<li>Kept, but hidden with the vehicles: '+esc(kept.join(', '))+'.</li>');
  if(s.open_invites>0)l.push('<li>'+pluralN(s.open_invites,'open invite code')+' will stop working. The client cannot sign up and pick up this data until you restore them.</li>');
  l.push('<li>You can undo for 10 seconds right after, or later under Removed clients on the Clients page.</li>');
  l.push(mine?'<li>Only an admin can erase a client permanently.</li>':'<li>To erase permanently you will find the option under Removed clients. You must type the client name.</li>');
  return '<ul>'+l.join('')+'</ul>';
}
async function openRemoveClient(id){
  var c=byId(C.clients,id);if(!c)return;
  sheetOpen({title:'Remove '+c.name+'?',sub:'Checking what is stored...',html:'<div id="sheet-dyn"></div>',buttons:[{label:'Cancel',fn:sheetClose}]});
  var s;
  try{s=rpcRow(await sb.rpc('client_removal_summary',{p_id:id}));}
  catch(e){
    sheetBody('<ul><li class="warn">'+esc(rpcMissing(e)?'Removing clients is not switched on yet (a database update is pending).':friendlyError(e))+'</li></ul>');
    if(SHEET_EL)SHEET_EL.querySelector('.sheet-sub').textContent='';return;
  }
  if(!SHEET_EL)return;
  var sub=SHEET_EL.querySelector('.sheet-sub');
  if(!s.removable){
    sub.textContent='';
    sheetBody('<ul><li class="warn">'+esc(s.reason==='has_own_account'?(c.name+' has their own EvoAI account. Their cars and records belong to them, so they cannot be removed here.'):'You can only remove clients that you created yourself.')+'</li>'+(s.reason==='has_own_account'?'<li>To end a tech\'s access instead, open the client and use Remove access.</li>':'')+'</ul>');
    sheetButtons([{label:'Close',fn:sheetClose}]);return;
  }
  sub.textContent='This archives the client. It does not erase anything yet.';
  sheetBody(removalLines(s,!realAdmin()));
  sheetButtons([{label:'Cancel',fn:sheetClose},{label:'Remove client',cls:'btn-solid-danger',id:'rm-confirm',fn:function(){doRemoveClient(id,c.name);}}]);
}
async function doRemoveClient(id,name){
  var b=document.getElementById('rm-confirm');if(b){b.disabled=true;b.textContent='Removing...';}
  try{
    rpcRow(await sb.rpc('archive_client',{p_id:id}));
    sheetClose();
    if(currentClientId===id){currentClientId=null;}
    await loadAll();
    if(document.getElementById('page-client-detail')&&document.getElementById('page-client-detail').classList.contains('active'))showPage('clients');else refreshCurrent();
    showUndo(name+' was removed.',function(){undoRemoveClient(id,name);},10000);
  }catch(e){sheetClose();showToast(friendlyError(e),'error');}
}
async function undoRemoveClient(id,name){
  try{rpcRow(await sb.rpc('restore_client',{p_id:id}));await loadAll();refreshCurrent();showToast((name||'Client')+' is back','success');}
  catch(e){showToast(friendlyError(e),'error');}
}
// ---- removed clients: restore, admin permanent delete ----
function removedClientsHTML(){
  var rm=C.removed||[];if(!rm.length)return '';
  var h='<div class="removed-sec"><div class="sh"><h2>Removed clients</h2></div><div class="doc-meta" style="margin-bottom:6px;">Hidden from your lists. Restore any time'+(realAdmin()?', or erase permanently.':'.')+'</div>';
  rm.forEach(function(p){
    h+='<div class="access-row"><div><div style="font-size:16px;font-weight:300;">'+esc(displayName(p))+'</div><div class="doc-meta">Removed '+esc(fmtDate(String(p.archived_at).slice(0,10)))+'</div></div><div class="flex gap-2"><button class="btn btn-sm" onclick="undoRemoveClient(\''+jsId(p.id)+'\',\''+jsId(displayName(p)).slice(0,0)+'\')">Restore</button>'+(realAdmin()?'<button class="btn btn-sm btn-danger" onclick="openPurgeClient(\''+jsId(p.id)+'\')">Delete permanently</button>':'')+'</div></div>';
  });
  return h+'</div>';
}
async function openPurgeClient(id){
  var p=C.profiles[id];if(!p||!realAdmin())return;var name=displayName(p);
  sheetOpen({title:'Erase '+name+' permanently?',sub:'Checking what is stored...',html:'<div id="sheet-dyn"></div>',buttons:[{label:'Cancel',fn:sheetClose}]});
  var s;try{s=rpcRow(await sb.rpc('client_removal_summary',{p_id:id}));}catch(e){sheetBody('<ul><li class="warn">'+esc(friendlyError(e))+'</li></ul>');return;}
  if(!SHEET_EL)return;
  SHEET_EL.querySelector('.sheet-sub').textContent='';
  var l=['<li class="warn">This cannot be undone. There is no backup to restore from in the app.</li>',
    '<li class="warn">Permanently erased: '+esc([pluralN(s.vehicles,'vehicle'),pluralN(s.records,'service record'),pluralN(s.documents,'document'),pluralN(s.photos,'photo'),pluralN(s.expenses,'expense'),pluralN(s.reminders,'reminder')].join(', '))+', and every photo and document file.</li>',
    '<li>The client record and tech access are deleted too.</li></ul><div class="doc-meta" style="margin-top:10px;">Type the client name exactly to confirm:</div><input type="text" id="purge-name" autocomplete="off" autocapitalize="none" placeholder="'+esc(name)+'" aria-label="Type the client name">'];
  sheetBody('<ul>'+l.join(''));
  var inp=document.getElementById('purge-name');
  sheetButtons([{label:'Cancel',fn:sheetClose},{label:'Erase permanently',cls:'btn-solid-danger',id:'purge-confirm',disabled:true,fn:function(){doPurgeClient(id,name);}}]);
  inp.addEventListener('input',function(){var b=document.getElementById('purge-confirm');if(b)b.disabled=(inp.value.trim()!==String(name).trim()||!inp.value.trim());});
}
async function doPurgeClient(id,name){
  var typed=val('purge-name'),b=document.getElementById('purge-confirm');if(b){b.disabled=true;b.textContent='Erasing...';}
  try{
    var pr=await sb.rpc('client_storage_paths',{p_id:id});if(pr.error)throw pr.error;
    var by={},i,rows=pr.data||[];
    for(i=0;i<rows.length;i++){(by[rows[i].bucket]=by[rows[i].bucket]||[]).push(rows[i].path);}
    for(var bk in by){if(!by.hasOwnProperty(bk))continue;
      for(i=0;i<by[bk].length;i+=50){var rr=await sb.storage.from(bk).remove(by[bk].slice(i,i+50));if(rr&&rr.error)throw rr.error;}}
    rpcRow(await sb.rpc('purge_client',{p_id:id,p_confirm_name:typed}));
    sheetClose();await loadAll();refreshCurrent();showToast(name+' was erased permanently','success');
  }catch(e){sheetClose();showToast(/name_mismatch/.test(String(e&&e.message))?'The name did not match. Nothing was erased.':friendlyError(e),'error');}
}
function deleteClientBtnHTML(c){
  if(!clientRemovable(c))return '';
  return '<div style="margin-top:12px;"><button class="btn btn-sm btn-danger" id="cd-delete-btn" onclick="openRemoveClient(\''+jsId(c.id)+'\')">Delete client</button><div class="doc-meta" style="margin-top:6px;">You created this client, so you can delete it. You will see exactly what is affected first.</div></div>';
}
// ---- tech: access ended notices ----
var ENDED_AT=0;
function endedDismissed(){try{return JSON.parse(localStorage.getItem('evoai_ended_dismissed')||'[]');}catch(e){return [];}}
function endedKey(n){return String(n.owner_name)+'|'+String(n.revoked_at);}
function dismissEnded(k){var d=endedDismissed();d.push(k);try{localStorage.setItem('evoai_ended_dismissed',JSON.stringify(d.slice(-50)));}catch(e){}renderEndedNotices();}
function renderEndedNotices(){
  var el=document.getElementById('ended-notices');if(!el)return;
  var d=endedDismissed(),list=(C.ended||[]).filter(function(n){return d.indexOf(endedKey(n))<0;});
  el.innerHTML=list.map(function(n){var k=endedKey(n);
    return '<div class="ended-note"><div><strong>Access ended.</strong> '+esc(n.ended_by==='owner'?(n.owner_name+' ended your access'):'Your access to '+n.owner_name+' was ended')+' on '+esc(fmtDate(String(n.revoked_at).slice(0,10)))+'. Their cars and records are no longer visible to you. Anything you entered stays with the car.</div><button class="btn btn-sm btn-ghost" onclick="dismissEnded(\''+jsId(k.replace(/[^A-Za-z0-9_-]/g,'_'))+'\')" data-k="'+esc(k)+'">OK</button></div>';
  }).join('');
  var bs=el.querySelectorAll('button[data-k]'),i;
  for(i=0;i<bs.length;i++)(function(b){b.onclick=function(){dismissEnded(b.getAttribute('data-k'));};})(bs[i]);
}
async function loadEnded(){
  if(!sb||!session||!isRealTech())return;
  if(Date.now()-ENDED_AT<30000&&C.ended){renderEndedNotices();return;}
  ENDED_AT=Date.now();
  try{var r=await sb.rpc('list_ended_access');if(r.error)throw r.error;C.ended=r.data||[];}catch(e){C.ended=C.ended||[];}
  renderEndedNotices();
}
// ---- owner: My team ----
function teamGroups(oid){
  var rows=C.access.filter(function(a){return a.owner_id===oid&&a.status==='active';}),g={},order=[];
  rows.forEach(function(a){if(!g[a.tech_id]){g[a.tech_id]={techId:a.tech_id,grants:[]};order.push(a.tech_id);}g[a.tech_id].grants.push(a);});
  return order.map(function(k){return g[k];});
}
function renderAccess(){
  var oid=ownerClientId()||myId();
  var groups=teamGroups(oid);
  var myVeh=C.vehicles.filter(function(v){return v.clientId===oid&&!v.archived;});
  var h='';
  h+='<div class="sh first"><h2>Your team</h2></div>';
  if(!groups.length)h+=emptyCard('Nobody has access to your collection yet. Invite your tech or advisor below. You choose exactly what they can see.');
  groups.forEach(function(g){
    var tp=C.profiles[g.techId],tn=displayName(tp),tid=jsId(g.techId);
    var scopes=g.grants.map(function(a){var v=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null;return a.vehicle_id?('Only '+(v?vFull(v):'one vehicle')):'All your vehicles';});
    h+='<div class="team-card" data-team="'+tid+'"><div class="team-head"><div><div style="font-size:18px;font-weight:300;">'+esc(tn)+'</div><div class="doc-meta">'+esc((tp&&tp.email)||'')+(tp&&tp.business_name?' / '+esc(tp.business_name):'')+'</div><div class="doc-meta">'+esc(scopes.join(', '))+'</div><span class="team-pill">Tech / advisor</span></div><button class="btn btn-danger btn-sm" onclick="openRemoveMember(\''+tid+'\')">Remove access</button></div>';
    g.grants.forEach(function(a){
    var veh=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null,aid=jsId(a.id);
    var scope=PM_SCOPE[a.id]||'';
    if(scope&&a.vehicle_id&&scope!==a.vehicle_id)scope='';
    var pr=permRowFor(a.id,scope),eff=pr.eff||{};
    var covered=a.vehicle_id?(veh?[veh]:[]):myVeh;
    h+='<details class="more" id="pm-'+aid+'"><summary>Permissions'+(g.grants.length>1?' - '+esc(a.vehicle_id?(veh?vFull(veh):'one vehicle'):'all vehicles'):'')+'</summary><div style="padding-top:10px;">';
    if(covered.length>1||(covered.length===1&&!a.vehicle_id)){
      h+='<div class="input-group"><label>Settings apply to</label><select onchange="pmScopeChange(\''+aid+'\',this)"><option value="">All vehicles (default)</option>'+covered.map(function(v){return '<option value="'+esc(v.id)+'"'+(scope===v.id?' selected':'')+'>'+esc(vName(v))+' only'+(permRowFor(a.id,v.id).ov?' (custom)':'')+'</option>';}).join('')+'</select></div>';
    }
    if(scope&&pr.ov)h+='<div class="doc-meta" style="margin-bottom:8px;">This vehicle has its own settings. <span class="link" onclick="resetPermOverride(\''+aid+'\',\''+jsId(scope)+'\')">Reset to default</span></div>';
    PERM_LABELS.forEach(function(gr){
      h+='<div class="lab" style="margin:14px 0 6px;">'+esc(gr[1])+'</div>';
      gr[2].forEach(function(p){
        h+='<label class="tgl"><input type="checkbox" id="pm-'+aid+'-'+p[0]+'"'+(eff[p[0]]?' checked':'')+' onchange="togglePerm(\''+aid+'\',\''+p[0]+'\',this.checked,\''+jsId(scope)+'\')"><span class="tgl-ui"></span><span class="tgl-t">'+esc(p[1])+'</span></label>';
      });
    });
    h+='<div class="doc-meta" style="margin-top:12px;">Insurance and title documents that you upload are always private to you. Changes apply immediately.</div></div></details>';
    });
    h+='</div>';
  });
  var open=C.invites.filter(function(i){return (i.kind==='tech_owner'||i.kind==='tech_vehicle')&&inviteActive(i)&&i.created_by===myId();});
  h+='<div class="sh"><h2>Invite a tech or advisor</h2></div><div style="max-width:420px;">';
  h+='<div class="input-group"><label>Their email</label><input type="email" id="inv-email" maxlength="120" placeholder="tech@email.com" autocapitalize="none" inputmode="email"></div>';
  h+='<div class="input-group"><label>Access to</label><select id="inv-scope"><option value="">All my vehicles</option>'+myVeh.map(function(v){return '<option value="'+esc(v.id)+'">'+esc(vFull(v))+' only</option>';}).join('')+'</select></div>';
  h+='<button class="btn btn-gold btn-sm" onclick="createInviteFromAccess()">Create invite link and code</button><div class="doc-meta" style="margin-top:8px;">The code only works for this email address. You share it yourself by message, email or copy. After they join you can fine-tune their permissions here.</div></div>';
  if(open.length){
    h+='<div class="sh"><h2>Waiting to join</h2></div>'+open.map(function(i){
      var v=i.vehicle_id?byId(C.vehicles,i.vehicle_id):null;
      return '<div class="access-row"><div><div class="doc-meta">'+esc(i.email||'Any email')+' / '+esc(v?vFull(v):'All vehicles')+' / expires '+esc(fmtDate(String(i.expires_at).slice(0,10)))+'</div>'+inviteRowExtras(i.id,i.email)+'</div><button class="btn btn-sm" onclick="revokeInviteById(\''+jsId(i.id)+'\')">Cancel invite</button></div>';
    }).join('');
  }
  elHTML('access-body',h);
  revealMissingCodes(open.map(function(i){return i.id;}));
}
function openRemoveMember(techId){
  var oid=ownerClientId()||myId(),g=teamGroups(oid).filter(function(x){return x.techId===techId;})[0];
  if(!g)return;
  var tp=C.profiles[techId],tn=displayName(tp);
  var all=g.grants.some(function(a){return !a.vehicle_id;});
  var cars=C.vehicles.filter(function(v){return v.clientId===oid&&!v.archived;});
  var scopeTxt=all?pluralN(cars.length,'vehicle'):g.grants.map(function(a){var v=byId(C.vehicles,a.vehicle_id);return v?vFull(v):'a vehicle';}).join(', ');
  var html='<ul><li>'+esc(tn)+' loses access right away to '+esc(all?('all of your vehicles ('+scopeTxt+')'):scopeTxt)+': service history, documents, photos, reminders and anything else you had shared.</li>'+
    '<li>Nothing is deleted. All records stay with your cars, including anything '+esc(tn)+' added.</li>'+
    '<li>'+esc(tn)+' will see "Access ended" in their app.</li>'+
    '<li>Any unused invite sent to '+esc((tp&&tp.email)||'their email')+' is cancelled. You can invite them again any time.</li></ul>';
  sheetOpen({title:'Remove '+tn+' from your team?',html:html,buttons:[{label:'Cancel',fn:sheetClose},{label:'Remove access',cls:'btn-solid-danger',id:'rm-member',fn:function(){doRemoveMember(techId,tn);}}]});
}
async function doRemoveMember(techId,name){
  var b=document.getElementById('rm-member');if(b){b.disabled=true;b.textContent='Removing...';}
  try{
    rpcRow(await sb.rpc('remove_team_member',{p_tech_id:techId}));
    sheetClose();await loadAll();renderAccess();showToast(name+' no longer has access','success');
  }catch(e){sheetClose();showToast(/no_active_access/.test(String(e&&e.message))?'That access had already ended.':friendlyError(e),'error');await loadAll();renderAccess();}
}
