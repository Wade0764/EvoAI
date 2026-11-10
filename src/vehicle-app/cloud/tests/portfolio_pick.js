// v33 (p33): "Which portfolio?" step in the master-sheet import (mockup pf-04, Option B). Mocked backend only.
const L=require('./lib.js');const fs=require('fs');const path=require('path');
const SC='/workspace/vehicle-app/cloud/screens/',PV='/workspace/vehicle-app/cloud/publish-cloud-preview-portfolio/screens/',FX=path.join(__dirname,'fixtures')+'/';
fs.mkdirSync(PV,{recursive:true});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const O='b0000000-0000-4000-a000-000000000002',PU='a3000000-0000-4000-a000-000000000001',PZ='a3000000-0000-4000-a000-000000000002';
const BASE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};`;
const MIG=(two)=>`(function(){var C=window.__SCHEMA_COLS__,S=window.__MOCK_STATE__;C.portfolios=['id','owner_id','name','country','currency','sort_order','is_default','created_at'];C.vehicles.push('portfolio_id');
 S.tables.portfolios=[{id:'${PU}',owner_id:'${O}',name:'USA Collection',country:'US',currency:'USD',sort_order:0,is_default:true,created_at:'2026-10-01'}${two?`,{id:'${PZ}',owner_id:'${O}',name:'South Africa Collection',country:'ZA',currency:'ZAR',sort_order:1,is_default:false,created_at:'2026-10-02'}`:''}];
 S.tables.vehicles.forEach(function(v){if(v.owner_id==='${O}')v.portfolio_id='${PU}';});})();`;
async function serve(p){await p.setRequestInterception(true);p.on('request',r=>{const u=r.url();
  if(u.indexOf('cdn.sheetjs.com/xlsx-0.20.3/')>=0)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(FX+'sheetjs/xlsx.full.min.js'),headers:{'access-control-allow-origin':'*'}});
  if(u.indexOf('cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/')>=0)return r.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(FX+'pdfjs/'+u.split('/').pop()),headers:{'access-control-allow-origin':'*'}});
  r.continue();});}
const up=async(p,file)=>{const h=await p.$('#im-file');await h.uploadFile(FX+file);await p.waitForFunction(()=>!IM.busy&&(IM.step!==1||IM.msg),{timeout:20000});await L.sleep(250);};
const click=(p,t)=>p.evaluate(t=>{var all=[].slice.call(document.querySelectorAll('#im-root button'));var b=all.filter(x=>x.textContent.trim()===t)[0]||all.filter(x=>x.textContent.indexOf(t)>=0)[0];if(!b)return false;b.click();return true;},t);
const txt=p=>p.evaluate(()=>document.getElementById('im-root').innerText);
const shot=async(p,n)=>{await p.evaluate(()=>{document.getElementById('im-root').scrollTop=0;});await L.sleep(250);await p.screenshot({path:SC+n});fs.copyFileSync(SC+n,PV+n);};
// style: every visible text >=15px, colour white (#F2F0EB/#FFF family) or gold; never grey
const style=p=>p.evaluate(()=>{var bad=[],min=99;function isOk(c){var m=c.match(/\d+(\.\d+)?/g).map(Number);var r=m[0],g=m[1],b=m[2];if(m.length>3&&m[3]===0)return true;
  if(r>=230&&g>=225&&b>=215)return true;/*white*/ if(Math.abs(r-201)<=30&&Math.abs(g-170)<=30&&Math.abs(b-107)<=40&&r>b+50)return true;/*gold*/ if(r<40&&g<40&&b<40)return true;/*dark text on gold button*/ return false;}
  [].slice.call(document.querySelectorAll('#im-root *')).forEach(function(e){var own=[].slice.call(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim());if(!own||!e.offsetParent)return;var cs=getComputedStyle(e);var f=parseFloat(cs.fontSize);if(f<min)min=f;if(!isOk(cs.color))bad.push(e.textContent.trim().slice(0,30)+' '+cs.color);});return {min:min,bad:bad};});
(async()=>{
await L.launch();
const go=async pre=>{const p=await L.open({pre:BASE+pre});await serve(p);await L.login(p,'olivia@test.com');await L.sleep(600);
  await p.evaluate(()=>document.getElementById('cp-import').click());await L.sleep(300);await up(p,'Vehicle_Intake_Summary.xlsx');return p;};
// A. no migration: one implicit portfolio, defaulted, plain line, no "+ New"
let p=await go('');let t=await txt(p);
ok(/Which portfolio\?/.test(t)&&/You have one portfolio, so these vehicles go into My collection\./.test(t),'one implicit portfolio: defaulted, says where the cars go');
ok(!/New portfolio for this import/.test(t)&&!/Or start a new one/.test(t),'no "+ New portfolio" before migration_013');
await click(p,'Continue');await L.sleep(300);
ok(await p.evaluate(()=>IM.step===3&&IM.pfId===null),'continue goes to review with the implicit portfolio');
await p.close();
// B. migration, exactly one portfolio: defaulted to it
p=await go(MIG(false));t=await txt(p);
ok(await p.evaluate(id=>IM.pfId===id,PU),'only portfolio (USA Collection) is preselected');
ok(/go into USA Collection\. Or start a new one below\./.test(t)&&/New portfolio for this import/.test(t),'single-portfolio line + "+ New portfolio" offered');
let st=await style(p);ok(st.min>=15,'text >=15px ('+st.min+')');ok(st.bad.length===0,'white or gold text only '+st.bad.join(' | '));
await shot(p,'pf-pick-01-single-390.png');
await p.close();
// C. migration, USA + South Africa: asks, defaults to the default, pick SA
p=await go(MIG(true));t=await txt(p);
ok(/Choose where these vehicles go\./.test(t)&&/USA Collection/.test(t)&&/South Africa Collection/.test(t)&&/Empty \u00b7 ZAR/.test(t),'two portfolios listed (USA + South Africa, ZAR)');
ok(await p.evaluate(id=>IM.pfId===id&&document.querySelectorAll('.im-pf.on').length===1,PU),'default portfolio preselected, one radio on');
st=await style(p);ok(st.min>=15&&st.bad.length===0,'style ok on 2-portfolio screen ('+st.min+'px) '+st.bad.join(' | '));
await shot(p,'pf-pick-02-two-390.png');
await click(p,'South Africa Collection');await L.sleep(200);
ok(await p.evaluate(id=>IM.pfId===id&&document.querySelector('.im-pf.on').textContent.indexOf('South Africa')>=0,PZ),'tap South Africa selects it');
await shot(p,'pf-pick-03-southafrica-390.png');
await click(p,'Continue');await L.sleep(300);
ok(await p.evaluate(id=>IM.step===3&&IM.pfId===id,PZ),'review step keeps South Africa as the target');
// stale id falls back to default
await p.evaluate(()=>{IM.step=2;IM.pfId='gone';imRender();});await L.sleep(100);
ok(await p.evaluate(id=>IM.pfId===id,PU),'a missing portfolio id falls back to the default');
// D. new portfolio: country ZA -> ZAR
await click(p,'New portfolio for this import');await L.sleep(200);
ok(await p.evaluate(()=>[].slice.call(document.querySelectorAll('#im-np-cur option')).map(o=>o.value).join()==='USD,EUR,GBP,ZAR'),'currency list has ZAR');
await p.evaluate(()=>{IM.newPf.name='Cape Town Garage';var s=document.getElementById('im-np-country');s.value='ZA';s.dispatchEvent(new Event('change'));});await L.sleep(200);
ok(await p.evaluate(()=>IM.newPf.currency==='ZAR'&&document.getElementById('im-np-cur').value==='ZAR'),'South Africa picks ZAR');
st=await style(p);ok(st.min>=15&&st.bad.length===0,'style ok on new-portfolio form ('+st.min+'px) '+st.bad.join(' | '));
await shot(p,'pf-pick-04-new-za-390.png');
await click(p,'Continue');await L.sleep(500);
let row=await p.evaluate(()=>window.__MOCK_STATE__.tables.portfolios.filter(r=>r.name==='Cape Town Garage')[0]);
ok(row&&row.currency==='ZAR'&&row.country==='ZA'&&row.is_default===false,'new portfolio saved as ZA / ZAR, not default');
ok(await p.evaluate(id=>IM.step===3&&IM.pfId===id,row&&row.id),'import targets the new portfolio');
ok(p.errors.length===0,'no page errors '+p.errors.join(' | '));
await p.close();await L.close();
console.log(`\nportfolio_pick: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
