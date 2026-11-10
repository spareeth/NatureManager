-- Biodiversity baseline and water requirement modules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);
\ir fixture_trees.inc
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
 where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;

-- Life forms as in the kit (05 classify_life_form)
select is(life_form_class('["Tree"]'), 'Tree', 'tree');
select is(life_form_class('["Scrambling", "Shrub", "Tree"]'), 'Large shrub', 'tree and shrub: large shrub (before climber)');
select is(life_form_class('["Succulent", "Semi-succulent"]'), 'Semisucculent', 'semi-succulent');
select is(life_form_class('["Annual", "Perennial"]'), 'Perennial herb', 'annual and perennial: perennial herb');
select is(life_form_class(null), 'Unknown', 'no life form');

select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
create temp table b as select bio_baseline((select site from tg)) j, water_requirement((select site from tg)) w;

select is((select (j -> 'garden' ->> 'plants')::int from b),
          (select sum((r ->> 'n')::int)::int from b, jsonb_array_elements(j -> 'beds') r), 'garden plants = sum of bed plants');
select ok((select (j -> 'garden' ->> 'gamma_s')::int >= max((r ->> 's')::int) from b, jsonb_array_elements(j -> 'beds') r group by j),
          'garden species at least the richest bed');
select ok((select bool_and((r ->> 'evenness')::numeric between 0 and 1.0001) from b, jsonb_array_elements(j -> 'beds') r),
          'evenness between 0 and 1');
select is((select jsonb_array_length(j -> 'beds') from b), 48, 'all 48 beds');

-- FAO-56 for one bed and month: Kc x ET0 / efficiency x area
select ok((select abs((r -> 'demand_l_day_by_month' ->> 6)::numeric - (r ->> 'kc')::numeric * 11.8 / 0.9 * (r ->> 'area_m2')::numeric) <= 1
           from b, jsonb_array_elements(w -> 'beds') r where r ->> 'bed' = 'EG-01'),
          'July demand of EG-01 = Kc x 11.8 / 0.9 x area (within 1 L: Kc and area are rounded)');
select is((select (w -> 'garden' ->> 'metered_beds')::int from b), 0, 'no flow meters yet');
select is((select (w -> 'parameters' -> 'water.eto_mm_day' ->> 'verified')::boolean from b), false, 'ET0 marked unverified');

-- Richness (Chao et al. 2014): counts 3, 1, 1, 2: n 7, S 4, f1 2, f2 1
select is((richness_summary(array[3, 1, 1, 2]) ->> 'chao1')::numeric, 5.7, 'Chao1 = 4 + 6/7 x 4 / 2');
select is((richness_summary(array[3, 1, 1, 2]) ->> 'coverage')::numeric, 0.7551, 'coverage = 1 - 2/7 x 12/14');
select is(round(richness_at(array[3, 1, 1, 2], 7), 4), 4.0000, 'at the full sample the curve is the observed richness');
select is(round(richness_at(array[3, 1, 1, 2], 1), 4), 1.0000, 'one plant is one species');
-- Moran's I: a line of 4 with values 1 2 3 4 (positive pattern) and permutation p
select ok((moran_mc(array[1, 2, 3, 4]::numeric[], array[1, 2, 2, 3, 3, 4], array[2, 1, 3, 2, 4, 3]) ->> 'i')::numeric > 0,
          'Moran I positive for a gradient');
create temp table a as select bio_analytics((select site from tg)) a;
select ok((select (a -> 'moran' -> 'richness' ->> 'with_neighbours')::int between 0 and (a -> 'moran' -> 'richness' ->> 'beds')::int from a),
          'beds touching another bed counted (spdep poly2nb snap 1 m; 8 on the full Terra data)');
select is((richness_summary(array[1]) ->> 'coverage')::numeric, 0.0000, 'a single plant: coverage 0, no division by zero');
select is((select round(sum((r ->> 'carbon_t')::numeric), 1) from a, jsonb_array_elements(a -> 'carbon' -> 'beds') r),
          (select round((a -> 'carbon' -> 'totals' -> 'all' ->> 'carbon_t')::numeric, 1) from a), 'garden carbon = sum of beds');
select is((select (a -> 'richness' -> 'all' ->> 's_obs')::int from a), (select (j -> 'garden' ->> 'gamma_s')::int from b),
          'richness summary agrees with the garden species');

-- Parameters: green team cannot change them, a curator can
update kpi_parameter set value = '0.8' where key = 'drip_efficiency';
select is((select value #>> '{}' from kpi_parameter where key = 'drip_efficiency' and organisation_id = (select org from tg)), '0.90',
          'green team cannot change a parameter (no effect)');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000004');
set local role authenticated;
update kpi_parameter set value = '0.8' where key = 'drip_efficiency' and organisation_id = (select org from tg);
select is((select (water_requirement((select site from tg)) -> 'garden' ->> 'demand_m3_yr')::numeric > (select (w -> 'garden' ->> 'demand_m3_yr')::numeric from b)),
          true, 'a curator lowers the efficiency and the demand rises');
select throws_ok($$select kpi_take_snapshot((select site from tg))$$, '42501', null, 'only managers take snapshots');

-- Another organisation sees no beds and no parameters
reset role;
insert into organisation (id, name, slug) values ('9e000000-0000-0000-0000-00000000bbbb', 'Other', 'other-0036');
insert into auth.users (id, email) values ('9e000000-0000-0000-0000-0000000000bb', 'b@0036.test');
insert into membership (organisation_id, user_id, roles, display_name)
  values ('9e000000-0000-0000-0000-00000000bbbb', '9e000000-0000-0000-0000-0000000000bb', '{manager}', 'B');
select pg_temp.as_user('9e000000-0000-0000-0000-0000000000bb');
set local role authenticated;
select is((select coalesce(jsonb_array_length(bio_baseline((select site from tg)) -> 'beds'), 0) + (select count(*)::int from kpi_parameter where organisation_id = (select org from tg))), 0,
          'another organisation sees none of Terra''s beds or parameters (it has its own defaults)');

select * from finish();
rollback;
