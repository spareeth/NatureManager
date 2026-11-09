-- Results of offline image analyses for the KPI pages (7 Nov 2026), starting with isolated trees lost
-- between Dec 2025 and Oct 2026 (scripts/trees). One row per analysis and site: a summary and, when small,
-- its point features (GeoJSON, WGS 84). Larger results stay as map layers (raster_overlay).

create table analysis_result (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null,
  code text not null,                       -- e.g. tree_loss_2025_2026
  title text not null,
  period_from date,
  period_to date,
  summary jsonb not null default '{}',
  features jsonb not null default '{"type": "FeatureCollection", "features": []}',
  method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, code),
  foreign key (site_id, organisation_id) references site (id, organisation_id),
  check (jsonb_typeof(summary) = 'object'),
  check (features ->> 'type' = 'FeatureCollection')
);
create trigger analysis_result_updated_at before update on analysis_result
  for each row execute function set_updated_at();
alter table analysis_result enable row level security;
create policy analysis_result_read on analysis_result for select using (organisation_id in (select auth_org_ids()));
create policy analysis_result_write on analysis_result for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));
