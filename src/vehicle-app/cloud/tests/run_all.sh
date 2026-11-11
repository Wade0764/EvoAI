#!/bin/bash
# Rebuild the single HTML, syntax/ASCII check, then run the mocked e2e suite. Optional: python3 live_probe.py (read-only, anon key).
set -e
cd "$(dirname "$0")/.."
mkdir -p screens /tmp/logoshot /opt/cursor/artifacts/roles
python3 tools/build_cloud.py
python3 - <<'PY'
import re
h=open('evoai-cloud.html',encoding='utf-8').read()
assert all(ord(c)<128 for c in h),'non-ascii'
s=re.findall(r'<script>(.*?)</script>',h,re.S);open('/tmp/_main.js','w').write(s[1])
assert 'service_role' not in h.lower()
print('ascii ok; scripts',len(s))
PY
node --check /tmp/_main.js
# v27: make sure 8765 is free, then keep the test server alive (restart if it dies) for the whole run
fuser -k 8765/tcp >/dev/null 2>&1 || true
for i in $(seq 1 20); do ss -ltn | grep -q ':8765 ' || break; sleep 0.5; done
( while true; do python3 -m http.server 8765 >/dev/null 2>&1; sleep 0.3; done ) & echo $! >/tmp/_srv.pid
trap 'kill $(cat /tmp/_srv.pid) 2>/dev/null || true; fuser -k 8765/tcp >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8765/evoai-cloud.html && break; sleep 0.25; done
node tests/e2e.js
node tests/safe_area.js
node tests/identify.js
node tests/value.js
node tests/team.js
node tests/portfolio.js
node tests/dz_safe.js
node tests/docai.js
node tests/phototag.js
node tests/large.js
node tests/vehicle_v15.js
node tests/photofix.js
node tests/charts.js
node tests/vin.js
node tests/sizefix.js
node tests/doc_thumbs.js
node tests/replica_add.js
node tests/missing.js
node tests/import.js
node tests/costcheck.js
node tests/undo.js
if [ -f tests/wade_import.js ] && [ -f tests/fixtures/Vehicle_Asset_List.pdf ]; then
  node tests/wade_import.js
else
  echo "skip wade_import (private fixture is not in the repo)"
fi
node tests/roles41.js
node tests/roles_logic.js
node tests/presshold.js
node tests/values25b.js
node tests/signup.js
node tests/formsafe.js
node tests/rename.js
node tests/sort.js
node tests/refresh_brief.js
node tests/inspect.js
node tests/service_scan.js
node tests/portfolio_pick.js
node tests/binder.js
node tests/todo.js
node tests/logo_bar.js
