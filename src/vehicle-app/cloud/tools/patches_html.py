H='html'
# ---- head / PWA ----
sub('<link rel="icon" type="image/png" sizes="48x48" href="'+open('/workspace/vehicle-app/cloud/tools/favicon48.datauri.txt').read()+'">','<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="icons/favicon-16.png">\n<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="apple-mobile-web-app-title" content="EvoAI">\n<meta name="application-name" content="EvoAI">\n<meta name="mobile-web-app-capable" content="yes">',H)
sub('<title>EVOai | Private vehicle collection</title>','<title>EVOai | Private vehicle collection</title>',H)
# CSS
css=open(T+'extra.css').read()
sub('</style>\n</head>',css+'\n</style>\n</head>',H)
# ---- auth card ----
a=html_head.index('<div id="auth-screen">');b=html_head.index('<!-- APP SHELL -->') if '<!-- APP SHELL -->' in html_head else None
full=html_head+'\x00SPLIT\x00'+html_tail
a=full.index('<div id="auth-screen">');b=full.index('<!-- APP SHELL -->')
auth=open(T+'auth.html').read()
full=full[:a]+auth+full[b:]
html_head,html_tail=full.split('\x00SPLIT\x00')
# nav & pages
sub('<div class="nav-item" data-page="expenses" onclick="showPage(\'expenses\')"><span>Expenses</span></div>','<div class="nav-item perm-nav-expenses" data-page="expenses" onclick="showPage(\'expenses\')"><span>Expenses</span></div>',H)
sub('<div class="nav-item admin-only" data-page="team"','<div class="nav-item client-only" data-page="access" onclick="showPage(\'access\')" style="display:none"><span>Techs</span></div>\n    <div class="nav-item admin-only" data-page="team"',H)
sub('<div class="page" id="page-client-link">','<div class="page" id="page-access"><div class="page-header"><div><div class="page-title">Techs</div><div class="page-subtitle">Choose who can help with your collection, and exactly what they can see and do</div></div></div><div id="access-body"></div></div>\n<div class="page" id="page-client-link">',H)
sub('<span class="who">Managed by your advisor</span>','<div class="head-actions"><button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div>',H)
sub('<button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button></div></div><div id="dash-empty">','<button class="btn btn-sm btn-primary perm-addveh" onclick="openAddVehicleModal()">Add vehicle</button></div></div><div id="dash-empty">',H)
sub('<button class="btn btn-sm btn-primary" onclick="openAddVehicleModal()">Add vehicle</button><button class="btn btn-sm" onclick="openClientArchives()">Archives</button><button class="btn btn-sm btn-danger admin-only" onclick="deleteCurrentClient()">Delete client</button>','<button class="btn btn-sm btn-primary perm-addveh" onclick="openAddVehicleModal()">Add vehicle</button><button class="btn btn-sm" onclick="openClientArchives()">Archives</button>',H)
sub('<button class="btn btn-sm advisor-only" onclick="openServiceModal()">Log service</button><button class="btn btn-sm btn-primary advisor-only" onclick="openInspectionModal()">New inspection</button>','<button class="btn btn-sm perm-service" onclick="openServiceModal()">Log service</button><button class="btn btn-sm btn-primary perm-service" onclick="openInspectionModal()">New inspection</button>',H)
sub('<button class="btn btn-sm btn-primary advisor-only" onclick="openRecModal()">New advisory</button>','<button class="btn btn-sm btn-primary perm-adv" onclick="openRecModal()">New advisory</button>',H)
sub('<button class="btn btn-sm btn-primary advisor-only" onclick="openExpenseModal()">Log expense</button>','<button class="btn btn-sm btn-primary perm-expense" onclick="openExpenseModal()">Log expense</button>',H)
sub('<th class="advisor-only"></th>','<th class="perm-rem"></th>',H)
sub('<button class="btn btn-sm btn-primary advisor-only" onclick="openDocModal()">Add document</button>','<button class="btn btn-sm btn-primary perm-doc" onclick="openDocModal()">Add document</button>',H)
sub('<button class="btn btn-sm btn-primary advisor-only" onclick="openReminderModal()">Add reminder</button>','<button class="btn btn-sm btn-primary perm-rem" onclick="openReminderModal()">Add reminder</button>',H)
sub('People who can sign in on the advisor side of this device','Everyone signed up as a tech or admin',H)
sub('<div class=head-actions><button class="btn btn-sm btn-primary" onclick="openModal(\'modal-add-tech\')">Add tech</button></div>','',H)
sub('<div class="page-subtitle">Collection owners you manage</div></div><div class=head-actions><button class="btn btn-sm btn-primary" onclick="openModal(\'modal-add-client\')">Add client</button>','<div class="page-subtitle">Collection owners you work with</div></div><div class=head-actions><button class="btn btn-sm btn-primary" onclick="openModal(\'modal-add-client\')">Invite client</button>',H)
# vehicle detail photos
sub('<div id="vd-ai"></div>','<div id="vd-ai"></div>\n    <div id="vd-photos"></div><input type="file" id="vd-photo-input" accept="image/*" style="display:none" onchange="handleDetailPhoto(this)">',H)
sub('<img id="img-view-src" alt="" style="width:100%;border-radius:12px;display:block;">','<img id="img-view-src" alt="" style="width:100%;border-radius:12px;display:block;"><div class="flex gap-2" id="img-view-actions" style="margin-top:12px;flex-wrap:wrap;"></div>',H)
# add client -> invite client
sub('<div class="modal-title">New client</div>','<div class="modal-title">Invite client</div>',H)
sub('''      <div class="input-group"><label>Phone</label><input type="tel" id="nc-phone" maxlength="30" placeholder="(904) 555-0100"></div>
      <div class="input-group form-full"><label>Location</label><input type="text" id="nc-location" maxlength="80" placeholder="Ponte Vedra Beach, FL"></div>
''','',H)
sub('A one-time owner invite code is created with the client.','Creates a one-time owner code to share privately. The client signs up, enters the code, and their collection links to your account. Invitations are not emailed automatically - you share the code or link yourself.',H)
sub('onclick="addClient()">Create client</button>','onclick="addClient()">Create invite code</button>',H)
# invite modal
sub('<div class="modal-title">Owner invite code</div>','<div class="modal-title" id="invite-title">Owner invite code</div>',H)
sub('''<div class="disclaimer">Share this code privately with the owner. They choose <strong>Owner</strong>, tap <strong>Create an account with your invite code</strong>, and enter it. The code works once and expires in 14 days. Data is stored on this device, so the owner signs up on this same device until the cloud version.</div>''','<div class="disclaimer" id="invite-help"></div>',H)
# rec notes
a=html_head.index('<div class="input-group form-full"><label>Internal notes (never shown to the owner)</label>')
b=html_head.index('</div>',a)+6
html_head=html_head[:a]+html_head[b:]
# transfer modal
a=html_head.index('<p class="disclaimer" id="xfer-help"');b=html_head.index('<div class="flex gap-2 mt-4"',a)
html_head=html_head[:a]+'<p class="disclaimer" style="margin-top:0;">Creates a one-time code for the buyer. When they enter it under Account, Redeem a code, the vehicle moves to their collection and you keep a read-only archive.</p>\n    <div class="input-group"><label>Buyer email (optional, locks the code to that email)</label><input type="email" id="xfer-email" maxlength="120" placeholder="buyer@email.com" autocapitalize="none"></div>\n    '+html_head[b:]
sub('onclick="confirmTransfer()">Transfer vehicle</button>','onclick="confirmTransfer()">Create transfer code</button>',H)
# remove add-tech modal
a=html_head.index('<!-- ADD TECH (admin) -->');b=html_head.index('<!-- ACCOUNT -->')
html_head=html_head[:a]+html_head[b:]
# account modal
sub('''      <button class="btn btn-sm admin-only" onclick="pickImportFile()">Import backup</button>
      <input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="importData(this)">
''','',H)
sub('Export backup (JSON)','Download my data (JSON)',H)
sub('<div class="client-only" style="display:none;">\n      <div class="sh"><h2>Link a collection</h2></div>','<div class="redeem-sec">\n      <div class="sh"><h2>Redeem a code</h2></div>',H)
sub('<div class="disclaimer">Redeeming a new code replaces your current collection link.</div>','<div class="disclaimer">Enter an invite code from an owner or a transfer code from a seller.</div>',H)
sub('<button class="btn btn-danger btn-sm client-only" style="display:none;" onclick="deleteMyAccount()">Delete my account</button>','<span></span>',H)
# doc/expense files
sub('<option value="insurance">Insurance Policy</option>','<option value="insurance">Insurance Policy</option><option value="invoice">Invoice</option>',H)
sub('<label>Photo of the document (images only, no PDFs)</label>','<label>Photo or PDF of the document</label>',H)
sub('<label>Receipt photo (optional)</label>','<label>Receipt photo or PDF (optional)</label>',H)
sub('<input type="file" id="ex-img-input" accept="image/*"','<input type="file" id="ex-img-input" accept="image/*,application/pdf"',H)
sub('<input type="file" id="doc-img-input" accept="image/*"','<input type="file" id="doc-img-input" accept="image/*,application/pdf"',H)
sub('<img id="ex-img-src" alt="">','<img id="ex-img-src" alt=""><span id="ex-file-name" class="doc-meta"></span>',H)
sub('<img id="doc-img-src" alt="">','<img id="doc-img-src" alt=""><span id="doc-file-name" class="doc-meta"></span>',H)
sub('Remove photo</button></div>\n      </div>\n    </div>\n    <div class="form-grid">','Remove file</button></div>\n      </div>\n    </div>\n    <div class="form-grid">',H,count=0) if False else None
# finance-only fields
sub('<div class="input-group"><label>Purchase price ($)</label>','<div class="input-group fin-only"><label>Purchase price ($)</label>',H)
sub('<div class="input-group"><label>Purchase date</label>','<div class="input-group fin-only"><label>Purchase date</label>',H)
sub('<details id="v-dates" style="margin-top:14px;">','<details id="v-dates" class="fin-only" style="margin-top:14px;">',H)

html_head=html_head.replace('placeholder="EVO-XXXX-XXXX"','placeholder="Paste your code"')
html_tail=html_tail.replace('placeholder="EVO-XXXX-XXXX"','placeholder="Paste your code"')

# invite modal: share + email buttons, plain no-email notice
sub('<div class="disclaimer" id="invite-help"></div>','<div class="disclaimer" style="color:var(--gold);">Invitations are not emailed automatically - share this code/link yourself.</div><div class="disclaimer" id="invite-help"></div>',H)
sub('<button class="btn btn-ghost" onclick="copyInviteCode()">Copy code</button>','<button class="btn btn-ghost" onclick="copyInviteCode()">Copy code</button>\n      <button class="btn btn-ghost" onclick="shareInviteModal()">Share invite</button>\n      <a class="btn btn-ghost" id="invite-mailto" href="#">Email it</a>',H)

# ===== migration_003: managed clients, enter-invite-code cards =====
full=html_head+'\x00SPLIT\x00'+html_tail
a=full.index('<!-- ADD CLIENT -->');b=full.index('<!-- INVITE CODE -->')
new_modals='''<!-- NEW CLIENT (managed client: no invite needed) -->
<div class="modal-overlay" id="modal-add-client">
  <div class="modal">
    <div class="modal-header"><div class="modal-title">New client</div><button class="modal-close" onclick="closeModal('modal-add-client')">&#10005;</button></div>
    <div class="form-grid">
      <div class="input-group form-full"><label>Client name</label><input type="text" id="nc-name" maxlength="120" placeholder="e.g. Smith Family Collection" autocomplete="off"></div>
      <div class="input-group"><label>Email (optional)</label><input type="email" id="nc-email" maxlength="200" placeholder="client@email.com" autocomplete="off"></div>
      <div class="input-group"><label>Phone (optional)</label><input type="tel" id="nc-phone" maxlength="40" placeholder="(904) 555-0100" autocomplete="off"></div>
      <div class="input-group form-full"><label>Notes (optional)</label><input type="text" id="nc-notes" maxlength="500" placeholder="Anything to remember" autocomplete="off"></div>
    </div>
    <div class="disclaimer">No invite needed. You can add their vehicles right away. When they join the app with the same email (or enter a code), everything moves to their account and you keep your access.</div>
    <div class="doc-meta code-msg" id="nc-error" role="alert" style="color:var(--red,#e07070);"></div>
    <div class="flex gap-2 mt-4" style="justify-content:flex-end;flex-wrap:wrap;">
      <button class="btn btn-ghost" onclick="closeModal('modal-add-client')">Cancel</button>
      <button class="btn btn-primary" id="nc-save-btn" onclick="addClient()">Add client</button>
    </div>
    <div style="margin-top:14px;"><span class="link" onclick="closeModal('modal-add-client');openModal('modal-invite-client')">Prefer to send an invite code only? Invite by code</span></div>
  </div>
</div>
<!-- CLIENT CREATED -->
<div class="modal-overlay" id="modal-client-created">
  <div class="modal">
    <div class="modal-header"><div class="modal-title">Client added</div><button class="modal-close" onclick="closeModal('modal-client-created')">&#10005;</button></div>
    <div style="font-size:20px;font-weight:300;" id="cc-name"></div>
    <div class="doc-meta" style="margin-top:6px;"><span class="badge-soft">Not on app yet</span> You can add their vehicles now.</div>
    <div class="flex gap-2 mt-4" style="flex-wrap:wrap;">
      <button class="btn btn-primary" id="cc-add-btn" onclick="clientCreatedAddVehicle()">Add vehicle</button>
      <button class="btn btn-ghost" onclick="closeModal('modal-client-created')">Later</button>
    </div>
  </div>
</div>
<!-- INVITE CLIENT BY CODE (optional old flow) -->
<div class="modal-overlay" id="modal-invite-client">
  <div class="modal">
    <div class="modal-header"><div class="modal-title">Invite client by code</div><button class="modal-close" onclick="closeModal('modal-invite-client')">&#10005;</button></div>
    <div class="form-grid">
      <div class="input-group form-full"><label>Client name</label><input type="text" id="ic-name" maxlength="80" placeholder="e.g. Smith Family Collection"></div>
      <div class="input-group"><label>Email</label><input type="email" id="ic-email" maxlength="120" placeholder="client@email.com"></div>
    </div>
    <div class="disclaimer">Creates a one-time owner code to share privately. The client signs up, enters the code, and links to your account. Invitations are not emailed automatically - you share the code or link yourself.</div>
    <div class="flex gap-2 mt-4" style="justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal('modal-invite-client')">Cancel</button>
      <button class="btn btn-primary" onclick="inviteClientOnly()">Create invite code</button>
    </div>
  </div>
</div>
'''
full=full[:a]+new_modals+full[b:]
html_head,html_tail=full.split('\x00SPLIT\x00')
# Clients page buttons
sub('<div class=head-actions><button class="btn btn-sm btn-primary" onclick="openModal(\'modal-add-client\')">Invite client</button></div>','<div class=head-actions><button class="btn btn-sm btn-primary" onclick="openNewClient()">New client</button></div>',H)
sub('<button class="btn btn-sm" onclick="openModal(\'modal-add-client\')">New client</button>','<button class="btn btn-sm" onclick="openNewClient()">New client</button>',H)
# client page: managed banner + vehicle select hook
sub('<div class="page-subtitle" id="cd-meta"></div>','<div class="page-subtitle" id="cd-meta"></div><div id="cd-managed"></div>',H)
sub('<select id="v-client"><option value="">Select client</option></select>','<select id="v-client" onchange="vehicleClientChanged()"><option value="">Select client</option></select>',H)
# Account: visible "Enter invite code" card
a0='<div class="redeem-sec">'
full=html_head+'\x00SPLIT\x00'+html_tail
i=full.index(a0);j=full.index('<div class="sh"><h2>Change password</h2></div>',i)
card='''<div class="redeem-sec invite-card">
      <div class="sh"><h2>Enter invite code</h2></div>
      <div class="doc-meta">Got a code from your tech or from a seller? Paste it here to connect.</div>
      <div class="flex gap-2" style="margin-top:12px;"><input type="text" id="acct-code" placeholder="Paste your code" autocapitalize="characters" autocomplete="off" aria-label="Invite code"><button class="btn btn-primary" id="acct-redeem-btn" onclick="redeemCodeFrom('acct-code','acct-code-msg')">Redeem</button></div>
      <div class="doc-meta code-msg" id="acct-code-msg" role="status"></div>
    </div>
    '''
full=full[:i]+card+full[j:]
html_head,html_tail=full.split('\x00SPLIT\x00')
# link-your-collection page: same helpful messages
sub("onclick=\"redeemCodeFrom('link-code')\">Link collection</button></div></div>","onclick=\"redeemCodeFrom('link-code','link-code-msg')\">Enter invite code</button><div class=\"doc-meta code-msg\" id=\"link-code-msg\" role=\"status\"></div></div></div>",H)

sub('<div id="cp-welcome"></div>','<div id="cp-welcome"></div><div id="cp-redeem"></div>',H)

# ===== identify-vehicle wording =====
sub('These will fill in automatically with AI-verified accuracy once connected. Enter manually until then.</div></div>','Year, make, model and color can be filled in from a photo when adding a vehicle. You can edit them any time.</div></div>','html')
sub('      <div class="quiet-note form-full" id="v-autonote">These will fill in automatically with AI-verified accuracy once connected. Enter manually until then.</div>\n','','html')
sub('<div class="section-title" style="margin-top:28px;margin-bottom:14px;">Vehicle</div>','<div class="quiet-note" id="v-autonote" data-kind="idle" aria-live="polite" style="margin-top:12px;max-width:none">Add a photo and the year, make, model and color fill in for you. You can change anything.</div>\n    <div class="section-title" style="margin-top:20px;margin-bottom:14px;">Vehicle</div>','html')
