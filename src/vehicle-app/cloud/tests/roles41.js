// v41: tech dashboard, estimate form, owner nav unchanged, co-owner choices, world countries.
const L=require('./lib.js');const fs=require('fs');
const OUT=process.env.ROLE_OUT||'/opt/cursor/artifacts/roles/';
fs.mkdirSync(OUT,{recursive:true});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const shot=async(p,n)=>p.screenshot({path:OUT+n});
(async()=>{
  await L.launch();
  let p=await L.open({w:430,h:932});
  await L.login(p,'tom@test.com','password123','advisor');
  await L.sleep(700);
  let tech=await p.evaluate(()=>{
    var b=document.getElementById('td-board');
    var nav=[].slice.call(document.querySelectorAll('.sidebar .nav-item')).filter(function(e){return e.offsetParent;}).map(function(e){return e.dataset.page;});
    return {board:!!b&&b.offsetParent!==null,text:b?b.innerText:'',nav:nav};
  });
  ok(tech.board,'tech dashboard band is on the advisor overview');
  ok(/Olivia Harper/.test(tech.text)&&/vehicle/.test(tech.text),'band lists the authorized client');
  ok(tech.nav.indexOf('client-portal')<0,'advisor overview is not the owner home');
  await shot(p,'01-tech-dashboard.png');
  await p.evaluate(()=>showPage('requests'));
  await L.sleep(300);
  await p.evaluate(()=>{var b=document.getElementById('rq-est-btn');if(b)b.click();});
  await L.sleep(250);
  let est=await p.evaluate(()=>{
    var f=document.getElementById('rq-form');
    return {text:f?f.textContent:'',work:!!document.getElementById('rq-work'),price:!!document.getElementById('rq-price'),when:!!document.getElementById('rq-when'),tz:!!document.getElementById('rq-tz'),dur:!!document.getElementById('rq-dur'),zones:(document.getElementById('rq-tz')||{}).options?document.getElementById('rq-tz').options.length:0};
  });
  ok(est.work&&est.price&&est.when&&est.tz&&est.dur,'estimate form asks for work, price, time, timezone and duration');
  ok(est.zones>=8,'timezone list is present');
  ok(!/suggested price|\$\s*99|monthly fee/i.test(est.text),'form does not invent a price');
  await shot(p,'02-estimate-form.png');
  let tone=await p.evaluate(()=>{
    var bad=[];
    [].slice.call(document.querySelectorAll('#td-board, #rq-form, #rq-form *')).forEach(function(e){
      if(!e.offsetParent)return;
      var own=[].slice.call(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();});
      if(!own)return;
      var cs=getComputedStyle(e),f=parseFloat(cs.fontSize),m=cs.color.match(/\d+/g);
      if(!m)return;m=m.map(Number);
      var white=m[0]>=220&&m[1]>=220&&m[2]>=210,gold=m[0]>160&&m[1]>120&&m[0]>m[2]+30,dark=m[0]<40&&m[1]<50&&m[2]<40;
      if(f<15||!(white||gold||dark))bad.push((e.textContent||'').trim().slice(0,28)+' '+cs.color+' '+f);
    });
    return bad;
  });
  ok(!tone.length,'new tech text is 15px or larger and white, gold, or on the emerald control ('+tone.slice(0,3).join(' | ')+')');
  await p.close();

  p=await L.open({w:430,h:932});
  await L.login(p,'olivia@test.com');
  await L.sleep(700);
  let own=await p.evaluate(()=>{
    var nav=[].slice.call(document.querySelectorAll('.sidebar .nav-item')).filter(function(e){return e.offsetParent;}).map(function(e){return e.dataset.page;});
    return {nav:nav,home:document.getElementById('page-client-portal').classList.contains('active'),board:!!document.getElementById('td-board')};
  });
  ok(own.home&&!own.board,'owner still lands on Home, with no tech dashboard');
  ok(own.nav.indexOf('dashboard')<0&&own.nav[0]==='client-portal','owner navigation is not given a new dashboard item');
  var frozen=['client-portal','todo','requests','reminders','valuations','inspections','expenses','documents','recommendations','archives','access','account'];
  ok(JSON.stringify(own.nav)===JSON.stringify(frozen),'owner nav is unchanged ('+own.nav.join(',')+')');
  await shot(p,'03-owner-home.png');
  await p.evaluate(()=>showPage('access'));
  await L.sleep(300);
  let team=await p.evaluate(()=>document.getElementById('access-body').innerText);
  ok(/Invite with full management/.test(team)&&/Invite with limited management/.test(team),'original owner can invite a full or limited co-owner');
  ok(/per vehicle/.test(team)&&/no separate technician fee/i.test(team),'coverage note states owner-paid per vehicle and no tech fee');
  ok(!/\$\d/.test(team),'the note does not state a price');
  await p.evaluate(()=>{var m=document.querySelector('.main');if(m)m.scrollTop=m.scrollHeight;var s=document.getElementById('co-sec')||document.getElementById('inv-cars');if(s)s.scrollIntoView({block:'center'});});
  await L.sleep(200);
  await shot(p,'04-owner-team.png');
  let world=await p.evaluate(()=>{
    var codes=IM_COUNTRIES.map(function(c){return c[0];});
    return {n:codes.length,jp:codes.indexOf('JP')>=0,br:codes.indexOf('BR')>=0,ke:codes.indexOf('KE')>=0,nz:codes.indexOf('NZ')>=0};
  });
  ok(world.n>200&&world.jp&&world.br&&world.ke&&world.nz,'portfolio country list covers the world ('+world.n+' codes)');
  await p.close();

  p=await L.open({w:430,h:900});
  await p.goto('http://127.0.0.1:8765/mockups/owner-dashboard-proposal/index.html',{waitUntil:'load'});
  await shot(p,'05-owner-decision-proposal.png');
  let prop=await p.evaluate(()=>document.body.innerText);
  ok(/Needs your decision/.test(prop)&&/does not add a nav item/.test(prop),'proposal shows the decision band without a new nav item');
  await p.close();
  await L.close();
  console.log('\nroles41: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
