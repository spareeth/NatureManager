-- Permanent QR codes on assets (decision 4 Nov 2026). Every asset gets a short code, generated once and
-- never changed, printed as a QR label that encodes https://<host>/q/<qr_code>. Unlike the tag code,
-- which a curator may correct, the QR code stays the same, so a label fixed to a tree keeps working.
-- Format: <site code>-<6 characters> from an alphabet without look-alikes (no 0, O, 1, I, L), e.g. TG-7K3QF9.

alter table asset add column qr_code text;

create function new_qr_code(p_site uuid) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  prefix text := coalesce((select upper(code) from site where id = p_site), 'X');
  candidate text;
  i int;
begin
  loop
    candidate := prefix || '-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from asset where qr_code = candidate);
  end loop;
  return candidate;
end
$$;
revoke execute on function new_qr_code(uuid) from public, anon, authenticated;

-- Set on insert (or once, by the backfill below); never changed afterwards, by anyone.
create function asset_qr_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.qr_code is null or new.qr_code = '' then
      new.qr_code := new_qr_code(new.site_id);
    end if;
  elsif old.qr_code is not null and new.qr_code is distinct from old.qr_code then
    raise exception 'the QR code of an asset never changes (it is printed on its label)' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger asset_qr_code before insert or update of qr_code on asset
  for each row execute function asset_qr_code();

-- Backfill existing assets, then make the column required and unique (across organisations, so a
-- scanned code always means one asset).
update asset set qr_code = new_qr_code(site_id) where qr_code is null;
-- The backfill is not an edit by anyone: drop the audit entries it made, so asset histories do not show
-- "Edited: qr_code" for every asset.
delete from audit_log
 where table_name = 'asset' and action = 'update' and old ->> 'qr_code' is null and new ->> 'qr_code' is not null;
alter table asset alter column qr_code set not null;
-- Empty default so clients need not send it; the insert trigger replaces it.
alter table asset alter column qr_code set default '';
alter table asset add constraint asset_qr_code_key unique (qr_code);

-- Scans and typed codes also match the QR code (case-insensitive).
create or replace function asset_by_code(p_code text, p_org uuid default null)
returns table (id uuid, organisation_id uuid, tag_code text, matched text)
language sql stable set search_path = public as $$
  select a.id, a.organisation_id, a.tag_code,
         case when upper(a.qr_code) = upper(trim(p_code)) then 'qr'
              when upper(a.tag_code) = upper(trim(p_code)) then 'tag' else 'barcode' end
  from asset a
  where upper(a.qr_code) = upper(trim(p_code)) or upper(a.tag_code) = upper(trim(p_code)) or a.barcode = trim(p_code)
  order by (a.organisation_id = p_org) desc nulls last,
           (upper(a.qr_code) = upper(trim(p_code))) desc,
           (upper(a.tag_code) = upper(trim(p_code))) desc
  limit 1
$$;

-- Labels print the QR code as well.
create or replace function asset_labels(p_assets uuid[])
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'tag_code', a.tag_code, 'qr_code', a.qr_code,
           'scientific_name', tx.scientific_name,
           'common_name', tx.common_names -> 'en' ->> 0,
           'common_name_ar', tx.common_names -> 'ar' ->> 0,
           'inhouse_code', ot.inhouse_code,
           'type_name', t.name,
           'location_code', l.code)
         order by a.tag_code), '[]'::jsonb)
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
  left join location l on l.id = a.location_id
  where a.id = any(p_assets)
$$;
