import re,sys,io,os
HERE=os.path.dirname(os.path.abspath(__file__))
CLOUD=os.path.dirname(HERE)
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(CLOUD)))
SRC=os.environ.get('EVO_BASE') or os.path.join(ROOT,'vehicle-app','improved','evoai-obsidian.html')
if not os.path.exists(SRC):
    SRC='/workspace/vehicle-app/improved/evoai-obsidian.html'
OUT=os.path.join(CLOUD,'evoai-cloud.html')
T=HERE+os.sep
PUB=os.path.join(ROOT,'cloud','index.html')
BASE=os.path.join(CLOUD,'base','v37-index.html')
def _materialise(html, directory):
    """Pull CSS, JS, fonts and images out of the shell. Splash CSS stays inline."""
    import base64
    os.makedirs(os.path.join(directory,'assets'),exist_ok=True)
    font_names=['inter.woff','evodisplay.woff','cormorant.woff']
    img_names=['lockup.webp','mark.webp','emblem.webp','centre.webp']
    fi={'font/woff':0,'image/webp':0}
    sizes=[]
    def repl(m):
        mime,b64=m.group(1),m.group(2)
        raw=base64.b64decode(b64)
        if mime=='font/woff':
            name='assets/'+font_names[fi['font/woff']];fi['font/woff']+=1
        elif mime=='image/webp':
            name='assets/'+img_names[fi['image/webp']];fi['image/webp']+=1
        else:
            name='assets/blob-%d.bin'%len(sizes)
        open(os.path.join(directory,name),'wb').write(raw)
        sizes.append((name,len(raw)))
        return name
    css_m=re.search(r'<style>(.*?)</style>',html,re.S)
    if not css_m:raise SystemExit('no style block')
    css=re.sub(r'data:([^;)\s]+);base64,([A-Za-z0-9+/=]+)',repl,css_m.group(1))
    open(os.path.join(directory,'app.css'),'w',encoding='utf-8').write(css)
    splash=('html,body{margin:0;background:#07080A;color:#F2F0EB}'
        '#boot-loading{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#07080A;color:#F2F0EB}'
        '.evo-boot{display:flex;flex-direction:column;align-items:center;text-align:center}'
        '.evo-wmt{margin-top:18px;letter-spacing:.42em;font:500 22px/1 Georgia,serif;color:#E2C58E}'
        '.evo-tag{margin-top:12px;letter-spacing:.2em;font:15px/1.4 Georgia,serif;color:#E2C58E;text-transform:uppercase}'
        '#boot-loading-text{margin-top:18px;font-size:18px;color:#F2F0EB}'
        '#boot-ring{width:168px;height:168px;display:block}')
    link=('<style id="splash-critical">'+splash+'</style>\n'
          '<link rel="stylesheet" href="app.css">\n')
    html=html[:css_m.start()]+link+html[css_m.end():]
    scripts=list(re.finditer(r'<script>(.*?)</script>',html,re.S))
    if len(scripts)<2:raise SystemExit('expected vendor and app scripts')
    open(os.path.join(directory,'vendor.js'),'w',encoding='utf-8').write(scripts[0].group(1))
    open(os.path.join(directory,'app.js'),'w',encoding='utf-8').write(scripts[1].group(1))
    html=html[:scripts[1].start()]+'<script defer src="app.js"></script>'+html[scripts[1].end():]
    html=html[:scripts[0].start()]+'<script defer src="vendor.js"></script>'+html[scripts[0].end():]
    # offsets shifted; scripts[0] is before scripts[1], replacing [1] first keeps [0] valid.
    sizes.append(('app.css',os.path.getsize(os.path.join(directory,'app.css'))))
    sizes.append(('app.js',os.path.getsize(os.path.join(directory,'app.js'))))
    sizes.append(('vendor.js',os.path.getsize(os.path.join(directory,'vendor.js'))))
    return html,sizes
def _publish(html):
    before=len(html.encode('utf-8'))
    targets=[]
    targets.append((CLOUD,'evoai-cloud.html'))
    if os.path.isdir(os.path.dirname(PUB)):
        targets.append((os.path.dirname(PUB),'index.html'))
    report=None
    for directory,name in targets:
        out,sizes=_materialise(html,directory)
        open(os.path.join(directory,name),'w',encoding='utf-8').write(out)
        report=(len(out.encode('utf-8')),sizes)
    sw_dirs=[os.path.join(ROOT,'cloud')]
    src_sw=os.path.join(CLOUD,'sw.js')
    if os.path.isfile(src_sw):sw_dirs.append(CLOUD)
    shell="var CACHE='evoai-shell-v40-cleanup';"
    for d in sw_dirs:
        sw=os.path.join(d,'sw.js')
        if not os.path.isfile(sw):continue
        s=open(sw,encoding='utf-8').read()
        s=re.sub(r"var CACHE='[^']*';",shell,s,count=1)
        s=s.replace("'evoai-cloud.html',","'index.html','app.css','app.js','vendor.js','assets/lockup.webp','assets/mark.webp','assets/emblem.webp','assets/centre.webp','assets/inter.woff','assets/evodisplay.woff','assets/cormorant.woff',")
        s=s.replace("caches.match('evoai-cloud.html')","caches.match('index.html')")
        open(sw,'w',encoding='utf-8').write(s)
    if report:
        html_n,sizes=report
        files=sum(n for _,n in sizes)
        print('before_first_load',before)
        print('after_html',html_n)
        print('after_first_load',html_n+files)
        for nm,n in sizes:print(' ',nm,n)
    print('built',before)
if not os.path.exists(SRC):
    # The Obsidian base and PUBLIC_KEYS.txt were never in this repo. v37 (cloud/index.html)
    # already contains every patch through requests, including splash. Apply only later patches.
    if not os.path.exists(BASE):
        sys.stderr.write('Missing Obsidian base %s and v37 shell %s\n'%(SRC,BASE));sys.exit(1)
    pub=open(BASE,encoding='utf-8').read()
    s0=pub.index('<script>', pub.index('<script>')+1)+len('<script>')
    s1=pub.index('</script>', s0)
    html_head=pub[:s0];js=pub[s0:s1];html_tail=pub[s1:]
    errs=[]
    def sub(old,new,where='js',count=1):
        global js,html_head,html_tail
        if where=='html':
            for nm in ('html_head','html_tail'):
                t=globals()[nm]
                if old in t:
                    n=t.count(old)
                    if count and n!=count:errs.append('count %d!=%d: %s'%(n,count,old[:70]));return
                    globals()[nm]=t.replace(old,new);return
            errs.append('HTML missing: '+old[:80]);return
        n=js.count(old)
        if n==0:errs.append('JS missing: '+old[:90]);return
        if count and n!=count:errs.append('JS count %d!=%d: %s'%(n,count,old[:70]));return
        js=js.replace(old,new)
    exec(open(T+'patches_roles.py',encoding='utf-8').read())
    exec(open(T+'patches_pricelist.py',encoding='utf-8').read())
    exec(open(T+'patches_cleanup.py',encoding='utf-8').read())
    if errs:
        print('\n'.join(errs));sys.exit(1)
    _publish(html_head+js+html_tail)
    sys.exit(0)
src=open(SRC,encoding='utf-8').read()
anon=re.search(r'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+',open('/workspace/evoai-cloud/PUBLIC_KEYS.txt').read()).group(0)
# sanity: role anon
import base64,json
pl=anon.split('.')[1];pl+='='*(-len(pl)%4)
assert json.loads(base64.urlsafe_b64decode(pl))['role']=='anon'
s0=src.index('<script>')+len('<script>');s1=src.index('</script>',s0)
html_head=src[:s0];js=src[s0:s1];html_tail=src[s1:]
errs=[]
def sub(old,new,where='js',count=1):
    global js,html_head,html_tail
    tgt=js if where=='js' else None
    if where=='html':
        # html is head+tail
        for nm in ('html_head','html_tail'):
            t=globals()[nm]
            if old in t:
                n=t.count(old)
                if count and n!=count:errs.append('count %d!=%d: %s'%(n,count,old[:70]));return
                globals()[nm]=t.replace(old,new);return
        errs.append('HTML missing: '+old[:80]);return
    n=js.count(old)
    if n==0:errs.append('JS missing: '+old[:90]);return
    if count and n!=count:errs.append('JS count %d!=%d: %s'%(n,count,old[:70]));return
    js=js.replace(old,new)
def fn_span(text,name):
    m=re.search(r'^(async )?function '+re.escape(name)+r'\(',text,re.M)
    if not m:return None
    a=m.start()
    eol=text.index('\n',a)
    first=text[a:eol]
    if first.count('{')>0 and first.count('{')==first.count('}') :
        return a,eol+1
    e=re.compile(r'^}\n',re.M).search(text,eol)
    return a,e.end()
def replace_fn(name,new=''):
    global js
    sp=fn_span(js,name)
    if not sp:errs.append('fn missing: '+name);return
    js=js[:sp[0]]+new+js[sp[1]:] if new else js[:sp[0]]+js[sp[1]:]
def cut(a,b,new):
    global js
    i=js.index(a);j=js.index(b,i)
    js=js[:i]+new+js[j:]
p1=open(T+'p1_data.js').read().replace('__ANON_KEY__',anon)
p2=open(T+'p2_auth.js').read()
p3=open(T+'p3_fns.js').read()
# drop originals that p1/p2 redefine
def names(t):return re.findall(r'^(?:async )?function (\w+)\(',t,re.M)
region_end_marker='// ============ NOTES ============'
cut('// ============ DATA LAYER ============','// ============ UTILITIES ============','//@@P1\n')
cut('// ============ PASSWORD HASHING','// ============ NOTES ============','//@@P2\n')
for n in set(names(p1)+names(p2)):
    if fn_span(js,n):replace_fn(n)
# p3 blocks
parts=re.split(r'^//@@(fn \w+|add)\n',p3,flags=re.M)
add=''
for i in range(1,len(parts),2):
    k=parts[i];body=parts[i+1]
    if k=='add':add=body
    else:
        nm=k.split()[1]
        # block may contain extra functions after the main one
        replace_fn(nm,'')
        add_extra=body
        js=js.replace('//@@P2\n','//@@P2\n'+add_extra+'\n',1)
for n in ['saveMany','pickImportFile','importData']:
    if fn_span(js,n):replace_fn(n)
# DOMContentLoaded init
cut("document.addEventListener('DOMContentLoaded',function(){\n  var demoWiped","</script>" if False else "\n\n\n" ,'') if False else None
m=re.search(r"document\.addEventListener\('DOMContentLoaded',function\(\)\{\n  var demoWiped.*?\n\}\);\n",js,re.S)
if m:js=js[:m.start()]+js[m.end():]
else:errs.append('init missing')
js=js.replace('//@@P1\n',p1+'\n').replace('//@@P2\n',p2+'\n')
js=js.rstrip()+'\n'+add+'\n'+open(T+'p4_identify.js').read()+'\n'
# ---- JS patches ----
exec(open(T+'patches_js.py').read())
exec(open(T+'patches_html.py').read())
exec(open(T+'patches_value.py').read())
for _n in set(names(open(T+'p5_value.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p5_value.js').read()+'\n'
# ---- team / remove client (p6) ----
exec(open(T+'patches_team.py').read())
for _n in set(names(open(T+'p6_team.js').read())):
    if fn_span(js,_n):replace_fn(_n)
js=js.rstrip()+'\n'+open(T+'p6_team.js').read()+'\n'
# ---- portfolio + roundabout (p7/p8) ----
exec(open(T+'patches_portfolio.py').read())
# ---- dz: safe area, client title, swipe-back (p9) ----
exec(open(T+'patches_safe.py').read())
# ---- AI document scanning + AI reminders (p10) ----
exec(open(T+'patches_docai.py').read())
# ---- AI photo dump / auto-sort (p11) ----
exec(open(T+'patches_phototag.py').read())
# ---- v15 large type / contrast / ring loader (p12) ----
exec(open(T+'patches_large.py').read())
# ---- v15 vehicle page / owner value / replica (p13) ----
exec(open(T+'patches_vehicle.py').read())
# ---- v17 value chart (p14) ----
exec(open(T+'patches_charts.py').read())
# ---- v17 co-owners + estimate lines + auto estimate after photos (p16) ----
exec(open(T+'patches_coowners.py').read())
# ---- v17 (E) automatic VIN decode (p17) ----
exec(open(T+'patches_vin.py').read())
exec(open(T+'patches_sizefix.py').read())
# ---- v18 document thumbnails + viewer (p18) ----
exec(open(T+'patches_docthumbs.py').read())
# ---- v19 replica toggle in the Add form (main grid) ----
exec(open(T+'patches_replica_add.py').read())
# ---- v20 Missing indicators + completeness count (p19) ----
exec(open(T+'patches_missing.py').read())
# ---- v21 master sheet import + portfolios (p20) ----
exec(open(T+'patches_import.py').read())
exec(open(T+'patches_costcheck.py').read())
# ---- v22 bottom nav option A (p22) ----
exec(open(T+'patches_nav.py').read())
# ---- v23 undo import (p23) ----
exec(open(T+'patches_undo.py').read())
exec(open(T+'patches_importfix.py').read())
exec(open(T+'patches_presshold.py').read())
exec(open(T+'patches_values25b.py').read())
# ---- v27 simple secure sign-up (p27) ----
exec(open(T+'patches_signup.py').read())
# ---- v28 rename collection (p28) ----
exec(open(T+'patches_rename.py').read())
# ---- v29 sort by (p29) ----
exec(open(T+'patches_sort.py').read())
# ---- v28 refresh brief (p30) ----
exec(open(T+'patches_refresh_brief.py').read())
# ---- v31 inspection report (p31) ----
exec(open(T+'patches_inspect.py').read())
# ---- v32 log service scan (p32) ----
exec(open(T+'patches_service_scan.py').read())
exec(open(T+'patches_portfolio_pick.py').read())  # v33 portfolio pick (p33)
exec(open(T+'patches_binder.py').read())
exec(open(T+'patches_emerald.py').read())
exec(open(T+'patches_todo.py').read())
exec(open(T+'patches_headings.py').read())
exec(open(T+'patches_collname.py').read())
exec(open(T+'patches_logo.py').read())  # v34 binder vault (p34)
exec(open(T+'patches_splash.py').read())  # v36b splash (p39b) — was only in build_preview_requests.py
exec(open(T+'patches_requests.py').read())  # v37 / v40 requests (p40)
exec(open(T+'patches_roles.py').read())  # v38 roles, estimates, history (p41)
exec(open(T+'patches_pricelist.py').read())  # v39 price list (p42)
exec(open(T+'patches_cleanup.py',encoding='utf-8').read())  # v40 cleanup
if errs:
    print('\n'.join(errs));sys.exit(1)
vendor=open('/workspace/vehicle-app/cloud/vendor/supabase.js').read()
assert '</script' not in vendor.lower()
out=html_head+js+html_tail
out=out.replace('<script>'+js,'<script>'+js)  # noop
# inline vendor before main script
idx=out.index('<script>')
out=out[:idx]+'<script>\n'+vendor+'\n</script>\n'+out[idx:]
_publish(out)
