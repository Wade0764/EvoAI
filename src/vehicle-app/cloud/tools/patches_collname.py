# ===== v38 (p38): collection crest on Overview / client page / View-as (no DB change) =====
sub('</style>\n</head>',open(T+'collname.css').read()+'\n</style>\n</head>','html')
sub("ctitleSet('cd-name',collName(c),!!collCustom(c));","ctitleSet('cd-name',collName(c),!!collCustom(c),c);")
sub("ctitleSet('cp-title',collName(client),!!collCustom(client));","ctitleSet('cp-title',collName(client),!!collCustom(client),client);")
js=js.rstrip()+'\n'+open(T+'p38_collname.js').read()+'\n'
