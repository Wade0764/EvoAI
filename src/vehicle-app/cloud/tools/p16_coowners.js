// ===== v17: co-owners (migration_010). A collection = the owner profile vehicles.owner_id points to; co-owners are members with equal rights. =====
var CO={on:null,rows:[],of:null,list:null,lastCode:'',busy:false};
async function cmLoad(){
  try{var r=await sb.from('collection_members').select('*');
    if(r&&r.error){CO.on=false;return [];}
    CO.on=true;return (r&&r.data)||[];}catch(e){CO.on=false;return [];}
}
function coOfRows(rows,me0){for(var i=0;i<(rows||[]).length;i++)if(rows[i]&&rows[i].user_id===me0)return rows[i].collection_owner_id;return null;}
function coIsMember(){return !!CO.of;}
function coMembers(){var o=ownerClientId()||myId();return (CO.rows||[]).filter(function(m){return m.collection_owner_id===o;});}
async function coInvite(){
  if(CO.busy)return;if(CO.on===false){showToast('Co-owners need one backend update first.','error');return;}
  CO.busy=true;
  try{
    var r=await sb.rpc('create_co_owner_invite',{p_email:null});
    if(r.error){if(rpcMissing(r.error)){CO.on=false;CO.busy=false;showToast('Co-owners need one backend update first.','error');coRender();return;}throw r.error;}
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.code)throw new Error('no code returned');
    CO.lastCode=codeKey(row.code);saveInviteCode(row.invite_id,row.code);
    CO.busy=false;coRender();
    var el=document.getElementById('co-code');if(el)el.scrollIntoView({block:'center'});
  }catch(e){CO.busy=false;showToast(friendlyError(e),'error');}
}
function coShareText(code){return 'You are invited to co-own a collection on EvoAI. Open '+APP_LINK+'?invite='+codeKey(code)+' , create your own account (a new login), then enter this code: '+groupCode(codeKey(code));}
function coCopy(){if(CO.lastCode)copyText(APP_LINK+'?invite='+CO.lastCode,'Link copied');}
function coCopyCode(){if(CO.lastCode)copyText(groupCode(CO.lastCode),'Code copied');}
function coShare(){if(!CO.lastCode)return;var t=coShareText(CO.lastCode);if(navigator.share)navigator.share({title:'Co-own a collection on EvoAI',text:t}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(t,'Invite message copied');});else copyText(t,'Invite message copied');}
async function coRemove(uid,leave){
  if(!window.confirm(leave?'Leave this collection? You will lose access to its vehicles straight away.':'Remove this co-owner? They lose access to the collection straight away.'))return;
  try{
    var r=await sb.rpc('remove_co_owner',{p_user_id:uid});if(r.error)throw r.error;
    showToast(leave?'You left the collection.':'Co-owner removed.','success');
    await reloadAll(true);if(leave){try{setAccountFromProfile(session.user||{id:myId()});}catch(e){}}refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function coSectionHTML(){
  if(!session||!isOwner())return '';
  var me0=myId(),o=ownerClientId()||me0,primary=o===me0,mem=coMembers(),h='<section class="co-sec" id="co-sec"><div class="sh"><h2>Co-owners</h2></div>';
  h+='<p class="co-desc">Co-owners have their own login and the same owner rights over every vehicle in this collection: photos, documents, values, reminders, team and transfers.</p>';
  if(CO.on===false)return h+'<p class="co-desc co-muted">Co-owners need one backend update before they can be added.</p></section>';
  var po=C.profiles&&C.profiles[o];
  h+='<div class="co-row"><div><div class="co-n">'+esc(primary?'You':(displayName(po)||'Collection owner'))+'</div><div class="co-m">Original owner'+(po&&po.email&&!primary?' / '+esc(po.email):'')+'</div></div></div>';
  mem.forEach(function(m){var p=C.profiles&&C.profiles[m.user_id],mine=m.user_id===me0;
    h+='<div class="co-row" data-co="'+esc(m.user_id)+'"><div><div class="co-n">'+esc(mine?'You':(displayName(p)||'Co-owner'))+'</div><div class="co-m">Co-owner'+(p&&p.email&&!mine?' / '+esc(p.email):'')+' since '+esc(fmtDate(String(m.created_at||'').slice(0,10)))+'</div></div>'+
      (mine?'<button class="btn btn-sm btn-ghost" type="button" onclick="coRemove(\''+jsId(m.user_id)+'\',true)">Leave collection</button>':(primary?'<button class="btn btn-sm btn-ghost" type="button" onclick="coRemove(\''+jsId(m.user_id)+'\',false)">Remove</button>':''))+'</div>';});
  h+='<div class="co-acts"><button class="btn btn-primary" type="button" id="co-invite-btn" onclick="coInvite()">Invite co-owner</button></div>';
  if(CO.lastCode){
    h+='<div class="co-code-box" id="co-code"><div class="co-m">One-time code (valid 14 days). It is not sent automatically - copy or share it yourself.</div>'+
      '<div class="co-code">'+esc(groupCode(CO.lastCode))+'</div><div class="co-link">'+esc(APP_LINK+'?invite='+CO.lastCode)+'</div>'+
      '<div class="co-acts"><button class="btn btn-sm" type="button" onclick="coCopyCode()">Copy code</button><button class="btn btn-sm" type="button" onclick="coCopy()">Copy link</button><button class="btn btn-sm btn-primary" type="button" onclick="coShare()">Share</button></div></div>';
  }
  return h+'</section>';
}
function coRender(){var b=document.getElementById('access-body');if(!b)return;var old=document.getElementById('co-sec');if(old)old.remove();var h=coSectionHTML();if(h)b.insertAdjacentHTML('beforeend',h);}
