# ===== v33 (p33): "Which portfolio?" import step (mockup pf-04, Option B). Self-contained; wraps p20 step-2 functions only.
sub('</style>\n</head>',open(T+'portfolio_pick.css').read()+'\n</style>\n</head>','html')
js=js.rstrip()+'\n'+open(T+'p33_portfolio_pick.js').read()+'\n'
