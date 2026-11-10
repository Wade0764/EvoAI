// v16 photofix: cover photo added in this session (uploadPhoto, no sort) then a dump of big iPhone-sized photos.
// Before the fix sort_order became NaN -> null -> 23502 -> "That did not save" for every photo.
const L=require('./lib.js');
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const V1='d0000000-0000-4000-a000-000000000011';
const PRE=`try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};(function(){var S=window.__MOCK_STATE__;window.__SCHEMA_COLS__.vehicle_photos.push('tag_source','tag_confidence');S.pt={fn:'missing',calls:[],delay:50};
 var lib=window.supabase,cc=lib.createClient;lib.createClient=function(){var c=cc.apply(this,arguments);if(c.__pt)return c;c.__pt=1;var inv=c.functions.invoke;
 c.functions.invoke=function(n,o){if(n!=='tag-photos')return inv.apply(this,arguments);return Promise.resolve({data:null,error:{name:'FunctionsHttpError',context:{status:404,json:function(){return Promise.resolve({});}}}});};return c;};})();`;
async function bigJpeg(p,name){return p.evaluate(async(name)=>{const c=document.createElement('canvas');c.width=4032;c.height=3024;const x=c.getContext('2d');
  const im=x.createImageData(4032,3024),d=im.data;for(let i=0;i<d.length;i+=4){const r=(Math.random()*255)|0;d[i]=r;d[i+1]=(r*7)&255;d[i+2]=(i>>10)&255;d[i+3]=255;}x.putImageData(im,0,0);
  let q=.5,b;for(;;){b=await new Promise(r=>c.toBlob(r,'image/jpeg',q));if(b.size>=3.6e6||q>=.95)break;q+=.1;}
  window.__F=window.__F||[];window.__F.push(new File([b],name,{type:'image/jpeg'}));return b.size;},name);}
(async()=>{
  await L.launch();
  const p=await L.open({pre:PRE});await L.login(p,'olivia@test.com');await L.sleep(800);
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.evaluate(id=>openVehicleDetail(id),V1);await L.sleep(1200);
  // cover added in this session via the classic path (vehicle edit / photo strip)
  await p.evaluate(async()=>{const v=byId(getVehicles(),currentVehicleId);const c=document.createElement('canvas');c.width=c.height=64;const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.8));await uploadPhoto(v,b,!(v._photos||[]).some(x=>x.isCover));});
  const sz=[];for(let i=0;i<5;i++)sz.push(await bigJpeg(p,'IMG_00'+i+'.JPG'));
  await p.evaluate(()=>{window.__F.push(new File([new Uint8Array(4000)],'IMG_0099.HEIC',{type:'image/heic'}));});
  ok(sz.every(s=>s>3e6),'fixtures ~4MB 4032x3024 JPEG ('+sz.map(s=>(s/1e6).toFixed(1)).join(',')+' MB) + 1 HEIC');
  await p.evaluate(()=>pfShowAdd(PF.v));await L.sleep(400);
  await p.evaluate(()=>pfAddFiles(window.__F));
  await p.waitForFunction(()=>PF.add.items.every(i=>i.state==='ready'||i.state==='fail'||i.url),{timeout:60000}).catch(()=>{});await L.sleep(1500);
  await p.evaluate(()=>pfUploadAll());
  await p.waitForFunction(()=>PF.add&&!PF.add.busy,{timeout:120000});await L.sleep(500);
  const r=await p.evaluate(()=>({items:PF.add.items.map(i=>({n:i.file.name,s:i.state,e:i.err||''})),rows:(window.__MOCK_STATE__.tables.vehicle_photos||[]).map(r=>({s:r.sort_order,p:r.storage_path})),v:window.__MOCK_STATE__.violations}));
  console.log(JSON.stringify(r.items));
  const jp=r.items.filter(i=>/JPG$/.test(i.n));
  ok(jp.every(i=>i.s==='done'),'all 5 big JPEGs saved after a cover was added in the same session');
  ok(r.rows.every(x=>Number.isFinite(x.s)),'every vehicle_photos row has a numeric sort_order');
  const he=r.items.filter(i=>/HEIC$/.test(i.n))[0];
  ok(he&&(he.s==='done'||!/That did not save/.test(he.e)),'HEIC either saves or gets a specific message ('+(he&&(he.s+' '+he.e))+')');
  ok(!r.v.length,'no mock violations '+JSON.stringify(r.v));ok(!errs.length,'no page errors '+errs.join(';'));
  await L.close();console.log(fails?'FAILED '+fails:'ALL OK');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
