# ===== v32 (p32): Log service - scan or upload receipt (self-contained; touches only the Log service modal) =====
sub('</style>\n</head>',open(T+'service_scan.css').read()+'\n</style>\n</head>','html')
sub('''<div class="modal-title">Log service</div><button class="modal-close" onclick="closeModal('modal-service')">&#10005;</button></div>''',
'''<div class="modal-title">Log service</div><button class="modal-close" onclick="closeModal('modal-service')">&#10005;</button></div>
    <div class="ss-box" id="ss-box">
      <div id="ss-entry"><div class="ss-h">Scan or upload receipt</div><div class="ss-p">AI reads it and fills in everything for you.</div>
        <div class="ss-row"><button type="button" class="btn ss-btn-cam" onclick="ssPick('cam')">&#128247; Camera</button><button type="button" class="btn ss-btn-file" onclick="ssPick('file')">&#128193; Upload file</button></div>
        <input type="file" id="ss-cam" accept="image/*" capture="environment" style="display:none" onchange="ssFile(this)">
        <input type="file" id="ss-file" accept="image/*,application/pdf,.pdf" style="display:none" onchange="ssFile(this)"></div>
      <div id="ss-busy" class="ss-busy" style="display:none"><div class="ss-thumb" id="ss-thumb-busy"></div><div><div class="ss-t">Reading your receipt...</div><div class="ss-s">Finding the vehicle, date, mileage, work and cost</div></div></div>
      <div id="ss-done" class="ss-done" style="display:none"><div class="ss-thumb" id="ss-thumb-done"></div><div><div class="ss-t">Receipt attached</div><div class="ss-s" id="ss-done-sub"></div></div><button type="button" class="ss-link" onclick="ssReset()">Replace</button></div>
      <div id="ss-msg" class="ss-msg" style="display:none"></div>
    </div>
    <div class="ss-or" id="ss-or">Or enter it yourself</div>''','html')
js=js.rstrip()+'\n'+open(T+'p32_service_scan.js').read()+'\n'
