#!/usr/bin/env bash
# Seed a server database after the migrations: Terra, its site, asset types and beds. The local demo users
# (03_users.sql, @terra.test addresses) are skipped; add real people with add_member.sh.
#
#   PSQL="docker exec -i supabase-db psql -U postgres -d postgres" scripts/deploy/seed_server.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
q() { if [ -n "${PSQL:-}" ]; then $PSQL "$@"; else psql "${DATABASE_URL:?set PSQL or DATABASE_URL}" "$@"; fi; }
for f in supabase/seed/01_organisation.sql supabase/seed/02_site_tg.sql supabase/seed/04_asset_types.sql \
         supabase/seed/05_locations_tg.sql; do
  echo "seeding $f"
  q -v ON_ERROR_STOP=1 -q -1 < "$f"
done
q -qAt -c "select 'organisations ' || count(*) from organisation union all
           select 'beds ' || count(*) from location where kind = 'bed' union all
           select 'asset types ' || count(*) from asset_type union all
           select 'KPI parameters ' || count(*) from kpi_parameter"
