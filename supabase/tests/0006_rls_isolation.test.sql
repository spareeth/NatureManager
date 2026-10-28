-- Task 0.6 (NFR-01): a second organisation reads, updates and deletes zero rows of Terra on
-- every table. Tables are discovered from the catalogue, so tables added in later phases are
-- covered automatically; the guards below fail if a new table lacks RLS or Terra fixture rows.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Tables with no organisation_id, and how they are scoped.
--   organisation: scoped by id.  taxon: shared catalogue, readable by every signed-in user.
create temp table rls_exempt (tbl text primary key, why text);
insert into rls_exempt values
  ('organisation', 'tenant root, scoped by id'),
  ('taxon', 'shared across organisations by design (DATA_MODEL section 3)');

-- Security definer functions that are allowed to bypass RLS. Anything new must be reviewed and
-- added here.
create temp table definer_allowlist (fn text primary key);
insert into definer_allowlist values
  ('auth_org_ids'), ('has_role'), ('has_any_role'), ('has_role_anywhere'),
  ('audit_row'), ('asset_log_status');

create temp view public_tables as
  select c.relname::text as tbl,
         c.relrowsecurity as rls,
         exists (select 1 from pg_attribute a where a.attrelid = c.oid
                 and a.attname = 'organisation_id' and not a.attisdropped) as has_org
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
grant select on public_tables, rls_exempt to authenticated, anon;

-- Structural guards -------------------------------------------------------------------
select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from public_tables where not rls),
  '{}'::text[], 'every public table has row level security enabled');

select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from public_tables
   where not has_org and tbl not in (select tbl from rls_exempt)),
  '{}'::text[], 'every public table has organisation_id, or is on the reviewed exempt list');

select is(
  (select coalesce(array_agg(c.table_name::text order by c.table_name), '{}')
   from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'organisation_id' and c.is_nullable = 'YES'),
  '{}'::text[], 'organisation_id is not null everywhere (CLAUDE.md rule 1)');

select is(
  (select coalesce(array_agg(t.tbl order by t.tbl), '{}') from public_tables t
   where not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = t.tbl and p.cmd in ('SELECT', 'ALL'))),
  '{}'::text[], 'every public table has a read policy');

select is(
  (select coalesce(array_agg(tablename || '.' || policyname order by 1), '{}') from pg_policies
   where schemaname = 'public' and (qual = 'true' or with_check = 'true') and tablename <> 'taxon'),
  '{}'::text[], 'no policy is unconditionally true (except the shared taxon read)');

select is(
  (select coalesce(array_agg(tablename || '.' || policyname order by 1), '{}') from pg_policies
   where schemaname = 'public' and 'public' = any(roles) and cmd <> 'SELECT'
     and coalesce(qual, '') !~ '(auth_org_ids|has_role|has_any_role|has_role_anywhere)'
     and coalesce(with_check, '') !~ '(auth_org_ids|has_role|has_any_role|has_role_anywhere)'),
  '{}'::text[], 'every write policy goes through an organisation or role helper');

select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.proname not in (select fn from definer_allowlist)),
  '{}'::text[], 'no unreviewed security definer functions in public');

select is(
  (select coalesce(array_agg(c.relname::text order by 1), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  '{}'::text[], 'every public view is security_invoker (none bypass RLS)');

-- Fixtures: one Terra row in every table that the seed leaves empty -------------------
insert into auth.users (id, email) values ('20000000-0000-0000-0000-00000000000b', 'manager@demo.test');
insert into organisation (id, name, slug) values ('bbbbbbbb-0000-0000-0000-000000000000', 'Demo Org', 'demo');
insert into membership (organisation_id, user_id, roles, display_name)
values ('bbbbbbbb-0000-0000-0000-000000000000', '20000000-0000-0000-0000-00000000000b',
        '{owner,manager,field_manager,curator,green_team,field_engineer}', 'Demo Manager');

create temp table terra as
  select o.id as org, s.id as site from organisation o join site s on s.organisation_id = o.id
  where o.slug = 'terra' and s.code = 'TG';
create function pg_temp.lp(x float8, y float8) returns geometry language sql as
  $$ select site_from_local((select site from terra), x, y) $$;

insert into location (organisation_id, site_id, kind, code, name, geom)
select org, site, 'bed', 'RLS-01', 'RLS fixture bed',
       st_multi(st_makepolygon(st_makeline(array[pg_temp.lp(50, 50), pg_temp.lp(60, 50),
         pg_temp.lp(60, 60), pg_temp.lp(50, 60), pg_temp.lp(50, 50)])))
from terra;
insert into control_point (organisation_id, site_id, code, geom, source)
select org, site, 'RLS-CP', pg_temp.lp(55, 55), 'rtk' from terra;
insert into line_feature (organisation_id, site_id, kind, geom)
select org, site, 'path', st_multi(st_makeline(pg_temp.lp(10, 10), pg_temp.lp(20, 20))) from terra;
insert into taxon (id, kingdom, scientific_name, rank)
values ('20000000-0000-0000-0000-0000000000d1', 'Plantae', 'Rls fixturea', 'species');
insert into org_taxon (organisation_id, taxon_id, inhouse_code)
select org, '20000000-0000-0000-0000-0000000000d1', 'RLS' from terra;
insert into accession (organisation_id, accession_number, taxon_id)
select org, 'RLS-0001', '20000000-0000-0000-0000-0000000000d1' from terra;
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status)
select '20000000-0000-0000-0000-0000000000a1', org, site,
       (select id from asset_type where organisation_id = org and code = 'TREE'),
       'RLS01-T01_RLS', pg_temp.lp(55, 55), 'planted'
from terra;   -- also writes asset_status_change and audit_log rows
insert into media (organisation_id, bucket, path, kind, asset_id)
select org, 'photos', org || '/rls.jpg', 'photo', '20000000-0000-0000-0000-0000000000a1' from terra;
insert into storage.objects (bucket_id, name) select 'photos', org || '/rls.jpg' from terra;

select is(
  (select coalesce(array_agg(tbl order by tbl), '{}') from (
     select tbl, (xpath('/row/n/text()', query_to_xml(
       format('select count(*) as n from %I where organisation_id = %L', tbl, (select org from terra)),
       false, true, '')))[1]::text::int as n
     from public_tables where has_org) t where n = 0),
  '{}'::text[], 'Terra has rows in every organisation table (so the isolation checks are not vacuous)');

-- Cross-organisation reads, updates and deletes, run as the given role --------------------
create function pg_temp.leaks(p_org uuid, p_op text) returns text[]
language plpgsql as $$
declare
  t record;
  n bigint;
  out text[] := '{}';
begin
  for t in select tbl, has_org from public_tables where tbl not in ('taxon') order by tbl loop
    if p_op = 'select' then
      execute format('select count(*) from %I where %s is distinct from $1', t.tbl,
                     case when t.has_org then 'organisation_id' else 'id' end)
        into n using p_org;
    elsif p_op = 'update' then
      execute format('update %I set %2$s = %2$s where %2$s is distinct from $1', t.tbl,
                     case when t.has_org then 'organisation_id' else 'id' end)
        using p_org;
      get diagnostics n = row_count;
    else
      execute format('delete from %I where %s is distinct from $1', t.tbl,
                     case when t.has_org then 'organisation_id' else 'id' end)
        using p_org;
      get diagnostics n = row_count;
    end if;
    if n > 0 then
      out := out || (t.tbl || '=' || n);
    end if;
  end loop;
  return out;
end
$$;

-- As the second organisation's user, holding every role (widest possible access).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is(pg_temp.leaks('bbbbbbbb-0000-0000-0000-000000000000', 'select'), '{}'::text[],
  'second organisation reads zero Terra rows on every table');
select is(pg_temp.leaks('bbbbbbbb-0000-0000-0000-000000000000', 'update'), '{}'::text[],
  'second organisation updates zero Terra rows on every table');
select is(pg_temp.leaks('bbbbbbbb-0000-0000-0000-000000000000', 'delete'), '{}'::text[],
  'second organisation deletes zero Terra rows on every table');
select is((select count(*)::int from storage.objects where name not like 'bbbbbbbb-%'), 0,
  'second organisation reads zero Terra storage objects');
select is((select count(*)::int from taxon where id = '20000000-0000-0000-0000-0000000000d1'), 1,
  'the shared taxon catalogue stays visible across organisations');

-- Anonymous: nothing at all.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(pg_temp.leaks(null, 'select'), '{}'::text[], 'anon reads zero rows on every table');

-- Back as postgres: Terra's fixture rows are all still there.
reset role;
select ok(
  (select count(*) = 1 from asset where id = '20000000-0000-0000-0000-0000000000a1')
  and (select count(*) = 1 from media where path like '%/rls.jpg')
  and (select count(*) = 7 from membership where organisation_id = (select org from terra)),
  'Terra rows survived the second organisation''s update and delete attempts');

select * from finish();
rollback;
