// ===== v33 (p33): "Which portfolio?" import step - approved mockup pf-04 (Option B, Oct 25).
// Adds on top of p20/p24: one portfolio -> preselected with a clear "goes into X" line; the chosen
// portfolio is always valid (falls back to the default); ZAR (South Africa) in the new-portfolio
// currency list; picking a country sets its currency. Portfolio rows need migration_013 (+021 for
// ZAR purchase prices). Without 013 the app keeps one implicit portfolio and this step only confirms it.
var PF_CUR_LIST=['USD','EUR','GBP','ZAR'];
var PF_COUNTRY_CUR={US:'USD',CA:'USD',GB:'GBP',ZA:'ZAR',IE:'EUR',DE:'EUR',FR:'EUR',IT:'EUR',ES:'EUR',NL:'EUR',MC:'EUR'};
function pfImValid(owner,id){var l=poList(owner);for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null;}
function pfImEnsure(){if(!IM.owner||IM.newPf)return;if(!pfImValid(IM.owner,IM.pfId))IM.pfId=poDefault(IM.owner).id;}
function pfImSetCountry(c){if(!IM.newPf)return;IM.newPf.country=c||'';var cu=PF_COUNTRY_CUR[IM.newPf.country];if(cu)IM.newPf.currency=cu;imRender();}
var pfImStep2Base=imStep2;
imStep2=function(){
  pfImEnsure();
  var h=pfImStep2Base();
  if(IM.owner&&!IM.newPf){var l=poList(IM.owner);
    if(l.length===1){var nm=imE(l[0].name);
      h=h.replace('<p class="im-lead">Choose where these vehicles go.</p>','<p class="im-lead pf-only">You have one portfolio, so these vehicles go into <b>'+nm+'</b>.'+(PO.on?' Or start a new one below.':'')+'</p>');}
  }
  // currency list with ZAR, country picks currency
  h=h.replace(/<select id="im-np-cur"([^>]*)>[\s\S]*?<\/select>/,function(m,a){var np=IM.newPf||{};return '<select id="im-np-cur"'+a+'>'+PF_CUR_LIST.map(function(c){return '<option'+(c===np.currency?' selected':'')+'>'+c+'</option>';}).join('')+'</select>';});
  h=h.replace('id="im-np-country" class="im-in" onchange="IM.newPf.country=this.value"','id="im-np-country" class="im-in" onchange="pfImSetCountry(this.value)"');
  return h;
};
var pfImToReviewBase=imToReview;
imToReview=async function(){pfImEnsure();return pfImToReviewBase();};
