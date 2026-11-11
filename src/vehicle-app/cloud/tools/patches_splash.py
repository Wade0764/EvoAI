# ===== v36b (p39b): intro splash always on app open. Preview-only patch (logo2) =====
sub('<div id="boot-loading" style="display:none;">','<div id="boot-loading" class="evo-intro" style="display:flex;">','html')
sub('</style>\n</head>',open(T+'p39b_splash.css').read()+'\n</style>\n</head>','html')
js=js.rstrip()+'\n'+open(T+'p39b_splash.js').read()+'\n'
