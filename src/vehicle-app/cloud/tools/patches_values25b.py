# ===== v25b: value queue, Refresh values now, review flags (p25b). exec'd after patches_presshold =====
sub('</style>\n</head>',open(T+'values25b.css').read()+'\n</style>\n</head>','html')
sub("        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true,ts:e.as_of});",
"        var _rv=(e.inputs&&Object.prototype.toString.call(e.inputs.review)==='[object Array]'&&e.inputs.review.length)?e.inputs.review.slice(0,4).map(function(x){return String(x).slice(0,80);}):null;\n        if(_rv&&v.aiValue&&!v.aiValue.review){v.aiReview={value:mid,asOf:String(e.as_of).slice(0,10),why:_rv};continue;}\n        if(!_rv)v.aiReview=null;v._lastRv=_rv;\n        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true,ts:e.as_of,key:e.cache_key||'',review:!!_rv});")
sub("    ovApply(v,rows.ov);msLoad(v,r,x,fin);poApplyRow(v,r);","    valFinish25(v);ovApply(v,rows.ov);msLoad(v,r,x,fin);poApplyRow(v,r);")
sub("call=Promise.resolve(sb.functions.invoke('estimate-value',{body:{vehicle_id:vid}}));","call=Promise.resolve(sb.functions.invoke('estimate-value',{body:valBody25(vid)}));")
sub("    done();\n    if(!data||typeof data!=='object'||!(Number(data.mid)>0)){","    done();\n    if(data&&data.skipped){valueRerender();return;}\n    if(!data||typeof data!=='object'||!(Number(data.mid)>0)){")
js=js.rstrip()+'\n'+open(T+'p25b_values.js').read()+'\n'
