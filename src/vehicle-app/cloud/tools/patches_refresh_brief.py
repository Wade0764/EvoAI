# ===== v28 (p30): refresh updates everything / brief / like-for-like trend / All range / failure reasons =====
sub('</style>\n</head>',open(T+'refresh_brief.css').read()+'\n</style>\n</head>','html')
# server worst case is two 45 s Gemini attempts plus DB work: the old 90 s client timer cut slow cars off and counted them as failed
sub("setTimeout(function(){res({data:null,error:{name:'Timeout'}});},90000);","setTimeout(function(){res({data:null,error:{name:'Timeout'}});},150000);")
sub("if(VALUE.busy[vid]&&Date.now()-t0<95000){setTimeout(wait,250);return;}","if(VALUE.busy[vid]&&Date.now()-t0<155000){setTimeout(wait,250);return;}",count=2)
# keep the reason a car failed (the queue used to delete it, so the app only said "could not be valued yet")
sub("      if(n&&n.kind!=='done'&&it.reason!=='user')delete VALUE.note[vid];","      try{rbNoteWhy(vid,n||{kind:'done'});}catch(e){}\n      if(n&&n.kind!=='done'&&it.reason!=='user')delete VALUE.note[vid];")
js=js.rstrip()+'\n'+open(T+'p30_refresh_brief.js').read()+'\n'
