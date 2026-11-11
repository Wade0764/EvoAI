# ===== v15: larger type app-wide, AA+ contrast, 44px targets, gold ring loader. exec'd last. =====
import re as _re
def _scale(m):
    n=float(m.group(1))
    if n<=11:v=13
    elif n<=24:v=round(n*1.2)
    elif n<=36:v=round(n*1.15)
    else:v=round(n*1.1)
    return m.group(0).replace(m.group(1)+'px',str(int(v))+'px')
_FS=_re.compile(r'font-size:\s*([\d.]+)px')
_SH=_re.compile(r'font:(\d{3} )?([\d.]+)px')
def _scale_all(t):
    t=_FS.sub(_scale,t)
    return _SH.sub(lambda m:'font:'+(m.group(1) or '')+str(max(13,round(float(m.group(2))*1.2)))+'px',t)
html_head=_scale_all(html_head);html_tail=_scale_all(html_tail);js=_scale_all(js)
# lockup image as a CSS variable so the ring loader can reuse the O and the wordmark (no new image bytes)
_i=html_head.index('.evo-lockup{');_u=html_head.index('url(data:image/webp',_i);_e=html_head.index(')',_u)+1
_url=html_head[_u:_e]
html_head=html_head[:_u]+'var(--evo-lockup-img)'+html_head[_e:]
html_head=html_head.replace(':root{',':root{--evo-lockup-img:'+_url+';',1)
sub('</style>\n</head>',open(T+'large.css').read()+'\n</style>\n</head>','html')
# splash: animated ring around the still Evolve O, wordmark, readable tagline + status
sub('<div class="boot-card"><div class="auth-logo" style="margin:0 0 20px;"><i class="evo-lockup evo-lockup-sm" role="img" aria-label="EvoAI"></i></div><div class="boot-spin"></div><div id="boot-loading-text" class="doc-meta" style="margin-top:14px;">',
    '<div class="boot-card"><div class="evo-boot"><span class="evo-spin evo-spin-lg" id="boot-ring" role="img" aria-label="EvoAI"></span><i class="evo-wm" aria-hidden="true"></i><div class="evo-tag">Private collection</div></div><div id="boot-loading-text" class="doc-meta boot-text" role="status" aria-live="polite">','html')
# sign-in: lockup without the baked-in tiny tagline + live-text tagline
sub('<div class="auth-logo"><i class="evo-lockup" role="img" aria-label="EvoAI"></i></div>','<div class="auth-logo"><i class="evo-lockup evo-lockup-nt" role="img" aria-label="EvoAI"></i><div class="evo-tag">Private collection</div></div>','html')
# other spinners -> ring
sub("if(kind==='loading'){var sp=document.createElement('span');sp.className='ai-spin';n.appendChild(sp);}",
    "if(kind==='loading'){var sp=document.createElement('span');sp.className='ai-spin evo-spin';sp.setAttribute('aria-hidden','true');sp.innerHTML=evoRingSVG()+'<i class=\"evo-o\"></i>';n.appendChild(sp);}")
sub("""el.innerHTML=kind==='scanning'?'<span class="dai-spin"></span>Reading""","""el.innerHTML=kind==='scanning'?evoSpinHTML('dai-spin')+'Reading""")
js=js.rstrip()+'\n'+open(T+'evoring_data.js').read()+open(T+'p12_large.js').read()+'\n'
