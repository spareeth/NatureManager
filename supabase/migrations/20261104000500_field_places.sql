-- Task 3.2: beds and zones with a point inside each, for choosing a place on the phone without GPS.
create function field_places(p_site uuid)
returns table (id uuid, code text, kind location_kind, lon numeric, lat numeric)
language sql stable set search_path = public, extensions as $$
  select l.id, l.code, l.kind,
         round(st_x(st_pointonsurface(l.geom))::numeric, 7), round(st_y(st_pointonsurface(l.geom))::numeric, 7)
  from location l
  where l.site_id = p_site and l.kind in ('zone', 'bed')
  order by l.code
$$;
revoke execute on function field_places(uuid) from public, anon;
grant execute on function field_places(uuid) to authenticated;
