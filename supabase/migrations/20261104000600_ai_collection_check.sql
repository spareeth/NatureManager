-- Task 3.3: collection check for the identify service (docs/AI_INTEGRATION.md, "Collection check").
-- For each given taxon: is there a living asset of it in the location, or within p_radius_m metres of the
-- point (distance in EPSG:3997)? Security invoker: the caller's RLS applies, so only their organisation's
-- assets are seen. Removed and dead assets do not count.
create function ai_collection_check(
  p_org uuid, p_taxa uuid[], p_location uuid default null,
  p_lon double precision default null, p_lat double precision default null, p_radius_m numeric default 25)
returns table (taxon_id uuid, in_collection boolean)
language sql stable security invoker set search_path = public, extensions as $$
  select t.id,
         exists (
           select 1 from asset a
           where a.organisation_id = p_org and a.taxon_id = t.id
             and a.status::text not in ('planned', 'dead', 'removed', 'disposed')
             and ((p_location is not null and a.location_id = p_location)
                  or (p_lon is not null and p_lat is not null
                      and st_dwithin(st_transform(a.geom, 3997),
                                     st_transform(st_setsrid(st_makepoint(p_lon, p_lat), 4326), 3997),
                                     p_radius_m))))
  from unnest(p_taxa) as t(id)
$$;
grant execute on function ai_collection_check(uuid, uuid[], uuid, double precision, double precision, numeric)
  to authenticated;
