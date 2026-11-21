// v40 cleanup: old destinations still open, roles still gate, merges keep both save paths.
const L=require('./lib.js');
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
(async()=>{
  await L.launch();
  let p=await L.open({w:390,h:844});
  await L.login(p,'olivia@test.com');
  await L.sleep(500);
  let nav=await p.evaluate(()=>[].slice.call(document.querySelectorAll('.sidebar .nav-item.nav-primary')).filter(function(e){return e.offsetParent;}).map(function(e){return e.dataset.page;}));
  ok(nav.join(',')==='client-portal,garage,requests,todo,more'||nav.join(',')==='client-portal,garage,todo,more','owner primary tabs '+nav.join(','));
  ok(nav.indexOf('dashboard')<0,'owner is not given the tech overview');
  const pages=['garage','todo','requests','reminders','inspections','documents','recommendations','expenses','archives','access','client-portal'];
  for(const id of pages){
    const r=await p.evaluate(function(id){
      showPage(id);
      var pg=document.querySelector('.page.active');
      return {id:id,active:pg?pg.id:'',err:window.__cleanupErr||''};
    },id);
    ok(!!r.active,'owner showPage('+id+') lands on '+r.active);
  }
  let vals=await p.evaluate(()=>{showPage('valuations');var s=document.getElementById('cp-ovc-stats');return {hidden:s?s.hidden:true,text:(document.getElementById('cp-value-home')||{}).innerText||''};});
  ok(vals.hidden===false&&/Estimate, not an appraisal|Estimate, as of/.test(vals.text),'Values opens inside Overview Stats ('+vals.text.slice(0,80)+')');
  let form=await p.evaluate(async()=>{
    function wait(){return new Promise(function(r){setTimeout(r,40);});}
    openRecordModal('service');
    await wait();
    var svc=document.getElementById('modal-service').classList.contains('active')&&!!document.getElementById('svc-date')&&!!document.querySelector('#modal-service .rec-kind');
    openRecordModal('inspection');
    await wait();
    var ins=document.getElementById('modal-inspection').classList.contains('active')&&!!document.getElementById('insp-vehicle')&&typeof saveInspection==='function'&&typeof saveService==='function';
    closeModal('modal-inspection');
    return {svc:svc,ins:ins};
  });
  ok(form.svc&&form.ins,'one add-record toggle still opens service and inspection save paths');
  let ownCars=await p.evaluate(()=>{var id=ownerClientId();var vs=visibleVehicles();return {id:id,n:vs.length,foreign:vs.filter(function(v){return v.clientId!==id;}).length};});
  ok(ownCars.n>0&&ownCars.foreign===0,'owner only sees their own cars ('+ownCars.n+')');
  let share=await p.evaluate(()=>{
    PL.scope={all:false,vehicle_ids:[]};
    PL.tech={id:'t',name:'Hale',business_name:'Hale Atelier',pay_url:'https://example.com/book'};
    PL.menu=[{id:'s1',name:'Cabin restoration',amount:240,price_mode:'flat'}];
    PL.service=PL.menu[0];PL.picked={};PL.mode='request';
    var cars=plCars();
    plRender();
    var text=document.getElementById('pl-screen').innerText;
    return {n:cars.length,limited:cars.filter(function(c){return c.share==='request_only';}).length,text:text,covers:getComputedStyle(document.getElementById('pl-screen')).zIndex};
  });
  ok(share.n>0&&share.limited===share.n&&/request only/i.test(share.text),'request_only cars stay limited on the service request');
  ok(Number(share.covers)>=200,'price list overlay covers the nav (z '+share.covers+')');
  let mint=await p.evaluate(()=>document.documentElement.classList.contains('em-royal')&&getComputedStyle(document.documentElement).getPropertyValue('--em-mid').trim().toLowerCase()==='#0a5a42');
  ok(mint,'Royal Jewel mid token is #0A5A42');
  await p.close();

  p=await L.open({w:390,h:844});
  await L.login(p,'tom@test.com','password123','advisor');
  await L.sleep(600);
  let tech=await p.evaluate(()=>{
    var nav=[].slice.call(document.querySelectorAll('.sidebar .nav-item.nav-primary')).filter(function(e){return e.offsetParent;}).map(function(e){return e.dataset.page;});
    showPage('garage');
    return {nav:nav,garage:document.getElementById('page-garage').classList.contains('active'),home:document.getElementById('page-dashboard').classList.contains('active')};
  });
  ok(tech.nav[0]==='dashboard'&&tech.nav.indexOf('client-portal')<0,'tech primary tabs start at Overview and hide the owner home ('+tech.nav.join(',')+')');
  ok(tech.garage,'tech garage opens');
  let granted=await p.evaluate(()=>{
    PL.scope={all:false,vehicle_ids:[visibleVehicles()[0]&&visibleVehicles()[0].id]};
    var cars=plCars();
    var g=cars.filter(function(c){return c.share==='granted';}).length;
    var r=cars.filter(function(c){return c.share==='request_only';}).length;
    return {g:g,r:r,n:cars.length};
  });
  ok(granted.g===1&&granted.r===granted.n-1,'tech scope grants one car and leaves the rest request_only');
  await p.close();
  await L.close();
  console.log('\ncleanup_logic: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
