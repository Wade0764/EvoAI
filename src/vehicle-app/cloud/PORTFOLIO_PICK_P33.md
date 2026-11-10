# v33 (p33) "Which portfolio?" import step - preview only, not published, no DB changes applied
New: tools/p33_portfolio_pick.js, tools/portfolio_pick.css, tools/patches_portfolio_pick.py, tools/build_preview_portfolio.py, tests/portfolio_pick.js
Hooks: one line in tools/build_cloud.py (before `if errs:`), one line at end of tests/run_all.sh. Pre-hook copies: /tmp/build_cloud.pre_p33.py, /tmp/run_all.pre_p33.sh
DB: /workspace/evoai-cloud/migration_021_portfolio_zar.sql (+ rollback_021_portfolio_zar.sql, test tests/pglite/portfolio_zar_pglite.mjs). Order: golive_v21.sql (013/014/015) first, then 021.
Preview: publish-cloud-preview-portfolio/index.html, screens/pf-pick-0[1-4]-*.png

# v30 go-live prep (2026-10-30) - NOT applied, NOT pushed
SQL: /workspace/evoai-cloud/golive_portfolio_v30.sql + rollback_portfolio_v30.sql; test tests/pglite/golive_portfolio_v30_pglite.mjs (log tests/last_run_v30.log).
Read-only anon probe: live ALREADY has portfolios/vehicles.portfolio_id/ai_import_log/import_batches/cost_confirmed/purchase_currency, so v30 mostly re-asserts 013-015; the real change is 021 (ZAR).
Build: publish-cloud-next19/ (index.html byte-identical to next18, which already contained p33; sw.js CACHE evoai-shell-v30-portfolio). Built WITHOUT p34 binder (another agent added it to build_cloud.py/run_all.sh during this work).
Tests: /tmp/v30srv (served copy, next19 as evoai-cloud.html) /tmp/v30srv/tests/run_all_next19.sh = run_all minus build + binder: 32/32 suites pass.
