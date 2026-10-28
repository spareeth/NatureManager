-- Task 1.6: schema support for the Hortis migration.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from org_taxon; delete from taxon; delete from audit_log;

select has_column('public', 'org_taxon', 'attributes', 'org_taxon.attributes exists');
select has_column('public', 'accession', 'attributes', 'accession.attributes exists');

create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra';
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, legacy_hortis_id)
select 'a0000000-0000-0000-0000-0000000000a1', org, site, (select id from asset_type where organisation_id = org and code = 'GROUP'),
       'WG07-G01_ALO', (select st_pointonsurface(geom) from location where code = 'WG-07'), 'established', '2026-0050.A' from tg;

select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status, legacy_hortis_id)
    select org, site, (select id from asset_type where organisation_id = org and code = 'GROUP'), 'WG07-G02_ALO',
           (select st_pointonsurface(geom) from location where code = 'WG-07'), 'established', '2026-0050.A' from tg$$,
  '23505', null, 'a Hortis key loads once per organisation');

-- A no-op upsert must not bump updated_at nor write an audit row.
set local session_replication_role = replica; -- fixture only: set old timestamps without triggers
update asset set updated_at = '2026-01-01', created_at = '2026-01-01' where id = 'a0000000-0000-0000-0000-0000000000a1';
set local session_replication_role = origin;
delete from audit_log;
update asset set status = status, condition = condition where id = 'a0000000-0000-0000-0000-0000000000a1';
select is((select updated_at from asset where id = 'a0000000-0000-0000-0000-0000000000a1'), '2026-01-01'::timestamptz,
  'identical update leaves updated_at alone');
select is((select count(*)::int from audit_log), 0, 'identical update writes no audit row');

-- A real change, including a geometry change, still works and is audited.
update asset set geom = st_translate(geom, 0.000001, 0) where id = 'a0000000-0000-0000-0000-0000000000a1';
select ok((select updated_at > '2026-01-01' from asset where id = 'a0000000-0000-0000-0000-0000000000a1'),
  'geometry change bumps updated_at');
select is((select count(*)::int from audit_log where action = 'update'), 1, 'geometry change is audited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select count(*) from staging_hortis.flags$$, '42501', null, 'clients cannot read the staging schema');

select * from finish();
rollback;
