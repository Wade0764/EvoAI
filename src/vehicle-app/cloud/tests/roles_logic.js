// Cross-feature UI logic. Official runner: tests/run_all.sh
// Run alone with: node tests/roles_logic.js
const L=require('./lib.js');const fs=require('fs');
const OUT='/opt/cursor/artifacts/roles/';
try{fs.mkdirSync(OUT,{recursive:true});}catch(e){}
const shot=async(p,n)=>{await p.screenshot({path:OUT+n});};
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
function rgbOf(cs){
  const m=String(cs||'').match(/\d+/g);if(!m||m.length<3)return null;
  return m.slice(0,3).map(Number);
}
function isGrey(rgb){
  if(!rgb)return false;
  const [r,g,b]=rgb,max=Math.max(r,g,b),min=Math.min(r,g,b);
  // mid-luminance, low saturation: typical grey body text
  return max-min<30&&r>=140&&r<=210;
}
function isWhiteOrGold(rgb){
  if(!rgb)return false;
  const [r,g,b]=rgb;
  const white=r>=220&&g>=220&&b>=210,gold=r>160&&g>120&&r>b+30,ivory=r>=230&&g>=228&&b>=210;
  return white||gold||ivory;
}
(async()=>{
  await L.launch();

  // ---- limited co-owner must not see Approve / Deny ----
  let p=await L.open({w:430,h:932});
  await L.login(p,'olivia@test.com');
  await L.sleep(400);
  let lim=await p.evaluate(()=>{
    CO.on=true;CO.of=myId();
    CO.rows=[{collection_owner_id:myId(),user_id:myId(),management:'limited',see_title_documents:false,created_at:new Date().toISOString()}];
    var o=ownerClientId(),v=getVehicles().filter(function(x){return x.clientId===o;})[0];
    RQ.on=true;RQ.rows=RQ.rows||[];
    RQ.rows.push({id:'91000000-0000-4000-a000-000000000091',owner_id:o,vehicle_id:v.id,request_kind:'estimate',decision:'pending',status:'new',work_summary:'Geometry check',price_amount:400,price_currency:'USD',proposed_start:new Date().toISOString(),proposed_tz:'UTC',duration_minutes:90,created_by:'c0000000-0000-4000-a000-000000000003',service:'maintenance'});
    odRender();
    renderRequests();
    var band=document.getElementById('cp-decide');
    var text=band?band.innerText:'';
    var btns=[].slice.call((band||document).querySelectorAll('#cp-decide button')).map(function(b){return b.textContent.trim();});
    var cards=[].slice.call(document.querySelectorAll('.rq-est .rq-acts button, .rq-est button')).map(function(b){return b.textContent.trim();});
    return {rank:coRank(),text:text,bandBtns:btns,allBtns:cards,approve:/Approve/.test(text+cards.join(' ')),deny:/Deny/.test(text+cards.join(' ')),ask:/Ask a question/.test(text+cards.join(' '))};
  });
  ok(lim.rank==='limited','test setup treats the signed-in owner as a limited co-owner');
  ok(lim.ask,'limited co-owner is offered Ask a question');
  ok(!lim.approve&&!lim.deny,'limited co-owner is not offered Approve or Deny ('+lim.bandBtns.join(', ')+')');
  await p.evaluate(()=>{var e=document.getElementById('cp-decide');if(e)e.scrollIntoView({block:'center'});});
  await shot(p,'07-limited-estimate.png');
  let tone=await p.evaluate(()=>{
    var el=document.querySelector('#co-sec .co-desc')||null;
    if(!el){coRender();el=document.querySelector('#co-sec .co-desc');}
    if(!el)return {missing:true};
    var cs=getComputedStyle(el);
    return {text:el.textContent,color:cs.color,size:parseFloat(cs.fontSize)};
  });
  ok(tone&&!tone.missing&&tone.size>=15,'co-owner explanation is at least 15px');
  var rgb=rgbOf(tone.color);
  ok(tone&&isWhiteOrGold(rgb),'co-owner explanation is white or gold, not grey ('+((tone&&tone.color)||'none')+')');
  await p.close();

  // ---- tech permissions: reminders and estimate button honor the toggles ----
  p=await L.open({w:430,h:932});
  await L.login(p,'tom@test.com','password123','advisor');
  await L.sleep(400);
  await p.evaluate(()=>{if(typeof showPage==='function')showPage('requests');});
  await L.sleep(200);
  let tech=await p.evaluate(()=>{
    var v=getVehicles()[0];
    C.vis=C.vis||{};
    getVehicles().forEach(function(car){C.vis[car.id]=Object.assign({},C.vis[car.id]||{},{can_send_estimates:false,view_reminders:false});});
    C.vis[v.id]=Object.assign({},C.vis[v.id]||{},{can_add_reminders:true,can_send_estimates:false,can_add_service:true,view_reminders:false});
    var manage=typeof canManageReminders==='function'&&canManageReminders(v);
    var add=typeof can==='function'&&can(v,'can_add_reminders');
    if(typeof renderRequests==='function')renderRequests();
    var estBtn=document.getElementById('rq-est-btn');
    var estShown=!!estBtn;
    if(typeof remPageHTML==='function'){
      var html=remPageHTML(true);
      var hasRem=/Registration renewal|Insurance renewal/.test(html);
      return {manage:manage,add:add,estShown:estShown,remFromOtherPerms:hasRem,hasCan:!!(C.vis[v.id].can_add_reminders)};
    }
    return {manage:manage,add:add,estShown:estShown,remFromOtherPerms:null,hasCan:true};
  });
  ok(tech.hasCan,'visibility map records can_add_reminders');
  ok(tech.manage,'a tech granted Add reminders can actually manage reminders in the UI');
  ok(!tech.estShown,'Send an estimate is hidden when that permission is off');
  ok(tech.remFromOtherPerms===false||tech.remFromOtherPerms===null,'Reminders page does not list dates from a car the tech may not view reminders on');

  let brief=await p.evaluate(()=>{
    var extra={id:'dash-client-2',name:'Second Client'};
    if(typeof C!=='undefined'&&C.clients&&!C.clients.some(function(c){return c.id==='dash-client-2';}))C.clients.push(extra);
    var v2=Object.assign({},getVehicles()[0]||{},{id:'dash-veh-2',clientId:'dash-client-2',nickname:'Other collection car',make:'Lotus',model:'Elan'});
    if(typeof C!=='undefined'&&C.vehicles)C.vehicles.push(v2);
    if(typeof renderDashboard==='function')renderDashboard();
    var b=document.getElementById('dash-brief')||document.getElementById('page-dashboard');
    var text=b?b.innerText:'';
    var n=typeof activeVehicles==='function'?activeVehicles().length:0;
    return {n:n,mix:/Other collection|Lotus|Second Client/.test(text),text:text.slice(0,400)};
  });
  ok(brief.n>=2&&!brief.mix,'advisor Portfolio/Brief/Stats does not mix two clients into one collection brief ('+(brief.text||'').slice(0,180)+')');
  await p.evaluate(()=>{if(typeof showPage==='function')showPage('dashboard');var e=document.getElementById('td-board')||document.getElementById('dash-brief');if(e)e.scrollIntoView({block:'start'});});
  await L.sleep(200);
  await shot(p,'08-advisor-home-scope.png');

  let note=await p.evaluate(()=>{
    PO.on=true;PO.loaded=true;PO.cols=true;
    if(typeof imOpen==='function')imOpen();
    IM.step=2;IM.file={name:'list.xlsx',kind:'xlsx'};IM.rows=[{year:'1964'}];
    IM.newPf={name:'Cape Town',country:'',currency:'USD'};
    IM.owner=(getClients()[0]&&getClients()[0].id)||IM.owner;
    if(typeof imRender==='function')imRender();
    var el=document.getElementById('pf-world-note');
    return el?el.textContent:'';
  });
  ok(note&&!/not on the live database yet/i.test(note),'portfolio note does not say the portfolios update is still missing ('+(note||'missing')+')');
  await p.close();

  // ---- no payment UI copy ----
  p=await L.open({w:430,h:932});
  await L.login(p,'olivia@test.com');
  await L.sleep(300);
  let pay=await p.evaluate(()=>{
    if(typeof renderAccess==='function')renderAccess();
    if(typeof coRender==='function')coRender();
    var t=(document.body.innerText||'');
    return /technician fee|monthly fee|reseller|Coverage is paid|set a price|merchant of record/i.test(t);
  });
  ok(!pay,'owner surfaces do not show payment or fee copy');
  await p.evaluate(()=>{
    CO.on=true;CO.rows=CO.rows||[];
    CO.rows.push({collection_owner_id:myId(),user_id:'d0000000-0000-4000-a000-0000000000d1',management:'limited',see_title_documents:false,created_at:new Date().toISOString()});
    CO.rows.push({collection_owner_id:myId(),user_id:'c0000000-0000-4000-a000-0000000000c9',management:'full',see_title_documents:false,created_at:new Date().toISOString()});
    if(typeof showPage==='function')showPage('access');
    coRender();
  });
  await p.evaluate(()=>{var e=document.querySelector('.co-mgmt')||document.getElementById('co-sec');if(e)e.scrollIntoView({block:'center'});});
  await L.sleep(200);
  await shot(p,'09-team-toggles.png');
  await p.evaluate(()=>{
    if(typeof showPage==='function')showPage('client-portal');
    var o=ownerClientId(),v=getVehicles().filter(function(x){return x.clientId===o;})[0];
    RQ.rows=RQ.rows||[];
    RQ.rows.push({id:'91000000-0000-4000-a000-000000000092',owner_id:o,vehicle_id:v.id,request_kind:'estimate',decision:'advisor_removed',status:'new',work_summary:'Fuel pump after the advisor left',price_amount:900,price_currency:'USD',proposed_start:new Date().toISOString(),proposed_tz:'UTC',duration_minutes:60,created_by:'c0000000-0000-4000-a000-000000000003',service:'maintenance'});
    odRender();
    var e=document.getElementById('cp-decide');if(e)e.scrollIntoView({block:'center'});
  });
  await L.sleep(200);
  await shot(p,'10-advisor-removed.png');
  await p.evaluate(()=>{
    var o=ownerClientId(),v=getVehicles().filter(function(x){return x.clientId===o;})[0];
    HX.rows=[{vehicle_id:v.id,owner_id:o,kind:'field_change',summary:'Transferred to the buyer with coverage, estimates, conversation and history',created_at:new Date().toISOString()}];
    CM.rows=CM.rows||[];
    CM.rows.push({id:'91000000-0000-4000-a000-000000000093',vehicle_id:v.id,owner_id:o,body:'The conversation moved with the car.',created_at:new Date().toISOString(),author_id:o});
    if(typeof openVehicleDetail==='function')openVehicleDetail(v.id);
    if(typeof vxRender==='function')vxRender(v.id);
    var e=document.getElementById('vx-sec');if(e)e.scrollIntoView({block:'start'});
  });
  await L.sleep(250);
  await shot(p,'11-transfer-buyer.png');
  await p.close();

  await L.close();
  console.log('\nroles_logic: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
