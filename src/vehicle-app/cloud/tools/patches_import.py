# ===== v21: master sheet import + portfolios (p20). exec'd last =====
sub('</style>\n</head>',open(T+'import.css').read()+'\n</style>\n</head>','html')
# entry points: owner collection header and client page header
sub('<span class="lab" id="cp-title">My collection</span><div class="head-actions"><button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div>',
    '<span class="lab" id="cp-title">My collection</span><div class="head-actions"><button class="btn btn-sm" id="cp-import" onclick="imOpen()">Import sheet</button><button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div>','html')
sub('<div class="head-actions"><button class="btn btn-sm btn-primary perm-addveh" onclick="openAddVehicleModal()">Add vehicle</button><button class="btn btn-sm" onclick="openClientArchives()">Archives</button>',
    '<div class="head-actions"><button class="btn btn-sm btn-primary perm-addveh" onclick="openAddVehicleModal()">Add vehicle</button><button class="btn btn-sm perm-addveh" id="cd-import" onclick="imOpen(currentClientId)">Import sheet</button><button class="btn btn-sm" onclick="openClientArchives()">Archives</button>','html')
# data: portfolios load (graceful without migration 013), vehicles.portfolio_id
sub(",ovLoad(),cmLoad()]);",",ovLoad(),cmLoad(),poLoad()]);")
sub("CO.of=coOfRows(CO.rows,me0);","CO.of=coOfRows(CO.rows,me0);poSet(res[17]);")
sub("ovApply(v,rows.ov);msLoad(v,r,x,fin);","ovApply(v,rows.ov);msLoad(v,r,x,fin);poApplyRow(v,r);")
sub("notes:c.notes,archived:false};","notes:c.notes,archived:false};if(typeof PO!=='undefined'&&PO.cols===true&&v.portfolioId)row.portfolio_id=v.portfolioId;")
js=js.rstrip()+'\n'+open(T+'p20_import.js').read()+'\n'
