# ===== v41 (p41): invitations, estimates on the existing requests, tech dashboard, world portfolios =====
sub('</style>\n</head>', open(T+'p41_roles.css').read()+'\n</style>\n</head>', 'html')
sub(
  "o.can_add_service=!!vr.can_add_service;o.can_add_documents=!!vr.can_add_documents;o.can_add_expenses=!!vr.can_add_expenses;o.can_create_advisories=!!vr.can_create_advisories;",
  "o.can_add_service=!!vr.can_add_service;o.can_add_documents=!!vr.can_add_documents;o.can_add_expenses=!!vr.can_add_expenses;o.can_create_advisories=!!vr.can_create_advisories;"
  "o.can_upload_photos=vr.can_upload_photos!==false;o.can_scan_documents=vr.can_scan_documents!==false;o.can_add_reminders=!!vr.can_add_reminders;o.can_send_estimates=vr.can_send_estimates!==false;"
)
sub(
  "if(!v||!can(v,'view_photos')){showToast('Photos are not enabled for you on this vehicle.','error');input.value='';return;}",
  "if(!v||!canUploadPhotos(v)){showToast('Photos are not enabled for you on this vehicle.','error');input.value='';return;}"
)
sub(
  "function pfCanModify(v,p){return !!(v&&p&&(canEditVehicle(v)||(p.by===myId()&&can(v,'view_photos'))));}",
  "function pfCanModify(v,p){return !!(v&&p&&(canEditVehicle(v)||(p.by===myId()&&canUploadPhotos(v))));}"
)
sub(
  "if(can(v,'view_photos'))b+='<button class=\"btn btn-sm\" onclick=\"pickDetailPhoto()\">Photo</button>';",
  "if(canUploadPhotos(v))b+='<button class=\"btn btn-sm\" onclick=\"pickDetailPhoto()\">Photo</button>';"
)
sub(
  "async function docAiScan(docId){\n  var my=++DOCAI.token;",
  "async function docAiScan(docId){\n  var my=++DOCAI.token;\n  try{var _d=byId(getDocs(),docId),_v=_d&&byId(getVehicles(),_d.vehicleId);if(_v&&!canReviewScan(_v)){docAiState('note','Reviewed scanning is not enabled for you on this vehicle. Enter the details below.');return;}}catch(_e){}\n"
)
sub(
  "async function ssRun(){\n  var my=++SS.tok;",
  "async function ssRun(){\n  var my=++SS.tok;\n  try{var _sv=byId(getVehicles(),val('svc-vehicle'));if(_sv&&!canReviewScan(_sv)){ssShow('entry','Reviewed scanning is not enabled for you on this vehicle. Enter the details below.');return;}}catch(_e){}\n"
)
js = js.rstrip()+'\n'+open(T+'p41_roles.js').read()+'\n'
