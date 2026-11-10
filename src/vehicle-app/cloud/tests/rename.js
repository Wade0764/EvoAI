// v28 Rename collection: Account line, sheet, validation, title + View-as picker update, role rules. Mocked set_collection_name RPC (migration_020 rules).
const L=require('./lib.js');
let pass=0,fail=0;
function ok(c,m){if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}}
const SC='/workspace/vehicle-app/cloud/screens/';
const O='b0000000-0000-4000-a000-000000000002',TT='c0000000-0000-4000-a000-000000000003',M='b1000000-0000-4000-a000-000000000077';
const hide=p=>p.evaluate(()=>{var t=document.getElementById('toast-container');if(t)t.style.display='none';});
const SETUP=function(a){
  var S=window.__MOCK_STATE__,T=function(n){return S.tables[n]||(S.tables[n]=[]);};
  if(!T('profiles').some(function(p){return p.id===a.M;})){
    T('profiles').push({id:a.M,role:'owner',display_name:'Pat Managed',email:null,managed:true,managed_by:a.TT,claimed_by:null});
    T('tech_access').push({id:'f4000000-0000-4000-a000-000000000077',tech_id:a.TT,owner_id:a.M,vehicle_id:null,status:'active',client_origin:true,invited_by:a.TT});
  }
  S.renameCalls=[];
  S.rpcHandlers.set_collection_name=function(x){
    S.renameCalls.push(x);var u=S.session&&S.session.user.id,me=T('profiles').filter(function(p){return p.id===u;})[0],tg=T('profiles').filter(function(p){return p.id===x.p_owner;})[0];
    var okk=tg&&(x.p_owner===u||(me&&me.role==='admin')||(tg.managed&&!tg.claimed_by&&tg.managed_by===u));
    if(!okk)return {data:null,error:{code:'42501',message:'not_allowed'}};
    var v=String(x.p_name||'').replace(/\s+/g,' ').trim();
    if(!v||v.length>60)return {data:null,error:{code:'22023',message:'invalid_name'}};
    tg.collection_name=v;return {data:v,error:null};
  };
};
const PRE="try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}}catch(e){}";
async function page(email){const p=await L.open({pre:PRE});await p.evaluate(SETUP,{M,TT});await L.login(p,email);await L.sleep(400);return p;}
const line=p=>p.evaluate(()=>{var r=document.getElementById('rn-line');return r&&r.style.display!=='none'?r.innerText:null;});
(async()=>{
await L.launch();
console.log('1) owner renames their collection');
let p=await page('olivia@test.com');
ok(await p.evaluate(()=>/The Olivia Harper Collection/.test(document.getElementById('cp-title').innerText)),'default title');
await p.evaluate(()=>openAccountModal());await L.sleep(300);
const l1=await line(p);ok(l1&&/Rename collection/.test(l1)&&/The Olivia Harper Collection/.test(l1),'Account shows Rename collection + current name');
ok(await p.evaluate(()=>{var k=getComputedStyle(document.querySelector('#rn-line .rn-k')),v=getComputedStyle(document.querySelector('#rn-line .rn-v'));return parseFloat(k.fontSize)>=18&&k.color==='rgb(255, 255, 255)'&&parseFloat(v.fontSize)>=16&&v.color!==k.color;}),'large white label, gold name');
await hide(p);await p.screenshot({path:SC+'rn-01-account-line.png'});
await p.evaluate(()=>document.getElementById('rn-line').click());await L.sleep(400);
ok(await p.evaluate(()=>{var i=document.getElementById('rn-input');return i&&i.maxLength===60&&i.value==='The Olivia Harper Collection'&&!!document.getElementById('rn-save')&&/Cancel/.test(document.getElementById('evo-sheet').innerText);}),'sheet: current name, field maxlength 60, Save/Cancel');
await p.evaluate(()=>{setVal('rn-input','   ');document.getElementById('rn-save').click();});await L.sleep(200);
ok(await p.evaluate(()=>/Enter a name/.test(document.getElementById('rn-err').innerText)&&window.__MOCK_STATE__.renameCalls.length===0),'empty name blocked before saving');
await p.evaluate(()=>{setVal('rn-input','  The   Harper   Stable ');rnCount();});
await hide(p);await p.screenshot({path:SC+'rn-02-sheet.png'});
await p.evaluate(()=>document.getElementById('rn-save').click());await L.sleep(700);
ok(await p.evaluate(()=>window.__MOCK_STATE__.renameCalls.slice(-1)[0].p_name==='The Harper Stable'),'trimmed name sent to RPC');
ok(await p.evaluate(()=>!document.getElementById('evo-sheet')),'sheet closes on save');
await p.evaluate(()=>closeModal('modal-account'));await L.sleep(300);
ok(await p.evaluate(()=>/The Harper Stable/.test(document.getElementById('cp-title').innerText)&&!/Olivia Harper Collection/.test(document.getElementById('cp-title').innerText)),'home large title updated');
await hide(p);await p.screenshot({path:SC+'rn-03-title-updated.png'});
await p.evaluate(async()=>{C.clients.forEach(function(c){delete c.collectionName;});await loadAll();refreshCurrent();});await L.sleep(500);
ok(await p.evaluate(()=>window.__MOCK_STATE__.tables.profiles.filter(function(x){return x.collection_name==='The Harper Stable';}).length===1&&/The Harper Stable/.test(document.getElementById('cp-title').innerText)),'saved to DB row; title survives a fresh data load');
ok(!p.errors.length,'no page errors: '+p.errors.join('|'));await p.close();

console.log('2) admin: View-as picker + any collection');
p=await page('wade@evo.test');
await p.evaluate(()=>openAccountModal());await L.sleep(300);
ok(!!(await line(p)),'admin sees Rename collection');
await p.evaluate(()=>closeModal('modal-account'));
await p.evaluate(O=>{openClientDetail(O);},O);await L.sleep(400);
await p.evaluate(()=>{openAccountModal();});await L.sleep(300);
ok(/Harper Stable|Olivia Harper/.test(await line(p)||''),'admin on a client renames that client');
await p.evaluate(()=>{document.getElementById('rn-line').click();});await L.sleep(300);
await p.evaluate(()=>{setVal('rn-input','Olivia Garage');document.getElementById('rn-save').click();});await L.sleep(700);
ok(await p.evaluate(O=>/Olivia Garage/.test(document.getElementById('cd-name').innerText),O),'shared client view title updated');
ok(await p.evaluate(O=>{viewAsRefreshUI();var o=document.querySelector('#viewas-client option[value="'+O+'"]');return o&&o.textContent==='Olivia Garage';},O),'View-as picker shows new name');
ok(!p.errors.length,'no page errors: '+p.errors.join('|'));await p.close();

console.log('3) tech: only with edit rights');
p=await page('tom@test.com');
await p.evaluate(O=>{openClientDetail(O);},O);await L.sleep(400);
await p.evaluate(()=>openAccountModal());await L.sleep(300);
ok(!(await line(p)),'tech with view-only access: no Rename line');
await p.evaluate(()=>closeModal('modal-account'));
await p.evaluate(M=>{openClientDetail(M);},M);await L.sleep(400);
await p.evaluate(()=>openAccountModal());await L.sleep(300);
ok(/Pat Managed/.test(await line(p)||''),'tech on a managed client (edit rights) sees it');
await p.evaluate(()=>{document.getElementById('rn-line').click();});await L.sleep(300);
await p.evaluate(()=>{setVal('rn-input','Pat\'s Garage');document.getElementById('rn-save').click();});await L.sleep(700);
ok(await p.evaluate(()=>/Pat's Garage/.test(document.getElementById('cd-name').innerText)),'tech rename saved');
await p.evaluate(()=>{openRenameSheet();});await L.sleep(300);
await p.evaluate(()=>{window.__MOCK_STATE__.rpcHandlers.set_collection_name=function(){return {data:null,error:{code:'42501',message:'not_allowed'}};};document.getElementById('rn-save').click();});await L.sleep(500);
ok(await p.evaluate(()=>/cannot rename/.test(document.getElementById('rn-err').innerText)),'server refusal shown plainly');
ok(!p.errors.length,'no page errors: '+p.errors.join('|'));await p.close();
await L.close();
console.log('rename: '+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.log('ERROR',e);process.exit(1);});
