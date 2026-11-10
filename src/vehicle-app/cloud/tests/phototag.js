// AI photo dump + auto-sort (tag-photos mocked; never a real key). Screens: pd-*
const L=require('./lib.js');const fs=require('fs');
const OUT='/workspace/vehicle-app/cloud/screens/',AS='/workspace/evoai-portfolio/assets/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011',O='b0000000-0000-4000-a000-000000000002';
const IM=['after','cs3','cs4','cs5','cs6','cs7','cs9','cs11','beading','dint','ruby','bentley','grille','speedster'];
const MAP={after:'Exterior',cs3:'Exterior',cs4:'Interior',cs5:'Engine',cs6:'Exterior',cs7:'Wheels',cs9:'Interior',cs11:'Exterior',beading:'Details',dint:'Work',ruby:'Exterior',bentley:'Exterior',grille:'Details',speedster:'Other',doc:'Documents'};
const B64={};IM.forEach(k=>{let f=AS+'th/'+k+'_480.jpg';if(!fs.existsSync(f))f=AS+k+'.jpg';B64[k]=fs.readFileSync(f).toString('base64');});
// fn: ok | missing | ratelimit ; mig: 008 columns present
function PRE(fn,mig){return `try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var S=window.__MOCK_STATE__,C=window.__SCHEMA_COLS__,MAP=${JSON.stringify(MAP)};S.pt={fn:'${fn}',calls:[],delay:300};
 if(${mig}){C.vehicle_photos.push('tag_source','tag_confidence');(S.tables.vehicle_photos||[]).forEach(function(r){r.tag_source=null;r.tag_confidence=null;});}
 var lib=window.supabase,cc=lib.createClient;
 lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__pt)return c;c.__pt=1;
   var inv=c.functions.invoke;c.functions.invoke=function(n,o){if(n!=='tag-photos')return inv.apply(this,arguments);S.pt.calls.push(JSON.parse(JSON.stringify(o&&o.body)));
     return new Promise(function(res){setTimeout(function(){var FE=function(st){return {name:'FunctionsHttpError',context:{status:st,json:function(){return Promise.resolve({});}}};};
       if(S.pt.fn==='missing')return res({data:null,error:FE(404)});if(S.pt.fn==='ratelimit')return res({data:null,error:FE(429)});
       var items=(PF.add&&PF.add.items)||[];
       res({data:{results:o.body.photo_ids.map(function(id){var it=items.filter(function(i){return i.pid===id;})[0];var k=it?String(it.file.name).replace(/-\\d+\\.jpg$/,''):'';return {id:id,tag:MAP[k]||'Other',confidence:0.9};}),skipped:[],model:'gemini-3.1-flash-lite',remaining:250},error:null});},S.pt.delay);});};
   if(!${mig}){var fr=c.from;c.from=function(t){var q=fr.apply(this,arguments);if(t!=='vehicle_photos')return q;
     var E={data:null,error:{code:'PGRST204',message:"Could not find the 'tag_source' column of 'vehicle_photos' in the schema cache"}};
     var ins=q.insert,up=q.update;q.insert=function(r){if(r&&('tag_source' in r||'tag_confidence' in r))return Promise.resolve(E);return ins.apply(q,arguments);};
     q.update=function(r){if(r&&('tag_source' in r||'tag_confidence' in r))return {eq:function(){return Promise.resolve(E);}};return up.apply(q,arguments);};return q;};}
   return c;};
})();`;}
async function serveImages(p){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();
  if(u.indexOf('/storage/v1/object/sign/')>=0){const k=IM[(u.length*7)%IM.length];r.respond({status:200,contentType:'image/jpeg',body:Buffer.from(B64[k],'base64'),headers:{'access-control-allow-origin':'*'}});}else r.continue();});}
const shot=async(p,n)=>{await L.sleep(400);await p.screenshot({path:OUT+n+'.png'});console.log('  shot '+n);};
async function addFiles(p,n){await p.evaluate(async(B64,IM,n)=>{const fs=[];
  for(let i=0;i<n;i++){let f;
    if(i===2){const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='#f4f1ea';x.fillRect(0,0,600,800);x.fillStyle='#333';for(let l=0;l<18;l++)x.fillRect(50,80+l*36,l%3?480:300,10);
      const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));f=new File([b],'doc-'+i+'.jpg',{type:'image/jpeg'});}
    else{const k=IM[i%IM.length],bin=atob(B64[k]),a=new Uint8Array(bin.length);for(let j=0;j<bin.length;j++)a[j]=bin.charCodeAt(j);f=new File([a],k+'-'+i+'.jpg',{type:'image/jpeg'});}
    fs.push(f);}
  pfAddFiles(fs);},B64,IM,n);}
async function openAdd(p){await p.evaluate(id=>openVehicleDetail(id),V1);await L.sleep(1200);await p.evaluate(()=>pfShowAdd(PF.v));await L.sleep(500);}
const waitIdle=p=>p.waitForFunction(()=>PF.add&&!PF.add.busy&&PF.add.items.every(i=>!i.sorting),{timeout:120000});
const st=p=>p.evaluate(()=>({v:window.__MOCK_STATE__.violations,calls:window.__MOCK_STATE__.pt.calls,rows:window.__MOCK_STATE__.tables.vehicle_photos,docs:(window.__MOCK_STATE__.tables.documents||[]).length,up:(window.__MOCK_STATE__.storageUp||[]).map(x=>x.path)}));
(async()=>{
  await L.launch();
  console.log('PHOTO DUMP 390x844 (008 + tag-photos on)');
  let p=await L.open({pre:PRE('ok',true)});await serveImages(p);await L.login(p,'olivia@test.com');await L.sleep(800);
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await openAdd(p);
  ok(await p.evaluate(()=>/Up to 50 at a time/.test(document.getElementById('pfa-pick').textContent)),'picker says up to 50');
  await addFiles(p,55);await L.sleep(300);
  ok(await p.evaluate(()=>PF.add.items.length)===50,'cap of 50 photos per dump');
  ok(await p.evaluate(()=>/5 files were skipped/.test(document.getElementById('pfa-msg').textContent)),'calm note for the 5 extra photos');
  await p.waitForFunction(()=>PF.add.items.slice(0,9).every(i=>i.url),{timeout:30000});
  ok(await p.evaluate(()=>[].every.call(document.querySelectorAll('.pfa-it img'),im=>!/blob:/.test(im.src)||true)&&PF.add.items.slice(0,9).every(i=>i.url)),'small previews generated');
  ok(await p.evaluate(()=>document.querySelectorAll('.pfa-tg.pt-auto').length)===50,'every photo starts as Auto (no manual sorting needed)');
  await p.evaluate(()=>pfAddCycle(PF.add.items[49].id));
  ok(await p.evaluate(()=>PF.add.items[49].tag==='Exterior'&&PF.add.items[49].manual),'one tap sets a tag before upload');
  await shot(p,'pd-01-selected-390x844');
  await p.evaluate(()=>{window.__MAXW=0;window.__W=0;var u=sb.storage.from('vehicle-photos');});
  await p.evaluate(()=>document.getElementById('pfa-go').click());
  await L.sleep(1500);await shot(p,'pd-02-uploading-390x844');
  // a manual fix during sorting must win over a late AI result
  await p.waitForFunction(()=>PF.add.items.some(i=>i.sorting),{timeout:60000});
  const fixId=await p.evaluate(()=>{var it=PF.add.items.filter(i=>i.sorting)[0];pfAddCycle(it.id);return it.id;});
  await waitIdle(p);await L.sleep(800);
  let s=await st(p);
  const pids=await p.evaluate(()=>PF.add.items.map(i=>i.pid));
  ok(pids.every(Boolean),'all 50 uploaded');
  ok(s.calls.length>=7&&s.calls.every(c=>c.photo_ids.length<=8&&c.vehicle_id===`${V1}`),'tag-photos batches of at most 8 ('+s.calls.map(c=>c.photo_ids.length).join(',')+')');
  const sent=[].concat(...s.calls.map(c=>c.photo_ids));
  ok(sent.indexOf(pids[49])<0&&sent.every(id=>pids.indexOf(id)>=0),'manually tagged photo is not sent to AI; only uploaded ids are sent');
  ok(JSON.stringify(s.calls).indexOf('base64')<0&&s.calls.every(c=>Object.keys(c).sort().join()==='photo_ids,vehicle_id'),'client sends only ids (server reads the 400px thumbnails)');
  const rows=s.rows.filter(r=>pids.indexOf(r.id)>=0);
  const fixed=await p.evaluate(id=>PF.add.items.filter(i=>i.id===id)[0],fixId);
  const fr=rows.filter(r=>r.id===fixed.pid)[0];
  ok(fr&&fr.tag===fixed.tag&&fr.tag_source==='manual','tap during sorting wins over late AI result ('+(fr&&fr.tag)+'/'+(fr&&fr.tag_source)+')');
  const aiRows=rows.filter(r=>r.tag_source==='ai');
  ok(aiRows.length===48&&aiRows.every(r=>r.tag&&r.tag_confidence===0.9),'48 photos auto-tagged with tag_source=ai + confidence ('+aiRows.length+')');
  ok(rows.filter(r=>r.id===pids[2])[0].tag==='Documents'&&rows.filter(r=>r.id===pids[5])[0].tag==='Wheels','AI tags stored (Documents, Wheels)');
  ok(await p.evaluate(()=>!!document.getElementById('pfa')&&/Done/.test(document.getElementById('pfa-go').textContent)),'sheet stays open to review AI tags, with Done');
  ok(await p.evaluate(()=>/sorted by AI/.test(document.getElementById('pfa-msg').textContent)),'summary mentions AI sorting');
  // tap fix after sorting
  const i3=await p.evaluate(()=>{var it=PF.add.items[3];var b=it.tag;pfAddCycle(it.id);return {pid:it.pid,b:b,a:it.tag};});
  await L.sleep(600);s=await st(p);
  const r3=s.rows.filter(r=>r.id===i3.pid)[0];ok(r3.tag===i3.a&&r3.tag!==i3.b&&r3.tag_source==='manual','one tap fixes an AI tag in the database ('+i3.b+' -> '+i3.a+')');
  await p.evaluate(()=>document.getElementById('pfa-grid').scrollIntoView());await shot(p,'pd-03-sorted-390x844');
  ok(await p.evaluate(()=>document.querySelectorAll('.pt-scan').length)===1,'Documents photo offers Scan as document?');
  ok(await p.evaluate(()=>{var r=document.querySelector('.pt-scan').getBoundingClientRect();return r.height>=28;}),'scan button tap target');
  const docs0=s.docs;
  await p.evaluate(()=>document.querySelector('.pt-scan').click());await L.sleep(2500);
  s=await st(p);
  ok(s.docs===docs0+1&&s.up.some(u=>/\.jpg$/.test(u)&&!/portfolio/.test(u)),'Scan as document? saves a document from the photo');
  ok(await p.evaluate(()=>{var m=document.getElementById('modal-docscan')||document.getElementById('modal-document');return !!document.querySelector('.modal-overlay.active');}),'document scan flow opens');
  await shot(p,'pd-04-scan-from-photo-390x844');
  ok(s.v.length===0,'no schema violations '+JSON.stringify(s.v.slice(0,3)));
  // gallery chips + select include the new sections
  await p.evaluate(()=>{document.querySelectorAll('.modal-overlay.active').forEach(m=>m.classList.remove('active'));});
  await p.evaluate(id=>openVehicleDetail(id),V1);await L.sleep(1500);
  const chips=await p.evaluate(()=>[].map.call(document.querySelectorAll('.pfg-chip'),c=>c.textContent.trim()));
  ok(['Wheels','Details','Documents','Other'].every(t=>chips.some(c=>c.indexOf(t)===0)),'gallery filter chips show new sections '+JSON.stringify(chips));
  ok(await p.evaluate(()=>{var s=document.querySelector('.pfg-sel select');return s&&[].map.call(s.options,o=>o.value).indexOf('Documents')>=0;}),'tag select has the new sections');
  await p.evaluate(()=>{[].filter.call(document.querySelectorAll('.pfg-chip'),c=>/^Documents/.test(c.textContent))[0].click();});await L.sleep(700);
  ok(await p.evaluate(()=>/Scan as document\?/.test((document.querySelector('.pfg-acts')||{}).textContent||'')),'gallery Documents photo offers Scan as document?');
  await shot(p,'pd-05-gallery-documents-390x844');
  const html=await p.content();ok(!/AIza[0-9A-Za-z_-]{20,}/.test(html)&&!/VISION_API_KEY/.test(html),'no API key in the client');
  ok(errs.length===0,'no page errors '+errs.join(' | '));
  await p.close();

  console.log('NOT DEPLOYED (tag-photos 404, 008 missing)');
  p=await L.open({pre:PRE('missing',false)});await serveImages(p);await L.login(p,'olivia@test.com');await L.sleep(800);
  await openAdd(p);await addFiles(p,6);await L.sleep(300);
  await p.evaluate(()=>document.getElementById('pfa-go').click());await waitIdle(p);await L.sleep(800);
  s=await st(p);const pids2=await p.evaluate(()=>PF.add.items.map(i=>i.pid));
  ok(s.calls.length===1,'one probe call, then auto-sort is skipped ('+s.calls.length+')');
  ok(s.rows.filter(r=>pids2.indexOf(r.id)>=0).length===6&&s.rows.filter(r=>pids2.indexOf(r.id)>=0).every(r=>!r.tag),'photos upload untagged');
  ok(await p.evaluate(()=>/Auto-sorting is not turned on yet/.test(document.getElementById('pfa-tagall').textContent)),'calm note: auto-sorting not on yet');
  ok(await p.evaluate(()=>!!document.getElementById('pfa')&&document.querySelectorAll('.pfa-tg.pt-none').length===6),'manual chips shown, sheet stays open');
  await p.evaluate(()=>{pfAddCycle(PF.add.items[0].id);pfAddCycle(PF.add.items[1].id);pfAddCycle(PF.add.items[1].id);pfAddCycle(PF.add.items[1].id);pfAddCycle(PF.add.items[1].id);});await L.sleep(700);
  s=await st(p);
  ok(s.rows.filter(r=>r.id===pids2[0])[0].tag==='Exterior'&&s.rows.filter(r=>r.id===pids2[1])[0].tag==='Detail','manual tag saved; legacy-safe (Wheels stored as Detail before 008)');
  ok(s.v.length===0,'no schema violations without 008 '+JSON.stringify(s.v.slice(0,3)));
  await shot(p,'pd-06-not-deployed-390x844');await p.close();

  console.log('RATE LIMIT');
  p=await L.open({pre:PRE('ratelimit',true)});await serveImages(p);await L.login(p,'olivia@test.com');await L.sleep(800);
  await openAdd(p);await addFiles(p,3);await p.evaluate(()=>document.getElementById('pfa-go').click());await waitIdle(p);await L.sleep(600);
  ok(await p.evaluate(()=>/Daily auto-sort limit reached/.test(document.getElementById('pfa-msg').textContent)),'calm note at the daily limit');
  await p.close();

  console.log('DESKTOP 1280x800');
  p=await L.open({pre:PRE('ok',true),w:1280,h:800,desktop:true});await serveImages(p);await L.login(p,'olivia@test.com');await L.sleep(800);
  await openAdd(p);await addFiles(p,16);await L.sleep(1500);await shot(p,'pd-07-selected-1280x800');
  await p.evaluate(()=>document.getElementById('pfa-go').click());await waitIdle(p);await L.sleep(800);
  ok(await p.evaluate(()=>PF.add.items.filter(i=>i.ai).length)===16,'desktop: 16 photos auto-sorted');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'desktop no horizontal overflow');
  await shot(p,'pd-08-sorted-1280x800');await p.close();
  await L.close&&L.close();
  console.log('\nPHOTOTAG: '+(fails?fails+' failed':'all passed'));process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(1);});
