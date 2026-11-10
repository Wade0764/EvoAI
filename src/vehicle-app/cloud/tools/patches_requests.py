# ===== v40 (p40): Client Requests tab (tech) + Make a request (owner) + Comments above Recent activity + Overview option C =====
# Needs migration_022_requests_comments.sql for requests/comments; without it those surfaces stay hidden. Option C is HTML only.
sub('</style>\n</head>',open(T+'p40_requests.css').read()+'\n</style>\n</head>','html')
sub('''<div class="nav-item" data-page="reminders" onclick="showPage('reminders')">''','''<div class="nav-item rq-nav" data-page="requests" onclick="showPage('requests')" style="display:none"><span>Requests</span><span class="nav-badge td-badge rq-badge" id="rq-badge" style="display:none">0</span></div>\n    <div class="nav-item" data-page="reminders" onclick="showPage('reminders')">''','html')
sub('<div class="page" id="page-todo">','<div class="page" id="page-requests"><div class="page-header"><div><div class="page-title" id="rq-title">Client Requests</div><div class="page-subtitle" id="rq-sub"></div></div><div class="head-actions" id="rq-actions"></div></div><div id="rq-root"></div></div>\n<div class="modal-overlay" id="modal-req"><div class="modal rq-modal" role="dialog" aria-modal="true" aria-labelledby="rq-mt"><div class="modal-header"><div class="modal-title" id="rq-mt">Make a request</div><button class="modal-close" onclick="closeModal(\'modal-req\')" aria-label="Close">&#10005;</button></div><div id="rq-form"></div></div></div>\n<div class="page" id="page-todo">','html')
sub("var ADVISOR_PAGES=['dashboard','todo',","var ADVISOR_PAGES=['dashboard','todo','requests',")
sub("var OWNER_PAGES=['client-portal','todo',","var OWNER_PAGES=['client-portal','todo','requests',")
sub("  else if(pageId==='todo')renderTodo();\n","  else if(pageId==='todo')renderTodo();\n  else if(pageId==='requests')renderRequests();\n")
sub('<button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div></div><div id="cp-banner"></div>','<button class="btn btn-sm" id="cp-rq-btn" onclick="rqOpen()" style="display:none">Make a request</button><button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div></div><div id="cp-banner"></div>','html')
def _ovc(p,n,att):
    old=('''        <section id="%s-brief" class="vch-brief"></section>
        <div class="stats3">
          <div><b id="%s-vehicle-count">0</b><span class="lab">Vehicles</span></div>
          <div><b id="%s-attn-count">0</b><span class="lab">Needs attention</span></div>
          <div><b id="%s-avg-health">0</b><span class="lab">Avg health</span></div>
        </div>
      </section>
      <div class="cols2 vch-one" id="%s-cols">
        <section><div class="sh first"><h2>%s</h2><a onclick="goReminders()">All reminders</a></div><div id="%s-attention"></div></section>
      </div>
      <section class="sec" id="%s-veh-sec"><div class="sh first"><h2>Vehicles</h2><a id="%s-archive-link" onclick="openArchivesPage()"></a></div><div class="car-grid" id="%s-vehicles"></div></section>
      <section class="sec" id="%s-act-sec">''')%(p,n,n,n,p,att,p,p,p,p,p)
    tabs=''.join('<button type="button" role="tab" class="ovc-t" id="%s-ovt-%s" data-t="%s" aria-controls="%s-ovc-%s" onclick="ovcSet(\'%s\',\'%s\')">%s</button>'%(p,k,k,p,k,p,k,l) for k,l in (('portfolio','Portfolio'),('brief','Brief'),('stats','Stats')))
    new=('''      </section>
      <div class="ovc-wrap" id="%s-ovc-wrap">
      <div class="ovc-seg" role="tablist" aria-label="Overview sections" id="%s-ovc" onkeydown="ovcKey(event,'%s')">%s</div>
      <div class="ovc-p" id="%s-ovc-portfolio" role="tabpanel" aria-labelledby="%s-ovt-portfolio">
      <section class="sec" id="%s-veh-sec"><div class="sh first"><h2>Vehicles</h2><a id="%s-archive-link" onclick="openArchivesPage()"></a></div><div class="car-grid" id="%s-vehicles"></div></section>
      </div>
      <div class="ovc-p" id="%s-ovc-brief" role="tabpanel" aria-labelledby="%s-ovt-brief" hidden>
        <section id="%s-brief" class="vch-brief"></section>
      </div>
      <div class="ovc-p" id="%s-ovc-stats" role="tabpanel" aria-labelledby="%s-ovt-stats" hidden>
        <div class="stats3">
          <div><b id="%s-vehicle-count">0</b><span class="lab">Vehicles</span></div>
          <div><b id="%s-attn-count">0</b><span class="lab">Needs attention</span></div>
          <div><b id="%s-avg-health">0</b><span class="lab">Avg health</span></div>
        </div>
      <div class="cols2 vch-one" id="%s-cols">
        <section><div class="sh first"><h2>%s</h2><a onclick="goReminders()">All reminders</a></div><div id="%s-attention"></div></section>
      </div>
      </div>
      </div>
      <section class="sec rq-cm" id="%s-cm-sec" style="display:none"><div class="sh first"><h2>Comments</h2><span class="cm-new" id="%s-cm-new"></span></div><div id="%s-cm"></div></section>
      <section class="sec" id="%s-act-sec">''')%(p,p,p,tabs,p,p,p,p,p,p,p,p,p,p,n,n,n,p,att,p,p,p,p,p)
    sub(old,new,'html')
_ovc('dash','ph','Needs attention')
_ovc('cp','cp','Needs your attention')
js=js.rstrip()+'\n'+open(T+'p40_requests.js').read()+'\n'
