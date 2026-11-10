# ===== v25: press and hold + merge duplicates + import aliases (p25). exec'd after patches_importfix =====
sub('</style>\n</head>',open(T+'presshold.css').read()+'\n</style>\n</head>','html')
sub("archived:!!r.archived,archivedAt:r.archived_at||null,","archived:!!r.archived,archivedAt:r.archived_at||null,sortOrder:(r.sort_order==null?null:Number(r.sort_order)),createdBy:r.created_by||null,mergedInto:r.merged_into||null,")
sub("elHTML(p+'-vehicles',vehicles.length?wheelHTML(vehicles,p):","vehicles=phSorted(vehicles);elHTML(p+'-vehicles',vehicles.length?wheelHTML(vehicles,p):")
_a=js.rindex('  // pass 2: "Same car?"');_b=js.index("  pre.forEach(function(o){\n    var f=o.f,row=",_a)
js=js[:_a]+'  imPass2v25(pre,col,taken,out,res);\n'+js[_b:]
sub("Nothing is matched unless the VIN, chassis or registration is the same, so please check.","We matched these by name and year (and known other names, like Jolly for a Fiat 500), so please check.")
sub("<div class=\"im-car\">'+imE(p.car)+'</div>'+p.cands.map","<div class=\"im-car\">'+imE(p.car)+'</div>'+(p.note?'<div class=\"im-txt im-note25\">'+imE(p.note)+'</div>':'')+p.cands.map")
js=js.rstrip()+'\n'+open(T+'p25_import_alias.js').read()+'\n'+open(T+'p25_presshold.js').read()+'\n'
