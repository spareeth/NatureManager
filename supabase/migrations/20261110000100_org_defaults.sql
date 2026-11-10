-- Found when testing a fresh install (10 Nov 2026): the KPI parameters and the flow meter asset type
-- were added only to organisations that already existed when their migrations ran. On a new server the
-- organisation is created later (seed or sign-up), so it got none. New organisations now get the KPI
-- parameter defaults when they are created; the flow meter type is in the asset type seed.

create function organisation_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform kpi_parameter_defaults(new.id);
  return new;
end
$$;
create trigger organisation_defaults after insert on organisation
  for each row execute function organisation_defaults();

-- Organisations created between those migrations and this one.
select kpi_parameter_defaults(id) from organisation;

-- Also found on the fresh install: sample coverage divided by zero for a garden or zone with a single
-- plant ((n - 1) f1 + 2 f2 = 0). Such a group now gets the plain Good-Turing estimate 1 - f1 / n.
create or replace function richness_summary(p_counts int[]) returns jsonb
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
                           -- one plant (or no doubletons with n = 1): plain Good-Turing, 1 - f1 / n
                           when (n - 1) * f1 + 2 * f2 = 0 then 1 - f1::numeric / n
                           else 1 - f1::numeric / n * ((n - 1) * f1)::numeric / ((n - 1) * f1 + 2 * f2) end, 4),
    'curve', (select coalesce(jsonb_agg(jsonb_build_object('m', m, 's', round(richness_at(p_counts, m), 2),
                                                            'extrapolated', m > n) order by m), '[]') from pts))
  from v
$$;

