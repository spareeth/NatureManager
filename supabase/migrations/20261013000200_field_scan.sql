-- Task 2.7: scan a tag in the field (FR-FLD-02). Security invoker: RLS applies.

-- The scanned asset with its open work orders (linked through work_order_asset), newest plan first.
-- 'mine' marks jobs of the signed-in user or their team, so the phone can offer to start them.
create function field_scan(p_asset uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', a.id, 'organisation_id', a.organisation_id, 'site_id', a.site_id, 'tag_code', a.tag_code,
    'name', a.name, 'status', a.status, 'location_id', a.location_id,
    'location_code', (select code from location where id = a.location_id),
    'scientific_name', (select scientific_name from taxon where id = a.taxon_id),
    'lon', round(st_x(st_pointonsurface(a.geom))::numeric, 7), 'lat', round(st_y(st_pointonsurface(a.geom))::numeric, 7),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
                'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status, 'priority', w.priority,
                'planned_start', w.planned_start,
                'mine', wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id))
              order by w.planned_start nulls last, w.number)
              from work_order w join work_order_asset wa on wa.work_order_id = w.id
              where wa.asset_id = a.id and w.status in ('requested', 'approved', 'scheduled', 'in_progress', 'on_hold')),
            '[]'::jsonb))
  from asset a where a.id = p_asset
$$;

revoke execute on function field_scan(uuid) from public, anon;
grant execute on function field_scan(uuid) to authenticated;
