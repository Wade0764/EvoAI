// v31 inspection report: one-line step label + bar, owner gets no client picker, single car preselected
var INSP_STEPS=['Vehicle','Work done','Vitals','Condition','Notes'];
function inspProg(step){
  var l=document.getElementById('ins-prog-lbl'),b=document.getElementById('ins-bar-fill');
  if(l)l.innerHTML='Step '+(step+1)+' of '+INSP_STEPS.length+' &middot; <b>'+INSP_STEPS[step]+'</b>';
  if(b)b.style.width=((step+1)/INSP_STEPS.length*100)+'%';
}
function inspOwnerMode(){
  var own=isOwner(),g=document.getElementById('insp-client-group');
  if(g)g.style.display=own?'none':'';
  var ti=document.getElementById('insp-tech'),tl=ti&&ti.parentNode.querySelector('label');if(tl)tl.textContent=own?'Done by':'Tech';
  var intro=document.getElementById('ins-intro');
  if(intro)intro.textContent=own?'Write down a check-up you did on your car: work done, battery and tyre readings, condition and notes. It is saved to the car\u2019s service history. This does not book or request an inspection.':'Record a check-up visit on a client\u2019s car: work done, battery and tyre readings, condition and notes. It is saved to the car\u2019s service history and the owner can read it. This does not book or request an inspection.';
  return own;
}
function inspPickOnly(){
  var s=document.getElementById('insp-vehicle');if(!s||s.value)return;
  var o=[].filter.call(s.options,function(x){return x.value;});
  if(o.length===1)s.value=o[0].value;
}
