-- Requests raised from the map get their bed; requests for a bed get a point (decision 3 Nov 2026).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
create temp table tg as select s.id site, s.organisation_id org,
  (select id from location l where l.organisation_id = s.organisation_id and l.code = 'NG-02') bed
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, geom)
select '97000000-0000-0000-0000-0000000000a1', org, site, 'request', 'reactive', 'From the map', 'requested',
       (select st_pointonsurface(geom) from location where id = bed) from tg;
select is((select location_id from work_order where id = '97000000-0000-0000-0000-0000000000a1'), (select bed from tg),
  'a point inside a bed gets that bed');
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, location_id)
select '97000000-0000-0000-0000-0000000000a2', org, site, 'request', 'project', 'New path edging', 'requested', bed from tg;
select ok((select st_covers(l.geom, w.geom) from work_order w join location l on l.id = w.location_id
           where w.id = '97000000-0000-0000-0000-0000000000a2'), 'a bed without a point gets a point inside it');
select is((select wo_type from work_order where id = '97000000-0000-0000-0000-0000000000a2'), 'project',
  'anyone can propose an improvement (project) as a request');
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status)
select '97000000-0000-0000-0000-0000000000a3', org, site, 'request', 'reactive', 'No place', 'requested' from tg;
select is((select geom from work_order where id = '97000000-0000-0000-0000-0000000000a3'), null, 'no place stays without a place');
select * from finish();
rollback;
