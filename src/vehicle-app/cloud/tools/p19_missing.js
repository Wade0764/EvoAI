// ============ v20: Missing indicators + completeness count on the vehicle page (p19) ============
// Columns: vehicles.plate / plate_region (base schema), vehicles.location / insurance_carrier and
// vehicle_financials.purchase_currency (migration_012, optional). Everything is mirrored in the notes
// extras (pl, plr, loc, insc, cur) so it works without migration_012.
var MS={cols:null,fcur:null};
var MS_CUR={USD:'$',EUR:'\u20ac',GBP:'\u00a3'};
function msColFlag(r){if(r&&Object.prototype.hasOwnProperty.call(r,'location'))MS.cols=true;else if(r&&MS.cols===null)MS.cols=false;}
function msLoad(v,r,x,fin){
  msColFlag(r);x=x||{};
  if(fin&&Object.prototype.hasOwnProperty.call(fin,'purchase_currency'))MS.fcur=true;else if(fin&&MS.fcur===null)MS.fcur=false;
  v.plate=cleanText((r&&r.plate)||x.pl||'',20);
  v.plateRegion=cleanText((r&&r.plate_region)||x.plr||'',30);
  v.location=cleanText((r&&r.location)||x.loc||'',120);
  v.insurer=cleanText((r&&r.insurance_carrier)||x.insc||'',80);
  var c=String((fin&&fin.purchase_currency)||x.cur||'USD').toUpperCase();v.currency=MS_CUR[c]?c:'USD';
}
function msX(v){return {pl:v.plate||'',plr:v.plateRegion||'',loc:v.location||'',insc:v.insurer||'',cur:(v.currency&&v.currency!=='USD')?v.currency:''};}
async function msSyncCols(v){
  if(!v||!v.id)return;
  try{await sb.from('vehicles').update({plate:v.plate||null,plate_region:v.plateRegion||null}).eq('id',v.id);}catch(e){}
  if(MS.cols===true){try{var r=await sb.from('vehicles').update({location:v.location||null,insurance_carrier:v.insurer||null}).eq('id',v.id);
    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))MS.cols=false;}catch(e2){}}
  if(MS.fcur===true&&Number(v.purchasePrice)>0){try{var r2=await sb.from('vehicle_financials').update({purchase_currency:v.currency||'USD'}).eq('vehicle_id',v.id);
    if(r2&&r2.error&&(r2.error.code==='42703'||r2.error.code==='PGRST204'))MS.fcur=false;}catch(e3){}}
}
// --- which fields count. Year/make/model counts as one ("Car").
var MS_FIELDS=[
  {k:'car',label:'Car',input:'v-year'},
  {k:'vin',label:'VIN / Chassis no.',input:'v-vin',more:1},
  {k:'reg',label:'Registration',input:'v-plate',more:1},
  {k:'color',label:'Colour',input:'v-color'},
  {k:'miles',label:'Mileage',input:'v-mileage',more:1},
  {k:'paid',label:'What you paid',input:'v-purchase-price',more:1,fin:1},
  {k:'loc',label:'Location',input:'v-location',more:1},
  {k:'ins',label:'Insurance',input:'v-insurer',more:1}
];
function msMoney(n,cur){var s=MS_CUR[cur]||'$';var x=Math.round(Number(n)*100)/100;return s+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function msValue(v,f){
  switch(f.k){
    case 'car':return (v.year&&v.make&&v.model)?[v.year,v.make,v.model].join(' '):'';
    case 'vin':return v.vin||'';
    case 'reg':return v.plate?(v.plate+(v.plateRegion?' / '+v.plateRegion:'')):'';
    case 'color':return v.color||'';
    case 'miles':return Number(v.mileage)>0?fmtNum(v.mileage)+' mi':'';
    case 'paid':return Number(v.purchasePrice)>0?msMoney(v.purchasePrice,v.currency):'';
    case 'loc':return v.location||'';
    case 'ins':return v.insurer||'';
  }
  return '';
}
// Missing shows only to the person who can edit this car: never to techs (shared), co-owners, archived cars, or exports.
function msCanSeeMissing(v){
  if(!v||isArchivedVehicle(v))return false;
  if(typeof coIsMember==='function'&&coIsMember())return false;
  return !!canEditVehicle(v);
}
function msFieldsFor(v){return MS_FIELDS.filter(function(f){return !f.fin||can(v,'view_purchase_info')||canEditVehicle(v);});}
function msCount(v){var fs=msFieldsFor(v),n=0;fs.forEach(function(f){if(msValue(v,f))n++;});return {done:n,total:fs.length};}
function msCountOn(){try{return localStorage.getItem('evoai_ms_count')!=='0';}catch(e){return true;}}
function msSetCount(on){try{localStorage.setItem('evoai_ms_count',on?'1':'0');}catch(e){}var v=byId(getVehicles(),currentVehicleId);if(v)msRender(v);}
function msHTML(v){
  var edit=msCanSeeMissing(v),fs=msFieldsFor(v),c=msCount(v);
  var rows=fs.map(function(f){
    var x=msValue(v,f),val;
    if(x)val='<span class="ms-val'+(f.k==='vin'?' mono':'')+'">'+esc(x)+'</span>';
    else if(edit)val='<button type="button" class="ms-miss" data-f="'+f.k+'" onclick="msEdit(\''+f.k+'\')" aria-label="'+esc(f.label)+' missing. Tap to add">Missing</button>';
    else val='<span class="ms-val ms-none">Not on file</span>';
    return '<div class="ms-row" data-k="'+f.k+'"><span class="ms-lab">'+esc(f.label)+'</span>'+val+'</div>';
  }).join('');
  var chip=(edit&&msCountOn())?'<button type="button" class="ms-chip'+(c.done===c.total?' ms-full':'')+'" onclick="msFirst()" aria-label="'+c.done+' of '+c.total+' details complete">'+c.done+' of '+c.total+' complete</button>':'';
  var hint=(edit&&c.done<c.total)?'<p class="ms-hint">Tap <b>Missing</b> to fill it in.</p>':'';
  return '<section class="ms-sec" aria-label="Key details">'+(chip?'<div class="ms-top">'+chip+'</div>':'')+'<div class="ms-card">'+rows+'</div>'+hint+'</section>';
}
function msRender(v){var el=document.getElementById('vd-key');if(el)el.innerHTML=v?msHTML(v):'';}
function msFirst(){var b=document.querySelector('#vd-key .ms-miss');if(b){b.scrollIntoView({block:'center',behavior:'smooth'});b.focus();}}
function msEdit(k){
  var v=byId(getVehicles(),currentVehicleId);if(!v||!msCanSeeMissing(v))return;
  var f=MS_FIELDS.filter(function(x){return x.k===k;})[0];if(!f)return;
  editCurrentVehicle();
  var id=f.input;
  if(k==='car'){id=!v.year?'v-year':(!v.make?'v-make':'v-model');}
  if(f.more){var m=document.getElementById('v-more');if(m)m.open=true;}
  setTimeout(function(){var el=document.getElementById(id);if(!el)return;
    var g=el.closest('.input-group')||el;g.classList.add('ms-focus');setTimeout(function(){g.classList.remove('ms-focus');},4000);
    try{el.focus({preventScroll:true});}catch(e){el.focus();}g.scrollIntoView({block:'center'});},250);
}
function msFormFill(v){
  setVal('v-plate',v&&v.plate||'');setVal('v-plate-region',v&&v.plateRegion||'');setVal('v-location',v&&v.location||'');setVal('v-insurer',v&&v.insurer||'');
  setVal('v-currency',v&&v.currency&&MS_CUR[v.currency]?v.currency:'USD');
  document.querySelectorAll('#modal-add-vehicle .ms-focus').forEach(function(e){e.classList.remove('ms-focus');});
}
function msFormRead(){
  var c=String(val('v-currency')||'USD').toUpperCase();
  return {plate:cleanText(val('v-plate'),20).toUpperCase(),plateRegion:cleanText(val('v-plate-region'),30),location:cleanText(val('v-location'),120),insurer:cleanText(val('v-insurer'),80),currency:MS_CUR[c]?c:'USD'};
}
