# ===== remove client + owner My team + nickname on main Add vehicle form. exec'd from build_cloud.py (after patches_value) =====
sub('</style>\n</head>',open(T+'team.css').read()+'\n</style>\n</head>','html')
# nickname sits directly after Year / Make / Model on the main form (was collapsed under More details)
_nick='        <div class="input-group"><label>Nickname</label><input type="text" id="v-nickname" maxlength="40" placeholder="The Ghost"></div>\n'
sub(_nick,'','html')
sub('<div class="input-group"><label>Model</label><input type="text" id="v-model" maxlength="60" placeholder="911 GT3"></div>\n',
    '<div class="input-group"><label>Model</label><input type="text" id="v-model" maxlength="60" placeholder="911 GT3"></div>\n      <div class="input-group form-full"><label>Nickname (optional)</label><input type="text" id="v-nickname" maxlength="40" placeholder="The Ghost"></div>\n','html')
# owner side: Techs -> My team
sub('<span>Techs</span></div>','<span>My team</span></div>','html')
sub('<div class="page-title">Techs</div><div class="page-subtitle">Choose who can help with your collection, and exactly what they can see and do</div>',
    '<div class="page-title">My team</div><div class="page-subtitle">Invite a tech or advisor, choose exactly what they can see and do, and remove access any time</div>','html')
# loadAll: hide removed clients and their cars everywhere; keep a list for the Removed clients section
sub("  nc.profile=mine;nc.profiles=profMap;\n","""  nc.profile=mine;nc.profiles=profMap;
  var archOwners={},keepV={};
  for(i=0;i<prof.length;i++)if(prof[i].archived_at)archOwners[prof[i].id]=1;
  rows.veh=rows.veh.filter(function(r){if(archOwners[r.owner_id])return false;keepV[r.id]=1;return true;});
  ['fin','rem','svc','exp','doc','pho','adv','est'].forEach(function(k){rows[k]=(rows[k]||[]).filter(function(r){return !r.vehicle_id||keepV[r.vehicle_id];});});
  nc.removed=prof.filter(function(p){return p.managed&&p.archived_at&&!p.claimed_by&&(mine.role==='admin'||p.managed_by===me0);});
  nc.ended=C.ended||null;
""")
sub("    if(p.managed&&p.claimed_by)return;   // claimed placeholder","    if(p.archived_at)return;   // removed client\n    if(p.managed&&p.claimed_by)return;   // claimed placeholder")
sub("if(!clients.length&&!C.pending.length){el.innerHTML=emptyCard(","if(!clients.length&&!C.pending.length&&!(C.removed||[]).length){if(isRealTech())loadEnded();el.innerHTML='<div id=\"ended-notices\"></div>'+emptyCard(")
sub("  el.innerHTML=h;\n  revealMissingCodes(C.pending","  el.innerHTML='<div id=\"ended-notices\"></div>'+h+removedClientsHTML();decorateClientRows(el);renderEndedNotices();if(isRealTech())loadEnded();\n  revealMissingCodes(C.pending")
sub("  return h+'</div>';\n}\nfunction openClientDetail","  return h+deleteClientBtnHTML(c)+'</div>';\n}\nfunction openClientDetail")
sub("  if(email&&!validEmail(email)){showToast('That email looks invalid','error');return;}\n  var oid=ownerClientId()||myId();\n  var kind=scope",
    "  if(!email||!validEmail(email)){showToast('Enter your tech\\'s email address','error');return;}\n  var oid=ownerClientId()||myId();\n  var kind=scope")
for _n in ['renderAccess']:
    pass
