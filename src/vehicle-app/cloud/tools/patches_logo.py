# ===== v39 (p39): final EvoAI logo (Desi, evoai-logo-gt/final/). Needs tools/logo_build/* from tools/gen_logo.py =====
import os
_LB=os.environ.get('LOGO_BUILD',T+'logo_build/')
if not os.path.isfile(_LB+'ring.json'):raise SystemExit('p39_logo: run tools/gen_logo.py first')
import json as _jj;_m=_jj.load(open(_LB+'meta.json'))
_v=':root{--evo-emblem:url(data:image/webp;base64,'+open(_LB+'emblem.webp.b64.txt').read().strip()+');--evo-centre:url(data:image/webp;base64,'+open(_LB+'centre.webp.b64.txt').read().strip()+')}\n'
sub('</style>\n</head>',_v+open(T+'p39_logo.css').read().replace('@W@','%.2f'%(_m['centre_frac']*100)).replace('@IN@','%.2f'%((1-_m['centre_frac'])*50))+'\n</style>\n</head>','html')
sub('<i class="evo-wm" aria-hidden="true"></i>','<div class="evo-wmt" aria-hidden="true">EVOAI</div>','html')
sub('<i class="evo-lockup evo-lockup-nt" role="img" aria-label="EvoAI"></i>','<i class="evo-lockup evo-lg-new" role="img" aria-label="EvoAI"></i><div class="evo-wmt" aria-hidden="true">EVOAI</div>','html')
sub('<link rel="icon" type="image/png" sizes="32x32"','<link rel="icon" href="icons/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32"','html')
js=js.rstrip()+'\n// ============ v39 logo (p39): loader ring = final dotted ring (Desi), centre = obsidian/emerald-star disc ============\nEVR_D='+open(_LB+'ring.json').read().strip()+';EVR.svg=\'\';\n(function(){var b=document.getElementById(\'boot-ring\');if(b&&b.firstChild)b.innerHTML=evoRingSVG()+\'<i class="evo-o"></i>\';})();\n'
sub('<div class="va-row">','<div class="va-row"><span class="va-brand" role="img" aria-label="EvoAI"><i aria-hidden="true"></i><b aria-hidden="true">EVOAI</b></span>','html')
