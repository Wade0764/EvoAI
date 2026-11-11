// ============ v27 SIMPLE SECURE SIGN-UP (short invite codes, email code / magic link, admin test mode) ============
// Codes: 8 chars from an unambiguous alphabet (no 0 O 1 I L), shown as ABCD-EFGH. Legacy 32-char hex codes still work.
var SU_ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function suNorm(s){
  var raw=String(s||'').replace(/[^A-Za-z0-9]/g,'');
  if(raw.length===8)return raw.toUpperCase();          // new short code
  return raw.toLowerCase();                              // legacy hex code
}
function suIsShort(k){return /^[A-HJ-KMNP-Z2-9]{8}$/.test(k);}
function suValid(k){return suIsShort(k)||(k.length>=16&&k.length<=64&&/^[a-z0-9]+$/.test(k));}
function codeKey(c){return suNorm(c);}
function suLink(k){return APP_LINK+'?invite='+encodeURIComponent(k);}
function readUrlInvite(){
  try{
    var q=new URLSearchParams(window.location.search||''),c=q.get('invite');
    if(c===null)return;
    var k=suNorm(c);
    if(suValid(k))localStorage.setItem(INVITE_KEY,k);
    q.delete('invite');
    var qs=q.toString();
    if(window.history&&history.replaceState)history.replaceState(null,'',window.location.pathname+(qs?'?'+qs:'')+(window.location.hash||''));
  }catch(e){}
}
// ---- link landing: code prefilled, email -> 6-digit code or magic link, no password ----
var SU={email:'',sentAt:0,step:'email'};
function suLandingHTML(k){
  return '<div id="su-landing" class="invite-card" style="margin-bottom:16px;">'
   +'<div class="sh first"><h2>You are invited to EvoAI</h2></div>'
   +'<div class="doc-meta">Your invite code is filled in. Enter your email and we will send you a 6-digit sign-in code. No password needed.</div>'
   +'<div class="input-group" style="margin-top:12px;"><label for="sl-code">Invite code</label><input type="text" id="sl-code" value="'+esc(groupCode(k))+'" autocapitalize="characters" autocomplete="off" maxlength="40"></div>'
   +'<div id="sl-step-email"><div class="input-group"><label for="sl-name">Your name</label><input type="text" id="sl-name" maxlength="80" autocomplete="name"></div>'
   +'<div class="input-group"><label for="sl-email">Email</label><input type="email" id="sl-email" maxlength="120" autocapitalize="none" inputmode="email" autocomplete="email" placeholder="you@email.com"></div>'
   +'<button class="btn btn-primary" style="width:100%;" id="sl-send" type="button" onclick="suSendCode()">Email me a sign-in code</button></div>'
   +'<div id="sl-step-code" style="display:none;"><div class="doc-meta" id="sl-sent-to"></div>'
   +'<div class="input-group" style="margin-top:10px;"><label for="sl-otp">6-digit code</label><input type="text" id="sl-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="123456" style="font-size:22px;letter-spacing:.3em;text-align:center;"></div>'
   +'<button class="btn btn-primary" style="width:100%;" id="sl-verify" type="button" onclick="suVerify()">Verify and join</button>'
   +'<div class="doc-meta" style="margin-top:8px;">Or tap the sign-in link in the same email on this device. <span class="link" onclick="suResend()">Send again</span> / <span class="link" onclick="suBack()">Use another email</span></div></div>'
   +'<div class="doc-meta code-msg" id="sl-msg" role="status" style="margin-top:8px;"></div>'
   +'<div class="doc-meta" style="margin-top:10px;">Already have an account? Sign in below and the code is applied automatically.</div></div>';
}
function applyInviteToAuth(){
  var k=pendingInviteCode();
  if(!k)return;
  try{
    showSignup(true);selectRole('client');setVal('su-code',groupCode(k));
    var pan=document.getElementById('auth-signup-panel');
    if(pan&&!document.getElementById('su-landing')){var d=document.createElement('div');d.innerHTML=suLandingHTML(k);pan.insertBefore(d.firstChild,pan.firstChild);}
    setTimeout(function(){var l=document.getElementById('su-landing');if(l&&l.scrollIntoView)l.scrollIntoView({block:'start'});},60);
    showToast('Invite code added. Enter your email to join.','success');
  }catch(e){}
}
function suSay(t,bad){var m=document.getElementById('sl-msg');if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}
function suOtpMsg(e){
  var m=String((e&&(e.message||e.error_description))||e||'');
  if(/rate limit|too many|over_email_send_rate|429/i.test(m))return 'Too many emails were sent just now. Wait a few minutes and try again, or ask for a new link by text.';
  if(/expired|invalid|token/i.test(m))return 'That code did not work or has expired. Check the 6 digits, or tap Send again.';
  if(/signups not allowed|not allowed/i.test(m))return 'New sign-ups are turned off right now. Ask the person who invited you.';
  return authMsg(e);
}
async function suSendCode(again){
  if(noBackend()){suSay('The cloud connection is not set up in this build.',true);return;}
  var k=suNorm(val('sl-code')),email=again?SU.email:normEmail(val('sl-email')),name=(val('sl-name')||'').trim();
  if(!suValid(k)){suSay('Check the invite code. It has 8 letters and numbers, like ABCD-EFGH.',true);return;}
  if(!validEmail(email)){suSay('Enter a valid email address.',true);return;}
  var wait=60000-(Date.now()-SU.sentAt);
  if(SU.sentAt&&wait>0){suSay('Please wait '+Math.ceil(wait/1000)+' seconds before sending another code.',true);return;}
  try{localStorage.setItem(INVITE_KEY,k);}catch(e){}
  var b=document.getElementById('sl-send');if(b)b.disabled=true;
  suSay('Sending...');
  try{
    var data={pending_invite:k};if(name)data.display_name=name.slice(0,80);
    var r=await sb.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,emailRedirectTo:suLink(k),data:data}});
    if(b)b.disabled=false;
    if(r.error){suSay(suOtpMsg(r.error),true);return;}
    SU.email=email;SU.sentAt=Date.now();SU.step='code';
    showEl('sl-step-email',false);showEl('sl-step-code',true);
    elText('sl-sent-to','We emailed a 6-digit code to '+email+'. It expires in 1 hour.');
    suSay('');var o=document.getElementById('sl-otp');if(o)o.focus();
  }catch(e){if(b)b.disabled=false;suSay(suOtpMsg(e),true);}
}
function suResend(){suSendCode(true);}
function suBack(){SU.step='email';showEl('sl-step-email',true);showEl('sl-step-code',false);suSay('');}
async function suVerify(){
  var t=String(val('sl-otp')||'').replace(/\D/g,'');
  if(t.length!==6){suSay('Enter the 6 digits from the email.',true);return;}
  var b=document.getElementById('sl-verify');if(b)b.disabled=true;
  suSay('Checking...');
  try{
    var r=await sb.auth.verifyOtp({email:SU.email,token:t,type:'email'});
    if(b)b.disabled=false;
    if(r.error){suSay(suOtpMsg(r.error),true);return;}
    var u=r.data&&(r.data.user||(r.data.session&&r.data.session.user));
    SU.justJoined=true;
    if(u)await bootWithUser(u);
  }catch(e){if(b)b.disabled=false;suSay(suOtpMsg(e),true);}
}
function suSuccess(d){
  if(!SU.justJoined)return;SU.justJoined=false;
  var t=inviteDoneText(d)||'Your account is ready.';
  try{sheetOpen({title:'Welcome to EvoAI',html:'<p>'+esc(t)+'</p><p class="doc-meta">Next time just enter your email and we will send a new code. No password to remember.</p>',buttons:[{label:'Get started',cls:'btn-primary',fn:sheetClose}]});}catch(e){}
}
// wrap the existing auto-redeem toast so the joiner also gets a clear success sheet
var _suDone=inviteDoneText;
inviteDoneText=function(d){var t=_suDone(d);if(SU.justJoined&&d)setTimeout(function(){suSuccess(d);},50);return t;};
// ---- redeem while signed in ----
function suAdminBlock(msgId){
  var k=suNorm(val(msgId&&msgId.replace(/-msg$/,'')))||pendingInviteCode(),link=suValid(k)?suLink(k):APP_LINK;
  var t="You're signed in as admin. To test sign-up, open this link in a private tab or on another device.";
  if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t;m.style.color='var(--gold)';}}
  try{sheetOpen({title:'Test sign-up as a new person',html:'<p id="su-admin-msg">'+esc(t)+'</p><div class="invite-code" style="font-size:15px;word-break:break-all;user-select:all;-webkit-user-select:all;">'+esc(link)+'</div><p class="doc-meta">Admin accounts cannot redeem invite codes, and a code cannot be used by the account that made it. Use a different email (for example a +test address) in the private tab.</p>',
    buttons:[{label:'Close',fn:sheetClose},{label:'Copy link',cls:'btn-primary',id:'su-admin-copy',fn:function(){copyText(link,'Link copied');}}]});}catch(e){}
}
async function redeemCodeFrom(inputId,msgId){
  suWrapRpc();
  if(!session)return;
  var say=function(t,bad){if(msgId){var m=document.getElementById(msgId);if(m){m.textContent=t||'';m.style.color=bad?'var(--red,#e07070)':'var(--gold)';}}};
  say('');
  if(viewAsActive()||realAdmin()){suAdminBlock(msgId);return;}
  var k=suNorm(val(inputId));
  if(!k){say('Paste the invite code first.',true);showToast('Paste the invite code first.','error');return;}
  if(!suValid(k)){say(k.length<8?'That looks too short. Codes have 8 letters and numbers, like ABCD-EFGH.':'That code is not complete. Check it and try again.',true);showToast('Check the invite code.','error');return;}
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
var _suErr=inviteErrorText;
inviteErrorText=function(e){
  var m=String((e&&(e.message||e))||'');
  if(/too_many_attempts|rate_limited/.test(m))return 'Too many tries. Wait an hour and try again, or ask for a new code.';
  if(/invalid_or_expired_invite/.test(m))return 'That code did not work. Check the 8 letters and numbers. A code works once and expires after 7 days, so ask for a new one if needed.';
  return _suErr(e);
};
// ---- invite sheet: short code + link, Share via text / Copy link / Send email ----
function inviteShareText(code,email){
  var k=codeKey(code);
  return 'You are invited to EvoAI. Tap to join: '+suLink(k)+'  (invite code '+groupCode(k)+', expires in 7 days)';
}
function inviteMailto(code,email){
  return 'mailto:'+encodeURIComponent(email||'').replace(/%40/g,'@')+'?subject='+encodeURIComponent('Your EvoAI invite')+'&body='+encodeURIComponent(inviteShareText(code,email)+'\n\nOpen the link, enter your email and type the 6-digit code we send you. No password needed.');
}
function suShareText(){
  if(!lastInviteCode)return;var t=inviteShareText(lastInviteCode,lastInviteEmail);
  if(navigator.share){navigator.share({title:'Your EvoAI invite',text:t}).catch(function(e){if(e&&e.name==='AbortError')return;copyText(t,'Invite message copied');});return;}
  try{window.location.href='sms:?&body='+encodeURIComponent(t);}catch(e){copyText(t,'Invite message copied');}
}
function suCopyLink(){if(lastInviteCode)copyText(suLink(codeKey(lastInviteCode)),'Link copied');}
function showInviteResult(opts){
  lastInviteEmail=opts.email||'';
  if(opts.id)saveInviteCode(opts.id,opts.code);
  lastInviteCode=groupCode(codeKey(opts.code));
  elText('invite-title',opts.title);
  elText('invite-client-name',opts.who||'');
  elText('invite-code-text',lastInviteCode);
  elText('invite-expiry','Expires '+fmtDate(String(opts.expires||'').slice(0,10))+' - works once');
  elText('invite-help',opts.help);
  var ml=document.getElementById('invite-mailto');if(ml)ml.href=inviteMailto(opts.code,lastInviteEmail);
  var mod=document.querySelector('#modal-invite .modal');
  if(mod&&!document.getElementById('su-sheet')){
    var d=document.createElement('div');d.id='su-sheet';
    d.innerHTML='<div class="doc-meta" style="margin-top:6px;">Invite link</div><div id="su-link" style="font-size:13px;word-break:break-all;color:var(--gold);user-select:all;-webkit-user-select:all;"></div>'
     +'<div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px;"><button class="btn btn-primary" type="button" id="su-share" onclick="suShareText()">Share via text</button>'
     +'<button class="btn btn-ghost" type="button" id="su-copy" onclick="suCopyLink()">Copy link</button>'
     +'<a class="btn btn-ghost" id="sx-email" href="#" style="text-align:center;">Send email</a></div>'
     +'<div class="doc-meta" id="sx-email-note" style="margin-top:8px;">Send email opens your own mail app with the link ready, so it always arrives. They join by entering their email and a 6-digit code.</div>';
    var ex=document.getElementById('invite-expiry');ex.parentNode.insertBefore(d,ex.nextSibling);
    var old=mod.querySelector('.flex.gap-2.mt-4');if(old){var bs=old.querySelectorAll('button,a'),i;for(i=0;i<bs.length;i++)if(!/Done/.test(bs[i].textContent))bs[i].style.display='none';}
    var dis=mod.querySelectorAll('.disclaimer');for(i=0;i<dis.length;i++)if(/not emailed automatically/.test(dis[i].textContent))dis[i].style.display='none';
  }
  elText('su-link',suLink(codeKey(opts.code)));
  var se=document.getElementById('sx-email');if(se)se.href=inviteMailto(opts.code,lastInviteEmail);
  openModal('modal-invite');
}
// migration_019 returns redeem failures as {error:"..."} (so the rate-limit attempt row is kept). Map that back to a normal error.
function suWrapRpc(){
  try{if(typeof sb==='undefined'||!sb||sb.__suRpc||typeof sb.rpc!=='function')return;
    var o=sb.rpc.bind(sb);sb.__suRpc=1;
    sb.rpc=function(n,a,x){var p=o(n,a,x);if(n!=='redeem_invite')return p;
      return Promise.resolve(p).then(function(r){if(r&&!r.error&&r.data&&typeof r.data==='object'&&r.data.error&&!r.data.kind)return {data:null,error:{code:'P0001',message:String(r.data.error)}};return r;});};
  }catch(e){}
}
window.addEventListener('load',suWrapRpc);
