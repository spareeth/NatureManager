-- Task 2.3: PM generator with load spreading, nightly pg_cron job, and auto-close of verified work
-- after 24 h (SRS FR-PM-01..04, 3.4.1). Dates are working dates in Asia/Dubai.

-- ---------------------------------------------------------------------------
-- System events (decision 12 Oct 2026): actor is null only for system events.
-- ---------------------------------------------------------------------------
alter table work_order_event
  alter column actor drop not null,
  add column source text not null default 'user' check (source in ('user', 'system')),
  add constraint work_order_event_actor_source check ((source = 'user') = (actor is not null));

-- ---------------------------------------------------------------------------
-- Calendar helpers
-- ---------------------------------------------------------------------------

-- Today in the organisation's time zone (Asia/Dubai for the pilot).
create function org_today(p_org uuid) returns date
language sql stable set search_path = public as $$
  select (now() at time zone coalesce((select settings ->> 'timezone' from organisation where id = p_org), 'Asia/Dubai'))::date
$$;

-- Working weekdays from organisation.settings.work_week, 0 = Monday .. 6 = Sunday.
-- Default Monday to Friday when the organisation has no work week.
create function org_working_days(p_org uuid) returns int[]
language sql stable set search_path = public as $$
  select coalesce(
    (select array_agg(d.i order by d.i)
     from organisation o,
          (values (0, 'mon'), (1, 'tue'), (2, 'wed'), (3, 'thu'), (4, 'fri'), (5, 'sat'), (6, 'sun')) d(i, k)
     where o.id = p_org and o.settings -> 'work_week' ? d.k),
    array[0, 1, 2, 3, 4])
$$;

-- Weekday 0 = Monday .. 6 = Sunday.
create function weekday0(d date) returns int language sql immutable as $$ select (extract(isodow from d)::int - 1) $$;

-- Is the month inside a seasonal window? Windows may wrap the year end (October to April).
create function in_season(p_rule jsonb, d date) returns boolean language sql immutable as $$
  select case when p_rule ? 'season' then
    case when (p_rule -> 'season' ->> 'from_month')::int <= (p_rule -> 'season' ->> 'to_month')::int
         then extract(month from d) between (p_rule -> 'season' ->> 'from_month')::int and (p_rule -> 'season' ->> 'to_month')::int
         else extract(month from d) >= (p_rule -> 'season' ->> 'from_month')::int
           or extract(month from d) <= (p_rule -> 'season' ->> 'to_month')::int end
  else true end
$$;

-- Periods of a rule that touch [p_from, p_to], each with the days it may use (before load
-- spreading). Anchor: rule.start (yyyy-mm-dd) or the schedule's creation date.
--   daily:   every interval days; a day is used if it is in byweekday (when given) and in season.
--   weekly:  ISO weeks, every interval weeks; days = byweekday or the working days.
--   monthly: calendar months, every interval months; days = bymonthday or the working days.
create function pm_periods(p_rule jsonb, p_anchor date, p_from date, p_to date, p_working int[])
returns table (period_start date, days date[])
language plpgsql immutable as $$
declare
  freq text := p_rule ->> 'freq';
  step int := greatest(coalesce((p_rule ->> 'interval')::int, 1), 1);
  wd int[] := coalesce(array(select jsonb_array_elements_text(p_rule -> 'byweekday')::int), null);
  md int[] := coalesce(array(select jsonb_array_elements_text(p_rule -> 'bymonthday')::int), null);
  p date;
  last date;
begin
  if wd = '{}' then wd := null; end if;
  if md = '{}' then md := null; end if;
  if freq = 'daily' then
    for p in select g::date from generate_series(p_from, p_to, interval '1 day') g loop
      if (p - p_anchor) % step = 0 and (wd is null or weekday0(p) = any(wd)) and in_season(p_rule, p) then
        period_start := p; days := array[p]; return next;
      end if;
    end loop;
  elsif freq = 'weekly' then
    p := p_from - weekday0(p_from);                          -- Monday of the first week
    while p <= p_to loop
      if ((p - (p_anchor - weekday0(p_anchor))) / 7) % step = 0 then
        period_start := p;
        days := array(select d::date from generate_series(p, p + 6, interval '1 day') d
                      where weekday0(d::date) = any(coalesce(wd, p_working)) and in_season(p_rule, d::date)
                      order by d);
        if cardinality(days) > 0 then return next; end if;
      end if;
      p := p + 7;
    end loop;
  elsif freq = 'monthly' then
    p := date_trunc('month', p_from)::date;
    while p <= p_to loop
      if ((extract(year from p) * 12 + extract(month from p)) - (extract(year from p_anchor) * 12 + extract(month from p_anchor)))::int % step = 0 then
        last := (p + interval '1 month' - interval '1 day')::date;
        period_start := p;
        days := array(select d::date from generate_series(p, last, interval '1 day') d
                      where (case when md is not null then extract(day from d)::int = any(md)
                                  else weekday0(d::date) = any(p_working) end)
                        and in_season(p_rule, d::date)
                      order by d);
        if cardinality(days) > 0 then return next; end if;
      end if;
      p := (p + interval '1 month')::date;
    end loop;
  end if;
end
$$;

-- What a schedule targets, in a fixed order: (asset_id, location_id, label).
--   asset:                  the asset
--   asset_type_in_location: assets of that type in the location or below it, not dead, removed or disposed
--   location:               the location, or with rule "each": "<kind>" every location of that kind
--                           below it (for example each bed of a zone)
create function pm_targets(p_schedule uuid)
returns table (asset_id uuid, location_id uuid, label text)
language sql stable set search_path = public as $$
  with recursive s as (select * from pm_schedule where id = p_schedule),
  below as (
    select l.id, l.code, l.kind from location l, s where l.id = s.target_location_id
    union all
    select c.id, c.code, c.kind from location c join below b on c.parent_id = b.id
  )
  select a.id, a.location_id, a.tag_code from s join asset a on a.id = s.target_asset_id where s.target_kind = 'asset'
  union all
  select a.id, a.location_id, a.tag_code from s, asset a
  where s.target_kind = 'asset_type_in_location' and a.asset_type_id = s.target_asset_type_id
    and a.location_id in (select id from below) and a.status not in ('dead', 'removed', 'disposed')
  union all
  select null, b.id, b.code from s, below b
  where s.target_kind = 'location'
    and ((s.rule ? 'each' and b.kind::text = s.rule ->> 'each') or (not s.rule ? 'each' and b.id = s.target_location_id))
  order by 3
$$;

-- ---------------------------------------------------------------------------
-- Generator
-- ---------------------------------------------------------------------------

-- Create the PM work orders of an organisation up to p_until (default: each schedule's horizon).
-- Idempotent: every work order carries a key made from schedule, target and period in client_uuid,
-- so a re-run creates nothing new, and a job a manager moved to another day is not recreated.
-- Load spreading (FR-PM-04): a period's work is divided evenly over its open days (for example
-- 15 beds over Monday to Friday is 3 a day), never more than max_per_day on a day, counting work
-- already there; work that still does not fit goes to the period's last day and is reported as
-- over capacity. Security invoker: managers and field managers may run it (RLS);
-- the nightly job runs it as the database owner.
create function pm_generate(p_org uuid, p_until date default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  s record;
  t record;
  per record;
  today date := org_today(p_org);
  working int[] := org_working_days(p_org);
  until_d date;
  tpl wo_template;
  sop_pinned uuid;
  load jsonb;
  day date;
  key uuid;
  n_created int := 0;
  n_existing int := 0;
  n_over int := 0;
  n_sched int := 0;
  inserted int;
  i int;
  cap int;
  n_targets int;
  quota int;
  site uuid;
begin
  -- Signed-in callers must plan work in this organisation; the nightly job runs without a user.
  if auth.uid() is not null and not has_any_role(p_org, array['manager', 'field_manager']) then
    raise exception 'only managers and field managers generate preventive work' using errcode = '42501';
  end if;
  for s in select * from pm_schedule where organisation_id = p_org and active order by id loop
    n_sched := n_sched + 1;
    until_d := least(coalesce(p_until, today + s.horizon_days), today + s.horizon_days);
    select * into tpl from wo_template where id = s.template_id;
    -- SOP version at dispatch: latest approved version with the template SOP's code.
    select v.id into sop_pinned from sop v join sop t2 on t2.id = tpl.sop_id
    where v.organisation_id = t2.organisation_id and v.code = t2.code and v.status = 'approved'
    order by v.version desc limit 1;

    for per in select * from pm_periods(s.rule, coalesce((s.rule ->> 'start')::date, (s.created_at at time zone 'Asia/Dubai')::date),
                                        today, until_d, working) loop
      -- pm_periods returns days up to until_d; a period may run past it, so take its full days.
      per.days := array(select d from pm_periods(s.rule, coalesce((s.rule ->> 'start')::date, (s.created_at at time zone 'Asia/Dubai')::date),
                                                 per.period_start, per.period_start + 31, working) q, unnest(q.days) d
                        where q.period_start = per.period_start order by d);
      -- The period's days from today on, including days past the horizon: work is spread over the
      -- whole period, and only what lands inside the horizon is created now (the rest on later
      -- nights). Spreading over a horizon-cut period would crowd its first days.
      per.days := array(select d from unnest(per.days) d where d >= today order by d);
      continue when cardinality(per.days) = 0;
      -- work already on each day for this schedule
      select coalesce(jsonb_object_agg(d, n), '{}') into load from (
        select (w.planned_start at time zone 'Asia/Dubai')::date::text d, count(*) n
        from work_order w where w.pm_schedule_id = s.id
          and (w.planned_start at time zone 'Asia/Dubai')::date = any(per.days) group by 1) x;
      -- even share per day, capped by max_per_day
      select count(*) into n_targets from pm_targets(s.id);
      quota := least(coalesce(s.max_per_day, 2147483647), greatest(ceil(n_targets::numeric / cardinality(per.days))::int, 1));
      i := 1;
      for t in select * from pm_targets(s.id) loop
        key := md5('pm|' || s.id || '|' || coalesce(t.asset_id, t.location_id) || '|' || per.period_start)::uuid;
        if exists (select 1 from work_order where client_uuid = key) then
          n_existing := n_existing + 1;
          continue;
        end if;
        -- first day with room
        day := null;
        while i <= cardinality(per.days) loop
          cap := quota - coalesce((load ->> per.days[i]::text)::int, 0);
          if cap > 0 then day := per.days[i]; exit; end if;
          i := i + 1;
        end loop;
        if day is null then
          -- even share used up: fill remaining room up to max_per_day, else overflow on the last day
          day := (select d from unnest(per.days) d
                  where coalesce((load ->> d::text)::int, 0) < coalesce(s.max_per_day, 2147483647) order by d limit 1);
          if day is null then
            day := per.days[cardinality(per.days)];
            n_over := n_over + 1;
          end if;
        end if;
        exit when day > until_d;   -- beyond the horizon: later nights create it
        load := jsonb_set(load, array[day::text], to_jsonb(coalesce((load ->> day::text)::int, 0) + 1));

        select l.site_id into site from location l where l.id = t.location_id;
        if site is null then select a.site_id into site from asset a where a.id = t.asset_id; end if;

        insert into work_order (organisation_id, site_id, location_id, template_id, pm_schedule_id, source, wo_type,
                                title, priority, status, due_at, planned_start, planned_end, team_id, sop_id,
                                est_minutes, geom, client_uuid)
        values (p_org, site, t.location_id, tpl.id, s.id, 'pm', tpl.wo_type,
                tpl.title || ' · ' || t.label, tpl.default_priority,
                case when tpl.team_id is not null then 'scheduled' else 'approved' end::wo_status,
                ((day + 1)::timestamp at time zone 'Asia/Dubai') - interval '1 second',
                (day + time '07:00') at time zone 'Asia/Dubai',
                ((day + time '07:00') at time zone 'Asia/Dubai') + make_interval(mins => coalesce(tpl.est_minutes, 60)),
                tpl.team_id, sop_pinned, tpl.est_minutes,
                coalesce((select case when geometrytype(a.geom) = 'POINT' then a.geom else st_pointonsurface(a.geom) end
                          from asset a where a.id = t.asset_id),
                         (select st_pointonsurface(l.geom) from location l where l.id = t.location_id)),
                key)
        on conflict (client_uuid) do nothing;
        get diagnostics inserted = row_count;
        if inserted = 1 then
          n_created := n_created + 1;
          if t.asset_id is not null then
            insert into work_order_asset (organisation_id, work_order_id, asset_id)
            select p_org, w.id, t.asset_id from work_order w where w.client_uuid = key;
          end if;
        else
          n_existing := n_existing + 1;
        end if;
      end loop;
    end loop;
    update pm_schedule set last_generated_until = greatest(coalesce(last_generated_until, until_d), until_d) where id = s.id;
  end loop;
  return jsonb_build_object('schedules', n_sched, 'created', n_created, 'existing', n_existing,
                            'over_capacity', n_over, 'from', today);
end
$$;
revoke execute on function pm_generate(uuid, date) from public, anon;
grant execute on function pm_generate(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-close verified work after 24 h (SRS 3.4.1), as a system event.
-- ---------------------------------------------------------------------------
create function wo_autoclose(p_after interval default interval '24 hours')
returns int language plpgsql set search_path = public as $$
declare
  w record;
  n int := 0;
begin
  for w in
    select wo.id, wo.organisation_id from work_order wo
    where wo.status = 'verified'
      and (select max(e.at) from work_order_event e where e.work_order_id = wo.id and e.to_status = 'verified') < now() - p_after
    for update of wo skip locked
  loop
    perform set_config('app.wo_transition', 'on', true);
    update work_order set status = 'closed' where id = w.id;
    perform set_config('app.wo_transition', '', true);
    insert into work_order_event (organisation_id, work_order_id, from_status, to_status, note, actor, source)
    values (w.organisation_id, w.id, 'verified', 'closed', 'Closed automatically 24 h after verification', null, 'system');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function wo_autoclose(interval) from public, anon, authenticated;

-- All organisations, for the nightly job.
create function pm_generate_all() returns jsonb language plpgsql set search_path = public as $$
declare o record; out jsonb := '{}';
begin
  for o in select id, slug from organisation order by slug loop
    out := out || jsonb_build_object(o.slug, pm_generate(o.id));
  end loop;
  return out;
end
$$;
revoke execute on function pm_generate_all() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron runs in UTC): PM generation 00:30 Dubai, auto-close hourly.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('pm-generate-nightly', '30 20 * * *', 'select public.pm_generate_all()');
select cron.schedule('wo-autoclose-hourly', '5 * * * *', 'select public.wo_autoclose()');
