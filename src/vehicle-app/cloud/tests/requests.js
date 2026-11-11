// v40 (p40): Client Requests (tech inbox + owner sheet), Comments above Recent activity, Overview option C.
// The 4 new tables are emulated here with RLS that mirrors migration_022 (columns parsed from the SQL file). REQ_OFF=1 run = tables absent.
const L=require('./lib.js');const fs=require('fs');
const OUT=process.env.RQ_OUT||'';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok   '+m);}else{fail++;console.log('  FAIL '+m);}};
const SQL=fs.readFileSync('/workspace/evoai-cloud/migration_022_requests_comments.sql','utf8');
const COLS={};for(const t of ['service_requests','request_photos','comments','comment_reads']){const m=SQL.match(new RegExp('create table if not exists public\\.'+t+' \\(([\\s\\S]*?)\\n\\);'));
  COLS[t]=m[1].split('\n').map(l=>l.trim()).filter(l=>/^[a-z_]+\s/.test(l)&&!/^(constraint|primary)\b/.test(l)).map(l=>l.split(/\s+/)[0]);}
const SVC=(SQL.match(/service in \(([^)]*)\)/)||[])[1].replace(/'/g,'').split(',');
const V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012',O='b0000000-0000-4000-a000-000000000002',TT='c0000000-0000-4000-a000-000000000003';
const MOCK=(absent,seed)=>`(function(){var COLS=${JSON.stringify(COLS)},SVC=${JSON.stringify(SVC)},ABSENT=${absent?1:0};
var S=window.__MOCK_STATE__;S.p40={writes:[],viol:[]};function T(n){return S.tables[n]||(S.tables[n]=[]);}
${seed||''}
function uid(){return S.session?S.session.user.id:null;}function prof(i){return T('profiles').filter(function(p){return p.id===i;})[0];}
function admin(){var p=prof(uid());return p&&p.role==='admin';}
function own(o){var u=uid();return !!u&&(o===u||T('collection_members').some(function(m){return m.collection_owner_id===o&&m.user_id===u;}));}
function vown(v){var r=T('vehicles').filter(function(x){return x.id===v;})[0];return r?r.owner_id:null;}
function ctech(o){var u=uid();return T('tech_access').some(function(a){return a.tech_id===u&&a.owner_id===o&&!a.vehicle_id&&a.status==='active';});}
function vtech(v){var u=uid(),o=vown(v);return !!v&&T('tech_access').some(function(a){return a.tech_id===u&&a.status==='active'&&(a.vehicle_id===v||(!a.vehicle_id&&a.owner_id===o));});}
function staff(r){return admin()||vtech(r.vehicle_id)||ctech(r.owner_id);}
function member(o,v){return admin()||own(o)||ctech(o)||(v&&vtech(v));}
function canSel(t,r){if(t==='service_requests')return own(r.owner_id)||staff(r);if(t==='request_photos')return T('service_requests').some(function(x){return x.id===r.request_id&&canSel('service_requests',x);});
  if(t==='comments')return member(r.owner_id,r.vehicle_id);if(t==='comment_reads')return r.user_id===uid();return false;}
function canIns(t,r){var u=uid();if(t==='service_requests')return own(r.owner_id)&&r.created_by===u&&(r.status||'new')==='new'&&!r.assigned_tech&&!r.scheduled_for&&vown(r.vehicle_id)===r.owner_id&&SVC.indexOf(r.service)>=0&&(r.service!=='other'||String(r.details||'').trim().length>=3);
  if(t==='request_photos'){var q=T('service_requests').filter(function(x){return x.id===r.request_id;})[0];return r.uploaded_by===u&&own(r.owner_id)&&!!q&&q.owner_id===r.owner_id&&r.storage_path.split('/')[0]===q.owner_id&&r.storage_path.split('/')[1]===q.vehicle_id&&/^req-/.test(r.storage_path.split('/')[2]);}
  if(t==='comments')return r.author_id===u&&member(r.owner_id,r.vehicle_id)&&String(r.body||'').trim().length>0;
  if(t==='comment_reads')return r.user_id===u&&member(r.owner_id,null);return false;}
function canUpd(t,r){if(t==='service_requests')return staff(r);if(t==='comments')return r.author_id===uid();if(t==='comment_reads')return r.user_id===uid();return false;}
function canDel(t,r){if(t==='service_requests')return (own(r.owner_id)&&r.status==='new')||admin();if(t==='comments'||t==='request_photos')return (r.author_id||r.uploaded_by)===uid()||admin();return r.user_id===uid();}
function chk(t,row,op){Object.keys(row).forEach(function(k){if(COLS[t].indexOf(k)<0)S.p40.viol.push(op+' '+t+': unknown column '+k);});}
function uuid(){return 'xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx'.replace(/x/g,function(){return (Math.random()*16|0).toString(16);});}
function Q(t){var q={f:[],op:'select',sel:false};['eq','in','neq','is'].forEach(function(k){q[k]=function(c,v){q.f.push([k,c,v]);return q;};});
 q.select=function(){q.sel=true;return q;};q.order=function(c,o){q.ord=[c,o&&o.ascending===false];return q;};q.limit=function(){return q;};
 q.insert=function(p){q.op='insert';q.p=p;return q;};q.upsert=function(p){q.op='upsert';q.p=p;return q;};q.update=function(p){q.op='update';q.p=p;return q;};q.delete=function(){q.op='delete';return q;};
 q.single=function(){return q;};q.maybeSingle=function(){return q;};
 q.then=function(a,b){return new Promise(function(res){setTimeout(function(){res(run(t,q));},5);}).then(a,b);};return q;}
function m(r,f){return f.every(function(x){return x[0]==='eq'?r[x[1]]===x[2]:x[0]==='in'?x[2].indexOf(r[x[1]])>=0:x[0]==='neq'?r[x[1]]!==x[2]:true;});}
function run(t,q){
 if(ABSENT)return {data:null,error:{code:'PGRST205',message:"Could not find the table 'public."+t+"' in the schema cache"}};
 if(!S.session)return {data:null,error:{code:'42501',message:'permission denied'}};
 var L=T(t);if(q.op!=='select')S.p40.writes.push({t:t,op:q.op,p:q.p,f:q.f});
 if(q.op==='select'){var rows=L.filter(function(r){return canSel(t,r)&&m(r,q.f);});if(q.ord){var c=q.ord[0],d=q.ord[1]?-1:1;rows=rows.slice().sort(function(a,b){return String(a[c]).localeCompare(String(b[c]))*d;});}return {data:JSON.parse(JSON.stringify(rows)),error:null};}
 if(q.op==='insert'||q.op==='upsert'){var arr=Array.isArray(q.p)?q.p:[q.p];for(var i=0;i<arr.length;i++){var r=Object.assign({},arr[i]);chk(t,r,'insert');
   if(t==='comment_reads'){var ex=L.filter(function(x){return x.user_id===r.user_id&&x.owner_id===r.owner_id;})[0];if(ex){if(q.op!=='upsert')return {data:null,error:{code:'23505',message:'duplicate key'}};if(!canUpd(t,ex))return {data:null,error:{code:'42501',message:'rls'}};Object.assign(ex,r);continue;}}
   if(t!=='comment_reads'&&!r.id)r.id=uuid();if(t==='service_requests'){r.status=r.status||'new';r.preferred_time=r.preferred_time||'any';r.updated_at=new Date().toISOString();}
   r.created_at=new Date().toISOString();if(!canIns(t,r))return {data:null,error:{code:'42501',message:'new row violates row-level security policy for table "'+t+'"'}};L.push(r);}
   return {data:q.sel?arr:null,error:null};}
 if(q.op==='update'){chk(t,q.p,'update');var hit=L.filter(function(r){return m(r,q.f)&&canSel(t,r)&&canUpd(t,r);});
   if(t==='service_requests'&&q.p.status==='scheduled'&&!q.p.scheduled_for&&hit.some(function(r){return !r.scheduled_for;}))return {data:null,error:{code:'23514',message:'check'}};
   if(t==='service_requests'&&['owner_id','vehicle_id','created_by'].some(function(k){return k in q.p;}))return {data:null,error:{code:'42501',message:'request_fields_locked'}};
   hit.forEach(function(r){Object.assign(r,q.p);});return {data:q.sel?JSON.parse(JSON.stringify(hit)):null,error:null};}
 if(q.op==='delete'){var del=L.filter(function(r){return m(r,q.f)&&canSel(t,r)&&canDel(t,r);});S.tables[t]=L.filter(function(r){return del.indexOf(r)<0;});
   if(t==='service_requests')S.tables.request_photos=T('request_photos').filter(function(p){return !del.some(function(d){return d.id===p.request_id;});});
   return {data:q.sel?del:null,error:null};}
}
var lib=window.supabase,cc=lib.createClient;lib.createClient=function(){var c=cc.apply(lib,arguments),f=c.from;c.from=function(t){return COLS[t]?Q(t):f.call(c,t);};return c;};
})();`;
const BASE="try{if(!sessionStorage.__c){localStorage.clear();sessionStorage.__c=1;}localStorage.setItem('pwa_hint_dismissed','1')}catch(e){};";
const SEED=`var now=Date.now(),iso=function(m){return new Date(now-m*60000).toISOString();};
T('service_requests').push({id:'90000000-0000-4000-a000-000000000001',owner_id:'${O}',vehicle_id:'${V1}',created_by:'${O}',service:'detailing',details:null,preferred_date:new Date(now+5*864e5).toISOString().slice(0,10),preferred_time:'morning',notes:'Gate code 4417',status:'new',assigned_tech:null,scheduled_for:null,created_at:iso(90),updated_at:iso(90)},
 {id:'90000000-0000-4000-a000-000000000002',owner_id:'${O}',vehicle_id:'${V2}',created_by:'${O}',service:'other',details:'Please collect the car for the Hershey concours and return it after.',preferred_date:null,preferred_time:'any',notes:null,status:'new',assigned_tech:null,scheduled_for:null,created_at:iso(30),updated_at:iso(30)},
 {id:'90000000-0000-4000-a000-000000000003',owner_id:'${O}',vehicle_id:'${V1}',created_by:'${O}',service:'tires',details:null,preferred_date:null,preferred_time:'afternoon',notes:null,status:'scheduled',assigned_tech:'${TT}',scheduled_for:new Date(now+3*864e5).toISOString(),created_at:iso(4000),updated_at:iso(100)});
T('comments').push({id:'91000000-0000-4000-a000-000000000001',owner_id:'${O}',vehicle_id:'${V1}',request_id:null,author_id:'${TT}',body:'The new tyres arrived. Can we fit them Thursday?',created_at:iso(200)},
 {id:'91000000-0000-4000-a000-000000000002',owner_id:'${O}',vehicle_id:null,request_id:null,author_id:'${O}',body:'Thursday works. Please also check the left headlight.',created_at:iso(150)},
 {id:'91000000-0000-4000-a000-000000000003',owner_id:'${O}',vehicle_id:null,request_id:'90000000-0000-4000-a000-000000000003',author_id:'${TT}',body:'Noted. Added to the visit.',created_at:iso(120)});`;
const style=(p,sel)=>p.evaluate(sel=>{var bad=[];[].slice.call(document.querySelectorAll(sel)).forEach(function(e){if(!e.offsetParent||e.closest('svg'))return;var own=[].slice.call(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();});if(!own)return;
  var cs=getComputedStyle(e),f=parseFloat(cs.fontSize),m=cs.color.match(/\d+/g).map(Number);var white=m[0]>=225&&m[1]>=225&&m[2]>=215,gold=Math.abs(m[0]-201)<=30&&Math.abs(m[1]-170)<=30&&m[0]>m[2]+50,red=m[0]>200&&m[1]<150,dark=m[0]<40&&m[1]<40&&m[2]<40;
  if(f<15||!(white||gold||red||dark))bad.push(e.textContent.trim().slice(0,24)+' '+cs.color+' '+f);});return bad;},sel);
const shot=async(p,n,el)=>{if(!OUT)return;fs.mkdirSync(OUT,{recursive:true});await p.evaluate(el=>{var tc=document.getElementById('toast-container');if(tc)tc.innerHTML='';var b=document.getElementById('due-banner');if(b)b.style.display='none';var m=document.querySelector('.main');if(m)m.scrollTop=0;window.scrollTo(0,0);
  if(el){var e=document.querySelector(el);if(e){e.scrollIntoView({block:'start'});window.scrollBy(0,-70);if(m)m.scrollTop-=70;}}},el||null);await L.sleep(350);await p.screenshot({path:OUT+n});};
const p40=p=>p.evaluate(()=>window.__MOCK_STATE__.p40);
(async()=>{
await L.launch();
// ---------------- TECH ----------------
let p=await L.open({pre:BASE+MOCK(false,SEED),w:430,h:932});
await L.login(p,'tom@test.com','password123','advisor');await L.sleep(900);
let t=await p.evaluate(()=>{var n=document.querySelector('.nav-item[data-page="requests"]'),b=document.getElementById('rq-badge');var vis=[].slice.call(document.querySelectorAll('.sidebar .nav-item')).filter(function(e){return e.offsetParent;}).map(function(e){return e.dataset.page;});
  return {nav:!!n&&n.style.display!=='none',badge:b.style.display==='none'?0:Number(b.textContent),order:vis};});
ok(t.nav,'tech: Requests tab in the nav');
ok(t.badge===2,'tech: count badge = 2 new requests ('+t.badge+')');
ok(t.order.indexOf('requests')===t.order.indexOf('todo')+1,'Requests sits right after To Do ('+t.order.slice(0,4)+')');
// overview C (tech)
let ov=await p.evaluate(()=>{var pg=document.getElementById('page-dashboard'),ids=['dash-hero','dash-ovc','dash-ovc-portfolio','dash-ovc-brief','dash-ovc-stats','dash-cm-sec','dash-act-sec'];
  var pos=ids.map(function(i){var e=document.getElementById(i);return e?e.compareDocumentPosition.bind(e):null;});
  var ordered=ids.every(function(id,i){if(!i)return true;var a=document.getElementById(ids[i-1]),b=document.getElementById(id);return a&&b&&(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);});
  var tabs=[].slice.call(document.querySelectorAll('#dash-ovc .ovc-t')).map(function(b){return b.textContent+(b.classList.contains('on')?'*':'');});
  return {ordered:ordered,tabs:tabs,pf:!document.getElementById('dash-ovc-portfolio').hidden&&!!document.querySelector('#dash-ovc-portfolio #dash-vehicles .wh,#dash-ovc-portfolio #dash-vehicles *'),
   brief:document.getElementById('dash-ovc-brief').contains(document.getElementById('dash-brief')),stats:document.getElementById('dash-ovc-stats').contains(document.querySelector('#page-dashboard .stats3'))&&document.getElementById('dash-ovc-stats').contains(document.getElementById('dash-cols')),
   chartFirst:!!document.querySelector('#dash-hero #dash-vch,#dash-hero .hero-grid')};});
ok(ov.ordered,'tech Overview order: chart/AI estimate > Portfolio|Brief|Stats > Comments > Recent activity');
ok(ov.tabs.join()==='Portfolio*,Brief,Stats','segmented tabs, Portfolio active by default ('+ov.tabs+')');
ok(ov.pf&&ov.brief&&ov.stats&&ov.chartFirst,'Portfolio = vehicle carousel, Brief = Collection Brief, Stats = stats + needs attention');
let bad=await style(p,'#dash-ovc *,#dash-cm-sec *');ok(bad.length===0,'tech Overview C + comments: 15px+, white/gold only '+bad.join(' | '));
let cm=await p.evaluate(()=>({vis:document.getElementById('dash-cm-sec').style.display!=='none',n:document.querySelectorAll('#dash-cm .cm-msg').length,pick:!!document.getElementById('dash-cm-client'),neu:document.getElementById('dash-cm-new').textContent}));
ok(cm.vis&&cm.n===3&&cm.pick,'tech Comments thread above Recent activity, with client picker ('+cm.n+' msgs)');
ok(cm.neu==='1 new','unread label from the client ('+cm.neu+')');
await shot(p,'req_overview_C_tech.png');
for(const k of ['brief','stats']){await p.evaluate(k=>ovcSet('dash',k),k);await L.sleep(250);
  ok(await p.evaluate(k=>!document.getElementById('dash-ovc-'+k).hidden&&document.getElementById('dash-ovc-portfolio').hidden&&document.querySelector('#dash-ovc .ovc-t.on').dataset.t===k,k),'tech tab '+k+' shows only its panel');}
await p.evaluate(()=>ovcSet('dash','portfolio'));await L.sleep(300);
// inbox
await p.evaluate(()=>showPage('requests'));await L.sleep(500);
let ib=await p.evaluate(()=>({active:document.getElementById('page-requests').classList.contains('active'),title:document.getElementById('rq-title').textContent,
  tabs:[].slice.call(document.querySelectorAll('.rq-tab')).map(function(b){return b.textContent;}),cards:[].slice.call(document.querySelectorAll('.rq-card')).map(function(c){return c.dataset.id.slice(-1)+':'+c.dataset.st;}),
  txt:document.getElementById('rq-root').innerText,thumbs:[].slice.call(document.querySelectorAll('.rq-card')).filter(function(c){return c.querySelector('.rq-th img,.rq-th .ph-noimg');}).length}));
ok(ib.active&&ib.title==='Client Requests','tech: Client Requests page');
ok(ib.tabs.join('|')==='New2|Accepted|Scheduled 1|Done','status tabs New/Accepted/Scheduled/Done with counts ('+ib.tabs.join('|')+')');
ok(ib.cards.join()==='2:new,1:new','New tab lists the 2 new requests, newest first');
ok(/Olivia Harper/.test(ib.txt)&&/Something else/.test(ib.txt)&&/Hershey concours/.test(ib.txt)&&/Detailing/.test(ib.txt)&&/Morning/.test(ib.txt),'card: client, request type, free text, preferred time');
ok(ib.thumbs===2,'vehicle thumbnails on each card');
bad=await style(p,'#page-requests *');ok(bad.length===0,'inbox 15px+, white/gold only '+bad.join(' | '));
await shot(p,'req_tech_inbox.png');
// accept
await p.evaluate(()=>{var c=document.querySelector('.rq-card[data-id$="1"]');c.querySelector('.btn-primary').click();});await L.sleep(500);
let st=await L.state(p),r1=st.tables.service_requests.filter(x=>x.id.endsWith('1'))[0];
ok(r1.status==='accepted'&&r1.assigned_tech==='c0000000-0000-4000-a000-000000000003','Accept: status accepted, assigned to me');
ok(await p.evaluate(()=>document.getElementById('rq-badge').textContent==='1'),'badge drops to 1');
// schedule from Accepted tab
await p.evaluate(()=>rqTab('accepted'));await L.sleep(200);
await p.evaluate(()=>{var c=document.querySelector('.rq-card[data-id$="1"]');[].slice.call(c.querySelectorAll('.btn')).filter(function(b){return b.textContent==='Schedule';})[0].click();});await L.sleep(200);
ok(await p.evaluate(()=>!!document.querySelector('.rq-card input[type=datetime-local]')),'Schedule opens a date/time picker');
await p.evaluate(()=>{var i=document.querySelector('.rq-card input[type=datetime-local]');i.value='2026-11-12T10:30';document.querySelector('.rq-inline .btn-primary').click();});await L.sleep(500);
st=await L.state(p);r1=st.tables.service_requests.filter(x=>x.id.endsWith('1'))[0];
ok(r1.status==='scheduled'&&new Date(r1.scheduled_for).getHours()===10,'Confirm: status scheduled with the picked time');
// reply on request 2 (new)
await p.evaluate(()=>rqTab('new'));await L.sleep(200);
await p.evaluate(()=>{var c=document.querySelector('.rq-card[data-id$="2"]');[].slice.call(c.querySelectorAll('.btn')).filter(function(b){return b.textContent==='Reply';})[0].click();});await L.sleep(200);
await p.type('#rq-rp-90000000-0000-4000-a000-000000000002','Happy to. We will collect on the 9th.');
await p.evaluate(()=>document.querySelector('.rq-inline .btn-primary').click());await L.sleep(500);
st=await L.state(p);let rep=st.tables.comments.filter(c=>c.request_id==='90000000-0000-4000-a000-000000000002')[0];
ok(rep&&rep.author_id==='c0000000-0000-4000-a000-000000000003'&&rep.owner_id===O&&rep.vehicle_id===V2,'Reply posts a comment linked to the request');
ok(await p.evaluate(()=>/collect on the 9th/.test(document.querySelector('.rq-card[data-id$="2"]').innerText)),'reply shows under the request');
let pv=await p40(p);ok(pv.viol.length===0&&st.v.length===0,'no unknown columns / schema violations '+pv.viol.concat(st.v).join(' | '));
// tech comment from Overview
await p.evaluate(()=>showPage('dashboard'));await L.sleep(500);
await p.type('#dash-cm-in','Car is ready for Thursday.');await p.evaluate(()=>cmSend('dash'));await L.sleep(400);
st=await L.state(p);ok(st.tables.comments.some(c=>c.body==='Car is ready for Thursday.'&&c.owner_id===O&&!c.request_id),'tech posts in the client thread from Overview');
ok(p.errors.filter(e=>!/manifest|404|Failed to load resource|bad HTTP response/i.test(e)).length===0,'tech: no page errors '+p.errors.join(' | '));
const stateAfterTech=await p.evaluate(()=>JSON.stringify({r:window.__MOCK_STATE__.tables.service_requests,c:window.__MOCK_STATE__.tables.comments}));
await p.close();
// ---------------- OWNER ----------------
p=await L.open({pre:BASE+MOCK(false,SEED),w:430,h:932});
await L.login(p,'olivia@test.com');await L.sleep(900);
ov=await p.evaluate(()=>{var ids=['cp-hero','cp-ovc','cp-ovc-portfolio','cp-ovc-brief','cp-ovc-stats','cp-cm-sec','cp-act-sec'];
  return {ordered:ids.every(function(id,i){if(!i)return true;var a=document.getElementById(ids[i-1]),b=document.getElementById(id);return a&&b&&(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);}),
   pf:!document.getElementById('cp-ovc-portfolio').hidden&&document.querySelectorAll('#cp-ovc-portfolio #cp-vehicles *').length>0,mk:document.getElementById('cp-rq-btn').style.display!=='none',
   nav:document.querySelector('.nav-item[data-page="requests"]').style.display!=='none',badge:document.getElementById('rq-badge').style.display};});
ok(ov.ordered,'owner Overview order: chart/AI estimate > Portfolio|Brief|Stats > Comments > Recent activity');
ok(ov.pf,'owner: Portfolio tab shows the vehicle carousel');
ok(ov.mk&&ov.nav&&ov.badge==='none','owner: Make a request button + Requests tab (no staff badge)');
cm=await p.evaluate(()=>({vis:document.getElementById('cp-cm-sec').style.display!=='none',n:document.querySelectorAll('#cp-cm .cm-msg').length,me:document.querySelectorAll('#cp-cm .cm-msg.me').length,txt:document.getElementById('cp-cm').innerText,neu:document.getElementById('cp-cm-new').textContent}));
ok(cm.vis&&cm.n===3&&cm.me===1,'owner Comments: thread with own messages on the right ('+cm.n+'/'+cm.me+')');
ok(/Re: Tires and wheels/.test(cm.txt)&&/Tom Reyes/.test(cm.txt),'comment tags (Re: request) and author names');
ok(cm.neu==='2 new','owner unread label ('+cm.neu+')');
st=await L.state(p);ok(st.tables.comment_reads.some(r=>r.user_id===O&&r.owner_id===O),'viewing the thread stores a read marker');
bad=await style(p,'#cp-ovc *,#cp-cm-sec *');ok(bad.length===0,'owner Overview C + comments: 15px+, white/gold only '+bad.join(' | '));
await shot(p,'req_overview_C_owner.png');
for(const k of ['brief','stats','portfolio']){await p.evaluate(k=>ovcSet('cp',k),k);await L.sleep(350);
  const s=await p.evaluate(k=>({on:!document.getElementById('cp-ovc-'+k).hidden,n:['portfolio','brief','stats'].filter(function(x){return !document.getElementById('cp-ovc-'+x).hidden;}).length,
    has:k==='brief'?document.getElementById('cp-brief').innerText.length>20:k==='stats'?document.getElementById('cp-vehicle-count').textContent==='2':document.querySelectorAll('#cp-vehicles *').length>0}),k);
  ok(s.on&&s.n===1&&s.has,'owner tab '+k+' ok');if(k!=='portfolio')await shot(p,'req_overview_C_owner_'+k+'.png','#cp-ovc');}
ok(await p.evaluate(()=>localStorage.getItem('evo_ovc_cp')==='portfolio'),'tab choice remembered');
// keyboard
await p.focus('#cp-ovt-portfolio');await p.keyboard.press('ArrowRight');await L.sleep(250);
ok(await p.evaluate(()=>document.activeElement.id==='cp-ovt-brief'&&!document.getElementById('cp-ovc-brief').hidden),'arrow keys move between tabs');
await p.evaluate(()=>ovcSet('cp','portfolio'));await L.sleep(300);
// comment
await p.evaluate(()=>{document.getElementById('cp-cm-in').value='';});
await p.evaluate(()=>cmSend('cp'));await L.sleep(200);st=await L.state(p);const nC=st.tables.comments.length;
ok(nC===3,'empty comment is not sent');
await p.type('#cp-cm-in','Thank you, see you Thursday.');await p.evaluate(()=>cmSend('cp'));await L.sleep(400);
st=await L.state(p);ok(st.tables.comments.length===4&&st.tables.comments[3].author_id===O&&st.tables.comments[3].owner_id===O,'owner posts a comment');
ok(await p.evaluate(()=>/see you Thursday/.test(document.getElementById('cp-cm').innerText)&&document.getElementById('cp-cm-in').value===''),'comment appears; box cleared');
await shot(p,'req_comments.png','#cp-cm-sec');
// make a request sheet
await p.evaluate(()=>document.getElementById('cp-rq-btn').click());await L.sleep(400);
let sh=await p.evaluate(()=>({open:document.getElementById('modal-req').classList.contains('active'),svc:[].slice.call(document.querySelectorAll('.rq-sv')).map(function(b){return b.dataset.s;}),veh:document.querySelectorAll('.rq-vc').length,
  f:['rq-date','rq-time','rq-notes','rq-file'].every(function(i){return !!document.getElementById(i);}),det:document.getElementById('rq-det-w').style.display}));
ok(sh.open&&sh.veh===2,'Make a request sheet opens with a vehicle picker');
ok(sh.svc.join()===SVC.join(),'services = the app\'s service list + Something else ('+sh.svc.join()+')');
ok(sh.f&&sh.det==='none','preferred date, time, notes, optional photo; details hidden until Something else');
await p.evaluate(()=>rqSubmit());await L.sleep(200);
ok((await p40(p)).writes.filter(w=>w.t==='service_requests'&&w.op==='insert').length===0,'nothing sent without a vehicle/service');
await p.evaluate(()=>{document.querySelectorAll('.rq-vc')[1].click();document.querySelector('.rq-sv[data-s="other"]').click();});await L.sleep(150);
ok(await p.evaluate(()=>document.getElementById('rq-det-w').style.display===''&&document.activeElement.id==='rq-det'),'Something else reveals the free-text box');
await p.evaluate(()=>rqSubmit());await L.sleep(200);
ok((await p40(p)).writes.filter(w=>w.t==='service_requests'&&w.op==='insert').length===0,'Something else needs a description');
await p.type('#rq-det','Please collect the car for the Pebble Beach tour.');
await p.evaluate(()=>{var d=new Date(Date.now()+9*864e5);document.getElementById('rq-date').value=d.toISOString().slice(0,10);document.getElementById('rq-time').value='morning';document.getElementById('rq-notes').value='Gate code 4417';});
bad=await style(p,'#modal-req *');ok(bad.length===0,'sheet 15px+, white/gold only '+bad.join(' | '));
await p.evaluate(()=>{var m=document.querySelector('#modal-req .modal');if(m)m.scrollTop=0;});
if(OUT){await p.evaluate(()=>{var tc=document.getElementById('toast-container');if(tc)tc.innerHTML='';});await L.sleep(250);await p.screenshot({path:OUT+'req_client_sheet.png'});
  // full sheet: find the real inner scroller, capture it page by page (stitched afterwards by tools/stitch_sheet.py)
  const sc=await p.evaluate(()=>{var r=document.getElementById('modal-req');var c=[r].concat([...r.querySelectorAll('*')]).filter(e=>e.scrollHeight>e.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));var m=c.sort((a,b)=>b.scrollHeight-a.scrollHeight)[0];if(!m)return null;m.setAttribute('data-shot-sc','1');var b=m.getBoundingClientRect();return {top:b.top,h:m.clientHeight,sh:m.scrollHeight,left:b.left,w:b.width};});
  if(sc){const meta=[];for(let y=0,i=0;;i++){const st=await p.evaluate(y=>{var m=document.querySelector('[data-shot-sc]');m.scrollTop=y;return m.scrollTop;},y);await L.sleep(200);await p.screenshot({path:OUT+'req_client_sheet_s'+i+'.png'});meta.push(st);if(st+sc.h>=sc.sh-1)break;y+=sc.h-60;}
    require('fs').writeFileSync(OUT+'req_client_sheet_meta.json',JSON.stringify({sc,meta}));}}
// attach a photo
const img=require('path').join(__dirname,'fixture.jpg');
const fi=await p.$('#rq-file');await fi.uploadFile(img);await L.sleep(300);
ok(await p.evaluate(()=>/Attached/.test(document.getElementById('rq-file-n').textContent)),'photo attached');
await p.evaluate(()=>rqSubmit());await L.sleep(2500);
st=await L.state(p);let nr=st.tables.service_requests.filter(r=>r.service==='other'&&/Pebble/.test(r.details))[0];
ok(nr&&nr.owner_id===O&&nr.vehicle_id===V1||nr&&nr.vehicle_id===V2,'request saved for the picked car');
ok(nr&&nr.status==='new'&&nr.created_by===O&&nr.preferred_time==='morning'&&nr.notes==='Gate code 4417','status new, created_by me, time + notes');
let ph=st.tables.request_photos.filter(x=>nr&&x.request_id===nr.id)[0];
ok(ph&&st.storage.some(k=>k==='vehicle-photos/'+ph.storage_path)&&ph.storage_path.split('/')[1]===nr.vehicle_id,'photo uploaded to <owner>/<vehicle>/req-* and linked');
ok(await p.evaluate(()=>!document.getElementById('modal-req').classList.contains('active')),'sheet closes after sending');
// owner requests page: cannot change status, can withdraw new
await p.evaluate(()=>showPage('requests'));await L.sleep(500);
let op=await p.evaluate(()=>({t:document.getElementById('rq-title').textContent,n:document.querySelectorAll('.rq-card').length,acc:[].slice.call(document.querySelectorAll('.rq-card .btn')).some(function(b){return /Accept|Schedule|Mark done/.test(b.textContent);}),tabs:document.querySelectorAll('.rq-tab').length}));
ok(op.t==='My Requests'&&op.n===4&&!op.acc&&!op.tabs,'owner My Requests: all 4, no accept/schedule/done');
const before=(await L.state(p)).tables.service_requests.length;
await p.evaluate(id=>{var c=document.querySelector('.rq-card[data-id="'+id+'"]');[].slice.call(c.querySelectorAll('.btn')).filter(function(b){return b.textContent==='Withdraw';})[0].click();},nr.id);await L.sleep(500);
ok((await L.state(p)).tables.service_requests.length===before-1,'owner withdraws a new request');
ok(await p.evaluate(()=>!Array.prototype.some.call(document.querySelectorAll('.rq-card[data-st="scheduled"] .btn'),function(b){return b.textContent==='Withdraw';})),'no Withdraw once scheduled');
// owner forced status change is refused by RLS emulation
const r3=await p.evaluate(async()=>{var r=await sb.from('service_requests').update({status:'done'}).eq('id','90000000-0000-4000-a000-000000000003').select();return r.data?r.data.length:-1;});
ok(r3===0,'owner cannot change status (0 rows, mirrors RLS)');
pv=await p40(p);st=await L.state(p);ok(pv.viol.length===0&&st.v.length===0,'owner: no unknown columns / violations '+pv.viol.concat(st.v).join(' | '));
ok(p.errors.filter(e=>!/manifest|404|Failed to load resource|bad HTTP response/i.test(e)).length===0,'owner: no page errors '+p.errors.join(' | '));
await p.close();
// ---------------- other owner sees nothing ----------------
p=await L.open({pre:BASE+MOCK(false,SEED),w:430,h:932});await L.login(p,'dana@test.com');await L.sleep(800);
ok(await p.evaluate(()=>RQ.rows.length===0&&CM.rows.length===0),'another owner sees no requests or comments');
await p.close();
// ---------------- tables absent: graceful ----------------
for(const [who,role] of [['tom@test.com','advisor'],['olivia@test.com',null]]){
  p=await L.open({pre:BASE+MOCK(true),w:430,h:932});await L.login(p,who,'password123',role);await L.sleep(900);
  const g=await p.evaluate(()=>{var pre=isOwner()?'cp':'dash';return {nav:document.querySelector('.nav-item[data-page="requests"]').style.display,cm:document.getElementById(pre+'-cm-sec').style.display,mk:(document.getElementById('cp-rq-btn')||{style:{}}).style.display,
    ovc:!!document.querySelector('#'+pre+'-ovc .ovc-t.on'),act:document.getElementById(pre+'-act-sec').style.display!=='none'};});
  ok(g.nav==='none'&&g.cm==='none'&&(role||g.mk==='none'),(role?'tech':'owner')+' without migration_022: Requests tab, comments and Make a request hidden');
  ok(g.ovc&&g.act,(role?'tech':'owner')+' without migration_022: Overview option C + Recent activity still work');
  await p.evaluate(()=>showPage('requests'));await L.sleep(300);
  ok(await p.evaluate(()=>!document.getElementById('page-requests').classList.contains('active')||/not switched on/.test(document.getElementById('rq-root').innerText)),'requests page degrades with a plain message');
  const w=await p40(p);ok(w.writes.length===0,'no writes attempted');
  ok(p.errors.filter(e=>!/manifest|404|Failed to load resource|bad HTTP response/i.test(e)).length===0,'no page errors '+p.errors.join(' | '));
  await p.close();
}
await L.close();
console.log('\nrequests: '+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
