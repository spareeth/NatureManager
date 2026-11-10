#!/usr/bin/env bash
# Add a person to the platform on a server: create (or find) their sign-in account and give them a role
# in Terra. They then sign in with a magic link sent to their email.
#
#   SUPABASE_URL=https://api.example.org SERVICE_ROLE_KEY=... PSQL="docker exec -i supabase-db psql -U postgres" \
#     scripts/deploy/add_member.sh someone@expocitydubai.ae manager "Full Name" ["Team name"]
#
# Roles: owner, manager, field_manager, curator, green_team, field_engineer (several: "green_team,curator").
# Teams (optional): as created by supabase/seed/01_organisation.sql, e.g. "Green Team East".
set -euo pipefail
email="${1:?email}"; roles="${2:?roles}"; name="${3:?display name}"; team="${4:-}"
: "${SUPABASE_URL:?}" "${SERVICE_ROLE_KEY:?}"
# The database: PSQL (e.g. "docker exec -i supabase-db psql -U postgres -d postgres") or DATABASE_URL.
q() { if [ -n "${PSQL:-}" ]; then $PSQL "$@"; else psql "${DATABASE_URL:?set PSQL or DATABASE_URL}" "$@"; fi; }

# 1. The account (Supabase Auth admin API; email already confirmed so the magic link works at once).
uid=$(curl -sf -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\": \"$email\", \"email_confirm\": true, \"user_metadata\": {\"display_name\": \"$name\"}}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' 2>/dev/null) || true
if [ -z "${uid:-}" ]; then
  uid=$(q -qAt -c "select id from auth.users where lower(email) = lower('$email')")
fi
[ -n "$uid" ] || { echo "could not create or find $email" >&2; exit 1; }

# 2. The membership (role, display name, team) in Terra.
q -v ON_ERROR_STOP=1 -q <<SQL
insert into membership (organisation_id, user_id, roles, display_name, team_id)
select o.id, '$uid', string_to_array('$roles', ','), '$name',
       (select t.id from team t where t.organisation_id = o.id and t.name = nullif('$team', ''))
from organisation o where o.slug = 'terra'
on conflict (organisation_id, user_id) do update
  set roles = excluded.roles, display_name = excluded.display_name, team_id = excluded.team_id;
SQL
echo "$email: $roles in Terra (user $uid)"
