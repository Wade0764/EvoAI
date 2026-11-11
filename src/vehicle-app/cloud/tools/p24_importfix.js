// ===== v24 import fix (p24): every sheet row ends in one bucket; new cars added by default; blanks filled,
// replacements need approval; exact VIN/chassis/plate matching only (else "Same car?"); per-car cloud save
// with loud errors; sturdier PDF table reading with an AI fallback. Overrides p20/p23 functions by name.
var IM_MULTI_MAKES=['alfa romeo','land rover','aston martin','mercedes benz','rolls royce','de tomaso','austin healey','mclaren'];
var IM_MAKE_ALIAS={vw:'volkswagen',mercedes:'mercedes benz',benz:'mercedes benz',chevy:'chevrolet',alfa:'alfa romeo',landrover:'land rover',aston:'aston martin'};
var IM_PDF={expect:0};
// ---------- cleaning: "Fiat 500" / "Mini Cooper Countryman" in the Make column ----------
function imClean(raw){
  var c=imCleanBase(raw),f=c.f;
  if(f.make){var mk=imNorm(f.make),hit='';
    IM_MULTI_MAKES.forEach(function(m){if((mk+' ').indexOf(m+' ')===0&&m.length>hit.length)hit=m;});
    var words=String(f.make).split(/\s+/),n=hit?hit.split(' ').length:1;
    if(words.length>n){var rest=words.slice(n).join(' ');f.make=words.slice(0,n).join(' ');f.model=cleanText((rest+' '+(f.model||'')).trim(),60);}
  }
  return c;
}
function imMakeKey(s){var k=imNorm(s);if(IM_MAKE_ALIAS[k])return IM_MAKE_ALIAS[k];var w=k.split(' ')[0];if(IM_MAKE_ALIAS[w]&&k.indexOf(IM_MAKE_ALIAS[w])!==0)return IM_MAKE_ALIAS[w];return k;}
function imModelToks(s){return imNorm(imStripDrive(s)).split(' ').filter(function(t){return t&&['the','and','coupe','tribute','replica','car','lhd','rhd','pink','left','right','hand','drive'].indexOf(t)<0;});}
// 0..1 how alike two models are; -1 when their numbers say they are different models (Defender 90 vs 110)
function imModelSim(a,b){
  var A=imModelToks(a),B=imModelToks(b);if(!A.length||!B.length)return 0;
  var na=A.filter(function(t){return /^\d+$/.test(t);}),nb=B.filter(function(t){return /^\d+$/.test(t);});
  if(na.length&&nb.length&&!na.some(function(t){return nb.indexOf(t)>=0;}))return -1;
  var hit=A.filter(function(t){return B.indexOf(t)>=0;}).length;return hit/Math.min(A.length,B.length);
}
// ---------- records: rows we cannot use are kept with a reason, never dropped ----------
function imRecords(grid,map){
  var out=[];
  for(var i=0;i<grid.length;i++){
    var row=grid[i]||[],raw={};
    for(var k in map)if(map.hasOwnProperty(k))raw[k]=row[map[k]]==null?'':String(row[map[k]]);
    if(imIsData(raw)){var c=imClean(raw);c.n=out.length+1;c.raw=raw;out.push(c);continue;}
    var name=(imCell(raw.make)+' '+imCell(raw.model)).trim();
    var other=['model','reg','color','paid','loc','miles'].filter(function(k){return imCell(raw[k]);}).length;
    if(name&&imCell(raw.make)&&other>=1&&name.split(/\s+/).length<=6&&name.length<=60&&!/^unclear/i.test(imCell(raw.make))){var b=imClean(raw);b.n=out.length+1;b.raw=raw;b.bad='No year or VIN on the sheet';out.push(b);}
  }
  return out;
}
// ---------- PDF: split merged text runs into words, keep reading past headings and gaps ----------
var IM_CTX=null;
function imWords(it){
  var ws=it.s.split(/\s+/).filter(Boolean);if(ws.length<2)return [it];
  if(!IM_CTX){try{IM_CTX=document.createElement('canvas').getContext('2d');}catch(e){IM_CTX=null;}}
  var wid=function(s){if(IM_CTX){IM_CTX.font=Math.max(6,it.h)+'px Helvetica, Arial, sans-serif';return IM_CTX.measureText(s).width;}return s.length;};
  var lens=ws.map(wid),sp=wid(' '),tot=lens.reduce(function(a,b){return a+b;},0)+sp*(ws.length-1),k=tot>0?it.w/tot:1,x=it.x,out=[];
  ws.forEach(function(s,i){out.push({s:s,x:x,y:it.y,w:lens[i]*k,h:it.h});x+=(lens[i]+sp)*k;});
  return out;
}
function imPdfTable(pdf){
  var hdrNames=null,recs=[],cols=null,expect=0,yc=-1,vc=-1;
  pdf.pages.forEach(function(lines){
    var hi=-1;for(var i=0;i<lines.length;i++){var t=imNorm(lines[i].text);if(/\bmake\b/.test(t)&&(/\bvin\b/.test(t)||/\byear\b/.test(t))){hi=i;break;}}
    if(hi>=0){cols=imPdfHeaderCols(lines[hi]);if(!hdrNames){hdrNames=cols.map(function(c){return c.s;});hdrNames.forEach(function(h,j){var f=imHeaderField(h);if(f==='year'&&yc<0)yc=j;if(f==='vin'&&vc<0)vc=j;});}}
    else if(!cols)return; // no header seen yet
    var cur=null,lastY=null,gap=[];
    function span(j){return [j===0?-1e9:cols[j].x-4,j===cols.length-1?1e9:cols[j+1].x-4];}
    function colOf(it){if(/^[~$\u20ac\u00a3]/.test(it.s)||/^\d[\d,.]*$/.test(it.s)&&it.s.length>4){var e=it.x+it.w-2;for(var q=0;q<cols.length;q++){var sq=span(q);if(e>=sq[0]&&e<sq[1])return q;}}var best=0,bo=-1;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>bo){bo=o;best=j;}}return best;}
    for(var i2=hi+1;i2<lines.length;i2++){
      var ln=lines[i2],words=[];ln.items.forEach(function(it){imWords(it).forEach(function(w){words.push(w);});});
      if(!words.length||/^page \d+( of \d+)?$/i.test(ln.text.trim()))continue;
      if(yc>=0&&words.some(function(w){return colOf(w)===yc&&/^(18[89]\d|19\d\d|20\d\d)$/.test(w.s);}))expect++;
      var first=words[0],startsRec=colOf(first)===0&&/^\d{1,3}$/.test(first.s);
      var wide=ln.items.some(function(it){var n=0;for(var j=0;j<cols.length;j++){var s=span(j),o=Math.min(it.x+it.w,s[1])-Math.max(it.x,s[0]);if(o>8)n++;}return n>2&&it.s.split(/\s+/).length>6;});
      if(!startsRec&&(colOf(first)===0||wide)){cur=null;lastY=null;continue;} // heading or note: skip it, keep reading
      if(lastY!==null&&cur&&!startsRec){var d=ln.y-lastY,med=gap.length?gap.slice().sort(function(a,b){return a-b;})[Math.floor(gap.length/2)]:ln.h*1.3;if(d>Math.max(med*2.2,ln.h*2.4)){cur=null;lastY=null;continue;}gap.push(d);}
      if(startsRec){cur={cells:cols.map(function(){return '';})};recs.push(cur);gap=[];words=words.slice(1);}
      lastY=ln.y;if(!cur)continue;
      words.forEach(function(w){var k=colOf(w);cur.cells[k]=(cur.cells[k]?cur.cells[k]+' ':'')+w.s;});
    }
  });
  if(!hdrNames)return null;
  var grid=recs.map(function(r){var c=r.cells.map(function(s){return s.replace(/-\s+(?=[a-z])/g,'-').replace(/\s+/g,' ').trim();});
    // a year cell that swallowed the VIN: "1961 229451" -> year 1961, VIN 229451
    if(yc>=0){var m=/^(18[89]\d|19\d\d|20\d\d)\b\s*(.*)$/.exec(c[yc]);if(m&&m[2]){c[yc]=m[1];if(vc>=0)c[vc]=(m[2]+' '+(c[vc]||'')).trim();}}
    return c;});
  IM_PDF.expect=Math.max(expect,recs.length);
  return {hdr:hdrNames,grid:grid};
}
// ---------- reading: count what the sheet had vs what we read; AI fallback for PDFs ----------
async function imReadFile(file){
  IM_PDF.expect=0;
  var out=await imReadFileBase(file),good=out.rows.filter(function(r){return !r.bad;}).length;
  out.expected=Math.max(IM_PDF.expect||0,out.rows.length);
  if(out.how==='pdf'&&good<out.expected&&imAiOk()){
    try{var buf=await file.arrayBuffer();var ai=await imAi({mode:'rows',mime:'application/pdf',file_base64:imB64(buf)});IM.usedAi=true;
      var rows=(Array.isArray(ai.rows)?ai.rows:[]).map(function(r){return {year:r.year,make:r.make,model:r.model,vin:r.vin,reg:[r.registration,r.region].filter(Boolean).join(' / '),color:r.colour||r.color,miles:r.mileage,paid:r.paid,loc:r.location,ins:r.insurance};}).filter(imIsData).map(function(raw,i){var c=imClean(raw);c.n=i+1;c.raw=raw;return c;});
      if(rows.length>good){out.rows=rows.slice(0,500);out.how='ai';out.aiFallback=true;}
    }catch(e){out.aiError=(e&&e.message)||'AI reading failed';}
  }
  out.read=out.rows.filter(function(r){return !r.bad;}).length;
  return out;
}
function imReadNote(){
  var f=IM.file||{},n=f.expected||0,m=f.read!=null?f.read:(IM.rows||[]).length;
  if(n&&m<n)return '<div class="im-err" role="alert"><b>The sheet has '+n+' rows. We could read '+m+'.</b> Check the missing cars before saving, or try an Excel or CSV copy.'+(f.aiError?' AI reading did not work: '+imE(f.aiError):'')+'</div>';
  return '<div class="im-ok">The sheet has '+(n||m)+' row'+((n||m)===1?'':'s')+'. All '+m+' were read'+(f.aiFallback?' (by AI)':'')+'.</div>';
}
function imStep2(){var h=imStep2Base();var i=h.indexOf('</div></div>');return i>0?h.slice(0,i+12)+imReadNote()+h.slice(i+12):imReadNote()+h;}
// ---------- analysis ----------
function imFlags(f){var L=[];
  if(f.vin&&f.vin.length===17&&!(Number(f.year)&&Number(f.year)<1981)){var e=imVinExpect(f.vin);if(e===null||e!==f.vin[8])L.push(e===null?'VIN has letters VINs never use (I, O or Q)':'VIN check digit should be '+e+', the sheet has '+f.vin[8]);}
  if(f.paid&&f.paid<100)L.push('What you paid looks too low ('+imFmt('paid',{v:f.paid,cur:f.cur})+'). Check the sheet');
  return L;}
function imAnalyze(rows,owner,pfId,res){
  res=res||{};
  var col=imCollection(owner),out={rows:[],changes:[],news:[],conflicts:[],prompts:[],matched:{},skip:{}},taken={};
  var pre=rows.map(function(r,ri){
    var o={ri:ri,n:r.n,r:r,f:null,block:null};
    if(r.bad){o.block={type:'bad',reason:r.bad};return o;}
    for(var k in r.u)if(r.u.hasOwnProperty(k)){
      var key='u'+ri+':'+k,x=r.u[k],core=(k==='year'||k==='make'||k==='model');
      var shown=k==='miles'&&x.km?(Number(x.val.v).toLocaleString('en-US')+' km = '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi'):imFmt(k,k==='miles'?x.val.v:x.val);
      if(res[key]==='skipcar'){o.block={type:'skipped',reason:'You chose to skip this car'};return o;}
      if(!res[key])out.conflicts.push({key:key,ri:ri,type:'unclear',field:k,blocking:core,title:(x.km?'Mileage in km':IM_LABEL[k]+' unclear on sheet'),car:imCarName(r.f)||('Row '+r.n),lines:[['Sheet says',shown]],note:core?'This car is waiting for your answer.':'Left blank unless you choose Use it.',opts:[{v:'use',label:x.km?'Use '+Math.round(x.val.v*0.621371).toLocaleString('en-US')+' mi':'Use it',gold:true},{v:core?'skipcar':'skip',label:core?'Skip this car':'Leave blank'}]});
      if(core&&!res[key])o.block={type:'needs',reason:IM_LABEL[k]+' unclear on the sheet'};
    }
    o.f=imRowFields(r,ri,res);
    if(!o.block&&!o.f.make&&!o.f.model)o.block={type:'bad',reason:'No make or model'};
    return o;
  });
  // pass 1: exact VIN / chassis or plate
  pre.forEach(function(o){if(o.block)return;var f=o.f,vin=imVinClean(f.vin),pk=imPlateKey(f.plate);
    var m=col.filter(function(v){var vv=imVinClean(v.vin);if(vin&&vv&&vv!==vin)return false;return (vin.length>=5&&vv&&vv===vin)||(pk.length>=3&&imPlateKey(v.plate)===pk&&!(vin&&!vv&&imVinRulesOut(vin,v)));})[0];
    if(m&&!taken[m.id]){o.m=m;o.how=imVinClean(m.vin)===vin&&vin?(vin.length===17?'VIN':'chassis number'):'registration';taken[m.id]=o.ri;}});
  // pass 2: "Same car?" only when one side has no VIN (differing VINs = different cars); the VIN decode can rule a candidate out
  pre.forEach(function(o){if(o.block||o.m)return;var f=o.f,mk=imMakeKey(f.make),vin=imVinClean(f.vin),cands=[];
    col.forEach(function(v){if(taken[v.id]!==undefined)return;if(imMakeKey(v.make)!==mk)return;var vv=imVinClean(v.vin);if(vin&&vv&&vin!==vv)return;if(vin&&!vv&&imVinRulesOut(vin,v))return;if(vv&&!vin&&f.make&&imVinRulesOut(vv,{make:f.make,model:f.model}))return;
      var sim=imModelSim(f.model,v.model),dy=(Number(f.year)&&Number(v.year))?Math.abs(Number(f.year)-Number(v.year)):99;
      if(sim<0)return;
      if((sim>=0.5&&dy<=3)||dy===0)cands.push({v:v,sim:sim,dy:dy,strong:sim===1&&dy<=2});});
    cands.sort(function(a,b){return (b.strong-a.strong)||(a.dy-b.dy)||(b.sim-a.sim);});
    if(!cands.length)return;
    var key='m'+o.ri,ch=res[key],def=(cands[0].strong&&!(cands[1]&&cands[1].strong&&cands[1].dy===cands[0].dy))?cands[0].v.id:'new';
    o.prompt={key:key,ri:o.ri,cands:cands.slice(0,3),def:def};
    var pick=ch||def;
    if(pick==='skip'){o.block={type:'skipped',reason:'You chose to skip this car'};}
    else if(pick!=='new'){var mv=col.filter(function(v){return v.id===pick;})[0];if(mv&&taken[mv.id]===undefined){o.m=mv;o.how=ch?'your answer':(o.prompt.cands[0].dy===0?'same year, make and model':'same make and model (year differs)');taken[mv.id]=o.ri;}}
    out.prompts.push({key:key,ri:o.ri,car:imCarName(f)+(f.vin?' \u00b7 '+f.vin:''),cands:o.prompt.cands.map(function(c){return {id:c.v.id,name:imVName(c.v)+(c.v.vin?' \u00b7 '+c.v.vin:''),dy:c.dy};}),pick:pick,def:def,chosen:!!ch});
  });
  pre.forEach(function(o){
    var f=o.f,row={ri:o.ri,n:o.n,car:o.f?(imCarName(o.f)||('Row '+o.n)):('Row '+o.n),flags:o.f?imFlags(o.f):[]};
    if(o.block){row.bucket=o.block.type==='skipped'?'skipped':'needs';row.reason=o.block.reason;out.rows.push(row);if(o.block.type==='skipped')out.skip[o.ri]=1;return;}
    if(o.m&&typeof PO!=='undefined'&&PO.on&&pfId&&poOf(o.m,owner).id!==pfId){var pk='p'+o.ri,pc=res[pk],pfName=function(v){return poOf(v,owner).name;};
      if(pc==='skip'){row.bucket='skipped';row.reason='You chose to skip it (it is in '+pfName(o.m)+')';out.skip[o.ri]=1;out.rows.push(row);return;}
      if(pc!=='here')out.conflicts.push({key:pk,ri:o.ri,type:'otherpf',title:'Already in another portfolio',car:imVName(o.m),lines:[['Portfolio',pfName(o.m)]],note:'This car is already in your collection, in '+pfName(o.m)+'. It will be updated there and stays in that portfolio.',opts:[{v:'here',label:'Update it there',gold:true},{v:'skip',label:'Skip'}]});}
    if(o.m){var m=o.m;out.matched[o.ri]=m.id;row.vid=m.id;row.match=imVName(m);row.how=o.how;var fills=0,reps=0;
      IM_ORDER.forEach(function(k){
        var sv=imSheetVal(f,k);if(imEmpty(sv))return;var cv=imCur(m,k);
        if(k==='make')return;if(k==='model'&&!imEmpty(cv))return;
        if(imSame(k,cv,sv))return;
        var kind=imEmpty(cv)?'fill':'replace',ck='c'+o.ri+':'+k;
        out.changes.push({key:ck,ri:o.ri,vid:m.id,field:k,car:imVName(m),cur:imFmt(k,cv),val:imFmt(k,sv),raw:sv,kind:kind});
        if(kind==='fill')fills++;else reps++;});
      row.fills=fills;row.reps=reps;row.bucket=(fills||reps)?'update':'unchanged';
      row.reason=(/answer|same/.test(o.how)?'Suggested match ('+o.how+'): your ':'Matched by '+o.how+' to your ')+imVName(m)+(fills?' \u00b7 '+fills+' blank'+(fills===1?'':'s')+' filled':'')+(reps?' \u00b7 '+reps+' different value'+(reps===1?'':'s')+' to approve':'')+(!fills&&!reps?' \u00b7 nothing new on the sheet':'');
      out.rows.push(row);return;}
    if(!f.year||!f.make){row.bucket='needs';row.reason='Year or make missing, so it cannot be added';out.rows.push(row);
      out.conflicts.push({key:'n'+o.ri,ri:o.ri,type:'incomplete',blocking:true,title:'Year or make missing',car:row.car,lines:[['Sheet row',String(o.n)]],note:'A new car needs a year and make. Add this one by hand.',opts:[]});return;}
    var y=toInt(f.year);if(!y||y<1885||y>new Date().getFullYear()+2){row.bucket='needs';row.reason='Year '+f.year+' is not valid';out.rows.push(row);return;}
    var ak='a'+o.ri;
    out.news.push({key:ak,ri:o.ri,f:f,prompt:!!o.prompt});
    if(IM.add[ak]===false){row.bucket='skipped';row.reason='You chose Skip';}
    else{row.bucket='new';row.reason=o.prompt?'Not matched (you can say it is the same as one of your cars)':'Not in your app yet';}
    out.rows.push(row);
  });
  out.rows.forEach(function(r){r.flags.forEach(function(fl){out.conflicts.push({key:'f'+r.ri+fl.length,ri:r.ri,type:'flag',blocking:false,title:'Please check',car:r.car,lines:[],note:fl,opts:/^VIN/.test(fl)?[{v:'edit',label:'Edit VIN',gold:true}]:[]});});});
  out.conflicts.forEach(function(c){if(c.type==='flag'&&c.opts.length)c.key='vin'+c.ri;});
  return out;
}
function imChangeOn(x){return x.kind==='fill'?IM.appr[x.key]!==false:IM.appr[x.key]===true;}
function imAddOn(x){return IM.add[x.key]!==false;}
function imPlanCounts(A){var vids={};A.changes.forEach(function(x){if(imChangeOn(x))vids[x.vid]=1;});return {add:A.news.filter(imAddOn).length,upd:Object.keys(vids).length};}
function imApprovedCount(A){var c=imPlanCounts(A);return c.add+c.upd;}
// ---------- review ----------
function imToReview(){
  if(!IM.owner){IM.msg='Choose whose collection these vehicles belong to.';imRender();return;}
  return (async function(){
    if(IM.newPf){var nm=cleanText(IM.newPf.name,80);if(!nm){IM.msg='Give the new portfolio a name.';imRender();return;}
      IM.busy=true;IM.msg='';imRender();
      try{IM.pfId=await poCreate(IM.owner,nm,IM.newPf.country,IM.newPf.currency);IM.newPf=null;audit('portfolio.created','Portfolio created: '+nm,{clientId:IM.owner});}catch(e){IM.busy=false;IM.msg=e.message||'Could not create the portfolio.';imRender();return;}
      IM.busy=false;}
    var A=imA();IM.msg='';IM.step=3;IM.tab=A.prompts.length||A.conflicts.some(function(c){return c.blocking;})?'check':(A.news.length?'new':'changes');imRender();
  })();
}
function imBucketCounts(A){var c={new:0,update:0,unchanged:0,needs:0,skipped:0};A.rows.forEach(function(r){c[r.bucket]=(c[r.bucket]||0)+1;});return c;}
function imStep3(){
  var A=imA(),pc=imPlanCounts(A),bc=imBucketCounts(A),nCheck=A.prompts.length+A.conflicts.length+A.changes.filter(function(x){return x.kind==='replace';}).length;
  var tabs=[['new','New cars',A.news.length],['changes','Updates',A.changes.length],['check','Check',nCheck],['all','All rows',A.rows.length]];
  var h='<h1 class="im-h1">Review</h1>'+
    '<div class="im-card im-sum"><div class="im-sum-g"><div><b>'+bc.new+'</b><span>New</span></div><div><b>'+bc.update+'</b><span>Update</span></div><div><b>'+bc.unchanged+'</b><span>Unchanged</span></div><div'+(bc.needs?' class="warn"':'')+'><b>'+bc.needs+'</b><span>Needs you</span></div></div>'+
    '<div class="im-txt">'+A.rows.length+' row'+(A.rows.length===1?'':'s')+' from the sheet'+(bc.skipped?' \u00b7 '+bc.skipped+' skipped':'')+'</div></div>';
  h+='<div class="im-tabs" role="tablist">'+tabs.map(function(t){return '<button role="tab" aria-selected="'+(IM.tab===t[0])+'" class="im-tab'+(IM.tab===t[0]?' on':'')+(t[0]==='check'&&t[2]?' warn':'')+'" onclick="IM.tab=\''+t[0]+'\';imRender()">'+t[1]+' <span class="im-n">'+t[2]+'</span></button>';}).join('')+'</div>'+imErr();
  if(IM.tab==='new')h+=imTabNew(A);else if(IM.tab==='changes')h+=imTabChanges(A);else if(IM.tab==='check')h+=imTabCheck(A);else h+=imTabAll(A);
  var lbl=IM.busy?'Saving... '+(IM.prog||''):(pc.add||pc.upd)?'Save: add '+pc.add+' car'+(pc.add===1?'':'s')+', update '+pc.upd:'Nothing to save';
  h+='<div class="im-savebar"><button class="im-btn gold" '+((pc.add||pc.upd)&&!IM.busy?'':'disabled')+' onclick="imSave()">'+lbl+'</button></div>';
  return h;
}
function imTabNew24(A){
  if(!A.news.length)return '<div class="im-empty">No new cars on this sheet.</div>';
  var pf=poList(IM.owner).filter(function(p){return p.id===IM.pfId;})[0]||poDefault(IM.owner),on=A.news.filter(imAddOn).length;
  var h='<p class="im-lead">'+on+' of '+A.news.length+' car'+(A.news.length===1?'':'s')+' will be added to '+imE(pf.name)+'. Anything the sheet does not have shows as Missing.</p>';
  A.news.forEach(function(x){var st=imAddOn(x),cb=st?cbImUI(x.ri,x.f,null):'',held=cb&&cbImHeld(x.ri,x.f,null),f=x.f;
    if(cb){f=JSON.parse(JSON.stringify(x.f));f.paid=null;}
    h+='<div class="im-item'+(st?'':' off')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(imCarName(x.f))+'</div>'+imNewLines(f)+(cb?'<div class="im-cap gold cb-cap">What you paid</div>'+cb:'')+(x.prompt?'<div class="im-txt gold">Might be one of your cars. See Check.</div>':'')+
      (st?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be added \u00b7 confirm later':'\u2713 Will be added')+'</span><button class="im-btn sm line" onclick="imAdd(\''+x.key+'\',false)">Skip</button></div>':
      '<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm gold" onclick="imAdd(\''+x.key+'\',null)">Add it</button></div>')+'</div>';});
  return h;
}
function imTabChanges24(A){
  if(!A.changes.length)return '<div class="im-empty">No changes to your existing cars.</div>';
  var reps=A.changes.filter(function(x){return x.kind==='replace'&&!imChangeOn(x);}).length;
  var h='<p class="im-lead">Blank details are filled in for you. A different value only replaces yours if you approve it.</p>';
  if(reps)h+='<button class="im-btn line" onclick="imApproveAll()">Approve all '+reps+' replacement'+(reps===1?'':'s')+'</button>';
  A.changes.forEach(function(x){var on=imChangeOn(x),cb=x.field==='paid'&&on?cbImUI(x.ri,cbImRowF(x.ri),x.vid):'',held=cb&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid);
    h+='<div class="im-item'+(on?'':' off')+(held?' cb-hold':'')+'"><div class="im-car">'+imE(x.car)+'</div><div class="im-fl">'+imE(IM_LABEL[x.field])+(x.kind==='fill'?' \u00b7 blank, will be filled':' \u00b7 replaces your value')+'</div>'+
      (cb?'<div class="im-pair one"><div><div class="im-cap">Current</div><div class="im-v'+(x.cur?'':' blank')+'">'+(x.cur?imE(x.cur):'Blank')+'</div></div></div><div class="im-cap gold cb-cap">Sheet</div>'+cb:imPair(x.cur,x.val))+
      (x.kind==='fill'?(on?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will be filled \u00b7 confirm later':'\u2713 Will be filled')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',false)">Skip</button></div>':'<div class="im-acts"><span class="im-state">Skipped</span><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',null)">Fill it</button></div>'):
      (on?'<div class="im-acts"><span class="im-state '+(held?'cb-need':'ok')+'">'+(held?'\u2713 Will replace \u00b7 confirm later':'\u2713 Will replace')+'</span><button class="im-btn sm line" onclick="imAppr(\''+x.key+'\',null)">Keep mine</button></div>':'<div class="im-acts"><button class="im-btn sm gold" onclick="imAppr(\''+x.key+'\',true)">Replace</button><span class="im-state">Keeping yours</span></div>'))+'</div>';});
  return h;
}
function imTabCheck(A){
  var reps=A.changes.filter(function(x){return x.kind==='replace';});
  if(!A.prompts.length&&!A.conflicts.length&&!reps.length)return '<div class="im-empty">All clear. Nothing to check.</div>';
  var h='';
  if(A.prompts.length){h+='<p class="im-lead"><b>Same car?</b> These look like cars you already have. Nothing is matched unless the VIN, chassis or registration is the same, so please check.</p>';
    A.prompts.forEach(function(p){
      h+='<div class="im-item im-conf"><div class="im-ct">Same car?</div><div class="im-car">'+imE(p.car)+'</div>'+p.cands.map(function(c){return '<div class="im-kv"><span>Your car</span><b>'+imE(c.name)+(c.dy&&c.dy<99?' ('+c.dy+' yr apart)':'')+'</b></div>';}).join('')+
        '<div class="im-txt">'+(p.pick==='new'?'Will be added as a new car.':p.pick==='skip'?'Skipped.':'Will update your '+imE((p.cands.filter(function(c){return c.id===p.pick;})[0]||{}).name||'car')+'.')+(p.chosen?'':' (suggested)')+'</div>'+
        '<div class="im-acts stack">'+p.cands.map(function(c){return '<button class="im-btn sm '+(p.pick===c.id?'gold':'line')+'" onclick="imResolve(\''+p.key+'\',\''+c.id+'\')">'+(p.pick===c.id?'\u2713 ':'')+'Same as '+imE(c.name)+'</button>';}).join('')+
        '<button class="im-btn sm '+(p.pick==='new'?'gold':'line')+'" onclick="imResolve(\''+p.key+'\',\'new\')">'+(p.pick==='new'?'\u2713 ':'')+'No, add as new</button></div></div>';});}
  if(A.conflicts.length){h+='<p class="im-lead"><b>Please check</b></p>';
    A.conflicts.forEach(function(x){
      h+='<div class="im-item im-conf"><div class="im-ct">'+imE(x.title)+'</div><div class="im-car">'+imE(x.car)+'</div>'+x.lines.map(function(l){return '<div class="im-kv"><span>'+imE(l[0])+'</span><b>'+imE(l[1])+'</b></div>';}).join('')+(x.note?'<div class="im-txt">'+imE(x.note)+'</div>':'');
      if(IM.edit===x.key)h+='<label class="im-lab" for="im-edit-in">Correct VIN</label><input id="im-edit-in" class="im-in mono" maxlength="24" value="'+imE((A.rows.filter(function(r){return r.ri===x.ri;})[0]||{}).vin||'')+'" autocapitalize="characters"><div class="im-acts"><button class="im-btn sm gold" onclick="imEditSave(\''+x.key+'\')">Save VIN</button><button class="im-btn sm line" onclick="IM.edit=null;imRender()">Cancel</button></div>';
      else if(x.opts.length)h+='<div class="im-acts wrap">'+x.opts.map(function(o){return '<button class="im-btn sm '+(o.gold?'gold':'line')+'" onclick="imResolve(\''+x.key+'\',\''+String(o.v).replace(/'/g,'')+'\')">'+imE(o.label)+'</button>';}).join('')+'</div>';
      h+='</div>';});}
  if(reps.length)h+='<p class="im-lead"><b>'+reps.length+' different value'+(reps.length===1?'':'s')+'</b> on the sheet. Yours are kept unless you approve them in Updates.</p><button class="im-btn line" onclick="IM.tab=\'changes\';imRender()">Open Updates</button>';
  return h;
}
var IM_BLABEL={new:'New',update:'Update',unchanged:'Unchanged',needs:'Needs you',skipped:'Skipped',added:'Added',updated:'Updated',failed:'Not saved'};
function imTabAll(A){return '<p class="im-lead">Every row on the sheet, and what happens to it.</p>'+A.rows.map(function(r){return '<div class="im-row b-'+r.bucket+'"><div class="im-row-t"><b>'+r.n+'. '+imE(r.car)+'</b><span>'+imE(r.reason)+'</span></div><span class="im-bk">'+IM_BLABEL[r.bucket]+'</span></div>';}).join('');}
function imAppr(k,v){if(v===null)delete IM.appr[k];else IM.appr[k]=v;imRender();}
function imAdd(k,v){if(v===null)delete IM.add[k];else IM.add[k]=v;imRender();}
function imApproveAll(){imA().changes.forEach(function(x){if(x.kind==='replace')IM.appr[x.key]=true;});imRender();}
function imAddAll(){imA().news.forEach(function(x){delete IM.add[x.key];});imRender();}
function imResolve(k,v){if(/^vin/.test(k)){if(v==='edit'){IM.edit=k;imRender();return;}IM.res[k]={keep:true};}else IM.res[k]=v;IM.edit=null;imRender();}
// ---------- save: one car at a time, wait for the cloud, report every failure ----------
function imErrText(e){var m=(e&&(e.message||e.details||e.hint))||String(e||'');if(/row-level security|permission|42501/i.test(m))return 'Not allowed to save this car (permissions).';if(/network|fetch|Failed to fetch/i.test(m))return 'No connection. Try again.';return m?m.slice(0,140):'Could not save.';}
async function imSave24(){
  if(IM.busy)return;var A=imA(),owner=IM.owner,pfId=IM.pfId,now=new Date().toISOString();
  var plan=imPlanCounts(A);if(!plan.add&&!plan.upd){IM.msg='Nothing to save.';imRender();return;}
  IM.busy=true;IM.msg='';IM.prog='';imRender();
  var cloud=typeof sb!=='undefined'&&sb&&session,results={},batch={id:IM.id||uid(),at:now,owner:owner,pf:pfId,added:[],changed:[],file:(IM.file&&IM.file.name)||''},fails=0;
  A.rows.forEach(function(r){results[r.ri]={n:r.n,car:r.car,bucket:r.bucket==='new'||r.bucket==='update'?r.bucket:r.bucket,reason:r.reason,fields:[],vid:r.vid};});
  try{if(cloud&&Q&&Q.chain)await Q.chain;}catch(e){}
  var later=0;
  A.changes.forEach(function(x){if(x.field!=='paid')return;var r=cbImReason(x.ri,cbImRowF(x.ri),x.vid);x.raw=JSON.parse(JSON.stringify(x.raw));x.raw.cbFlag=r;if(r&&imChangeOn(x))later++;});
  A.news.forEach(function(x){var r=cbImReason(x.ri,x.f,null);x.f.cbFlag=r;if(r&&imAddOn(x))later++;});
  var vehicles=getVehicles(),byV={},jobs=[];
  A.changes.forEach(function(x){if(imChangeOn(x))(byV[x.vid]=byV[x.vid]||[]).push(x);});
  Object.keys(byV).forEach(function(vid){var v=byId(vehicles,vid);var ri=byV[vid][0].ri;
    if(!v||isArchivedVehicle(v)||!canEditVehicle(v)){results[ri].bucket='failed';results[ri].reason='You cannot edit this car';fails++;return;}
    jobs.push({type:'update',vid:vid,ri:ri,xs:byV[vid]});});
  var canAdd=canAddVehicleFor(owner);
  A.news.forEach(function(x){if(!imAddOn(x))return;
    if(!canAdd){results[x.ri].bucket='failed';results[x.ri].reason='You cannot add cars to this collection';fails++;return;}
    var nv=imNewVehicle(x.f,owner,pfId,now);if(!nv){results[x.ri].bucket='failed';results[x.ri].reason='Year is not valid';fails++;return;}
    jobs.push({type:'add',nv:nv,ri:x.ri});});
  // rows matched but with nothing applied are unchanged
  A.rows.forEach(function(r){if(r.bucket==='update'&&!byV[r.vid])results[r.ri].bucket='unchanged';});
  for(var i=0;i<jobs.length;i++){var j=jobs[i];IM.prog=(i+1)+' of '+jobs.length;imRender();
    if(j.type==='add'){
      try{if(cloud)await KIND.vehicles.insert(j.nv);
        C.vehicles.push(j.nv);if(cloud&&SNAP){SNAP.vehicles=SNAP.vehicles||{};SNAP.vehicles[j.nv.id]={sig:KIND.vehicles.sig(j.nv),item:snapClone(j.nv)};}
        batch.added.push(j.nv.id);results[j.ri].bucket='added';results[j.ri].vid=j.nv.id;results[j.ri].fields=imNewLinesTxt(j.nv);
      }catch(e){fails++;results[j.ri].bucket='failed';results[j.ri].reason=imErrText(e);}
    }else{
      var cur=byId(getVehicles(),j.vid),nv2=JSON.parse(JSON.stringify(cur)),props=[],before={},after={};
      j.xs.forEach(function(x){IM_PROPS[x.field].forEach(function(p){if(props.indexOf(p)<0)props.push(p);});});
      props.forEach(function(p){before[p]=nv2[p]===undefined?null:nv2[p];});
      j.xs.forEach(function(x){imSetProp(nv2,x.field,x.raw);});
      props.forEach(function(p){after[p]=nv2[p]===undefined?null:nv2[p];});nv2.updatedAt=now;
      try{var prev=cloud&&SNAP&&SNAP.vehicles&&SNAP.vehicles[j.vid]?SNAP.vehicles[j.vid].item:cur;
        if(cloud)await KIND.vehicles.update(nv2,prev);
        C.vehicles=C.vehicles.map(function(v){return v.id===j.vid?nv2:v;});
        if(cloud&&SNAP&&SNAP.vehicles)SNAP.vehicles[j.vid]={sig:KIND.vehicles.sig(nv2),item:snapClone(nv2)};
        batch.changed.push({id:j.vid,before:before,after:after,fields:j.xs.map(function(x){return x.field;})});
        results[j.ri].bucket='updated';results[j.ri].fields=j.xs.map(function(x){return IM_LABEL[x.field]+': '+(x.cur||'Blank')+' \u2192 '+x.val;});
      }catch(e){fails++;results[j.ri].bucket='failed';results[j.ri].reason=imErrText(e);}
    }
  }
  if(!cloud)setVehicles(C.vehicles);
  IM.prog='';
  if(batch.added.length||batch.changed.length){
    batch.changed.forEach(function(c){var v=byId(getVehicles(),c.id);audit('vehicle.updated','Updated from master sheet ('+c.fields.map(function(k){return IM_LABEL[k];}).join(', ')+'): '+vName(v),{clientId:owner,vehicleId:c.id});});
    batch.added.forEach(function(id){var nv=byId(getVehicles(),id);audit('vehicle.created','Vehicle added from master sheet: '+vName(nv)+' ('+imVName(nv)+')',{clientId:owner,vehicleId:id});});
    var sigs={},vs=getVehicles();batch.added.forEach(function(id){var v=byId(vs,id);if(v)sigs[id]=unSig(v);});batch.sigs=sigs;batch.db=false;
    var all=imBatches();all.push(batch);imSaveBatches(all);
    if(cloud){try{var r=await sb.rpc('record_import_batch',{p_id:batch.id,p_owner:owner,p_portfolio:isUuid(pfId)?pfId:null,p_file:batch.file,p_added:batch.added.slice(),p_changed:unChangedForDb(batch.changed)});if(r&&!r.error)unMark(batch.id,{db:true});}catch(e){}}
  }
  var pf=poList(owner).filter(function(p){return p.id===pfId;})[0]||poDefault(owner);
  IM.busy=false;
  IM.done={cbLater:later,batch:batch,results:Object.keys(results).map(function(k){return results[k];}).sort(function(a,b){return a.n-b.n;}),fails:fails,pf:pf.name,expected:(IM.file&&IM.file.expected)||0,read:(IM.file&&IM.file.read!=null)?IM.file.read:A.rows.length};
  IM.step=4;IM.view='';imRender();
  if(fails)showToast(fails+' car'+(fails===1?'':'s')+' could not be saved. See the list.','error');else showToast('Import saved','success');
}
function imNewLinesTxt(v){var L=[];if(v.vin)L.push('VIN '+v.vin);if(v.plate)L.push('Reg '+v.plate);if(v.color)L.push(v.color);if(Number(v.purchasePrice)>0)L.push(imFmt('paid',{v:Number(v.purchasePrice),cur:v.currency||'USD'}));if(v.location)L.push(v.location);return L;}
function imRetry(){IM.step=3;IM.done=null;IM.tab='all';imRender();}
function imStep4Base(){
  var d=IM.done,b=d.batch,R=d.results||[],g=function(k){return R.filter(function(r){return r.bucket===k;});};
  var ad=g('added'),up=g('updated'),un=g('unchanged'),nd=g('needs'),sk=g('skipped'),fl=g('failed');
  var h='<div class="im-done"><div class="im-big '+(fl.length?'bad':'ok')+'">'+(fl.length?'!':'\u2713')+'</div><h1 class="im-h1">'+(fl.length?'Saved, with problems':'Import saved')+'</h1>'+
    '<p class="im-lead im-sumline"><b>'+ad.length+' added, '+up.length+' updated, '+un.length+' unchanged</b>'+(nd.length?', '+nd.length+' need you':'')+(sk.length?', '+sk.length+' skipped':'')+(fl.length?', '+fl.length+' not saved':'')+'.</p>';
  if(d.expected&&d.read<d.expected)h+='<div class="im-err" role="alert"><b>The sheet has '+d.expected+' rows. We read '+d.read+'.</b> The others are not in this import.</div>';
  else h+='<div class="im-ok">All '+R.length+' rows on the sheet are accounted for.</div>';
  if(d.cbLater&&!d.undone)h+='<div class="im-kv cb-kv"><span>Costs to confirm</span><b>'+d.cbLater+'</b></div><p class="im-lead">Open each car to confirm or fix what you paid.</p>';
  function sec(title,list,cls,lines){if(!list.length)return '';return '<div class="im-card im-res '+cls+'"><div class="im-cap">'+title+' \u00b7 '+list.length+'</div>'+list.map(function(r){return '<div class="im-res-r"><b>'+imE(r.car)+'</b>'+(lines?lines(r):'')+'</div>';}).join('')+'</div>';}
  h+=sec('Could not save',fl,'bad',function(r){return '<span class="bad">'+imE(r.reason)+'</span>';});
  h+=sec('Added to '+imE(d.pf),ad,'',function(r){return r.fields&&r.fields.length?'<span>'+imE(r.fields.join(' \u00b7 '))+'</span>':'<span>Details missing. Add them on the car page.</span>';});
  h+=sec('Updated',up,'',function(r){return r.fields.map(function(f){return '<span>'+imE(f)+'</span>';}).join('');});
  h+=sec('Needs you',nd,'warn',function(r){return '<span>'+imE(r.reason)+'</span>';});
  h+=sec('Unchanged',un,'',function(r){return '<span>'+imE(r.reason)+'</span>';});
  h+=sec('Skipped',sk,'',function(r){return '<span>'+imE(r.reason)+'</span>';});
  if(fl.length||nd.length)h+='<button class="im-btn gold" onclick="imRetry()">'+(fl.length?'Try the failed cars again':'Review the rows that need you')+'</button>';
  h+='<button class="im-btn '+(fl.length||nd.length?'line':'gold')+'" onclick="imClose()">View collection</button>';
  if(b.added.length||b.changed.length)h+='<button class="im-btn line red" onclick="imUndo(\''+b.id+'\')">\u21b6 Undo this import</button><p class="im-lead un-note">You can undo this for 30 days.</p>';
  return h+unRecentCard()+'</div>';
}

function cbImPending(A){var n=0;A.changes.forEach(function(x){if(x.field==='paid'&&imChangeOn(x)&&cbImHeld(x.ri,cbImRowF(x.ri),x.vid))n++;});A.news.forEach(function(x){if(imAddOn(x)&&cbImHeld(x.ri,x.f,null))n++;});return n;}
// p21 assigns its own imTabNew/imTabChanges/imSave at run time; install the v24 versions after it.
imTabNew=imTabNew24;imTabChanges=imTabChanges24;imSave=imSave24;

// ---------- v24b (Wade): VIN/chassis decides identity ----------
// Normalized VIN: uppercase, no spaces or dashes. Same VIN = same car; both VINs present and different = different cars.
function imVinClean(s){s=String(s||'').replace(/^(chassis|vin|serial|frame)(\s*(number|no\.?|#))?\s*[:#-]?\s*/i,'');return s.replace(/[\s\-\u2013\u2014.\/]+/g,'').toUpperCase().slice(0,24);}
var IM_WMI={SAL:'Land Rover',SAJ:'Jaguar',SCB:'Bentley',SCA:'Rolls Royce',SCF:'Aston Martin',SD7:'Aston Martin',ZAR:'Alfa Romeo',ZAS:'Alfa Romeo',ZFA:'Fiat',ZFF:'Ferrari',ZHW:'Lamborghini',WMW:'Mini',WUA:'Audi',WAU:'Audi',WP0:'Porsche',WP1:'Porsche',WBA:'BMW',WDB:'Mercedes Benz',WDD:'Mercedes Benz',WVW:'Volkswagen',WV2:'Volkswagen',VF1:'Renault',SFD:'Ford',WF0:'Ford'};
// Model from the VDS, only where the code is unambiguous.
function imVinDecode(vin){vin=imVinClean(vin);if(vin.length!==17||/[IOQ]/.test(vin))return null;
  var make=IM_WMI[vin.slice(0,3)]||null,model=null,c4=vin[3],c45=vin.slice(3,5);if(!make)return null;
  if(make==='Land Rover'){if(c4==='E'||c45==='LD')model='Defender';else if(c4==='G'||c4==='K'||c4==='M')model='Range Rover';else if(c4==='W'||c4==='Y')model='Range Rover Sport';else if(c4==='V'||c4==='Z')model='Range Rover Evoque';else if(c4==='R'||c45==='LN'||c45==='LA')model='Discovery';}
  else if(make==='Bentley'&&c4==='C')model='Continental';
  else if(make==='Mini'&&c45==='ZC')model='Countryman';
  else if(make==='Alfa Romeo'&&vin.slice(3,6)==='916')model='Spider';
  return {make:make,model:model};}
// Does the VIN on one side rule out the car on the other? (used when only one side has a VIN)
function imVinRulesOut(vin,v){var d=imVinDecode(vin);if(!d)return '';
  if(imMakeKey(d.make)!==imMakeKey(v.make))return 'VIN is a '+d.make;
  if(d.model){var a=String(d.model).toLowerCase(),b=String(v.model||'').toLowerCase();if(b&&b.indexOf(a)<0&&a.indexOf(b)<0&&imModelSim(d.model,v.model)<0.5)return 'VIN is a '+d.make+' '+d.model;}
  return '';}
var _imFlags24=imFlags;imFlags=function(f){var L=_imFlags24(f),d=f.vin?imVinDecode(f.vin):null;
  if(d&&f.make&&imMakeKey(d.make)!==imMakeKey(f.make))L.push('VIN belongs to a '+d.make+', the sheet says '+f.make);
  else if(d&&d.model&&f.model&&imVinRulesOut(f.vin,{make:f.make,model:f.model}))L.push('VIN looks like a '+d.model+', the sheet says '+f.model);
  return L;};
