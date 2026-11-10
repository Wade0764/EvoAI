# ===== AI document scanning + AI reminders (p10). exec'd last, after patches_safe =====
sub('</style>\n</head>',open(T+'docai.css').read()+'\n</style>\n</head>','html')
# hydration: extracted fields on documents; AI reminders kept apart from the per-kind date sync
sub("ownerOnly:!!dr.owner_only});","ownerOnly:!!dr.owner_only,ai:docAiFromRow(dr)});")
sub("      if(rm.kind==='custom'){","      if(rm.ai_generated){DOCAI_REM[rm.id]=rm;continue;}\n      if(rm.kind==='custom'){")
sub("var res=await Promise.all([tbl('vehicles')","DOCAI_REM={};\n  var res=await Promise.all([tbl('vehicles')")
# add-document modal: Save & scan with AI
sub('<button class="btn btn-primary" onclick="saveDocument()">Save document</button>','<button class="btn" onclick="saveDocument()">Save without scan</button>\n      <button class="btn btn-primary" id="doc-scan-btn" onclick="docAiSaveAndScan()">Save &amp; scan with AI</button>','html')
sub('Photo or PDF of the document</label>','Photo or PDF of the document <span class="dai-sorted" style="margin-left:6px">AI reads it and files it for you</span></label>','html')
# vehicle page + reminders page: AI reminders with reasons
sub('<div id="vd-banner"></div>','<div id="vd-banner"></div>\n    <div id="vd-airem"></div>','html')
sub("  elHTML('vd-img-area',pfHeroHTML(v));pfAfterDetail(v);","  elHTML('vd-img-area',pfHeroHTML(v));pfAfterDetail(v);docAiDetail(v);")
sub("function renderReminders(){elHTML('rem-body',remPageHTML(true));}","function renderReminders(){elHTML('rem-body',docAiRemSectionHTML(null,true)+remPageHTML(true));}")
for _n in set(names(open(T+'p10_docai.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p10_docai.js').read()+'\n'
