# ===== v20: Missing indicators + completeness count (p19). exec'd last =====
sub('</style>\n</head>',open(T+'missing.css').read()+'\n</style>\n</head>','html')
sub('    <div id="vd-pf"></div>\n','    <div id="vd-key"></div>\n    <div id="vd-pf"></div>\n','html')
# form: registration, location, insurance; "What you paid" with currency
sub('<div class="input-group"><label>Mileage</label><input type="number" id="v-mileage" placeholder="1850" min="0" inputmode="numeric"></div>',
    '<div class="input-group"><label>Mileage</label><input type="number" id="v-mileage" placeholder="1850" min="0" inputmode="numeric"></div>'+
    '<div class="input-group"><label for="v-plate">Registration (plate)</label><input type="text" id="v-plate" maxlength="20" placeholder="K9 JOLLY" autocapitalize="characters" autocomplete="off"></div>'+
    '<div class="input-group"><label for="v-plate-region">State / region</label><input type="text" id="v-plate-region" maxlength="30" placeholder="FL" autocomplete="off"></div>'+
    '<div class="input-group form-full"><label for="v-location">Location</label><input type="text" id="v-location" maxlength="120" placeholder="Hickory Vaults" autocomplete="off"></div>'+
    '<div class="input-group form-full"><label for="v-insurer">Insurance</label><input type="text" id="v-insurer" maxlength="80" placeholder="Chubb" autocomplete="off"></div>','html')
sub('<div class="input-group fin-only"><label>Purchase price ($)</label><input type="number" id="v-purchase-price" placeholder="229000" min="0" inputmode="numeric"></div>',
    '<div class="input-group fin-only"><label for="v-purchase-price">What you paid</label><input type="number" id="v-purchase-price" placeholder="229000" min="0" inputmode="decimal"></div>'+
    '<div class="input-group fin-only"><label for="v-currency">Currency</label><select id="v-currency"><option value="USD">USD ($)</option><option value="EUR">EUR (&#8364;)</option><option value="GBP">GBP (&#163;)</option></select></div>','html')
# data
sub("vdec:v.vinDecodedAt||''};}","vdec:v.vinDecodedAt||'',pl:msX(v).pl,plr:msX(v).plr,loc:msX(v).loc,insc:msX(v).insc,cur:msX(v).cur};}")
sub("ovApply(v,rows.ov);","ovApply(v,rows.ov);msLoad(v,r,x,fin);")
sub("await vrSyncCols(v);","await vrSyncCols(v);await msSyncCols(v);",count=2)
# form wiring
sub("  vrFormFill(null);\n  openModal('modal-add-vehicle');","  vrFormFill(null);msFormFill(null);\n  openModal('modal-add-vehicle');")
sub("setVal('v-insured-value',v.insuredValue||'');setVal('v-notes',v.notes||'');","setVal('v-insured-value',v.insuredValue||'');setVal('v-notes',v.notes||'');msFormFill(v);")
sub("insuredValue:ins,notes:val('v-notes').slice(0,1000)};","insuredValue:ins,notes:val('v-notes').slice(0,1000)};\n  var _ms=msFormRead();for(var _mk in _ms)if(_ms.hasOwnProperty(_mk))fields[_mk]=_ms[_mk];")
# detail page
sub("  showEl('vd-actions',!!actions,'flex');\n","  showEl('vd-actions',!!actions,'flex');\n  msRender(v);\n")
js=js.rstrip()+'\n'+open(T+'p19_missing.js').read()+'\n'
