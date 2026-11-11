# v37/v38: build the headings + collection crest preview into publish-cloud-preview-headings/ without touching evoai-cloud.html
import os,shutil
D='/workspace/vehicle-app/cloud/';P=D+'publish-cloud-preview-headings/'
src=open(D+'tools/build_cloud.py').read().replace("OUT='/workspace/vehicle-app/cloud/evoai-cloud.html'","OUT='"+P+"index.html'")
src=src.replace("exec(open(T+'patches_binder.py').read())","exec(open(T+'patches_binder.py').read())\nexec(open(T+'patches_emerald.py').read())\nexec(open(T+'patches_todo.py').read())\nexec(open(T+'patches_headings.py').read())\nexec(open(T+'patches_collname.py').read())")
os.makedirs(P,exist_ok=True)
exec(compile(src,'build_cloud_preview','exec'))
for f in ('manifest.webmanifest','sw.js'):shutil.copy(D+'publish-cloud-next20/'+f,P+f)
if os.path.isdir(P+'icons'):shutil.rmtree(P+'icons')
shutil.copytree(D+'icons',P+'icons')
import re
s=open(P+'sw.js').read();s=re.sub(r"var CACHE='[^']*'","var CACHE='evoai-shell-v35-collname'",s);open(P+'sw.js','w').write(s)
