# ===== v35 (p35): emerald accent preview (CSS + ring/readability JS; no DB change) =====
sub('</style>\n</head>',open(T+'p35_emerald.css').read()+'\n</style>\n</head>','html')
sub('<i class="evo-wm" aria-hidden="true"></i><div class="evo-tag">Private collection</div></div><div id="boot-loading-text"','<i class="evo-wm" aria-hidden="true"></i><div class="evo-tag">Private Collection Management</div></div><div id="boot-loading-text"','html')
js=js.rstrip()+'\n'+open(T+'p35_emerald.js').read()+'\n'
