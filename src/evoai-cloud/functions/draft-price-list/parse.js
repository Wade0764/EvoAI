// Deterministic reader for a tech's own services page. No network and no model.
export function sameHost(base, link) {
  try {
    var a = new URL(base);
    var b = new URL(link, base);
    return a.protocol === 'https:' && b.protocol === 'https:' && a.host === b.host;
  } catch (e) {
    return false;
  }
}

export function safeHttps(raw) {
  try {
    var u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname || u.hostname === 'localhost') return null;
    return u;
  } catch (e) {
    return null;
  }
}

// Honor User-agent: * Disallow rules. A missing file allows the fetch.
export function robotsAllows(robots, path) {
  var text = String(robots || '');
  if (!text.trim()) return true;
  var lines = text.split(/\r?\n/);
  var star = false;
  var rules = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/#.*$/, '').trim();
    if (!line) continue;
    var m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (!m) continue;
    var key = m[1].trim().toLowerCase();
    var val = m[2].trim();
    if (key === 'user-agent') {
      star = val === '*';
    } else if (star && key === 'disallow' && val) {
      rules.push(val);
    }
  }
  var p = path || '/';
  for (var r = 0; r < rules.length; r++) {
    if (p === rules[r] || p.indexOf(rules[r]) === 0) return false;
  }
  return true;
}

function plParseStrip(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, function (tag) {
      var name = (tag.match(/^<\/?\s*([a-z0-9]+)/i) || [])[1];
      if (!name) return ' ';
      name = name.toLowerCase();
      if (tag.charAt(1) === '/') return (name === 'p' || name === 'li' || name === 'div' || name === 'h2' || name === 'h3') ? '\n' : ' ';
      if (name === 'h2') return '\n[[H2]]';
      if (name === 'h3') return '\n[[H3]]';
      if (name === 'p' || name === 'li' || name === 'br' || name === 'div') return '\n';
      return ' ';
    })
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function plParseMoney(chunk) {
  var from = chunk.match(/from\s*\$\s*([0-9][0-9,]*)/i);
  if (from) return { mode: 'from', amount: Number(from[1].replace(/,/g, '')) };
  var fixed = chunk.match(/\$\s*([0-9][0-9,]*)/);
  if (fixed) return { mode: 'fixed', amount: Number(fixed[1].replace(/,/g, '')) };
  if (/on request|price on request|call for price|poa/i.test(chunk)) return { mode: 'on_request', amount: null };
  return null;
}

function plParseDuration(chunk) {
  var m = chunk.match(/(\d+)\s*(hours|hour|hrs|hr|minutes|minute|mins|min|days|day)/i);
  if (!m) return null;
  var unit = m[2].toLowerCase();
  if (unit.charAt(0) === 'h') return m[1] + (m[1] === '1' ? ' hour' : ' hours');
  if (unit.charAt(0) === 'd') return m[1] + (m[1] === '1' ? ' day' : ' days');
  return m[1] + ' min';
}

export function parsePricePage(html, pageUrl) {
  var text = plParseStrip(html);
  var parts = text.split('\n');
  var category = 'Services';
  var current = null;
  var out = [];
  function finish() {
    if (!current || !current.name) { current = null; return; }
    var blob = current.bits.join(' ');
    var price = plParseMoney(blob);
    var dur = plParseDuration(blob);
    var desc = current.bits.filter(function (b) { return !plParseMoney(b) && !plParseDuration(b); }).join(' ').replace(/\s+/g, ' ').trim();
    if (desc.length > 280) desc = desc.slice(0, 277) + '...';
    var needs = !price;
    out.push({
      category: category.slice(0, 40),
      name: current.name.slice(0, 120),
      description: desc,
      price_mode: price ? price.mode : 'on_request',
      amount: price ? price.amount : null,
      currency: price && price.amount != null ? 'USD' : null,
      duration_label: dur,
      source_url: pageUrl,
      needs_review: needs
    });
    current = null;
  }
  for (var i = 0; i < parts.length; i++) {
    var line = parts[i].trim();
    if (!line) continue;
    if (line.indexOf('[[H2]]') === 0) {
      finish();
      category = line.replace('[[H2]]', '').trim() || 'Services';
      continue;
    }
    if (line.indexOf('[[H3]]') === 0) {
      finish();
      current = { name: line.replace('[[H3]]', '').trim(), bits: [] };
      continue;
    }
    if (current) current.bits.push(line);
  }
  finish();
  return out;
}
