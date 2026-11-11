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
sub('.co-desc{font-size:17px;line-height:1.5;color:#C9CCD1;margin:0 0 14px}.co-muted{color:#B3B7BE}',
    '.co-desc{font-size:17px;line-height:1.5;color:#F7F4EE;margin:0 0 14px}.co-muted{color:#C9AA6B}', 'html')
sub('.co-n{font-size:19px;color:#F2F0EB}.co-m{font-size:15px;color:#B3B7BE;margin-top:3px;line-height:1.4}',
    '.co-n{font-size:19px;color:#F7F4EE}.co-m{font-size:15px;color:#F7F4EE;margin-top:3px;line-height:1.4}', 'html')
sub('.co-link{font-size:15px;color:#C9CCD1;margin-top:6px;word-break:break-all;user-select:all;-webkit-user-select:all}',
    '.co-link{font-size:15px;color:#C9AA6B;margin-top:6px;word-break:break-all;user-select:all;-webkit-user-select:all}', 'html')
sub('<p class="ph-note">Delete permanently is only for the owner or admin. Technicians can only delete cars they added. This cannot be undone after 10 seconds.</p>',
    '<p class="ph-note">Archive keeps completed jobs with the car. Delete permanently is refused when a completed job is on file. It is only for a car with no completed work, and it frees that VIN.</p>')
sub("showToast(r.error.code==='42501'?'You can only delete cars you added. '+name+' was not deleted.':'Could not delete '+name+'. It is still here.')",
    "showToast(/Archive/.test(String(r.error&&r.error.message||''))?r.error.message:(r.error.code==='42501'?'You can only delete cars you added. '+name+' was not deleted.':'Could not delete '+name+'. It is still here.'))")
js = js.rstrip()+'\n'+open(T+'p41_roles.js').read()+'\n'
