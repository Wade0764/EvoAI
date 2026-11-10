// ============ v37 headings (p37): eyebrow + hairline rule on every page header ============
var HD_EYEBROW={todo:'Records to complete',reminders:'Dates & renewals',clients:'Your clients','client-detail':'Client',valuations:'Market values',inspections:'Service history',expenses:'Ownership costs',documents:'Records vault',recommendations:'From your advisor',archives:'Past vehicles',audit:'Activity log',team:'Administration',access:'Who can see',"client-link":'Getting started'};
function hdDecorate(){
  document.querySelectorAll('.page').forEach(function(pg){var t=pg.querySelector('.page-header .page-title');if(!t||t.getAttribute('data-hd'))return;t.setAttribute('data-hd','1');
    var id=pg.id.replace(/^page-/,''),eb=HD_EYEBROW[id];
    if(eb){var e=document.createElement('div');e.className='hd-eyebrow';e.setAttribute('aria-hidden','true');e.textContent=eb;t.parentNode.insertBefore(e,t);}
    var r=document.createElement('div');r.className='hd-rule';r.setAttribute('aria-hidden','true');r.innerHTML='<i></i><b></b><i></i>';t.parentNode.insertBefore(r,t.nextSibling);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hdDecorate);else hdDecorate();
