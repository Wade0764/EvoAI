#!/usr/bin/env python3
"""Write the static mockup pages. Not part of the app."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SVG = {
"dbs": '''<svg viewBox="0 0 148 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="148" height="100" fill="#14161c"/><ellipse cx="74" cy="84" rx="56" ry="6" fill="rgba(201,170,107,.32)"/><path d="M6 70h18l14-16 22-2 18-16h24l16 14h20v16h-10a10 10 0 0 1-20 0H48a10 10 0 0 1-20 0H6z" fill="#e6d5b4"/><path d="M62 40h22l7 14H66z" fill="#7f9eb3"/><circle cx="38" cy="70" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/><circle cx="116" cy="70" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/></svg>''',
"etype": '''<svg viewBox="0 0 148 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="148" height="100" fill="#12161a"/><ellipse cx="74" cy="84" rx="56" ry="6" fill="rgba(201,170,107,.32)"/><path d="M4 68h22l20-8 16-18c8-4 18-6 28-4l18 6 16 10h14v14h-8a10 10 0 0 1-20 0H46a10 10 0 0 1-20 0H4z" fill="#c5d2c8"/><path d="M70 40h24c4 6 6 12 4 16H74z" fill="#6e8c86"/><circle cx="36" cy="68" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/><circle cx="118" cy="68" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/></svg>''',
"gt3": '''<svg viewBox="0 0 148 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="148" height="100" fill="#18191e"/><ellipse cx="74" cy="84" rx="56" ry="6" fill="rgba(201,170,107,.32)"/><path d="M10 70h16l10-12 24-4 22-16h18l20 16h16v16h-8a10 10 0 0 1-20 0H50a10 10 0 0 1-20 0H10z" fill="#f4f1ea"/><path d="M64 42h26l8 14H68z" fill="#8aa4b5"/><circle cx="40" cy="70" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/><circle cx="112" cy="70" r="9" fill="#0c0d10" stroke="#C9AA6B" stroke-width="1.6"/></svg>''',
}

def head(title):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="style.css"></head><body>
'''

def brand():
    return '<div class="brand">EVOAI</div>'

def nav(items, active):
    out = ['<nav class="nav">']
    for key, label, badge in items:
        cls = ' class="on"' if key == active else ''
        b = f'<i class="cnt">{badge}</i>' if badge else ''
        out.append(f'<a{cls}>{label}{b}</a>')
    out.append('</nav>')
    return ''.join(out)

def tabs(items, active):
    out = ['<nav class="tabbar">']
    for key, label in items:
        cls = ' class="on"' if key == active else ''
        out.append(f'<a{cls}>{label}</a>')
    out.append('</nav>')
    return ''.join(out)

TECH_ITEMS = [
    ('overview','Overview',''),('todo','To do',''),('requests','Requests',''),
    ('reminders','Reminders',''),('clients','Clients',''),('values','Values',''),
    ('service','Service',''),('expenses','Expenses',''),('documents','Documents',''),
    ('advisories','Advisories',''),('archives','Archives',''),('activity','Activity',''),
    ('account','Account',''),
]
TECH_TABS = [('overview','Overview'),('requests','Requests'),('clients','Clients'),('account','Account')]
CLIENT_ITEMS = [
    ('overview','Overview',''),('todo','To do',''),('requests','Requests',''),
    ('reminders','Reminders',''),('values','Values',''),('service','Service',''),
    ('expenses','Expenses',''),('documents','Documents',''),('advisories','Advisories',''),
    ('archives','Archives',''),('team','My team',''),('account','Account',''),
]
CLIENT_TABS = [('overview','Overview'),('requests','Requests'),('team','My team'),('account','Account')]

def side(role, active, badge=False):
    if role == 'tech':
        items, name, who = TECH_ITEMS, 'Marcus Hale', 'Advisor'
        if badge:
            items = [(k, lab, '1' if k == 'requests' else b) for k, lab, b in items]
    else:
        items, name, who = CLIENT_ITEMS, 'James Whitfield', 'Owner'
    return f'''<aside class="side">{brand()}{nav(items, active)}
<div class="foot"><div class="foot-name">{name}</div><div class="foot-role">{who}</div><div class="foot-out">Sign out</div></div></aside>'''

def frame(role, active, main, dock='', veil='', badge=False):
    tabs = TECH_TABS if role == 'tech' else CLIENT_TABS
    return f'''<div class="app">{side(role, active, badge)}<div class="stage">
<header class="phonebar">{brand()}</header>
<main class="main">{main}</main>
{dock}
{tabs and tabs_html(tabs, active)}
{veil}
</div></div>'''

def tabs_html(items, active):
    return tabs(items, active)

def rule():
    return '<div class="hd-rule"><i></i><b></b><i></i></div>'

def header(eye, title, sub):
    return f'''<header class="page-head"><div class="hd-eyebrow">{eye}</div><h1 class="page-title">{title}</h1>{rule()}<p class="page-sub">{sub}</p></header>'''

def svc(name, price, desc, meta, flag=False):
    fl = ' <span class="flag">Please check</span>' if flag else ''
    return f'''<article class="svc"><div class="svc-top"><div class="svc-name">{name}</div><div class="svc-side"><div class="svc-price">{price}</div><div class="acts"><span>Edit</span><span>Remove</span></div></div></div><div class="svc-desc">{desc}</div><div class="svc-meta">{meta}{fl}</div></article>'''

def menu_row(name, price, desc, meta):
    return f'''<article class="svc"><div class="svc-top"><div class="svc-name">{name}</div><div class="svc-price">{price}</div></div>
<div class="svc-desc">{desc}</div><div class="est">{meta}</div></article>'''

def photo(kind):
    return f'<div class="photo">{SVG[kind]}</div>'

def car(kind, name, plate, note, on=False):
    cls = 'car on' if on else 'car'
    return f'''<article class="{cls}">{photo(kind)}<div><div class="car-name">{name}</div><div class="plate">{plate}</div><div class="car-note">{note}</div></div></article>'''

REVIEW = f'''
<div class="split review"><div>
{header('Price list','Review draft','From haleatelier.com · private until you publish')}
<div class="cat">Exterior</div>
{svc('Signature hand wash','$185','Foam, decontamination, and a hand dry.','2 hours · Found on haleatelier.com/services')}
{svc('Paint correction','from $850','Two-stage polish for swirl and light marks.','1 day · Found on haleatelier.com/services')}
<div class="cat">Interior</div>
{svc('Cabin restoration','$240','Leather, carpets, and vents, by hand.','3 hours · Found on haleatelier.com/services')}
<div class="cat">Ceramic</div>
{svc('Ceramic coating, 3-year','from $1,800','Paint and glass, after correction.','2 days · Found on haleatelier.com/services')}
{svc('Paint protection film, front','On request','The page did not state coverage or a price.','Duration not found · Found on haleatelier.com/services', True)}
<div class="cat">Maintenance</div>
{svc('Pre-storage inspection','$320','Fluids, battery, and a written note.','90 min · Found on haleatelier.com/care')}
<div class="add">+ Add a service</div>
</div>
<aside class="rail"><h3>Publish</h3><button class="btn-p" type="button">Publish to my clients</button>
<p>Nothing is visible to your clients until you publish. Gold “Please check” items need your eye first.</p></aside>
</div>'''

DOCK_REVIEW = '''<div class="dock"><button class="btn-p" type="button">Publish to my clients</button>
<p>Nothing is visible to clients until you publish.</p></div>'''

EMPTY = f'''<div class="col">
{header('Account','Marcus Hale','Advisor · Hale Atelier')}
<div class="sh"><h2>My website &amp; price list</h2></div>
<p class="lead">Clients see a services menu only after you publish. A draft stays on your profile.</p>
<div class="field"><label class="lab">Business website</label><div class="inp focus"><em>Paste your website address</em></div></div>
<div class="check"><i class="box"></i><span>I own this website, or I am allowed to use its wording and prices.</span></div>
<div class="field"><label class="lab">Pay / book on my site <span class="opt">Optional</span></label><div class="inp"><em>Paste a pay or booking page</em></div>
<p class="help">Opens your own page in the browser. Shown on your profile as your site. EvoAI does not take payment.</p></div>
<button class="btn-p" type="button">Draft my price list with AI</button>
<div class="empty-note">No services yet. The draft is for you to edit. Clients see nothing until you publish.</div>
</div>'''

PUBLISHED = f'''<div class="col pub">
{header('Price list','Published','Clients with access can open this menu')}
<div class="stat"><b>Last updated</b><span>16 Nov 2026</span></div>
<div class="linkrow"><b>haleatelier.com</b><span>Your website</span></div>
<div class="linkrow"><b>haleatelier.com/book</b><span>Pay / book · your site</span></div>
<p class="help" style="margin:8px 0 12px">The pay link opens your own page, outside EvoAI. Nothing is charged in the app.</p>
<div class="cat">Exterior</div>
{menu_row('Signature hand wash','$185','Foam, decontamination, and a hand dry.','Listed estimate · 2 hours')}
{menu_row('Paint correction','from $850','Two-stage polish for swirl and light marks.','Listed estimate · 1 day')}
<div class="cat">Interior</div>
{menu_row('Cabin restoration','$240','Leather, carpets, and vents, by hand.','Listed estimate · 3 hours')}
<div class="cat">Ceramic</div>
{menu_row('Ceramic coating, 3-year','from $1,800','Paint and glass, after correction.','Listed estimate · 2 days')}
<p class="help" style="margin-top:10px">Reads your site again and opens a draft. It does not change the live menu.</p>
<button class="btn-g" type="button" style="margin-top:8px">Refresh from website</button>
</div>'''

REFRESH = f'''<div class="split"><div>
{header('Price list','Changes to approve','Your published menu is unchanged')}
<div class="stat"><b>Still live</b><span>16 Nov 2026</span></div>
<article class="diff"><div class="diff-k">Price change</div>
<div class="svc-name">Signature hand wash</div>
<div class="chg"><s>$185 published</s><span class="arrow">→</span><b>$210 on your site</b></div>
<div class="svc-meta">2 hours · Found on haleatelier.com/services</div></article>
<article class="diff"><div class="diff-k">New service <span class="flag">Please check</span></div>
<div class="svc-top"><div class="svc-name">Wheel faces, ceramic</div><div class="svc-price">from $420</div></div>
<div class="svc-desc">The page offered a starting price and no duration.</div>
<div class="svc-meta">Duration not found · Found on haleatelier.com/wheels</div></article>
<p class="lead" style="margin-top:12px">The other four published services match the site.</p>
</div>
<aside class="rail"><h3>Approve</h3>
<div class="btn-row"><button class="btn-p" type="button">Publish these changes</button>
<button class="btn-g" type="button">Keep current list</button></div>
<p>Refreshing never publishes on its own. Clients still see the 16 Nov menu until you publish.</p></aside>
</div>'''

DOCK_REFRESH = '''<div class="dock"><div class="btn-row"><button class="btn-p" type="button">Publish these changes</button>
<button class="btn-g" type="button">Keep current list</button></div>
<p>Clients still see the 16 Nov menu until you publish.</p></div>'''

CLIENT = f'''<div class="menu-wrap menu">
{header('Your team','Hale Atelier','Marcus Hale · Detailer')}
<p class="lead">Authorized on your DBS and E-Type. Listed prices are estimates until they confirm.</p>
<a class="ext" href="#pay"><div><div class="ext-k">Pay / book on their site</div><div class="ext-n">haleatelier.com/book · Leaves EvoAI. Their own site.</div></div><span class="ext-go">Open</span></a>
<div class="sh"><h2>Services &amp; prices</h2></div>
<div class="cat">Exterior</div>
{menu_row('Signature hand wash','$185','Foam, decontamination, and a hand dry.','Listed estimate · 2 hours')}
{menu_row('Paint correction','from $850','Two-stage polish for swirl and light marks.','Listed estimate · 1 day')}
<div class="cat">Interior</div>
{menu_row('Cabin restoration','$240','Leather, carpets, and vents, by hand.','Listed estimate · 3 hours')}
<div class="cat">Ceramic</div>
<div class="pick">
{menu_row('Ceramic coating, 3-year','from $1,800','Paint and glass, after correction.','Listed estimate · 2 days')}
<button class="btn-p" type="button" style="margin-top:8px">Request this service</button>
</div>
</div>'''

CARS = (
    car('dbs','2019 Aston Martin DBS Superleggera','AM·DBS19','<em>On their access</em>', True)
    + car('etype','1967 Jaguar E-Type Series 1','JAG·67','<em>On their access</em>', True)
    + car('gt3','2021 Porsche 911 GT3','GT3·21','<em>Shared for this request only.</em> Standing access stays as it is.', True)
)

SHEET = f'''<div class="veil"><div class="sheet"><div class="grab"></div>
<h2>Request this service</h2>{rule()}
<div class="sheet-k">Ceramic coating, 3-year</div>
<div class="sheet-p">Listed from $1,800 · an estimate until they confirm</div>
<label class="lab">Which vehicles</label>
<div class="cars">{CARS}</div>
<p class="help" style="margin:6px 0 8px">Choose cars they may already see, or share another car with this request only.</p>
<div class="row2"><div class="field"><label class="lab">From</label><div class="inp focus">Thu 20 Nov</div></div>
<div class="field"><label class="lab">To</label><div class="inp">Sat 22 Nov</div></div></div>
<div class="field"><label class="lab">Note <span class="opt">Optional</span></label><div class="inp">Side entrance. GT3 is in bay two.</div></div>
<div class="field"><label class="lab">Photos <span class="opt">Optional</span></label><div class="phrow"><div class="ph">{SVG['dbs']}</div><div class="ph addph">+ Add photo</div></div></div>
<button class="btn-p" type="button">Send request</button>
</div></div>'''

REQUEST_BG = f'''<div class="menu-wrap" style="opacity:.45">
{header('Your team','Hale Atelier','Marcus Hale · Detailer')}
<div class="sh"><h2>Services &amp; prices</h2></div>
{menu_row('Ceramic coating, 3-year','from $1,800','Paint and glass, after correction.','Listed estimate · 2 days')}
</div>'''

SENT = f'''<div class="confirm">
{header('Client request','Request sent','This went to Marcus Hale')}
<div class="sum">
<div><dt>Service</dt><dd>Ceramic coating, 3-year</dd></div>
<div><dt>Listed price</dt><dd>from $1,800 · estimate</dd></div>
<div><dt>Vehicles</dt><dd>DBS Superleggera, E-Type, and 911 GT3</dd></div>
<div><dt>Window</dt><dd>Thu 20 Nov – Sat 22 Nov</dd></div>
<div><dt>Sent to</dt><dd>Marcus Hale · Client Request</dd></div>
</div>
<p class="lead">He will confirm a time or send an estimate. You are not charged in EvoAI. A pay link, if he shows one, opens his own site.</p>
</div>'''

INCOMING = f'''<div>
{header('Requests','Client requests','From your clients')}
<div class="tabs"><span class="tab on">New <i class="cnt">1</i></span><span class="tab">Accepted</span><span class="tab">Scheduled</span><span class="tab">Done</span></div>
<article class="rq">
<div class="rq-top"><div><div class="cl">James Whitfield</div><div class="when">Just now · from your price list</div></div><span class="pill">New</span></div>
<div class="dl">
<div><dt>Service</dt><dd>Ceramic coating, 3-year</dd></div>
<div><dt>Listed price</dt><dd>from $1,800 · your list, an estimate until you confirm</dd></div>
<div><dt>Vehicles</dt><dd><ul class="vlist">
<li>2019 Aston Martin DBS Superleggera · AM·DBS19 · <em>on your access</em></li>
<li>1967 Jaguar E-Type Series 1 · JAG·67 · <em>on your access</em></li>
<li>2021 Porsche 911 GT3 · GT3·21 · <em>shared for this request only</em></li>
</ul></dd></div>
<div><dt>Window</dt><dd>Thu 20 Nov – Sat 22 Nov</dd></div>
<div><dt>Note</dt><dd>Side entrance. GT3 is in bay two.</dd></div>
</div>
<div class="phrow" style="margin-top:8px"><div class="ph">{SVG['dbs']}</div></div>
<div class="rq-acts"><button class="btn-p" type="button">Accept</button><button class="btn-g" type="button">Send estimate</button><button class="btn-g" type="button">Reply</button></div>
<p class="note">Send estimate uses your existing estimate. Accepting does not charge the client.</p>
</article>
<div class="peek"><b>Elena Marsh</b> · <span>1967 Jaguar E-Type · Detailing · New</span></div>
</div>'''

PAGES = {
'01-tech-empty.html': ('My website and price list — empty', 'tech', 'account', EMPTY, '', ''),
'02-tech-review.html': ('Review draft price list', 'tech', 'account', REVIEW, DOCK_REVIEW, ''),
'03-tech-published.html': ('Published price list', 'tech', 'account', PUBLISHED, '', ''),
'04-tech-refresh.html': ('Refresh changes for approval', 'tech', 'account', REFRESH, DOCK_REFRESH, ''),
'05-client-menu.html': ('Services and prices', 'client', 'team', CLIENT, '', ''),
'06-client-request.html': ('Request this service', 'client', 'team', REQUEST_BG, '', SHEET),
'07-client-sent.html': ('Request sent', 'client', 'team', SENT, '', ''),
'08-tech-incoming.html': ('Incoming client request', 'tech', 'requests', INCOMING, '', '', True),
}

INDEX_LINKS = [
('01-tech-empty.html','1 · Tech profile · empty price list'),
('02-tech-review.html','2 · Tech · AI draft in review'),
('03-tech-published.html','3 · Tech · published, with external pay link'),
('04-tech-refresh.html','4 · Tech · refresh, changes await approval'),
('05-client-menu.html','5 · Client · services and prices'),
('06-client-request.html','6 · Client · request this service'),
('07-client-sent.html','7 · Client · request sent'),
('08-tech-incoming.html','8 · Tech · incoming Client Request'),
]

def main():
    for name, spec in PAGES.items():
        title, role, active, main_html, dock, veil = spec[:6]
        badge = spec[6] if len(spec) > 6 else False
        html = head(title) + frame(role, active, main_html, dock, veil, badge) + '</body></html>\n'
        (ROOT / name).write_text(html)
        print(name, len(html))
    items = '\n'.join(f'<li><a href="{h}">{t}</a></li>' for h, t in INDEX_LINKS)
    index = head('EvoAI price list mockups') + f'''<main class="main" style="overflow:auto"><div class="col">
{header('Mockups','Price list','Not in the app · for owner approval')}
<p class="lead">Static screens only. Open a page, or use the PNG pairs in screenshots/.</p>
<ul class="lead">{items}</ul></div></main></body></html>\n'''
    # index is a simple document, not the app frame
    (ROOT / 'index.html').write_text(head('EvoAI price list mockups') + f'''<div class="app"><div class="stage"><header class="phonebar">{brand()}</header><main class="main" style="overflow:auto"><div class="col" style="max-width:640px;margin:0 auto">
{header('Mockups','Price list','Static screens for owner approval. Not in the app.')}
<ol class="lead" style="padding-left:1.2em">{items}</ol>
<p class="help">Phone shots are 390×844. Desktop shots are 1280×800. See REPORT.md.</p>
</div></main></div></div></body></html>\n''')
    print('index')

if __name__ == '__main__':
    main()
