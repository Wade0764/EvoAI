# ===== v17: value chart (p14). exec'd last in build_cloud.py, after patches_vehicle =====
sub('</style>\n</head>',open(T+'charts.css').read()+'\n</style>\n</head>','html')
# collection: chart host at the top of the hero, the Collection brief moves directly under it
for _h,_c in (('cp','cp'),('dash','ph')):
    sub('<section class="hero" id="'+_h+'-hero">\n        <div class="hero-grid">','<section class="hero" id="'+_h+'-hero">\n        <div class="vch-host" id="'+_h+'-vch"></div>\n        <div class="hero-grid">','html')
    sub('        <section id="'+_h+'-brief"></section>\n','','html')
    sub('<div class="hero-chart" id="'+_c+'-chart"></div>\n        </div>\n','<div class="hero-chart" id="'+_c+'-chart"></div>\n        </div>\n        <section id="'+_h+'-brief" class="vch-brief"></section>\n','html')
sub('<div class="stats-grid" id="cd-stats"></div>','<div class="stats-grid" id="cd-stats"></div>\n      <div class="vch-host" id="cd-vch"></div><section id="cd-brief" class="vch-brief"></section>','html')
sub('        <section id="cd-brief"></section>\n','','html')
sub('<div class="cols2" style="margin-top:0">','<div class="cols2 vch-one" style="margin-top:0">','html')
sub('<div class="cols2" id="cp-cols">','<div class="cols2 vch-one" id="cp-cols">','html')
sub('<div class="cols2" id="dash-cols">','<div class="cols2 vch-one" id="dash-cols">','html')
sub("  elHTML(n+'-chart',portfolioChartHTML(vehicles,t.gain));","  elHTML(n+'-chart',portfolioChartHTML(vehicles,t.gain));vchRenderCollection(p,vehicles);")
sub("  elHTML('cd-brief',collectionBrief(vehicles));","  elHTML('cd-brief',collectionBrief(vehicles));vchRenderCollection('cd',vehicles);")
# vehicle page: chart inside the one value block
sub("  var rl=document.getElementById('vd-rep');if(rl)rl.remove();","  vchRenderVehicle(v);\n  var rl=document.getElementById('vd-rep');if(rl)rl.remove();")
# swipe-back: a drag that starts on the chart scrubs, it never claims the back gesture
sub("if(e.clientX>SWB.edge+sal())return;","if(e.clientX>SWB.edge+sal())return;\n    if(e.target&&e.target.closest&&e.target.closest('.vch-plot'))return;")
sub("var p=e.touches[0];if(p.clientX>SWB.edge+sal()){SWB.claim=null;return;}","var p=e.touches[0];if(p.clientX>SWB.edge+sal()){SWB.claim=null;return;}\n    if(e.target&&e.target.closest&&e.target.closest('.vch-plot')){SWB.claim=null;return;}")
js=js.rstrip()+'\n'+open(T+'p14_charts.js').read()+'\n'
# ---- v17: auto estimate after any vehicle add (manual / VIN / photo all use KIND.vehicles.insert) + pull-to-refresh ----
sub("      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);","      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);try{valueAutoQueue(v.id);}catch(e){}")
js=js.rstrip()+'\n'+open(T+'p15_autoval.js').read()+'\n'
# local calendar day of each estimate (as_of is a UTC timestamp; an evening estimate in New York must not show as tomorrow)
sub("        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true});","        v.valueLog.push({date:String(e.as_of).slice(0,10),value:mid,source:'AI',ai:true,ts:e.as_of});")
sub("asOf:String(e.as_of).slice(0,10),sources:srcObjList","asOf:(function(t){t=new Date(e.as_of);return isNaN(t.getTime())||!/T\\d/.test(String(e.as_of))?String(e.as_of).slice(0,10):isoLocal(t);})(),sources:srcObjList")
