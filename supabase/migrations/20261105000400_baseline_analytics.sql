-- Biodiversity analytics in the platform (5 Nov 2026: no R dependency). Native versions of the
-- baseline study's richness estimation, spatial autocorrelation and biomass/carbon:
--   * richness: observed species, Chao1, sample coverage, and the interpolated and extrapolated
--     richness curve (Chao et al. 2014, abundance data, q = 0), per garden and for the whole site;
--   * Moran's I of species richness and Shannon per bed: queen contiguity (vertices within 1 m),
--     row-standardised weights, 999 permutations, one-sided p (greater), as spdep moran.mc;
--   * biomass and carbon per bed: life-form coefficients (parameter, unverified), lognormal per plant,
--     plants independent, 95% interval by the normal approximation of the sum; CO2e = C x 44/12.

select kpi_parameter_defaults(id) from organisation;  -- adds the biomass parameters where missing

-- ---------------------------------------------------------------------------
-- Richness estimation (q = 0)
-- ---------------------------------------------------------------------------

-- Expected species in a sample of m individuals (rarefaction, m < n) or after m - n more
-- (extrapolation), from species abundances.
create function richness_at(p_counts int[], p_m int) returns numeric
language plpgsql immutable as $$
declare
  n int := (select sum(x) from unnest(p_counts) x);
  s int := cardinality(p_counts);
  f1 int := (select count(*) from unnest(p_counts) x where x = 1);
  f2 int := (select count(*) from unnest(p_counts) x where x = 2);
  f0 numeric;
  e numeric := 0;
  c int;
  lf float8[];  -- lf[k + 1] = ln(k!)  (PostgreSQL 16 has no lgamma)
begin
  if n is null or n = 0 then return 0; end if;
  if p_m <= n then
    lf := array[0::float8];
    for c in 1 .. n loop lf := lf || (lf[c] + ln(c::float8)); end loop;
    foreach c in array p_counts loop
      if n - c >= p_m then
        e := e + 1 - exp(lf[n - c + 1] + lf[n - p_m + 1] - lf[n - c - p_m + 1] - lf[n + 1])::numeric;
      else
        e := e + 1;
      end if;
    end loop;
    return e;
  end if;
  f0 := case when f2 > 0 then (n - 1)::numeric / n * f1 * f1 / (2 * f2)
             else (n - 1)::numeric / n * f1 * greatest(f1 - 1, 0) / 2 end;
  if f0 = 0 then return s; end if;
  return s + f0 * (1 - power(1 - f1 / (n * f0 + f1), p_m - n));
end
$$;

create function richness_summary(p_counts int[]) returns jsonb
language sql immutable as $$
  with v as (
    select coalesce(sum(x), 0)::int n, cardinality(p_counts) s,
           count(*) filter (where x = 1)::int f1, count(*) filter (where x = 2)::int f2
    from unnest(p_counts) x
  ),
  pts as (
    select distinct greatest(1, round(n * 2 * k / 24.0))::int m, n from v, generate_series(0, 24) k where n > 0
  )
  select jsonb_build_object(
    'n', n, 's_obs', s, 'singletons', f1, 'doubletons', f2,
    'chao1', round(case when n = 0 then 0
                        when f2 > 0 then s + (n - 1)::numeric / n * f1 * f1 / (2 * f2)
                        else s + (n - 1)::numeric / n * f1 * greatest(f1 - 1, 0) / 2 end, 1),
    'coverage', round(case when n = 0 then 0 when f1 = 0 then 1
                           else 1 - f1::numeric / n * ((n - 1) * f1)::numeric / ((n - 1) * f1 + 2 * f2) end, 4),
    'curve', (select coalesce(jsonb_agg(jsonb_build_object('m', m, 's', round(richness_at(p_counts, m), 2),
                                                            'extrapolated', m > n) order by m), '[]') from pts))
  from v
$$;

-- ---------------------------------------------------------------------------
-- Moran's I with permutations
-- ---------------------------------------------------------------------------

create function moran_mc(p_values numeric[], p_from int[], p_to int[], p_nsim int default 999)
returns jsonb language plpgsql volatile as $$
-- p_from/p_to: neighbour pairs (1-based indexes into p_values), both directions present.
declare
  n int := cardinality(p_values);
  deg int[] := array_fill(0, array[n]);
  i int; k int; sim int;
  obs numeric; v numeric[]; ge int := 0; perm numeric[];
  stat numeric;
  s0 int;
begin
  for k in 1 .. coalesce(cardinality(p_from), 0) loop
    deg[p_from[k]] := deg[p_from[k]] + 1;
  end loop;
  s0 := (select count(*) from unnest(deg) d where d > 0);
  if n < 3 or s0 = 0 then
    return jsonb_build_object('i', null, 'p', null, 'beds', n, 'with_neighbours', s0);
  end if;
  perform setseed(0.42);
  for sim in 0 .. p_nsim loop
    if sim = 0 then
      v := p_values;
    else
      v := array(select x from unnest(p_values) x order by random());
    end if;
    declare mean numeric := (select avg(x) from unnest(v) x);
            num numeric := 0; den numeric := 0;
    begin
      for i in 1 .. n loop den := den + (v[i] - mean) ^ 2; end loop;
      for k in 1 .. cardinality(p_from) loop
        num := num + (v[p_from[k]] - mean) * (v[p_to[k]] - mean) / deg[p_from[k]];
      end loop;
      -- spdep moran.mc with zero.policy: n counts only beds that have neighbours; S0 = sum of weights,
      -- which with row-standardised weights is the same number.
      stat := case when den = 0 then 0 else s0::numeric / s0 * num / den end;
    end;
    if sim = 0 then obs := stat; elsif stat >= obs then ge := ge + 1; end if;
  end loop;
  return jsonb_build_object('i', round(obs, 4), 'p', round((ge + 1)::numeric / (p_nsim + 1), 4),
                            'expected', round(-1.0 / greatest(s0 - 1, 1), 4), 'beds', n, 'with_neighbours', s0,
                            'permutations', p_nsim);
end
$$;

-- ---------------------------------------------------------------------------
-- All analytics for the Biodiversity page (and the monthly snapshot)
-- ---------------------------------------------------------------------------

create function bio_analytics(p_site uuid) returns jsonb
language sql volatile security invoker set search_path = public, extensions as $$
  with p as (select * from bed_plants(p_site)),
  org as (select organisation_id org from site where id = p_site),
  -- richness per garden and for the site (abundance per species)
  by_zone as (
    select zone_code grp, array_agg(n order by taxon_id) counts
    from (select zone_code, taxon_id, sum(n)::int n from p group by 1, 2) x group by zone_code
    union all
    select 'all', array_agg(n order by taxon_id) from (select taxon_id, sum(n)::int n from p group by 1) y
  ),
  -- beds with plants, their richness and Shannon, and neighbours (queen, 1 m snap)
  beds as (
    select l.id, l.code, row_number() over (order by l.code)::int ix, st_transform(l.geom, 3997) g,
           count(distinct p.taxon_id)::numeric s,
           -sum((p.n::numeric / t.tn) * ln(p.n::numeric / t.tn)) h
    from location l join p on p.location_id = l.id
    join (select location_id, sum(n) tn from p group by 1) t on t.location_id = l.id
    group by l.id, l.code, l.geom
  ),
  pairs as (
    -- as spdep poly2nb(queen = TRUE, snap = 1): neighbours when a vertex of one bed is within 1 m of
    -- a vertex of the other (UTM 40N, as the baseline study)
    select a.ix i, b.ix j from beds a join beds b on a.ix <> b.ix
      and st_dwithin(st_points(st_transform(a.g, 32640)), st_points(st_transform(b.g, 32640)), 1)
  ),
  -- biomass and carbon per plant group (bed x species), lognormal mean and sd per plant
  coef as (select kpi_param(org, 'biodiversity', 'biomass_by_life_form') lut,
                  (kpi_param(org, 'biodiversity', 'carbon_fraction') #>> '{}')::numeric cf from org),
  plants as (
    select p.location_id, p.zone_code, p.n,
           coalesce(lut -> p.life_form, lut -> 'Unknown') c, cf
    from p, coef
  ),
  bed_carbon as (
    select l.code bed, pl.zone_code zone,
           sum(pl.n * (c ->> 0)::numeric * (1 + (c ->> 2)::numeric)) biomass_kg,
           sum(pl.n * ((c ->> 0)::numeric * (c ->> 1)::numeric * (1 + (c ->> 2)::numeric)) ^ 2) var_kg2,
           max(cf) cf, st_area(st_transform(l.geom, 3997))::numeric area_m2
    from plants pl join location l on l.id = pl.location_id group by l.code, pl.zone_code, l.geom
  ),
  carbon_rows as (
    select bed, zone, area_m2,
           round(biomass_kg / 1000, 3) biomass_t,
           round(biomass_kg * cf / 1000, 3) carbon_t,
           round(1.96 * sqrt(var_kg2) * cf / 1000, 3) carbon_ci95_t,
           round(biomass_kg * cf / 1000 * 44 / 12, 3) co2e_t,
           round(biomass_kg * cf / 1000 / nullif(area_m2 / 10000, 0), 2) carbon_t_ha
    from bed_carbon
  ),
  carbon_tot as (
    select coalesce(zone, 'all') grp, sum(biomass_kg) b, sqrt(sum(var_kg2)) sd, max(cf) cf, sum(area_m2) a
    from bed_carbon group by rollup (zone)
  )
  select jsonb_build_object(
    'richness', (select jsonb_object_agg(grp, richness_summary(counts)) from by_zone),
    'moran', jsonb_build_object(
      'richness', moran_mc((select array_agg(s order by ix) from beds),
                           (select array_agg(i order by i, j) from pairs), (select array_agg(j order by i, j) from pairs)),
      'shannon', moran_mc((select array_agg(round(h, 6) order by ix) from beds),
                          (select array_agg(i order by i, j) from pairs), (select array_agg(j order by i, j) from pairs))),
    'carbon', jsonb_build_object(
      'beds', (select coalesce(jsonb_agg(to_jsonb(r) - 'area_m2' order by bed), '[]') from carbon_rows r),
      'totals', (select jsonb_object_agg(grp, jsonb_build_object(
                   'biomass_t', round(b / 1000, 2), 'carbon_t', round(b * cf / 1000, 2),
                   'carbon_ci95_t', round(1.96 * sd * cf / 1000, 2), 'co2e_t', round(b * cf / 1000 * 44 / 12, 2),
                   'carbon_t_ha', round(b * cf / 1000 / nullif(a / 10000, 0), 2)))
                 from carbon_tot)))
$$;

-- Bray-Curtis between beds is computed in bio_baseline; the ordination (PCoA) of that matrix is done in
-- the web app from this community table (beds x species counts).
create function bio_community(p_site uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_object_agg(bed, sp), '{}') from (
    select bed_code bed, jsonb_object_agg(scientific_name, n) sp from bed_plants(p_site) group by bed_code) x
$$;

-- The monthly snapshot keeps the analytics too (without the per-bed rows).
create or replace function kpi_take_snapshot(p_site uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select id, organisation_id from site where (p_site is null or id = p_site) loop
    if auth.uid() is not null and not has_role(s.organisation_id, 'manager') then
      raise exception 'only managers take KPI snapshots' using errcode = '42501';
    end if;
    insert into kpi_snapshot (organisation_id, site_id, module, taken_on, data)
    values (s.organisation_id, s.id, 'biodiversity', current_date,
            (bio_baseline(s.id) - 'beds') || jsonb_build_object('analytics',
              (select a - 'carbon' || jsonb_build_object('carbon', a -> 'carbon' -> 'totals')
               from bio_analytics(s.id) a))),
           (s.organisation_id, s.id, 'water', current_date, (water_requirement(s.id) - 'beds'))
    on conflict (site_id, module, taken_on) do update set data = excluded.data;
    n := n + 1;
  end loop;
  return n;
end
$$;
