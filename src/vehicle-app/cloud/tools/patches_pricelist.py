# Price list patch. Appended after the roles patch.
sub('</style>\n</head>', open(T+'p42_pricelist.css',encoding='utf-8').read()+'\n</style>\n</head>', 'html')
_parse=open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))),'evoai-cloud','functions','draft-price-list','parse.js'),encoding='utf-8').read()
_parse=_parse.replace('export function ','function ')
js=js.rstrip()+'\n'+_parse+'\n'+open(T+'p42_pricelist.js',encoding='utf-8').read()+'\n'
