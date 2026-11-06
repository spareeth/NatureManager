-- Biodiversity baseline and water requirement modules (decision 5 Nov 2026: demo for KPI reporting,
-- built before tasks 3.7 and 3.8). Methods follow the Terra Garden baseline kit (R scripts 02 and 06):
-- per-bed diversity indices and FAO-56 crop water demand. All coefficients are organisation
-- parameters with their source and a verified flag, because the kit marks them unverified
-- (docs/VERIFY_BEFORE_SUBMISSION.md, items 7 to 10 and 14).
--
-- Satellite layers are tiled offline (scripts/imagery) and listed in raster_overlay; per-bed values
-- from them are stored in bed_raster_stat. Metered water use comes later from flow meters
-- (asset type FLOWMETER, Phase 4 sensor readings); until then it is reported as not metered.

-- ---------------------------------------------------------------------------
-- Parameters
-- ---------------------------------------------------------------------------

create table kpi_parameter (
  organisation_id uuid not null references organisation,
  module text not null check (module in ('biodiversity', 'water')),
  key text not null,
  value jsonb not null,
  unit text,
  source text,
  verified boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users,
  primary key (organisation_id, module, key)
);
create trigger kpi_parameter_updated_at before update on kpi_parameter
  for each row execute function set_updated_at();
alter table kpi_parameter enable row level security;
create policy kpi_parameter_read on kpi_parameter for select using (organisation_id in (select auth_org_ids()));
create policy kpi_parameter_write on kpi_parameter for all
  using (has_any_role(organisation_id, array['manager', 'curator']))
  with check (has_any_role(organisation_id, array['manager', 'curator']));

-- The kit's values for every organisation (Terra today).
create function kpi_parameter_defaults(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into kpi_parameter (organisation_id, module, key, value, unit, source, verified) values
  (p_org, 'water', 'eto_mm_day', '[3.5, 4.2, 5.8, 7.8, 9.5, 11.2, 11.8, 11.0, 9.2, 7.0, 4.8, 3.6]', 'mm/day, Jan to Dec',
   'Kit 06: Dubai monthly ET0 (Al-Ghobari 2000, FAO CLIMWAT). Unverified: replace with CLIMWAT or NCM data for the site', false),
  (p_org, 'water', 'drip_efficiency', '0.90', 'fraction', 'Kit 06: current drip system', false),
  (p_org, 'water', 'flat_rate_l_m2_day', '6.0', 'L/m2/day', 'Kit 06: current practice', false),
  (p_org, 'water', 'tariff_aed_m3', '3.83', 'AED/m3', 'Kit 06: DEWA tier 1 (2024). Unconfirmed', false),
  (p_org, 'water', 'kc_by_life_form',
   '{"Tree": 0.65, "Large shrub": 0.50, "Shrub": 0.40, "Subshrub": 0.30, "Succulent": 0.15, "Semisucculent": 0.20,
     "Perennial herb": 0.45, "Annual herb": 0.60, "Climber": 0.50, "Geophyte": 0.35, "Grass": 0.85, "Unknown": 0.40}',
   'Kc, mid-season', 'Kit 06: FAO-56 tables 12 and 17, WUCOLS IV, Garcia-Tejero 2011. From memory, check each value', false),
  (p_org, 'biodiversity', 'native_pattern',
   to_jsonb('Arabian Pen|Arabian Peninsula|Oman|Yemen|UAE|United Arab Emirates|Sahara|Sahel|SW\. Asia|S\. Arabia|SE\. Arabia|Persian Gulf|Gulf States|NW\. India|Dry parts of Africa.*Indian Sub|W\. Trop\. Africa to Arabian|Trop\. & S\. Africa.*Arabian'::text),
   'regular expression on WCVP native distribution',
   'Kit 01: broad keyword list, over-counts natives. Validate against a UAE flora checklist', false),
  (p_org, 'biodiversity', 'biomass_by_life_form',
   '{"Tree": [45.0, 0.35, 0.28], "Large shrub": [12.5, 0.30, 0.40], "Shrub": [3.8, 0.30, 0.56],
     "Subshrub": [0.8, 0.30, 0.64], "Succulent": [8.0, 0.40, 0.20], "Semisucculent": [5.5, 0.35, 0.30],
     "Perennial herb": [0.3, 0.30, 0.80], "Annual herb": [0.1, 0.40, 0.90], "Climber": [1.2, 0.40, 0.35],
     "Geophyte": [0.2, 0.35, 1.20], "Grass": [0.15, 0.40, 1.20], "Unknown": [1.5, 0.50, 0.56]}',
   '[mean above-ground biomass kg per plant, CV, root:shoot]',
   'Kit 05: indicative values (Chave 2014, IPCC 2006, Henry 2011, Poorter 2012), not read from the sources. Mature plants assumed', false),
  (p_org, 'biodiversity', 'carbon_fraction', '0.47', 'fraction of dry biomass', 'IPCC 2006 default', false)
  on conflict do nothing
$$;
select kpi_parameter_defaults(id) from organisation;

create function kpi_param(p_org uuid, p_module text, p_key text) returns jsonb
language sql stable set search_path = public as $$
  select value from kpi_parameter where organisation_id = p_org and module = p_module and key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Classification (kit 05 classify_life_form, kit 01 native flag)
-- ---------------------------------------------------------------------------

create function life_form_class(p_life_forms jsonb) returns text
language sql immutable as $$
  with s as (select lower(coalesce((select string_agg(x, '|') from jsonb_array_elements_text(
                 case when jsonb_typeof(p_life_forms) = 'array' then p_life_forms else '[]'::jsonb end) x), '')) lf)
  select case
    when lf like '%succulent%' and lf like '%semi%' then 'Semisucculent'
    when lf like '%succulent%' then 'Succulent'
    when lf like '%tree%' and lf like '%shrub%' then 'Large shrub'
    when lf like '%tree%' then 'Tree'
    when lf like '%shrub%' and lf like '%sub%' then 'Subshrub'
    when lf like '%shrub%' then 'Shrub'
    when lf like '%geophyte%' or lf like '%rhizome%' then 'Geophyte'
    when lf like '%grass%' or lf like '%graminoid%' then 'Grass'
    when lf like '%climber%' or lf like '%scrambling%' then 'Climber'
    when lf like '%annual%' and lf like '%perennial%' then 'Perennial herb'
    when lf like '%annual%' then 'Annual herb'
    when lf like '%perennial%' or lf like '%herbaceous%' or lf like '%helophyte%' or lf like '%hydrogeophyte%'
      then 'Perennial herb'
    else 'Unknown' end
  from s
$$;

-- Living plants per bed and species: one record is one individual, as in the kit (all plants are
-- used through their bed).
create function bed_plants(p_site uuid)
returns table (location_id uuid, bed_code text, zone_code text, taxon_id uuid, scientific_name text,
               n int, life_form text, native boolean, iucn text)
language sql stable security invoker set search_path = public as $$
  select l.id, l.code, z.code, a.taxon_id, t.scientific_name, count(*)::int,
         life_form_class(ot.attributes -> 'life_forms'),
         coalesce(ot.attributes ->> 'native_distribution', '') ~
           coalesce(kpi_param(a.organisation_id, 'biodiversity', 'native_pattern') #>> '{}', '$^'),
         ot.iucn_category
  from asset a
  join asset_type ty on ty.id = a.asset_type_id and ty.asset_class = 'living'
  join location l on l.id = a.location_id and l.kind = 'bed'
  left join location z on z.id = l.parent_id
  join taxon t on t.id = a.taxon_id
  left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
  where a.site_id = p_site and a.status::text in ('planted', 'established', 'active', 'declining')
  group by 1, 2, 3, 4, 5, 7, 8, 9
$$;

-- ---------------------------------------------------------------------------
-- Biodiversity (kit 02: alpha per bed, beta between beds, garden and zone summaries)
-- ---------------------------------------------------------------------------

create function bio_baseline(p_site uuid) returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with p as (select * from bed_plants(p_site)),
  beds as (
    select l.id, l.code, z.code zone, st_area(st_transform(l.geom, 3997)) area_m2
    from location l left join location z on z.id = l.parent_id
    where l.site_id = p_site and l.kind = 'bed'
  ),
  tot as (select location_id, sum(n)::numeric nn, count(*)::int s from p group by 1),
  alpha as (
    select b.code bed, b.zone, b.area_m2, coalesce(t.s, 0) s, coalesce(t.nn, 0)::int n,
           coalesce(-sum((p.n / t.nn) * ln(p.n / t.nn)), 0) h,
           coalesce(sum((p.n / t.nn) ^ 2), 0) sumsq,
           count(*) filter (where p.native) s_native,
           coalesce(sum(p.n) filter (where p.native), 0) n_native,
           count(*) filter (where p.iucn in ('CR', 'EN', 'VU')) s_threatened
    from beds b left join tot t on t.location_id = b.id left join p on p.location_id = b.id
    group by b.code, b.zone, b.area_m2, t.s, t.nn
  ),
  alpha2 as (
    select bed, zone, round(area_m2::numeric, 1) area_m2, s, n,
           round(h::numeric, 4) shannon,
           round(case when n > 0 then 1 - sumsq else 0 end::numeric, 4) simpson,
           round(case when sumsq > 0 then 1 / sumsq else 0 end::numeric, 4) inv_simpson,
           round(case when s > 1 then h / ln(s) else 0 end::numeric, 4) evenness,
           round(case when n > 1 then (s - 1) / ln(n) else 0 end::numeric, 4) margalef,
           s hill_q0, round(exp(h)::numeric, 4) hill_q1,
           round(case when sumsq > 0 then 1 / sumsq else 0 end::numeric, 4) hill_q2,
           round(case when area_m2 > 0 then s / (area_m2 / 10000) else 0 end::numeric, 1) species_density_ha,
           round(case when s > 0 then 100.0 * s_native / s end, 1) pct_native_species,
           round(case when n > 0 then 100.0 * n_native / n end, 1) pct_native_plants,
           s_threatened
    from alpha
  ),
  -- Pairwise between beds with plants: Bray-Curtis (abundance), Jaccard and Sorensen (presence),
  -- Simpson turnover and nestedness (Baselga 2010), as in the kit.
  pairs as (
    select a.code bed_a, b.code bed_b,
           (select sum(abs(coalesce(x.n, 0) - coalesce(y.n, 0)))::numeric / nullif(sum(coalesce(x.n, 0) + coalesce(y.n, 0)), 0)
              from (select taxon_id, n from p where location_id = a.id) x
              full join (select taxon_id, n from p where location_id = b.id) y using (taxon_id)) bray,
           (select count(*) from p x join p y using (taxon_id) where x.location_id = a.id and y.location_id = b.id) shared,
           (select count(*) from p where location_id = a.id) sa,
           (select count(*) from p where location_id = b.id) sb
    from beds a join beds b on a.code <> b.code
    where exists (select 1 from p where location_id = a.id) and exists (select 1 from p where location_id = b.id)
  ),
  pair_idx as (
    select bed_a, bray,
           1 - shared::numeric / nullif(sa + sb - shared, 0) jaccard,
           (sa + sb - 2 * shared)::numeric / nullif(sa + sb, 0) sorensen,
           least(sa - shared, sb - shared)::numeric / nullif(shared + least(sa - shared, sb - shared), 0) turnover
    from pairs
  ),
  beta as (
    select bed_a bed, round(avg(bray), 4) mean_bray, round(avg(jaccard), 4) mean_jaccard,
           round(avg(sorensen), 4) mean_sorensen, round(avg(turnover), 4) mean_turnover,
           round(avg(sorensen - turnover), 4) mean_nestedness
    from pair_idx group by bed_a
  ),
  bed_rows as (
    select a.*, b.mean_bray, b.mean_jaccard, b.mean_sorensen, b.mean_turnover, b.mean_nestedness
    from alpha2 a left join beta b using (bed)
  ),
  zones as (
    select zone, count(*) n_beds, sum(s) total_s, sum(n) total_n,
           round(avg(s), 1) mean_s, round(stddev_samp(s), 1) sd_s, round(avg(shannon), 3) mean_h,
           round(avg(evenness), 3) mean_j,
           (select count(distinct taxon_id) from p where p.zone_code = r.zone) gamma_s
    from bed_rows r where n > 0 group by zone
  ),
  species as (
    select taxon_id, sum(n) n, bool_or(native) native, max(iucn) iucn from p group by taxon_id
  )
  select jsonb_build_object(
    'parameters', (select jsonb_object_agg(module || '.' || key, jsonb_build_object('value', value, 'unit', unit,
                     'source', source, 'verified', verified))
                   from kpi_parameter k join site st on st.organisation_id = k.organisation_id
                   where st.id = p_site and k.module = 'biodiversity'),
    'garden', jsonb_build_object(
      'gamma_s', (select count(*) from species),
      'plants', (select coalesce(sum(n), 0) from species),
      'beds_with_plants', (select count(*) from bed_rows where n > 0),
      'beds', (select count(*) from bed_rows),
      'mean_s', (select round(avg(s), 1) from bed_rows where n > 0),
      'sd_s', (select round(stddev_samp(s), 1) from bed_rows where n > 0),
      'mean_shannon', (select round(avg(shannon), 3) from bed_rows where n > 0),
      'mean_evenness', (select round(avg(evenness), 3) from bed_rows where n > 0),
      'shannon', (select round(-sum((n / t.tn) * ln(n / t.tn))::numeric, 4)
                    from species, (select sum(n)::numeric tn from species) t),
      'native_species', (select count(*) filter (where native) from species),
      'pct_native_species', (select round(100.0 * count(*) filter (where native) / nullif(count(*), 0), 1) from species),
      'pct_native_plants', (select round(100.0 * sum(n) filter (where native) / nullif(sum(n), 0), 1) from species),
      'threatened_species', (select count(*) filter (where iucn in ('CR', 'EN', 'VU')) from species),
      'mean_sorensen', (select round(avg(sorensen), 4) from pair_idx)),
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by zone) from zones z), '[]'),
    'beds', coalesce((select jsonb_agg(to_jsonb(r) order by bed) from bed_rows r), '[]'))
$$;

-- ---------------------------------------------------------------------------
-- Water requirement (kit 06: FAO-56, ETc = Kc x ET0; gross = ETc / efficiency; per bed area)
-- ---------------------------------------------------------------------------

create function water_requirement(p_site uuid) returns jsonb
language sql stable security invoker set search_path = public, extensions as $$
  with org as (select organisation_id org from site where id = p_site),
  par as (
    select (select array(select (x)::numeric from jsonb_array_elements_text(kpi_param(org, 'water', 'eto_mm_day')) x)) eto,
           (kpi_param(org, 'water', 'drip_efficiency') #>> '{}')::numeric eff,
           (kpi_param(org, 'water', 'flat_rate_l_m2_day') #>> '{}')::numeric flat,
           (kpi_param(org, 'water', 'tariff_aed_m3') #>> '{}')::numeric tariff,
           kpi_param(org, 'water', 'kc_by_life_form') kc
    from org
  ),
  days as (select array[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] d),
  p as (select * from bed_plants(p_site)),
  bed_kc as (
    select p.location_id, sum(p.n) n_plants,
           round(sum(p.n * coalesce((par.kc ->> p.life_form)::numeric, (par.kc ->> 'Unknown')::numeric)) / sum(p.n), 3) kc,
           (array_agg(p.life_form order by p.n desc))[1] dominant_life_form,
           round(100.0 * coalesce(sum(p.n) filter (where p.life_form in ('Succulent', 'Semisucculent')), 0) / sum(p.n), 1) pct_succulent
    from p, par group by p.location_id
  ),
  beds as (
    select l.id, l.code, z.code zone, st_area(st_transform(l.geom, 3997)) area_m2
    from location l left join location z on z.id = l.parent_id
    where l.site_id = p_site and l.kind = 'bed'
  ),
  monthly as (
    select b.code bed, b.zone, b.area_m2, k.kc, k.n_plants, k.dominant_life_form, k.pct_succulent, m,
           k.kc * par.eto[m] / par.eff * b.area_m2 demand_l_day,
           par.flat * b.area_m2 current_l_day,
           days.d[m] dim
    from beds b join bed_kc k on k.location_id = b.id, par, days, generate_series(1, 12) m
  ),
  bed_rows as (
    select bed, zone, round(area_m2::numeric, 1) area_m2, kc, n_plants, dominant_life_form, pct_succulent,
           jsonb_agg(round(demand_l_day::numeric, 1) order by m) demand_l_day_by_month,
           round((sum(demand_l_day * dim) / 1000)::numeric, 2) demand_m3_yr,
           round((sum(current_l_day * dim) / 1000)::numeric, 2) current_m3_yr,
           round((100 * (sum(current_l_day * dim) - sum(demand_l_day * dim)) / nullif(sum(current_l_day * dim), 0))::numeric, 1) saving_pct,
           count(*) filter (where demand_l_day > current_l_day) months_under,
           round(max(demand_l_day)::numeric, 1) peak_demand_l_day,
           (array_agg(m order by demand_l_day desc))[1] peak_month,
           round((sum(demand_l_day * dim) / nullif(area_m2, 0))::numeric, 1) demand_l_m2_yr
    from monthly group by bed, zone, area_m2, kc, n_plants, dominant_life_form, pct_succulent
  ),
  -- Metered use: flow meters are assets of type FLOWMETER in the bed; readings arrive with the
  -- sensor module (Phase 4). Until then the bed is reported as not metered.
  meters as (
    select l.code bed, count(*) n from asset a join asset_type t on t.id = a.asset_type_id and t.code = 'FLOWMETER'
    join location l on l.id = a.location_id where a.site_id = p_site group by l.code
  )
  select jsonb_build_object(
    'parameters', (select jsonb_object_agg(module || '.' || key, jsonb_build_object('value', value, 'unit', unit,
                     'source', source, 'verified', verified))
                   from kpi_parameter, org where organisation_id = org and module = 'water'),
    'garden', (select jsonb_build_object(
        'area_m2', round(sum(area_m2), 0), 'beds', count(*),
        'mean_kc', round(sum(kc * n_plants) / nullif(sum(n_plants), 0), 3),
        'demand_m3_yr', round(sum(demand_m3_yr), 1), 'current_m3_yr', round(sum(current_m3_yr), 1),
        'saving_m3_yr', round(sum(current_m3_yr - demand_m3_yr), 1),
        'saving_pct', round(100 * sum(current_m3_yr - demand_m3_yr) / nullif(sum(current_m3_yr), 0), 1),
        'saving_aed_yr', round(sum(current_m3_yr - demand_m3_yr) * (select tariff from par), 0),
        'beds_under', count(*) filter (where months_under > 0),
        'metered_beds', (select count(*) from meters))
      from bed_rows),
    'months', (select jsonb_agg(x order by mm) from (
                 select m mm, jsonb_build_object('month', m, 'eto', min(par.eto[m]),
                   'demand_m3_day', round((sum(demand_l_day) / 1000)::numeric, 2),
                   'current_m3_day', round((sum(current_l_day) / 1000)::numeric, 2)) x
                 from monthly, par group by m) q),
    'beds', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('meters', coalesce(mt.n, 0), 'metered_m3_yr', null)
                         order by r.bed)
                      from bed_rows r left join meters mt using (bed)), '[]'))
$$;

-- ---------------------------------------------------------------------------
-- Satellite overlays and per-bed values
-- ---------------------------------------------------------------------------

create table raster_overlay (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null,
  module text not null check (module in ('biodiversity', 'water', 'both')),
  code text not null,
  name text not null,
  kind text not null check (kind in ('ndvi', 'greenness', 'stress', 'imagery')),
  acquired_on date,
  url text not null,                      -- PMTiles archive (one file, read by range requests)
  min_zoom int not null default 12,
  max_zoom int not null default 18,
  legend jsonb not null default '[]',     -- [{"value": 0.2, "color": "#..."}, ...]
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (site_id, code),
  foreign key (site_id, organisation_id) references site (id, organisation_id)
);
alter table raster_overlay enable row level security;
create policy raster_overlay_read on raster_overlay for select using (organisation_id in (select auth_org_ids()));
create policy raster_overlay_write on raster_overlay for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

create table bed_raster_stat (
  organisation_id uuid not null references organisation,
  overlay_id uuid not null,
  location_id uuid not null,
  mean numeric not null,
  p10 numeric, p90 numeric,
  valid_share numeric,                    -- share of the bed with valid pixels
  stress text check (stress in ('none', 'moderate', 'high')),
  primary key (overlay_id, location_id),
  foreign key (overlay_id, organisation_id) references raster_overlay (id, organisation_id) on delete cascade,
  foreign key (location_id, organisation_id) references location (id, organisation_id)
);
alter table bed_raster_stat enable row level security;
create policy bed_raster_stat_read on bed_raster_stat for select using (organisation_id in (select auth_org_ids()));
create policy bed_raster_stat_write on bed_raster_stat for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

create function site_overlays(p_site uuid, p_module text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'name', o.name, 'kind', o.kind, 'module', o.module, 'acquired_on', o.acquired_on,
    'url', o.url, 'min_zoom', o.min_zoom, 'max_zoom', o.max_zoom, 'legend', o.legend, 'notes', o.notes,
    'beds', (select coalesce(jsonb_object_agg(l.code, jsonb_build_object('mean', s.mean, 'p10', s.p10, 'p90', s.p90,
                     'stress', s.stress)), '{}')
             from bed_raster_stat s join location l on l.id = s.location_id where s.overlay_id = o.id))
    order by o.sort_order, o.acquired_on desc nulls last), '[]')
  from raster_overlay o where o.site_id = p_site and (o.module = p_module or o.module = 'both')
$$;

-- ---------------------------------------------------------------------------
-- Flow meters (for metered use later) and monthly KPI snapshots
-- ---------------------------------------------------------------------------

insert into asset_type (organisation_id, code, name, name_ar, asset_class, attribute_schema)
select o.id, 'FLOWMETER', 'Flow meter', 'عداد تدفق', 'built',
       '{"type": "object", "properties": {"serial": {"type": "string", "title": "Serial number"},
         "pipe_mm": {"type": "number", "title": "Pipe diameter (mm)"}}}'::jsonb
from organisation o
where exists (select 1 from asset_type t where t.organisation_id = o.id and t.code = 'VALVE')
on conflict do nothing;

create table kpi_snapshot (
  organisation_id uuid not null references organisation,
  site_id uuid not null,
  module text not null check (module in ('biodiversity', 'water')),
  taken_on date not null,
  data jsonb not null,
  primary key (site_id, module, taken_on),
  foreign key (site_id, organisation_id) references site (id, organisation_id)
);
alter table kpi_snapshot enable row level security;
create policy kpi_snapshot_read on kpi_snapshot for select using (organisation_id in (select auth_org_ids()));

-- Run monthly (pg_cron, 1st of the month 01:00 Dubai) and on demand by a manager: the garden and zone
-- figures (not the bed rows) of both modules, for KPI trends.
create function kpi_take_snapshot(p_site uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select id, organisation_id from site where (p_site is null or id = p_site) loop
    if auth.uid() is not null and not has_role(s.organisation_id, 'manager') then
      raise exception 'only managers take KPI snapshots' using errcode = '42501';
    end if;
    insert into kpi_snapshot (organisation_id, site_id, module, taken_on, data)
    values (s.organisation_id, s.id, 'biodiversity', current_date, (bio_baseline(s.id) - 'beds')),
           (s.organisation_id, s.id, 'water', current_date, (water_requirement(s.id) - 'beds'))
    on conflict (site_id, module, taken_on) do update set data = excluded.data;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function kpi_take_snapshot(uuid), kpi_parameter_defaults(uuid) from public, anon;
grant execute on function kpi_take_snapshot(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 21:00 UTC is 01:00 in Dubai; only on the 1st of the Dubai month.
    perform cron.schedule('kpi-monthly-snapshot', '0 21 * * *',
      $c$select kpi_take_snapshot() where extract(day from now() at time zone 'Asia/Dubai') = 1$c$);
  end if;
end $$;

create function kpi_history(p_site uuid, p_module text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('taken_on', taken_on, 'data', data) order by taken_on), '[]')
  from kpi_snapshot where site_id = p_site and module = p_module
$$;

-- ---------------------------------------------------------------------------
-- Base maps from a PMTiles archive (the CAD plan): one file served with the app, read by range
-- requests. Online only, like Google and Esri.
-- ---------------------------------------------------------------------------

alter table site_basemap drop constraint site_basemap_kind_check;
alter table site_basemap add constraint site_basemap_kind_check check (kind in ('xyz', 'google', 'esri', 'pmtiles'));
alter table site_basemap drop constraint site_basemap_check2;
alter table site_basemap add constraint site_basemap_check2 check (kind in ('xyz', 'pmtiles') or url is null);
alter table site_basemap add constraint site_basemap_pmtiles_url
  check (kind <> 'pmtiles' or url ~ '^(https?://|/)[^ ]+\.pmtiles$');
