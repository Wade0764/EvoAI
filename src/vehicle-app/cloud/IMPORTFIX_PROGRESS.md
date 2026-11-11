# Import fix (v24) progress
- p24_importfix.js + patches_importfix.py + importfix.css: done; build OK.
- Fixed: otherpf crash (pfName undefined); xlsx legend rows not counted; p21 runtime overrides re-installed (imTabNew24/imTabChanges24/imSave24 + cost check).
- Tests updated: import.js 67/0, undo.js 36/0, costcheck.js 52/0, wade_import.js 45/0 (added to run_all.sh).
- publish-cloud-next12 built, sw CACHE evoai-shell-v24-importfix (cloud/sw.js updated). No PDF in publish dir.
- First run_all: only docai timeout under load (docai passes alone). Re-running run_all.
- TODO: final run_all result, screenshot check, rebuild next12 if build changed, kill :8765.
- run_all: see final report
- DONE 20:25 ET: run_all EXIT 0 (all suites incl. wade_import 45/0); next12 index.html == build; :8765 killed, :8770 kept. Report delivered.
- 20:31 ET new task: VIN identity rule (differing VINs = different cars; decode WMI/VDS)
- VIN rule implemented in p24 (imVinClean dashes, imVinDecode WMI/VDS, imVinRulesOut in pass1+2, flags). Next: tests
- wade_import 53/0 with VIN unit cases; running run_all
- run_all done; next12 rebuilt with VIN rule

## 2026-10-27 15:00 ET task: press-hold mockups (screens/ph-01..05) + duplicate analysis
- 15:20 ET ph mockups done: tools/patches/ph_mock.js + tests/ph_mock.js -> screens/ph-01..05.png (Wade 13-car fixture, Bentley set to 2007). Not in build, not in run_all.
- Dup analysis: likely dups row1 Fiat Jolly 1961 (=Fiat 500 1961), row13 VW T1 BH323827 (=VW Type 2 1965), row8 Speedster 118613721 (maybe =550 Spyder replica / 356); row15 pink Jolly 1970 low. Report only.

## 2026-10-27 15:05 ET: press-hold build (migration_017, p25, presshold.js, next13)
- 15:10 ET scope added: dup prompt aliases + unmatched summary + Merge duplicates (server fn in 017, merge log undo), mockups mg-01..03 first. Same next13.
- 15:40 ET migration_017 + rollback written; pglite sort_merge 44/44, verification 14/14 ok, applied twice, rollback+reapply ok; reg017 older suites unchanged. Note: photo/doc path checks now use folder_vehicle_id (files stay in original folder after merge); forbid_change keeps 003 claiming exception.
- 15:26 ET v25: p25_presshold.js + p25_import_alias.js + presshold.css + patches_presshold.py wired in build_cloud.py; mock R017 rpc handlers (S.no017 to simulate missing migration); schema_cols vehicles +sort_order/created_by/merged_into, +vehicle_merges.
  presshold.js 57/0, wade_import 61/0 (alias rows 1,13 same; 8 prompt default new; 15,16 new). mg-01/02/02b/03 screens. sw CACHE evoai-shell-v25-presshold. SQL served :8772 (/tmp/sqlserve017). run_all running -> /tmp/runall25.log. TODO: next13 publish after EXIT 0.
- 15:37 ET: run_all EXIT 0 (presshold 57/0, wade_import 61/0); publish-cloud-next13 built (index==build, CACHE v25-presshold, no PDF).

## v26 (next14) progress - 2026-10-27
- Touch hold hardening done (presshold.js green). Edge fn estimate-value: reasons first/collection, collection_start, monthly cap, richer prompt+comps, reviewReasons, missing list; deno 26/26.
- migration_018_value_queue.sql + rollback; pglite value_queue_pglite.mjs ALL OK. report_value_review.sql (read-only).
- Client p25b_values.js: queue+progress, sweep on loadAll, Refresh values now, review flags, basis/swing trend fix. tests/values25b.js 22/0. charts.js adapted.
- CACHE -> evoai-shell-v26-values. run_all in progress.
- v26 motorcycles: isMoto (body_class/notes type/make), moto cache key, bike typical miles, motoRule comps, >$500k/<$500 sanity; deno 27/27. App has no vehicle-type field/Motorcycle option (only body_class from VIN decode). run_all re-run.
- 18:3x: final run_all disrupted: another agent edited tools (p28_rename, p29_sort, build_cloud.py 18:14-18:21) and port 8765 server died (large.js ERR_CONNECTION_REFUSED). next14 index = build from ~17:30 (pre-p28/p29). Suites passed individually.
- v27 integration: runner keeps 8765 alive; chain_018_020 pglite ALL OK; reg020 shows old invite SQL tests expect raised errors (019 now returns {error}) - expected; trim-sug CSS 13px/grey -> 15px/#F2F0EB. Full run_all started 18:5x.
- v27-release: run_all ra7 EXIT 0 single run, 0 fails; publish-cloud-next15 built (index==evoai-cloud.html, sw v27-release, ASCII, no PDF).
- 019 co-owner create check: not a bug (old test expected 32-char code; 019 issues 8-char). Old SQL tests updated (rpc_err/rpc_denied, length in (8,32)); reg020 no new fails; 019 unchanged; app unchanged.
## v28 refresh_brief started 20:54 ET
- p30 + tests/refresh_brief.js 26/0; running run_all -> /tmp/runall28.log
- run_all #1 stopped on phototag timing flake (passes alone); re-running 21:32
- 21:44 ET run_all EXIT 0 (refresh_brief 26/0); publish-cloud-next16 built (CACHE v28-refresh). Not published.
