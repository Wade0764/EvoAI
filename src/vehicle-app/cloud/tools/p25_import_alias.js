/* ===== p25: import duplicate check with model aliases (same release as press and hold) ===== */
var IM_FAM25=[
 {mk:'fiat',id:'fiat-500',label:'Fiat 500 / 600 family',re:/\b(jolly|500|600|nuova|giardiniera|topolino)\b/,
  ranges:[[/\bjolly\b/,1957,1974,'Fiat Jolly']]},
 {mk:'volkswagen',id:'vw-type2',label:'VW Type 2 (bus)',re:/\b(t1|t2|type 2|type ii|samba|kombi|bus|microbus|transporter|westfalia|split screen|splitscreen|bay window)\b/,
  ranges:[[/\b(t1|samba|split screen|splitscreen)\b/,1950,1967,'VW T1'],[/\b(t2|bay window)\b/,1967,1979,'VW T2']]},
 {mk:'porsche',id:'porsche-356-550',label:'Porsche 356 / 550',re:/\b(speedster|spyder|spider|550|356|replica|tribute)\b/,
  ranges:[[/\bspeedster\b/,1954,1958,'356 Speedster'],[/\b550\b/,1953,1956,'550 Spyder'],[/\b356\b/,1948,1965,'Porsche 356']],soft:/\b(replica|tribute|recreation|kit)\b/}
];
function imFam25(make,model){var mk=imMakeKey(make),m=imNorm(model);if(!m)return null;
  for(var i=0;i<IM_FAM25.length;i++){var F=IM_FAM25[i];if(F.mk===mk&&F.re.test(m))return F;}return null;}
// why the year on this side may not be the real model year ('' when it looks fine)
function imYearDoubt25(F,model,year){if(!F)return '';var m=imNorm(model),y=Number(year);
  if(F.soft&&F.soft.test(m))return 'It is a replica, so its year may be the build year.';
  if(!y)return 'The year is missing.';
  for(var i=0;i<F.ranges.length;i++){var r=F.ranges[i];if(r[0].test(m)&&(y<r[1]||y>r[2]))return 'The '+r[3]+' was made '+r[1]+'\u2013'+r[2]+', so '+y+' may be wrong.';}
  return '';}
function imPass2v25(pre,col,taken,out,res){
  var todo=[];
  pre.forEach(function(o){if(o.block||o.m)return;var f=o.f,mk=imMakeKey(f.make),vin=imVinClean(f.vin),F=imFam25(f.make,f.model),cands=[];
    var dF=imYearDoubt25(F,f.model,f.year);
    col.forEach(function(v){if(taken[v.id]!==undefined)return;if(imMakeKey(v.make)!==mk)return;var vv=imVinClean(v.vin);
      if(vin&&vv&&vin!==vv)return; // both VINs present and different = different cars
      if(vin&&!vv&&imVinRulesOut(vin,v))return;if(vv&&!vin&&f.make&&imVinRulesOut(vv,{make:f.make,model:f.model}))return;
      var sim=imModelSim(f.model,v.model),dy=(Number(f.year)&&Number(v.year))?Math.abs(Number(f.year)-Number(v.year)):99,G=imFam25(v.make,v.model);
      if(F&&G&&F.id===G.id){var dV=imYearDoubt25(G,v.model,v.year),gap=(dF||dV)?15:3;
        if(dy<=gap)cands.push({v:v,sim:Math.max(sim,0.9),dy:dy,alias:true,doubt:dF||dV,strong:dy<=2&&sim>=0.5});return;}
      if(F&&G&&F.id!==G.id)return;
      if(F&&!G&&sim<0.5)return; // e.g. a Speedster is not a 912
      if(sim<0)return;
      if((sim>=0.5&&dy<=3)||dy===0)cands.push({v:v,sim:sim,dy:dy,strong:sim===1&&dy<=2});});
    if(!cands.length)return;
    cands.sort(function(a,b){return (b.strong-a.strong)||(a.dy-b.dy)||(b.sim-a.sim);});
    todo.push({o:o,cands:cands,dF:dF});});
  // best evidence first, so a weak row cannot take a car a strong row needs
  todo.sort(function(a,b){var x=a.cands[0],y=b.cands[0];return (y.strong-x.strong)||(x.dy-y.dy)||((y.alias?1:0)-(x.alias?1:0))||(a.o.ri-b.o.ri);});
  var prompts=[];
  todo.forEach(function(t){var o=t.o,f=o.f,live=t.cands.filter(function(c){return taken[c.v.id]===undefined;});
    if(!live.length)live=t.cands; // shown for the record; picking a taken car does nothing
    var key='m'+o.ri,ch=res[key],c0=live[0],free=live.filter(function(c){return taken[c.v.id]===undefined;});
    var def='new';
    if(free.length===1&&(free[0].alias||free[0].strong))def=free[0].v.id;
    else if(free.length>1&&free[0].strong&&!(free[1].strong&&free[1].dy===free[0].dy))def=free[0].v.id;
    o.prompt={key:key,ri:o.ri,cands:live.slice(0,3),def:def};
    var pick=ch||def;
    if(pick==='skip'){o.block={type:'skipped',reason:'You chose to skip this car'};}
    else if(pick!=='new'){var mv=col.filter(function(v){return v.id===pick;})[0];var pc=live.filter(function(c){return c.v.id===pick;})[0]||c0;
      if(mv&&taken[mv.id]===undefined){o.m=mv;o.how=ch?'your answer':(pc.alias?'same car, other name: '+(f.model||'')+' = '+(mv.model||''):(pc.dy===0?'same year, make and model':'same make and model (year differs)'));taken[mv.id]=o.ri;}}
    var note=t.dF||(live.filter(function(c){return c.doubt;})[0]||{}).doubt||'';
    prompts.push({key:key,ri:o.ri,car:imCarName(f)+(f.vin?' \u00b7 '+f.vin:''),note:note,cands:o.prompt.cands.map(function(c){return {id:c.v.id,name:imVName(c.v)+(c.v.vin?' \u00b7 '+c.v.vin:''),dy:c.dy,alias:!!c.alias};}),pick:pick,def:def,chosen:!!ch});});
  prompts.sort(function(a,b){return a.ri-b.ri;});
  prompts.forEach(function(p){out.prompts.push(p);});
}
