(function(){
var S=window.__MOCK_STATE__;
var A='a0000000-0000-4000-a000-000000000001',O='b0000000-0000-4000-a000-000000000002',TT='c0000000-0000-4000-a000-000000000003';
var PAT='b1000000-0000-4000-a000-000000000021',DANA='b1000000-0000-4000-a000-000000000022';
var V1='d0000000-0000-4000-a000-000000000011',V2='d0000000-0000-4000-a000-000000000012';
function T(n){return S.tables[n]||(S.tables[n]=[]);}
S.users=[{id:A,email:'wade@evo.test',password:'password123',confirmed:true},{id:O,email:'olivia@test.com',password:'password123',confirmed:true},{id:TT,email:'tom@test.com',password:'password123',confirmed:true},{id:'e0000000-0000-4000-a000-000000000009',email:'new@test.com',password:'password123',confirmed:false},{id:PAT,email:'pat@test.com',password:'password123',confirmed:true},{id:DANA,email:'dana@test.com',password:'password123',confirmed:true}];
T('profiles').push({id:A,role:'admin',display_name:'Wade Forsyth',email:'wade@evo.test'},{id:O,role:'owner',display_name:'Olivia Harper',email:'olivia@test.com'},{id:TT,role:'tech',display_name:'Tom Reyes',email:'tom@test.com'},{id:DANA,role:'owner',display_name:'Dana Newowner',email:'dana@test.com'});
var now=new Date(),iso=function(d){return d.toISOString().slice(0,10);},plus=function(n){return iso(new Date(now.getTime()+n*864e5));};
T('vehicles').push(
 {id:V1,owner_id:O,year:2021,make:'Porsche',model:'911 Carrera S',color:'GT Silver',nickname:'The Ghost',vin:'WP0AB2A99MS123456',mileage:1850,archived:false,notes:'Garage kept.',created_at:'2026-01-02T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'},
 {id:V2,owner_id:O,year:1967,make:'Chevrolet',model:'Corvette Sting Ray',color:'Marlboro Maroon',nickname:'Maroon',mileage:41200,archived:false,notes:'',created_at:'2026-01-03T00:00:00Z',updated_at:'2026-01-03T00:00:00Z'});
T('vehicle_financials').push({vehicle_id:V1,owner_id:O,purchase_price:229000,purchase_date:'2024-03-01'});
T('reminders').push({id:'f0000000-0000-4000-a000-000000000001',vehicle_id:V1,owner_id:O,kind:'tag',title:'Registration renewal',due_date:plus(20),repeat_months:12,created_by:O},
 {id:'f0000000-0000-4000-a000-000000000002',vehicle_id:V1,owner_id:O,kind:'insurance',title:'Insurance renewal',due_date:plus(75),repeat_months:12,created_by:O});
T('service_records').push({id:'f1000000-0000-4000-a000-000000000001',vehicle_id:V1,created_by:TT,title:'Annual service',description:null,category:'maintenance',performed_on:plus(-40),mileage:1700,cost:640});
T('expenses').push({id:'f2000000-0000-4000-a000-000000000001',vehicle_id:V1,owner_id:O,category:'detailing',amount:450,incurred_on:plus(-30),notes:'Ceramic coating',created_by:O});
T('advisories').push({id:'f3000000-0000-4000-a000-000000000001',vehicle_id:V1,owner_id:O,from_tech_id:TT,title:'Replace cabin filter',body:'Dirty. Recommend replacing at next visit.',severity:'recommended',estimated_cost:85,status:'pending',created_at:plus(-3)+'T00:00:00Z'});
T('tech_access').push({id:'f4000000-0000-4000-a000-000000000001',tech_id:TT,owner_id:O,vehicle_id:null,status:'active',client_origin:false,invited_by:O});
var P={id:'f5000000-0000-4000-a000-000000000001',access_id:'f4000000-0000-4000-a000-000000000001',tech_id:TT,owner_id:O,vehicle_id:null,view_service_records:true,view_expenses:false,view_documents:true,view_reminders:true,view_value_estimate:false,view_health_estimate:false,view_purchase_info:false,view_photos:true,can_add_service:true,can_add_documents:true,can_add_expenses:false,can_create_advisories:true};
T('tech_permissions').push(P);
[V1,V2].forEach(function(v){T('my_tech_visibility').push({__tech:TT,vehicle_id:v,owner_id:O,vehicle_label:'x',can_view_service_records:true,can_view_expenses:false,can_view_documents:true,can_view_reminders:true,can_view_value_estimate:false,can_view_health_estimate:false,can_view_purchase_info:false,can_view_photos:true,can_add_service:true,can_add_documents:true,can_add_expenses:false,can_create_advisories:true});});
S.rpcHandlers={
 create_invite:function(a){var code='0123456789abcdef0123456789abcdef';var iid='inv-'+S.seq++;T('invites').push({id:iid,kind:a.p_kind,created_by:S.session.user.id,owner_id:S.session.user.id,vehicle_id:a.p_vehicle_id||null,email:a.p_email||null,expires_at:new Date(Date.now()+14*864e5).toISOString(),created_at:new Date().toISOString()});return {data:[{invite_id:iid,code:code,expires_at:new Date(Date.now()+14*864e5).toISOString()}],error:null};},
 redeem_invite:function(a){
  var known=['0123456789abcdef0123456789abcdef','fedcba9876543210fedcba9876543210'];
  var mc=S.managedCodes&&S.managedCodes[a.p_code];
  if(mc){var n=S.claim(mc,S.session.user.id);return {data:{kind:'client_owner',claimed:[{managed_id:mc,vehicles:n}]},error:null};}
  if(known.indexOf(a.p_code)<0)return {data:null,error:{code:'P0001',message:'invalid_or_expired_invite'}};
  return {data:{kind:'client_owner'},error:null};},
 create_managed_client:function(a){
  var u=S.session.user.id,me=T('profiles').filter(function(p){return p.id===u;})[0];
  if(!me||(me.role!=='tech'&&me.role!=='admin'))return {data:null,error:{code:'42501',message:'only techs can add clients'}};
  var name=String(a.p_name||'').trim();if(!name)return {data:null,error:{code:'22023',message:'name_required'}};
  var em=a.p_email?String(a.p_email).toLowerCase():null;
  if(em&&T('profiles').some(function(p){return !p.managed&&p.role==='owner'&&p.email===em;}))return {data:null,error:{code:'P0001',message:'client_already_on_app'}};
  if(em&&T('profiles').some(function(p){return p.managed&&!p.claimed_by&&p.managed_by===u&&p.email===em;}))return {data:null,error:{code:'P0001',message:'managed_client_exists'}};
  var id='b2000000-0000-4000-a000-'+String(1000000+S.seq++).padStart(12,'0');
  T('profiles').push({id:id,role:'owner',display_name:name,email:em,phone:a.p_phone||null,managed:true,managed_by:u,claimed_by:null,claimed_at:null,notes:a.p_notes||null,created_at:new Date().toISOString()});
  T('tech_access').push({id:'ta-'+S.seq++,tech_id:u,owner_id:id,vehicle_id:null,status:'active',client_origin:true,invited_by:u});
  S.rpcCalls=(S.rpcCalls||0)+1;
  return {data:{owner_id:id,tech_access_id:'x',display_name:name,email:em},error:null};},
 create_managed_client_invite:function(a){
  var code='aaaabbbbccccdddd'+String(S.seq).padStart(16,'0');S.managedCodes=S.managedCodes||{};S.managedCodes[code]=a.p_managed_id;
  var iid='minv-'+S.seq++;T('invites').push({id:iid,kind:'client_owner',created_by:S.session.user.id,owner_id:a.p_managed_id,vehicle_id:null,email:a.p_email||null,expires_at:new Date(Date.now()+14*864e5).toISOString(),created_at:new Date().toISOString()});
  return {data:[{invite_id:iid,code:code,expires_at:new Date(Date.now()+14*864e5).toISOString()}],error:null};},
 claim_managed_clients:function(){
  var u=S.session.user,n=0,me=T('profiles').filter(function(p){return p.id===u.id;})[0];
  if(!me||me.role!=='owner')return {data:{claimed:[],count:0},error:null};
  T('profiles').filter(function(p){return p.managed&&!p.claimed_by&&p.email&&p.email===String(u.email).toLowerCase();}).forEach(function(m){S.claim(m.id,u.id);n++;});
  return {data:{claimed:[],count:n},error:null};},
 set_tech_permission:function(a){var r=T('tech_permissions').filter(function(x){return x.access_id===a.p_access_id&&(x.vehicle_id||null)===(a.p_vehicle_id||null);})[0];if(!r){r=Object.assign({},P,{id:'new'+S.seq++,vehicle_id:a.p_vehicle_id||null});T('tech_permissions').push(r);}r[a.p_permission]=a.p_value;return {data:r,error:null};},
 revoke_tech_access:function(){return {data:null,error:null};},
 initiate_transfer:function(a){return {data:[{transfer_id:'t1',code:'fedcba9876543210fedcba9876543210',expires_at:new Date(Date.now()+14*864e5).toISOString()}],error:null};}
};
S.claim=function(mid,uid2){
  var n=0;T('vehicles').forEach(function(v){if(v.owner_id===mid){v.owner_id=uid2;n++;}});
  ['vehicle_financials','expenses','reminders','advisories','tech_permissions','tech_access'].forEach(function(t){T(t).forEach(function(r){if(r.owner_id===mid)r.owner_id=uid2;});});
  var m=T('profiles').filter(function(p){return p.id===mid;})[0];if(m){m.claimed_by=uid2;m.claimed_at=new Date().toISOString();}
  // keep the tech able to read the cars through the permissions view (default menu)
  T('tech_access').filter(function(a){return a.owner_id===uid2&&a.tech_id===(m&&m.managed_by);}).forEach(function(){
    T('vehicles').filter(function(v){return v.owner_id===uid2;}).forEach(function(v){
      if(!T('my_tech_visibility').some(function(x){return x.vehicle_id===v.id&&x.__tech===m.managed_by;}))T('my_tech_visibility').push({__tech:m.managed_by,vehicle_id:v.id,owner_id:uid2,vehicle_label:'x',can_view_service_records:true,can_view_expenses:false,can_view_documents:true,can_view_reminders:true,can_view_value_estimate:false,can_view_health_estimate:true,can_view_purchase_info:false,can_view_photos:true,can_add_service:true,can_add_documents:true,can_add_expenses:false,can_create_advisories:true});});});
  return n;
};
S.ids={PAT:PAT,DANA:DANA,A:A,O:O,T:TT,V1:V1,V2:V2};
})();
