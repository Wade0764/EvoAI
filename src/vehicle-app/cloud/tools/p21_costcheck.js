// ===== v21b: cost basis check ("What you paid" that looks wrong must be confirmed) =====
// Thresholds (USD equivalent; EUR x1.08, GBP x1.27, rough rates for the check only):
//  - 0, under $1,000 or over $20,000,000: always flagged
//  - malformed text on a sheet (two currencies, more than 9 whole digits, broken thousands groups, 3+ decimals): flagged
//  - vs the car's latest AI estimate when there is one: under 25% or over 400% is flagged
//  - otherwise vs a rough typical price for the make (CB_MAKE): under 25% or over 400% is flagged
var CB={min:1000,max:20000000,lo:0.25,hi:4,fx:{USD:1,EUR:1.08,GBP:1.27},formOk:''};
var CB_MAKE={'acura':40000,'alfa romeo':35000,'aston martin':150000,'audi':55000,'austin healey':60000,'bentley':120000,'bmw':55000,'bugatti':2500000,'cadillac':55000,'chevrolet':50000,'datsun':35000,'dodge':45000,'ferrari':300000,'fiat':20000,'ford':45000,'honda':30000,'jaguar':70000,'jeep':45000,'koenigsegg':3000000,'lamborghini':350000,'lancia':60000,'land rover':70000,'lexus':55000,'lotus':80000,'maserati':80000,'mclaren':250000,'mercedes-benz':80000,'mercedes':80000,'mg':25000,'mini':25000,'nissan':35000,'pagani':3000000,'porsche':120000,'range rover':90000,'renault':25000,'rolls-royce':350000,'shelby':150000,'tesla':60000,'toyota':40000,'triumph':25000,'volkswagen':30000,'vw':30000,'volvo':35000};
function cbUsd(v,cur){return Number(v)*(CB.fx[cur]||1);}
function cbMoneyStr(v,cur){var s={USD:'$',EUR:'\u20ac',GBP:'\u00a3'}[cur]||'';return s+Number(v).toLocaleString('en-US',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})+(s?'':' '+cur);}
function cbMalformed(raw){
  raw=String(raw||'').trim();if(!raw)return '';
  var n=0;[/\$|\bUSD\b/i,/\u20ac|\bEUR\b/i,/\u00a3|\bGBP\b/i].forEach(function(re){if(re.test(raw))n++;});
  if(n>1)return 'Two currencies in one amount';
  var d=raw.replace(/[^0-9.,]/g,'');if(!d)return '';
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(d))d=d.replace(/\./g,'').replace(',','.');
  else if(/,/.test(d)&&!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(d))return 'The number looks wrong';
  else d=d.replace(/,/g,'');
  if((d.match(/\./g)||[]).length>1)return 'The number looks wrong';
  var p=d.split('.');if(p[0].replace(/^0+/,'').length>9)return 'Too many digits';
  if(p[1]&&p[1].length>2)return 'Too many digits after the point';
  return '';
}
function cbTypical(make){var m=String(make||'').toLowerCase().replace(/\s+/g,' ').trim();if(CB_MAKE[m])return CB_MAKE[m];for(var k in CB_MAKE)if(CB_MAKE.hasOwnProperty(k)&&m.indexOf(k)===0)return CB_MAKE[k];return null;}
// returns null when fine, else {reason, kind}
function cbCheck(o){
  if(o.amount===null||o.amount===undefined||o.amount==='')return null;
  var a=Number(o.amount),cur=o.cur||'USD';
  var bad=cbMalformed(o.raw);if(bad)return {kind:'malformed',reason:bad};
  if(!isFinite(a))return {kind:'malformed',reason:'The number looks wrong'};
  var u=cbUsd(a,cur);
  if(a<=0)return {kind:'zero',reason:'The amount is 0'};
  if(u<CB.min)return {kind:'low',reason:'Under $1,000. Looks low for this car'};
  if(u>CB.max)return {kind:'high',reason:'Over $20 million. Looks high for this car'};
  var est=o.estimate&&Number(o.estimate)>0?Number(o.estimate):null,src='ai';
  if(!est){est=cbTypical(o.make);src='make';}
  if(est){if(u<est*CB.lo)return {kind:'low',reason:'Looks low for this car',src:src};if(u>est*CB.hi)return {kind:'high',reason:'Looks high for this car',src:src};}
  return null;
}
function cbSig(v,cur){return Number(v)+'|'+(cur||'USD');}
function cbBox(amt,flag,state,acts,ask){
  return '<div class="cb-box'+(state==='ok'?' ok':'')+'" data-cb="'+(state||'need')+'"><div class="cb-amt">'+esc(amt)+'</div>'+
    (state==='ok'?'<div class="cb-ok">\u2713 Confirmed as correct</div>':'<div class="cb-why">'+esc(flag.reason)+'</div><div class="cb-ask">'+(ask||'Please confirm this is what was paid.')+'</div>')+(acts||'')+'</div>';
}
// ---------- import review ----------
var _cbClean=imClean;imClean=function(raw){var o=_cbClean(raw);o.paidRaw=imCell(raw&&raw.paid);return o;};
var _cbRowFields=imRowFields;imRowFields=function(r,ri,res){var f=_cbRowFields(r,ri,res),e=res&&res['cbv'+ri];if(e){f.paid=e.v;f.cur=e.cur;}return f;};
function cbImFlag(ri,f,vid){
  if(!f||!f.paid)return null;var r=IM.rows[ri]||{},m=vid?byId(getVehicles(),vid):null;
  var edited=IM.res&&IM.res['cbv'+ri];
  return cbCheck({amount:f.paid,cur:f.cur,raw:edited?'':r.paidRaw,estimate:m?aiVal(m):null,make:f.make||(m&&m.make)});
}
function cbImHeld(ri,f,vid){var fl=cbImFlag(ri,f,vid);return !!(fl&&IM.res['cbok'+ri]!==cbSig(f.paid,f.cur));}
function cbImRowF(ri){return imRowFields(IM.rows[ri],ri,IM.res);}
function cbImPending(A){var n=0;A.changes.forEach(function(x){if(x.field==='paid'&&(x.forced||IM.appr[x.key]===true)&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid))n++;});A.news.forEach(function(x){if(IM.add[x.key]===true&&cbImHeld(x.ri,x.f,null))n++;});return n;}
function cbImUI(ri,f,vid){
  var fl=cbImFlag(ri,f,vid);if(!fl)return '';
  var amt=cbMoneyStr(f.paid,f.cur);
  if(IM.res['cbok'+ri]===cbSig(f.paid,f.cur))return cbBox(amt,fl,'ok','<div class="im-acts"><button class="im-btn sm line" onclick="cbImUndo('+ri+')">Undo</button><button class="im-btn sm line" onclick="cbImEdit('+ri+')">Edit</button></div>');
  if(IM.cbEdit===ri)return '<div class="cb-box" data-cb="edit"><label class="im-lab" for="cb-in">Correct amount</label><div class="cb-row"><select id="cb-cur" class="im-in" aria-label="Currency">'+['USD','EUR','GBP'].map(function(c){return '<option'+(c===f.cur?' selected':'')+'>'+c+'</option>';}).join('')+'</select><input id="cb-in" class="im-in" inputmode="decimal" value="'+f.paid+'"></div><div class="im-acts"><button class="im-btn sm gold" onclick="cbImEditSave('+ri+')">Save amount</button><button class="im-btn sm line" onclick="IM.cbEdit=null;imRender()">Cancel</button></div></div>';
  return cbBox(amt,fl,'need','<div class="im-acts"><button class="im-btn sm gold" onclick="cbImOk('+ri+')">Yes, this is correct</button><button class="im-btn sm line" onclick="cbImEdit('+ri+')">Edit</button></div>','Saved for confirming later if you do not confirm now.');
}
function cbImOk(ri){var f=cbImRowF(ri);IM.res['cbok'+ri]=cbSig(f.paid,f.cur);imRender();}
function cbImUndo(ri){delete IM.res['cbok'+ri];imRender();}
function cbImEdit(ri){IM.cbEdit=ri;imRender();setTimeout(function(){var e=document.getElementById('cb-in');if(e){e.focus();e.select();}},30);}
function cbImEditSave(ri){
  var e=document.getElementById('cb-in'),c=document.getElementById('cb-cur'),s=String(e?e.value:'').replace(/[^0-9.]/g,''),v=parseFloat(s);
  if(!isFinite(v)||v<0||(s.match(/\./g)||[]).length>1){IM.msg='Enter the amount paid as a number.';imRender();return;}
  IM.msg='';IM.res['cbv'+ri]={v:Math.round(v*100)/100,cur:(c&&c.value)||'USD'};delete IM.res['cbok'+ri];IM.cbEdit=null;imRender();
}
imTabChanges=function(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var pend=A.changes.filter(function(x){return !x.forced&&IM.appr[x.key]!==true;}).length;
  var h='<p class="im-lead">These are cars you already have. Approve the details to update.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imApproveAll()">Approve all '+pend+' change'+(pend===1?'':'s')+'</button>';
  A.changes.forEach(function(x){
    var st=x.forced?'forced':IM.appr[x.key]===true?'yes':IM.appr[x.key]===false?'no':'';
    var cb=x.field==='paid'&&st!=='no'?cbImUI(x.ri,cbImRowF(x.ri),x.vid):'',held=cb&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid);
    h+='<div class="im-item'+(st==='no'?' off':'')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+'</div>'+
      (cb?'<div class="im-pair one"><div><div class="im-cap">Current</div><div class="im-v'+(x.cur?'':' blank')+'">'+(x.cur?imE(x.cur):'Blank')+'</div></div></div><div class="im-cap gold cb-cap">Sheet</div>'+cb:imPair(x.cur,x.val))+
      (st==='forced'?'<div class="im-state">Chosen in Conflicts</div>':st==='yes'?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Approved \u00b7 confirm later':'\u2713 Approved')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':st==='no'?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Approve</button><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>')+'</div>';
  });
  return h;
};
imTabNew=function(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pend=A.news.filter(function(x){return IM.add[x.key]!==true;}).length,pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  var h='<p class="im-lead">These cars are not in your collection yet. They go into '+imE(pf.name)+'.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imAddAll()">Add all '+pend+' car'+(pend===1?'':'s')+'</button>';
  A.news.forEach(function(x){var st=IM.add[x.key],cb=st!==false?cbImUI(x.ri,x.f,null):'',held=cb&&cbImHeld(x.ri,x.f,null),f=x.f;
    if(cb){f=JSON.parse(JSON.stringify(x.f));f.paid=null;}
    h+='<div class="im-item'+(st===false?' off':'')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(f)+(cb?'<div class="im-cap gold cb-cap">What you paid</div>'+cb:'')+
      (st===true?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be added \u00b7 confirm later':'\u2713 Will be added')+'</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':st===false?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',true)">Add</button><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>')+'</div>';});
  return h;
};

// v21c (Wade): flagged costs are NOT blocked. They save as unconfirmed (costOk=false) and keep the red box
// on the vehicle page until the owner/admin confirms or edits them.
var _cbStep3=imStep3;imStep3=function(){
  var h=_cbStep3(),n=cbImPending(imA());
  if(n)h=h.replace('<div class="im-savebar">','<div class="im-savebar"><div class="cb-need-bar" role="status">'+n+' cost'+(n===1?'':'s')+' will be saved for confirming later</div>');
  return h;
};
IM_PROPS.paid=IM_PROPS.paid.concat(['costOk','costFlag']);
var _cbSetProp=imSetProp;imSetProp=function(v,k,raw){_cbSetProp(v,k,raw);if(k==='paid'){v.costOk=!(raw&&raw.cbFlag);v.costFlag=(raw&&raw.cbFlag)||'';}};
var _cbNewV=imNewVehicle;imNewVehicle=function(f,owner,pfId,now){var nv=_cbNewV(f,owner,pfId,now);if(nv){nv.costOk=!(f.paid&&f.cbFlag);nv.costFlag=(f.paid&&f.cbFlag)||'';}return nv;};
function cbImReason(ri,f,vid){var fl=cbImFlag(ri,f,vid);return (fl&&IM.res['cbok'+ri]!==cbSig(f.paid,f.cur))?fl.reason:'';}
var _cbApply=imApply;imApply=function(A,owner,pfId,appr,add){
  var later=0;
  A.changes.forEach(function(x){if(x.field!=='paid')return;var r=cbImReason(x.ri,cbImRowF(x.ri),x.vid);x.raw=JSON.parse(JSON.stringify(x.raw));x.raw.cbFlag=r;if(r&&(x.forced||appr[x.key]===true))later++;});
  A.news.forEach(function(x){var r=cbImReason(x.ri,x.f,null);x.f.cbFlag=r;if(r&&add[x.key]===true)later++;});
  IM.cbLater=later;return _cbApply(A,owner,pfId,appr,add);
};
var _cbSave=imSave;imSave=function(){IM.cbLater=0;_cbSave();if(IM.step===4&&IM.done){IM.done.cbLater=IM.cbLater;imRender();}};
var _cbStep4=imStep4;imStep4=function(){var h=_cbStep4(),d=IM.done;if(d&&!d.undone&&d.cbLater)h=h.replace('<div class="im-kv"><span>Cars updated</span>','<div class="im-kv cb-kv"><span>Costs to confirm</span><b>'+d.cbLater+'</b></div><div class="im-kv"><span>Cars updated</span>');return h;};
// ---------- storage: vehicle_financials.cost_confirmed / cost_flag_reason (migration_015) or notes extras cfc/cfr ----------
CB.fcol=null;
var _cbMsLoad=msLoad;msLoad=function(v,r,x,fin){
  _cbMsLoad(v,r,x,fin);x=x||{};
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'cost_confirmed'))CB.fcol=true;else if(fin&&CB.fcol===null)CB.fcol=false;
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'cost_confirmed')){v.costOk=fin.cost_confirmed!==false;v.costFlag=v.costOk?'':cleanText(fin.cost_flag_reason||x.cfr||'',120);}
  else{v.costOk=x.cfc!=='0';v.costFlag=v.costOk?'':cleanText(x.cfr||'',120);}
};
function cbX(v){var no=v&&v.costOk===false&&Number(v.purchasePrice)>0;return {cfc:no?'0':'',cfr:no?(v.costFlag||''):''};}
var _cbSync=msSyncCols;msSyncCols=async function(v){
  await _cbSync(v);
  if(v&&v.id&&CB.fcol===true&&Number(v.purchasePrice)>0){var no=v.costOk===false;
    try{var r=await sb.from('vehicle_financials').update({cost_confirmed:!no,cost_flag_reason:no?(v.costFlag||null):null}).eq('vehicle_id',v.id);
      if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))CB.fcol=false;}catch(e){}}
};
// ---------- vehicle page: red box until confirmed (owner/admin/client with edit rights; never shared/tech/co-owner views) ----------
function cbCanConfirm(v){return !!(v&&!isArchivedVehicle(v)&&msCanSeeMissing(v)&&(can(v,'view_purchase_info')||canEditVehicle(v)));}
function cbPending(v){return !!(v&&v.costOk===false&&Number(v.purchasePrice)>0);}
var _cbMsRender=msRender;msRender=function(v){
  _cbMsRender(v);
  if(!v||!cbPending(v)||!cbCanConfirm(v))return;
  var row=document.querySelector('#vd-key .ms-row[data-k="paid"]');if(!row)return;
  var d=document.createElement('div');d.className='cb-page';d.id='cb-page';
  d.innerHTML=cbBox(msValue(v,{k:'paid'}),{reason:v.costFlag||'Please check this amount'},'need','<div class="cb-acts"><button type="button" class="btn btn-primary" onclick="cbPageOk()">Yes, this is correct</button><button type="button" class="btn" onclick="cbPageEdit()">Edit</button></div>','Saved, not yet confirmed. Please confirm this is what was paid.');
  row.classList.add('cb-row-flag');row.parentNode.insertBefore(d,row.nextSibling);
};
function cbPageOk(){
  var vehicles=getVehicles(),v=byId(vehicles,currentVehicleId);if(!v||!cbCanConfirm(v))return;
  v.costOk=true;v.costFlag='';v.updatedAt=new Date().toISOString();
  if(!setVehicles(vehicles))return;
  audit('vehicle.updated','What you paid confirmed as correct: '+vName(v),{clientId:v.clientId,vehicleId:v.id});
  showToast('Confirmed','success');msRender(byId(getVehicles(),v.id));
}
function cbPageEdit(){msEdit('paid');}
// ---------- vehicle form: never blocks; saves the flag ----------
function cbFormState(){
  var inp=document.getElementById('v-purchase-price');if(!inp)return null;
  var raw=String(inp.value||'').trim();if(!raw)return null;
  var cur=(document.getElementById('v-currency')||{}).value||'USD',amt=Number(raw);
  var v=editingVehicleId?byId(getVehicles(),editingVehicleId):null,same=v&&Number(v.purchasePrice)===Math.round(amt)&&(v.currency||'USD')===cur;
  var sig=(editingVehicleId||'new')+'|'+cbSig(Math.round(amt),cur);
  if(same)return cbPending(v)?{flag:{reason:v.costFlag||'Please check this amount'},amt:amt,cur:cur,sig:sig,same:true}:null;
  var fl=cbCheck({amount:amt,cur:cur,raw:'',estimate:v?aiVal(v):null,make:val('v-make')});
  return fl?{flag:fl,amt:amt,cur:cur,sig:sig}:null;
}
function cbFormRender(){
  var box=document.getElementById('cb-form'),inp=document.getElementById('v-purchase-price');if(!box)return;var s=cbFormState();
  if(!s){box.style.display='none';box.innerHTML='';if(inp)inp.classList.remove('cb-in-bad');return;}
  var ok=CB.formOk===s.sig;box.style.display='';var dt=box.closest('details');if(dt&&!ok)dt.open=true;
  if(inp)inp.classList.toggle('cb-in-bad',!ok);
  box.innerHTML=cbBox(cbMoneyStr(Math.round(s.amt),s.cur),s.flag,ok?'ok':'need',ok?'':'<div class="cb-acts"><button type="button" class="btn btn-primary" onclick="cbFormOk()">Yes, this is correct</button><button type="button" class="btn" onclick="cbFormEdit()">Edit</button></div>','You can save now. It stays marked until confirmed.');
}
function cbFormOk(){var s=cbFormState();if(s)CB.formOk=s.sig;cbFormRender();}
function cbFormEdit(){var e=document.getElementById('v-purchase-price');if(e){e.focus();try{e.select();}catch(x){}}}
// called from saveVehicle (patched) with the fields about to be saved
function cbFormFields(fields){
  var v=editingVehicleId?byId(getVehicles(),editingVehicleId):null;
  if(!(Number(fields.purchasePrice)>0)){fields.costOk=true;fields.costFlag='';return;}
  var s=cbFormState();
  if(s&&CB.formOk!==s.sig){if(!s.same||!v){fields.costOk=false;fields.costFlag=s.flag.reason;}return;}
  if(s||!v||Number(v.purchasePrice)!==Number(fields.purchasePrice)||(v.currency||'USD')!==(val('v-currency')||'USD')){fields.costOk=true;fields.costFlag='';}
}
document.addEventListener('input',function(e){var t=e.target;if(t&&(t.id==='v-purchase-price'||t.id==='v-currency'||t.id==='v-make'))cbFormRender();});
document.addEventListener('change',function(e){var t=e.target;if(t&&(t.id==='v-currency'))cbFormRender();});
var _cbOpenAdd=openAddVehicleModal;openAddVehicleModal=function(){var r=_cbOpenAdd.apply(this,arguments);CB.formOk='';cbFormRender();return r;};
var _cbOpenEdit=editCurrentVehicle;editCurrentVehicle=function(){var r=_cbOpenEdit.apply(this,arguments);CB.formOk='';cbFormRender();return r;};
