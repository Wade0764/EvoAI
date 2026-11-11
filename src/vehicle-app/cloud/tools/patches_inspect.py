# ===== v31 (p31): inspection report modal =====
sub('</style>\n</head>',open(T+'inspect.css').read()+'\n</style>\n</head>','html')
sub('<div class="modal-title">Inspection</div>','<div class="modal-title">Vehicle inspection report</div>','html')
sub('<div class="wizard-panel active" id="wp-0">','<p class="ins-intro" id="ins-intro"></p>\n    <div class="ins-prog" aria-live="polite"><div class="ins-prog-lbl" id="ins-prog-lbl">Step 1 of 5 &middot; <b>Vehicle</b></div><div class="ins-bar"><i id="ins-bar-fill" style="width:20%"></i></div></div>\n    <div class="wizard-panel active" id="wp-0">','html')
sub('<div class="input-group"><label>Client</label><select id="insp-client"','<div class="input-group" id="insp-client-group"><label>Client</label><select id="insp-client"','html')
sub("  for(var j=0;j<panels.length;j++)panels[j].classList.toggle('active',j===step);\n}","  for(var j=0;j<panels.length;j++)panels[j].classList.toggle('active',j===step);\n  inspProg(step);\n}")
# owner: no client, owned (or permitted) cars only, single car preselected
sub("  if(pv){populateClientSelect('insp-client',pv.clientId);populateVehicleSelect('insp-vehicle',pv.clientId,pv.id,'can_add_service');}\n  openModal('modal-inspection');",
    "  if(inspOwnerMode()){populateVehicleSelect('insp-vehicle',null,pv?pv.id:null,'can_add_service');}\n  else if(pv){populateClientSelect('insp-client',pv.clientId);populateVehicleSelect('insp-vehicle',pv.clientId,pv.id,'can_add_service');}\n  inspPickOnly();\n  openModal('modal-inspection');")
sub("  if(v&&v.mileage)setVal('insp-mileage-start',v.mileage);\n  openModal('modal-inspection');","  inspOwnerMode();\n  if(v&&v.mileage)setVal('insp-mileage-start',v.mileage);\n  openModal('modal-inspection');")
sub("function updateInspectionVehicles(){populateVehicleSelect('insp-vehicle',val('insp-client')||null,null,'can_add_service');}","function updateInspectionVehicles(){populateVehicleSelect('insp-vehicle',val('insp-client')||null,null,'can_add_service');inspPickOnly();}")
js=js.rstrip()+'\n'+open(T+'p31_inspect.js').read()+'\n'
