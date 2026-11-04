-- Every work order with a place shows on the maps (decision 3 Nov 2026): a point raised from the map
-- gets its bed or zone, and a bed or zone chosen without a point gets a point inside it.
create function work_order_place() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.geom is not null and new.location_id is null
     and (tg_op = 'INSERT' or new.geom is distinct from old.geom) then
    new.location_id := resolve_location(new.geom, new.site_id);
  elsif new.geom is null and new.location_id is not null
     and (tg_op = 'INSERT' or new.location_id is distinct from old.location_id) then
    new.geom := (select st_pointonsurface(geom) from location where id = new.location_id);
  end if;
  return new;
end
$$;
create trigger work_order_place before insert or update of geom, location_id on work_order
  for each row execute function work_order_place();
