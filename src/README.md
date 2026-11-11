# EvoAI source

This folder is the build source that was not previously in the git repo. `cloud/` at the repo root remains the built app.

- `src/vehicle-app/cloud/tools/` — patch scripts. `build_cloud.py` now applies the splash and requests patches on a full rebuild, then `patches_roles.py`.
- `src/vehicle-app/cloud/base/v37-index.html` — the published v37 shell. The original Obsidian file (`vehicle-app/improved/evoai-obsidian.html`) and `evoai-cloud/PUBLIC_KEYS.txt` were not in the upload or the repo, so a from-scratch rebuild cannot run here. `build_cloud.py` applies the new patch onto this v37 shell instead.
- `src/vehicle-app/cloud/tests/` — existing Puppeteer suites plus `roles41.js`.
- `src/evoai-cloud/` — SQL through `migration_023_roles_estimates.sql`, with `backup_023.sql` and `rollback_023.sql`.

`migration_023` is not applied to the live Supabase project. Prove it locally with `src/evoai-cloud/tests/local_023/run.sh` (needs local Postgres, the `pg_cron` package, and the throwaway `pg_net` stub described in that script's header comments only if you start from an empty cluster).

Do not add `wade_asset_list.pdf`, `Vehicle_Asset_List.pdf`, or the Wade import scripts. They were left out of this tree on purpose.
