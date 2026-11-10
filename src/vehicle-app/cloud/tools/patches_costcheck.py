# ===== v21b: cost basis check (p21). exec'd after patches_import =====
sub('</style>\n</head>',open(T+'costcheck.css').read()+'\n</style>\n</head>','html')
sub('<div class="input-group fin-only"><label>Purchase date</label>','<div id="cb-form" class="input-group form-full fin-only" style="display:none" aria-live="polite"></div><div class="input-group fin-only"><label>Purchase date</label>','html')
js=js.rstrip()+'\n'+open(T+'p21_costcheck.js').read()+'\n'
# v21c: flagged costs save as unconfirmed (form hook + notes extras mirror)
sub("  var dfs=readDateFields(mileage);","  var dfs=readDateFields(mileage);if(typeof cbFormFields==='function')cbFormFields(fields);")
sub("cur:msX(v).cur};}","cur:msX(v).cur,cfc:cbX(v).cfc,cfr:cbX(v).cfr};}")
