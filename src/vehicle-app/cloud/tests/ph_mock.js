// Mockups for press-and-hold on the owner home hero carousel. Not part of run_all.
const L=require('./lib.js');const fs=require('fs');const P=__dirname+'/../tools/patches/';const SO=__dirname+'/../screens/';
const W=fs.readFileSync(__dirname+'/wade_import.js','utf8');const OW='b0000000-0000-4000-a000-000000000002';const ID=i=>'e2000000-0000-4000-a000-0000000000'+String(i).padStart(2,'0');
let CARS,BASE;{const O=OW;eval(W.slice(W.indexOf('const CARS='),W.indexOf('async function serve')).replace('const CARS=','CARS=').replace('const BASE=','BASE=').replace("[2006,'Bentley'","[2007,'Bentley'"));}
(async()=>{await L.launch();
const shots=['ph-01-hold','ph-02-actions','ph-03-move','ph-04-remove','ph-05-undo'];
for(let k=0;k<shots.length;k++){
 const p=await L.open({dsf:2,pre:BASE});await L.login(p,'olivia@test.com');await L.sleep(900);
 await p.evaluate(fs.readFileSync(P+'ph_mock.js','utf8'));
 const info=await p.evaluate(async(k)=>{
  var wh=document.querySelector('.whl');if(wh)wh.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,300));var cards=[].slice.call(document.querySelectorAll('.whl-card'));if(!cards.length)return 'no wheel';
  // turn to the Bentley if there is one
  var vs=getVehicles(),bi=-1;cards.forEach(function(c,i){var v=byId(vs,c.dataset.id);if(v&&/Bentley/.test(v.make))bi=i;});
  var arrow=document.querySelector('.whl-arrow[data-d="1"]');for(var t=0;t<bi&&arrow;t++){arrow.click();await new Promise(r=>setTimeout(r,90));}
  await new Promise(r=>setTimeout(r,900));
  var c=cards[bi>=0?bi:0],v=byId(vs,c.dataset.id),name=(v.year+' '+v.make+' '+v.model).trim(),img=(typeof imgSrc==='function'&&imgSrc(v))||'';
  var sheet=function(inner){var s=document.createElement('div');s.className='ph-scrim';document.body.appendChild(s);var d=document.createElement('div');d.className='ph-sheet';d.setAttribute('role','dialog');d.innerHTML='<div class="ph-grab"></div>'+inner;document.body.appendChild(d);};
  var head='<div class="ph-car"><div class="ph-thumb" style="'+(img?'background-image:url('+img+')':'')+'"></div><div><b>'+name+'</b><span>'+(PO&&PO.on?(poOf(v,v.clientId)||{}).name||'My collection':'My collection')+'</span></div></div>';
  if(k===0){c.classList.add('ph-hold');var st=document.querySelector('.whl-stage');var r=document.createElement('div');r.innerHTML='<svg class="ph-ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" stroke="rgba(255,255,255,.25)"/><circle cx="42" cy="42" r="36" stroke="#C9AA6B" stroke-linecap="round" stroke-dasharray="226" stroke-dashoffset="70" transform="rotate(-90 42 42)"/></svg><div class="ph-tip">Keep holding\u2026</div>';st.appendChild(r.firstChild);st.appendChild(r.lastChild);}
  if(k===1){c.classList.add('ph-hold');sheet(head+'<button class="ph-btn"><i>\u21c4</i><span>Move to another spot<small>Change the order of your cars</small></span></button><button class="ph-btn red"><i>\u2715</i><span>Remove from portfolio<small style="color:#FFB3B3">Archive or delete this car</small></span></button><button class="ph-btn line">Cancel</button>');}
  if(k===2){var m=document.createElement('div');m.className='ph-move';var L2=cards.slice(0,6).map(function(cc){return byId(vs,cc.dataset.id);});var h='<div class="ph-mh"><h2>Move cars</h2><button>Done</button></div><p class="ph-ml">Drag a car to a new spot, or use the arrows. Everyone who views this collection sees the new order.</p><div class="ph-grid">';
    L2=L2.filter(function(x){return x.id!==v.id;});L2.splice(1,0,v);L2=L2.slice(0,6);L2.forEach(function(x,i){var src=imgSrc(x);var nm=x.year+' '+x.make+' '+x.model;
      h+='<div class="ph-tile'+(x.id===v.id?' lift':'')+'"><div class="im" style="'+(src?'background-image:url('+src+')':'')+'">'+(src?'':'Photo pending')+'</div><span class="n">'+(i+1)+'</span><b>'+nm+'</b><div class="ar"><button aria-label="Move left">\u2039</button><button aria-label="Move right">\u203a</button></div></div>';});
    m.innerHTML=h+'</div><div class="ph-save">Order saves for <b>'+((PO&&PO.on&&(poOf(v,v.clientId)||{}).name)||'My collection')+'</b> when you tap Done</div>';document.body.appendChild(m);}
  if(k===3){sheet('<div class="ph-h">Remove '+name+'?</div><p class="ph-p">Archive keeps its history, photos and documents. You can bring it back any time from Archived cars.</p><button class="ph-btn gold">Archive</button><button class="ph-btn red" style="justify-content:center">Delete permanently</button><p class="ph-note">Delete permanently is only for the owner or admin. Technicians can only delete cars they added. This cannot be undone after 10 seconds.</p><button class="ph-btn line">Cancel</button>');}
  if(k===4){arrow&&arrow.click();await new Promise(r=>setTimeout(r,900));c.style.visibility='hidden';var t=document.createElement('div');t.className='ph-toast';t.setAttribute('role','status');t.innerHTML='<span>'+name+' archived</span><button>Undo</button>';document.body.appendChild(t);}
  return name;},k);
 await L.sleep(400);await p.screenshot({path:SO+shots[k]+'.png'});console.log(shots[k],info,p.errors.slice(0,2));await p.close();}
await L.close();})();
