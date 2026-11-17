#!/bin/bash
# Prove migration 024 on a throwaway database. Does not touch the live Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${EVO_TEST_DB:-evoai_024}"
cd "$ROOT"
EXT="$(pg_config --sharedir 2>/dev/null || echo /usr/share/postgresql/16)/extension"
install_stub() {
  local name="$1"
  sudo cp "tests/local_024/ext/${name}.control" "tests/local_024/ext/${name}--1.0.sql" "$EXT/"
}
install_stub pg_cron
install_stub pg_net
sudo -u postgres psql -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}' and pid<>pg_backend_pid();" >/dev/null || true
sudo -u postgres psql -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/local_023/00_stub.sql >/tmp/evo_stub.out
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f schema.sql >/tmp/evo_schema.out
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f rls.sql >/tmp/evo_rls.out
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f storage.sql >/tmp/evo_storage.out
for f in migration_001.sql migration_002_invites.sql migration_003_managed_clients.sql migration_004_identify_log.sql migration_005_value_estimates.sql migration_005b_team_and_delete.sql migration_006_portfolio.sql migration_007_doc_ai.sql migration_008_photo_tags.sql migration_009_replica_owner_value.sql migration_010_co_owners.sql migration_011_doc_files.sql migration_012_missing_fields.sql migration_013_portfolios.sql migration_014_import_log.sql migration_015_cost_confirm.sql migration_016_import_undo.sql migration_017_sort_order.sql migration_018_value_queue.sql migration_019_short_invites.sql migration_020_collection_name.sql migration_021_portfolio_zar.sql migration_022_requests_comments.sql migration_023_roles_estimates.sql; do
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/tmp/evo_mig.out
done
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f backup_024.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f migration_024_price_lists.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/local_023/test_023.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/local_023/test_023_journeys.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/local_024/test_024.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f rollback_024.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select to_regclass('public.tech_price_lists') is null and to_regclass('public.request_vehicles') is null;"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f migration_024_price_lists.sql >/tmp/evo_reapply.out
echo "local 024 chain ok"
