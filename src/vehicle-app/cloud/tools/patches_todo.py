# ===== v36 (p36): To Do tab - cars with Missing details, edited in place (no DB change) =====
sub('</style>\n</head>',open(T+'todo.css').read()+'\n</style>\n</head>','html')
sub('''<div class="nav-item" data-page="reminders" onclick="showPage('reminders')">''','''<div class="nav-item" data-page="todo" onclick="showPage('todo')"><span>To Do</span><span class="nav-badge td-badge" id="todo-badge" style="display:none">0</span></div>\n    <div class="nav-item" data-page="reminders" onclick="showPage('reminders')">''','html')
sub('<div class="page" id="page-documents">','<div class="page" id="page-todo"><div class="page-header"><div><div class="page-title">To Do</div><div class="page-subtitle" id="todo-sub">Details still missing</div></div></div><div id="todo-root"></div></div>\n<div class="page" id="page-documents">','html')
sub("var ADVISOR_PAGES=['dashboard',","var ADVISOR_PAGES=['dashboard','todo',")
sub("var OWNER_PAGES=['client-portal',","var OWNER_PAGES=['client-portal','todo',")
sub("  else if(pageId==='client-portal')renderClientPortal();\n","  else if(pageId==='client-portal')renderClientPortal();\n  else if(pageId==='todo')renderTodo();\n")
js=js.rstrip()+'\n'+open(T+'p36_todo.js').read()+'\n'
