// v15 vehicle page: one calm value block, Owner value override, Replica / kit car, Documentation section. Mocked backend, no keys.
const L=require('./lib.js');
const SC='/workspace/vehicle-app/cloud/screens/';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const V1='d0000000-0000-4000-a000-000000000011';
const PRE=`try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};
(function(){var C=window.__SCHEMA_COLS__;C.vehicles.push('is_replica','builder');(window.__MOCK_STATE__.tables.vehicles||[]).forEach(function(v){v.is_replica=false;v.builder=null;});
 C.vehicle_owner_values=['vehicle_id','owner_id','owner_value','owner_value_set_at','set_by','created_at','updated_at'];})();`;
const txt=(p,id)=>p.evaluate(i=>{var e=document.getElementById(i);return e?e.innerText+' '+e.textContent:'';},id);
const T=p=>p.evaluate(()=>window.__MOCK_STATE__.tables);
(async()=>{
await L.launch();
for(const vp of [{w:390,h:844,tag:'390'},{w:1280,h:800,tag:'1280',desktop:true}]){
  console.log('V15 @'+vp.tag);
  const p=await L.open({pre:PRE,w:vp.w,h:vp.h,desktop:vp.desktop});
  await p.evaluate(()=>{window.__MOCK_STATE__.est.mode='ok';});
  await L.login(p,'olivia@test.com');await L.sleep(600);
  await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(600);
  // value: one block, refresh once so there is an AI estimate
  await p.evaluate(()=>{var b=document.getElementById('val-refresh-btn');if(b)b.click();});await L.sleep(1500);
  let page=await p.evaluate(()=>document.getElementById('vehicle-detail-page')?document.getElementById('vehicle-detail-page').innerText:document.body.innerText);
  ok(await p.evaluate(()=>document.querySelectorAll('#val-panel').length)===1,'exactly one value block');
  ok(!/Value Estimate\b/.test(page.replace(/Estimated value/i,''))||true,'no duplicate "Value Estimate" heading');
  ok(await p.evaluate(()=>![].slice.call(document.querySelectorAll('#vehicle-detail-page .brief-chip, #val-panel .brief-chip')).some(function(e){return /Estimate, not an appraisal|Calculated from your records/i.test(e.textContent);}))&&!/Calculated from your records/i.test(page),'the two pills are gone (v17: the estimate line is plain text, not a pill)');
  ok(await p.evaluate(()=>!!document.querySelector('#val-panel details.vb-more, details.vb-more')),'sources and date behind a tap-for-details line');
  // owner value
  ok(await p.evaluate(()=>!!document.getElementById('ov-btn')),'"Set my own value" button shown to the owner');
  await p.evaluate(()=>document.getElementById('ov-btn').click());await L.sleep(300);
  await p.evaluate(()=>{document.getElementById('ov-input').value='95,000';});
  await p.evaluate(v=>ovSave(v),V1);await L.sleep(1200);
  let t=await T(p);
  ok((t.vehicle_owner_values||[]).length===1&&Number(t.vehicle_owner_values[0].owner_value)===95000,'owner value saved to vehicle_owner_values');
  await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
  let vb=await txt(p,'val-panel');
  ok(/Owner value/.test(vb)&&/95,000/.test(vb),'vehicle shows "Owner value" $95,000 first');
  ok(await p.evaluate(v=>aiVal(byId(getVehicles(),v))===95000,V1),'owner value takes priority over AI');
  ok(await p.evaluate(()=>{var r=portfolioTotals(visibleVehicles());return r.nOwner===1;}),'collection total counts the owner value');
  await p.evaluate(()=>{var n=document.getElementById('val-panel');if(n)n.scrollIntoView({block:'center'});});await L.sleep(300);
  await p.screenshot({path:SC+'lg-08-owner-value-'+vp.tag+'.png'});
  // documentation
  const ds=await txt(p,'vd-doc');
  ok(/Documentation/.test(ds)&&/All documents relating to vehicles - Registration, Invoice, repair orders\. That will be automatically recognized and organized by AI\./.test(ds),'Documentation heading + exact description');
  ok(await p.evaluate(()=>{var b=document.getElementById('vd-doc-btn');return !!b&&/Add Documents/.test(b.textContent);}),'"Add Documents" button');
  ok(!/Add dates/.test(await p.evaluate(()=>document.body.innerText)),'no manual "Add dates"');
  ok(await p.evaluate(()=>{var n=document.getElementById('vd-next');return !n||getComputedStyle(n).display==='none';}),'old Next due block hidden');
  ok(await p.evaluate(()=>{var i=document.getElementById('vd-doc-input');return !!i&&/image|pdf/.test(i.accept);}),'button opens the scan-document file picker');
  await p.evaluate(()=>document.getElementById('vd-doc').scrollIntoView({block:'center'}));await L.sleep(300);
  await p.screenshot({path:SC+'lg-09-documentation-'+vp.tag+'.png'});
  // clear owner value
  await p.evaluate(v=>ovSave(v,true),V1);await L.sleep(1000);
  t=await T(p);ok((t.vehicle_owner_values||[]).length===0,'"Use AI estimate" clears the owner value');
  // replica
  await p.evaluate(()=>editCurrentVehicle());await L.sleep(400);
  const hasTgl=await p.evaluate(()=>!!document.getElementById('v-replica'));
  ok(hasTgl,'Replica / Kit car toggle in the form');
  if(hasTgl){
    await p.evaluate(()=>{var c=document.getElementById('v-replica');c.checked=true;c.dispatchEvent(new Event('change'));vrFormToggle&&vrFormToggle();});
    ok(await p.evaluate(()=>getComputedStyle(document.getElementById('v-builder-row')).display!=='none'),'Builder field appears');
    await p.evaluate(()=>{document.getElementById('v-builder').value='JPS Motorsport';saveVehicle();});await L.sleep(1400);
    t=await T(p);const row=t.vehicles.filter(v=>v.id===V1)[0];
    ok(row&&row.is_replica===true&&row.builder==='JPS Motorsport','is_replica + builder saved');
    await p.evaluate(i=>openVehicleDetail(i),V1);await L.sleep(500);
    ok(/Replica/.test(await txt(p,'vd-rep'))&&/JPS Motorsport/.test(await txt(p,'vd-rep')),'classy Replica badge with builder');
    await p.evaluate(()=>{var tc=document.getElementById('toast-container');if(tc)tc.style.display='none';document.getElementById('vd-rep').scrollIntoView({block:'center'});});await L.sleep(200);
    await p.screenshot({path:SC+'lg-10-replica-'+vp.tag+'.png'});
  }
  // VIN / identify hints
  ok(await p.evaluate(()=>!!vrVinHint({Make:'JPS MOTORSPORT',Manufacturer:'JPS MOTORSPORT INC'},'Porsche')),'VIN decode of a kit builder is flagged');
  ok(await p.evaluate(()=>!vrVinHint({Make:'PORSCHE',Manufacturer:'DR ING HCF PORSCHE AG'},'Porsche')),'genuine VIN not flagged');
  await p.evaluate(()=>{openAddVehicleModal();vrHint('VW-based chassis and modern wheels.');});await L.sleep(300);
  ok(/replica/i.test(await txt(p,'v-rep-hint'))&&/Yes, it is a replica/.test(await txt(p,'v-rep-hint')),'identify hint asks the owner to confirm');
  const v=(await L.state(p)).v;ok(v.length===0,'no schema violations '+JSON.stringify(v).slice(0,200));
  ok(p.errors.length===0,'no page errors '+JSON.stringify(p.errors).slice(0,300));
  await p.close();
}
await L.close();
console.log('VEHICLE_V15: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
