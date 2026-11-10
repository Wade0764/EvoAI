#!/usr/bin/env python3
"""v39 logo pipeline. Sources ONLY /workspace/evoai-logo-gt/final/ (Desi's final exports; concept files never used).
Uses Desi's PNG exports directly; only derives what was not exported (favicon-16, iOS intermediate sizes, in-app webp, loader ring data)."""
import os,sys,io,re,base64,json,shutil,cairosvg
from PIL import Image,ImageDraw
SRC='/workspace/evoai-logo-gt/final/'
PREV=sys.argv[1] if len(sys.argv)>1 else '/workspace/vehicle-app/cloud/publish-cloud-preview-headings'
OUT=os.environ.get('LOGO_BUILD',os.path.dirname(os.path.abspath(__file__))+'/logo_build/')
need=['app-icon-512.png','app-icon-192.png','app-icon-180.png','favicon-16.png','favicon-32.png','favicon.ico','maskable-512.png','maskable-192.png','emblem-transparent-512.png','src-emblem-transparent.svg','src-center.svg','ios/Contents.json']
miss=[f for f in need if not os.path.isfile(SRC+f)]
if miss:print('WAITING: missing in final/: '+', '.join(miss));sys.exit(3)
os.makedirs(OUT,exist_ok=True);I=PREV+'/icons/'
# --- web icons: Desi's exports as-is
for a,b in [('app-icon-192.png','icon-192.png'),('app-icon-512.png','icon-512.png'),('maskable-512.png','icon-maskable-512.png'),('maskable-192.png','icon-maskable-192.png'),('app-icon-180.png','apple-touch-icon.png'),('favicon-16.png','favicon-16.png'),('favicon-32.png','favicon-32.png'),('favicon.ico','favicon.ico')]:
    shutil.copy(SRC+a,I+b)
# --- iOS AppIcon set: Desi's ios/ folder as-is
if os.path.isdir(I+'ios'):shutil.rmtree(I+'ios')
shutil.copytree(SRC+'ios',I+'ios')
# --- in-app rasters (webp, base64)
def b64(im,px,name):
    b=io.BytesIO();im.resize((px,px),Image.LANCZOS).save(b,'WEBP',quality=90,method=6);open(OUT+name,'w').write(base64.b64encode(b.getvalue()).decode());return len(b.getvalue())
b64(Image.open(SRC+'emblem-transparent-512.png').convert('RGBA'),360,'emblem.webp.b64.txt')
# centre disc = src-center.svg (Desi). In the emblem the centre group is <circle r="126"> inside scale(sc)
s=open(SRC+'src-emblem-transparent.svg').read()
sc=float(re.search(r'<g transform="scale\(([\d.]+)\)">',s).group(1))
cr=float(re.search(r'<g id="center"><circle r="([\d.]+)"',s).group(1));rd=cr*sc/400
cs=open(SRC+'src-center.svg').read();csc=float(re.search(r'<g transform="scale\(([\d.]+)\)">',cs).group(1))
px=1024;C=Image.open(io.BytesIO(cairosvg.svg2png(url=SRC+'src-center.svg',output_width=px,output_height=px))).convert('RGBA')
f=cr*csc/400;r=int(round(f*px));c=px//2
if r<c:C=C.crop((c-r,c-r,c+r,c+r))
m=Image.new('L',C.size,0);ImageDraw.Draw(m).ellipse((0,0,C.size[0]-1,C.size[1]-1),fill=255);C.putalpha(Image.composite(C.getchannel('A'),m,m))
b64(C,320,'centre.webp.b64.txt')
# loader ring: Wade's original dots from <g id="ring-vector"> -> EVR_D (x,y,2r,opacity%) in the -2170..2170 loader viewBox
rv=re.search(r'<g id="ring-vector">(.*?)</g>',s,re.S).group(1)
K=2170/200*sc;d=[]
for cx,cy,rr in re.findall(r'<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"',rv):
    d+=[round(float(cx)*K),round(float(cy)*K),round(float(rr)*2*K),100]
open(OUT+'ring.json','w').write(json.dumps(d,separators=(',',':')))
json.dump({'centre_frac':rd*2,'dots':len(d)//4},open(OUT+'meta.json','w'))
print('OK',len(d)//4,'ring dots; centre',round(rd*2,4),'->',I)
