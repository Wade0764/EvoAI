# v37/v38/v39: headings + collection crest + final logo preview into publish-cloud-preview-headings/ without touching evoai-cloud.html
import os,shutil
D='/workspace/vehicle-app/cloud/';P=D+'publish-cloud-preview-headings/'
src=open(D+'tools/build_cloud.py').read().replace("OUT='/workspace/vehicle-app/cloud/evoai-cloud.html'","OUT='"+P+"index.html'")
src=src.replace("exec(open(T+'patches_binder.py').read())","exec(open(T+'patches_binder.py').read())\nexec(open(T+'patches_emerald.py').read())\nexec(open(T+'patches_todo.py').read())\nexec(open(T+'patches_headings.py').read())\nexec(open(T+'patches_collname.py').read())\nexec(open(T+'patches_logo.py').read())")
os.makedirs(P+'icons',exist_ok=True)
import subprocess
assert subprocess.run(['python3',D+'tools/gen_logo.py',P[:-1]]).returncode==0,'gen_logo failed (waiting for final/ files?)'
exec(compile(src,'build_cloud_preview','exec'))
for f in ('manifest.webmanifest','sw.js'):shutil.copy(D+'publish-cloud-next20/'+f,P+f)
if os.path.isdir(P+'icons'):shutil.rmtree(P+'icons')
shutil.copytree(D+'icons',P+'icons')
import re
s=open(P+'sw.js').read();s=re.sub(r"var CACHE='[^']*'","var CACHE='evoai-shell-v36-logo'",s);open(P+'sw.js','w').write(s)
# v39: icons from Desi's final exports (after the old icons copy above), manifest + sw shell list
import subprocess,json as _j
r=subprocess.run(['python3',D+'tools/gen_logo.py',P[:-1]]);assert r.returncode==0,'gen_logo failed'
m=_j.load(open(P+'manifest.webmanifest'))
m['icons']=[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},
 {"src":"icons/icon-maskable-192.png","sizes":"192x192","type":"image/png","purpose":"maskable"},{"src":"icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]
open(P+'manifest.webmanifest','w').write(_j.dumps(m,indent=2))
s=open(P+'sw.js').read();s=s.replace("'icons/icon-maskable-512.png']","'icons/icon-maskable-512.png','icons/icon-maskable-192.png','icons/favicon.ico']");open(P+'sw.js','w').write(s)
