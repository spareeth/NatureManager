-- Bed corners against CAD line work (scratch_cad.cad_lines, EPSG:3997). Run by check_cad_alignment.sh.
set search_path = scratch_cad, public, extensions;
create table lw as
  select layer, g from (
    select layer, st_collectionextract(geom, 2) g from cad_lines
    union all
    select layer, st_boundary(st_collectionextract(geom, 3)) from cad_lines
  ) x where not st_isempty(g);
create index on lw using gist (g);
create table corners as
  select l.code, st_transform((d).geom, 3997) p
  from public.location l, lateral st_dumppoints(l.geom) d where l.kind = 'bed';
create table near as
  select c.code, c.p, n.layer, st_distance(c.p, n.g) d, st_closestpoint(n.g, c.p) cp
  from corners c cross join lateral (select layer, g from lw order by lw.g <-> c.p limit 1) n;
select 'CAD line work features near the site: ' || count(*) from lw;
select 'bed corners ' || count(*) || ': distance to nearest CAD line median ' || round(percentile_cont(0.5) within group (order by d)::numeric, 3)
       || ' m, p75 ' || round(percentile_cont(0.75) within group (order by d)::numeric, 3)
       || ' m, p90 ' || round(percentile_cont(0.9) within group (order by d)::numeric, 3) || ' m, max ' || round(max(d)::numeric, 2) || ' m' from near;
select 'share within 0.1 m ' || round(100.0 * avg((d <= 0.1)::int)) || '%, 0.5 m ' || round(100.0 * avg((d <= 0.5)::int))
       || '%, 1 m ' || round(100.0 * avg((d <= 1)::int)) || '%' from near;
select 'mean offset of matches within 1 m (dE, dN): ' || round(avg(st_x(cp) - st_x(p))::numeric, 3) || ', '
       || round(avg(st_y(cp) - st_y(p))::numeric, 3) || ' m (near 0 means no systematic shift)' from near where d <= 1;
select 'median per zone: ' || string_agg(z || ' ' || m, ', ') from (
  select left(code, 2) z, round(percentile_cont(0.5) within group (order by d)::numeric, 3) m from near group by 1 order by 1) t;
