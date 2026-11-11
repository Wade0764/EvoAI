# ===== v19: Replica / Kit car toggle moved out of "More details" into the main Vehicle grid (Add + Edit share modal-add-vehicle). exec'd last =====
_RG_OLD=('<div class="input-group form-full vr-group"><label class="vr-tgl" for="v-replica"><input type="checkbox" id="v-replica" onchange="vrFormToggle()"><span class="vr-sw" aria-hidden="true"></span><span>Replica / Kit car</span></label>'+
    '<div id="v-builder-row" style="display:none"><label for="v-builder">Builder</label><input type="text" id="v-builder" maxlength="80" placeholder="e.g. JPS Motorsport"></div>'+
    '<div id="v-rep-hint" class="vr-hint" style="display:none" role="status" aria-live="polite"></div></div>')
_RG_NEW=('\n      <div class="input-group form-full vr-group vr-main" id="v-replica-group"><label class="vr-tgl vr-tgl-lg" for="v-replica"><span class="vr-txt"><span class="vr-name">Replica / Kit car</span>'+
    '<span class="vr-help" id="v-replica-help">Turn on if this car is a replica, recreation or kit build.</span></span>'+
    '<input type="checkbox" id="v-replica" role="switch" aria-describedby="v-replica-help" onchange="vrFormToggle()"><span class="vr-sw" aria-hidden="true"></span></label>'+
    '<div id="v-builder-row" class="vr-builder" style="display:none"><label for="v-builder">Builder</label><input type="text" id="v-builder" maxlength="80" placeholder="e.g. JPS Motorsport" autocomplete="off"></div>'+
    '<div id="v-rep-hint" class="vr-hint" style="display:none" role="status" aria-live="polite"></div></div>')
sub(_RG_OLD,'','html')
sub('<div class="input-group"><label>Color</label><input type="text" id="v-color" maxlength="40" placeholder="GT Silver"></div>\n    </div>',
    '<div class="input-group"><label>Color</label><input type="text" id="v-color" maxlength="40" placeholder="GT Silver"></div>'+_RG_NEW+'\n    </div>','html')
sub('</style>\n</head>',open(T+'replica_add.css').read()+'\n</style>\n</head>','html')
# Add path: a brand-new account (no vehicles loaded yet) left VR.cols null, so the insert never wrote is_replica/builder. Try unless known missing.
sub("  if(VR.cols!==true||!v)return;","  if(VR.cols===false||!v)return;")
sub("    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))VR.cols=false;}catch(e){}",
    "    if(r&&r.error&&(r.error.code==='42703'||r.error.code==='PGRST204'))VR.cols=false;else if(r&&!r.error)VR.cols=true;}catch(e){}")
