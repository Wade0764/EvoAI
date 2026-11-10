# ===== v17: co-owners (p16) + "Estimate, not an appraisal" lines + auto-estimate after photo upload. exec'd after patches_charts =====
sub(",ovLoad()]);",",ovLoad(),cmLoad()]);")
sub("vis:res[14],ov:res[15]||[]};","vis:res[14],ov:res[15]||[]};CO.rows=res[16]||[];CO.of=coOfRows(CO.rows,me0);")
sub("  if(mine.role==='owner'){addClientRow(mine,true);}",
    "  if(mine.role==='owner'){if(CO.of&&profMap[CO.of])addClientRow(profMap[CO.of],true);else if(CO.of){seenC[CO.of]=1;cl.push({id:CO.of,name:'Collection',email:'',phone:'',location:'',createdAt:'',linked:true,canAdd:true});}else addClientRow(mine,true);}")
sub("function ownerClientId(){var a=me();return (a&&a.role==='owner')?(a.clientId||null):null;}",
    "function ownerClientId(){var a=me();return (a&&a.role==='owner')?((typeof CO!=='undefined'&&CO.of)||a.clientId||null):null;}")
sub("  elHTML('access-body',h);","  elHTML('access-body',h);coRender();")
sub("  if(d.kind==='transfer')return 'The vehicle is now in your collection.';","  if(d.kind==='transfer')return 'The vehicle is now in your collection.';\n  if(d.kind==='co_owner')return 'You are now a co-owner of this collection.';")
# (A) visible "Estimate, not an appraisal" line next to AI values in the stat cards (vehicle page + chart headline are in p14)
for _old in ["'<div class=\"stat-card\"><div class=\"stat-value\">'+totalMoney(t)+'</div><div class=\"stat-label\">Collection value</div>'+"]:
    n=js.count(_old)
    if n<1:errs.append('stat card missing')
    js=js.replace(_old,_old+"(t.nValued>t.nOwner?'<div class=\"ai-disc\">Estimate, not an appraisal</div>':'')+")
# (C) photos uploaded to a car with no estimate yet -> quiet background estimate
sub("      refreshCurrent();refreshDetailIfOpen();\n      var allManual=","      refreshCurrent();refreshDetailIfOpen();\n      try{var _vv=byId(getVehicles(),v.id);if(_vv&&!(_vv.aiValue&&Number(_vv.aiValue.value)>0))valueAutoQueue(v.id,300);}catch(e){}\n      var allManual=")
js=js.rstrip()+'\n'+open(T+'p16_coowners.js').read()+'\n'
# owner checks in the client: a co-owner is a real owner of the collection's cars
sub("function isRealOwnerOf(v){return !!(v&&v.clientId&&v.clientId===myId());}","function isRealOwnerOf(v){return !!(v&&v.clientId&&(v.clientId===myId()||(typeof CO!=='undefined'&&CO.of&&v.clientId===CO.of)));}")
sub("  if(clientId===myId())return true;","  if(clientId===myId()||(typeof CO!=='undefined'&&CO.of&&clientId===CO.of))return true;")
sub("(realAdmin()||d.clientId===myId()||managedMine(d.clientId))","(realAdmin()||d.clientId===myId()||(typeof CO!=='undefined'&&CO.of&&d.clientId===CO.of)||managedMine(d.clientId))")
