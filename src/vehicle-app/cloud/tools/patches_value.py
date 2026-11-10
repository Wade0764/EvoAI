# ===== health score (local) + AI value estimate: patches on the built JS/HTML. exec'd from build_cloud.py =====
# 1) loader: mid, notes, previous estimate (delta), object sources; health comes from the device, never from rows
sub("var mid=Math.round((Number(e.value_low)+Number(e.value_high))/2);",
    "var mid=(e.value_mid!==null&&e.value_mid!==undefined&&Number(e.value_mid)>0)?Math.round(Number(e.value_mid)):Math.round((Number(e.value_low)+Number(e.value_high))/2);var prevAi=v.aiValue;")
sub("sources:strList(e.sources,8),confidence:e.confidence===null?'':Number(e.confidence)};",
    "sources:srcObjList(e.sources,8),notes:cleanText(e.notes,400),confidence:e.confidence===null?'':Number(e.confidence),prev:prevAi?prevAi.value:null,prevAsOf:prevAi?prevAi.asOf:''};")
sub("      }else if(e.kind==='health'&&e.health_score!==null){\n        v.aiHealth={score:e.health_score,reasons:strList(e.reasons,8),asOf:String(e.as_of).slice(0,10)};\n      }","      }")
sub("    if(v.aiHealth)v.status=v.aiHealth.score>=85?'green':(v.aiHealth.score>=60?'yellow':'red');\n","")
# 2) replace the placeholder-era helpers with the p5 versions
for _n in ['aiVal','aiHealth','aiConfigured','pendingBig','totalMoney','portfolioTotals','avgHealth','deltaText','pendingNote','deltaHTML','aiValueMeta','aiPanelHTML','refreshAI']:
    replace_fn(_n)
sub("var AI_PENDING='Calculated by AI once connected';","var AI_PENDING='No estimate yet';")
# 3) vehicle page, overview, valuations, cards, briefs
sub("'<div class=\"lab\">Current value</div><div class=\"num\">'+(hasV?bigNum(g.value):pendingBig())+'</div>'","valueHeadHTML(v,g)")
sub("+(hasV?'<div class=\"doc-meta\" style=\"margin-top:6px;\">'+esc(aiValueMeta(v))+'</div>':''));","+'');")
sub("cell('Health',hs===null?'Pending':hs+' / 100')","cell('Health',hs===null?'--':hs+' / 100')")
sub("row('Unrealized gain / loss',(hasPP&&hasV)?'<span class=\"'+(g.gain>=0?'pos':'neg')+'\">'+money(g.gain)+' ('+esc(pct(g.pctGain))+')</span>':'Pending')","row('Unrealized gain / loss',(hasPP&&hasV)?'<span class=\"'+(g.gain>=0?'pos':'neg')+'\">'+money(g.gain)+' ('+esc(pct(g.pctGain))+')</span>':'--')")
sub("elHTML(n+'-total-value',(t.nValued||!t.nPending)?bigNum(t.value):pendingBig());","elHTML(n+'-total-value',valueOverviewNum(t));valueEnsureProbe();")
sub("elText(n+'-avg-health',ahv===null?(vehicles.length?'Pending':'--'):String(ahv));","elText(n+'-avg-health',ahv===null?'--':String(ahv));")
sub("(t.nPending?'<div class=\"stat-delta muted\">'+t.nPending+' pending</div>':'')","(t.nPending?'<div class=\"stat-delta muted\">'+t.nPending+' without an estimate</div>':(t.nValued?'<div class=\"stat-delta muted\">Estimate, range '+money(t.low)+' to '+money(t.high)+'</div>':''))")
sub("(t.basis>0?money(t.gain):'Pending')","(t.basis>0?money(t.gain):'--')")
sub("'<span style=\"color:var(--text-muted);\">Pending</span><small>'+AI_PENDING+'</small>'","'<span style=\"color:var(--text-muted);\">--</span><small>'+esc(noValueText(t))+'</small>'")
sub("money(g.value)+'<small>'+esc('Updated '+fmtDate(v.aiValue.asOf))+'</small>'","money(g.value)+'<small>'+esc('Estimate, as of '+fmtDate(v.aiValue.asOf))+'</small>'")
sub("(hasV?money(aiVal(v)):'Pending')","(hasV?money(aiVal(v)):'No estimate')")
sub("'. Values are '+AI_PENDING.toLowerCase()+'.'","'. '+noValueText()+'.'")
sub("the '+(vs.length-nPend)+' with an AI value total","the '+(vs.length-nPend)+' with an estimated value total")
sub("facts.push('Health score (AI): '+aiHealth(v)+' of 100');else facts.push('Health score: pending');","facts.push('Health score: '+aiHealth(v)+' of 100 (calculated from records)');else facts.push('Health score: not shared');")
sub("facts.push(ahb===null?'Average health score: pending':'Average health score (AI): '+ahb+' of 100');","facts.push(ahb===null?'Average health score: not available':'Average health score: '+ahb+' of 100 (calculated from records)');")
sub("['view_health_estimate','AI health score'],","['view_health_estimate','Health score'],")
sub("Current value and health score are calculated by AI once connected. They are read-only and cannot be typed in.","Value is an AI estimate from market prices and the health score is calculated from your records. Both are read-only and can never be typed in.",where='html')
sub("p1.push('The current value of '+name+' is calculated by AI once connected.');missing.push('AI value (pending)');","p1.push(aiVal(v)===null?(noValueText()+' for '+name+'.'):('The current value of '+name+' is an estimate.'));missing.push('value estimate');")
sub(" Values are calculated by AI once connected.');}","');}")
