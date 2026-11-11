# ===== portfolio + roundabout. exec'd from build_cloud.py after patches_team (keeps the team hook intact) =====
sub('</style>\n</head>',open(T+'portfolio.css').read()+'\n</style>\n</head>','html')
# vehicle page: Nickname heading, Year Make Model sub-heading (same font); gallery slot under the header
sub("  elText('vd-title',vFull(v));\n  elHTML('vd-nickname',nickHTML(v));","  elText('vd-title',heroHead(v));\n  elHTML('vd-nickname',heroSubHTML(v,'hero-sub'));")
sub("  elHTML('vd-img-area',carFrame(v));","  elHTML('vd-img-area',pfHeroHTML(v));pfAfterDetail(v);")
sub('<div id="vd-banner"></div>','<div id="vd-pf"></div>\n    <div id="vd-banner"></div>','html')
# owner + advisor overview: the collection is the roundabout (client detail keeps the grid)
sub("elHTML(p+'-vehicles',vehicles.length?vehicles.map(function(v){return vehicleCardHTML(v);}).join(''):emptyCard(owner?","elHTML(p+'-vehicles',vehicles.length?wheelHTML(vehicles,p):emptyCard(owner?")
sub("  if(owner)elHTML('cp-redeem',vehicles.length?'':redeemCardHTML('ov'));","  wheelMount(p+'-vehicles',vehicles);\n  if(owner)elHTML('cp-redeem',vehicles.length?'':redeemCardHTML('ov'));")
for _n in set(names(open(T+'p7_portfolio.js').read())+names(open(T+'p8_wheel.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p7_portfolio.js').read()+'\n'+open(T+'p8_wheel.js').read()+'\n'
