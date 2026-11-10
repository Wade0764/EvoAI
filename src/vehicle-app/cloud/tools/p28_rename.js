// ============ v28 RENAME COLLECTION (profiles.collection_name via set_collection_name RPC, migration_020) ============
function collCustom(c){var id=c&&c.id,p=id&&C.profiles&&C.profiles[id];var n=(p&&p.collection_name)||(c&&c.collectionName)||'';return String(n).trim();}
function collName(c){return collCustom(c)||(c&&c.name)||'';}
function collTitle(c){var cu=collCustom(c);if(cu)return cu;var t=ctitleName(c&&c.name);return /\b(collection|collective|garage|stable)\b/i.test(t)?t:'The '+t.replace(/^the\s+/i,'')+' Collection';}
function ctitleHTML(n,exact){
  var t=exact?String(n||'').trim():ctitleName(n),coll=/\b(collection|collective|garage|stable)\b/i.test(t);
  if(!exact&&!coll)t='The '+t.replace(/^the\s+/i,'')+' Collection';
  return '<div class="ctitle-eyebrow">'+(coll||exact?'The Private Collection':'Private Collection')+'</div><h2 class="ctitle-name">'+esc(t)+'</h2><div class="ctitle-rule" aria-hidden="true"><b></b><i></i></div>';
}
function ctitleSet(id,n,exact){
  var el=document.getElementById(id);if(!el)return;
  var box=el.closest?el.closest('.ctitle'):null;
  if(!box){box=document.createElement('div');box.className='ctitle';el.parentNode.insertBefore(box,el);box.appendChild(el);if(box.parentNode.classList)box.parentNode.classList.add('has-ct');}
  el.className='ctitle-inner';el.innerHTML=ctitleHTML(n,exact);
  el.setAttribute('data-name',String(n||''));
}
// which collection the Account line renames, or null when not allowed
function rnTarget(){
  if(!session)return null;
  var c=ownerClient();                                   // owner (or co-owner), or admin viewing as an owner
  if(c)return c;
  if(currentClientId){var d=byId(getClients(),currentClientId);
    if(d&&(realAdmin()||managedMine(d.id)))return d;}   // admin anywhere; tech only on a client they manage (edit rights)
  if(realAdmin()&&!viewAsActive()){var me0=C.profiles&&C.profiles[myId()];if(me0)return {id:myId(),name:me0.display_name||session.account.name||'',own:true};}
  return null;
}
function rnLineRender(){
  var m=document.querySelector('#modal-account .modal');if(!m)return;
  var row=document.getElementById('rn-line');
  if(!row){row=document.createElement('button');row.type='button';row.id='rn-line';row.className='rn-line';row.onclick=openRenameSheet;
    var hd=m.querySelector('.modal-header');var blk=hd&&hd.nextElementSibling;(blk&&blk.parentNode?blk.parentNode.insertBefore(row,blk.nextSibling):m.appendChild(row));}
  var t=rnTarget();
  if(!t){row.style.display='none';return;}
  row.style.display='';
  row.innerHTML='<span class="rn-l"><span class="rn-k">Rename collection</span><span class="rn-v">'+esc(collTitle(t))+'</span></span><span class="rn-chev" aria-hidden="true">&#8250;</span>';
}
var _rnAcct=openAccountModal;
openAccountModal=function(){_rnAcct.apply(this,arguments);rnLineRender();};
function rnClean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function openRenameSheet(){
  var t=rnTarget();if(!t)return;
  var cur=collTitle(t);
  sheetOpen({title:'Rename collection',html:'<div class="rn-cur">'+esc(cur)+'</div>'
    +'<div class="input-group" style="margin-top:14px;"><label for="rn-input">New name</label><input type="text" id="rn-input" maxlength="60" value="'+esc(cur)+'" autocomplete="off" oninput="rnCount()"></div>'
    +'<div class="rn-meta"><span id="rn-err" role="status"></span><span id="rn-count"></span></div>',
    buttons:[{label:'Cancel',fn:sheetClose},{label:'Save',cls:'btn-primary',id:'rn-save',fn:function(){saveCollectionName(t.id);}}]});
  rnCount();setTimeout(function(){var i=document.getElementById('rn-input');if(i){i.focus();i.select();}},50);
}
function rnCount(){var v=val('rn-input');elText('rn-count',v.length+'/60');elText('rn-err','');}
async function saveCollectionName(ownerId){
  var n=rnClean(val('rn-input'));
  if(!n){elText('rn-err','Enter a name.');return;}
  if(n.length>60){elText('rn-err','Keep it to 60 characters.');return;}
  var b=document.getElementById('rn-save');if(b){b.disabled=true;b.textContent='Saving...';}
  try{
    var r=await sb.rpc('set_collection_name',{p_owner:ownerId,p_name:n});
    if(r.error)throw r.error;
    var saved=(typeof r.data==='string'&&r.data)||n;
    if(C.profiles[ownerId])C.profiles[ownerId].collection_name=saved;
    var c=byId(getClients(),ownerId);if(c)c.collectionName=saved;
    sheetClose();rnLineRender();try{viewAsRefreshUI();}catch(e){}
    refreshCurrent();showToast('Collection renamed','success');
  }catch(e){
    if(b){b.disabled=false;b.textContent='Save';}
    var m=String((e&&e.message)||e||'');
    elText('rn-err',rpcMissing(e)?NEEDS_BACKEND+'.':(/not_allowed|42501/.test(m+(e&&e.code))?'You cannot rename this collection.':(/invalid_name/.test(m)?'Use 1 to 60 characters.':friendlyError(e))));
  }
}
(function(){try{var st=document.createElement('style');
  st.textContent='.rn-line{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;background:transparent;border:0;border-bottom:1px solid var(--line);padding:16px 0;margin:0 0 6px;text-align:left;cursor:pointer;color:#fff;min-height:44px}'
   +'.rn-l{display:flex;flex-direction:column;gap:4px;min-width:0}.rn-k{font-size:19px;color:#fff;font-weight:400}.rn-v{font-size:17px;color:var(--gold,#c9a85c);overflow-wrap:anywhere}.rn-chev{font-size:28px;color:var(--gold,#c9a85c)}'
   +'.rn-cur{font-size:22px;color:var(--gold,#c9a85c);font-weight:300;overflow-wrap:anywhere}#rn-input{font-size:20px;color:#fff}.rn-meta{display:flex;justify-content:space-between;font-size:15px;color:#fff}#rn-err{color:var(--gold,#c9a85c)}label[for=rn-input]{color:#fff;font-size:15px}';
  document.head.appendChild(st);}catch(e){}})();
