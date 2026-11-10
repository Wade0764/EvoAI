# v36b: brighter-ring logo preview -> publish-cloud-preview-logo2/ (live folder, cloud/icons, tools/logo_build untouched)
import os,re,shutil,subprocess
D='/workspace/vehicle-app/cloud/';P=D+'publish-cloud-preview-logo2/';LB='/tmp/logo2_build/'
os.environ['LOGO_BUILD']=LB;os.makedirs(LB,exist_ok=True);os.makedirs(P+'icons',exist_ok=True)
src=open(D+'tools/build_cloud.py').read()
src='\n'.join(l for l in src.split('\n') if not re.search(r"exec\(open\(T\+'patches_(requests|p40)",l))  # never pull another worker's patch in
assert "patches_logo.py" in src
src=re.sub(r"(exec\(open\(T\+'patches_logo.py'\).read\(\)\)[^\n]*)",r"\1\nexec(open(T+'patches_splash.py').read())",src,count=1)
assert "patches_splash.py" in src
src=src.replace("OUT='/workspace/vehicle-app/cloud/evoai-cloud.html'","OUT='"+P+"index.html'")
assert subprocess.run(['python3',D+'tools/gen_logo.py',P[:-1]]).returncode==0
exec(compile(src,'build_cloud_logo2','exec'))
H=D+'publish-cloud-preview-headings/'
for f in ('manifest.webmanifest','sw.js'):shutil.copy(H+f,P+f)
s=open(P+'sw.js').read();s=re.sub(r"var CACHE='[^']*'","var CACHE='evoai-shell-v36b-ring'",s);open(P+'sw.js','w').write(s)
