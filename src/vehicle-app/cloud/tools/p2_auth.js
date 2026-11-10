// ============ ROLE HELPERS / PERMISSION GATES ============
function requireAdvisor(){return !!session;}
function requireCan(v,perm,msg){
  if(!v||!can(v,perm)){
    showToast(msg||'That is not enabled for you on this vehicle. The owner can turn it on in their permissions.','error');
    return false;
  }
  return true;
}
function requireEdit(v){
  if(!canEditVehicle(v)){showToast('Only the owner can change vehicle details, reminders and archives.','error');return false;}
  return true;
}
function setDisp(sel,on){var els=document.querySelectorAll(sel),i;for(i=0;i<els.length;i++)els[i].style.display=on?'':'none';}
function applyPerms(){
  if(!session)return;
  var vs=visibleVehicles(),ownerLike=realAdmin()||(session.account.role==='owner');
  var tech=!ownerLike;
  setDisp('.perm-service',ownerLike||canAny('can_add_service',vs));
  setDisp('.perm-expense',ownerLike||canAny('can_add_expenses',vs));
  setDisp('.perm-doc',ownerLike||canAny('can_add_documents',vs));
  setDisp('.perm-adv',!!(tech&&canAny('can_create_advisories',vs)));
  setDisp('.perm-rem',ownerLike||C.clients.some(function(c){return managedMine(c.id);}));
  var canAddAny=ownerLike,i;
  if(!canAddAny)for(i=0;i<C.clients.length;i++)if(C.clients[i].canAdd)canAddAny=true;
  setDisp('.perm-addveh',canAddAny);
  setDisp('.perm-nav-expenses',ownerLike||canAny('view_expenses',vs)||canAny('can_add_expenses',vs));
}
// ============ AUTH (Supabase Auth) ============
var failedLogins=0,lockUntil=0,booting=false,recoveryMode=false,currentRole='advisor';
function showLoading(on,msg){
  var el=document.getElementById('boot-loading');if(!el)return;
  el.style.display=on?'flex':'none';
  var t=document.getElementById('boot-loading-text');if(t&&msg)t.textContent=msg;
}
function authPanels(which){
  var ids=['auth-login-panel','auth-signup-panel','auth-confirm-panel','auth-retry-panel','auth-newpw-panel','auth-forgot-panel'],i;
  for(i=0;i<ids.length;i++)showEl(ids[i],ids[i]==='auth-'+which+'-panel');
  var rs=document.querySelector('.role-select');if(rs)rs.style.display=(which==='login'||which==='signup')?'':'none';
}
function selectRole(role){
  currentRole=role==='client'?'client':'advisor';
  var btns=document.querySelectorAll('.role-btn'),i;
  for(i=0;i<btns.length;i++)btns[i].classList.remove('active');
  var btn=document.getElementById('role-'+currentRole);if(btn)btn.classList.add('active');
  elText('auth-error','');
  var em=document.getElementById('auth-email');if(em)em.placeholder=currentRole==='client'?'you@email.com':'you@evolvedetail.com';
  var sn=document.getElementById('su-code-label');if(sn)sn.textContent=currentRole==='client'?'Invite code (optional)':'Invite code from an owner or your advisor (required for techs)';
}
function showSignup(on){authPanels(on?'signup':'login');elText('su-error','');elText('auth-error','');}
function showForgot(on){authPanels(on?'forgot':'login');elText('fg-msg','');elText('auth-error','');if(on)setVal('fg-email',val('auth-email'));}
function refreshAuthView(){authPanels('login');}
function authKey(ev){if(ev&&ev.key==='Enter')login();}
function normEmail(s){return String(s||'').trim().toLowerCase();}
function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);}
function authMsg(err){
  var m=String((err&&err.message)||err||'');
  if(/invalid login credentials/i.test(m))return 'Email or password is incorrect.';
  if(/email not confirmed/i.test(m))return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if(/failed to fetch|network|load failed/i.test(m))return 'You seem to be offline. Please check your connection and try again.';
  if(/rate limit|too many/i.test(m))return 'Too many attempts. Please wait a minute and try again.';
  if(/password.*(short|least|weak)/i.test(m))return 'That password is too weak. Use at least 8 characters.';
  if(/already registered|already been registered/i.test(m))return 'An account with this email already exists. Sign in instead.';
  return 'Something went wrong. Please try again.';
}
function noBackend(){
  if(sb)return false;
  elText('auth-error','The cloud connection is not set up in this build. Please try again later.');
  return true;
}
function login(){
  var email=normEmail(val('auth-email')),pw=val('auth-password');
  elText('auth-error','');
  if(noBackend())return;
  if(Date.now()<lockUntil){elText('auth-error','Too many attempts. Wait a few seconds and try again.');return;}
  if(!email||!pw){elText('auth-error','Enter your email and password.');return;}
  var btn=document.getElementById('auth-login-btn');if(btn)btn.disabled=true;
  sb.auth.signInWithPassword({email:email,password:pw}).then(function(r){
    if(btn)btn.disabled=false;
    if(r.error){
      var m=String(r.error.message||'');
      if(/invalid login credentials/i.test(m)){failedLogins++;if(failedLogins>=5){lockUntil=Date.now()+30000;failedLogins=0;}}
      elText('auth-error',authMsg(r.error));
      showEl('auth-resend-wrap',/email not confirmed/i.test(m));
      return;
    }
    failedLogins=0;setVal('auth-password','');
    if(r.data&&r.data.user)bootWithUser(r.data.user);
  }).catch(function(e){if(btn)btn.disabled=false;elText('auth-error',authMsg(e));});
}
function resendConfirm(){
  var email=normEmail(val('auth-email'))||normEmail(val('su-email'));
  if(!email||!sb){elText('auth-error','Enter your email above first.');return;}
  sb.auth.resend({type:'signup',email:email,options:{emailRedirectTo:redirectUrl()}}).then(function(r){
    if(r.error){showToast(authMsg(r.error),'error');return;}
    showToast('Confirmation email sent. Check your inbox.','success');
  }).catch(function(e){showToast(authMsg(e),'error');});
}
function signupOwner(){
  var name=val('su-name').trim(),email=normEmail(val('su-email')),pw=val('su-password'),code=val('su-code').trim();
  elText('su-error','');
  if(noBackend()){elText('su-error','The cloud connection is not set up in this build.');return;}
  if(!name){elText('su-error','Enter your name.');return;}
  if(!validEmail(email)){elText('su-error','Enter a valid email address.');return;}
  if(pw.length<8){elText('su-error','Password must be at least 8 characters.');return;}
  var key=code.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(code&&key.length<16){elText('su-error','That invite code looks incomplete. Paste the whole code, or leave it blank.');return;}
  if(!code&&currentRole==='advisor'){elText('su-error','Techs need an invite code from an owner or from Evolve. Enter it above, or switch to Owner.');return;}
  var data={display_name:name.slice(0,80)};
  if(key)data.pending_invite=key;
  var btn=document.getElementById('su-btn');if(btn)btn.disabled=true;
  sb.auth.signUp({email:email,password:pw,options:{emailRedirectTo:redirectUrl(),data:data}}).then(function(r){
    if(btn)btn.disabled=false;
    if(r.error){elText('su-error',authMsg(r.error));return;}
    var u=r.data&&r.data.user;
    if(u&&u.identities&&u.identities.length===0){elText('su-error','An account with this email may already exist. Try signing in, or use Forgot password.');return;}
    setVal('su-password','');
    if(r.data&&r.data.session&&u){bootWithUser(u);return;}
    elText('confirm-email-label',email);
    authPanels('confirm');
  }).catch(function(e){if(btn)btn.disabled=false;elText('su-error',authMsg(e));});
}
function resendFromConfirm(){
  var email=elTextGet('confirm-email-label');
  if(!email||!sb)return;
  sb.auth.resend({type:'signup',email:email,options:{emailRedirectTo:redirectUrl()}}).then(function(r){
    showToast(r.error?authMsg(r.error):'Confirmation email sent again.',r.error?'error':'success');
  }).catch(function(e){showToast(authMsg(e),'error');});
}
function elTextGet(id){var el=document.getElementById(id);return el?String(el.textContent||''):'';}
function sendReset(){
  var email=normEmail(val('fg-email'));
  elText('fg-msg','');
  if(noBackend())return;
  if(!validEmail(email)){elText('fg-msg','Enter the email you signed up with.');return;}
  sb.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl()}).then(function(r){
    if(r.error){elText('fg-msg',authMsg(r.error));return;}
    elText('fg-msg','If that email has an account, a reset link is on its way. Open it on this device to choose a new password.');
  }).catch(function(e){elText('fg-msg',authMsg(e));});
}
function saveNewPassword(){
  var a=val('np-new'),b=val('np-confirm');
  elText('np-error','');
  if(a.length<8){elText('np-error','Password must be at least 8 characters.');return;}
  if(a!==b){elText('np-error','Passwords do not match.');return;}
  sb.auth.updateUser({password:a}).then(function(r){
    if(r.error){elText('np-error',authMsg(r.error));return;}
    recoveryMode=false;setVal('np-new','');setVal('np-confirm','');
    showToast('Password updated','success');
    if(r.data&&r.data.user)bootWithUser(r.data.user);
  }).catch(function(e){elText('np-error',authMsg(e));});
}
function showRetry(msg){
  showLoading(false);
  showEl('auth-screen',true,'flex');
  var sh=document.getElementById('app-shell');if(sh)sh.classList.add('hidden');
  elText('retry-msg',msg);
  authPanels('retry');
}
function retryBoot(){
  if(!sb)return;
  showLoading(true,'Loading your collection');
  sb.auth.getSession().then(function(r){
    if(r.data&&r.data.session&&r.data.session.user)bootWithUser(r.data.session.user);
    else{showLoading(false);authPanels('login');applyInviteToAuth();}
  }).catch(function(e){showRetry(netMsg(e));});
}
async function bootWithUser(user){
  if(booting||!user)return;
  booting=true;
  session={account:{id:user.id,email:user.email||'',name:'',role:'owner'},role:'client',viewAs:null};
  showLoading(true,'Loading your collection');
  try{
    await loadAll();
  }catch(e){
    booting=false;session=null;
    if(String(e&&e.message)==='noprofile')showRetry('Your profile is not ready yet. Please wait a moment and try again.');
    else showRetry(netMsg(e));
    return;
  }
  setAccountFromProfile(user);
  var pend=user.user_metadata&&user.user_metadata.pending_invite;
  var urlCode=pendingInviteCode(),codes=[];
  if(pend)codes.push(codeKey(pend));
  if(urlCode&&codes.indexOf(urlCode)<0)codes.push(urlCode);
  if(codes.length){
    var applied=0,lastErr=null,lastRes=null,ci;
    for(ci=0;ci<codes.length;ci++){
      try{
        var rr=await sb.rpc('redeem_invite',{p_code:codes[ci]});if(rr.error)throw rr.error;
        applied++;lastRes=rr.data;
      }catch(e){lastErr=e;}
    }
    if(applied)showToast(inviteDoneText(lastRes)||'Your invite code was applied.','success');
    else if(lastErr)showToast(inviteErrorText(lastErr),'error');
    clearPendingInvite();
    if(pend){try{await sb.auth.updateUser({data:{pending_invite:null}});}catch(e2){}}
    try{await loadAll();setAccountFromProfile(user);}catch(e3){}
  }
  // a tech may have added vehicles for this person before they joined: claim them by verified email (no-op otherwise)
  try{
    var nClaimed=await autoClaim();
    if(nClaimed){await loadAll();setAccountFromProfile(user);showToast('Vehicles your tech already added for you are now in your collection.','success');}
  }catch(e4){}
  booting=false;
  showLoading(false);
  viewAsRestore(session.account);
  enterApp();
}
function setAccountFromProfile(user){
  var p=C.profile||{};
  session.account={id:user.id,email:p.email||user.email||'',name:displayName(p),role:p.role||'owner',phone:p.phone||'',clientId:(p.role==='owner')?user.id:null};
  session.role=session.account.role==='owner'?'client':'advisor';
  currentRole=session.role;
}
function enterApp(){
  showEl('auth-screen',false);
  var shell=document.getElementById('app-shell');
  if(shell)shell.classList.remove('hidden');
  var adv=document.querySelectorAll('.advisor-only'),cli=document.querySelectorAll('.client-only'),adm=document.querySelectorAll('.admin-only'),i;
  var owner=isOwner();
  for(i=0;i<adv.length;i++)adv[i].style.display=owner?'none':'';
  for(i=0;i<cli.length;i++)cli[i].style.display=owner?'':'none';
  for(i=0;i<adm.length;i++)adm[i].style.display=isAdmin()?'':'none';
  var a=me();
  elText('sidebar-user-name',a?(a.name||a.email):'');
  elText('sidebar-user-role',viewAsActive()?('Admin / viewing as '+viewAsLabel()):(owner?'Owner':(isAdmin()?'Admin':'Advisor / Tech')));
  if(document.body)document.body.classList.toggle('owner-mode',owner);
  applyPerms();
  viewAsRefreshUI();
  updateRecBadge();
  if(owner)showPage(ownerClient()?'client-portal':'client-link');
  else showPage('dashboard');
  showDueBanner();
}
function goLoggedOut(){
  session=null;C=emptyCache();SNAP={};
  try{window.location.reload();}catch(e){}
}
function logout(){
  try{window.sessionStorage.removeItem(VIEWAS_STORE);}catch(e){}
  var done=function(){session=null;try{window.location.reload();}catch(e){}};
  try{if(sb)sb.auth.signOut().then(done,done);else done();}catch(e){done();}
}
function forceLogout(msg){showToast(msg,'error');setTimeout(logout,1200);}
function refreshSessionAccount(){return session?session.account:null;}
function restoreSession(){retryBoot();}
function initAuthEvents(){
  if(!sb)return;
  sb.auth.onAuthStateChange(function(ev,s){
    setTimeout(function(){
      if(ev==='PASSWORD_RECOVERY'){recoveryMode=true;showEl('auth-screen',true,'flex');authPanels('newpw');showLoading(false);}
      else if(ev==='SIGNED_IN'&&s&&s.user&&!recoveryMode){if(!session||session.account.id!==s.user.id)bootWithUser(s.user);}
      else if(ev==='SIGNED_OUT'){if(session)goLoggedOut();}
    },0);
  });
}
// ============ INVITE LINK (?invite=CODE), AUTO-CLAIM, FRIENDLY CODE ERRORS ============
var INVITE_KEY='evo_pending_invite';
function pendingInviteCode(){try{return localStorage.getItem(INVITE_KEY)||'';}catch(e){return '';}}
function clearPendingInvite(){try{localStorage.removeItem(INVITE_KEY);}catch(e){}}
function readUrlInvite(){
  try{
    var q=new URLSearchParams(window.location.search||''),c=q.get('invite');
    if(c===null)return;
    var k=String(c).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(k.length>=16&&k.length<=64)localStorage.setItem(INVITE_KEY,k);
    q.delete('invite');
    var qs=q.toString();
    if(window.history&&history.replaceState)history.replaceState(null,'',window.location.pathname+(qs?'?'+qs:'')+(window.location.hash||''));
  }catch(e){}
}
// not signed in + a code in the link/storage: open Create account with the code filled in (owner side)
function applyInviteToAuth(){
  var k=pendingInviteCode();
  if(!k)return;
  try{showSignup(true);selectRole('client');setVal('su-code',groupCode(k));showToast('Invite code added. Create your account, or sign in if you already have one.','success');}catch(e){}
}
function inviteErrorText(e){
  var m=String((e&&(e.message||e.error_description||e))||'');
  if(rpcMissing(e))return NEEDS_BACKEND+'.';
  if(/failed to fetch|network|load failed/i.test(m))return 'You seem to be offline. Try again when you are back online.';
  if(/invalid_or_expired_invite/.test(m))return 'That code did not work. Check that you pasted all of it. A code works once and expires after 14 days, so ask for a new one if needed.';
  if(/cannot_redeem_own_invite/.test(m))return 'You made this code, so you cannot use it. It has to be redeemed from the other person\'s own account.';
  if(/role_not_eligible/.test(m))return 'This account cannot use that kind of code. Client codes work on owner accounts. Tech codes only work on a new account with no vehicles.';
  if(/vin_conflict/.test(m))return 'A vehicle with the same VIN is already in this account, so the transfer stopped. Ask your tech to remove the duplicate and send a new code.';
  if(/not_authenticated|JWT/i.test(m))return 'Your session ended. Please sign in again.';
  return 'That code could not be used right now. Please try again in a moment.';
}
function inviteDoneText(d){
  if(!d)return '';
  var n=0,i,cl=d.claimed||[];
  for(i=0;i<cl.length;i++)n+=Number(cl[i]&&cl[i].vehicles)||0;
  if(d.kind==='client_owner')return n?('Connected. '+n+' vehicle'+(n===1?'':'s')+' your tech already added '+(n===1?'is':'are')+' now in your collection.'):'Connected. Your tech can now see your collection.';
  if(d.kind==='transfer')return 'The vehicle is now in your collection.';
  return 'Access added. Look under Clients.';
}
var CAPCLAIM=true;
async function autoClaim(){
  if(!CAPCLAIM||!sb||!session||session.account.role!=='owner')return 0;
  try{
    var r=await sb.rpc('claim_managed_clients');
    if(r.error){if(rpcMissing(r.error))CAPCLAIM=false;return 0;}
    return Number(r.data&&r.data.count)||0;
  }catch(e){return 0;}
}
function redeemCardHTML(pref){
  var c=pendingInviteCode();
  return '<div class="invite-card"><div class="sh first"><h2>Enter invite code</h2></div><div class="doc-meta">Got a code from your tech? Paste it here to connect.</div>'
   +'<div class="flex gap-2" style="margin-top:12px;"><input type="text" id="'+pref+'-code" value="'+esc(c?groupCode(c):'')+'" placeholder="Paste your code" autocapitalize="characters" autocomplete="off" aria-label="Invite code"><button class="btn btn-primary" onclick="redeemCodeFrom(\''+pref+'-code\',\''+pref+'-code-msg\')">Redeem</button></div>'
   +'<div class="doc-meta code-msg" id="'+pref+'-code-msg" role="status"></div></div>';
}
// ============ INVITE CODES (create_invite / redeem_invite / revoke_invite) ============
var CAP={inviteLabel:true};
var lastInviteCode='';
function groupCode(c){return String(c||'').replace(/(.{4})/g,'$1-').replace(/-$/,'');}
async function createInviteRpc(kind,vehicleId,email,label){
  var args={p_kind:kind,p_vehicle_id:vehicleId||null,p_email:email||null},r;
  if(CAP.inviteLabel&&label){
    var a4={p_kind:kind,p_vehicle_id:vehicleId||null,p_email:email||null,p_label:String(label).slice(0,80)};
    r=await sb.rpc('create_invite',a4);
    if(r.error&&(r.error.code==='PGRST202'||/could not find the function|schema cache/i.test(String(r.error.message||'')))){CAP.inviteLabel=false;r=await sb.rpc('create_invite',args);}
  }else r=await sb.rpc('create_invite',args);
  if(r.error)throw r.error;
  var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
  if(!row||!row.code)throw new Error('no code returned');
  return row;
}
var NOTE=' Invitations are not emailed automatically - share this code or link yourself with Share invite, Copy code or Email it.';
var APP_LINK='https://wade0764.github.io/EvoAI/cloud/';
var lastInviteEmail='';
var revealCodes={},revealTried={};
function codeKey(c){return String(c||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function storedCodes(){try{return JSON.parse(localStorage.getItem('evo_invite_codes')||'{}')||{};}catch(e){return {};}}
function saveInviteCode(id,code){if(!id||!code)return;revealCodes[id]=codeKey(code);try{var m=storedCodes();m[id]=codeKey(code);localStorage.setItem('evo_invite_codes',JSON.stringify(m));}catch(e){}}
function forgetInviteCode(id){delete revealCodes[id];try{var m=storedCodes();delete m[id];localStorage.setItem('evo_invite_codes',JSON.stringify(m));}catch(e){}}
function knownInviteCode(id){return revealCodes[id]||storedCodes()[id]||'';}
// Optional owner-only RPC from migration_002_invites.sql. If it is not installed the app just uses codes saved on this device.
var CAPREVEAL=true;
async function revealMissingCodes(ids){
  if(!sb||!CAPREVEAL)return;
  var did=false;
  for(var i=0;i<ids.length;i++){
    var id=ids[i];if(knownInviteCode(id)||revealTried[id])continue;revealTried[id]=1;
    try{
      var r=await sb.rpc('get_invite_code',{p_invite_id:id});
      if(r.error){if(r.error.code==='PGRST202'||/could not find the function|schema cache/i.test(String(r.error.message||''))){CAPREVEAL=false;return;}continue;}
      if(r.data&&typeof r.data==='string'){revealCodes[id]=codeKey(r.data);did=true;}
    }catch(e){}
  }
  if(did)refreshCurrent();
}
function inviteShareText(code,email){
  return 'You are invited to EvoAI. Open '+APP_LINK+'?invite='+codeKey(code)+' , create an account using '+(email?('the email '+email):'the email this invite was sent to')+', then enter this invite code: '+groupCode(codeKey(code));
}
function inviteMailto(code,email){
  return 'mailto:'+encodeURIComponent(email||'').replace(/%40/g,'@')+'?subject='+encodeURIComponent('Your EvoAI invite')+'&body='+encodeURIComponent(inviteShareText(code,email)+'\n\nInvitations are not emailed automatically by the app.');
}
function copyText(txt,msg){
  function fb(){
    try{var t=document.createElement('textarea');t.value=txt;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);showToast(msg,'success');}
    catch(e){showToast('Press and hold the code to copy it','error');}
  }
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){showToast(msg,'success');},fb);else fb();}catch(e){fb();}
}
function shareInviteCode(code,email){
  var text=inviteShareText(code,email);
  if(navigator.share){navigator.share({title:'Your EvoAI invite',text:text}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(text,'Invite message copied');});}
  else copyText(text,'Invite message copied');
}
function copyInviteById(id){var c=knownInviteCode(id);if(c)copyText(groupCode(c),'Code copied');}
function shareInviteById(id,email){var c=knownInviteCode(id);if(c)shareInviteCode(c,email);}
function shareInviteModal(){if(lastInviteCode)shareInviteCode(lastInviteCode,lastInviteEmail);}
function inviteRowExtras(id,email){
  var c=knownInviteCode(id);
  if(!c)return '<div class="doc-meta" style="margin-top:6px;">Code not saved on this device. Revoke it and create a new one to share.</div>';
  return '<div class="invite-row-code" style="font-size:16px;letter-spacing:.08em;color:var(--gold);margin-top:6px;word-break:break-all;user-select:all;-webkit-user-select:all;">'+esc(groupCode(c))+'</div>'
   +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button class="btn btn-sm" onclick="copyInviteById(\''+jsId(id)+'\')">Copy code</button> <button class="btn btn-sm btn-primary" onclick="shareInviteById(\''+jsId(id)+'\',\''+jsId(email||'')+'\')">Share invite</button> <a class="btn btn-sm" href="'+esc(inviteMailto(c,email))+'">Email it</a></div>';
}
function showInviteResult(opts){
  lastInviteEmail=opts.email||'';
  if(opts.id)saveInviteCode(opts.id,opts.code);
  lastInviteCode=groupCode(opts.code);
  elText('invite-title',opts.title);
  elText('invite-client-name',opts.who||'');
  elText('invite-code-text',lastInviteCode);
  elText('invite-expiry','Expires '+fmtDate(String(opts.expires||'').slice(0,10))+' - single use');
  elText('invite-help',opts.help);
  var ml=document.getElementById('invite-mailto');if(ml)ml.href=inviteMailto(opts.code,lastInviteEmail);
  openModal('modal-invite');
}
function copyInviteCode(){
  if(lastInviteCode){copyText(lastInviteCode,'Code copied');return;}
  var code=lastInviteCode;if(!code)return;
  function fallback(){
    var el=document.getElementById('invite-code-text');
    try{var r=document.createRange();r.selectNodeContents(el);var s=window.getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');showToast('Code copied','success');}
    catch(e){showToast('Press and hold the code to copy it','error');}
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(function(){showToast('Code copied','success');},fallback);}
    else fallback();
  }catch(e){fallback();}
}
function inviteActive(inv){return inv&&!inv.redeemed_at&&!inv.revoked_at&&String(inv.expires_at)>new Date().toISOString();}
async function revokeInviteById(id){
  if(!window.confirm('Revoke this invite code? It will stop working right away.'))return;
  try{
    var r=await sb.rpc('revoke_invite',{p_invite_id:id});if(r.error)throw r.error;forgetInviteCode(id);
    showToast('Invite code revoked','success');
    await loadAll();refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
async function redeemCodeFrom(inputId,msgId){
  if(!session)return;
  var say=function(t,bad){if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}};
  say('');
  if(viewAsActive()){showToast('Not available while viewing as another role.','error');return;}
  var code=val(inputId),k=code.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!k){say('Paste the invite code first.',true);showToast('Paste the invite code first.','error');return;}
  if(k.length<16){say('That looks too short. Paste the whole code.',true);showToast('Paste the whole invite code.','error');return;}
  say('Checking the code...');
  try{
    var r=await sb.rpc('redeem_invite',{p_code:k});
    if(r.error)throw r.error;
    clearPendingInvite();
    setVal(inputId,'');closeModal('modal-account');
    await loadAll();
    var u=(await sb.auth.getUser()).data.user;
    if(u)setAccountFromProfile(u);
    showToast(inviteDoneText(r.data||{kind:'transfer'}),'success');
    enterApp();
  }catch(e){var t=inviteErrorText(e);say(t,true);showToast(t,'error');}
}
function createInviteFromAccess(){
  var scope=val('inv-scope'),email=normEmail(val('inv-email'));
  if(email&&!validEmail(email)){showToast('That email looks invalid','error');return;}
  var oid=ownerClientId()||myId();
  var kind=scope?'tech_vehicle':'tech_owner';
  createInviteRpc(kind,scope||null,email||null,null).then(function(row){
    saveInviteCode(row.invite_id,row.code);
    var v=scope?byId(C.vehicles,scope):null;
    showInviteResult({title:'Tech invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:v?('Access to '+vFull(v)):'Access to all of your vehicles',help:'Share this code privately with the tech. They create an account (or enter it under Account > Redeem a code) and get access. You choose what they can see below. The code works once and expires in 14 days.'+NOTE});
    return loadAll().then(function(){renderAccess();});
  }).catch(function(e){showToast(friendlyError(e),'error');});
}
// ============ CLIENTS (tech / admin) ============
function inviteClientOnly(){
  var name=val('ic-name').trim(),email=normEmail(val('ic-email'));
  if(!name){showToast('Client name is required','error');return;}
  if(email&&!validEmail(email)){showToast('Client email looks invalid','error');return;}
  createInviteRpc('client_owner',null,email||null,name).then(function(row){
    closeModal('modal-invite-client');
    setVal('ic-name','');setVal('ic-email','');
    showInviteResult({title:'Client invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:'Client: '+name,help:'Share this code privately with the owner. They choose Owner, tap Create an account, and enter it (or enter it under Account > Enter invite code if they already have an account). It connects them to you. The code works once and expires in 14 days.'+NOTE});
    return loadAll().then(function(){refreshCurrent();});
  }).catch(function(e){showToast(friendlyError(e),'error');});
}
// New client: a managed client (no invite needed). The tech can add vehicles right away; the client claims them later.
async function addClient(){
  var name=val('nc-name').trim(),email=normEmail(val('nc-email')),phone=val('nc-phone').trim(),notes=val('nc-notes').trim();
  elText('nc-error','');
  if(!name){elText('nc-error','Client name is required.');return;}
  if(email&&!validEmail(email)){elText('nc-error','That email address does not look right.');return;}
  var btn=document.getElementById('nc-save-btn');if(btn)btn.disabled=true;
  try{
    var r=await sb.rpc('create_managed_client',{p_name:name,p_email:email||null,p_phone:phone||null,p_notes:notes||null});
    if(r.error)throw r.error;
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.owner_id)throw new Error('no client returned');
    closeModal('modal-add-client');
    setVal('nc-name','');setVal('nc-email','');setVal('nc-phone','');setVal('nc-notes','');
    await loadAll();refreshCurrent();
    showClientCreated(row.owner_id,name);
  }catch(e){
    var t=friendlyError(e);
    elText('nc-error',t);
    showToast(t,'error');
  }
  if(btn)btn.disabled=false;
}
function openNewClient(){
  elText('nc-error','');
  openModal('modal-add-client');
}
function showClientCreated(id,name){
  currentClientId=id;
  elText('cc-name',name);
  var b=document.getElementById('cc-add-btn');if(b)b.textContent='Add vehicle for '+name;
  var ib=document.getElementById('cc-add-btn');if(ib)ib.setAttribute('data-id',id);
  openModal('modal-client-created');
}
function clientCreatedAddVehicle(){
  var b=document.getElementById('cc-add-btn'),id=b?b.getAttribute('data-id'):currentClientId;
  closeModal('modal-client-created');
  openAddVehicleFor(id);
}
// optional: connect a managed client to the app with the normal invite-code flow
async function inviteManagedClient(clientId){
  var c=byId(C.clients,clientId);if(!c||!c.managed)return;
  try{
    var r=await sb.rpc('create_managed_client_invite',{p_managed_id:clientId,p_email:c.email||null});
    if(r.error)throw r.error;
    var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
    if(!row||!row.code)throw new Error('no code returned');
    showInviteResult({title:'Invite '+c.name+' to the app',id:row.invite_id,email:c.email||'',code:row.code,expires:row.expires_at,who:'Client: '+c.name,help:'Share this link or code privately with '+c.name+'. When they sign up or enter it, the vehicles and records you added move into their own account and you keep access. The code works once and expires in 14 days.'+NOTE});
    await loadAll();refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function managedRowActions(c){
  if(!c||!c.managed||c.claimed)return '';
  var h='<div class="flex gap-2" style="flex-wrap:wrap;margin-top:8px;" onclick="event.stopPropagation()"><button class="btn btn-sm btn-primary" onclick="openAddVehicleFor(\''+jsId(c.id)+'\')">Add vehicle</button>';
  if(!c.inviteId)h+='<button class="btn btn-sm" onclick="inviteManagedClient(\''+jsId(c.id)+'\')">Invite to app</button>';
  h+='</div>';
  if(c.inviteId)h+='<div onclick="event.stopPropagation()"><div class="doc-meta" style="margin-top:6px;">Invite pending'+(c.inviteExpires?' / expires '+esc(fmtDate(String(c.inviteExpires).slice(0,10))):'')+'</div>'+inviteRowExtras(c.inviteId,c.email)+'</div>';
  return h;
}
function managedBadgeHTML(c){return (c&&c.managed&&!c.claimed)?'<span class="badge-soft" title="This client has no account yet. Your records are held for them.">Not on app yet</span>':'';}
function managedBannerHTML(c){
  if(!c||!c.managed||c.claimed)return '';
  var h='<div class="managed-banner"><div>'+managedBadgeHTML(c)+'<span class="doc-meta"> Held under your account until they join.'+(c.email?' It moves to them automatically when they sign up with '+esc(c.email)+'.':'')+'</span></div>';
  if(c.notes)h+='<div class="doc-meta" style="margin-top:6px;">Notes: '+esc(c.notes)+'</div>';
  h+='<div class="flex gap-2" style="flex-wrap:wrap;margin-top:10px;"><button class="btn btn-sm btn-primary" onclick="openAddVehicleFor(\''+jsId(c.id)+'\')">Add vehicle for '+esc(c.name)+'</button>';
  if(!c.inviteId)h+='<button class="btn btn-sm" onclick="inviteManagedClient(\''+jsId(c.id)+'\')">Invite to app</button>';
  h+='</div>';
  if(c.inviteId)h+='<div class="doc-meta" style="margin-top:8px;">Invite pending'+(c.inviteExpires?' / expires '+esc(fmtDate(String(c.inviteExpires).slice(0,10))):'')+'</div>'+inviteRowExtras(c.inviteId,c.email);
  return h+'</div>';
}
function openClientDetail(clientId){
  if(String(clientId).indexOf('inv_')===0)return;
  currentClientId=clientId;showPage('client-detail');
}
async function leaveOrRevokeAccess(accessId){
  if(!window.confirm('End this access? It stops right away. Records already entered stay with the vehicle.'))return;
  try{
    var r=await sb.rpc('revoke_tech_access',{p_access_id:accessId});if(r.error)throw r.error;
    showToast('Access ended','success');
    await loadAll();
    if(isRealTech()&&!byId(C.clients,currentClientId)){currentClientId=null;showPage('clients');}
    else refreshCurrent();
  }catch(e){showToast(friendlyError(e),'error');}
}
function renderClients(){
  var clients=getClients(),vehicles=getVehicles();
  var el=document.getElementById('clients-list');if(!el)return;
  if(!clients.length&&!C.pending.length){el.innerHTML=emptyCard('No clients yet. Add your first client, then add their vehicles. They can join the app later.<div><button class="btn btn-primary" onclick="openModal(\'modal-add-client\')">New client</button></div>');return;}
  var h=clients.map(function(c){
    var owned=vehicles.filter(function(v){return v.clientId===c.id;});
    var cvs=owned.filter(function(v){return !isArchivedVehicle(v);});
    var archN=owned.length-cvs.length;
    var t=portfolioTotals(cvs);
    return '<div class="client-row" onclick="openClientDetail(\''+jsId(c.id)+'\')"><div class="client-info"><div class="client-name">'+esc(c.name)+' '+managedBadgeHTML(c)+'</div><div class="client-meta">'+cvs.length+' vehicle'+(cvs.length!==1?'s':'')+(archN?' / '+archN+' archived':'')+(c.email?' / '+esc(c.email):'')+'</div>'+managedRowActions(c)+'</div><div class="client-val">'+money(t.value)+(t.basis>0?'<div class="client-meta '+(t.gain>=0?'pos':'neg')+'" style="text-align:right;">'+esc(pct(t.pctGain))+'</div>':'')+'</div></div>';
  }).join('');
  h+=C.pending.map(function(p){
    return '<div class="client-row" style="cursor:default;"><div class="client-info"><div class="client-name">'+esc(p.name)+'</div><div class="client-meta">Invite pending / expires '+esc(fmtDate(String(p.expiresAt).slice(0,10)))+(p.email?' / '+esc(p.email):'')+'</div>'+inviteRowExtras(p.inviteId,p.email)+'</div><div class="client-val"><button class="btn btn-sm" onclick="revokeInviteById(\''+jsId(p.inviteId)+'\')">Revoke code</button></div></div>';
  }).join('');
  el.innerHTML=h;
  revealMissingCodes(C.pending.map(function(p){return p.inviteId;}).concat(C.clients.filter(function(c){return c.inviteId;}).map(function(c){return c.inviteId;})));
}
function renderClientAccess(clientId){
  if(clientId!==currentClientId)return;
  var rows=C.access.filter(function(a){return a.owner_id===clientId&&a.status==='active'&&(realAdmin()||a.tech_id===myId());});
  var h='';
  if(rows.length){
    h=rows.map(function(a){
      var tp=C.profiles[a.tech_id],veh=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null;
      var who=a.tech_id===myId()?'You':displayName(tp);
      return '<div class="access-row"><div><div style="font-size:16px;font-weight:300;">'+esc(who)+'</div><div class="doc-meta">'+esc(a.vehicle_id?('Access to '+(veh?vFull(veh):'one vehicle')):'Access to the whole collection')+(a.client_origin?' / you brought this client':'')+'</div></div><button class="btn btn-danger btn-sm" onclick="leaveOrRevokeAccess(\''+jsId(a.id)+'\')">'+(a.tech_id===myId()?'End my access':'Revoke access')+'</button></div>';
    }).join('');
  }else h='<div class="doc-meta" style="padding:14px 0;border-bottom:1px solid var(--line);">No active tech access is recorded for this client.</div>';
  elHTML('cd-access',h);
}
function deleteCurrentClient(){showToast('Clients are accounts. They cannot be deleted here.','error');}
// ============ OWNER: TECH ACCESS AND PERMISSIONS MENU ============
var PERM_LABELS=[
  ['view','What the tech can see',[
    ['view_service_records','Service history'],
    ['view_documents','Documents and invoices'],
    ['view_photos','Photos (also lets them add photos)'],
    ['view_reminders','Reminders'],
    ['view_health_estimate','AI health score'],
    ['view_value_estimate','AI value estimate'],
    ['view_expenses','Expenses'],
    ['view_purchase_info','Purchase price and date']]],
  ['add','What the tech can add',[
    ['can_add_service','Log service and inspections'],
    ['can_add_documents','Add documents and invoices'],
    ['can_add_expenses','Add expenses'],
    ['can_create_advisories','Send advisories']]]
];
var PM_SCOPE={};
function permRowFor(accessId,vehicleId){
  var rows=C.permRows,i,def=null,ov=null;
  for(i=0;i<rows.length;i++){if(rows[i].access_id!==accessId)continue;if(rows[i].vehicle_id===null)def=rows[i];else if(vehicleId&&rows[i].vehicle_id===vehicleId)ov=rows[i];}
  return {def:def,ov:ov,eff:ov||def};
}
function pmScopeChange(accessId,sel){PM_SCOPE[accessId]=sel.value||'';renderAccess();var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;}
function renderAccess(){
  var oid=ownerClientId()||myId();
  var rows=C.access.filter(function(a){return a.owner_id===oid&&a.status==='active';});
  var myVeh=C.vehicles.filter(function(v){return v.clientId===oid&&!v.archived;});
  var h='';
  h+='<div class="sh first"><h2>Your techs</h2></div>';
  if(!rows.length)h+=emptyCard('No tech has access yet. Create an invite code below and share it privately with your tech.');
  rows.forEach(function(a){
    var tp=C.profiles[a.tech_id],veh=a.vehicle_id?byId(C.vehicles,a.vehicle_id):null,aid=jsId(a.id);
    var scope=PM_SCOPE[a.id]||'';
    if(scope&&a.vehicle_id&&scope!==a.vehicle_id)scope='';
    var pr=permRowFor(a.id,scope),eff=pr.eff||{};
    var covered=a.vehicle_id?(veh?[veh]:[]):myVeh;
    h+='<div class="access-card"><div class="access-row" style="border-bottom:0;"><div><div style="font-size:17px;font-weight:300;">'+esc(displayName(tp))+'</div><div class="doc-meta">'+esc((tp&&tp.email)||'')+' / '+esc(a.vehicle_id?('Only '+(veh?vFull(veh):'one vehicle')):'All your vehicles')+'</div></div><button class="btn btn-danger btn-sm" onclick="leaveOrRevokeAccess(\''+aid+'\')">Remove access</button></div>';
    h+='<details class="more" id="pm-'+aid+'"><summary>Permissions</summary><div style="padding-top:10px;">';
    if(covered.length>1||(covered.length===1&&!a.vehicle_id)){
      h+='<div class="input-group"><label>Settings apply to</label><select onchange="pmScopeChange(\''+aid+'\',this)"><option value="">All vehicles (default)</option>'+covered.map(function(v){return '<option value="'+esc(v.id)+'"'+(scope===v.id?' selected':'')+'>'+esc(vName(v))+' only'+(permRowFor(a.id,v.id).ov?' (custom)':'')+'</option>';}).join('')+'</select></div>';
    }
    if(scope&&pr.ov)h+='<div class="doc-meta" style="margin-bottom:8px;">This vehicle has its own settings. <span class="link" onclick="resetPermOverride(\''+aid+'\',\''+jsId(scope)+'\')">Reset to default</span></div>';
    PERM_LABELS.forEach(function(g){
      h+='<div class="lab" style="margin:14px 0 6px;">'+esc(g[1])+'</div>';
      g[2].forEach(function(p){
        h+='<label class="tgl"><input type="checkbox" id="pm-'+aid+'-'+p[0]+'"'+(eff[p[0]]?' checked':'')+' onchange="togglePerm(\''+aid+'\',\''+p[0]+'\',this.checked,\''+jsId(scope)+'\')"><span class="tgl-ui"></span><span class="tgl-t">'+esc(p[1])+'</span></label>';
      });
    });
    h+='<div class="doc-meta" style="margin-top:12px;">Insurance and title documents that you upload are always private to you. Changes apply immediately.</div>';
    h+='</div></details></div>';
  });
  var open=C.invites.filter(function(i){return (i.kind==='tech_owner'||i.kind==='tech_vehicle')&&inviteActive(i)&&i.created_by===myId();});
  h+='<div class="sh"><h2>Invite a tech</h2></div><div style="max-width:420px;">';
  h+='<div class="input-group"><label>Access to</label><select id="inv-scope"><option value="">All my vehicles</option>'+myVeh.map(function(v){return '<option value="'+esc(v.id)+'">'+esc(vFull(v))+' only</option>';}).join('')+'</select></div>';
  h+='<div class="input-group"><label>Lock to an email (optional)</label><input type="email" id="inv-email" maxlength="120" placeholder="tech@email.com" autocapitalize="none"></div>';
  h+='<button class="btn btn-gold btn-sm" onclick="createInviteFromAccess()">Create invite code</button></div>';
  if(open.length){
    h+='<div class="sh"><h2>Open invite codes</h2></div>'+open.map(function(i){
      var v=i.vehicle_id?byId(C.vehicles,i.vehicle_id):null;
      return '<div class="access-row"><div><div class="doc-meta">'+esc(v?vFull(v):'All vehicles')+' / expires '+esc(fmtDate(String(i.expires_at).slice(0,10)))+(i.email?' / '+esc(i.email):'')+'</div>'+inviteRowExtras(i.id,i.email)+'</div><button class="btn btn-sm" onclick="revokeInviteById(\''+jsId(i.id)+'\')">Revoke code</button></div>';
    }).join('');
  }
  elHTML('access-body',h);
  revealMissingCodes(open.map(function(i){return i.id;}));
}
async function togglePerm(accessId,perm,value,vehicleId){
  try{
    var args={p_access_id:accessId,p_permission:perm,p_value:!!value};
    if(vehicleId)args.p_vehicle_id=vehicleId;
    var r=await sb.rpc('set_tech_permission',args);
    if(r.error)throw r.error;
    var row=r.data;
    if(row&&row.id){
      var i,done=false;
      for(i=0;i<C.permRows.length;i++)if(C.permRows[i].id===row.id){C.permRows[i]=row;done=true;}
      if(!done)C.permRows.push(row);
    }
    renderAccess();
    var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;
    showToast('Permission updated','success');
  }catch(e){
    showToast(friendlyError(e),'error');
    renderAccess();var d2=document.getElementById('pm-'+jsId(accessId));if(d2)d2.open=true;
  }
}
async function resetPermOverride(accessId,vehicleId){
  try{
    var r=await sb.rpc('reset_tech_permission_override',{p_access_id:accessId,p_vehicle_id:vehicleId});
    if(r.error)throw r.error;
    C.permRows=C.permRows.filter(function(p){return !(p.access_id===accessId&&p.vehicle_id===vehicleId);});
    PM_SCOPE[accessId]='';
    renderAccess();var d=document.getElementById('pm-'+jsId(accessId));if(d)d.open=true;
    showToast('Back to the default settings','success');
  }catch(e){showToast(friendlyError(e),'error');}
}
// ============ TEAM (admin, read-only list) ============
function renderTeam(){
  if(!isAdmin())return;
  var h=C.team.map(function(p){
    return '<div class="access-row"><div><div style="font-size:17px;font-weight:300;">'+esc(displayName(p))+'</div><div class="doc-meta">'+esc(p.email||'')+' / '+(p.role==='admin'?'Admin':'Tech')+(p.id===myId()?' / you':'')+'</div></div></div>';
  }).join('');
  var owners=Object.keys(C.profiles).filter(function(k){return C.profiles[k].role==='owner';}).length;
  elHTML('team-list',(h||emptyCard('No team accounts.'))+'<div class="doc-meta" style="padding:16px 0;">'+owners+' owner account'+(owners===1?'':'s')+'. Techs create their own account and enter an invite code from an owner or from you. Roles are set by the database, not in this app.</div>');
}
function addTech(){showToast('Techs create their own account and use an invite code.','error');}
function removeTech(){showToast('Remove a tech from the owner\'s access list.','error');}
