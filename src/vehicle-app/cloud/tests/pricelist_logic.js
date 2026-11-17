// Built price-list screens and the role rules around them.
const L=require('./lib.js');const fs=require('fs');
const OUT='/opt/cursor/artifacts/';
fs.mkdirSync(OUT,{recursive:true});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const shot=async(p,n)=>p.screenshot({path:OUT+n});
function grey(rgb){if(!rgb)return false;const [r,g,b]=rgb,max=Math.max(r,g,b),min=Math.min(r,g,b);return max-min<28&&r>=90&&r<=170;}
(async()=>{
  await L.launch();
  let p=await L.open({w:390,h:844,dsf:1});
  await L.login(p,'tom@test.com','password123','advisor');
  await p.evaluate(()=>openAccountModal());
  await L.sleep(300);
  let entry=await p.evaluate(()=>!!document.getElementById('pl-entry'));
  ok(entry,'tech account has the price list entry');
  await p.evaluate(()=>plOpen('empty'));
  await L.sleep(200);
  let empty=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/Draft my price list with AI/.test(empty)&&/does not take payment/.test(empty),'empty state explains the draft and the external pay link');
  ok(!/checkout|pay now|card number/i.test(empty),'empty state has no payment form');
  await shot(p,'01_tech_empty.png');

  await p.evaluate(()=>{
    window.__PL_OFFLINE__=true;
    window.__MOCK_STATE__.fn.draft=function(body){
      if(!body||body.attest!==true)return {data:null,error:{message:'attestation_required'}};
      var html='<h2>Exterior</h2><h3>Signature hand wash</h3><p>Foam, decontamination, and a hand dry.</p><p>$185 - 2 hours</p><h3>Paint correction</h3><p>Two-stage polish for swirl and light marks.</p><p>from $850 - 1 day</p><h2>Interior</h2><h3>Cabin restoration</h3><p>Leather, carpets, and vents, by hand.</p><p>$240 - 3 hours</p><h2>Ceramic</h2><h3>Ceramic coating, 3-year</h3><p>Paint and glass, after correction.</p><p>from $1800 - 2 days</p><h3>Paint protection film, front</h3><p>The page did not state coverage or a price.</p><h2>Maintenance</h2><h3>Pre-storage inspection</h3><p>Fluids, battery, and a written note.</p><p>$320 - 90 min</p>';
      return {data:{draft:true,services:parsePricePage(html,'https://haleatelier.com/services')},error:null};
    };
    window.__MOCK_STATE__.rpcHandlers.save_price_draft=function(){return {data:{list:{attested_at:new Date().toISOString(),website_url:'https://haleatelier.com',pay_url:'https://haleatelier.com/book'},draft:[],live:[]},error:null};};
    window.__MOCK_STATE__.rpcHandlers.publish_price_list=function(){return {data:{list:{published_at:'2026-11-16',website_url:PL.website,pay_url:PL.pay,attested_at:new Date().toISOString()},draft:PL.draft,live:PL.draft},error:null};};
    window.__MOCK_STATE__.rpcHandlers.keep_price_list=function(){return {data:{list:{published_at:PL.publishedAt,website_url:PL.website,pay_url:PL.pay},draft:[],live:PL.live},error:null};};
  });
  await p.evaluate(()=>{
    document.getElementById('pl-web').value='https://haleatelier.com';
    PL.website='https://haleatelier.com';
    document.getElementById('pl-pay').value='https://haleatelier.com/book';
    PL.pay='https://haleatelier.com/book';
    document.querySelector('#pl-screen input[type=checkbox]').checked=true;
    PL.attest=true;
  });
  await p.evaluate(()=>plDraft());
  await L.sleep(200);
  let review=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/please check/i.test(review)&&/publish to my clients/i.test(review)&&/exterior/i.test(review)&&/maintenance/i.test(review),'review shows groups, the gold flag, and publish');
  ok(/Found on haleatelier.com\/services/.test(review),'each line keeps its source');
  ok(/Edit/.test(review)&&/Remove/.test(review)&&/Add a service/.test(review),'edit, remove, and add are on the draft');
  await p.evaluate(()=>{var f=document.querySelector('#pl-screen .pl-flag');if(f)f.scrollIntoView({block:'center'});});
  await shot(p,'02_tech_review.png');

  await p.evaluate(()=>{
    PL.live=PL.draft.filter(function(s){return !s.needs_review;});
    PL.website='https://haleatelier.com';
    PL.pay='https://haleatelier.com/book';
    PL.publishedAt='2026-11-16';
    PL.mode='published';
    plRender();
  });
  let pub=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/Last updated/.test(pub)&&/Refresh from website/.test(pub)&&/outside EvoAI/.test(pub),'published state has the date, refresh, and the external link');
  await shot(p,'03_tech_published.png');

  await p.evaluate(()=>{
    PL.diff=[
      {kind:'price',name:'Signature hand wash',from:'$185',to:'$210',meta:'Found on haleatelier.com/services'},
      {kind:'new',name:'Wheel faces, ceramic',price:'from $420',description:'The page offered a starting price and no duration.',meta:'Found on haleatelier.com/wheels'}
    ];
    PL.mode='refresh';plRender();
  });
  let ref=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/publish these changes/i.test(ref)&&/keep current list/i.test(ref)&&/please check/i.test(ref),'refresh waits for approval and does not auto-publish');
  await shot(p,'04_tech_refresh.png');
  await p.close();

  p=await L.open({w:390,h:844,dsf:1});
  await L.login(p,'olivia@test.com','password123','owner');
  await p.evaluate(()=>{
    var V3='d0000000-0000-4000-a000-000000000013';
    var O='b0000000-0000-4000-a000-000000000002';
    window.__MOCK_STATE__.tables.vehicles.push({id:V3,owner_id:O,year:2021,make:'Porsche',model:'911 GT3',plate:'GT321',archived:false,mileage:100,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
    window.__MOCK_STATE__.tables.vehicles.forEach(function(v){if(v.id==='d0000000-0000-4000-a000-000000000011')v.plate='AMDBS19';if(v.id==='d0000000-0000-4000-a000-000000000012')v.plate='JAG67';});
    window.__MOCK_STATE__.rpcHandlers.get_tech_menu=function(){return {data:{published:true,name:'Tom Reyes',business_name:'Hale Atelier',pay_url:'https://haleatelier.com/book',services:[
      {id:'s1',category:'Exterior',name:'Signature hand wash',description:'Foam, decontamination, and a hand dry.',price_mode:'fixed',amount:185,duration_label:'2 hours'},
      {id:'s2',category:'Ceramic',name:'Ceramic coating, 3-year',description:'Paint and glass, after correction.',price_mode:'from',amount:1800,duration_label:'2 days'}
    ]},error:null};};
    window.__MOCK_STATE__.rpcHandlers.list_tech_scope=function(){return {data:{all:false,vehicle_ids:['d0000000-0000-4000-a000-000000000011']},error:null};};
    window.__MOCK_STATE__.rpcHandlers.submit_service_request=function(a){return {data:'r1',error:null,args:a};};
  });
  await p.evaluate(()=>plOpenMenu('c0000000-0000-4000-a000-000000000003'));
  await L.sleep(250);
  let menu=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/Services & prices|SERVICES/.test(menu)&&/Request this service/.test(menu)&&/Leaves EvoAI/.test(menu),'client menu is the published list with an external pay link');
  ok(!/checkout|card number/i.test(menu),'client menu does not take payment');
  await shot(p,'05_client_menu.png');
  await p.evaluate(()=>plAsk());
  await L.sleep(150);
  await p.evaluate(()=>{PL.picked={'d0000000-0000-4000-a000-000000000011':true,'d0000000-0000-4000-a000-000000000012':true,'d0000000-0000-4000-a000-000000000013':true};plRender();});
  let sheet=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/On their access/.test(sheet)&&/Shared for this request only/.test(sheet),'request sheet separates granted cars from a request-only share');
  await shot(p,'06_client_request.png');
  await p.evaluate(()=>{
    document.getElementById('pl-from').value='2026-11-20';
    document.getElementById('pl-to').value='2026-11-22';
    document.getElementById('pl-note').value='Side entrance';
  });
  await p.evaluate(()=>plSend());
  await L.sleep(200);
  let sent=await p.evaluate(()=>document.getElementById('pl-screen').innerText);
  ok(/request sent/i.test(sent)&&/client request/i.test(sent)&&/not charged/i.test(sent),'confirmation says it went out as a Client Request');
  await shot(p,'07_client_sent.png');
  let rpc=await p.evaluate(()=>window.__MOCK_STATE__.rpcs.map(function(r){return r.name;}));
  ok(rpc.indexOf('submit_service_request')>=0,'send uses the request RPC');
  await p.close();

  p=await L.open({w:390,h:844,dsf:1});
  await L.login(p,'tom@test.com','password123','advisor');
  await p.evaluate(()=>{
    var o='b0000000-0000-4000-a000-000000000002';
    var v='d0000000-0000-4000-a000-000000000011';
    RQ.on=true;RQ.rows=RQ.rows||[];RQ.tab='new';
    RQ.rows.unshift({id:'91000000-0000-4000-a000-000000000099',owner_id:o,vehicle_id:v,created_by:o,service:'other',service_name:'Ceramic coating, 3-year',listed_label:'from $1,800',preferred_date:'2026-11-20',preferred_end:'2026-11-22',notes:'Side entrance. GT3 is in bay two.',status:'new',request_kind:'client',target_tech:'c0000000-0000-4000-a000-000000000003',created_at:new Date().toISOString(),_cards:[
      {year:2019,make:'Aston Martin',model:'DBS',plate:'AMDBS19',share:'granted'},
      {year:1967,make:'Jaguar',model:'E-Type',plate:'JAG67',share:'granted'},
      {year:2021,make:'Porsche',model:'911 GT3',plate:'GT321',share:'request_only'}
    ]});
    if(typeof showPage==='function')showPage('requests');
    renderRequests();
  });
  await L.sleep(250);
  let card=await p.evaluate(()=>{var c=document.querySelector('.rq-card');return c?c.innerText:'';});
  ok(/Ceramic coating/.test(card)&&/from \$1,800/.test(card)&&/request only/.test(card),'incoming card shows the service, listed price, and vehicles');
  ok(/Send estimate/.test(card)&&/does not charge/.test(card),'estimate stays the existing action and does not charge');
  await p.evaluate(()=>{var e=document.querySelector('.pl-extra');if(e)e.scrollIntoView({block:'center'});});
  await shot(p,'08_tech_incoming.png');
  let tone=await p.evaluate(()=>{
    var bad=[];
    [].slice.call(document.querySelectorAll('#pl-screen, #pl-screen *, .rq-card, .rq-card *')).forEach(function(e){
      if(!e.offsetParent&&e.id!=='pl-screen')return;
      var own=[].slice.call(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();});
      if(!own)return;
      var cs=getComputedStyle(e),f=parseFloat(cs.fontSize),m=(cs.color||'').match(/\d+/g);
      if(f&&f<15)bad.push('size '+f+' '+e.textContent.slice(0,24));
      if(m){m=m.map(Number);var max=Math.max.apply(null,m),min=Math.min.apply(null,m);if(max-min<28&&m[0]>=90&&m[0]<=170)bad.push('grey '+cs.color+' '+e.textContent.slice(0,24));}
    });
    return bad;
  });
  ok(!tone.length,'price list text stays 15px and white or gold'+(tone.length?' ('+tone.slice(0,3).join('; ')+')':''));
  await p.close();
  await L.close();
  console.log('pricelist_logic: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
