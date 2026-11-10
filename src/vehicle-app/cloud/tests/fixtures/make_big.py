# 8064x6048 noisy JPEG, ~30 MB (iPhone 48 MP sized). Used by tests/sizefix.js.
import numpy as np,sys
from PIL import Image
W,H=8064,6048;y,x=np.mgrid[0:H,0:W]
b=np.stack([(x*255//W),(y*255//H),((x+y)*255//(W+H))],-1).astype(np.int16)
Image.fromarray(np.clip(b+np.random.default_rng(1).integers(-60,60,(H,W,3)),0,255).astype(np.uint8)).save(sys.argv[1],quality=90)
