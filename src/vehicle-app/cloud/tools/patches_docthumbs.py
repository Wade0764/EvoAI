# ===== v18 document thumbnails + full-screen viewer (p18). exec'd last, after patches_sizefix =====
sub('</style>\n</head>',open(T+'docthumbs.css').read()+'\n</style>\n</head>','html')
# hydration: keep storage + thumb paths on each doc (lazy signing happens in p18, not at load)
sub("ownerOnly:!!dr.owner_only,ai:docAiFromRow(dr)});","ownerOnly:!!dr.owner_only,ai:docAiFromRow(dr),path:dr.storage_path||'',thumbPath:dr.thumb_path||''});\n    if(dr.thumb_path)DT_THUMBS[dr.id]=dr.thumb_path;if(DT.col===null)DT.col=Object.prototype.hasOwnProperty.call(dr,'thumb_path');")
# upload: same file kept as before, plus a stored _t.jpg thumbnail when migration_011 is in
sub("    chk(await sb.from('documents').insert({id:d.id,vehicle_id:d.vehicleId,","    await dtInsertDoc({id:d.id,vehicle_id:d.vehicleId,")
sub("storage_path:path,mime_type:mime,size_bytes:blob.size||null,owner_only:ownerOnly}));","storage_path:path,mime_type:mime,size_bytes:blob.size||null,owner_only:ownerOnly},blob,mime,path);")
# remove: thumbnail file goes with the document
sub("      chk(await sb.from('documents').delete().eq('id',pv.id));\n      await removeObject('vehicle-documents',path);","      chk(await sb.from('documents').delete().eq('id',pv.id));\n      await removeObject('vehicle-documents',path);\n      await dtRemoveThumb(pv.id);")
# swipe-back from the left edge closes the document viewer first (unless zoomed)
sub("function swbTarget(){\n","function swbTarget(){\n  try{if(DT.view){if(DT.view.s>1.02)return null;return {el:DT.view.el,act:function(){dtCloseViewer();}};}}catch(e){}\n  try{if(document.getElementById('dt-sheet'))return {el:document.querySelector('#dt-sheet .dt-sheet'),act:function(){dtCloseSheet();}};}catch(e){}\n")
for _n in set(names(open(T+'p18_docthumbs.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p18_docthumbs.js').read()+'\n'
