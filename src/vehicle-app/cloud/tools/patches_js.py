sub("var ADVISOR_PAGES=['dashboard','reminders','clients','client-detail','archives','valuations','inspections','recommendations','expenses','documents','audit','team'];","var ADVISOR_PAGES=['dashboard','reminders','clients','client-detail','archives','valuations','inspections','recommendations','expenses','documents','audit','team','access'];")
sub("var OWNER_PAGES=['client-portal','client-link','reminders',","var OWNER_PAGES=['client-portal','client-link','access','reminders',")
sub("else if(pageId==='team')renderTeam();","else if(pageId==='team')renderTeam();\n  else if(pageId==='access')renderAccess();")
sub("emptyCard(owner?'Your collection is being set up. Your advisor will add your first vehicle soon, and it will appear here with its photo and value.':'No vehicles yet.','grid-column:1/-1;')",
    "emptyCard(owner?'Your collection is empty. Add your first vehicle to get started.<div><button class=\"btn btn-primary\" onclick=\"openAddVehicleModal()\">Add first vehicle</button></div>':'No vehicles yet.','grid-column:1/-1;')")
sub('Step 1: add your first client. Step 2: add each of their vehicles.','Step 1: add your first client (no invite needed). Step 2: add their vehicles.')
sub("Add first client</button>","New client</button>",count=0)
# add vehicle
sub("  if(!getClients().length){showToast('Add a client first, then add their vehicles.','error');openModal('modal-add-client');return;}",
    "  var addable=getClients().filter(function(c){return canAddVehicleFor(c.id);});\n  if(!addable.length){showToast('Invite a client first. You can add their vehicles after they connect.','error');if(isAdvisor())openModal('modal-add-client');return;}")
sub("populateClientSelect('v-client',onClientPage&&onClientPage.classList.contains('active')?currentClientId:null);",
    "populateClientSelect('v-client',onClientPage&&onClientPage.classList.contains('active')?currentClientId:null,true);\n  var cgrp=document.getElementById('v-client');if(cgrp&&cgrp.parentNode)cgrp.parentNode.style.display=(addable.length===1)?'none':'';\n  toggleFinFields();")
sub("  if(refuseIfArchived(v))return;\n  editingVehicleId=v.id;","  if(refuseIfArchived(v))return;\n  if(!requireEdit(v))return;\n  editingVehicleId=v.id;")
sub("  populateClientSelect('v-client',v.clientId);\n  setVal('v-year'","  populateClientSelect('v-client',v.clientId);\n  var cgrp2=document.getElementById('v-client');if(cgrp2&&cgrp2.parentNode)cgrp2.parentNode.style.display='none';\n  toggleFinFields();\n  setVal('v-year'")
sub("  if(!byId(getClients(),clientId)){showToast('Select a valid client','error');return;}","  if(!byId(getClients(),clientId)){showToast('Select a valid client','error');return;}\n  if(!editingVehicleId&&!canAddVehicleFor(clientId)){showToast('You cannot add vehicles for this client.','error');return;}")
sub("    if(refuseIfArchived(v))return;\n    if(v.clientId!==clientId){","    if(refuseIfArchived(v))return;\n    if(!requireEdit(v))return;\n    if(v.clientId!==clientId){")
# vehicle detail
sub("archived?'<span class=\"read-only-tag\">Read-only archive</span>':(owner?'<span class=\"read-only-tag\">Read-only</span>':'')","archived?'<span class=\"read-only-tag\">Read-only archive</span>':''")
sub("  elHTML('vd-ai',aiPanelHTML(v));","  elHTML('vd-ai',aiPanelHTML(v));\n  elHTML('vd-photos',photosHTML(v));")
sub("remRowHTML(it,!owner&&!archived,false)","remRowHTML(it,!archived,false)")
sub("else if(!archived)nextH=owner?mutedLine('No dates on file yet. Your advisor adds registration, insurance and service dates for you.'):'<div class=\"empty\">","else if(!archived)nextH=!canEditVehicle(v)?mutedLine('No dates on file yet. The owner adds registration, insurance and service dates.'):'<div class=\"empty\">")
sub("owner?'No documents on record yet. Your advisor files titles, registrations and policies here.'","owner?'No documents on record yet. Use Add document for titles, registrations, policies and invoices.'")
# gating inside saves
sub("  if(refuseIfArchived(v))return;\n  var logs=getLogs();","  if(refuseIfArchived(v))return;\n  if(!requireCan(v,'can_add_service'))return;\n  var logs=getLogs();")
sub("  populateVehicleSelect('note-vehicle',null,prefVehicleId(vid));","  populateVehicleSelect('note-vehicle',null,prefVehicleId(vid),'can_add_service');")
sub("  if(!requireAdvisor())return;\n  var vs=getVehicles(),v=byId(vs,currentVehicleId);","  var vs=getVehicles(),v=byId(vs,currentVehicleId);",count=0) if False else None
# archive
sub("  var vs=getVehicles(),v=byId(vs,currentVehicleId);\n  if(!v)return;\n  if(isArchivedVehicle(v)){showToast('This vehicle is already archived','error');return;}","  var vs=getVehicles(),v=byId(vs,currentVehicleId);\n  if(!v)return;\n  if(!requireEdit(v))return;\n  if(isArchivedVehicle(v)){showToast('This vehicle is already archived','error');return;}")
sub("its records on this device:\\n","its records:\\n")
# expenses
sub("  if(v&&refuseIfArchived(v))return;\n  if(!window.confirm('Remove this expense","  if(v&&refuseIfArchived(v))return;\n  if(!canEditVehicle(v)){showToast('Only the owner can remove expenses.','error');return;}\n  if(!window.confirm('Remove this expense")
sub("  if(v&&refuseIfArchived(v))return;\n  if(!window.confirm('Remove the document","  if(v&&refuseIfArchived(v))return;\n  if(!(canEditVehicle(v)||(d.by===myId()&&can(v,'can_add_documents')))){showToast('Only the owner can remove this document.','error');return;}\n  if(!window.confirm('Remove the document")
sub("  populateVehicleSelect('ex-vehicle',null,prefVehicleId(vid));","  populateVehicleSelect('ex-vehicle',null,prefVehicleId(vid),'can_add_expenses');")
sub("  var v=byId(getVehicles(),vid);if(!v){showToast('Vehicle not found','error');return;}\n  if(refuseIfArchived(v))return;\n  var e={id:uid()","  var v=byId(getVehicles(),vid);if(!v){showToast('Vehicle not found','error');return;}\n  if(refuseIfArchived(v))return;\n  if(!requireCan(v,'can_add_expenses'))return;\n  var e={id:uid()")
sub("image:ctxPhoto.ex||'',","image:ctxPhoto.ex||'',_file:ctxFile.ex||null,")
sub("var vehicles=visibleVehicles(),adv=isAdvisor(),ids={};","var vehicles=visibleVehicles(),adv=canRemoveExpenses(),ids={};")
sub("'No expenses logged yet. Your advisor adds them as work is done.'","'No expenses to show. They appear here when the owner shares them with you.'",count=0)
# inspections / service / notes
sub("function updateInspectionVehicles(){populateVehicleSelect('insp-vehicle',val('insp-client')||null,null);}","function updateInspectionVehicles(){populateVehicleSelect('insp-vehicle',val('insp-client')||null,null,'can_add_service');}")
# recs
sub("    if(v)clientId=v.clientId;","    if(v)clientId=v.clientId;\n  if(!v){showToast('Pick the vehicle this advisory is about','error');return;}\n  if(!requireCan(v,'can_create_advisories'))return;",count=0) if False else None
# inspections
sub("  if(!v){showToast('Select a vehicle','error');goWizardStep(0,true);return;}\n  if(refuseIfArchived(v))return;\n  var services=[]","  if(!v){showToast('Select a vehicle','error');goWizardStep(0,true);return;}\n  if(refuseIfArchived(v))return;\n  if(!requireCan(v,'can_add_service'))return;\n  var services=[]")
# recs
sub("  populateClientSelect('rec-client',v?v.clientId:null);\n  populateVehicleSelect('rec-vehicle',v?v.clientId:null,v?v.id:null);","  populateClientSelect('rec-client',v?v.clientId:null);\n  populateVehicleSelect('rec-vehicle',v?v.clientId:null,v?v.id:null,'can_create_advisories');")
sub("function updateRecVehicles(){populateVehicleSelect('rec-vehicle',val('rec-client')||null,null);}","function updateRecVehicles(){populateVehicleSelect('rec-vehicle',val('rec-client')||null,null,'can_create_advisories');}")
sub("  if(v)clientId=v.clientId;\n  if(!clientId||!byId(getClients(),clientId))","  if(v)clientId=v.clientId;\n  if(!v){showToast('Pick the vehicle this advisory is about','error');return;}\n  if(!requireCan(v,'can_create_advisories'))return;\n  if(!clientId||!byId(getClients(),clientId))")
sub("  var note=window.prompt('Completion note for the owner (optional):','');\n  if(note===null)return;","  var note='';")
# reminders
sub("var v=byId(getVehicles(),it.vid),c=levelColor(it.sortDays),urgent=it.sortDays<=30,vid=jsId(it.vid);","var v=byId(getVehicles(),it.vid),c=levelColor(it.sortDays),urgent=it.sortDays<=30,vid=jsId(it.vid);\n  canAct=canAct&&canManageReminders(v);")
sub("(canAct?'Mark items done here and the owner sees the new date. ':'Your advisor marks items done and the new date appears here. ')+'Phone and email alerts turn on with the cloud version. Until then, use Add to calendar.</div>'","'Mark items done here and the new date is saved. Phone and email alerts are not on yet. For now, use Add to calendar.</div>'")
sub("remPageHTML(isAdvisor())","remPageHTML(true)")
sub("  var vs=getVehicles(),v=byId(vs,vid);if(!v)return;\n  if(refuseIfArchived(v))return;\n  var months=12","  var vs=getVehicles(),v=byId(vs,vid);if(!v)return;\n  if(refuseIfArchived(v))return;\n  if(!requireEdit(v))return;\n  var months=12")
sub("  if(refuseIfArchived(v))return;\n  var miles=Number(v.mileage)||0;","  if(refuseIfArchived(v))return;\n  if(!requireCan(v,'can_add_service'))return;\n  var miles=Number(v.mileage)||0;")
sub("  var vs=getVehicles(),v=byId(vs,vid);if(!v||!v.reminders)return;\n  var keep=[]","  var vs=getVehicles(),v=byId(vs,vid);if(!v||!v.reminders)return;\n  if(!requireEdit(v))return;\n  var keep=[]")
sub("  populateVehicleSelect('svc-vehicle',null,prefVehicleId(vid));","  populateVehicleSelect('svc-vehicle',null,prefVehicleId(vid),'can_add_service');")
sub("  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;\n  var miles=toInt(val('svc-miles'))","  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;\n  if(!requireCan(v,'can_add_service'))return;\n  var miles=toInt(val('svc-miles'))")
sub("  var nxt=applyService(v,date,miles||0,note);\n  if(!setVehicles(vs))return;\n  if(cost&&cost>0){","  var nxt=applyService(v,date,miles||0,note);\n  if(cost&&cost>0)v.serviceLog[v.serviceLog.length-1].cost=Math.round(cost*100)/100;\n  if(!setVehicles(vs))return;\n  if(cost&&cost>0&&can(v,'can_add_expenses')){")
sub("  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;\n  if(!v.reminders)v.reminders=[];","  var vs=getVehicles(),v=byId(vs,vid);if(!v||refuseIfArchived(v))return;\n  if(!requireEdit(v))return;\n  if(!v.reminders)v.reminders=[];")
sub("  if(latest){\n    v.lastServiceDate=date;\n    v.nextServiceDate=","  if(latest)v.lastServiceDate=date;\n  if(latest&&canManageReminders(v)){\n    v.nextServiceDate=")
sub("populateVehicleSelect('insp-vehicle',pv.clientId,pv.id);}","populateVehicleSelect('insp-vehicle',pv.clientId,pv.id,'can_add_service');}")

# ===== migration_003: add vehicle for a chosen / managed client =====
sub("function openAddVehicleModal(){\n  if(!requireAdvisor())return;","function openAddVehicleModal(presetClientId){\n  if(!requireAdvisor())return;")
sub("populateClientSelect('v-client',onClientPage&&onClientPage.classList.contains('active')?currentClientId:null,true);\n  var cgrp=document.getElementById('v-client');if(cgrp&&cgrp.parentNode)cgrp.parentNode.style.display=(addable.length===1)?'none':'';\n  toggleFinFields();",
    "populateClientSelect('v-client',(typeof presetClientId==='string'&&presetClientId)||(onClientPage&&onClientPage.classList.contains('active')?currentClientId:null),true);\n  var cgrp=document.getElementById('v-client');if(cgrp&&cgrp.parentNode)cgrp.parentNode.style.display=(addable.length===1)?'none':'';\n  vehicleClientChanged();")
sub("  elText('cd-meta',[c.location,c.email,c.phone].filter(function(x){return x;}).join(' / '));","  elText('cd-meta',[c.location,c.email,c.phone].filter(function(x){return x;}).join(' / '));\n  elHTML('cd-managed',managedBannerHTML(c));")
sub("  var al=document.getElementById(p+'-archive-link');","  if(owner)elHTML('cp-redeem',vehicles.length?'':redeemCardHTML('ov'));\n  var al=document.getElementById(p+'-archive-link');")
sub("No vehicles yet for this client.<div><button class=\"btn btn-primary\" onclick=\"openAddVehicleModal()\">Add first vehicle</button></div>","No vehicles yet for this client.<div><button class=\"btn btn-primary\" onclick=\"openAddVehicleFor(\\''+jsId(c.id)+'\\')\">Add first vehicle for '+esc(c.name)+'</button></div>")
sub("Invite a client first. You can add their vehicles after they connect.","Add a client first (New client), then add their vehicles.")
sub("<button class=\"btn\" onclick=\"openModal(\\'modal-add-client\\')\">Add client</button>","<button class=\"btn\" onclick=\"openNewClient()\">New client</button>")
sub("Step 1: invite your first client. Step 2: once they connect, add their vehicles.","Step 1: add your first client (no invite needed). Step 2: add their vehicles.") if False else None

# ===== identify-vehicle (auto-identify from photo) =====
sub("      pendingVehicleImage=out;\n","      pendingVehicleImage=out;\n      autoIdIdentify(out);\n")
sub("function resetImagePicker(){\n  pendingVehicleImage=null;","function resetImagePicker(){\n  pendingVehicleImage=null;\n  if(typeof autoIdReset==='function')autoIdReset();")
