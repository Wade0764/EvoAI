# ===== dz: safe area + client title + swipe-back. exec'd last (after portfolio) =====
sub('</style>\n</head>',open(T+'safe.css').read()+'\n</style>\n</head>','html')
sub('&larr; Back</button>','<span class="ba" aria-hidden="true">&larr;</span> Back</button>','html')
sub('&larr; Clients</button>','<span class="ba" aria-hidden="true">&larr;</span> Clients</button>','html')
sub("elText('cp-title',client.name);","ctitleSet('cp-title',client.name);")
sub("elText('cd-name',c.name);","ctitleSet('cd-name',c.name);")
for _n in set(names(open(T+'p9_safe.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p9_safe.js').read()+'\n'
