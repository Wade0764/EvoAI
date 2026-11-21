# v40 cleanup: five tabs, Royal Jewel, attention, vehicle, price list, merged forms.
# Runs inside build_cloud.py with html_head, html_tail, js, sub, errs, T.
import re
css_extra=open(T+'p43_cleanup.css',encoding='utf-8').read()
js_extra=open(T+'p43_cleanup.js',encoding='utf-8').read()
assert '\n'=='\n'
# Non-ascii would fail the publish check.
for blob,name in ((css_extra,'css'),(js_extra,'js')):
    bad=[c for c in blob if ord(c)>127]
    if bad:errs.append('p43 '+name+' non-ascii')

html_head=html_head.replace('--text-secondary:#A2A5AB;--text-muted:#8A8E95;','--text-secondary:#F2F0EB;--text-muted:#E2C58E;',1)
html_head=html_head.replace("--font-display:'Inter','Helvetica Neue',Arial,sans-serif;","--font-display:'Cormorant Garamond',Georgia,serif;",1)
html_head=html_head.replace('<html lang="en">','<html lang="en" class="em-royal">',1)
html_head=html_head.replace('<title>EVOai | Private vehicle collection</title>','<title>EvoAI | Private vehicle collection</title>',1)
html_head=html_head.replace('private EVOai account','private EvoAI account',1)
html_head=html_head.replace('#A2A5AB','#F2F0EB')
html_head=html_head.replace('#8A8E95','#E2C58E')
html_head=html_head.replace('#B4B8BE','#E2C58E')

def recolor(s):
    s=s.replace('color:#10D98A','color:#E2C58E')
    s=s.replace('color: #10D98A','color:#E2C58E')
    s=s.replace('#10D98A','#2B8F68')
    s=s.replace('#00C27A','#0A5A42')
    s=s.replace('#3BF0A8','#2B8F68')
    s=s.replace('#00A868','#032218')
    s=s.replace('rgba(16,217,138,','rgba(43,143,104,')
    return s
html_head=recolor(html_head)
js=recolor(js)
js=js.replace('EVOai','EvoAI')

# Bump sub-15px font sizes outside embedded data URIs.
def bump_fonts(css):
    parts=re.split(r'(data:[^)\'"]+)',css)
    out=[]
    for i,part in enumerate(parts):
        if i%2==1:
            out.append(part);continue
        def repl(m):
            n=float(m.group(1))
            if n<=0 or n>=15:return m.group(0)
            return m.group(0).replace(m.group(1),'15',1)
        out.append(re.sub(r'font-size:\s*(\d+(?:\.\d+)?)px',repl,part))
    return ''.join(out)
st=html_head.find('<style>')
en=html_head.find('</style>')
if st<0 or en<0:errs.append('style block missing')
else:
    html_head=html_head[:st]+bump_fonts(html_head[st:en])+'\n'+css_extra+html_head[en:]

a=html_head.find('<div class="nav-item advisor-only active"')
b=html_head.find('<div class="sidebar-footer">')
if a<0 or b<0 or a>b:errs.append('nav block missing')
else:
    nav='''<div class="nav-item advisor-only active nav-primary" data-page="dashboard" onclick="showPage('dashboard')"><span>Overview</span></div>
    <div class="nav-item client-only nav-primary" data-page="client-portal" onclick="showPage('client-portal')" style="display:none"><span>Overview</span></div>
    <div class="nav-item nav-primary" data-page="garage" onclick="showPage('garage')"><span>Garage</span></div>
    <div class="nav-item rq-nav nav-primary" data-page="requests" onclick="showPage('requests')" style="display:none"><span>Requests</span><span class="nav-badge td-badge rq-badge" id="rq-badge" style="display:none">0</span></div>
    <div class="nav-item nav-primary" data-page="todo" onclick="showPage('todo')"><span>To do</span><span class="nav-badge td-badge" id="todo-badge" style="display:none">0</span></div>
    <div class="nav-item nav-primary nav-more" data-page="more" onclick="moreOpen(event)"><span>More</span><span class="nav-badge td-badge" id="more-badge" style="display:none">0</span></div>
    <div class="nav-sink">
    <div class="nav-item" data-page="reminders" onclick="showPage('reminders')"><span>Reminders</span><span class="nav-badge" id="rem-badge" style="display:none">0</span></div>
    <div class="nav-item advisor-only" data-page="clients" onclick="showPage('clients')"><span>Clients</span></div>
    <div class="nav-item" data-page="valuations" onclick="showPage('valuations')"><span>Values</span></div>
    <div class="nav-item" data-page="inspections" onclick="showPage('inspections')"><span>Service</span></div>
    <div class="nav-item perm-nav-expenses" data-page="expenses" onclick="showPage('expenses')"><span>Expenses</span></div>
    <div class="nav-item" data-page="documents" onclick="showPage('documents')"><span>Documents</span></div>
    <div class="nav-item" data-page="recommendations" onclick="showPage('recommendations')"><span>Advisories</span><span class="nav-badge" id="recs-badge" style="display:none">0</span></div>
    <div class="nav-item" data-page="archives" onclick="openArchivesPage()"><span>Archives</span></div>
    <div class="nav-item advisor-only" data-page="audit" onclick="showPage('audit')"><span>Activity</span></div>
    <div class="nav-item client-only" data-page="access" onclick="showPage('access')" style="display:none"><span>My team</span></div>
    <div class="nav-item admin-only" data-page="team" onclick="showPage('team')" style="display:none"><span>Team</span></div>
    <div class="nav-item" data-page="account" onclick="openAccountModal()"><span>Account</span></div>
    </div>
    '''
    html_head=html_head[:a]+nav+html_head[b:]

sheet='''<div id="more-sheet" class="more-sheet" hidden>
  <div class="more-hd"><h2>More</h2><button type="button" class="btn btn-sm" onclick="moreClose()">Close</button></div>
  <div class="more-k">Records and dates</div>
  <div class="more-grid">
    <button type="button" class="more-btn" onclick="showPage('reminders')">Reminders</button>
    <button type="button" class="more-btn" onclick="showPage('recommendations')">Advisories</button>
    <button type="button" class="more-btn" onclick="showPage('inspections')">Service history</button>
    <button type="button" class="more-btn" onclick="showPage('documents')">Documents</button>
    <button type="button" class="more-btn perm-nav-expenses" onclick="showPage('expenses')">Expenses</button>
    <button type="button" class="more-btn" onclick="showPage('valuations')">Values (Stats)</button>
    <button type="button" class="more-btn advisor-only" onclick="showPage('clients')">Clients</button>
    <button type="button" class="more-btn client-only" onclick="showPage('access')" style="display:none">My team</button>
    <button type="button" class="more-wide client-only" onclick="openPriceList()" style="display:none"><span>My team<span class="mb">Services and price list</span></span><span>&rarr;</span></button>
    <button type="button" class="more-btn advisor-only" onclick="openPriceList()">My price list</button>
    <button type="button" class="more-btn" onclick="showPage('archives')">Archives</button>
    <button type="button" class="more-btn advisor-only" onclick="showPage('audit')">Activity</button>
    <button type="button" class="more-btn admin-only" onclick="showPage('team')" style="display:none">Team</button>
    <button type="button" class="more-btn" onclick="openAccountModal()">Account</button>
  </div>
</div>
'''
mark='</nav>'
mi=html_head.find(mark)
if mi<0:errs.append('nav close missing')
else:html_head=html_head[:mi+len(mark)]+'\n'+sheet+html_head[mi+len(mark):]

garage='''<div class="page" id="page-garage"><div class="page-header"><div><div class="page-title">Garage</div><div class="page-subtitle" id="garage-sub">Your cars</div></div><div class="head-actions"><button class="btn btn-sm btn-primary perm-addveh" onclick="openAddVehicleModal()">Add vehicle</button></div></div><div id="garage-vehicles"></div></div>
'''
anchor='<div class="page" id="page-clients">'
if anchor not in html_head:errs.append('clients page missing')
else:html_head=html_head.replace(anchor,garage+anchor,1)

old_svc='<div class=head-actions><button class="btn btn-sm perm-service" onclick="openServiceModal()">Log service</button><button class="btn btn-sm btn-primary perm-service" onclick="openInspectionModal()">New inspection</button></div>'
new_svc='<div class=head-actions><button class="btn btn-sm btn-primary perm-service" onclick="openRecordModal(\'service\')">Add record</button></div>'
if old_svc not in html_head:errs.append('service actions missing')
else:html_head=html_head.replace(old_svc,new_svc,1)

toggle_s='''<div class="rec-kind" role="tablist" aria-label="Record type"><button type="button" class="on" onclick="openRecordModal('service')">Service</button><button type="button" onclick="openRecordModal('inspection')">Inspection</button></div>'''
toggle_i='''<div class="rec-kind" role="tablist" aria-label="Record type"><button type="button" onclick="openRecordModal('service')">Service</button><button type="button" class="on" onclick="openRecordModal('inspection')">Inspection</button></div>'''
html_head=html_head.replace('<div class="modal-title">Log service</div>','<div class="modal-title">Add service or inspection</div>'+toggle_s,1)
html_head=html_head.replace('<div class="modal-title">Vehicle inspection report</div>','<div class="modal-title">Vehicle inspection report</div>'+toggle_i,1)
html_head=html_head.replace("onclick=\"closeModal('modal-vehicle-detail')\"><span class=\"ba\" aria-hidden=\"true\">&larr;</span> Back</button>","onclick=\"closeModal('modal-vehicle-detail');showPage('garage')\"><span class=\"ba\" aria-hidden=\"true\">&larr;</span> Back to garage</button>",1)

# Save button label on the service form stays "Save service" so the existing path is obvious.
# A second visible label is not added; the toggle is the merge.

sub("var OWNER_PAGES=['client-portal','todo','requests','client-link','access','reminders','valuations','inspections','expenses','documents','recommendations','archives'];",
    "var OWNER_PAGES=['client-portal','garage','todo','requests','client-link','access','reminders','valuations','inspections','expenses','documents','recommendations','archives'];")
sub("ADVISOR_PAGES=['dashboard','todo','requests','reminders','clients','client-detail','archives','valuations','inspections','recommendations','expenses','documents','audit','team','access'];",
    "ADVISOR_PAGES=['dashboard','garage','todo','requests','reminders','clients','client-detail','archives','valuations','inspections','recommendations','expenses','documents','audit','team','access'];")
sub("(vehicles.length>1?'<span class=\"whl-hint\">Swipe, drag or use arrow keys</span>':'')","whlHint()")
old_photo="'<label class=\"pl-lab\">Photos <span style=\"color:#E2C58E\">Optional</span></label><input id=\"pl-photo\" class=\"pl-in\" type=\"file\" accept=\"image/*\">'"
new_photo="'<div class=\"pl-photos\"><div><div class=\"pl-photos-t\">Add photos</div><div class=\"pl-photos-s\">Tap to choose from library or camera</div></div><label class=\"pl-photos-btn\" for=\"pl-photo\">+<br>Photos</label><input id=\"pl-photo\" class=\"pl-photo-in\" type=\"file\" accept=\"image/*\"></div>'"
sub(old_photo,new_photo)
js=js.rstrip()+'\n'+js_extra+'\n'
