// ===== v21: master sheet import + portfolios (p20). Spreadsheets are read in the browser (SheetJS); text PDFs with pdf.js.
// Gemini is only used (via the import-sheet edge function) for unclear headers and scanned sheets/photos.
// Nothing is written until the owner approves it. Only the simplified fields are read.
// ---------- portfolios (migration 013; falls back to one implicit portfolio) ----------
var PO={on:false,cols:null,rows:[],loaded:false};
async function poLoad(){
  try{var r=await sb.from('portfolios').select('*');
    if(r&&r.error)return null;
    return (r&&r.data)||[];}catch(e){return null;}
}
function poSet(rows){PO.loaded=Array.isArray(rows);PO.rows=PO.loaded?rows:[];PO.cols=null;poOnCalc();}
function poOnCalc(){PO.on=!!(PO.loaded&&(PO.rows.length>0||PO.cols===true));}
function poColFlag(r){if(r&&typeof r==='object'){if(Object.prototype.hasOwnProperty.call(r,'portfolio_id'))PO.cols=true;else if(PO.cols===null)PO.cols=false;}poOnCalc();}
function poApplyRow(v,r){poColFlag(r);v.portfolioId=(r&&r.portfolio_id)||null;}
function poList(owner){
  if(PO.on){
    var l=PO.rows.filter(function(p){return p.owner_id===owner;}).map(function(p){return {id:p.id,name:p.name,country:p.country||'',currency:p.currency||'USD',isDefault:!!p.is_default,sort:p.sort_order||0};});
    l.sort(function(a,b){return (b.isDefault-a.isDefault)||(a.sort-b.sort)||String(a.name).localeCompare(String(b.name));});
    if(l.length)return l;
  }
  return [{id:null,name:'My collection',country:'',currency:'USD',isDefault:true,implicit:true}];
}
function poDefault(owner){var l=poList(owner);return l[0];}
function poOf(v,owner){var l=poList(owner||v.clientId);if(!PO.on||!v.portfolioId)return l[0];for(var i=0;i<l.length;i++)if(l[i].id===v.portfolioId)return l[i];return l[0];}
function poCount(owner,p){return getVehicles().filter(function(v){return v.clientId===owner&&!isArchivedVehicle(v)&&(poOf(v,owner).id===p.id);}).length;}
async function poCreate(owner,name,country,currency){
  if(!PO.on)throw new Error('Portfolios are not turned on yet.');
  var row={id:uid(),owner_id:owner,name:cleanText(name,80),country:country||null,currency:currency||'USD',sort_order:PO.rows.filter(function(p){return p.owner_id===owner;}).length,is_default:false};
  var r=await sb.from('portfolios').insert(row);
  if(r&&r.error)throw new Error((r.error&&r.error.message)||'Could not create the portfolio.');
  row.created_at=new Date().toISOString();PO.rows.push(row);return row.id;
}
function poFlag(c){c=String(c||'').toUpperCase();if(!/^[A-Z]{2}$/.test(c))return '';return String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65,0x1F1E6+c.charCodeAt(1)-65);}
// ---------- constants ----------
var IM={step:0,busy:false,msg:'',owner:null,file:null,rows:[],pfId:null,newPf:null,res:{},appr:{},add:{},tab:'changes',done:null,id:''};
var IM_SHEETJS='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
var IM_SHEETJS_SRI='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
var IM_CUR={USD:'$',EUR:'\u20ac',GBP:'\u00a3'};
var IM_LABEL={year:'Year',make:'Make',model:'Model',vin:'VIN / chassis',reg:'Registration',color:'Colour',miles:'Mileage',paid:'What you paid',loc:'Location',ins:'Insurance'};
var IM_ORDER=['year','make','model','vin','reg','color','miles','paid','loc','ins'];
var IM_DAY_CAP=5;
// ---------- header mapping ----------
function imNorm(s){return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function imHeaderField(h){
  var s=imNorm(h);if(!s)return '';
  if(/\b(cost|paid|purchase|basis)\b/.test(s)&&!/\bestimat/.test(s))return 'paid';
  if(/\b(check|expiry|expires|expiration|renewal|renew|estimated|est|value|nickname|owner|date|notes?|remarks?|condition|drivetrain|policy no)\b/.test(s)&&!/\binsurance\b/.test(s))return '';
  if(/^(model )?year$|^yr$|^year built$/.test(s))return 'year';
  if(/^(make|manufacturer|marque|brand)$/.test(s))return 'make';
  if(/^model\b|^description$|^item description$/.test(s))return 'model';
  if(/\b(vin|chassis|serial|frame)\b/.test(s))return 'vin';
  if(/\b(registration|plate|licen[cs]e|reg|rego)\b/.test(s))return 'reg';
  if(/\bcolou?r\b/.test(s))return 'color';
  if(/\b(mileage|odometer|miles|kilometres|kilometers|km)\b/.test(s))return 'miles';
  if(/\b(location|garage|stored|storage|kept)\b/.test(s))return 'loc';
  if(/\b(insurance|insurer|carrier)\b/.test(s))return 'ins';
  if(/^(no|#|item|row|id)$/.test(s)||s==='')return '';
  return null; // unknown
}
function imMapHeaders(hdr){var m={},unk=[];hdr.forEach(function(h,i){var f=imHeaderField(h);if(f===null){if(String(h||'').trim())unk.push(i);return;}if(f&&!(f in m))m[f]=i;});return {map:m,unknown:unk};}
// ---------- value cleaning ----------
var IM_BLANK=/^(missing|n\/?a|na|none|nil|tbc|tba|unknown|-+|\u2014|\u2013|\?+)$/i;
function imCell(s){s=String(s==null?'':s).replace(/\s+/g,' ').trim();return IM_BLANK.test(s)?'':s;}
function imUnclear(s){var m=/^unclear\s*:\s*(.*)$/i.exec(s);if(!m)return null;var t=m[1].replace(/\([^)]*\)/g,' ').replace(/\?\s*$/,'').replace(/\?\s*(\/)/,' $1').replace(/\s+/g,' ').trim();return t;}
function imStripDrive(s){return String(s||'').replace(/\(\s*(left|right)[\s-]*hand[\s-]*drive\s*\)/ig,'').replace(/\b(left|right)[\s-]*hand[\s-]*drive\b/ig,'').replace(/\s+/g,' ').replace(/\(\s*\)/g,'').trim();}
function imVinClean(s){s=String(s||'').replace(/^(chassis|vin|serial|frame)(\s*(number|no\.?|#))?\s*[:#-]?\s*/i,'');return s.replace(/\s+/g,'').toUpperCase().slice(0,24);}
var IM_VT={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},IM_VW=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function imVinExpect(v){v=String(v||'').toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return null;var s=0;for(var i=0;i<17;i++){var c=v[i];s+=(/[0-9]/.test(c)?+c:IM_VT[c])*IM_VW[i];}var r=s%11;return r===10?'X':String(r);}
function imMoney(s){
  s=String(s||'').trim();if(!s)return null;
  if(/~|\u2013|\u2014|\bto\b|\d\s*-\s*[$\u20ac\u00a3\d]|\d\s*k\b|approx|est/i.test(s))return {range:true};
  var cur=null;
  if(/\$|\bUSD\b/i.test(s))cur='USD';else if(/\u20ac|\bEUR\b/i.test(s))cur='EUR';else if(/\u00a3|\bGBP\b/i.test(s))cur='GBP';
  else if(/[A-Za-z]{3}|R\s?\d/.test(s.replace(/[\d.,\s]/g,'')))return {bad:true};
  var n=s.replace(/[^0-9.,]/g,'');
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(n))n=n.replace(/\./g,'').replace(',','.');else n=n.replace(/,/g,'');
  var v=parseFloat(n);if(!isFinite(v)||v<=0)return null;
  return {v:Math.round(v*100)/100,cur:cur||'USD',raw:s};
}
function imMiles(s){
  s=String(s||'').trim();if(!s)return null;
  var km=/\bkm\b|kilomet/i.test(s),n=s.replace(/[^0-9.,]/g,'').replace(/,/g,'');
  var v=parseFloat(n);if(!isFinite(v)||v<0||!/\d/.test(s))return null;
  return {v:Math.round(v),km:km};
}
function imSplitReg(s){var p=String(s||'').split(/\s+\/\s+/);return {plate:cleanText(p[0]||'',20),region:cleanText(p.slice(1).join(' / ')||'',30)};}
function imExtColor(s){return cleanText(String(s||'').split(/\s+\/\s+/)[0],40);}
function imInsurer(s){return cleanText(String(s||'').split(/\s+/).filter(function(t){return !/\d/.test(t);}).join(' '),80);}
// Turn one raw record {field:text} into {f:{...},u:{field:{val,note}},label}
function imClean(raw){
  var f={year:'',make:'',model:'',vin:'',plate:'',region:'',color:'',miles:null,paid:null,cur:'USD',loc:'',ins:''},u={};
  function take(k,fn){var s=imCell(raw[k]);if(!s)return;var q=imUnclear(s);if(q!==null){var r=q?fn(q,true):null;if(r!==null&&r!==undefined)u[k]={val:r,raw:s};return;}var r2=fn(s,false);if(r2!==null&&r2!==undefined)set(k,r2);}
  function set(k,r){if(k==='reg'){f.plate=r.plate;f.region=r.region;}else if(k==='miles'){if(r.km){u.miles={val:r,raw:raw.miles,km:true};}else f.miles=r.v;}else if(k==='paid'){f.paid=r.v;f.cur=r.cur;}else f[k]=r;}
  take('year',function(s){var m=/\b(18[89]\d|19\d\d|20\d\d)\b/.exec(s);return m?m[1]:null;});
  take('make',function(s){return cleanText(imStripDrive(s),40)||null;});
  take('model',function(s){return cleanText(imStripDrive(s),60)||null;});
  take('vin',function(s){var v=imVinClean(s);return v.length>=4?v:null;});
  take('reg',function(s){var r=imSplitReg(s);return r.plate?r:null;});
  take('color',function(s){return imExtColor(s)||null;});
  take('miles',function(s){var m=imMiles(s);return m;});
  take('paid',function(s){var m=imMoney(s);return (m&&!m.range&&!m.bad)?m:null;});
  take('loc',function(s){return cleanText(s,120)||null;});
  take('ins',function(s){return imInsurer(s)||null;});
  // unclear values that were set via u: normalise shapes
  if(u.reg&&u.reg.val&&u.reg.val.plate===undefined)delete u.reg;
  if(u.miles&&!u.miles.km&&u.miles.val&&u.miles.val.km){u.miles.km=true;}
  if(u.paid&&u.paid.val&&u.paid.val.v===undefined)delete u.paid;
  return {f:f,u:u};
}
function imIsData(raw){var y=/\b(18[89]\d|19\d\d|20\d\d)\b/.test(String(raw.year||''));var mk=imCell(raw.make)||imCell(raw.model);return !!((y||imCell(raw.vin))&&mk&&!/^unclear/i.test(String(raw.make||'')));}
function imRecords(grid,map){
  var out=[];
  for(var i=0;i<grid.length;i++){
    var row=grid[i]||[],raw={};
    for(var k in map)if(map.hasOwnProperty(k))raw[k]=row[map[k]]==null?'':String(row[map[k]]);
    if(!imIsData(raw))continue;
    var c=imClean(raw);c.n=out.length+1;c.raw=raw;out.push(c);
  }
  return out;
}
// ---------- spreadsheet (xlsx / csv) ----------
function imLoadScript(src,sri,test){
  if(test())return Promise.resolve();
  return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;if(sri){s.integrity=sri;s.crossOrigin='anonymous';}s.async=true;
    var t=setTimeout(function(){rej(new Error('timeout'));},25000);
    s.onload=function(){clearTimeout(t);test()?res():rej(new Error('missing'));};s.onerror=function(){clearTimeout(t);rej(new Error('load failed'));};document.head.appendChild(s);});
}
function imLoadSheetJS(){return imLoadScript(IM_SHEETJS,IM_SHEETJS_SRI,function(){return !!window.XLSX;});}
function imPickGrid(wb){
  var best=null;
  wb.SheetNames.forEach(function(n,si){
    if(/discrep|legend|notes?$|summary of changes/i.test(n)&&wb.SheetNames.length>1)return;
    var grid=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''});
    for(var r=0;r<Math.min(grid.length,15);r++){var m=imMapHeaders(grid[r]);var score=Object.keys(m.map).length;
      if(score>=3&&(!best||score>best.score))best={sheet:n,hr:r,hdr:grid[r],map:m.map,unknown:m.unknown,grid:grid.slice(r+1),score:score};}
  });
  return best;
}
// ---------- PDF with a text layer ----------
async function imPdfLines(buf){
  var L=await dtLoadPdfJs();
  var doc=await L.getDocument({data:new Uint8Array(buf)}).promise,pages=[],chars=0;
  for(var p=1;p<=doc.numPages;p++){
    var pg=await doc.getPage(p),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent(),items=[];
    tc.items.forEach(function(it){var s=String(it.str||'');if(!s.trim())return;chars+=s.trim().length;var x=it.transform[4],y=vp.height-it.transform[5],w=it.width||0,h=Math.abs(it.transform[3])||it.height||8;items.push({s:s.trim(),x:x,y:y,w:w,h:h});});
    items.sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var lines=[];items.forEach(function(it){var l=lines.length?lines[lines.length-1]:null;if(l&&Math.abs(l.y-it.y)<=Math.max(2,it.h*0.35)){l.items.push(it);}else lines.push({y:it.y,h:it.h,items:[it]});});
    lines.forEach(function(l){l.items.sort(function(a,b){return a.x-b.x;});l.text=l.items.map(function(i){return i.s;}).join(' ');});
    pages.push(lines);
  }
  return {pages:pages,chars:chars};
}
function imPdfHeaderCols(line){
  var cols=[];line.items.forEach(function(it){var l=cols.length?cols[cols.length-1]:null;if(l&&it.x-(l.x+l.w)<it.h*0.45){l.s+=' '+it.s;l.w=it.x+it.w-l.x;}else cols.push({s:it.s,x:it.x,w:it.w});});
  return cols;
}
function imPdfTable(pdf){
  var hdrNames=null,recs=[];
  pdf.pages.forEach(function(lines){
    var hi=-1;for(var i=0;i<lines.length;i++){var t=imNorm(lines[i].text);if(/\bmake\b/.test(t)&&(/\bvin\b/.test(t)||/\byear\b/.test(t))){hi=i;break;}}
    if(hi<0)return;
    var cols=imPdfHeaderCols(lines[hi]);if(!hdrNames)hdrNames=cols.map(function(c){return c.s;});
    var cur=null,lastY=null,gap=[];
    function span(j){return [j===0?-1e9:cols[j].x-4,j===cols.length-1?1e9:cols[j+1].x-4];}
    function colOf(it){if(/^[~$\u20ac\u00a3]/.test(it.s)||/^\d[\d,.]*$/.test(it.s)&&it.s.length>4){var e=it.x+it.w-2;for(var q=0;q<cols.length;q++){var sq=span(q);if(e>=sq[0]&&e<sq[1])return q;}}var best=0,bo=-1;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>bo){bo=o;best=j;}}return best;}
    function wide(it){var n=0;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>8)n++;}return n>2;}
    for(var i2=hi+1;i2<lines.length;i2++){
      var ln=lines[i2];
      if(/^page \d+( of \d+)?$/i.test(ln.text.trim()))continue;
      var first=ln.items[0],startsRec=colOf(first)===0&&/^\d{1,3}$/.test(first.s);
      if(!startsRec&&cur&&(colOf(first)===0||ln.items.some(wide))){cur=null;break;}
      if(lastY!==null&&cur){var d=ln.y-lastY,med=gap.length?gap.slice().sort(function(a,b){return a-b;})[Math.floor(gap.length/2)]:ln.h*1.3;if(!startsRec&&d>Math.max(med*2.2,ln.h*2.4)){cur=null;break;}gap.push(d);}
      if(startsRec){cur={cells:cols.map(function(){return '';})};recs.push(cur);}
      lastY=ln.y;
      if(!cur)continue;
      ln.items.forEach(function(it){var k=colOf(it);cur.cells[k]=(cur.cells[k]?cur.cells[k]+' ':'')+it.s;});
    }
  });
  if(!hdrNames)return null;
  return {hdr:hdrNames,grid:recs.map(function(r){return r.cells.map(function(s){return s.replace(/-\s+(?=[a-z])/g,'-').replace(/\s+/g,' ').trim();});})};
}
// ---------- AI (edge function import-sheet; source only until deployed) ----------
function imAiOk(){return typeof sb!=='undefined'&&sb&&sb.functions&&typeof sb.functions.invoke==='function';}
function imB64(buf){var b=new Uint8Array(buf),s='',i,ch=0x8000;for(i=0;i<b.length;i+=ch)s+=String.fromCharCode.apply(null,b.subarray(i,i+ch));return btoa(s);}
async function imAi(body){
  if(!imAiOk())throw new Error('AI reading is not turned on yet. Use an Excel or CSV file.');
  body.import_id=IM.id;
  var r;try{r=await sb.functions.invoke('import-sheet',{body:body});}catch(e){r={error:e};}
  if(r&&r.error){var b=null;try{if(r.error.context&&typeof r.error.context.json==='function')b=await r.error.context.json();}catch(e){}
    if(b&&b.error==='daily_limit')throw new Error('You have used today\'s '+IM_DAY_CAP+' AI imports. Try again tomorrow, or use an Excel or CSV file.');
    throw new Error((b&&b.message)||'AI reading is not available right now. Use an Excel or CSV file.');}
  return (r&&r.data)||{};
}
// ---------- read a file into IM.rows ----------
async function imReadFile(file){
  var name=String(file.name||'sheet'),low=name.toLowerCase(),type=String(file.type||'');
  if(file.size>15*1024*1024)throw new Error('That file is bigger than 15 MB. Please use a smaller file.');
  var buf=await file.arrayBuffer(),how='';
  var kind=/\.pdf$/.test(low)||type==='application/pdf'?'pdf':(/^image\//.test(type)||/\.(jpe?g|png|heic|webp)$/.test(low))?'image':(/\.(xlsx|xls|xlsm|csv|tsv|ods)$/.test(low)||/sheet|excel|csv/.test(type))?'sheet':'';
  if(!kind)throw new Error('Please choose an Excel (.xlsx), CSV, or PDF file, or a photo of the sheet.');
  var t=null,rows=null;
  if(kind==='sheet'){
    try{await imLoadSheetJS();}catch(e){throw new Error('Could not open the spreadsheet reader. Check your connection and try again.');}
    var wb=/\.(csv|tsv)$/.test(low)?XLSX.read(new TextDecoder().decode(buf),{type:'string'}):XLSX.read(buf,{type:'array'});
    var g=imPickGrid(wb);
    if(!g){t=null;var ws=wb.Sheets[wb.SheetNames[0]],grid=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});if(grid.length)t={hdr:grid[0],grid:grid.slice(1),map:imMapHeaders(grid[0]).map,unknown:imMapHeaders(grid[0]).unknown};}
    else t={hdr:g.hdr,grid:g.grid,map:g.map,unknown:g.unknown};
    how='sheet';
  }else if(kind==='pdf'){
    var pdf=null;try{pdf=await imPdfLines(buf);}catch(e){pdf=null;}
    var tb=pdf&&pdf.chars>40?imPdfTable(pdf):null;
    if(tb){var mh=imMapHeaders(tb.hdr);t={hdr:tb.hdr,grid:tb.grid,map:mh.map,unknown:mh.unknown};how='pdf';}
  }
  if(t){
    var need=['make','year'].filter(function(k){return !(k in t.map);}).concat(('model' in t.map)?[]:['model']).concat(('vin' in t.map)?[]:['vin']);
    if(need.length&&t.unknown.length){ // unclear headers: ask AI for the mapping only
      var hdrs=t.unknown.map(function(i){return String(t.hdr[i]);}),samples=t.grid.slice(0,3).map(function(r){return t.unknown.map(function(i){return String(r[i]==null?'':r[i]).slice(0,60);});});
      try{var a=await imAi({mode:'headers',headers:hdrs,samples:samples});var mp=(a&&a.mapping)||{};
        t.unknown.forEach(function(i,j){var f=mp[hdrs[j]];if(f&&IM_LABEL[f]&&!(f in t.map))t.map[f]=i;});IM.usedAi=true;}catch(e){if(!('make' in t.map)&&!('model' in t.map))throw e;}
    }
    if(!('make' in t.map)&&!('model' in t.map))throw new Error('We could not find Make or Model columns. Please check the header row of your sheet.');
    rows=imRecords(t.grid,t.map);
  }else{
    // scanned PDF or photo: AI reads the rows
    if(buf.byteLength>8*1024*1024)throw new Error('That scan is over 8 MB. Please use a smaller scan.');
    var mime=kind==='pdf'?'application/pdf':(type||'image/jpeg');
    var ai=await imAi({mode:'rows',mime:mime,file_base64:imB64(buf)});IM.usedAi=true;how='ai';
    rows=(Array.isArray(ai.rows)?ai.rows:[]).map(function(r){return {year:r.year,make:r.make,model:r.model,vin:r.vin,reg:[r.registration,r.region].filter(Boolean).join(' / '),color:r.colour||r.color,miles:r.mileage,paid:r.paid,loc:r.location,ins:r.insurance};}).filter(imIsData).map(function(raw,i){var c=imClean(raw);c.n=i+1;c.raw=raw;return c;});
  }
  if(!rows.length)throw new Error('We could not find any vehicles in that file.');
  return {name:name,kind:kind,how:how,rows:rows.slice(0,500)};
}
// ---------- matching + review analysis (pure: rows + resolutions -> changes/new/conflicts) ----------
function imToks(s){return imNorm(imStripDrive(s)).split(' ').filter(function(t){return t&&['the','and','coupe','tribute','car','lhd','rhd'].indexOf(t)<0;});}
function imPlateKey(p){return String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function imCarName(f){return [f.year,f.make,f.model].filter(Boolean).join(' ');}
function imSimilar(f,v){
  var A=imToks(f.make+' '+f.model),B=imToks(v.make+' '+v.model);
  if(!A.length||!B.length||A[0]!==B[0])return 0;
  var a=A.slice(1),b=B.slice(1);if(!a.length||!b.length)return a.length===b.length?1:0.5;
  var hit=a.filter(function(t){return b.indexOf(t)>=0;}).length;
  return hit/Math.min(a.length,b.length);
}
function imCollection(owner){return getVehicles().filter(function(v){return v.clientId===owner&&!isArchivedVehicle(v);});}
function imCur(v,k){
  if(k==='reg')return {plate:v.plate||'',region:v.plateRegion||''};
  if(k==='miles')return Number(v.mileage)>0?Number(v.mileage):null;
  if(k==='paid')return Number(v.purchasePrice)>0?{v:Number(v.purchasePrice),cur:v.currency||'USD'}:null;
  var m={year:'year',make:'make',model:'model',vin:'vin',color:'color',loc:'location',ins:'insurer'};return String(v[m[k]]||'');
}
function imSheetVal(f,k){if(k==='reg')return f.plate?{plate:f.plate,region:f.region}:null;if(k==='paid')return f.paid?{v:f.paid,cur:f.cur}:null;if(k==='miles')return f.miles;return f[k]||'';}
function imEmpty(x){return x===null||x===undefined||x===''||(typeof x==='object'&&x.plate==='');}
function imSame(k,a,b){
  if(imEmpty(a)||imEmpty(b))return imEmpty(a)&&imEmpty(b);
  if(k==='reg')return imPlateKey(a.plate)===imPlateKey(b.plate)&&(!b.region||imNorm(a.region)===imNorm(b.region));
  if(k==='paid')return Math.abs(a.v-b.v)<0.005&&a.cur===b.cur;
  if(k==='miles')return Number(a)===Number(b);
  if(k==='vin')return imVinClean(a)===imVinClean(b);
  if(k==='model')return imNorm(a)===imNorm(b)||imNorm(b).indexOf(imNorm(a))===0;
  return imNorm(a)===imNorm(b);
}
function imFmt(k,x){
  if(imEmpty(x))return '';
  if(k==='reg')return x.plate+(x.region?' / '+x.region:'');
  if(k==='paid')return (IM_CUR[x.cur]||'')+Number(x.v).toLocaleString('en-US',{minimumFractionDigits:x.v%1?2:0,maximumFractionDigits:2})+(IM_CUR[x.cur]?'':' '+x.cur);
  if(k==='miles')return Number(x).toLocaleString('en-US')+' mi';
  return String(x);
}
// effective fields of a sheet row after the owner's conflict choices
function imRowFields(r,ri,res){
  var f=JSON.parse(JSON.stringify(r.f));
  for(var k in r.u)if(r.u.hasOwnProperty(k)){var c=res['u'+ri+':'+k];if(c==='use'){var x=r.u[k];
    if(k==='reg'){f.plate=x.val.plate;f.region=x.val.region;}else if(k==='miles'){f.miles=x.km?Math.round(x.val.v*0.621371):x.val.v;}else if(k==='paid'){f.paid=x.val.v;f.cur=x.val.cur;}else f[k]=x.val;}}
  var ev=res['vin'+ri];if(ev&&ev.edit!==undefined)f.vin=ev.edit;
  return f;
}
function imAnalyze(rows,owner,pfId,res){
  res=res||{};
  var col=imCollection(owner),out={changes:[],news:[],conflicts:[],matched:{},skip:{}},used={};
  var pfName=function(v){return poOf(v,owner).name;},target=pfId;
  rows.forEach(function(r,ri){
    var blocked=false,f;
    // unclear values: owner decides
    for(var k in r.u)if(r.u.hasOwnProperty(k)){
      var key='u'+ri+':'+k,x=r.u[k],core=(k==='year'||k==='make'||k==='model');
      var shown=k==='miles'&&x.km?(Number(x.val.v).toLocaleString('en-US')+' km = '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi'):imFmt(k,k==='miles'?x.val.v:x.val);
      if(res[key]==='skipcar'){out.skip[ri]=1;blocked=true;break;}
      if(!res[key]){out.conflicts.push({key:key,ri:ri,type:'unclear',field:k,title:(x.km?'Mileage in km':IM_LABEL[k]+' unclear on sheet'),car:imCarName(r.f)||('Row '+r.n),lines:[['Sheet says',shown]],opts:[{v:'use',label:x.km?'Use '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi':'Use it',gold:true},{v:core?'skipcar':'skip',label:core?'Skip this car':'Leave blank'}]});
        if(core)blocked=true;}
    }
    if(out.skip[ri]||blocked)return;
    f=imRowFields(r,ri,res);
    // VIN check digit on 17-character VINs
    if(f.vin.length===17&&!(Number(f.year)&&Number(f.year)<1981)){
      var exp=imVinExpect(f.vin),vk='vin'+ri;
      if(exp===null||exp!==f.vin[8]){
        if(!res[vk]){out.conflicts.push({key:vk,ri:ri,type:'vincheck',title:'VIN check failed',car:imCarName(f),vin:f.vin,lines:[['Sheet',f.vin]],note:exp===null?'This VIN has letters that VINs never use (I, O or Q).':'Check digit should be '+exp+', the sheet has '+f.vin[8]+'.',opts:[{v:'keep',label:'Keep as is'},{v:'edit',label:'Edit VIN',gold:true}]});return;}
      }
    }
    if(!f.make&&!f.model){out.skip[ri]=1;return;}
    // matching across the whole collection
    var mk='m'+ri,choice=res[mk],m=null,how='';
    var vin=imVinClean(f.vin),cands=[];
    col.forEach(function(v){
      var vv=imVinClean(v.vin);
      if(vin&&vv&&vin===vv){cands.push({v:v,how:vin.length===17?'vin':'chassis',s:2});return;}
      if(vin&&vv&&vin!==vv)return; // two different VINs: not the same car
      var sim=imSimilar(f,v);if(sim<0.5)return;
      var ye=String(v.year)===String(f.year);
      if(ye)cands.push({v:v,how:'ymm',s:sim});else if(sim>=0.99&&f.year&&v.year)cands.push({v:v,how:'year',s:sim*0.9});
    });
    cands.sort(function(a,b){return b.s-a.s;});
    if(choice==='new'){m=null;}
    else if(choice&&choice!=='skip'){m=col.filter(function(v){return v.id===choice;})[0]||null;how='chosen';}
    else if(choice==='skip'){out.skip[ri]=1;return;}
    else if(cands.length){
      var c0=cands[0],yr=Number(f.year)||Number(c0.v.year)||0,yearDiff=String(c0.v.year)!==String(f.year)&&f.year;
      if(c0.how==='vin'&&!yearDiff){m=c0.v;how='vin';}
      else if(c0.how==='ymm'&&cands.filter(function(c){return c.how==='ymm';}).length===1&&yr>=1981&&!(vin&&c0.v.vin)&&vin.length!==17&&!yearDiff){m=c0.v;how='ymm';}
      else{
        var by=c0.how==='vin'?'VIN '+vin:c0.how==='chassis'?'chassis '+vin:'year, make and model';
        if(yearDiff){
          out.conflicts.push({key:mk,ri:ri,type:'year',title:'Year differs',car:imVName(c0.v),lines:[['Your car',String(c0.v.year)],['Sheet',String(f.year)]],note:'Matched by '+(c0.how==='year'?'make and model':by)+'.',opts:[{v:c0.v.id+'|keep',label:'Keep '+c0.v.year},{v:c0.v.id+'|use',label:'Use '+f.year,gold:true},{v:'new',label:'Not the same car'}]});
        }else{
          var o=cands.slice(0,3).map(function(c){return {v:c.v.id,label:'Same as '+imVName(c.v),gold:true};});o.push({v:'new',label:'No, add as new'});
          out.conflicts.push({key:mk,ri:ri,type:'match',title:'Is this the same car?',car:imCarName(f),lines:[['Sheet',imCarName(f)+(vin?' \u00b7 '+vin:'')],['Your car',imVName(c0.v)+(c0.v.vin?' \u00b7 '+c0.v.vin:'')]],note:(c0.how==='chassis'?'Matched by chassis '+vin+'. Older chassis numbers are never matched automatically.':yr&&yr<1981?'Cars before 1981 are never matched automatically.':'More than one way this could match.'),opts:o});
        }
        return;
      }
    }
    if(choice&&choice.indexOf('|')>0){var pr=choice.split('|');m=col.filter(function(v){return v.id===pr[0];})[0]||null;how='chosen';if(m&&pr[1]==='keep')f.year=String(m.year);}
    if(m){
      if(used[m.id]!==undefined){out.conflicts.push({key:'d'+ri,ri:ri,type:'dupe',title:'Listed twice on the sheet',car:imVName(m),lines:[['Rows',rows[used[m.id]].n+' and '+r.n]],note:'Only the first row is used.',opts:[]});return;}
      used[m.id]=ri;
      if(PO.on&&target&&poOf(m,owner).id!==target&&res['p'+ri]!=='here'){
        if(res['p'+ri]!=='skip')out.conflicts.push({key:'p'+ri,ri:ri,type:'otherpf',title:'Already in another portfolio',car:imVName(m),lines:[['Portfolio',pfName(m)]],note:'This car is already in your collection, in '+pfName(m)+'.',opts:[{v:'here',label:'Update it there',gold:true},{v:'skip',label:'Skip'}]});
        return;
      }
      out.matched[ri]=m.id;
      IM_ORDER.forEach(function(k){
        var sv=imSheetVal(f,k);if(imEmpty(sv))return;var cv=imCur(m,k);
        if(k==='make'||(k==='model'&&!imEmpty(cv)))return; // name differences are not changes
        if(k==='year'&&!(choice&&choice.indexOf('|use')>0))return;
        if(imSame(k,cv,sv))return;
        out.changes.push({key:'c'+ri+':'+k,ri:ri,vid:m.id,field:k,car:imVName(m),cur:imFmt(k,cv),val:imFmt(k,sv),raw:sv,forced:k==='year'});
      });
    }else{
      if(!f.year||!f.make){out.conflicts.push({key:'n'+ri,ri:ri,type:'incomplete',title:'Year or make missing',car:imCarName(f)||('Row '+r.n),lines:[['Sheet row',String(r.n)]],note:'A new car needs a year, make and model. Add this one by hand.',opts:[]});return;}
      out.news.push({key:'a'+ri,ri:ri,f:f});
    }
  });
  return out;
}
function imVName(v){return [v.year,v.make,v.model].filter(Boolean).join(' ')||'Vehicle';}
// ---------- UI ----------
function imE(s){return esc(String(s==null?'':s));}
function imOwnerFor(preset){
  var o=ownerClientId();if(o&&canAddVehicleFor(o))return o;
  if(preset&&canAddVehicleFor(preset))return preset;
  var pg=document.querySelector('.page.active');
  if(pg&&pg.id==='page-client-detail'&&currentClientId&&canAddVehicleFor(currentClientId))return currentClientId;
  var ad=getClients().filter(function(c){return canAddVehicleFor(c.id);});return ad.length===1?ad[0].id:null;
}
function imOpen(preset){
  if(typeof requireAdvisor==='function'&&!requireAdvisor())return;
  if(!getClients().some(function(c){return canAddVehicleFor(c.id);})&&!(ownerClientId()&&canAddVehicleFor(ownerClientId()))){showToast('You cannot add vehicles to this collection.','error');return;}
  IM={step:1,busy:false,msg:'',owner:imOwnerFor(preset),file:null,rows:[],pfId:null,newPf:null,res:{},appr:{},add:{},tab:'changes',done:null,id:uid(),edit:null};
  var r=document.getElementById('im-root');
  if(!r){r=document.createElement('div');r.id='im-root';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label','Import master sheet');document.body.appendChild(r);}
  r.style.display='block';document.body.classList.add('im-open');imRender();
}
function imClose(){var r=document.getElementById('im-root');if(r){r.style.display='none';r.innerHTML='';}document.body.classList.remove('im-open');var ch=IM.done&&!IM.done.undone;IM={step:0};if(ch)refreshCurrent();}
function imBack(){if(IM.busy)return;if(IM.step===2||(IM.step===3)){IM.step--;IM.msg='';imRender();return;}imClose();}
function imHead(){
  var st=Math.min(IM.step,4),bars='';for(var i=1;i<=4;i++)bars+='<span class="im-bar'+(i<=st?' on':'')+'"></span>';
  return '<div class="im-top"><button class="im-x" onclick="'+(IM.step===4?'imClose()':'imBack()')+'" aria-label="'+(IM.step===1||IM.step===4?'Close':'Back')+'">'+(IM.step===1||IM.step===4?'\u2715':'\u2039')+'</button><div class="im-ttl">Import master sheet</div></div>'+
    '<div class="im-steps"><div class="im-bars">'+bars+'</div><div class="im-stepn">STEP '+st+' OF 4</div></div>';
}
function imRender(){
  var r=document.getElementById('im-root');if(!r||!IM.step)return;
  var h='<div class="im-wrap">'+imHead()+'<div class="im-body">';
  if(IM.step===1)h+=imStep1();else if(IM.step===2)h+=imStep2();else if(IM.step===3)h+=imStep3();else h+=imStep4();
  h+='</div></div>';
  var sc=r.scrollTop;r.innerHTML=h;r.scrollTop=sc;
  var fe=document.getElementById('im-edit-in');if(fe)fe.focus();
}
function imErr(){return IM.msg?'<div class="im-err" role="alert">'+imE(IM.msg)+'</div>':'';}
// step 1: upload
function imBatches(){try{var a=JSON.parse(localStorage.getItem('evoai_im_batches')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function imSaveBatches(a){try{localStorage.setItem('evoai_im_batches',JSON.stringify(a.slice(-10)));}catch(e){}}
function imLastBatch(owner){var a=imBatches().filter(function(b){return (!owner||b.owner===owner)&&Date.now()-Date.parse(b.at)<30*864e5;});return a.length?a[a.length-1]:null;}
function imStep1(){
  if(IM.busy)return '<h1 class="im-h1">Reading your sheet</h1><div class="im-card im-busy"><span class="im-spin" aria-hidden="true"></span><div><b>'+imE(IM.file?IM.file.name:'Your file')+'</b><div class="im-txt">'+imE(IM.busyMsg||'Finding your vehicles...')+'</div></div></div>';
  var lb=imLastBatch(IM.owner),h='<h1 class="im-h1">Import master sheet</h1><p class="im-lead">Upload your list. Nothing changes until you approve it.</p>'+imErr()+
    '<label class="im-drop" for="im-file"><span class="im-drop-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6"/><path d="M9.5 13.5 12 11l2.5 2.5"/></svg></span><b>Choose a file</b><span>Excel (.xlsx), CSV, or PDF</span><span>Scans and photos work too</span></label>'+
    '<input type="file" id="im-file" class="im-hide" accept=".xlsx,.xls,.csv,.pdf,application/pdf,image/*" onchange="imPicked(this)">'+
    '<input type="file" id="im-photo" class="im-hide" accept="image/*" capture="environment" onchange="imPicked(this)">'+
    '<button class="im-btn gold" onclick="document.getElementById(\'im-file\').click()">Choose file</button>'+
    '<button class="im-btn line" onclick="document.getElementById(\'im-photo\').click()">Take photo of a sheet</button>'+
    '<div class="im-card"><div class="im-cap">We read only</div><ul class="im-list"><li>Year, make, model</li><li>VIN or chassis number</li><li>Registration</li><li>Colour</li><li>Mileage</li><li>What you paid</li><li>Location and insurance, if listed</li></ul><div class="im-txt">Value estimates, ranges and notes are never imported.</div></div>';
  if(lb&&!lb.undone)h+='<div class="im-card"><div class="im-cap">Last import</div><div class="im-txt">'+imE(new Date(lb.at).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+' \u00b7 '+lb.added.length+' added \u00b7 '+lb.changed.length+' updated</div><button class="im-btn line red" onclick="imUndo(\''+lb.id+'\')">Undo last import</button></div>';
  return h;
}
async function imPicked(inp){
  var f=inp&&inp.files&&inp.files[0];if(!f)return;inp.value='';
  IM.busy=true;IM.msg='';IM.file={name:f.name};IM.busyMsg=/\.(xlsx|xls|csv)$/i.test(f.name)?'Finding your vehicles...':'Reading the pages. Scans can take up to a minute.';imRender();
  try{var out=await imReadFile(f);IM.file=out;IM.rows=out.rows;IM.res={};IM.appr={};IM.add={};IM.step=2;IM.busy=false;
    var l=IM.owner?poList(IM.owner):[];IM.pfId=l.length?l[0].id:null;
  }catch(e){IM.busy=false;IM.msg=(e&&e.message)||'Could not read that file.';}
  imRender();
}
// step 2: which portfolio
var IM_COUNTRIES=[['','No country'],['US','United States'],['GB','United Kingdom'],['IE','Ireland'],['DE','Germany'],['FR','France'],['IT','Italy'],['ES','Spain'],['NL','Netherlands'],['CH','Switzerland'],['MC','Monaco'],['ZA','South Africa'],['AE','UAE'],['CA','Canada'],['AU','Australia']];
function imStep2(){
  var h='<h1 class="im-h1">Which portfolio?</h1><div class="im-card im-file"><span class="im-file-ic" aria-hidden="true">'+(IM.file.kind==='pdf'?'PDF':IM.file.kind==='image'?'IMG':'XLS')+'</span><div><b>'+imE(IM.file.name)+'</b><div class="im-txt">'+IM.rows.length+' vehicle'+(IM.rows.length===1?'':'s')+' found</div></div></div>'+imErr();
  var ad=getClients().filter(function(c){return canAddVehicleFor(c.id);});
  if(!ownerClientId()&&ad.length>1){
    h+='<label class="im-lab" for="im-owner">Whose collection?</label><select id="im-owner" class="im-in" onchange="imSetOwner(this.value)"><option value="">Choose a client</option>'+ad.map(function(c){return '<option value="'+imE(c.id)+'"'+(c.id===IM.owner?' selected':'')+'>'+imE(c.name||c.email||'Client')+'</option>';}).join('')+'</select>';
  }
  if(!IM.owner)return h+'<p class="im-lead">Choose whose collection these vehicles belong to.</p>';
  h+='<p class="im-lead">Choose where these vehicles go.</p><div class="im-pfs" role="radiogroup" aria-label="Portfolio">';
  poList(IM.owner).forEach(function(p){
    var on=!IM.newPf&&IM.pfId===p.id,n=poCount(IM.owner,p),fl=poFlag(p.country);
    h+='<button class="im-pf'+(on?' on':'')+'" role="radio" aria-checked="'+on+'" onclick="imPickPf('+(p.id?'\''+p.id+'\'':'null')+')"><span class="im-flag" aria-hidden="true">'+(fl||imE(String(p.name||'C').charAt(0)))+'</span><span class="im-pf-t"><b>'+imE(p.name)+'</b><span>'+(n?n+' vehicle'+(n===1?'':'s')+' now':'Empty')+' \u00b7 '+imE(p.currency)+'</span></span><span class="im-radio" aria-hidden="true"></span></button>';
  });
  if(PO.on){
    if(IM.newPf){var np=IM.newPf;
      h+='<div class="im-pf on im-newpf"><b>New portfolio</b><label class="im-lab" for="im-np-name">Name</label><input id="im-np-name" class="im-in" maxlength="80" value="'+imE(np.name)+'" placeholder="UK &amp; Europe Collection" oninput="IM.newPf.name=this.value">'+
        '<label class="im-lab" for="im-np-country">Country</label><select id="im-np-country" class="im-in" onchange="IM.newPf.country=this.value">'+IM_COUNTRIES.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===np.country?' selected':'')+'>'+imE(c[1])+'</option>';}).join('')+'</select>'+
        '<label class="im-lab" for="im-np-cur">Currency</label><select id="im-np-cur" class="im-in" onchange="IM.newPf.currency=this.value">'+['USD','EUR','GBP'].map(function(c){return '<option'+(c===np.currency?' selected':'')+'>'+c+'</option>';}).join('')+'</select>'+
        '<button class="im-link" onclick="IM.newPf=null;imRender()">Cancel new portfolio</button></div>';
    }else h+='<button class="im-pf im-add" onclick="IM.newPf={name:\'\',country:\'\',currency:\'USD\'};imRender()"><span class="im-flag plus" aria-hidden="true">+</span><span class="im-pf-t"><b>New portfolio for this import</b></span></button>';
  }
  h+='</div><button class="im-btn gold" '+(IM.busy?'disabled':'')+' onclick="imToReview()">'+(IM.busy?'Creating...':'Continue')+'</button>';
  return h;
}
function imSetOwner(o){IM.owner=o||null;IM.newPf=null;var l=IM.owner?poList(IM.owner):[];IM.pfId=l.length?l[0].id:null;imRender();}
function imPickPf(id){IM.pfId=id;IM.newPf=null;imRender();}
async function imToReview(){
  if(!IM.owner){IM.msg='Choose whose collection these vehicles belong to.';imRender();return;}
  if(IM.newPf){var nm=cleanText(IM.newPf.name,80);if(!nm){IM.msg='Give the new portfolio a name.';imRender();return;}
    IM.busy=true;IM.msg='';imRender();
    try{IM.pfId=await poCreate(IM.owner,nm,IM.newPf.country,IM.newPf.currency);IM.newPf=null;audit('portfolio.created','Portfolio created: '+nm,{clientId:IM.owner});}catch(e){IM.busy=false;IM.msg=e.message||'Could not create the portfolio.';imRender();return;}
    IM.busy=false;}
  IM.msg='';IM.step=3;IM.tab='changes';imRender();
}
// step 3: review
function imA(){return imAnalyze(IM.rows,IM.owner,IM.pfId,IM.res);}
function imApprovedCount(A){var c=0;A.changes.forEach(function(x){if(x.forced||IM.appr[x.key]===true)c++;});A.news.forEach(function(x){if(IM.add[x.key]===true)c++;});return c;}
function imStep3(){
  var A=imA(),n=imApprovedCount(A),tabs=[['changes','Changes',A.changes.length],['new','New cars',A.news.length],['conflicts','Conflicts',A.conflicts.length]];
  var h='<h1 class="im-h1">Review</h1><div class="im-tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" aria-selected="'+(IM.tab===t[0])+'" class="im-tab'+(IM.tab===t[0]?' on':'')+(t[0]==='conflicts'&&t[2]?' warn':'')+'" onclick="IM.tab=\''+t[0]+'\';imRender()">'+t[1]+' <span class="im-n">'+t[2]+'</span></button>';}).join('')+'</div>'+imErr();
  if(IM.tab==='changes')h+=imTabChanges(A);else if(IM.tab==='new')h+=imTabNew(A);else h+=imTabConf(A);
  h+='<div class="im-savebar"><button class="im-btn gold" '+(n&&!IM.busy?'':'disabled')+' onclick="imSave()">'+(IM.busy?'Saving...':n?'Save '+n+' approved':'Nothing approved yet')+'</button></div>';
  return h;
}
function imPair(cur,val){return '<div class="im-pair"><div><div class="im-cap">Current</div><div class="im-v'+(cur?'':' blank')+'">'+(cur?imE(cur):'Blank')+'</div></div><div><div class="im-cap gold">Sheet</div><div class="im-v">'+imE(val)+'</div></div></div>';}
function imTabChanges(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var pend=A.changes.filter(function(x){return !x.forced&&IM.appr[x.key]!==true;}).length;
  var h='<p class="im-lead">These are cars you already have. Approve the details to update.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imApproveAll()">Approve all '+pend+' change'+(pend===1?'':'s')+'</button>';
  A.changes.forEach(function(x){
    var st=x.forced?'forced':IM.appr[x.key]===true?'yes':IM.appr[x.key]===false?'no':'';
    h+='<div class="im-item'+(st==='no'?' off':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+'</div>'+imPair(x.cur,x.val)+
      (st==='forced'?'<div class="im-state">Chosen in Conflicts</div>':st==='yes'?'<div class="im-acts"><span class="im-state ok">\u2713 Approved</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':st==='no'?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Approve</button><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>')+'</div>';
  });
  return h;
}
function imNewLines(f){
  var L=[];if(f.vin)L.push(['VIN',f.vin]);if(f.plate)L.push(['Registration',imFmt('reg',{plate:f.plate,region:f.region})]);if(f.color)L.push(['Colour',f.color]);if(f.miles)L.push(['Mileage',imFmt('miles',f.miles)]);if(f.paid)L.push(['What you paid',imFmt('paid',{v:f.paid,cur:f.cur})]);if(f.loc)L.push(['Location',f.loc]);if(f.ins)L.push(['Insurance',f.ins]);
  return L.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('');
}
function imTabNew(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pend=A.news.filter(function(x){return IM.add[x.key]!==true;}).length,pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  var h='<p class="im-lead">These cars are not in your collection yet. They go into '+imE(pf.name)+'.</p>';
  if(pend)h+='<button class="im-btn gold" onclick="imAddAll()">Add all '+pend+' car'+(pend===1?'':'s')+'</button>';
  A.news.forEach(function(x){var st=IM.add[x.key];
    h+='<div class="im-item'+(st===false?' off':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(x.f)+
      (st===true?'<div class="im-acts"><span class="im-state ok">\u2713 Will be added</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':st===false?'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',null)">Undo</button></div>':
      '<div class="im-acts"><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',true)">Add</button><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>')+'</div>';});
  return h;
}
function imTabConf(A){
  if(!A.conflicts.length)return '<div class="im-empty">All clear. Nothing to check.</div>';
  var h='<p class="im-lead">Please check these before importing.</p>';
  A.conflicts.forEach(function(x){
    h+='<div class="im-item im-conf"><div class="im-ct">'+imE(x.title)+'</div><div class="im-car">'+imE(x.car)+'</div>'+x.lines.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('')+(x.note?'<div class="im-txt">'+imE(x.note)+'</div>':'');
    if(IM.edit===x.key)h+='<label class="im-lab" for="im-edit-in">Correct VIN</label><input id="im-edit-in" class="im-in mono" maxlength="24" value="'+imE(x.vin||'')+'" autocapitalize="characters"><div class="im-acts"><button class="im-btn sm gold" onclick="imEditSave(\''+x.key+'\')">Save VIN</button><button class="im-btn sm line" onclick="IM.edit=null;imRender()">Cancel</button></div>';
    else if(x.opts.length)h+='<div class="im-acts '+(x.type==='match'?'stack':'wrap')+'">'+x.opts.map(function(o){return '<button class="im-btn sm '+(o.gold?'gold':'line')+'" onclick="imResolve(\''+x.key+'\',\''+String(o.v).replace(/'/g,'')+'\')">'+imE(o.label)+'</button>';}).join('')+'</div>';
    h+='</div>';
  });
  return h;
}
function imAppr(k,v){if(v===null)delete IM.appr[k];else IM.appr[k]=v;imRender();}
function imAdd(k,v){if(v===null)delete IM.add[k];else IM.add[k]=v;imRender();}
function imApproveAll(){imA().changes.forEach(function(x){if(IM.appr[x.key]!==false)IM.appr[x.key]=true;});imRender();}
function imAddAll(){imA().news.forEach(function(x){if(IM.add[x.key]!==false)IM.add[x.key]=true;});imRender();}
function imResolve(k,v){if(/^vin/.test(k)){if(v==='edit'){IM.edit=k;imRender();return;}IM.res[k]={keep:true};}else IM.res[k]=v;IM.edit=null;imRender();}
function imEditSave(k){var el=document.getElementById('im-edit-in'),v=imVinClean(el?el.value:'');if(v.length<4){IM.msg='Enter the VIN or chassis number.';imRender();return;}IM.msg='';IM.res[k]={edit:v};IM.edit=null;imRender();}
// ---------- save (normal save path) + undo ----------
var IM_PROPS={year:['year'],make:['make'],model:['model'],vin:['vin'],reg:['plate','plateRegion'],color:['color'],miles:['mileage'],paid:['purchasePrice','currency'],loc:['location'],ins:['insurer']};
function imSetProp(v,k,raw){
  if(k==='reg'){v.plate=cleanText(raw.plate,20);if(raw.region)v.plateRegion=cleanText(raw.region,30);}
  else if(k==='paid'){v.purchasePrice=raw.v;v.currency=IM_CUR[raw.cur]?raw.cur:'USD';}
  else if(k==='miles')v.mileage=Math.max(0,Math.round(Number(raw)||0));
  else if(k==='vin')v.vin=imVinClean(raw);
  else if(k==='year')v.year=String(raw);
  else if(k==='loc')v.location=cleanText(raw,120);
  else if(k==='ins')v.insurer=cleanText(raw,80);
  else if(k==='color')v.color=cleanText(raw,40);
  else if(k==='model')v.model=cleanText(raw,60);
}
function imNewVehicle(f,owner,pfId,now){
  var yr=toInt(f.year),max=new Date().getFullYear()+2;
  if(!yr||yr<1885||yr>max)return null;
  var cur=IM_CUR[f.cur]?f.cur:'USD';
  return {id:uid(),clientId:owner,year:String(yr),make:cleanText(f.make,40),model:cleanText(f.model||'',60),trim:'',isReplica:false,builder:'',nickname:'',color:cleanText(f.color,40),mileage:f.miles?Math.max(0,Math.round(f.miles)):0,vin:imVinClean(f.vin),
    purchasePrice:f.paid||0,purchaseDate:'',insuredValue:0,notes:'',plate:cleanText(f.plate,20),plateRegion:cleanText(f.region,30),location:cleanText(f.loc,120),insurer:cleanText(f.ins,80),currency:cur,portfolioId:pfId||null,
    regExpiry:'',insRenewal:'',insRepeat:'yearly',inspExpiry:'',lastServiceDate:'',nextServiceDate:'',nextServiceMiles:'',svcIntervalMonths:6,svcIntervalMiles:5000,image:null,valueLog:[],createdAt:now,importedAt:now};
}
function imApply(A,owner,pfId,appr,add){
  var vehicles=getVehicles(),now=new Date().toISOString(),batch={id:IM.id||uid(),at:now,owner:owner,pf:pfId,added:[],changed:[]},byV={},refused=0;
  A.changes.forEach(function(x){if(!(x.forced||appr[x.key]===true))return;(byV[x.vid]=byV[x.vid]||[]).push(x);});
  Object.keys(byV).forEach(function(vid){
    var v=byId(vehicles,vid);if(!v||isArchivedVehicle(v)||!canEditVehicle(v)){refused++;return;}
    var props=[],before={},after={};byV[vid].forEach(function(x){IM_PROPS[x.field].forEach(function(p){props.push(p);});});
    props.forEach(function(p){before[p]=v[p]===undefined?null:v[p];});
    byV[vid].forEach(function(x){imSetProp(v,x.field,x.raw);});
    props.forEach(function(p){after[p]=v[p]===undefined?null:v[p];});
    v.updatedAt=now;batch.changed.push({id:vid,before:before,after:after,fields:byV[vid].map(function(x){return x.field;})});
  });
  var added=[];
  if(canAddVehicleFor(owner))A.news.forEach(function(x){if(add[x.key]!==true)return;var nv=imNewVehicle(x.f,owner,pfId,now);if(!nv){refused++;return;}vehicles.push(nv);added.push(nv);batch.added.push(nv.id);});
  else refused+=A.news.filter(function(x){return add[x.key]===true;}).length;
  if(!batch.changed.length&&!added.length)return {batch:batch,refused:refused,none:true};
  if(!setVehicles(vehicles))return {error:true};
  batch.changed.forEach(function(c){var v=byId(getVehicles(),c.id);audit('vehicle.updated','Updated from master sheet ('+c.fields.map(function(k){return IM_LABEL[k];}).join(', ')+'): '+vName(v),{clientId:owner,vehicleId:c.id});});
  added.forEach(function(nv){audit('vehicle.created','Vehicle added from master sheet: '+vName(nv)+' ('+imVName(nv)+')',{clientId:owner,vehicleId:nv.id});});
  var all=imBatches();all.push(batch);imSaveBatches(all);
  return {batch:batch,refused:refused};
}
function imSave(){
  if(IM.busy)return;var A=imA();
  var r=imApply(A,IM.owner,IM.pfId,IM.appr,IM.add);
  if(r.error){IM.msg='Could not save. Please try again.';imRender();return;}
  if(r.none){IM.msg='Nothing was saved.';imRender();return;}
  var pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner);
  IM.done={batch:r.batch,refused:r.refused,pf:pf.name,skipped:A.conflicts.length};IM.step=4;IM.msg='';imRender();
  showToast('Import saved','success');
}
function imUndo(id){
  var all=imBatches(),b=all.filter(function(x){return x.id===id;})[0];if(!b||b.undone){showToast('Nothing to undo','error');return;}
  var vehicles=getVehicles(),gone={},keepAdded=0,reverted=0;
  b.added.forEach(function(vid){var v=byId(vehicles,vid);if(v&&canEditVehicle(v)&&!isArchivedVehicle(v))gone[vid]=1;else if(v)keepAdded++;});
  vehicles=vehicles.filter(function(v){return !gone[v.id];});
  b.changed.forEach(function(c){var v=byId(vehicles,c.id);if(!v||!canEditVehicle(v)||isArchivedVehicle(v))return;var any=false;
    for(var p in c.before)if(c.before.hasOwnProperty(p)){if(JSON.stringify(v[p]===undefined?null:v[p])===JSON.stringify(c.after[p])){v[p]=c.before[p]===null?(p==='mileage'||p==='purchasePrice'?0:''):c.before[p];any=true;}}
    if(any){v.updatedAt=new Date().toISOString();reverted++;}});
  setVehicles(vehicles);
  Object.keys(gone).forEach(function(vid){audit('vehicle.deleted','Import undone: vehicle removed',{clientId:b.owner,vehicleId:vid});});
  if(reverted)audit('vehicle.updated','Import undone: '+reverted+' car'+(reverted===1?'':'s')+' restored',{clientId:b.owner});
  b.undone=new Date().toISOString();imSaveBatches(all);
  if(IM.step===4&&IM.done)IM.done.undone={removed:Object.keys(gone).length,reverted:reverted};
  showToast('Import undone','success');
  if(IM.step)imRender();else refreshCurrent();
}
function imStep4(){
  var d=IM.done,b=d.batch;
  if(d.undone)return '<div class="im-done"><div class="im-big">\u21b6</div><h1 class="im-h1">Import undone</h1><p class="im-lead">'+d.undone.removed+' car'+(d.undone.removed===1?'':'s')+' removed, '+d.undone.reverted+' restored to how they were.</p><button class="im-btn gold" onclick="imClose()">Done</button></div>';
  return '<div class="im-done"><div class="im-big ok">\u2713</div><h1 class="im-h1">Import saved</h1>'+
    '<div class="im-card"><div class="im-kv"><span>Cars added to '+imE(d.pf)+'</span><b>'+b.added.length+'</b></div><div class="im-kv"><span>Cars updated</span><b>'+b.changed.length+'</b></div>'+(d.skipped?'<div class="im-kv"><span>Left to check</span><b>'+d.skipped+'</b></div>':'')+'</div>'+
    (b.added.length?'<p class="im-lead">Each new car has its own page. Anything the sheet did not have shows as Missing.</p>':'')+
    '<button class="im-btn gold" onclick="imClose()">View collection</button><button class="im-btn line red" onclick="imUndo(\''+b.id+'\')">Undo this import</button></div>';
}
