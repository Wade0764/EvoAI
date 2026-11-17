// Source only. Do not deploy this from the review branch.
// Fixture mode never fetches and never calls a model.
import { parsePricePage, robotsAllows, safeHttps, sameHost } from './parse.js';

const MAX_BYTES = 200000;
const MAX_PAGES = 3;
const TIMEOUT_MS = 8000;

function fixtureHtml(): string {
  return `<!doctype html><html><body>
<h2>Exterior</h2>
<h3>Signature hand wash</h3><p>Foam, decontamination, and a hand dry.</p><p>$185 - 2 hours</p>
<h3>Paint correction</h3><p>Two-stage polish for swirl and light marks.</p><p>from $850 - 1 day</p>
<h2>Interior</h2>
<h3>Cabin restoration</h3><p>Leather, carpets, and vents, by hand.</p><p>$240 - 3 hours</p>
<h2>Ceramic</h2>
<h3>Ceramic coating, 3-year</h3><p>Paint and glass, after correction.</p><p>from $1800 - 2 days</p>
<h3>Paint protection film, front</h3><p>The page did not state coverage or a price.</p>
<h2>Maintenance</h2>
<h3>Pre-storage inspection</h3><p>Fluids, battery, and a written note.</p><p>$320 - 90 min</p>
</body></html>`;
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    chunks.push(step.value);
    if (total >= MAX_BYTES) break;
  }
  try { await reader.cancel(); } catch (_e) { /* already closed */ }
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, n), off);
    off += n;
    if (off >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status >= 300 && res.status < 400) throw new Error('redirect_blocked');
  if (!res.ok) throw new Error('fetch_failed');
  return readLimited(res);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { return Response.json({ error: 'bad_json' }, { status: 400 }); }
  if (body.attest !== true) return Response.json({ error: 'attestation_required' }, { status: 400 });
  const page = safeHttps(String(body.url || ''));
  if (!page) return Response.json({ error: 'https_url_required' }, { status: 400 });

  const offline = body.fixture === true || Deno.env.get('DRAFT_OFFLINE') === '1';
  // A model pass is optional and is not called from fixture mode, and not called
  // unless ANTHROPIC_API_KEY is present. This review build does not set that key.
  const aiKey = offline ? '' : (Deno.env.get('ANTHROPIC_API_KEY') || '');

  let pages: { url: string; html: string }[] = [];
  if (offline) {
    pages = [{ url: page.origin + '/services', html: fixtureHtml() }];
  } else {
    const robotsUrl = page.origin + '/robots.txt';
    let robots = '';
    try { robots = await getText(robotsUrl); } catch (_e) { robots = ''; }
    if (!robotsAllows(robots, page.pathname || '/')) {
      return Response.json({ error: 'robots_disallow' }, { status: 403 });
    }
    const html = await getText(page.href);
    pages.push({ url: page.href, html });
    const links = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
    for (const href of links) {
      if (pages.length >= MAX_PAGES) break;
      if (!sameHost(page.href, href)) continue;
      const next = new URL(href, page.href);
      if (!/service|price|menu/i.test(next.pathname)) continue;
      if (!robotsAllows(robots, next.pathname)) continue;
      if (pages.some((p) => p.url === next.href)) continue;
      try { pages.push({ url: next.href, html: await getText(next.href) }); } catch (_e) { /* skip */ }
    }
  }

  const services = pages.flatMap((p) => parsePricePage(p.html, p.url));
  return Response.json({
    draft: true,
    published: false,
    source_url: pages[0].url,
    services,
    ai: aiKey ? 'configured_not_called_in_review' : 'not_configured',
  });
});
