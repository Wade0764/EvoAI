// v41 (p41): roles, estimates, tech dashboard, worldwide portfolios, vehicle conversation, filtered activity.
// Server rules live in migration_023. Without that migration the new writes say so and the old screens keep working.
var HX={on:null,rows:[]};
var ISO_PAIRS="AF:Afghanistan,AX:\u00c5land Islands,AL:Albania,DZ:Algeria,AS:American Samoa,AD:Andorra,AO:Angola,AI:Anguilla,AQ:Antarctica,AG:Antigua and Barbuda,AR:Argentina,AM:Armenia,AW:Aruba,AU:Australia,AT:Austria,AZ:Azerbaijan,BS:Bahamas,BH:Bahrain,BD:Bangladesh,BB:Barbados,BY:Belarus,BE:Belgium,BZ:Belize,BJ:Benin,BM:Bermuda,BT:Bhutan,BO:Bolivia  Plurinational State of,BQ:Bonaire  Sint Eustatius and Saba,BA:Bosnia and Herzegovina,BW:Botswana,BV:Bouvet Island,BR:Brazil,IO:British Indian Ocean Territory,BN:Brunei Darussalam,BG:Bulgaria,BF:Burkina Faso,BI:Burundi,CV:Cabo Verde,KH:Cambodia,CM:Cameroon,CA:Canada,KY:Cayman Islands,CF:Central African Republic,TD:Chad,CL:Chile,CN:China,CX:Christmas Island,CC:Cocos (Keeling) Islands,CO:Colombia,KM:Comoros,CG:Congo,CD:Congo  Democratic Republic of the,CK:Cook Islands,CR:Costa Rica,CI:C\u00f4te d'Ivoire,HR:Croatia,CU:Cuba,CW:Cura\u00e7ao,CY:Cyprus,CZ:Czechia,DK:Denmark,DJ:Djibouti,DM:Dominica,DO:Dominican Republic,EC:Ecuador,EG:Egypt,SV:El Salvador,GQ:Equatorial Guinea,ER:Eritrea,EE:Estonia,SZ:Eswatini,ET:Ethiopia,FK:Falkland Islands (Malvinas),FO:Faroe Islands,FJ:Fiji,FI:Finland,FR:France,GF:French Guiana,PF:French Polynesia,TF:French Southern Territories,GA:Gabon,GM:Gambia,GE:Georgia,DE:Germany,GH:Ghana,GI:Gibraltar,GR:Greece,GL:Greenland,GD:Grenada,GP:Guadeloupe,GU:Guam,GT:Guatemala,GG:Guernsey,GN:Guinea,GW:Guinea-Bissau,GY:Guyana,HT:Haiti,HM:Heard Island and McDonald Islands,VA:Holy See,HN:Honduras,HK:Hong Kong,HU:Hungary,IS:Iceland,IN:India,ID:Indonesia,IR:Iran  Islamic Republic of,IQ:Iraq,IE:Ireland,IM:Isle of Man,IL:Israel,IT:Italy,JM:Jamaica,JP:Japan,JE:Jersey,JO:Jordan,KZ:Kazakhstan,KE:Kenya,KI:Kiribati,KP:Korea  Democratic People's Republic of,KR:Korea  Republic of,KW:Kuwait,KG:Kyrgyzstan,LA:Lao People's Democratic Republic,LV:Latvia,LB:Lebanon,LS:Lesotho,LR:Liberia,LY:Libya,LI:Liechtenstein,LT:Lithuania,LU:Luxembourg,MO:Macao,MG:Madagascar,MW:Malawi,MY:Malaysia,MV:Maldives,ML:Mali,MT:Malta,MH:Marshall Islands,MQ:Martinique,MR:Mauritania,MU:Mauritius,YT:Mayotte,MX:Mexico,FM:Micronesia  Federated States of,MD:Moldova  Republic of,MC:Monaco,MN:Mongolia,ME:Montenegro,MS:Montserrat,MA:Morocco,MZ:Mozambique,MM:Myanmar,NA:Namibia,NR:Nauru,NP:Nepal,NL:Netherlands  Kingdom of the,NC:New Caledonia,NZ:New Zealand,NI:Nicaragua,NE:Niger,NG:Nigeria,NU:Niue,NF:Norfolk Island,MK:North Macedonia,MP:Northern Mariana Islands,NO:Norway,OM:Oman,PK:Pakistan,PW:Palau,PS:Palestine  State of,PA:Panama,PG:Papua New Guinea,PY:Paraguay,PE:Peru,PH:Philippines,PN:Pitcairn,PL:Poland,PT:Portugal,PR:Puerto Rico,QA:Qatar,RE:R\u00e9union,RO:Romania,RU:Russian Federation,RW:Rwanda,BL:Saint Barth\u00e9lemy,SH:Saint Helena  Ascension and Tristan da Cunha,KN:Saint Kitts and Nevis,LC:Saint Lucia,MF:Saint Martin (French part),PM:Saint Pierre and Miquelon,VC:Saint Vincent and the Grenadines,WS:Samoa,SM:San Marino,ST:Sao Tome and Principe,SA:Saudi Arabia,SN:Senegal,RS:Serbia,SC:Seychelles,SL:Sierra Leone,SG:Singapore,SX:Sint Maarten (Dutch part),SK:Slovakia,SI:Slovenia,SB:Solomon Islands,SO:Somalia,ZA:South Africa,GS:South Georgia and the South Sandwich Islands,SS:South Sudan,ES:Spain,LK:Sri Lanka,SD:Sudan,SR:Suriname,SJ:Svalbard and Jan Mayen,SE:Sweden,CH:Switzerland,SY:Syrian Arab Republic,TW:Taiwan  Province of China,TJ:Tajikistan,TZ:Tanzania  United Republic of,TH:Thailand,TL:Timor-Leste,TG:Togo,TK:Tokelau,TO:Tonga,TT:Trinidad and Tobago,TN:Tunisia,TR:T\u00fcrkiye,TM:Turkmenistan,TC:Turks and Caicos Islands,TV:Tuvalu,UG:Uganda,UA:Ukraine,AE:United Arab Emirates,GB:United Kingdom of Great Britain and Northern Ireland,US:United States of America,UM:United States Minor Outlying Islands,UY:Uruguay,UZ:Uzbekistan,VU:Vanuatu,VE:Venezuela  Bolivarian Republic of,VN:Viet Nam,VG:Virgin Islands (British),VI:Virgin Islands (U.S.),WF:Wallis and Futuna,EH:Western Sahara,YE:Yemen,ZM:Zambia,ZW:Zimbabwe";
function canUploadPhotos(v){
  if(!v||!can(v,'view_photos'))return false;
  var row=C.vis&&C.vis[v.id];
  if(row&&row.can_upload_photos===false)return false;
  return true;
}
function canReviewScan(v){
  if(!v)return false;
  if(canEditVehicle(v)||(typeof realAdmin==='function'&&realAdmin())||(typeof managedMine==='function'&&managedMine(v.clientId)))return true;
  if(!can(v,'can_add_documents'))return false;
  var row=C.vis&&C.vis[v.id];
  if(row&&row.can_scan_documents===false)return false;
  return true;
}
function coRank(){
  if(!session||!isOwner())return '';
  if(!(typeof CO!=='undefined'&&CO.of))return 'primary';
  var me0=myId(),m=(CO.rows||[]).filter(function(x){return x.user_id===me0;})[0];
  return (m&&m.management)||'full';
}
(function(){
  var prev=canEditVehicle;
  canEditVehicle=function(v){
    if(!prev(v))return false;
    if(coRank()==='limited')return false;
    return true;
  };
})();
(function(){
  if(typeof PERM_LABELS==='undefined')return;
  var add=PERM_LABELS.filter(function(g){return g[0]==='add';})[0];
  if(!add)return;
  [['can_upload_photos','Upload photos'],['can_scan_documents','Reviewed document scan'],['can_add_reminders','Add date and mileage reminders'],['can_send_estimates','Send a formal estimate']].forEach(function(p){
    if(!add[2].some(function(x){return x[0]===p[0];}))add[2].push(p);
  });
  var see=PERM_LABELS.filter(function(g){return g[0]==='view';})[0];
  if(see)see[2].forEach(function(x){if(x[0]==='view_photos')x[1]='Photos';});
})();
function invAll(box){
  [].slice.call(document.querySelectorAll('.inv-car')).forEach(function(c){c.checked=false;c.disabled=!!box.checked;});
}
(function(){
  var legacy=createInviteFromAccess;
  createInviteFromAccess=function(){
    var allEl=document.getElementById('inv-all');
    var picked=[].slice.call(document.querySelectorAll('.inv-car:checked')).map(function(x){return x.value;});
    if(!allEl||(!allEl.checked&&!picked.length))return legacy();
    var email=normEmail(val('inv-email'));
    if(!email||!validEmail(email)){showToast('Enter your tech\'s email address','error');return;}
    var all=!!allEl.checked;
    sb.rpc('create_tech_invite',{p_vehicle_ids:all?null:picked,p_all:all,p_email:email,p_perms:null}).then(function(r){
      if(r.error){
        if(typeof rpcMissing==='function'&&rpcMissing(r.error)){showToast('Choosing several vehicles needs one backend update. Use the list above for a single car until then.','error');return;}
        throw r.error;
      }
      var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
      if(!row||!row.code)throw new Error('no code returned');
      saveInviteCode(row.invite_id,row.code);
      showInviteResult({title:'Tech invite code',id:row.invite_id,email:email,code:row.code,expires:row.expires_at,who:all?'Access to all of your vehicles':('Access to '+picked.length+' vehicle'+(picked.length===1?'':'s')),help:'Share this code privately. Coverage is per vehicle and stays with the owner. Advisor access is included. There is no separate technician fee. This app does not set a price.'});
      return loadAll().then(function(){renderAccess();});
    }).catch(function(e){showToast(friendlyError(e),'error');});
  };
  var prevAccess=renderAccess;
  renderAccess=function(){
    prevAccess();
    var sel=document.getElementById('inv-scope');
    if(!sel||document.getElementById('inv-cars'))return;
    var oid=ownerClientId()||myId();
    var cars=(C.vehicles||[]).filter(function(v){return v.clientId===oid&&!v.archived;});
    var box=document.createElement('div');
    box.id='inv-cars';box.className='inv-cars';
    box.innerHTML='<div class="lab">Vehicles this person may open</div>'
      +'<label class="tgl"><input type="checkbox" id="inv-all" onchange="invAll(this)"><span class="tgl-ui"></span><span class="tgl-t">All vehicles</span></label>'
      +cars.map(function(v){return '<label class="tgl"><input type="checkbox" class="inv-car" value="'+esc(v.id)+'"><span class="tgl-ui"></span><span class="tgl-t">'+esc(vFull(v))+'</span></label>';}).join('')
      +'<p class="cov-note" id="cov-note">Coverage is paid per vehicle by the owner, including an advisor you authorize. There is no separate technician fee. EvoAI does not set a price, tax, or reseller split on this screen.</p>';
    sel.parentNode.insertAdjacentElement('afterend', box);
  };
})();
(function(){
  var prevHTML=coSectionHTML;
  coSectionHTML=function(){
    var h=prevHTML();
    if(!h)return h;
    h=h.replace('Co-owners have their own login and the same owner rights over every vehicle in this collection: photos, documents, values, reminders, team and transfers.',
      'Full management can run the collection with you. Only you, the original owner, can invite another co-owner. Limited management can look, comment, and ask a question on an estimate. It cannot change vehicles, permissions, or invites.');
    if(coRank()==='primary'){
      h=h.replace('onclick="coInvite()">Invite co-owner</button>',
        'onclick="coInvite(\'full\')">Invite with full management</button><button class="btn" type="button" id="co-invite-lim" onclick="coInvite(\'limited\')">Invite with limited management</button>');
    } else {
      h=h.replace(/<div class="co-acts"><button class="btn btn-primary" type="button" id="co-invite-btn"[\s\S]*?<\/div>/,'');
    }
    return h;
  };
  coInvite=function(mgmt){
    mgmt=mgmt||'full';
    if(CO.busy)return;
    if(coRank()!=='primary'){showToast('Only the original owner can invite a co-owner.','error');return;}
    if(CO.on===false){showToast('Co-owners need one backend update first.','error');return;}
    CO.busy=true;
    sb.rpc('create_co_owner_invite',{p_email:null,p_management:mgmt}).then(function(r){
      if(r.error){
        if(typeof rpcMissing==='function'&&rpcMissing(r.error)){CO.on=false;CO.busy=false;showToast('Co-owner management needs one backend update first.','error');coRender();return;}
        throw r.error;
      }
      var row=Object.prototype.toString.call(r.data)==='[object Array]'?r.data[0]:r.data;
      if(!row||!row.code)throw new Error('no code returned');
      CO.lastCode=codeKey(row.code);saveInviteCode(row.invite_id,row.code);CO.lastMgmt=mgmt;
      CO.busy=false;coRender();
      var el=document.getElementById('co-code');if(el)el.scrollIntoView({block:'center'});
    }).catch(function(e){CO.busy=false;showToast(friendlyError(e),'error');});
  };
})();
(function(){
  IM_COUNTRIES=[['','No country']].concat(ISO_PAIRS.split(',').map(function(s){var i=s.indexOf(':');return [s.slice(0,i),s.slice(i+1)];}));
  var prev=imRender;
  imRender=function(){
    prev();
    var sel=document.getElementById('im-np-country');
    if(!sel||document.getElementById('pf-world-note'))return;
    sel.insertAdjacentHTML('afterend','<p class="pf-world" id="pf-world-note">A portfolio can sit in any country. Adding one does not move service dates or mileage reminders, and it does not change who can see a car. Saving a named portfolio needs the portfolios update, which is not on the live database yet.</p>');
  };
})();
function rqMoney(r){
  var n=Number(r.price_amount);
  if(!isFinite(n))return '';
  return (r.price_currency?r.price_currency+' ':'')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function rqEstimateCard(r){
  var staff=rqCanStaff(),v=byId(getVehicles(),r.vehicle_id),id=jsId(r.id),dec=r.decision||'pending',done=r.status==='done';
  var when=r.proposed_start?fmtDateTime(r.proposed_start):'Time not set';
  var acts='';
  if(!staff&&!done&&dec!=='approved'&&dec!=='denied'){
    acts='<div class="rq-acts"><button type="button" class="btn btn-primary" onclick="rqDecide(this,\'approved\')">Approve</button><button type="button" class="btn" onclick="rqDecide(this,\'denied\')">Deny</button><button type="button" class="btn" onclick="rqAsk(this)">Ask a question</button></div>';
  } else if(staff&&dec==='approved'&&!done){
    acts='<div class="rq-acts"><button type="button" class="btn btn-primary" onclick="rqCompleteOpen(this)">Mark job complete</button></div>';
  }
  if(RQ.open[r.id]==='ask'){
    acts='<div class="rq-inline"><label class="rq-lab" for="rq-ask-'+id+'">Question</label><textarea id="rq-ask-'+id+'" rows="3" placeholder="Ask in the linked conversation"></textarea><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqDecide(this,\'question\')">Send question</button></div></div>';
  }
  if(RQ.open[r.id]==='done'){
    acts='<div class="rq-inline"><label class="rq-lab" for="rq-note-'+id+'">What was done</label><textarea id="rq-note-'+id+'" rows="3" placeholder="Work completed, no customer personal details"></textarea><label class="rq-lab" for="rq-mi-'+id+'">Mileage now</label><input id="rq-mi-'+id+'" inputmode="numeric" placeholder="Optional"><div class="rq-acts"><button type="button" class="btn" onclick="rqAct(this,\'close\')">Cancel</button><button type="button" class="btn btn-primary" onclick="rqComplete(this)">Archive into the vehicle history</button></div></div>';
  }
  return '<article class="rq-card rq-est" data-id="'+id+'" data-kind="estimate"><div class="rq-kicker">Estimate</div>'
    +'<div class="rq-top"><div class="rq-who">'+(staff?'<div class="rq-cl">'+esc(rqClientName(r.owner_id))+'</div>':'')+'<div class="rq-veh">'+esc(v?(v.nickname||vFull(v)):'Vehicle')+'</div></div><span class="rq-pill">'+esc(done?'Complete':(dec==='approved'?'Approved':dec==='denied'?'Denied':dec==='question'?'Question':'Pending'))+'</span></div>'
    +'<dl class="rq-dl"><div><dt>Work</dt><dd>'+esc(r.work_summary||'')+'</dd></div>'
    +'<div><dt>Price</dt><dd>'+esc(rqMoney(r))+'</dd></div>'
    +'<div><dt>Proposed</dt><dd>'+esc(when)+(r.proposed_tz?' '+esc(r.proposed_tz):'')+'</dd></div>'
    +'<div><dt>Duration</dt><dd>'+esc(r.duration_minutes? (r.duration_minutes+' minutes'):'')+'</dd></div>'
    +(r.completion_note?'<div><dt>Completed</dt><dd>'+esc(r.completion_note)+'</dd></div>':'')
    +'</dl>'+acts+'</article>';
}
(function(){
  var prevCard=rqCard;
  rqCard=function(r){if(r&&r.request_kind==='estimate')return rqEstimateCard(r);return prevCard(r);};
  var prev=renderRequests;
  renderRequests=function(){
    prev();
    var act=document.getElementById('rq-actions');
    if(act&&rqCanStaff()&&!document.getElementById('rq-est-btn')){
      act.insertAdjacentHTML('afterbegin','<button class="btn btn-primary" id="rq-est-btn" type="button" onclick="rqOpenEstimate()">Send an estimate</button>');
    }
  };
})();
function rqZones(){
  var z=['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Rome','Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland'];
  try{var mine=Intl.DateTimeFormat().resolvedOptions().timeZone;if(mine&&z.indexOf(mine)<0)z.unshift(mine);}catch(e){}
  return z;
}
function rqOpenEstimate(){
  if(!rqCanStaff())return;
  var vs=visibleVehicles();
  if(!vs.length){showToast('No authorized vehicles yet.','error');return;}
  var zones=rqZones();
  elHTML('rq-form',
    '<div class="rq-intro">A formal estimate stays on this request. The owner can approve, deny, or ask a question in the linked conversation. No price is suggested.</div>'
    +'<div class="rq-lab">Vehicle</div><select id="rq-ev" class="rq-in">'+vs.map(function(v){return '<option value="'+esc(v.id)+'">'+esc(v.nickname||vFull(v))+'</option>';}).join('')+'</select>'
    +'<label class="rq-lab" for="rq-work">Exact work</label><textarea id="rq-work" rows="4" maxlength="1000" placeholder="What you will do"></textarea>'
    +'<div class="rq-row2"><div class="rq-f"><label class="rq-lab" for="rq-price">Price</label><input id="rq-price" inputmode="decimal" placeholder="Amount"></div><div class="rq-f"><label class="rq-lab" for="rq-cur">Currency</label><input id="rq-cur" maxlength="3" placeholder="USD" value="USD"></div></div>'
    +'<div class="rq-row2"><div class="rq-f"><label class="rq-lab" for="rq-when">Proposed start</label><input id="rq-when" type="datetime-local"></div><div class="rq-f"><label class="rq-lab" for="rq-tz">Timezone</label><select id="rq-tz">'+zones.map(function(z){return '<option>'+esc(z)+'</option>';}).join('')+'</select></div></div>'
    +'<label class="rq-lab" for="rq-dur">Estimated duration in minutes</label><input id="rq-dur" inputmode="numeric" placeholder="120">'
    +'<div class="rq-acts rq-foot"><button type="button" class="btn" onclick="closeModal(\'modal-req\')">Cancel</button><button type="button" class="btn btn-primary" id="rq-est-send" onclick="rqSendEstimate()">Send estimate</button></div>');
  var t=document.getElementById('rq-mt');if(t)t.textContent='Send an estimate';
  openModal('modal-req');
}
async function rqSendEstimate(){
  var btn=document.getElementById('rq-est-send');if(btn&&btn.disabled)return;
  var v=byId(visibleVehicles(),val('rq-ev'));
  var work=String(val('rq-work')||'').trim();
  var price=Number(String(val('rq-price')||'').replace(/,/g,''));
  var cur=String(val('rq-cur')||'').trim().toUpperCase();
  var when=val('rq-when'),tz=val('rq-tz')||'UTC',dur=parseInt(val('rq-dur'),10);
  if(!v){showToast('Choose a vehicle','error');return;}
  if(work.length<3){showToast('Describe the exact work','error');return;}
  if(!isFinite(price)||price<0){showToast('Enter the price you are offering','error');return;}
  if(!/^[A-Z]{3}$/.test(cur)){showToast('Use a 3-letter currency code','error');return;}
  if(!when){showToast('Choose a proposed date and time','error');return;}
  if(!dur||dur<15){showToast('Enter a duration of at least 15 minutes','error');return;}
  var start=new Date(when);
  if(isNaN(start.getTime())){showToast('That date and time is not valid','error');return;}
  var row={id:rqId(),owner_id:v.clientId,vehicle_id:v.id,created_by:rqUid(),assigned_tech:rqUid(),service:'maintenance',request_kind:'estimate',work_summary:work,price_amount:price,price_currency:cur,proposed_start:start.toISOString(),proposed_tz:tz,duration_minutes:dur,decision:'pending',status:'new'};
  if(btn){btn.disabled=true;btn.textContent='Sending';}
  try{
    var r=await sb.from('service_requests').insert(row).select();
    if(r.error||!(r.data&&r.data.length)){showToast(rqMissing(r.error)?'Estimates need one backend update':'Could not send the estimate','error');return;}
    RQ.rows.unshift(r.data[0]);
    closeModal('modal-req');
    showToast('Estimate sent. The owner has an official notice.');
    renderRequests();
  }finally{if(btn){btn.disabled=false;btn.textContent='Send estimate';}}
}
async function rqDecide(btn,decision){
  var card=btn.closest('.rq-card');if(!card)return;
  var id=card.dataset.id;
  if(decision==='question'&&RQ.open[id]!=='ask'){RQ.open[id]='ask';renderRequests();return;}
  var q=decision==='question'?String((document.getElementById('rq-ask-'+id)||{}).value||'').trim():null;
  if(decision==='question'&&!q){showToast('Write the question first','error');return;}
  var r=await sb.rpc('decide_estimate',{p_id:id,p_decision:decision,p_question:q});
  if(r.error){showToast(rqMissing(r.error)?'Decisions need one backend update':friendlyError(r.error),'error');return;}
  var row=byId(RQ.rows,id);
  if(row){row.decision=decision;if(decision==='approved')row.status='accepted';if(decision==='denied')row.status='declined';}
  delete RQ.open[id];
  showToast(decision==='approved'?'Estimate approved':decision==='denied'?'Estimate denied':'Question sent in the conversation');
  renderRequests();
}
function rqAsk(btn){var card=btn.closest('.rq-card');if(!card)return;RQ.open[card.dataset.id]='ask';renderRequests();}
function rqCompleteOpen(btn){var card=btn.closest('.rq-card');if(!card)return;RQ.open[card.dataset.id]='done';renderRequests();}
async function rqComplete(btn){
  var card=btn.closest('.rq-card');if(!card)return;
  var id=card.dataset.id;
  var note=String((document.getElementById('rq-note-'+id)||{}).value||'').trim();
  var mi=String((document.getElementById('rq-mi-'+id)||{}).value||'').trim();
  var mileage=mi?parseInt(mi,10):null;
  if(mi&&(!isFinite(mileage)||mileage<0)){showToast('Mileage must be a number','error');return;}
  if(note.length<3){showToast('Describe what was completed','error');return;}
  var r=await sb.rpc('complete_service_job',{p_id:id,p_note:note,p_mileage:mileage});
  if(r.error){showToast(rqMissing(r.error)?'Completion needs one backend update':friendlyError(r.error),'error');return;}
  var row=byId(RQ.rows,id);
  if(row){row.status='done';row.completion_note=note;row.history_id=r.data&&r.data.history_id;}
  delete RQ.open[id];
  showToast('Job archived into the vehicle history');
  renderRequests();
}
function tdRender(){
  if(!session||!isAdvisor())return;
  var page=document.getElementById('page-dashboard');if(!page)return;
  var host=document.getElementById('td-board');
  if(!host){
    host=document.createElement('section');
    host.id='td-board';host.className='td-board';
    var anchor=document.getElementById('dash-empty')||page.firstChild;
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(host, anchor.nextSibling);
    else page.insertBefore(host, page.firstChild);
  }
  var clients=getClients().filter(function(c){return c&&c.id;});
  var openE=RQ.rows.filter(function(r){return r.request_kind==='estimate'&&r.status!=='done'&&r.decision!=='denied';});
  var h='<div class="td-kicker">Authorized clients</div><h2 class="td-h">Across your clients</h2>';
  if(!clients.length)h+='<p class="td-empty">No clients yet. Invite a client or add one you manage. Each collection stays private from the others.</p>';
  else h+='<div class="td-grid">'+clients.map(function(c){
    var vs=getVehicles().filter(function(v){return v.clientId===c.id&&!isArchivedVehicle(v);});
    var n=openE.filter(function(r){return r.owner_id===c.id;}).length;
    return '<button type="button" class="td-card" onclick="openClientDetail(\''+jsId(c.id)+'\')"><span class="td-name">'+esc(c.name||'Client')+'</span><span class="td-meta">'+vs.length+' vehicle'+(vs.length===1?'':'s')+(n?' / '+n+' open estimate'+(n===1?'':'s'):'')+'</span></button>';
  }).join('')+'</div>';
  host.innerHTML=h;
}
(function(){
  var prev=renderDashboard;
  renderDashboard=function(){prev();tdRender();};
})();
function overviewActivity(owner){
  var cid=ownerClientId();
  var base=auditFor(function(e){
    if(owner)return e.clientId===cid&&e.ownerVisible!==false;
    if(!e.vehicleId)return true;
    var v=byId(getVehicles(),e.vehicleId);
    if(!v)return false;
    return !!(can(v,'view_service_records')||can(v,'view_documents')||can(v,'view_reminders')||can(v,'view_photos')||can(v,'view_expenses'));
  },12);
  var extra=(HX.rows||[]).filter(function(h){
    var v=byId(getVehicles(),h.vehicle_id);if(!v)return false;
    if(owner)return v.clientId===cid;
    if(h.kind==='reminder')return can(v,'view_reminders');
    if(h.kind==='field_change')return can(v,'view_service_records');
    return can(v,'view_service_records')||can(v,'can_add_service');
  }).map(function(h){return {at:h.created_at,actor:'Record',role:'system',text:h.summary,clientId:h.owner_id,vehicleId:h.vehicle_id,ownerVisible:true};});
  return base.concat(extra).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));}).slice(0,8);
}
async function hxLoad(){
  if(!sb||!session||HX.busy)return;
  HX.busy=true;
  try{
    var r=await sb.from('vehicle_history').select('*').order('created_at',{ascending:false}).limit(80);
    if(r.error){HX.on=false;HX.rows=[];}
    else{HX.on=true;HX.rows=r.data||[];}
  }catch(e){HX.on=false;}
  HX.busy=false;
}
(function(){
  var prev=renderOverview;
  renderOverview=function(owner,vehicles){
    prev(owner,vehicles);
    hxLoad();
    tdRender();
  };
})();
function vxRender(vid){
  var v=byId(getVehicles(),vid);if(!v)return;
  var host=document.getElementById('vx-sec');
  if(!host){
    host=document.createElement('section');
    host.id='vx-sec';host.className='dsec vx-sec';
    var doc=document.getElementById('vd-doc');
    if(doc&&doc.parentNode)doc.parentNode.insertBefore(host, doc.nextSibling);
  }
  var rows=(CM.rows||[]).filter(function(c){return c.vehicle_id===vid;});
  host.innerHTML='<div class="sh first"><h2>Conversation</h2></div><p class="vx-lead">Messages linked to this vehicle. They stay with the car, including after a job is archived.</p>'
    +(rows.length?rows.slice(-8).map(function(c){return '<div class="cm-msg"><div class="cm-body">'+esc(c.body)+'</div><div class="cm-meta">'+esc(fmtDateTime(c.created_at))+'</div></div>';}).join(''):'<p class="vx-lead">No messages on this vehicle yet.</p>')
    +'<div class="rq-inline"><label class="rq-lab" for="vx-body">Message</label><textarea id="vx-body" rows="3" placeholder="Write to the people authorized on this vehicle"></textarea><div class="rq-acts"><button type="button" class="btn btn-primary" onclick="vxSend(\''+jsId(vid)+'\')">Send</button></div></div>'
    +'<div class="sh"><h2>Change history</h2></div><div id="vx-hist"></div>';
  var hist=(HX.rows||[]).filter(function(h){return h.vehicle_id===vid;});
  var box=document.getElementById('vx-hist');
  if(box)box.innerHTML=hist.length?hist.slice(0,8).map(function(h){return '<div class="vx-row"><b>'+esc(h.summary)+'</b><span>'+esc(fmtDateTime(h.created_at))+'</span></div>';}).join(''):'<p class="vx-lead">Mileage, reminders, estimates and completed jobs are listed here when the history update is on.</p>';
}
async function vxSend(vid){
  var v=byId(getVehicles(),vid);if(!v)return;
  var t=String((document.getElementById('vx-body')||{}).value||'').trim();
  if(!t){showToast('Write a message first','error');return;}
  if(await cmPost(v.clientId,t,v.id,null))vxRender(vid);
}
(function(){
  var prev=openVehicleDetail;
  openVehicleDetail=function(id){var r=prev(id);vxRender(id);return r;};
})();
