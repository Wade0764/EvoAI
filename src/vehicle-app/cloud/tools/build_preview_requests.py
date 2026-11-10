# v40 (p40): client requests + comments + Overview option C on top of live v36b (logo2 chain incl. splash) -> publish-cloud-preview-requests/ (live build_cloud.py untouched)
import os,shutil,re,subprocess
D='/workspace/vehicle-app/cloud/';P=os.environ.get('REQ_OUT',D+'publish-cloud-preview-requests/');L2=D+'publish-cloud-preview-logo2/'
src=open(D+'tools/build_cloud.py').read()
src='\n'.join(l for l in src.split('\n') if not re.search(r"exec\(open\(T\+'patches_(requests|p40)",l))
k="exec(open(T+'patches_logo.py').read())"
assert k in src
src=re.sub(r"(exec\(open\(T\+'patches_logo.py'\).read\(\)\)[^\n]*)",lambda m:m.group(1)+"\nexec(open(T+'patches_splash.py').read())\nexec(open(T+'patches_requests.py').read())  # v40 requests (p40)",src,count=1)
src=src.replace("OUT='/workspace/vehicle-app/cloud/evoai-cloud.html'","OUT='"+P+"index.html'")
os.makedirs(P+'icons',exist_ok=True)
os.environ['LOGO_BUILD']='/tmp/logo2_build_req/';os.makedirs('/tmp/logo2_build_req/',exist_ok=True)
assert subprocess.run(['python3',D+'tools/gen_logo.py',P[:-1]]).returncode==0
exec(compile(src,'build_cloud_preview_requests','exec'))
for f in ('manifest.webmanifest','sw.js'):shutil.copy(L2+f,P+f)
for f in os.listdir(L2):
    if f.endswith(('.png','.webp','.ico','.svg')):shutil.copy(L2+f,P+f)
s=open(P+'sw.js').read();s=re.sub(r"var CACHE='[^']*'","var CACHE='evoai-shell-v37-requests'",s);open(P+'sw.js','w').write(s)
