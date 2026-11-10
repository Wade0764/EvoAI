# ===== v24: import fix (p24). exec'd after patches_undo =====
sub('</style>\n</head>',open(T+'importfix.css').read()+'\n</style>\n</head>','html')
sub('function imClean(raw){','function imCleanBase(raw){')
sub('async function imReadFile(file){','async function imReadFileBase(file){')
sub('function imStep2(){','function imStep2Base(){')
sub('tc=await pg.getTextContent(),items=[];','tc=await pg.getTextContent({disableCombineTextItems:true}),items=[];')
js=js.rstrip()+'\n'+open(T+'p24_importfix.js').read()+'\n'
