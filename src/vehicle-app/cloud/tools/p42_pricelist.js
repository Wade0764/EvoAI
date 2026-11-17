// Tech price list and client service requests. No in-app payment.
var PL={mode:'empty',website:'',pay:'',attest:false,draft:[],live:[],publishedAt:null,tech:null,menu:[],scope:{all:true,vehicle_ids:[]},picked:{},service:null,sent:null,diff:[]};
function plMoney(s){
  if(!s||s.price_mode==='on_request'||s.amount==null||s.amount==='')return 'On request';
  var n=Number(s.amount),t=(n%1)?n.toFixed(2):String(Math.round(n));
  return (s.price_mode==='from'?'from $':'$')+t;
}
function plFound(url){
  try{var u=new URL(url);return 'Found on '+u.host+u.pathname;}catch(e){return 'Found on your site';}
}
function plRule(){return '<div class="pl-rule"><i></i><b></b><i></i></div>';}
function plHead(eye,title,sub){return '<div class="pl-eye">'+esc(eye)+'</div><h2 class="pl-title">'+esc(title)+'</h2>'+plRule()+(sub?'<p class="pl-sub">'+esc(sub)+'</p>':'');}
function plBtn(cls,label,fn){return '<button type="button" class="'+cls+'" onclick="'+fn+'">'+esc(label)+'</button>';}
function plGroup(rows){
  var order=[],map={};
  (rows||[]).forEach(function(s){var c=s.category||'Services';if(!map[c]){map[c]=[];order.push(c);}map[c].push(s);});
  return order.map(function(c){return '<div class="pl-cat">'+esc(c)+'</div>'+map[c].map(plRow).join('');}).join('');
}
function plRow(s){
  var i=PL.draft.indexOf(s);
  var flag=s.needs_review?' <span class="pl-flag">Please check</span>':'';
  var meta=[s.duration_label,s.source_url?plFound(s.source_url):''].filter(Boolean).join(' - ');
  var edit=(PL.mode==='review'&&i>=0)?'<div class="pl-acts"><button type="button" onclick="plEdit('+i+')">Edit</button><button type="button" onclick="plRemove('+i+')">Remove</button></div>':'';
  return '<article class="pl-svc"><div class="pl-top"><div class="pl-name">'+esc(s.name)+'</div><div class="pl-price">'+esc(plMoney(s))+'</div></div>'+
    (s.description?'<div class="pl-desc">'+esc(s.description)+'</div>':'')+
    '<div class="pl-meta">'+esc(meta)+flag+'</div>'+edit+'</article>';
}
function plScreen(){
  var el=document.getElementById('pl-screen');
  if(!el){el=document.createElement('div');el.id='pl-screen';el.className='pl-screen';document.body.appendChild(el);}
  return el;
}
function plClose(){var el=document.getElementById('pl-screen');if(el)el.remove();}
function plOpen(mode){
  if(mode)PL.mode=mode;
  closeModal('modal-account');
  plRender();
}
function plRender(){
  var el=plScreen(),html='<div class="pl-bar">EVOAI</div><div class="pl-body">';
  html+='<button type="button" class="pl-back" onclick="plClose()">Back</button>';
  if(PL.mode==='empty')html+=plEmpty();
  else if(PL.mode==='review')html+=plReview();
  else if(PL.mode==='published')html+=plPublished();
  else if(PL.mode==='refresh')html+=plRefresh();
  else if(PL.mode==='menu')html+=plMenu();
  else if(PL.mode==='request')html+=plRequest();
  else if(PL.mode==='sent')html+=plSent();
  html+='</div>';
  el.innerHTML=html;
}
function plEmpty(){
  var name=(session&&session.account&&session.account.name)||'Your profile';
  return plHead('Account',name,'Advisor / Tech')+
    '<div class="sh"><h2>My website &amp; price list</h2></div>'+
    '<p class="pl-lead">Clients see a services menu only after you publish. A draft stays on your profile.</p>'+
    '<label class="pl-lab" for="pl-web">Business website</label><input id="pl-web" class="pl-in" placeholder="Paste your website address" value="'+esc(PL.website)+'" oninput="PL.website=this.value">'+
    '<label class="pl-check"><input type="checkbox" '+(PL.attest?'checked':'')+' onchange="PL.attest=this.checked"> I own this website, or I am allowed to use its wording and prices.</label>'+
    '<label class="pl-lab" for="pl-pay">Pay / book on my site <span style="color:#E2C58E">Optional</span></label><input id="pl-pay" class="pl-in" placeholder="Paste a pay or booking page" value="'+esc(PL.pay)+'" oninput="PL.pay=this.value">'+
    '<p class="pl-help">Opens your own page in the browser. Shown on your profile as your site. EvoAI does not take payment.</p>'+
    plBtn('btn btn-primary','Draft my price list with AI','plDraft()')+
    '<div class="pl-note" style="margin-top:12px;border:1px solid rgba(201,170,107,.35);border-radius:14px;padding:12px">No services yet. The draft is for you to edit. Clients see nothing until you publish.</div>';
}
function plReview(){
  return plHead('Price list','Review draft','From your website - private until you publish')+
    plGroup(PL.draft)+
    '<button type="button" class="pl-add" onclick="plAdd()">+ Add a service</button>'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Publish to my clients','plPublish()')+
    '<p class="pl-note">Nothing is visible to clients until you publish.</p></div>';
}
function plPublished(){
  var when=PL.publishedAt?fmtDate(String(PL.publishedAt).slice(0,10)):'';
  var host='';
  try{host=new URL(PL.website).host;}catch(e){host=PL.website;}
  var pay='';
  try{pay=PL.pay?new URL(PL.pay).host+new URL(PL.pay).pathname:'';}catch(e2){pay=PL.pay;}
  return plHead('Price list','Published','Clients with access can open this menu')+
    '<div class="pl-row"><b>Last updated</b><span>'+esc(when)+'</span></div>'+
    '<div class="pl-row"><b>'+esc(host)+'</b><span>Your website</span></div>'+
    (pay?'<div class="pl-row"><b>'+esc(pay)+'</b><span>Pay / book - your site</span></div><p class="pl-help">The pay link opens your own page, outside EvoAI. Nothing is charged in the app.</p>':'')+
    plGroup(PL.live)+
    '<p class="pl-help">Reads your site again and opens a draft. It does not change the live menu.</p>'+
    plBtn('btn','Refresh from website','plRunRefresh()');
}
function plRefresh(){
  var rows=(PL.diff||[]).map(function(d){
    if(d.kind==='price')return '<article class="pl-svc"><div class="pl-meta">PRICE CHANGE</div><div class="pl-name">'+esc(d.name)+'</div><div class="pl-desc">'+esc(d.from)+' published <span style="color:#C9AA6B">-&gt;</span> <b style="color:#E2C58E">'+esc(d.to)+' on your site</b></div><div class="pl-meta">'+esc(d.meta||'')+'</div></article>';
    return '<article class="pl-svc"><div class="pl-meta">NEW SERVICE <span class="pl-flag">Please check</span></div><div class="pl-top"><div class="pl-name">'+esc(d.name)+'</div><div class="pl-price">'+esc(d.price)+'</div></div><div class="pl-desc">'+esc(d.description||'')+'</div><div class="pl-meta">'+esc(d.meta||'')+'</div></article>';
  }).join('');
  return plHead('Price list','Changes to approve','Your published menu is unchanged')+
    '<div class="pl-row"><b>Still live</b><span>'+esc(PL.publishedAt?fmtDate(String(PL.publishedAt).slice(0,10)):'')+'</span></div>'+rows+
    '<p class="pl-lead">The other published services match the site.</p>'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Publish these changes','plPublish()')+
    '<div style="height:8px"></div>'+plBtn('btn','Keep current list','plKeep()')+
    '<p class="pl-note">Clients still see the current menu until you publish.</p></div>';
}
function plMenu(){
  var tech=PL.tech||{};
  var pay=tech.pay_url||'';
  var host='';
  try{if(pay){var u=new URL(pay);host=u.host+u.pathname;}}catch(e){host=pay;}
  var picked=PL.service;
  return plHead('Your team',tech.business_name||tech.name||'Your tech',(tech.name||'')+' - Detailer')+
    '<p class="pl-lead">Prices are as listed by '+(esc(tech.business_name||tech.name||'your tech'))+'. Each one is an estimate until they confirm.</p>'+
    (pay?'<a class="pl-ext" href="'+esc(pay)+'" target="_blank" rel="noopener noreferrer"><span><b>Pay / book on their site</b><div class="pl-meta">'+esc(host)+' - Leaves EvoAI. This is their own site.</div></span><i>OPEN</i></a>':'')+
    '<div class="sh"><h2>Services &amp; prices</h2></div>'+
    (PL.menu||[]).map(function(s){
      var on=picked&&picked.id===s.id;
      var body='<div class="pl-top"><div class="pl-name">'+esc(s.name)+'</div><div class="pl-price">'+esc(plMoney(s))+'</div></div>'+
        (s.description?'<div class="pl-desc">'+esc(s.description)+'</div>':'')+
        '<div class="pl-meta">Listed estimate'+(s.duration_label?' - '+esc(s.duration_label):'')+'</div>'+
        (on?plBtn('btn btn-primary','Request this service','plAsk()'):'');
      return on?'<div class="pl-pick">'+body+'</div>':'<article class="pl-svc" onclick="plPickSvc(\''+jsId(s.id)+'\')">'+body+'</article>';
    }).join('');
}
function plRequest(){
  var s=PL.service||{};
  var cars=plCars();
  return plHead('Request','Request this service','')+
    '<div class="pl-sub" style="margin-top:0">'+esc(s.name||'')+'</div>'+
    '<p class="pl-meta" style="text-align:center">Listed '+esc(plMoney(s))+' - an estimate until they confirm</p>'+
    '<label class="pl-lab">Which vehicles</label>'+
    cars.map(function(v){
      var on=!!PL.picked[v.id];
      var note=v.share==='granted'?'On their access':'Shared for this request only. Standing access stays as it is.';
      return '<button type="button" class="pl-car'+(on?' on':'')+'" onclick="plToggleCar(\''+jsId(v.id)+'\')"><span><strong>'+esc((v.year?v.year+' ':'')+(v.make||'')+' '+(v.model||''))+'</strong><em>'+esc(v.plate||'')+'</em><div>'+esc(note)+'</div></span></button>';
    }).join('')+
    '<p class="pl-help">Choose cars they may already see, or share another car with this request only.</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="pl-lab" for="pl-from">From</label><input id="pl-from" class="pl-in" type="date"></div><div><label class="pl-lab" for="pl-to">To</label><input id="pl-to" class="pl-in" type="date"></div></div>'+
    '<label class="pl-lab" for="pl-note">Note <span style="color:#E2C58E">Optional</span></label><input id="pl-note" class="pl-in" maxlength="1000">'+
    '<label class="pl-lab">Photos <span style="color:#E2C58E">Optional</span></label><input id="pl-photo" class="pl-in" type="file" accept="image/*">'+
    '<div class="pl-dock">'+plBtn('btn btn-primary','Send request','plSend()')+'</div>';
}
function plSent(){
  var s=PL.sent||{};
  return plHead('Client request','Request sent','This went to '+(s.tech||'your tech'))+
    '<div class="pl-sum"><div><dt>Service</dt><dd>'+esc(s.service||'')+'</dd></div><div><dt>Listed price</dt><dd>'+esc(s.price||'')+' - estimate</dd></div><div><dt>Vehicles</dt><dd>'+esc(s.vehicles||'')+'</dd></div><div><dt>Window</dt><dd>'+esc(s.window||'')+'</dd></div><div><dt>Sent to</dt><dd>'+esc(s.tech||'')+' - Client Request</dd></div></div>'+
    '<p class="pl-lead">They will confirm a time or send an estimate. You are not charged in EvoAI. A pay link, if they show one, opens their own site.</p>';
}
function plCars(){
  var oid=typeof ownerClientId==='function'?ownerClientId():null;
  var cars=(typeof getVehicles==='function'?getVehicles():[]).filter(function(v){return !oid||v.clientId===oid;});
  var all=PL.scope&&PL.scope.all;
  var ids=PL.scope&&PL.scope.vehicle_ids||[];
  return cars.map(function(v){
    var granted=all||ids.indexOf(v.id)>=0;
    return {id:v.id,year:v.year,make:v.make,model:v.model,plate:v.plate,share:granted?'granted':'request_only'};
  });
}
function plPickSvc(id){PL.service=(PL.menu||[]).filter(function(s){return s.id===id;})[0]||null;plRender();}
function plAsk(){PL.mode='request';plRender();}
function plToggleCar(id){PL.picked[id]=!PL.picked[id];plRender();}
function plEdit(i){
  var s=PL.draft[i];if(!s)return;
  var name=prompt('Service name',s.name);if(name==null)return;
  var price=prompt('Price, from price, or On request',plMoney(s));if(price==null)return;
  s.name=name.trim()||s.name;
  if(/on request/i.test(price)){s.price_mode='on_request';s.amount=null;}
  else if(/^from/i.test(price)){s.price_mode='from';s.amount=Number(price.replace(/[^0-9.]/g,''));}
  else {s.price_mode='fixed';s.amount=Number(price.replace(/[^0-9.]/g,''));}
  plRender();
}
function plRemove(i){PL.draft.splice(i,1);plRender();}
function plAdd(){PL.draft.push({category:'Services',name:'New service',description:'',price_mode:'on_request',amount:null,needs_review:true,source_url:PL.website});plRender();}
async function plDraft(){
  PL.website=(document.getElementById('pl-web')||{}).value||PL.website;
  PL.pay=(document.getElementById('pl-pay')||{}).value||PL.pay;
  PL.attest=!!(document.querySelector('#pl-screen input[type=checkbox]')||{}).checked;
  if(!PL.attest){showToast('Confirm you may use this website','error');return;}
  if(!safeHttps(PL.website)){showToast('Paste an https website','error');return;}
  try{await sb.rpc('save_price_draft',{p_website:PL.website,p_pay:PL.pay||'',p_attest:true,p_services:null});}catch(e){}
  var inv=await sb.functions.invoke('draft-price-list',{body:{url:PL.website,attest:true,fixture:!!window.__PL_OFFLINE__}});
  if(inv.error||!inv.data||!inv.data.services){showToast('Drafting from your site is not switched on yet','error');return;}
  PL.draft=inv.data.services;PL.mode='review';plRender();
}
async function plPublish(){
  try{
    await sb.rpc('save_price_draft',{p_website:PL.website,p_pay:PL.pay||'',p_attest:true,p_services:PL.draft});
    var r=await sb.rpc('publish_price_list');
    if(r.error){showToast(rqMissing(r.error)?'Price lists are not switched on yet':'Could not publish','error');return;}
    plApplyMine(r.data);PL.mode='published';plRender();showToast('Published to your clients');
  }catch(e){showToast('Could not publish','error');}
}
async function plRunRefresh(){
  var inv=await sb.functions.invoke('draft-price-list',{body:{url:PL.website,attest:true,fixture:!!window.__PL_OFFLINE__}});
  if(inv.error||!inv.data){showToast('Drafting from your site is not switched on yet','error');return;}
  PL.diff=plDiff(PL.live,inv.data.services||[]);
  PL.draft=inv.data.services||[];
  PL.mode='refresh';plRender();
}
function plDiff(live,draft){
  var out=[],by={};
  (live||[]).forEach(function(s){by[s.name]=s;});
  (draft||[]).forEach(function(s){
    var old=by[s.name];
    if(!old)out.push({kind:'new',name:s.name,price:plMoney(s),description:s.description,meta:plFound(s.source_url)});
    else if(Number(old.amount)!==Number(s.amount)||old.price_mode!==s.price_mode)out.push({kind:'price',name:s.name,from:plMoney(old),to:plMoney(s),meta:plFound(s.source_url)});
  });
  return out;
}
async function plKeep(){
  var r=await sb.rpc('keep_price_list');
  if(r&&r.data)plApplyMine(r.data);
  PL.mode='published';plRender();
}
function plApplyMine(data){
  if(!data)return;
  var list=data.list||{};
  PL.website=list.website_url||PL.website;
  PL.pay=list.pay_url||'';
  PL.attest=!!list.attested_at;
  PL.publishedAt=list.published_at||null;
  PL.draft=data.draft||[];
  PL.live=data.live||[];
}
async function plOpenMenu(techId){
  PL.tech={id:techId};
  var menu=await sb.rpc('get_tech_menu',{p_tech:techId});
  var scope=await sb.rpc('list_tech_scope',{p_tech:techId});
  if(menu&&menu.data){
    PL.tech.name=menu.data.name;PL.tech.business_name=menu.data.business_name;PL.tech.pay_url=menu.data.pay_url;
    PL.menu=menu.data.services||[];
  }
  if(scope&&scope.data)PL.scope=scope.data;
  if(PL.menu[0])PL.service=PL.menu[PL.menu.length-1];
  PL.mode='menu';plRender();
}
async function plSend(){
  var ids=Object.keys(PL.picked).filter(function(id){return PL.picked[id];});
  if(!ids.length){showToast('Choose a vehicle','error');return;}
  if(!PL.service){showToast('Choose a service','error');return;}
  var start=(document.getElementById('pl-from')||{}).value||null;
  var end=(document.getElementById('pl-to')||{}).value||null;
  var note=(document.getElementById('pl-note')||{}).value||'';
  var r=await sb.rpc('submit_service_request',{p_tech:PL.tech.id,p_service:PL.service.id,p_vehicles:ids,p_start:start,p_end:end,p_note:note});
  if(r.error){showToast(rqMissing(r.error)?'Requests are not switched on yet':'Could not send the request','error');return;}
  var names=plCars().filter(function(c){return PL.picked[c.id];}).map(function(c){return c.model;}).join(', ');
  PL.sent={service:PL.service.name,price:plMoney(PL.service),vehicles:names,window:(start||'')+(end?' - '+end:''),tech:(PL.tech.business_name||PL.tech.name||'your tech')};
  PL.mode='sent';plRender();
  if(typeof p40Load==='function')p40Load(true);
}
function plMountAccount(){
  if(typeof isAdvisor!=='function'||!isAdvisor())return;
  var box=document.querySelector('#modal-account .modal');if(!box||document.getElementById('pl-entry'))return;
  var host=document.createElement('div');host.id='pl-entry';
  host.innerHTML='<div class="sh"><h2>My website &amp; price list</h2></div><p class="pl-lead">Clients see a services menu only after you publish.</p>'+plBtn('btn btn-primary','Open my price list','plOpen(\'empty\')');
  var anchor=document.getElementById('acct-role');
  if(anchor&&anchor.parentNode)anchor.parentNode.insertAdjacentElement('afterend',host);
  else box.appendChild(host);
}
function plTeamButtons(){
  [].slice.call(document.querySelectorAll('.team-card')).forEach(function(card){
    if(card.querySelector('.pl-team'))return;
    var id=card.getAttribute('data-team');if(!id)return;
    var b=document.createElement('button');
    b.type='button';b.className='btn btn-primary pl-team';b.textContent='Services and prices';
    b.onclick=function(){plOpenMenu(id);};
    card.appendChild(b);
  });
}
function plDecorateCard(html,row){
  if(!row||row.request_kind==='estimate'||!row.service_name)return html;
  var cars=(row._cards||[]).map(function(c){
    var tag=c.share==='request_only'?'shared for this request only':'on your access';
    return esc((c.year?c.year+' ':'')+(c.make||'')+' '+(c.model||'')+(c.plate?' - '+c.plate:'')+' - '+tag);
  }).join('<br>');
  var extra='<div class="pl-extra"><div><dt>Service</dt><dd>'+esc(row.service_name)+'</dd></div><div><dt>Listed price</dt><dd>'+esc(row.listed_label||'')+' - your list, an estimate until you confirm</dd></div>'+
    (cars?'<div><dt>Vehicles</dt><dd>'+cars+'</dd></div>':'')+
    (row.preferred_end?'<div><dt>Window</dt><dd>'+esc(fmtDate(row.preferred_date))+' - '+esc(fmtDate(row.preferred_end))+'</dd></div>':'')+
    '<p class="pl-note">Send estimate uses your existing estimate. Accepting does not charge the client.</p>'+
    '<div class="rq-acts"><button type="button" class="btn" onclick="rqOpenEstimate()">Send estimate</button></div></div>';
  return html.replace('<div class="rq-acts">',extra+'<div class="rq-acts">');
}
(function(){
  if(typeof openAccountModal==='function'){
    var prev=openAccountModal;
    openAccountModal=function(){var r=prev.apply(this,arguments);try{plMountAccount();}catch(e){}return r;};
  }
  if(typeof renderAccess==='function'){
    var ra=renderAccess;
    renderAccess=function(){var r=ra.apply(this,arguments);try{plTeamButtons();}catch(e){}return r;};
  }
  if(typeof rqCard==='function'){
    var rc=rqCard;
    rqCard=function(row){return plDecorateCard(rc(row),row);};
  }
})();
