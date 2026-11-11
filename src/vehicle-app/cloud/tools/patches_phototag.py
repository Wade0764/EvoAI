# ===== AI photo dump / auto-sort (p11). exec'd last, after patches_docai =====
sub('</style>\n</head>',open(T+'phototag.css').read()+'\n</style>\n</head>','html')
sub("tag:ph.tag||'',","tag:ptNormTag(ph),tagSrc:ph.tag_source||'',")
sub("var PF_TAGS=['Exterior','Interior','Engine','Detail','Work'];","var PF_TAGS=['Exterior','Interior','Engine','Wheels','Details','Documents','Work','Other'];")
sub("  if(pfCanModify(v,p))acts+='<button class=\"pfg-btn pfg-del\"","  if(p.tag==='Documents'&&can(v,'can_add_documents'))acts+='<button class=\"pfg-btn pt-docbtn\" type=\"button\" onclick=\"ptScanPhoto(\\''+jsId(p.id)+'\\')\">Scan as document?</button>';\n  if(pfCanModify(v,p))acts+='<button class=\"pfg-btn pfg-del\"")
for _n in set(names(open(T+'p11_phototag.js').read())):
    if fn_span(js,_n):replace_fn(_n)
# the p11 file redeclares PF_TAGS (same value); keep only its functions
js=js.rstrip()+'\n'+open(T+'p11_phototag.js').read()+'\n'
