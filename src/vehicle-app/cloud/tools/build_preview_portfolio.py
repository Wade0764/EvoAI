# v33: build the portfolio-pick preview into publish-cloud-preview-portfolio/ without touching evoai-cloud.html
import os,shutil
D='/workspace/vehicle-app/cloud/';P=D+'publish-cloud-preview-portfolio/'
src=open(D+'tools/build_cloud.py').read().replace("OUT='/workspace/vehicle-app/cloud/evoai-cloud.html'","OUT='"+P+"index.html'")
os.makedirs(P,exist_ok=True)
exec(compile(src,'build_cloud_preview','exec'))
for f in ('manifest.webmanifest','sw.js'):shutil.copy(D+f,P+f)
if os.path.isdir(P+'icons'):shutil.rmtree(P+'icons')
shutil.copytree(D+'icons',P+'icons')
