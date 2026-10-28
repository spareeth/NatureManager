-- Task 1.6: Hortis migration support (docs/HORTIS_MIGRATION.md).

-- Hortis extras that have no column of their own (decision 11 Oct 2026): life forms, climate,
-- native distribution, public description, Hortis tags, identification fields, proposed codes.
alter table org_taxon add column attributes jsonb not null default '{}';
alter table accession add column attributes jsonb not null default '{}';

-- Upsert key for migrated plant records: "<accession number>.<qualifier>", e.g. 2026-0086.A.
create unique index asset_legacy_hortis_key on asset (organisation_id, legacy_hortis_id)
  where legacy_hortis_id is not null;

-- Staging area for the migration scripts. Not exposed through the API (PostgREST serves only
-- the public schema) and closed to client roles; the scripts connect as the database owner.
create schema if not exists staging_hortis;
revoke all on schema staging_hortis from public, anon, authenticated;

-- Only bump updated_at when the row really changed. An upsert that rewrites identical values
-- (for example a migration re-run) is then a true no-op, and audit_row() skips it.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  -- Compared as jsonb: row comparison would need an equality operator for every column type,
  -- and PostGIS geometry has no unique one.
  if to_jsonb(new) is distinct from to_jsonb(old) then
    new.updated_at := now();
  end if;
  return new;
end
$$;
