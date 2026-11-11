// ============ v27 FORM SAFETY: no pull-to-refresh, autosaved drafts, unsaved-changes warning ============
(function(){try{var st=document.createElement('style');st.id='fs-css';
  st.textContent='html,body{overscroll-behavior-y:none;overscroll-behavior-x:none}.modal-overlay,.modal,.main-content,.page,#app-shell,.sheet-ov{overscroll-behavior-y:contain}'
   +'.fs-banner{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--gold,#c9a85c);border-radius:4px;padding:10px 12px;margin:0 0 12px;font-size:14px;color:var(--text,#eee)}'
   +'.trim-sug{margin-top:6px;font-size:15px;color:#F2F0EB}.trim-chip{display:inline-block;margin:4px 6px 0 0;padding:4px 10px;border:1px solid var(--border,#444);border-radius:14px;background:transparent;color:inherit;font-size:15px}.trim-chip.on{border-color:var(--gold,#c9a85c);color:var(--gold,#c9a85c)}';
  document.head.appendChild(st);}catch(e){}})();
var FS={forms:{'modal-add-vehicle':'saveVehicle','modal-service':'saveService','modal-expense':'saveExpense','modal-add-client':'addClient','modal-note':'saveNote','modal-inspection':'saveInspection'},dirty:{},saving:{},snap:{},key:'evo_draft_'};
function fsSub(mid){return mid==='modal-add-vehicle'?(typeof editingVehicleId!=='undefined'&&editingVehicleId?String(editingVehicleId):'new'):'x';}
function fsFields(mid){var m=document.getElementById(mid);if(!m)return [];return Array.prototype.filter.call(m.querySelectorAll('input[id],select[id],textarea[id]'),function(e){return e.type!=='file'&&e.type!=='password'&&e.type!=='hidden';});}
function fsRead(mid){var o={};fsFields(mid).forEach(function(e){o[e.id]=(e.type==='checkbox'||e.type==='radio')?(e.checked?'1':''):e.value;});return o;}
function fsWrite(mid,o){fsFields(mid).forEach(function(e){if(!(e.id in o))return;if(e.type==='checkbox'||e.type==='radio')e.checked=!!o[e.id];else e.value=o[e.id];});}
function fsGet(mid){try{var d=JSON.parse(localStorage.getItem(FS.key+mid)||'null');if(d&&d.sub===fsSub(mid)&&Date.now()-d.t<7*864e5)return d;}catch(e){}return null;}
function fsClear(mid){FS.dirty[mid]=false;try{localStorage.removeItem(FS.key+mid);}catch(e){}var b=document.getElementById('fs-banner-'+mid);if(b)b.remove();}
function fsSave(mid){var cur=fsRead(mid),sn=FS.snap[mid]||{},diff=Object.keys(cur).some(function(k){return cur[k]!==(sn[k]===undefined?'':sn[k]);});
  FS.dirty[mid]=diff;try{if(diff)localStorage.setItem(FS.key+mid,JSON.stringify({sub:fsSub(mid),t:Date.now(),f:cur}));else localStorage.removeItem(FS.key+mid);}catch(e){}}
function fsDiscard(mid){fsWrite(mid,FS.snap[mid]||{});fsClear(mid);try{if(mid==='modal-add-vehicle'&&typeof vinChanged==='function')vinChanged();}catch(e){}showToast('Unsaved details discarded','success');}
function fsOpened(mid){
  var m=document.getElementById(mid);if(!m)return;
  var old=document.getElementById('fs-banner-'+mid);if(old)old.remove();
  FS.snap[mid]=fsRead(mid);FS.dirty[mid]=false;
  if(!m._fsBound){m._fsBound=1;var h=function(e){if(e.target&&e.target.id&&e.target.type!=='file')fsSave(mid);};m.addEventListener('input',h,true);m.addEventListener('change',h,true);}
  var d=fsGet(mid);if(!d)return;
  fsWrite(mid,d.f);FS.dirty[mid]=true;
  var b=document.createElement('div');b.className='fs-banner';b.id='fs-banner-'+mid;b.setAttribute('role','status');
  b.innerHTML='<span>Restored your unsaved details.</span><button type="button" class="btn btn-ghost btn-sm" onclick="fsDiscard(\''+mid+'\')">Discard</button>';
  var hd=m.querySelector('.modal-header');if(hd&&hd.parentNode)hd.parentNode.insertBefore(b,hd.nextSibling);
}
var _fsOpen=openModal,_fsClose=closeModal;
openModal=function(id){_fsOpen(id);if(FS.forms[id])setTimeout(function(){fsOpened(id);},0);};
closeModal=function(id){if(FS.forms[id]){if(FS.saving[id]&&Date.now()-FS.saving[id]<15000)fsClear(id);else FS.dirty[id]=false;FS.saving[id]=0;}_fsClose(id);};
Object.keys(FS.forms).forEach(function(mid){var fn=FS.forms[mid],orig=window[fn];if(typeof orig!=='function')return;
  window[fn]=function(){FS.saving[mid]=Date.now();return orig.apply(this,arguments);};});
function fsAnyDirty(){return Object.keys(FS.dirty).some(function(k){var m=document.getElementById(k);return FS.dirty[k]&&m&&m._open;});}
window.addEventListener('beforeunload',function(e){if(fsAnyDirty()){e.preventDefault();e.returnValue='';return '';}});
window.addEventListener('pagehide',function(){Object.keys(FS.dirty).forEach(function(k){if(FS.dirty[k])fsSave(k);});});

// ============ v27 PHOTO IDENTIFY: small upload (1024px), short timeout, progress text ============
var ID_DIM=1024,ID_BYTES=300*1024,ID_TIMEOUT=30000;
var _fsId=autoIdIdentify;
function idShrinkDataUrl(dataUrl){
  return new Promise(function(res){
    try{var im=new Image();im.onload=function(){
      var w=im.naturalWidth,h=im.naturalHeight,s=Math.min(1,ID_DIM/Math.max(w,h));
      if(s===1&&dataUrl.length*0.75<=ID_BYTES)return res(dataUrl);
      var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
      var x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      var q=0.8,out=c.toDataURL('image/jpeg',q);while(out.length*0.75>ID_BYTES&&q>0.4){q-=0.1;out=c.toDataURL('image/jpeg',q);}res(out);
    };im.onerror=function(){res(dataUrl);};im.src=dataUrl;}catch(e){res(dataUrl);}
  });
}
var ID_STEPS=[[0,'Preparing the photo...'],[1500,'Identifying your vehicle...'],[9000,'Still working - checking the trim and year...'],[20000,'Almost there. You can keep typing; nothing you enter is replaced.']];
autoIdIdentify=function(dataUrl){
  var my=AUTOID.token+1,t0=Date.now();
  ID_STEPS.forEach(function(s){setTimeout(function(){if(AUTOID.busy&&AUTOID.token===my&&s[0]>0)autoIdNote('loading',s[1]);},s[0]);});
  idShrinkDataUrl(dataUrl).then(function(small){
    window.__ID_LAST_BYTES__=Math.round(small.length*0.75);
    _fsId(small);
    // replace the 70 s race with a 30 s budget
    setTimeout(function(){if(AUTOID.busy&&AUTOID.token===my){AUTOID.token++;AUTOID.busy=false;autoIdNote('fail','Auto-identify took too long - enter details manually, or add the VIN for an exact match.');}},ID_TIMEOUT-(Date.now()-t0));
  });
};

// ============ v27 TRIM: VIN beats the photo guess; trim is a suggestion with alternatives ============
var TRIMS={
  'toyota|tacoma':['SR','SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited','Trailhunter'],
  'toyota|tundra':['SR','SR5','Limited','Platinum','1794 Edition','TRD Pro','Capstone'],
  'toyota|4runner':['SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited','Trailhunter','Platinum'],
  'toyota|*':['SR5','TRD Sport','TRD Off-Road','TRD Pro','Limited'],
  'ford|f-150':['XL','XLT','Lariat','King Ranch','Platinum','Limited','Tremor','Raptor'],
  'ford|bronco':['Base','Big Bend','Black Diamond','Outer Banks','Badlands','Wildtrak','Raptor'],
  'chevrolet|silverado 1500':['WT','Custom','LT','RST','LTZ','Trail Boss','ZR2','High Country'],
  'jeep|wrangler':['Sport','Sport S','Sahara','Rubicon','Rubicon 392']
};
function trimNorm(t){return String(t||'').replace(/\bTRD[\s-]*Off[\s-]*Road\b/i,'TRD Off-Road').replace(/\bTRD[\s-]*Pro\b/i,'TRD Pro').replace(/\bTRD[\s-]*Sport\b/i,'TRD Sport').trim();}
function trimOptions(make,model){var a=String(make||'').toLowerCase().trim(),b=String(model||'').toLowerCase().trim();return TRIMS[a+'|'+b]||TRIMS[a+'|*']||[];}
function trimSuggest(src){
  var inp=document.getElementById('v-trim');if(!inp)return;
  var box=document.getElementById('trim-sug');if(!box){box=document.createElement('div');box.id='trim-sug';box.className='trim-sug';inp.parentNode.appendChild(box);}
  var cur=val('v-trim').trim(),opts=trimOptions(val('v-make'),val('v-model'));
  if(!cur&&!opts.length){box.innerHTML='';return;}
  if(cur&&opts.indexOf(cur)<0)opts=[cur].concat(opts);
  box.innerHTML=(cur?'Trim '+(src==='vin'?'from VIN':(src==='photo'?'suggested from photo':''))+' - tap to change:':'Pick a trim:')+'<br>'+opts.map(function(o){return '<button type="button" class="trim-chip'+(o===cur?' on':'')+'" onclick="trimPick(this)" data-t="'+esc(o)+'">'+esc(o)+'</button>';}).join('');
  box.dataset.src=src||'';
  if(cur&&(src==='vin'||src==='photo')){var dt=inp.closest&&inp.closest('details');if(dt)dt.open=true;}
}
function trimPick(b){setVal('v-trim',b.getAttribute('data-t'));try{if(AUTOID.filled['v-trim']){delete AUTOID.filled['v-trim'];var tg=document.querySelector('#modal-add-vehicle .ai-tag[data-for="v-trim"]');if(tg)tg.remove();}}catch(e){}trimSuggest('user');var m=document.getElementById('modal-add-vehicle');if(m)m.dispatchEvent(new Event('input'));try{fsSave('modal-add-vehicle');}catch(e){}}
var _fsVp=vinParse;
vinParse=function(row){var o=_fsVp(row);if(o&&o.trim)o.trim=trimNorm(o.trim);return o;};
var _fsVd=vinFormDecode;
vinFormDecode=async function(){
  // fields the photo AI filled are guesses: let the VIN replace them without a conflict question
  try{var vin=cleanVin();if(vinOk(vin)&&!vinFormReplica()){var o=await vinFetch(vin);if(o&&cleanVin()===vin){['v-year','v-make','v-model','v-trim'].forEach(function(id){if(AUTOID.filled[id]){setVal(id,'');delete AUTOID.filled[id];var tg=document.querySelector('#modal-add-vehicle .ai-tag[data-for="'+id+'"]');if(tg)tg.remove();}});}}}catch(e){}
  await _fsVd();
  if(VIN.form&&VIN.form.o)trimSuggest('vin');else trimSuggest(AUTOID.filled['v-trim']?'photo':'');
};
var _fsAs=autoIdSuccess;
autoIdSuccess=function(my,data){
  if(data&&data.trim)data.trim=trimNorm(data.trim);
  // a decoded VIN already filled trim/model: do not let the photo override (fields are only filled when empty anyway)
  _fsAs(my,data);trimSuggest(AUTOID.filled['v-trim']?'photo':'');
};
