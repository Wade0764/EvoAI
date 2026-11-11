# ===== v23: database-backed undo import (p23). exec'd after patches_nav =====
sub('</style>\n</head>',open(T+'undo.css').read()+'\n</style>\n</head>','html')
# keep the original local logic under new names; p23 wraps them
sub('function imApply(A,owner,pfId,appr,add){','function imApplyLocal(A,owner,pfId,appr,add){')
sub("function imUndo(id){\n  var all=imBatches(),b=all.filter(function(x){return x.id===id;})[0];if(!b||b.undone){showToast('Nothing to undo','error');return;}",
    "function imUndoLocal(id){\n  var all=imBatches(),b=all.filter(function(x){return x.id===id;})[0];if(!b||b.undone){return null;}")
sub("  b.undone=new Date().toISOString();imSaveBatches(all);\n  if(IM.step===4&&IM.done)IM.done.undone={removed:Object.keys(gone).length,reverted:reverted};\n  showToast('Import undone','success');\n  if(IM.step)imRender();else refreshCurrent();\n}",
    "  b.undone=new Date().toISOString();imSaveBatches(all);\n  return {removed:Object.keys(gone).length,restored:reverted,kept:keepAdded};\n}")
sub('function imStep4(){','function imStep4Base(){')
sub("""'<button class="im-btn gold" onclick="imClose()">View collection</button><button class="im-btn line red" onclick="imUndo(\\''+b.id+'\\')">Undo this import</button></div>';""",
    """'<button class="im-btn gold" onclick="imClose()">View collection</button><button class="im-btn line red" onclick="imUndo(\\''+b.id+'\\')">\\u21b6 Undo this import</button><p class="im-lead un-note">You can undo this for 30 days.</p>'+unRecentCard()+'</div>';""")
sub("""  if(lb&&!lb.undone)h+='<div class="im-card"><div class="im-cap">Last import</div><div class="im-txt">'+imE(new Date(lb.at).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+' \\u00b7 '+lb.added.length+' added \\u00b7 '+lb.changed.length+' updated</div><button class="im-btn line red" onclick="imUndo(\\''+lb.id+'\\')">Undo last import</button></div>';""",
    """  h+=unRecentCard();""")
js=js.rstrip()+'\n'+open(T+'p23_undo.js').read()+'\n'
