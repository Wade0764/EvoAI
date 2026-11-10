# ===== v37 (p37): premium page headers + tidy section labels (CSS + small JS, no DB change) =====
sub('</style>\n</head>',open(T+'p37_headings.css').read()+'\n</style>\n</head>','html')
js=js.rstrip()+'\n'+open(T+'p37_headings.js').read()+'\n'
