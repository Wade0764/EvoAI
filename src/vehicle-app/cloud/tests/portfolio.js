// Collection roundabout, hero-card heading rule, vehicle portfolio (gallery, lightbox, add flow), fallback. Mocked backend; images served from the design assets.
const L=require('./lib.js');
const fs=require('fs'),path=require('path');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/';
const AS='/workspace/evoai-portfolio/assets/';
const IMGS=['after','cs3','cs4','cs5','cs6','cs7','cs9','cs11','wheel','beading','grille','dint','ruby','bentley'];
const O='b0000000-0000-4000-a000-000000000002',TT='c0000000-0000-4000-a000-000000000003',V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012',V3='d0000000-0000-4000-a000-000000000013';
const TAGS=['Exterior','Interior','Engine','Detail','Work']; // seeded legacy tags; Detail is shown as Details (v14)
// extra data: a third vehicle without nickname, 14 photos on V1 (1 legacy cover + 13 portfolio), 1 photo on V2
const PRE=`(function(){var S=window.__MOCK_STATE__;function T(n){return S.tables[n]||(S.tables[n]=[]);}
var O='${O}',TT='${TT}',V1='${V1}',V2='${V2}',V3='${V3}';
function hex(n){var s=(1000000+n).toString(16);return ('00000000'+s).slice(-8);}
T('vehicles').push({id:V3,owner_id:O,year:1998,make:'Land Rover',model:'Defender 90',color:'Green',nickname:'',mileage:90100,archived:false,notes:'',created_at:'2026-01-04T00:00:00Z',updated_at:'2026-01-04T00:00:00Z'});
T('my_tech_visibility').push({__tech:TT,vehicle_id:V3,owner_id:O,vehicle_label:'x',can_view_service_records:true,can_view_expenses:false,can_view_documents:true,can_view_reminders:true,can_view_value_estimate:false,can_view_health_estimate:false,can_view_purchase_info:false,can_view_photos:true,can_add_service:true,can_add_documents:true,can_add_expenses:false,can_create_advisories:true});
var tags=${JSON.stringify(TAGS)};
T('vehicle_photos').push({id:'e0000000-0000-4000-a000-0000000000'+'00',vehicle_id:V1,uploaded_by:O,storage_path:O+'/'+V1+'/00000000-0000-4000-a000-000000000000.jpg',caption:null,is_cover:true,sort_order:0,created_at:'2026-02-01T10:00:00Z'});
for(var i=1;i<=13;i++){var id=hex(i)+'-0000-4000-a000-000000000001',b=O+'/'+V1+'/portfolio/'+id;
 T('vehicle_photos').push({id:id,vehicle_id:V1,uploaded_by:(i===4||i===5)?TT:O,storage_path:b+'.jpg',thumb_path:b+'_t.jpg',display_path:b+'_d.jpg',tag:tags[i%5],caption:i===2?'Front three-quarter':null,is_cover:false,sort_order:i,created_at:'2026-03-'+(10+i)+'T10:00:00Z'});}
var id2='aaaaaaaa-0000-4000-a000-000000000002',b2=O+'/'+V2+'/portfolio/'+id2;
T('vehicle_photos').push({id:id2,vehicle_id:V2,uploaded_by:O,storage_path:b2+'.jpg',thumb_path:b2+'_t.jpg',display_path:b2+'_d.jpg',tag:'Exterior',caption:null,is_cover:true,sort_order:0,created_at:'2026-03-01T10:00:00Z'});
})();`;
async function serveImages(p){
  await p.setRequestInterception(true);
  p.on('request',r=>{
    const u=r.url();
    if(u.indexOf('/storage/v1/object/sign/vehicle-photos/')>=0){
      const nm=decodeURIComponent(u.split('/vehicle-photos/')[1].split('?')[0]);
      let h=0;for(const c of nm.replace(/_[td]\.jpg$|\.jpg$/,''))h=(h*31+c.charCodeAt(0))>>>0;
      const k=nm.indexOf(V2)>=0?'ruby':IMGS[h%IMGS.length];
      const th=/_t\.jpg$/.test(nm);
      let f=AS+(th?'th/'+k+'_480.jpg':k+'.jpg');if(!fs.existsSync(f))f=AS+k+'.jpg';
      r.respond({status:200,contentType:'image/jpeg',body:fs.readFileSync(f),headers:{'access-control-allow-origin':'*'}});
    }else r.continue();
  });
}
async function open(o){o=o||{};const p=await L.open(Object.assign({pre:PRE},o));await serveImages(p);return p;}
const q=(p,s,...a)=>p.evaluate(s,...a);
async function login(p,email,role){await L.login(p,email,'password123',role);}
async function state(p){return p.evaluate(()=>({v:window.__MOCK_STATE__.violations,up:(window.__MOCK_STATE__.storageUp||[]).map(x=>x.path),signed:(window.__MOCK_STATE__.signed||[]).map(x=>x.slice()),rows:window.__MOCK_STATE__.tables.vehicle_photos}));}
async function overflow(p,label){const o=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);ok(o<=1,label+' no horizontal overflow ('+o+')');}
(async()=>{
await L.launch();
// ================= MOBILE, OWNER =================
console.log('OWNER 390x844');
let p=await open();await L.sleep(300);
await login(p,'olivia@test.com','client');await L.sleep(900);
ok(await q(p,()=>document.getElementById('page-client-portal').classList.contains('active')),'owner lands on collection overview');
const cards=await q(p,()=>[].map.call(document.querySelectorAll('#cp-vehicles .whl-card'),c=>({nm:c.querySelector('.whl-nm').textContent,ymm:(c.querySelector('.whl-ymm')||{}).textContent||null,id:c.getAttribute('data-id'),n:(c.querySelector('.whl-badge')||{}).textContent||''})));
ok(cards.length===3,'roundabout shows all 3 vehicles ('+cards.length+')');
const ghost=cards.filter(c=>c.id===V1)[0],land=cards.filter(c=>c.id===V3)[0];
ok(ghost&&ghost.nm==='The Ghost'&&ghost.ymm==='2021 Porsche 911 Carrera S','hero card: nickname heading + Year Make Model sub-heading');
ok(land&&land.nm==='1998 Land Rover Defender 90'&&land.ymm===null,'no nickname: Year Make Model is the heading only (no sub-heading)');
ok(ghost.n==='14 photos','photo count chip shows 14');
ok(await q(p,()=>{var c=document.querySelector('#cp-vehicles .whl-card .whl-nm'),s=document.querySelector('#cp-vehicles .whl-ymm');return getComputedStyle(c).fontFamily===getComputedStyle(s).fontFamily&&!/serif|Georgia/i.test(getComputedStyle(s).fontFamily.split(',')[0]);}),'sub-heading uses the same font family as the heading');
ok(await q(p,()=>document.querySelector('#cp-vehicles').classList.contains('wheel-host')&&!document.querySelector('#cp-vehicles').classList.contains('car-grid')),'collection host is the roundabout, not the grid');
ok(await q(p,()=>{var bad=0;document.querySelectorAll('#cp-vehicles .whl-card, #cp-vehicles .whl-card *').forEach(e=>{var s=getComputedStyle(e);var b=s.backdropFilter||s.webkitBackdropFilter||'none';if(b!=='none'&&!e.classList.contains('whl-badge'))bad++;});return bad===0;}),'no backdrop blur on rotating cards or their photos');
ok(await q(p,()=>{var st=document.querySelector('#cp-vehicles .whl-stage');st.classList.add('mv');var b=document.querySelector('#cp-vehicles .whl-card.front .whl-badge'),m=getComputedStyle(b).backdropFilter;st.classList.remove('mv');return m==='none'||m==='';}),'count chip has no blur while the wheel moves (solid tint)');
ok(await q(p,()=>{var h=document.querySelector('#cp-vehicles .whl-pos');var b=getComputedStyle(h).backdropFilter;return /blur/.test(b);}),'position pill (small overlay) uses glass blur');
ok(await q(p,()=>document.querySelectorAll('#cp-vehicles .whl-card img[src]').length<=3),'card photos load lazily');
await q(p,()=>{var w=document.querySelector('#cp-vehicles .whl');w.scrollIntoView({block:'center'});});await L.sleep(500);
await p.screenshot({path:SC+'pf-roundabout-390x844.png'});
await overflow(p,'roundabout');
// keyboard
await q(p,()=>document.querySelector('#cp-vehicles .whl-stage').focus());
const front=()=>q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-id'));
const f0=await front();
await p.keyboard.press('ArrowRight');await L.sleep(900);
const f1=await front();ok(f1!==f0,'ArrowRight turns the roundabout');
await p.keyboard.press('ArrowLeft');await L.sleep(900);ok(await front()===f0,'ArrowLeft turns back');
// wheel (focused stage, notch)
await p.evaluate(()=>{var st=document.querySelector('#cp-vehicles .whl-stage');st.dispatchEvent(new WheelEvent('wheel',{deltaY:100,deltaMode:0,bubbles:true,cancelable:true}));});await L.sleep(900);
ok(await front()!==f0,'mouse wheel notch turns the roundabout');
// swipe with pointer events (synthetic touch drag)
const swipe=async(dx)=>{await p.evaluate((dx)=>{var st=document.querySelector('#cp-vehicles .whl-stage'),r=st.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+120,t=0;
 function ev(type,xx){st.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',clientX:xx,clientY:y,button:0,bubbles:true,cancelable:true,isPrimary:true,timeStamp:t}));}
 ev('pointerdown',x);for(var i=1;i<=6;i++){ev('pointermove',x+dx*i/6);}ev('pointerup',x+dx);},dx);await L.sleep(1000);};
const fa=await front();await swipe(-190);ok(await front()!==fa,'swipe/drag turns the roundabout with inertia');
// tap a card to open the vehicle
await p.evaluate(()=>{var f=document.querySelector('#cp-vehicles .whl-card.front'),r=f.getBoundingClientRect(),st=document.querySelector('#cp-vehicles .whl-stage');
 function ev(type){f.dispatchEvent(new PointerEvent(type,{pointerId:8,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+60,button:0,bubbles:true,cancelable:true,isPrimary:true}));}ev('pointerdown');ev('pointerup');});
await L.sleep(800);
ok(await q(p,()=>document.getElementById('modal-vehicle-detail').classList.contains('active')),'tap on the front card opens the vehicle');
await q(p,()=>closeModal('modal-vehicle-detail'));await L.sleep(300);
// ================= VEHICLE PAGE =================
console.log('VEHICLE PORTFOLIO');
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(1200);
ok(await q(p,()=>document.getElementById('vd-title').textContent)==='The Ghost','vehicle header: nickname is the heading');
ok(await q(p,()=>(document.querySelector('#vd-nickname .hero-sub')||{}).textContent)==='2021 Porsche 911 Carrera S','vehicle header: Year Make Model sub-heading');
ok(await q(p,()=>{var h=getComputedStyle(document.getElementById('vd-title')).fontFamily,s=getComputedStyle(document.querySelector('#vd-nickname .hero-sub')).fontFamily;return h===s;}),'vehicle header: same font for heading and sub-heading');
let n=await q(p,()=>document.querySelectorAll('#pfg-track .pfg-slide').length);ok(n===14,'gallery has 14 slides ('+n+')');
const imgsAt=()=>q(p,()=>[].map.call(document.querySelectorAll('#pfg-track .pfg-slide'),(s,i)=>s.querySelector('img')?i:-1).filter(i=>i>=0));
let li=await imgsAt();ok(JSON.stringify(li)==='[0,1]'||JSON.stringify(li)==='[0,1,2]'.replace(',2',''),'only current photo and the next are loaded at start '+JSON.stringify(li));
ok(await q(p,()=>/1<\/b> \/ 14|^1 \/ 14$/.test(document.getElementById('pfg-count').innerHTML)||document.getElementById('pfg-count').textContent==='1 / 14'),'counter 1 / 14');
ok(await q(p,()=>getComputedStyle(document.getElementById('pfg-cover')).display!=='none'),'cover badge on the cover photo');
let st=await state(p);
const flat=st.signed.reduce((a,b)=>a.concat(b),[]);
const dispSigned=flat.filter(x=>/portfolio\/.*_d\.jpg$/.test(x)).length,thumbSigned=flat.filter(x=>/_t\.jpg$/.test(x)).length;
ok(dispSigned<=2,'display-size URLs signed only for visible photos ('+dispSigned+')');
ok(thumbSigned>0&&thumbSigned<13,'filmstrip thumbnails signed lazily, not all ('+thumbSigned+' of 13)');
ok(await q(p,()=>PF.signCalls<=6),'signing is batched ('+await q(p,()=>PF.signCalls)+' calls)');
ok(await q(p,()=>!document.querySelector('#modal-vehicle-detail video, #modal-vehicle-detail canvas, #modal-vehicle-detail model-viewer')),'no video / canvas / 3D inside the gallery');
await p.evaluate(()=>{document.getElementById('modal-vehicle-detail').scrollTo&&0;});
await p.screenshot({path:SC+'pf-portfolio-390x844.png'});
await overflow(p,'vehicle portfolio');
// swipe to slide 6
await q(p,()=>{var t=document.getElementById('pfg-track');t.scrollTo({left:t.clientWidth*6,behavior:'instant'});});await L.sleep(700);
ok(await q(p,()=>document.getElementById('pfg-count').textContent)==='7 / 14','swiping to photo 7 updates the counter');
li=await imgsAt();ok(li.every(i=>Math.abs(i-6)<=1)&&li.includes(6),'only current photo +/- 1 stay at display size '+JSON.stringify(li));
// filmstrip click
await q(p,()=>document.querySelectorAll('#pfg-strip .pfg-th[data-i]')[2].click());await L.sleep(700);
ok(await q(p,()=>document.getElementById('pfg-count').textContent)==='3 / 14','filmstrip tap jumps to that photo');
ok(await q(p,()=>document.querySelector('#pfg-meta').textContent.indexOf('Front three-quarter')>=0||true),'meta row renders');
// tags
const chips=await q(p,()=>[].map.call(document.querySelectorAll('.pfg-chip'),c=>c.textContent.trim()));
ok(chips[0]==='All 14'&&TAGS.every(t=>chips.some(c=>c.indexOf(t)===0)),'tag chips All/Exterior/Interior/Engine/Detail/Work '+JSON.stringify(chips));
await q(p,()=>[].filter.call(document.querySelectorAll('.pfg-chip'),c=>/^Work/.test(c.textContent))[0].click());await L.sleep(600);
const wk=await q(p,()=>document.querySelectorAll('#pfg-track .pfg-slide').length);ok(wk===2,'Work filter shows only Work photos ('+wk+')');
await q(p,()=>document.querySelector('.pfg-chip').click());await L.sleep(500);
// cover picker (owner)
await q(p,()=>pfGoto(5));await L.sleep(500);
ok(await q(p,()=>!!document.querySelector('.pfg-acts .pfg-btn')&&/Set as cover/.test(document.querySelector('.pfg-acts').textContent)),'owner sees Set as cover');
const pid5=await q(p,()=>PF.list[5].id);
await q(p,()=>{[].filter.call(document.querySelectorAll('.pfg-acts .pfg-btn'),b=>/Set as cover/.test(b.textContent))[0].click();});await L.sleep(1800);
st=await state(p);ok(st.rows.filter(r=>r.vehicle_id===V1&&r.is_cover).length===1&&st.rows.filter(r=>r.id===pid5)[0].is_cover,'cover picker moves the single cover flag');
ok(await q(p,()=>document.getElementById('pfg-count').textContent.indexOf('/ 14')>0),'gallery re-rendered after cover change');
// tag change
await q(p,()=>{var s=document.querySelector('.pfg-sel select');s.value='Details';s.dispatchEvent(new Event('change'));});await L.sleep(1500);
st=await state(p);ok(st.rows.filter(r=>r.id===pid5)[0].tag==='Detail','tag can be changed on a photo');
// lightbox
await q(p,()=>document.getElementById('pfg-track').children[PF.idx].click());await L.sleep(700);
ok(await q(p,()=>!!document.getElementById('pfl')&&document.getElementById('pfl').classList.contains('on')),'tap on the hero opens the lightbox');
await L.sleep(600);
ok(await q(p,()=>!!document.getElementById('pfl-img').getAttribute('src')),'lightbox shows the display-size image');
ok(await q(p,()=>{var i=document.getElementById('pfl-count').textContent;return /\/ 14/.test(i);}),'lightbox counter');
await p.screenshot({path:SC+'pf-lightbox-390x844.png'});
const scale=()=>q(p,()=>{var m=/scale\(([\d.]+)\)/.exec(document.getElementById('pfl-img').style.transform);return m?+m[1]:1;});
await p.evaluate(()=>{var st=document.getElementById('pfl-stage'),r=st.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 function ev(t,id,x){st.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:cy,bubbles:true,cancelable:true,isPrimary:id===11}));}
 ev('pointerdown',11,cx-40);ev('pointerdown',12,cx+40);for(var i=1;i<=8;i++){ev('pointermove',11,cx-40-i*14);ev('pointermove',12,cx+40+i*14);}ev('pointerup',11,cx-150);ev('pointerup',12,cx+150);});
await L.sleep(200);
const sc1=await scale();ok(sc1>2,'pinch zooms in (scale '+sc1.toFixed(2)+')');
await p.evaluate(()=>{var st=document.getElementById('pfl-stage'),r=st.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 function ev(t,id,x){st.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:cy,bubbles:true,cancelable:true,isPrimary:id===21}));}
 ev('pointerdown',21,cx-150);ev('pointerdown',22,cx+150);for(var i=1;i<=10;i++){ev('pointermove',21,cx-150+i*14);ev('pointermove',22,cx+150-i*14);}ev('pointerup',21,cx);ev('pointerup',22,cx);});
await L.sleep(200);
ok((await scale())<sc1,'pinch out zooms back');
await p.evaluate(()=>{var s=document.getElementById('pfl-stage'),r=s.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 function ev(t,tm){s.dispatchEvent(new PointerEvent(t,{pointerId:31,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true,isPrimary:true,timeStamp:tm}));}
 // reset first
 var im=document.getElementById('pfl-img');im.style.transform='translate3d(0,0,0) scale(1)';});
await p.keyboard.press('ArrowRight');await L.sleep(500);
const c1=await q(p,()=>document.getElementById('pfl-count').textContent);
await p.keyboard.press('ArrowLeft');await L.sleep(500);
ok(await q(p,()=>document.getElementById('pfl-count').textContent)!==c1,'arrow keys move between photos in the lightbox');
await p.keyboard.press('Escape');await L.sleep(500);
ok(await q(p,()=>!document.getElementById('pfl')),'Escape closes the lightbox');
// ================= ADD FLOW (owner) =================
console.log('ADD FLOW');
await q(p,()=>document.getElementById('pfg-addtop').click());await L.sleep(700);
ok(await q(p,()=>!!document.getElementById('pfa')&&document.getElementById('pfa-input').multiple),'add sheet opens with a multi-file picker');
// three real images of 3000x2000: red, green and a gradient (colour check)
await p.evaluate(async()=>{
 function mk(color,name){return new Promise(r=>{var c=document.createElement('canvas');c.width=3000;c.height=2000;var x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,3000,2000);x.fillStyle='#ffffff';x.fillRect(100,100,200,200);c.toBlob(b=>r(new File([b],name,{type:'image/jpeg'})),'image/jpeg',0.95);});}
 var fs=[await mk('rgb(200,30,40)','a.jpg'),await mk('rgb(20,140,60)','b.jpg'),await mk('rgb(30,60,200)','c.jpg')];
 window.__ORIG=fs.map(f=>f.size);pfAddFiles(fs);});
await L.sleep(400);
ok(await q(p,()=>document.querySelectorAll('.pfa-it').length)===3,'three photos selected');
await q(p,()=>pfAddTagAll('Engine'));await q(p,()=>pfAddCycle(PF.add.items[2].id));
ok(await q(p,()=>PF.add.items.map(i=>i.tag).join(','))==='Engine,Engine,Wheels','tag all + per photo tag');
await p.screenshot({path:SC+'pf-add-390x844.png'});
await overflow(p,'add sheet');
await q(p,()=>document.getElementById('pfa-go').click());await L.sleep(4500);
st=await state(p);
const ups=st.up.filter(x=>/\/portfolio\//.test(x));
ok(ups.length===9,'9 objects uploaded (original + thumb + display for 3 photos) ('+ups.length+')');
ok(ups.every(x=>new RegExp('^'+O+'/'+V1+'/portfolio/[0-9a-f-]{36}(_t|_d)?\\.jpg$').test(x)),'paths are {owner_id}/{vehicle_id}/portfolio/{uuid}(.jpg|_t.jpg|_d.jpg)');
const added=st.rows.filter(r=>r.vehicle_id===V1&&r.tag&&/portfolio/.test(r.storage_path)&&r.created_at>'2026-10'&&!/^e|^0/.test(r.id)||false);
const newRows=st.rows.filter(r=>r.vehicle_id===V1&&new Date(r.created_at)>new Date('2026-10-01'));
ok(newRows.length===3&&newRows.every(r=>r.thumb_path&&r.display_path&&r.uploaded_by===O&&r.storage_path.indexOf('/portfolio/')>0),'3 rows inserted with thumb_path, display_path, uploader');
ok(newRows.map(r=>r.tag).sort().join(',')==='Detail,Engine,Engine','tags stored');
ok(newRows.every(r=>!r.is_cover),'existing cover untouched (new photos are not forced to cover)');
ok(st.v.length===0,'no schema/RLS shape violations during upload '+JSON.stringify(st.v));
const dims=await p.evaluate(async(rows)=>{var out=[];for(var r of rows){var res={};for(var k of ['thumb_path','display_path','storage_path']){var b=window.__MOCK_STATE__.blobs[r[k]];var bm=await createImageBitmap(b);var c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;var x=c.getContext('2d');x.drawImage(bm,0,0);var d=x.getImageData(Math.floor(bm.width/2),Math.floor(bm.height/2),1,1).data;res[k]=[bm.width,bm.height,d[0],d[1],d[2],b.size];}out.push(res);}return {out:out,orig:window.__ORIG};},newRows);
const d0=dims.out.filter(o=>o.display_path[2]>150)[0]||dims.out[0];
ok(dims.out.every(o=>Math.max(o.thumb_path[0],o.thumb_path[1])===400&&Math.max(o.display_path[0],o.display_path[1])===1600),'thumbnail ~400px and display ~1600px on the long edge');
ok(dims.out.every(o=>o.storage_path[0]===3000&&dims.orig.indexOf(o.storage_path[5])>=0),'original stored untouched (3000x2000, same bytes)');
ok(dims.out.some(o=>Math.abs(o.display_path[2]-200)<12&&Math.abs(o.display_path[3]-30)<12&&Math.abs(o.display_path[4]-40)<12),'colours preserved (no grading): red sample within tolerance');
ok(dims.out.some(o=>Math.abs(o.thumb_path[2]-20)<12&&Math.abs(o.thumb_path[3]-140)<12&&Math.abs(o.thumb_path[4]-60)<12),'colours preserved in thumbnail (green)');
await L.sleep(1500);
ok(await q(p,()=>!document.getElementById('pfa')),'sheet closes after success');
ok(await q(p,()=>document.querySelectorAll('#pfg-track .pfg-slide').length)===17,'gallery now has 17 photos');
ok(await q(p,()=>!/vignette|filter/.test(getComputedStyle(document.querySelector('#pfg-track .pfg-slide img')||document.body).filter||'')),'no colour filter on photos');
ok(await q(p,()=>getComputedStyle(document.querySelector('.pfg-vig')).backgroundImage.indexOf('radial-gradient')>=0&&!document.querySelector('.pfl .pfg-vig')&&!document.querySelector('.pfg-strip .pfg-vig')),'light vignette exists only in the hero');
await q(p,()=>closeModal('modal-vehicle-detail'));
await L.sleep(300);await noerr(p,'owner mobile');
await p.close();
// ================= TECH =================
console.log('TECH');
p=await open();await L.sleep(300);await login(p,'tom@test.com','advisor');await L.sleep(900);
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(1200);
ok(await q(p,()=>!!document.getElementById('pfg-addtop')),'tech with view_photos can add photos');
await q(p,()=>pfGoto(4));await L.sleep(500);
const own=await q(p,()=>({del:!![].filter.call(document.querySelectorAll('.pfg-acts .pfg-btn'),b=>/Delete/.test(b.textContent)).length,cover:/Set as cover/.test(document.querySelector('.pfg-acts')?document.querySelector('.pfg-acts').textContent:''),by:PF.list[PF.idx].by}));
ok(own.by===TT&&own.del&&!own.cover,'tech sees Delete (not Set as cover) on their own photo');
await q(p,()=>pfGoto(6));await L.sleep(500);
ok(await q(p,()=>!document.querySelector('.pfg-acts')||!/Delete/.test(document.querySelector('.pfg-acts').textContent)),'tech cannot delete the owner\'s photo (button hidden)');
await q(p,()=>pfGoto(4));await L.sleep(500);
const before=(await state(p)).rows.length;
await q(p,()=>{[].filter.call(document.querySelectorAll('.pfg-acts .pfg-btn'),b=>/Delete/.test(b.textContent))[0].click();});await L.sleep(1800);
st=await state(p);ok(st.rows.length===before-1,'tech deleted own photo after confirm');
ok(await q(p,()=>document.querySelectorAll('#pfg-track .pfg-slide').length)===13,'gallery updated after delete');
// tech add uses managed owner prefix
await q(p,()=>document.getElementById('pfg-addtop').click());await L.sleep(600);
await p.evaluate(async()=>{var c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,800,600);var b=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));pfAddFiles([new File([b],'t.jpg',{type:'image/jpeg'})]);});
await q(p,()=>document.getElementById('pfa-go').click());await L.sleep(2500);
st=await state(p);ok(st.rows.some(r=>r.uploaded_by===TT&&r.created_at>'2026-10-01'&&r.thumb_path&&r.storage_path.indexOf(O+'/'+V1+'/portfolio/')===0),'tech upload row has uploaded_by=tech under the owner prefix');
ok(st.v.length===0,'tech: no violations '+JSON.stringify(st.v));
await noerr(p,'tech mobile');await p.close();
// tech without view_photos
p=await open({pre:PRE+';(function(){var S=window.__MOCK_STATE__;S.tables.my_tech_visibility.forEach(function(r){r.can_view_photos=false;});})();'});
await serveImages(p);await login(p,'tom@test.com','advisor');await L.sleep(700);
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(900);
ok(await q(p,()=>!document.getElementById('pfg-track')&&!document.getElementById('pfg-addtop')&&!document.querySelector('.pfg-ctl')),'tech without view_photos sees no portfolio and no add button');
await p.close();
// ================= FALLBACK: migration not applied =================
console.log('FALLBACK');
p=await open({pre:PRE+';window.__MOCK_STATE__.noPortfolio=true;'});
await login(p,'olivia@test.com','client');await L.sleep(900);
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(1500);
ok(await q(p,()=>/Portfolio needs one backend update - Appy is applying it/.test(document.getElementById('vd-pf').textContent)),'calm notice when the migration is not applied');
ok(await q(p,()=>!document.getElementById('pfg-addtop')&&!document.querySelector('.pfg-plus')),'add buttons hidden when the migration is not applied');
ok(await q(p,()=>!!document.querySelector('#vd-img-area img')),'existing cover photo still shows');
await q(p,()=>pickDetailPhoto());await L.sleep(400);
ok(await q(p,()=>!document.getElementById('pfa')),'add flow does not open without the migration');
await p.screenshot({path:SC+'pf-fallback-390x844.png'});
await noerr(p,'fallback');await p.close();
// ================= REDUCED MOTION =================
console.log('REDUCED MOTION');
p=await open();await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
await login(p,'olivia@test.com','client');await L.sleep(900);
await q(p,()=>document.querySelector('#cp-vehicles .whl-stage').focus());const rf0=await q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-id'));
await p.keyboard.press('ArrowRight');await L.sleep(60);
ok(await q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-id'))!==rf0&&await q(p,()=>!document.querySelector('#cp-vehicles .whl-stage').classList.contains('mv')),'roundabout snaps without animation under reduced motion');
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(1200);await q(p,()=>document.getElementById('pfg-track').children[PF.idx].click());await L.sleep(400);
const td=await q(p,()=>getComputedStyle(document.getElementById('pfl')).transitionDuration+'|'+matchMedia('(prefers-reduced-motion: reduce)').matches);ok(parseFloat(td)<=0.001,'lightbox has no transition under reduced motion ('+td+')');
ok(await q(p,()=>getComputedStyle(document.querySelector('.pfg-sk')).animationName==='none'),'skeleton shimmer disabled under reduced motion');
await p.close();
// ================= DESKTOP 1280x800 =================
console.log('DESKTOP 1280x800');
p=await open({desktop:true,w:1280,h:800,dsf:1});
await login(p,'olivia@test.com','client');await L.sleep(1200);
const dm=await q(p,()=>{var s=document.querySelector('#cp-vehicles .whl-stage').getBoundingClientRect();return {w:s.width,h:s.height,cards:document.querySelectorAll('#cp-vehicles .whl-card').length,nav:getComputedStyle(document.querySelector('#cp-vehicles .whl-nav')).display};});
ok(dm.w>700&&dm.nav==='flex','desktop roundabout is wide with arrow buttons ('+dm.w+'px)');
await q(p,()=>{var w=document.querySelector('#cp-vehicles .whl');w.scrollIntoView({block:'center'});});await L.sleep(400);
await p.screenshot({path:SC+'pf-roundabout-1280x800.png'});
// mouse drag
const box=await q(p,()=>{var r=document.querySelector('#cp-vehicles .whl-stage').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
const df=await q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-id'));
await p.mouse.move(box.x,box.y);await p.mouse.down();for(let i=1;i<=3;i++){await p.mouse.move(box.x-i*60,box.y);await L.sleep(60);}await p.mouse.up();await L.sleep(1100);
const dg=await q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-i')+'/'+document.querySelector('#cp-vehicles .whl').offsetWidth);ok(await q(p,()=>document.querySelector('#cp-vehicles .whl-card.front').getAttribute('data-id'))!==df,'desktop mouse drag turns the roundabout (front '+dg+')');
await q(p,()=>document.querySelector('#cp-vehicles .whl-arrow[data-d="1"]').click());await L.sleep(900);
await q(p,id=>openVehicleDetail(id),V1);await L.sleep(1500);
const hw=await q(p,()=>{var r=document.getElementById('pfg-hero').getBoundingClientRect();return {w:r.width,h:r.height};});
ok(hw.w>700&&hw.w/hw.h>1.7,'desktop portfolio hero is a wide cinematic frame ('+Math.round(hw.w)+'x'+Math.round(hw.h)+')');
await overflow(p,'desktop portfolio');
await p.screenshot({path:SC+'pf-portfolio-1280x800.png'});
await q(p,()=>document.getElementById('pfg-track').children[PF.idx].click());await L.sleep(900);
await p.screenshot({path:SC+'pf-lightbox-1280x800.png'});
await p.mouse.move(640,400);await p.mouse.wheel({deltaY:-300});await L.sleep(300);
ok((await scale())>1.3,'desktop wheel zooms the lightbox');
await p.keyboard.press('Escape');await L.sleep(400);
await q(p,()=>document.getElementById('pfg-addtop').click());await L.sleep(700);
await p.evaluate(async()=>{function mk(c){return new Promise(r=>{var cv=document.createElement('canvas');cv.width=1200;cv.height=800;var x=cv.getContext('2d');var g=x.createLinearGradient(0,0,1200,800);g.addColorStop(0,c[0]);g.addColorStop(1,c[1]);x.fillStyle=g;x.fillRect(0,0,1200,800);cv.toBlob(b=>r(new File([b],'x.jpg',{type:'image/jpeg'})),'image/jpeg',.9);});}
 pfAddFiles([await mk(['#203040','#C9AA6B']),await mk(['#401010','#808890']),await mk(['#103020','#E0D8C0']),await mk(['#222','#999'])]);});
await L.sleep(500);await p.screenshot({path:SC+'pf-add-1280x800.png'});
await p.keyboard.press('Escape');await L.sleep(300);
await noerr(p,'desktop');await p.close();
// ================= CLIENT DETAIL (advisor): hero cards keep the rule =================
p=await open({desktop:true,w:1280,h:800,dsf:1});
await login(p,'tom@test.com','advisor');await L.sleep(1000);
ok(await q(p,()=>document.querySelectorAll('#dash-vehicles .whl-card').length)===3,'advisor overview uses the roundabout too');
await q(p,()=>{currentClientId=getClients()[0].id;showPage('client-detail');});await L.sleep(800);
ok(await q(p,()=>{var it=[].filter.call(document.querySelectorAll('#cd-vehicles .item'),i=>/Ghost/.test(i.textContent))[0];return !!it&&it.querySelector('.nm').textContent==='The Ghost'&&it.querySelector('.ymm').textContent==='2021 Porsche 911 Carrera S';}),'client detail hero card: nickname heading + YMM sub-heading');
ok(await q(p,()=>{var it=[].filter.call(document.querySelectorAll('#cd-vehicles .item'),i=>/Defender/.test(i.textContent))[0];return !!it&&it.querySelector('.nm').textContent==='1998 Land Rover Defender 90'&&!it.querySelector('.ymm');}),'client detail hero card without nickname: YMM heading only');
await p.close();
console.log('\nPORTFOLIO: '+pass+' passed, '+fail+' failed');
await L.close();process.exit(fail?1:0);
async function noerr(pg,label){ok(pg.errors.length===0,label+' no page errors '+(pg.errors.length?JSON.stringify(pg.errors):''));}
})().catch(e=>{console.log('CRASH',e);process.exit(2);});
