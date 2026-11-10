# ===== v15: calm vehicle page, Documentation section, owner value, replica / kit car (p13). exec'd after patches_large =====
sub('</style>\n</head>',open(T+'vehicle.css').read()+'\n</style>\n</head>','html')
# --- template: one Documentation section replaces Next due + Documents (+ the AI reminder block moves inside it)
sub('    <div id="vd-airem"></div>\n','','html')
sub('    <div class="due"><div class="sh first"><h2>Next due</h2></div><div id="vd-next"></div></div>\n',
    '    <section class="dsec" id="vd-doc"><div class="sh first"><h2>Documentation</h2></div><p class="dsec-desc">'+
    'All documents relating to vehicles - Registration, Invoice, repair orders. That will be automatically recognized and organized by AI.</p>'+
    '<div id="vd-doc-add"></div><div id="vd-doc-due"></div><div id="vd-airem"></div><div class="dsec-lab" id="vd-doc-lab">Documents</div><div id="vd-docs"></div></section>\n','html')
sub('    <div class="sh"><h2>Documents</h2></div>\n    <div id="vd-docs"></div>\n','','html')
sub("  var docs=getDocs().filter(function(d){return d.vehicleId===v.id;});\n  elHTML('vd-docs',docs.length?docs.map(function(d){return docRowHTML(d);}).join('')",
    "  var docs=docAiSort(getDocs().filter(function(d){return d.vehicleId===v.id;}));\n  elHTML('vd-docs',docs.length?docs.map(function(d){return docRowHTML(d);}).join('')")
sub("mutedLine(owner?'No documents on record yet. Use Add document for titles, registrations, policies and invoices.':'No documents on record. Use Add document and snap a photo of the title, registration or policy.')",
    "mutedLine('No documents yet. Tap Add Documents and AI reads, sorts and dates them for you.')")
sub("  elHTML('vd-next',nextH);","  elHTML('vd-next',nextH);dsecRender(v);")
sub("  elHTML('vd-ai',aiPanelHTML(v));","  elHTML('vd-ai',aiPanelHTML(v));vbFinish(v);")
# --- data: replica fields (columns from migration_009, mirrored in the notes extras so they survive without it)
sub("insRep:v.insRepeat==='6months'?'6months':'yearly'};}","insRep:v.insRepeat==='6months'?'6months':'yearly',rep:v.isReplica?1:'',bld:v.isReplica?(v.builder||''):''};}")
sub("    var v={id:r.id,clientId:r.owner_id,year:r.year?String(r.year):'',make:r.make||'',model:r.model||'',trim:x.trim||'',",
    "    var v={id:r.id,clientId:r.owner_id,year:r.year?String(r.year):'',make:r.make||'',model:r.model||'',trim:x.trim||'',isReplica:vrRep(r,x),builder:vrBld(r,x),")
sub("      chk(await sb.from('vehicles').insert(row));","      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);")
sub("notes:c.notes,archived:c.archived}).eq('id',v.id));","notes:c.notes,archived:c.archived}).eq('id',v.id));\n          await vrSyncCols(v);")
# --- owner values
sub(",mine.role==='tech'?tbl('my_tech_visibility'):Promise.resolve([])]);",",mine.role==='tech'?tbl('my_tech_visibility'):Promise.resolve([]),ovLoad()]);")
sub("vis:res[14]};","vis:res[14],ov:res[15]||[]};")
sub("\n    vehicles.push(v);\n","\n    ovApply(v,rows.ov);\n    vehicles.push(v);\n")
# --- form: Replica / Kit car toggle + Builder
sub('<div class="input-group"><label>Trim</label><input type="text" id="v-trim" maxlength="40" placeholder="Touring"></div>',
    '<div class="input-group"><label>Trim</label><input type="text" id="v-trim" maxlength="40" placeholder="Touring"></div>'+
    '<div class="input-group form-full vr-group"><label class="vr-tgl" for="v-replica"><input type="checkbox" id="v-replica" onchange="vrFormToggle()"><span class="vr-sw" aria-hidden="true"></span><span>Replica / Kit car</span></label>'+
    '<div id="v-builder-row" style="display:none"><label for="v-builder">Builder</label><input type="text" id="v-builder" maxlength="80" placeholder="e.g. JPS Motorsport"></div>'+
    '<div id="v-rep-hint" class="vr-hint" style="display:none" role="status" aria-live="polite"></div></div>','html')
sub("  var mre=document.getElementById('v-more');if(mre)mre.open=false;\n  openModal('modal-add-vehicle');","  var mre=document.getElementById('v-more');if(mre)mre.open=false;\n  vrFormFill(null);\n  openModal('modal-add-vehicle');")
sub("setVal('v-model',v.model);setVal('v-trim',v.trim||'');","setVal('v-model',v.model);setVal('v-trim',v.trim||'');vrFormFill(v);")
sub("trim:val('v-trim').trim().slice(0,40),","trim:val('v-trim').trim().slice(0,40),isReplica:!!(document.getElementById('v-replica')||{}).checked,builder:(document.getElementById('v-replica')||{}).checked?cleanText(val('v-builder'),80):'',")
# --- VIN decode + photo identification flag a likely replica (the owner confirms; nothing is changed silently)
sub("    if(conflict&&!window.confirm(","    var _rh=vrVinHint(row,cur['v-make']);\n    if(_rh){vrHint(_rh);if(!val('v-builder').trim()&&VR_KIT.test([row.Make,row.Manufacturer].join(' ')))setVal('v-builder',titleCase(cleanText(row.Manufacturer||row.Make,60)));setVinMsg('VIN decoded as '+[yr,mk,md].filter(function(x){return x;}).join(' ')+'. Your entries were kept.');return;}\n    if(conflict&&!window.confirm(")
sub("    autoIdNote(n&&conf<0.5?'low':'done',msg);","    autoIdNote(n&&conf<0.5?'low':'done',msg);\n    if(data.replica_likely===true)vrHint(cleanText(data.replica_reason,200)||'The photo suggests a replica or kit car.');")
js=js.rstrip()+'\n'+open(T+'p13_vehicle.js').read()+'\n'
for _n in ['valueHeadHTML','aiPanelHTML','aiVal','portfolioTotals','ptScanBlob']:
    # keep only the LAST definition (p13): drop earlier ones
    _first=fn_span(js,_n)
    _cnt=len(re.findall(r'^(async )?function '+_n+r'\(',js,re.M))
    if _cnt>1:
        a,b=_first;js=js[:a]+js[b:]
