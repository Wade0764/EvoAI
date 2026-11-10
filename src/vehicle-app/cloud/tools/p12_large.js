// ============ v15: animated gold dot-spiral ring loader (approved round6 logo) ============
// The gold ring rotates gently while a pulse travels round it dot-sector by dot-sector; the Evolve O stays still.
var EVR={svg:''};
function evoRingSVG(){
  if(EVR.svg)return EVR.svg;
  var N=12,g=[],i;for(i=0;i<N;i++)g.push([]);
  for(i=0;i<EVR_D.length;i+=4){var x=EVR_D[i],y=EVR_D[i+1],a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=2*Math.PI;
    g[Math.floor(a/(2*Math.PI)*N)%N].push('<circle cx="'+x+'" cy="'+y+'" r="'+(EVR_D[i+2]/2)+'"'+(EVR_D[i+3]<100?' fill-opacity="'+(EVR_D[i+3]/100)+'"':'')+'/>');}
  EVR.svg='<svg class="evr-svg" viewBox="-2170 -2170 4340 4340" aria-hidden="true" focusable="false"><g class="evr-rot" fill="url(#evr-g)">'+
    g.map(function(c,k){return '<g class="evr-s" style="animation-delay:'+(k*0.14).toFixed(2)+'s">'+c.join('')+'</g>';}).join('')+'</g></svg>';
  return EVR.svg;
}
function evoSpinHTML(cls,label){
  return '<span class="evo-spin '+(cls||'')+'"'+(label?' role="img" aria-label="'+esc(label)+'"':' aria-hidden="true"')+'>'+evoRingSVG()+'<i class="evo-o"></i></span>';
}
function evoInit(){
  if(!document.getElementById('evr-defs')&&document.body){var d=document.createElement('div');d.id='evr-defs';d.setAttribute('aria-hidden','true');
    d.innerHTML='<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" focusable="false"><defs>'+EVR_GRAD+'</defs></svg>';document.body.insertBefore(d,document.body.firstChild);}
  var b=document.getElementById('boot-ring');if(b&&!b.firstChild)b.innerHTML=evoRingSVG()+'<i class="evo-o"></i>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',evoInit);else evoInit();
