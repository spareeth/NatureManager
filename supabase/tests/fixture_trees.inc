-- Fixture trees for tests that need planted beds (self-contained: no Hortis import needed). Included by
-- 0033, 0035 and 0036 inside their transaction; everything is rolled back with the test.
insert into taxon (id, kingdom, scientific_name, rank) values
  ('fe000000-0000-0000-0000-0000000000f1', 'Plantae', 'Fixtura alpha', 'species'),
  ('fe000000-0000-0000-0000-0000000000f2', 'Plantae', 'Fixtura beta', 'species')
on conflict do nothing;
insert into org_taxon (organisation_id, taxon_id, inhouse_code, iucn_category, attributes)
select o.id, t.id, t.code, 'LC', '{"life_forms": ["Tree"]}'::jsonb
from organisation o, (values ('fe000000-0000-0000-0000-0000000000f1'::uuid, 'FXA'), ('fe000000-0000-0000-0000-0000000000f2'::uuid, 'FXB')) t(id, code)
where o.slug = 'terra'
on conflict do nothing;
-- Two trees in NG-02 (one of each species, a few metres apart) and one in EG-01, inside the beds.
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id, position_source)
select f.id, s.organisation_id, s.id,
       (select id from asset_type where organisation_id = s.organisation_id and code = 'TREE'),
       f.tag,
       st_translate(st_pointonsurface(l.geom), f.dx, 0),
       'established', f.taxon, 'gps'
from site s join location l on l.site_id = s.id
join (values ('fe000000-0000-0000-0000-0000000000a1'::uuid, 'NG-02', 'NG02-T91_FXA', 0.00000::float8, 'fe000000-0000-0000-0000-0000000000f1'::uuid),
             ('fe000000-0000-0000-0000-0000000000a2'::uuid, 'NG-02', 'NG02-T92_FXB', 0.00001::float8, 'fe000000-0000-0000-0000-0000000000f2'::uuid),
             ('fe000000-0000-0000-0000-0000000000a3'::uuid, 'EG-01', 'EG01-T93_FXA', 0.00000::float8, 'fe000000-0000-0000-0000-0000000000f1'::uuid))
     f(id, bed, tag, dx, taxon) on l.code = f.bed
where s.code = 'TG'
on conflict do nothing;
