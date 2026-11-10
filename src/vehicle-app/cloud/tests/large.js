// v15 large type + contrast + tap targets + gold ring loader. Screens: lg-*
const L=require('./lib.js');const fs=require('fs');const audit=require('./a11y_audit.js');
const OUT='/workspace/vehicle-app/cloud/screens/',AS='/workspace/evoai-portfolio/assets/';
const STRICT=process.env.LG_REPORT?false:true;
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011';
const IM=['after','cs3','cs4','cs5','cs6','cs7','cs9','cs11','ruby','bentley'];
const B64={};IM.forEach(k=>{let f=AS+'th/'+k+'_960.jpg';if(!fs.existsSync(f))f=AS+k+'.jpg';B64[k]=fs.readFileSync(f).toString('base64');});
async function serveImages(p){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();
  if(u.indexOf('/storage/v1/object/sign/')>=0){let h=0;for(const c of u.split('?')[0])h=(h*31+c.charCodeAt(0))>>>0;const k=IM[h%IM.length];r.respond({status:200,contentType:'image/jpeg',body:Buffer.from(B64[k],'base64'),headers:{'access-control-allow-origin':'*'}});}else r.continue();});}
const PRE=`try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};(function(){var S=window.__MOCK_STATE__;var V1='${V1}',O='b0000000-0000-4000-a000-000000000002';var T=S.tables.vehicle_photos||(S.tables.vehicle_photos=[]);
 for(var i=0;i<8;i++){var b=O+'/'+V1+'/portfolio/lg'+i;T.push({id:'f0000000-0000-4000-a000-00000000010'+i,vehicle_id:V1,uploaded_by:O,storage_path:b+'.jpg',thumb_path:b+'_t.jpg',display_path:b+'_d.jpg',tag:['Exterior','Interior','Engine','Wheels'][i%4],caption:null,is_cover:i===0,sort_order:i,created_at:'2026-10-0'+(i+1)+'T10:00:00Z'});}})();`;
const shot=async(p,n)=>{await L.sleep(500);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
async function check(p,label,o){const r=await p.evaluate('('+audit.toString()+')('+JSON.stringify(o||{})+')');
  if(!STRICT){console.log('['+label+'] font',r.font.length,'contrast',r.contrast.length,'tap',r.tap.length,'overflow',r.overflow.length);['font','contrast','tap','overflow'].forEach(k=>r[k].slice(0,40).forEach(x=>console.log('   '+k+': '+x)));return r;}
  ok(!r.font.length,label+': all text >= 13px '+JSON.stringify(r.font.slice(0,6)));
  ok(!r.contrast.length,label+': text contrast meets WCAG AA '+JSON.stringify(r.contrast.slice(0,6)));
  ok(!r.tap.length,label+': tap targets >= 44px '+JSON.stringify(r.tap.slice(0,6)));
  ok(!r.overflow.length,label+': no horizontal overflow '+JSON.stringify(r.overflow));return r;}
async function run(vp,tag){
  console.log('VIEWPORT '+tag);
  let p=await L.open(Object.assign({pre:PRE},vp));await serveImages(p);
  await p.evaluate(()=>showLoading(true,'Loading your collection'));await L.sleep(1200);
  await shot(p,'lg-01-loading-'+tag);
  const ring=await p.evaluate(()=>{var b=document.getElementById('boot-ring'),r=b.getBoundingClientRect(),sv=b.querySelector('svg'),o=b.querySelector('.evo-o');
    var grad=document.querySelector('#evr-defs linearGradient#evr-g');
    return {dots:b.querySelectorAll('circle').length,sectors:b.querySelectorAll('.evr-s').length,anim:getComputedStyle(sv).animationName,pulse:getComputedStyle(b.querySelector('.evr-s')).animationName,
      oAnim:getComputedStyle(o).animationName,oImg:/url\(/.test(getComputedStyle(o).backgroundImage),w:r.width,grad:!!grad&&grad.querySelectorAll('stop').length,
      old:[].filter.call(document.querySelectorAll('.boot-spin'),e=>e.getBoundingClientRect().width>0).length,txt:getComputedStyle(document.getElementById('boot-loading-text')).fontSize};});
  ok([291,298,360].includes(ring.dots)&&ring.sectors===12&&ring.grad===3,'loader ring = gold dots (291 round6 / 298 v39 final ring (Wade original): '+ring.dots+'), 12 pulse sectors, same 3-stop gold gradient');
  ok(ring.anim==='evrrot'&&ring.pulse==='evrpulse'&&ring.oAnim==='none'&&ring.oImg,'ring rotates + sequential pulse; Evolve O is still');
  ok(ring.w>=150&&ring.old===0,'large ring on the splash, thin spinner gone ('+ring.w+')');
  ok(parseFloat(ring.txt)>=17,'loading text >= 17px ('+ring.txt+')');
  await check(p,tag+' loading',{root:'#boot-loading'});
  await p.evaluate(()=>showLoading(false));await L.sleep(200);
  await shot(p,'lg-02-signin-'+tag);await check(p,tag+' sign-in',{root:'#auth-screen'});
  await L.login(p,'olivia@test.com');await L.sleep(1500);
  const bf=await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.main')||document.body).fontSize));ok(bf>=17,tag+' body text >= 17px ('+bf+')');
  await shot(p,'lg-03-overview-'+tag);await check(p,tag+' overview');
  await p.evaluate(()=>{var w=document.querySelector('#cp-vehicles');w&&w.scrollIntoView();});await L.sleep(700);
  await shot(p,'lg-07-overview-roundabout-'+tag);await check(p,tag+' overview roundabout');
  // other spinners use the ring
  const sp=await p.evaluate(()=>{var n=document.createElement('div');document.body.appendChild(n);n.innerHTML=evoSpinHTML('dai-spin')+'x';var a=n.querySelector('.evo-spin');var r={c:a.querySelectorAll('circle').length,w:a.getBoundingClientRect().width};n.remove();return r;});
  ok([291,298,360].includes(sp.c)&&sp.w>=24,'inline spinner is the ring ('+sp.w+'px)');
  await p.evaluate(id=>openVehicleDetail(id),V1);await L.sleep(1800);
  await shot(p,'lg-04-vehicle-'+tag);await check(p,tag+' vehicle page');
  await p.evaluate(()=>{var s=document.querySelector('.modal-overlay.active .modal')||document.scrollingElement;s.scrollTop=900;});await L.sleep(600);
  await shot(p,'lg-05-vehicle-lower-'+tag);await check(p,tag+' vehicle page lower');
  await p.evaluate(()=>pfShowAdd(PF.v));await L.sleep(700);
  await shot(p,'lg-06-sheet-'+tag);await check(p,tag+' add-photos sheet',{root:'#pfa'});
  await p.evaluate(()=>pfCloseAdd(true));await L.sleep(300);
  if(p.errors.length)console.log('errors',p.errors);ok(!p.errors.filter(e=>!/favicon|ERR_|Failed to load resource/.test(e)).length,tag+' no page errors');
  await p.close();
}
(async()=>{await L.launch();
  { console.log('REDUCED MOTION');const p=await L.open({});await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await p.evaluate(()=>showLoading(true,'Loading your collection'));await L.sleep(400);
    const r=await p.evaluate(()=>{var b=document.getElementById('boot-ring');return {rot:getComputedStyle(b.querySelector('svg')).animationName,pulse:getComputedStyle(b.querySelector('.evr-s')).animationName,op:getComputedStyle(b.querySelector('.evr-s')).opacity};});
    ok(r.rot!=='evrrot'&&r.pulse==='none'&&r.op==='1','reduced motion: no rotation or travelling pulse (soft fade only) '+JSON.stringify(r));await p.close();}
  await run({w:390,h:844},'390x844');
  await run({w:1280,h:800,desktop:true,dsf:1},'1280x800');
  await L.close();console.log('\nLARGE: '+(fails?fails+' failed':'all passed'));process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(1);});
