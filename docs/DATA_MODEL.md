# Data model (pilot)

PostgreSQL 16 + PostGIS. All geometries EPSG:4326; metric work in EPSG:3997 (Dubai Local TM);
site grid via `site_to_local` / `site_from_local` (docs/COORDINATES.md). All times `timestamptz` (UTC).
Every business table has `organisation_id`, `created_at`, `created_by`, `updated_at`.
Column lists below are the contract. Add columns only via a new migration and update this file.

## 1. Tenancy and people

```sql
create table organisation (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}'   -- working calendar, SLA hours, locale
);

create table membership (
  organisation_id uuid references organisation not null,
  user_id uuid references auth.users not null,
  roles text[] not null,                 -- owner, manager, field_manager, curator, green_team, field_engineer
  display_name text not null,
  team_id uuid references team,
  active boolean not null default true,
  primary key (organisation_id, user_id)
);

create table team (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  name text not null,                    -- e.g. Green Team East, Irrigation, Rangers
  discipline text not null               -- living, built, both
);
```

Migration order note: create `team` before `membership` (shown after it here for reading order).

As built (migration `20260928000100_tenancy.sql`):

- `team` and `membership` also carry `created_at`, `created_by`, `updated_at` (rule above).
- `membership.roles` is checked: non-empty and a subset of the six organisation roles.
  `platform_admin` is not a membership role; operator work uses the service role.
- `team.discipline` is checked: `living`, `built` or `both`.
- `membership (team_id, organisation_id)` references `team (id, organisation_id)`, so a
  member cannot be put in another organisation's team.
- Writes are tightened: `membership` by `manager` only (no self-granted roles); `team` by
  `manager` or `field_manager`; `organisation` update by `manager`, insert only by the service role.

### RLS pattern (apply to every business table)

```sql
create function auth_org_ids() returns setof uuid
language sql stable security definer as $$
  select organisation_id from membership where user_id = auth.uid() and active
$$;

create function has_role(org uuid, r text) returns boolean
language sql stable security definer as $$
  select exists (select 1 from membership
                 where user_id = auth.uid() and organisation_id = org
                   and active and r = any(roles))
$$;

alter table <t> enable row level security;
create policy <t>_read on <t> for select using (organisation_id in (select auth_org_ids()));
create policy <t>_write on <t> for all using (organisation_id in (select auth_org_ids()))
  with check (organisation_id in (select auth_org_ids()));
-- tighten writes per table with has_role(...) where the SRS says so
```

## 2. Spatial

```sql
create table site (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  code text not null,                    -- TG (pilot); EV later
  name text not null,                    -- Terra Garden
  site_type text not null,               -- botanical_garden, nature_reserve, park, campus
  boundary geometry(MultiPolygon, 4326) not null,
  basemap_url text,                      -- XYZ or COG orthophoto
  grid_name text,                        -- Terra Garden Grid 2026
  grid_origin_e double precision,        -- EPSG:3997 easting of grid origin
  grid_origin_n double precision,        -- EPSG:3997 northing of grid origin
  grid_rotation_deg double precision not null default 0,  -- ccw from EPSG:3997 easting axis
  grid_scale double precision not null default 1,
  unique (organisation_id, code)
);

create table control_point (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  code text not null,                    -- CP-01, SG-03-A
  description text,
  geom geometry(Point, 4326) not null,
  source text not null,                  -- rtk, cad, gcp_file, total_station
  accuracy_m numeric,
  surveyed_at date,
  ref_x numeric(12,3), ref_y numeric(12,3),  -- reference position on the site grid (plan, CAD); added 11 Oct 2026
  ref_source text,                       -- plan, cad, design, gcp_file
  unique (organisation_id, code)
);

create type location_kind as enum ('zone','bed','habitat','water_body','building','sub_area','other');

create table location (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  parent_id uuid references location,
  kind location_kind not null,
  code text not null,                    -- zones EG, NG, SG, WG; beds EG-01 .. WG-10 (Hortis location names)
  name text not null,
  geom geometry(MultiPolygon, 4326) not null,
  area_m2 numeric generated always as (st_area(geom::geography)) stored,
  attributes jsonb not null default '{}', -- soil, irrigation type, habitat class, water depth
  legacy_hortis_id text,
  unique (organisation_id, code)
);
create index on location using gist (geom);

create table line_feature (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  kind text not null,                    -- path, irrigation_main, irrigation_lateral, stream, fence
  name text,
  geom geometry(MultiLineString, 4326) not null
);
```

As built (migration `20260928000200_spatial.sql`):

- PostGIS is installed in the `extensions` schema.
- All four tables carry `created_at`, `created_by`, `updated_at`; `location` has the audit trigger.
- Cross-tenant integrity by composite keys: `(site_id, organisation_id)` references `site`, and
  `location (parent_id, site_id)` references `location (id, site_id)`, so a parent is always in the
  same site. Checks: `grid_scale > 0`, grid origin E and N both set or both null, valid geometry.
- Writes: `site` (boundary and grid) by `manager`; `location`, `line_feature`, `control_point` by
  `manager` or `field_manager`. Reads by any member.
- `resolve_location(p_geom geometry, p_site uuid default null) returns uuid`: smallest location
  covering the point (a bed wins over its zone); polygons use a point on their surface; any SRID
  accepted. Security invoker, so RLS limits it to the caller's organisations; `p_site` narrows
  it for service-role scripts.

As built (migration `20261011000300_control_points.sql`, task 1.8): `control_point.ref_x`,
`ref_y`, `ref_source` (both or neither); residual = surveyed position against
`site_from_local(ref_x, ref_y)`, listed with RMSE by `control_point_list`. Functions
`site_geom_from_local` (whole geometries), `site_offset_geom`, `site_point` (WGS 84, Dubai TM or grid
input, all three returned), `nearest_bed_corner` and `asset_move_offset`. All security invoker.

## 3. Taxonomy

```sql
create table taxon (                     -- shared across organisations (no organisation_id)
  id uuid primary key default gen_random_uuid(),
  kingdom text not null,                 -- Plantae, Animalia, Fungi
  family text, genus text, specific_epithet text,
  infraspecific_rank text, infraspecific_epithet text,
  cultivar text,
  scientific_name text not null,         -- full name without authorship
  authorship text,
  rank text not null,                    -- family, genus, species, subspecies, variety, cultivar
  accepted_taxon_id uuid references taxon,
  gbif_key bigint,
  common_names jsonb not null default '{}'   -- {"en": [...], "ar": [...]}
);
create unique index on taxon (scientific_name, coalesce(authorship,''));

create table org_taxon (                 -- per-organisation attributes (Hortis custom fields land here)
  organisation_id uuid not null references organisation,
  taxon_id uuid not null references taxon,
  inhouse_code text,                     -- Terra 3-letter species code from tags, e.g. TAM, PRO, ZIZ
  iucn_category text,                    -- EX, EW, CR, EN, VU, NT, LC, DD, NE
  protection_level text,                 -- Terra/UAE protection classes, catalogue in settings
  origin text,                           -- native, endemic, naturalised, exotic, unknown
  zones_present text[],                  -- location codes
  sensitive boolean not null default false,  -- obscure coordinates
  notes text,
  legacy_hortis_id text,
  attributes jsonb not null default '{}', -- Hortis extras: life forms, climate, distribution (added 11 Oct 2026)
  primary key (organisation_id, taxon_id),
  unique (organisation_id, inhouse_code)
);
```

## 4. Assets

```sql
create type asset_class as enum ('living','built');
-- living: planned, planted, established, declining, dead, removed (FR-AST-09)
-- built:  planned, active, out_of_service, removed, disposed
create type asset_status as enum ('planned','planted','established','active','declining','dead',
                                  'removed','out_of_service','disposed');

create table asset_type (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  asset_class asset_class not null,
  code text not null,                    -- PLANT, TREE, GROUP, VALVE, PUMP, SIGN, CAMTRAP, SENSOR, AERATOR
  name text not null,
  name_ar text,                          -- Arabic name (added 3 Oct 2026, task 1.4)
  attribute_schema jsonb not null default '{}',  -- JSON Schema for asset.attributes
  icon text,
  unique (organisation_id, code)
);

create table accession (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  accession_number text not null,        -- ITF2: accession identifier
  taxon_id uuid not null references taxon,
  received_date date,
  source text,                           -- nursery, donor, wild collection, propagated in-house
  provenance_type text,                  -- ITF2: W (wild), Z (wild-derived), G (garden), U (unknown)
  collector text, collection_locality text, collection_point geometry(Point,4326),
  quantity_received int,
  notes text,
  legacy_hortis_id text,
  attributes jsonb not null default '{}', -- Hortis extras: identification fields (added 11 Oct 2026)
  unique (organisation_id, accession_number)
);

create table asset (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  location_id uuid references location,  -- auto-set by trigger from geom
  asset_type_id uuid not null references asset_type,
  tag_code text not null,                -- Terra tag, e.g. WG07-T04_PRO (kept from Hortis); new: same pattern
  barcode text,                          -- existing Code 128 if any
  name text,
  geom geometry(Geometry, 4326) not null, -- point or polygon
  local_x numeric(10,2), local_y numeric(10,2),  -- site grid metres, kept by trigger
  position_source text,                  -- gps, rtk, offset, cad, hortis, bed_centroid
  position_accuracy_m numeric,
  status asset_status not null default 'active',
  condition smallint check (condition between 1 and 5),
  criticality smallint check (criticality between 1 and 5),
  install_date date,
  -- living assets
  taxon_id uuid references taxon,
  accession_id uuid references accession,
  parent_asset_id uuid references asset,
  plant_count int,
  attributes jsonb not null default '{}',
  legacy_hortis_id text,
  unique (organisation_id, tag_code)
);
create index on asset using gist (geom);

create table asset_status_change (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  asset_id uuid not null references asset,
  from_status asset_status, to_status asset_status not null,
  reason text, changed_at timestamptz not null default now(), changed_by uuid
);

create table media (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  bucket text not null, path text not null,
  kind text not null,                    -- photo, audio, video, document
  taken_at timestamptz, geom geometry(Point,4326),
  asset_id uuid references asset, work_order_id uuid, observation_id uuid,
  caption text
);
```

As built (migration `20260928000300_taxonomy_assets.sql`):

- `asset_status` merges the SRS plant lifecycle and the built-asset states (decision 28 Sep 2026).
  A trigger rejects a status outside the asset's class; living assets must set `status`
  explicitly because the column default `active` is a built status.
- `asset` trigger keeps `local_x`, `local_y` (centroid for polygons) and sets `location_id` with
  `resolve_location` when geom changes, unless the caller sets `location_id` explicitly (keeps the
  named Hortis bed for points just outside it). Geometry must be a point or polygon.
- Status history: a trigger writes `asset_status_change` on insert and on every status change.
  Use `asset_set_status(p_asset, p_status, p_reason)` to record a reason. Clients cannot write the
  history table.
- Audit trigger on `asset` and `org_taxon` (keyed by `taxon_id`; `audit_row()` takes an optional
  key column argument).
- Checks: `taxon.rank` (adds `form`), `org_taxon.iucn_category` and `origin`,
  `accession.provenance_type`, `asset.position_source`, `media.bucket` and `kind`, and
  `media.path` starts with `<organisation_id>/`.
- Composite keys keep asset site, location (same site), type, accession and parent, and
  `asset_status_change` and `media` asset links, inside one organisation.
- All tables carry `created_at`, `created_by`, `updated_at` (except `asset_status_change`, which has
  `changed_at`, `changed_by`).
- RLS: `taxon` read by any signed-in user, insert by a curator of any organisation, update and
  delete by the service role only. `org_taxon` write by `curator` (FR-TAX-05). `asset_type` by
  `manager`. `accession` by `manager` or `curator`. `asset` and `media` by every role except
  `owner` (read-only).
- Storage buckets `photos`, `sop-media`, `audio` (private). Objects live under
  `<organisation_id>/...`; members read their organisation's folder, working roles upload,
  managers delete.
- Helpers `has_any_role(org, roles[])` and `has_role_anywhere(role)`.

As built (migration `20261003000100_asset_edit.sql`, task 1.4):

- `asset_type.name_ar` (above). `attribute_schema` custom keywords: `x-title-ar` (Arabic field
  label, next to `title`) and `x-tag-prefix` (three-letter prefix for built asset tags, for
  example `VLV`; default is the first three letters of the type code).
- `tag_pattern_ok(tag, class)`, `suggest_tag(site, geom, type, taxon, group)` (next free number
  in the bed under the point, per kind T, G or built prefix; species part is the in-house code,
  else the first three letters of the genus, else `XXX`), `check_tag(org, tag, class, asset)`
  (pattern and uniqueness) and `taxon_search(org, q)`. All security invoker.
- Open: `asset.position_source` has no value for "placed by clicking the map", so map placement
  leaves it empty unless the user picks a source.

As built (migration `20261011000100_hortis_migration.sql`, task 1.6): `org_taxon.attributes`,
`accession.attributes`; unique index on `asset (organisation_id, legacy_hortis_id)` as the
migration upsert key; schema `staging_hortis` closed to client roles; `set_updated_at()` now only
bumps `updated_at` when the row changed, so identical upserts are not audited.

As built (migration `20261011000200_taxon_pages.sql`, task 1.7): the organisation's own common
names (English and Arabic) live in `org_taxon.attributes.common_names` (`{"en": [...], "ar": [...]}`),
because shared `taxon` rows are edited by the service role only; search covers both. Curators read
`org_taxon` audit rows (FR-TAX-05 history). Functions `taxon_list`, `taxon_detail`,
`taxon_history` (field-level, attributes split per key); `taxon_search` includes organisation names.

Tag code format (Terra in-house standard, kept from Hortis): `<ZONE><BED>-T<NN>_<SPECIES>`,
e.g. `WG07-T04_PRO` = West Garden bed 07, tree 04, *Prosopis cineraria*. Planting groups without
tags get `<ZONE><BED>-G<NN>_<SPECIES>`; built assets `<ZONE><BED>-<TYPE><NN>`, e.g. `SG03-VLV02`.
Uniqueness is enforced; the 2 duplicate tags in the Hortis export must be resolved at migration.
QR payload: `https://<host>/a/<tag_code>` so a phone camera opens the record.

## 5. SOPs, PM and work orders

```sql
create table sop (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  code text not null, version int not null default 1,
  title jsonb not null,                  -- {"en": "...", "ar": "..."}
  purpose jsonb, ppe text[], hazards text[],
  status text not null default 'draft',  -- draft, approved, retired
  approved_by uuid, approved_at timestamptz,
  unique (organisation_id, code, version)
);

create table sop_step (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sop on delete cascade,
  seq int not null,
  text jsonb not null,
  input_type text not null,              -- tick, number, text, photo, choice
  choices text[], unit text,
  required boolean not null default false,
  media_path text
);

create table wo_template (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  code text not null, title text not null,
  wo_type text not null,                 -- preventive, reactive, inspection, project
  default_priority text not null default 'P3',
  sop_id uuid references sop,
  team_id uuid references team,
  est_minutes int
);

create table pm_schedule (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  template_id uuid not null references wo_template,
  target_kind text not null,             -- asset, asset_type_in_location, location
  target_asset_id uuid references asset,
  target_asset_type_id uuid references asset_type,
  target_location_id uuid references location,
  rule jsonb not null,                   -- {"freq":"weekly","interval":1,"byweekday":[0,1,2,3,4]}
                                         -- {"freq":"daily"} {"freq":"monthly","bymonthday":[1]}
                                         -- {"season":{"from_month":10,"to_month":4}}
                                         -- optional: "interval":N, "start":"yyyy-mm-dd" (anchor),
                                         -- "each":"bed" (one work order per bed under the location)
  max_per_day int,                       -- load spreading
  horizon_days int not null default 14,
  active boolean not null default true,
  last_generated_until date
);

create type wo_status as enum ('requested','approved','scheduled','in_progress','on_hold',
                               'completed','verified','closed','cancelled');

create table work_order (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  number text not null,                  -- WO-2026-000123
  site_id uuid not null references site,
  location_id uuid references location,
  template_id uuid references wo_template,
  pm_schedule_id uuid references pm_schedule,
  source text not null,                  -- pm, request, observation, alert, manual
  source_ref uuid,                       -- observation_id or alert_id
  wo_type text not null,
  title text not null, description text,
  priority text not null default 'P3',   -- P1..P4
  status wo_status not null,
  due_at timestamptz,
  planned_start timestamptz, planned_end timestamptz,
  assignee_user_id uuid, team_id uuid references team,
  sop_id uuid references sop,            -- version pinned at dispatch
  est_minutes int, actual_minutes int,
  materials jsonb not null default '[]', -- [{"item":"mulch","qty":2,"unit":"m3"}]
  completion_notes text,
  geom geometry(Point,4326),
  client_uuid uuid unique,               -- offline idempotency
  unique (organisation_id, number)
);

create table work_order_asset (
  work_order_id uuid references work_order on delete cascade,
  asset_id uuid references asset,
  primary key (work_order_id, asset_id)
);

create table work_order_event (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  work_order_id uuid not null references work_order,
  from_status wo_status, to_status wo_status not null,
  note text, geom geometry(Point,4326),
  actor uuid, at timestamptz not null default now(),   -- null only for system events (12 Oct 2026)
  source text not null default 'user',   -- user, system
  client_uuid uuid unique
);

create table sop_response (
  work_order_id uuid references work_order on delete cascade,
  sop_step_id uuid references sop_step,
  value jsonb, media_id uuid references media,
  answered_by uuid, answered_at timestamptz,
  primary key (work_order_id, sop_step_id)
);
```

`wo_transition(p_wo uuid, p_to wo_status, p_note text, p_geom geometry default null)`:
checks the SRS 3.4.1 table with `has_role`, blocks `completed` if required SOP steps are missing,
blocks the assignee from verifying their own job, writes `work_order_event`, updates status.

As built (migration `20261012000100_work_orders.sql`, task 2.1):

- `sop_step`, `work_order_asset` and `sop_response` also carry `organisation_id` (the every-business-table
  rule above); all tables carry created/updated columns, and composite keys keep references inside one
  organisation. `location` gained `unique (id, organisation_id)` for that.
- Checks: SOP `title` and step `text` need an `en` key; `choice` steps need choices; `wo_type`, `priority`
  (P1..P4), `source`, step `input_type` and SOP `status` take only the listed values; a PM schedule's target
  columns must match its `target_kind`; `rule.freq` is daily, weekly or monthly.
- Numbering: `work_order.number` is assigned on insert from `wo_number_seq` per organisation and year
  (Asia/Dubai): `WO-2026-000123`.
- Status changes only through `wo_transition()` (task 2.2): a trigger refuses any other change of
  `work_order.status`. `work_order_event` is insert-only through that function.
- RLS: members read. SOPs, steps, templates and schedules: `manager`. Work orders: any member may raise
  one in `requested` (FR-WO-06); `manager` and `field_manager` create in any status and edit all; the
  assignee or a member of the assigned team edits their own (notes, minutes, materials) and answers SOP
  steps. Helper `wo_is_mine(org, assignee, team)`.
- Audit trigger on `sop` and `pm_schedule`. `media.work_order_id` now references `work_order`.

As built (migration `20261012000200_wo_transition.sql`, task 2.2):

- `wo_transition(p_wo, p_to, p_note, p_geom, p_client_uuid)` applies the SRS 3.4.1 table, stored in
  `wo_transition_rule` (shared, read-only reference data). "Assignee" means the assigned user or a member
  of the assigned team. Refusals: a pair not in the table `22023`; a listed pair by the wrong person
  `42501`; not a member of the work order's organisation `P0002` (same as not found).
- Extra checks: scheduling needs an assignee or a team; `completed` needs every required SOP step answered
  (`wo_missing_steps`: a tick must be true, a photo step needs `media_id`); `verified` is refused for the
  assignee, team members and whoever completed the job; a failed verification (completed to in_progress)
  needs a reason.
- Writes the event (from, to, note, GPS, actor, client_uuid). A repeated `client_uuid` returns the first
  result with `replayed: true`; reusing it for a different transition is refused.
- `wo_allowed_transitions(p_wo)` lists the transitions the caller may make now (for the UI).

As built (migration `20261012000300_pm_generator.sql`, task 2.3):

- `pm_generate(org, until)`: periods from `pm_periods` (daily every N days; weekly ISO weeks every N, on
  `byweekday` 0 = Monday or the working days from `organisation.settings.work_week`; monthly every N on
  `bymonthday` or working days; `season` windows may wrap the year end), targets from `pm_targets` (asset;
  live assets of a type in a location and below it; a location, or with `"each"` every location of that kind
  below it). Load spreading: a period's work is divided evenly over its open days, never above
  `max_per_day`; the rest goes to the last day and is reported as `over_capacity`.
- Idempotent: each work order's `client_uuid` is derived from schedule, target and period, so re-runs
  create nothing and a job moved to another day is not recreated. Status `scheduled` when the template has
  a team, else `approved`; SOP pinned to the latest approved version of the template SOP's code; 07:00
  Dubai start, due the same day. Managers and field managers may run it; signed-in others are refused.
- `wo_autoclose()`: verified for more than 24 h becomes closed with a system event (`actor` null,
  `source = 'system'`; user events must have an actor).
- `pg_cron`: `pm-generate-nightly` (`pm_generate_all`, 00:30 Dubai) and `wo-autoclose-hourly`.

As built (migration `20261012000400_wo_board.sql`, task 2.4):

- SLA (FR-WO-11): hours per priority from `organisation.settings.sla_hours` (default P1 4, P2 24, P3 72,
  P4 336). "Response" means work started: met when the job reaches `in_progress` within the hours after it
  was raised; breached when the time has passed and work has not started. Overdue: past `due_at` and not
  completed, verified, closed or cancelled.
- Functions (security invoker): `wo_board` (inbox, board, calendar and map list with SLA and overdue
  flags), `wo_detail`, `wo_schedule` (assign, time, then approve and schedule through `wo_transition`),
  `wo_replan` (move start keeping the duration; not once started), `wo_bulk_move` (a day's open work to
  another day), `wo_people` (members and teams for planning).

As built (migration `20261012000500_sop_library.sql`, task 2.5):

- Approved and retired SOP versions are read-only (trigger `sop_guard` on `sop` and `sop_step`): their
  title, purpose, PPE, hazards and steps cannot change and they cannot be deleted, so a work order pinned to
  a version keeps its exact steps (FR-SOP-02). New SOPs start as drafts. The guard applies to signed-in
  users; system work without a user (seed, imports) is not limited.
- `sop_new_version(p_sop)` copies a version and its steps into the next draft (one draft per code).
  `sop_approve(p_sop)` (managers only, FR-SOP-05; needs at least one step) approves the draft and retires the
  previously approved version of that code. `sop_reorder(p_sop, p_steps)` reorders a draft's steps.
  `sop_library(p_org)` lists codes with current and draft versions.
- Step images live in the private `sop-media` bucket under `<organisation_id>/sops/<sop_id>/`.

As built (migration `20261013000100_field_app.sql`, task 2.6):

- `sop_response` trigger `sop_response_guard`: answers are given only while the job is `in_progress`, only
  for steps of the job's pinned SOP version, and record who answered and when. Signed-in users only.
- `field_my_day(p_site, p_day)`: jobs of the signed-in user or their team planned for that day (Asia/Dubai),
  plus unfinished jobs from earlier days, sorted by location code. `field_job(p_wo)`: `wo_detail` plus the
  SOP steps with answers, missing required steps and photos.
- Job photos are compressed on the phone to at most 1600 px and stored in `photos` under
  `<organisation_id>/wo/<work_order_id>/`, with a `media` row (`kind = photo`, `work_order_id`).

As built (migration `20261013000200_field_scan.sql`, task 2.7): `field_scan(p_asset)` returns a scanned asset
with its open work orders (through `work_order_asset`), each marked `mine` for the signed-in user or their
team. The phone resolves the scanned text with `asset_by_code` (tag from the `/a/<tag>` label URL, or an
existing barcode).

As built (migration `20261013000300_field_offline.sql`, task 2.8):

- `field_offline_pack(p_site, p_from, p_to)` returns what the phone keeps for a shift: My day per date, the
  full job (`field_job`) for each of the user's jobs, the assets in the zones of those jobs, and the site
  extent for the map tile cache.
- Offline writes are replayed safely with client-generated ids: `wo_transition(..., p_client_uuid)` for
  status changes, `sop_response` upserts on its key, `media.id` set on the phone (photo path
  `<organisation_id>/wo/<work_order_id>/<media_id>.jpg`), and `work_order.client_uuid` plus a phone-made
  `work_order.id` for requests raised offline. No table changes.
- Status events of offline work carry the time they reached the server, not the time on the phone.

As built (migration `20261024000100_wo_verify.sql`, task 2.9): `wo_verify_queue(p_site)` lists completed
work orders with who completed them and `can_verify` (false for the assignee, their team and whoever
completed it). The supervisor checklist (work done as the SOP says, photos show the result, site left clean)
is a fixed list in the field app; a pass writes the ticked items into the `verified` event note, a fail is
`completed` to `in_progress` with the reason as the note (`wo_transition` requires it). No table changes.

## 6. Observations

```sql
create table observation (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  site_id uuid not null, location_id uuid,
  obs_type text not null,                -- flora, fauna, phenology, pest_disease, plant_health, water_quality, note
  observed_at timestamptz not null,
  geom geometry(Point,4326) not null, gps_accuracy_m numeric,
  observer uuid not null,
  asset_id uuid references asset,
  taxon_id uuid references taxon,
  count int, life_stage text, behaviour text,
  phenophase text,                       -- leafing, flowering, fruiting, senescence
  severity smallint,                     -- pests, health: 1..5
  measurements jsonb not null default '{}',  -- water quality: {"do_mg_l":5.2,"ph":7.9}
  verification text not null default 'ai_suggested', -- ai_suggested, observer_confirmed, curator_verified, rejected
  verified_by uuid, verified_at timestamptz,
  notes text,
  client_uuid uuid unique
);

create table ai_suggestion (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  observation_id uuid references observation on delete cascade,
  media_id uuid references media,
  engine text not null,                  -- plantnet, bioclip2, speciesnet, birdnet, inat
  model_version text,
  rank int not null, taxon_name text not null, taxon_id uuid,
  score numeric not null,
  in_collection boolean,                 -- taxon recorded in this location
  raw jsonb
);
```

## 7. Sensors and alerts

```sql
create table datastream (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  sensor_asset_id uuid not null references asset,
  property text not null,                -- soil_moisture, do, ph, water_temp, turbidity, water_level, air_temp
  unit text not null,                    -- %, mg/L, pH, degC, NTU, m
  simulated boolean not null default false
);

create table sensor_reading (
  datastream_id uuid not null references datastream,
  at timestamptz not null,
  value double precision not null,
  quality text default 'ok',
  primary key (datastream_id, at)
);

create table alert_rule (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  kind text not null,                    -- threshold, no_data, wo_overdue, protected_taxon_obs, asset_condition
  params jsonb not null,                 -- {"datastream_id":"...","op":"<","value":4,"for_minutes":30}
  notify_roles text[] not null,
  create_wo_template_id uuid references wo_template,
  active boolean not null default true
);

create table alert (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  rule_id uuid not null references alert_rule,
  status text not null default 'open',   -- open, acknowledged, resolved
  opened_at timestamptz not null default now(),
  subject_ref uuid, message text,
  acknowledged_by uuid, acknowledged_at timestamptz,
  resolved_by uuid, resolved_at timestamptz,
  work_order_id uuid references work_order
);

create table notification (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  user_id uuid not null, channel text not null, -- in_app, email, push
  title text not null, body text, link text,
  read_at timestamptz, created_at timestamptz not null default now()
);
```

## 8. Item requests and hand-off (docs/PROCUREMENT_HANDOFF.md)

```sql
create table item (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  code text not null, name text not null,
  category text not null,                -- plant, irrigation, soil_amendment, fertiliser, pest_control, hardware, signage, tools, ppe, other
  unit text not null,                    -- each, m, m3, kg, L, bag
  taxon_id uuid references taxon,        -- plant items
  spec jsonb not null default '{}',      -- {"pot_l":15,"height_m":1.2}
  external_code text,                    -- receiving system item/material code
  active boolean not null default true,
  unique (organisation_id, code)
);

create type item_request_status as enum ('draft','submitted','approved','rejected','sent',
  'acknowledged','rejected_by_receiver','fulfilled','cancelled');

create table item_request (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  number text not null,                  -- IR-2026-000042
  site_id uuid not null references site,
  location_id uuid references location,
  source text not null,                  -- work_order, inspection, plant_death, manager, pm_template
  work_order_id uuid references work_order,
  status item_request_status not null default 'draft',
  needed_by date,
  requested_by uuid not null, approved_by uuid, approved_at timestamptz,
  external_ref text,                     -- id in the receiving system
  sent_batch_id uuid,
  notes text,
  client_uuid uuid unique,
  unique (organisation_id, number)
);

create table item_request_line (
  id uuid primary key default gen_random_uuid(),
  item_request_id uuid not null references item_request on delete cascade,
  line_no int not null,
  item_id uuid references item,
  description text not null,
  reason text not null,                  -- maintain, replace, procure_new
  quantity numeric not null, unit text not null,
  est_unit_cost numeric, currency text default 'AED',
  asset_id uuid references asset,        -- asset being maintained or replaced
  unique (item_request_id, line_no)
);

create table item_request_event (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  item_request_id uuid not null references item_request,
  from_status item_request_status, to_status item_request_status not null,
  note text, actor uuid, actor_system text, at timestamptz not null default now()
);

create table integration_outbox (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  topic text not null,                   -- item_request.approved
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz, channel text, attempts int not null default 0, last_error text
);

create table integration_receiver (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,                    -- e.g. ECD procurement
  channel text not null,                 -- export_email, pull_api, webhook
  config jsonb not null,                 -- email address, webhook url; secrets in vault
  api_key_hash text, active boolean not null default true
);
```

`ir_transition(p_ir uuid, p_to item_request_status, p_note text)` mirrors `wo_transition`; the
`approved` transition inserts the `integration_outbox` row in the same transaction.
Trigger on `asset.status` to `dead`/`removed`: draft an `item_request` (source `plant_death`)
with one `replace` line for the same taxon and location.

As built (migration `20261024000200_item_requests.sql`, task 2.10):

- `item_request.requested_by` is nullable, only for system drafts (`source` `plant_death` or `inspection`)
  made with no signed-in user, such as the Hortis import (decision 24 Oct 2026, like the work order event
  actor). When a person changes the asset, they are the requester.
- `item_request_line` and `item_request_event` carry `organisation_id` (rule 1); all tables have created and
  updated columns; composite keys keep items, assets, locations and work orders inside one organisation.
  Deleting an asset, item, location or work order clears the link and keeps the request and its lines.
  `item.unit` also allows `m2`. Numbering: `IR-YYYY-NNNNNN` per organisation and year (`ir_number_seq`).
- Status changes only through `ir_transition()` (a trigger refuses any other change). Rules are in the
  shared table `ir_transition_rule` (PROCUREMENT_HANDOFF section 3): submit or cancel by the requester or a
  planner; approve or reject (reason required) by a manager, or a field manager while the estimated total is
  within `organisation.settings.ir_field_manager_limit_aed` (default 0; lines without a cost count as 0);
  nobody approves their own request; `approved` to `sent` only by the hand-off (task 2.11); acknowledged,
  rejected by receiver (reason required) and fulfilled by hand by a manager. Submitting needs a line, and
  lines change only while the request is a draft. `approved` writes the `integration_outbox` row
  (`item_request.approved`, payload in the PROCUREMENT_HANDOFF line format) in the same transaction.
- Auto-drafts (FR-REQ-03): status `dead` or `removed` (source `plant_death`), condition dropping to 1 or 2,
  or a built asset going `out_of_service` (source `inspection`) draft one `replace` line for the asset with
  the plant item of its taxon, unless a replacement for that asset is already open. The migration backfills
  the existing data (9 dead plants and 9 in condition Poor from Hortis).
- `item_generate_plants(org)`: one active plant item per taxon (code `PLT-<in-house code>`), idempotent;
  the Hortis promote step runs it before assets.
- `ir_add_wo_items(p_wo, p_client_uuid, p_lines, p_submit)`: items needed from a work order on the phone,
  replay-safe (request by `client_uuid`, lines by id). `field_job` lists the job's item requests, and the
  offline pack carries the active catalogue.
- RLS: members read; `item` by manager; requests and lines by their requester (working roles) or a planner;
  events and the outbox are written by `ir_transition()` only; the outbox is readable by managers.

## 9. Audit

`audit_log(organisation_id, table_name, row_id, action, old jsonb, new jsonb, actor, at)` written
by a generic trigger on asset, org_taxon, location, sop, pm_schedule, alert_rule.
Built as `audit_log (id bigint identity, ...)` with trigger function `audit_row()`; attach it in
each table's migration. No-op updates are not logged. Readable by `manager` and `owner`;
no client writes.

## 10. Key views

- `v_my_day`: work orders for `auth.uid()` or their team, status scheduled/in_progress/on_hold, planned today.
- `v_asset_public`: asset + taxon + org_taxon, with geom obscured to the location centroid when `sensitive`.
- `v_pm_compliance`: per week, preventive work orders due vs verified on time.
- `v_collection_by_zone`: taxa, plants, IUCN-listed counts per zone.
- `v_item_requests_open`: open requests by status, reason, category and age.
