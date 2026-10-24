-- Task 2.9: verification queue for field managers and managers (FR-WO-10). Security invoker: RLS applies.

-- Completed work orders of a site waiting for verification, oldest completion first. can_verify is false
-- for the assignee, their team and whoever completed the job (wo_transition refuses them anyway).
create function wo_verify_queue(p_site uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  with done as (
    select w.*, e.at as completed_at, e.actor as completed_by
    from work_order w
    join lateral (select at, actor from work_order_event
                  where work_order_id = w.id and to_status = 'completed' order by at desc limit 1) e on true
    where w.site_id = p_site and w.status = 'completed'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'number', d.number, 'title', d.title, 'priority', d.priority, 'wo_type', d.wo_type,
    'location_code', l.code, 'completed_at', d.completed_at,
    'completed_by_name', (select display_name from membership where user_id = d.completed_by and organisation_id = d.organisation_id),
    'assignee_name', (select display_name from membership where user_id = d.assignee_user_id and organisation_id = d.organisation_id),
    'team_name', (select name from team where id = d.team_id),
    'photos', (select count(*) from media m where m.work_order_id = d.id and m.kind = 'photo'),
    'steps', (select count(*) from sop_step where sop_id = d.sop_id),
    'can_verify', has_any_role(d.organisation_id, array['manager', 'field_manager'])
                  and not wo_is_mine(d.organisation_id, d.assignee_user_id, d.team_id)
                  and d.completed_by is distinct from auth.uid()
  ) order by d.completed_at), '[]'::jsonb)
  from done d left join location l on l.id = d.location_id
$$;

revoke execute on function wo_verify_queue(uuid) from public, anon;
grant execute on function wo_verify_queue(uuid) to authenticated;
