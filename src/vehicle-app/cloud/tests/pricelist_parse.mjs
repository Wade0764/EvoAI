import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parsePricePage, robotsAllows, sameHost, safeHttps } from '../../../evoai-cloud/functions/draft-price-list/parse.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../../evoai-cloud/functions/draft-price-list/fixture.html'), 'utf8');
const page = 'https://haleatelier.com/services';
let fail = 0;
function ok(c, m){ if(c) console.log('  ok   '+m); else { fail++; console.log('  FAIL '+m); } }

const rows = parsePricePage(html, page);
ok(rows.length === 6, 'fixture yields six services ('+rows.length+')');
const film = rows.find(r => /film/i.test(r.name));
ok(film && film.needs_review && film.price_mode === 'on_request', 'unstated price is flagged please-check');
const wash = rows.find(r => /hand wash/i.test(r.name));
ok(wash && wash.price_mode === 'fixed' && wash.amount === 185 && wash.duration_label === '2 hours', 'fixed price and duration');
ok(wash && wash.source_url === page, 'source url stored on the line');
const coat = rows.find(r => /coating/i.test(r.name));
ok(coat && coat.price_mode === 'from' && coat.amount === 1800 && !coat.needs_review, 'from price is not flagged');
ok(rows.filter(r => r.category === 'Exterior').length === 2, 'exterior group');
ok(!robotsAllows('User-agent: *\nDisallow: /services\n', '/services'), 'robots disallow is honored');
ok(robotsAllows('User-agent: *\nDisallow: /private\n', '/services'), 'other paths stay allowed');
ok(robotsAllows('', '/services'), 'missing robots allows the fetch');
ok(sameHost('https://haleatelier.com/services', '/wheels'), 'same-host link allowed');
ok(!sameHost('https://haleatelier.com/services', 'https://other.example/wheels'), 'other host rejected');
ok(!safeHttps('http://haleatelier.com'), 'http rejected');
ok(!!safeHttps('https://haleatelier.com/services'), 'https accepted');
console.log('pricelist_parse: '+(fail?'FAILED':'ok'));
process.exit(fail?1:0);
