# ===== v34 (p34): Records vault / AI binders (self-contained; Documents page only, no DB change) =====
sub('</style>\n</head>',open(T+'binder.css').read()+'\n</style>\n</head>','html')
sub("thumbPath:dr.thumb_path||''});","thumbPath:dr.thumb_path||'',srId:dr.service_record_id||'',bd:dx.bd||'',_x:dx});")
sub('function renderDocuments(){','function renderDocumentsList(){')
js=js.rstrip()+'\n'+open(T+'p34_binder.js').read()+'\n'
