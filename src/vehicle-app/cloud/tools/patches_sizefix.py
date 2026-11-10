# ===== v17 (F): photo size fix, ported from the v16b hotfix (publish-cloud-next4b/SIZEFIX_NOTES.md).
# Always decode + shrink first (pfDecode honours EXIF orientation), check size only on the output, re-encode smaller. Never block on input size.
def _body(name):
  i=js.index("function "+name+"(");j=js.index("\n}\n",i)+3;return i,j
i,j=_body("readResized")
js=js[:i]+"""function readResized(file,input,cb){
  if(!(file.type&&file.type.indexOf('image/')===0)&&!(!file.type&&/\\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''))){showToast('Please choose a photo (image file)','error');if(input)input.value='';return;}
  shrinkPhotoToDataUrl(file,MAX_PHOTO_DIM,MAX_PHOTO_BYTES,'#fff').then(cb,function(e){photoShrinkError(e);if(input)input.value='';});
}
"""+js[j:]
i,j=_body("handleVehicleImage")
js=js[:i]+"""// v16b/v17 size fix helpers: shrink first, check only the output
function photoShrinkError(e){showToast(e&&e.message==='decode'?'This image format is not supported here. Try a JPEG or PNG.':'Could not read this photo','error');}
function blobToDataUrl(b){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=function(){rej(new Error('read'));};r.readAsDataURL(b);});}
async function shrinkPhotoBlob(file,maxDim,maxBytes,bg){
  var d=await pfDecode(file).catch(function(){throw new Error('decode');});
  try{
    var dim=Math.min(maxDim,Math.max(d.w,d.h)),last=null,Q=[0.8,0.7,0.6,0.5,0.4];
    for(var s=0;s<8;s++){
      for(var i=0;i<Q.length;i++){last=await pfEncode(d,dim,Q[i],bg);if(last.size<=maxBytes)return last;}
      dim=Math.max(64,Math.round(dim*0.75));
    }
    return last;
  }finally{d.done();}
}
function shrinkPhotoToDataUrl(file,maxDim,maxBytes,bg){return shrinkPhotoBlob(file,maxDim,maxBytes,bg).then(blobToDataUrl);}
function handleVehicleImage(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  if(file.type&&file.type.indexOf('image/')!==0){showToast('Please choose an image file','error');input.value='';return;}
  shrinkPhotoToDataUrl(file,MAX_PHOTO_DIM,MAX_PHOTO_BYTES,'#000').then(function(out){
    pendingVehicleImage=out;
    autoIdIdentify(out);
    var ps=document.getElementById('v-img-preview-src');if(ps)ps.src=out;
    showEl('v-img-preview',true);
    showToast('Photo ready ('+Math.round(dataUrlBytes(out)/1024)+' KB)','success');
  },function(e){photoShrinkError(e);input.value='';});
}
"""+js[j:]
sub("function pfEncode(d,max,q){","function pfEncode(d,max,q,bg){")
sub("    x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;","    x.fillStyle=bg||'#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;")
sub("  if(file.size>40*1024*1024)throw new Error('toolarge');\n","")
sub("    var orig=keep?file:await pfEncode(d,4096,0.92);","""    var orig=keep?file:null;
    if(!orig){var PF_ORIG_MAX=14*1024*1024,dm=Math.min(4096,Math.max(d.w,d.h));
      outer:for(var s=0;s<6;s++){for(var qi=0,Q=[0.92,0.85,0.75,0.65];qi<Q.length;qi++){var b=await pfEncode(d,dm,Q[qi]);if(b.size<=PF_ORIG_MAX){orig=b;break outer;}}dm=Math.round(dm*0.75);}
      if(!orig)orig=await pfEncode(d,1600,0.8);}""")
