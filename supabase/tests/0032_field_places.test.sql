-- Task 3.2: beds and zones with a point inside, for observations without GPS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
create temp table p as select * from field_places((select id from site where code = 'TG'));
select is((select count(*)::int from p), 52, 'the 4 zones and 48 beds');
select ok((select bool_and(st_covers(l.geom, extensions.st_setsrid(extensions.st_makepoint(p.lon, p.lat), 4326)))
           from p join location l on l.id = p.id), 'each point lies inside its bed or zone');
reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from field_places((select id from site where code = 'TG'))), 0, 'another organisation gets nothing');
select * from finish();
rollback;
