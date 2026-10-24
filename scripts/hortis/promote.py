"""Step 6: load the transformed records into the platform for one organisation, in one
transaction (docs/HORTIS_MIGRATION.md).

    python scripts/hortis/promote.py --org terra --dry-run   # report, then roll back
    python scripts/hortis/promote.py --org terra

Upserts on the legacy keys (taxon name + authorship, accession number, Hortis
"<accession>.<qualifier>"), so a re-run after curator decisions updates rather than duplicates.
Hortis stays the master until cut-over, so Hortis fields are overwritten on re-run; a tag, once
loaded, is kept (curator re-tags are applied separately). Refuses to run while rejects exist.

Dead plants are loaded with status dead. The asset trigger (task 2.10) drafts a replacement item
request for each dead plant and each plant in condition Poor; validate.py still writes
data/hortis/out/replacement_requests_draft.csv as a review list.
"""

from __future__ import annotations

import argparse

from db import connect, rows

UPSERTS = {
    "taxa": """
      with src as (select t.rec from staging_hortis.t_taxon t)
      insert into taxon (kingdom, family, genus, specific_epithet, infraspecific_epithet, scientific_name,
                         authorship, rank, common_names)
      select 'Plantae', rec->>'family', rec->>'genus', rec->>'specific_epithet', rec->>'infraspecific_epithet',
             rec->>'scientific_name', nullif(rec->>'authorship', ''), rec->>'rank', rec->'common_names'
      from src
      on conflict (scientific_name, coalesce(authorship, '')) do update set
        family = excluded.family, genus = excluded.genus, specific_epithet = excluded.specific_epithet,
        infraspecific_epithet = excluded.infraspecific_epithet, rank = excluded.rank,
        common_names = taxon.common_names || excluded.common_names
      returning (xmax = 0) as inserted
    """,
    "org_taxa": """
      insert into org_taxon (organisation_id, taxon_id, inhouse_code, iucn_category, zones_present, notes, attributes)
      select cast(:org as uuid), tx.id, o.rec->>'inhouse_code', o.rec->>'iucn_category',
             array(select jsonb_array_elements_text(o.rec->'zones_present')), nullif(o.rec->>'notes', ''), o.rec->'attributes'
      from staging_hortis.t_org_taxon o
      join staging_hortis.t_taxon t on t.rec->>'key' = o.rec->>'taxon_key'
      join taxon tx on tx.scientific_name = t.rec->>'scientific_name'
                   and coalesce(tx.authorship, '') = coalesce(t.rec->>'authorship', '')
      on conflict (organisation_id, taxon_id) do update set
        inhouse_code = coalesce(excluded.inhouse_code, org_taxon.inhouse_code),
        iucn_category = excluded.iucn_category, zones_present = excluded.zones_present,
        notes = excluded.notes, attributes = org_taxon.attributes || excluded.attributes
      returning (xmax = 0) as inserted
    """,
    "accessions": """
      insert into accession (organisation_id, accession_number, taxon_id, received_date, source, provenance_type,
                             notes, legacy_hortis_id, attributes)
      select cast(:org as uuid), c.rec->>'accession_number', tx.id, cast(c.rec->>'received_date' as date),
             c.rec->>'source', c.rec->>'provenance_type', nullif(c.rec->>'notes', ''), c.rec->>'accession_number',
             c.rec->'attributes'
      from staging_hortis.t_accession c
      join staging_hortis.t_taxon t on t.rec->>'key' = c.rec->>'taxon_key'
      join taxon tx on tx.scientific_name = t.rec->>'scientific_name'
                   and coalesce(tx.authorship, '') = coalesce(t.rec->>'authorship', '')
      on conflict (organisation_id, accession_number) do update set
        taxon_id = excluded.taxon_id, received_date = excluded.received_date, source = excluded.source,
        provenance_type = excluded.provenance_type, notes = excluded.notes,
        attributes = accession.attributes || excluded.attributes
      returning (xmax = 0) as inserted
    """,
    # Tagged records keep their Hortis point; bed-level records go to a point inside the bed
    # (st_pointonsurface, so it is inside even for crescent-shaped beds). Points outside every
    # bed keep the Hortis bed and record the distance as position accuracy.
    # Plant items from the taxa (task 2.10), before assets so the replacement drafts that the asset
    # trigger makes for dead and poor plants point at the right item. Idempotent.
    "plant_items": """
      select true as inserted from generate_series(1, item_generate_plants(cast(:org as uuid)))
    """,
    "assets": """
      with src as (
        select a.rec, l.id as location_id, l.site_id, l.geom as bed_geom,
               case when a.rec->>'lon' is not null
                    then st_setsrid(st_makepoint((a.rec->>'lon')::float8, (a.rec->>'lat')::float8), 4326)
                    else st_pointonsurface(l.geom) end as g,
               f.detail->>'distance_m' as outside_m
        from staging_hortis.t_asset a
        join location l on l.organisation_id = cast(:org as uuid) and l.kind = 'bed' and l.code = a.rec->>'location_code'
        left join staging_hortis.flags f on f.rule = 'point_outside_bed' and f.hortis_key = a.rec->>'key'
      )
      insert into asset (organisation_id, site_id, location_id, asset_type_id, tag_code, geom, position_source,
                         position_accuracy_m, status, condition, install_date, taxon_id, accession_id,
                         attributes, legacy_hortis_id)
      select cast(:org as uuid), s.site_id, s.location_id, ty.id, s.rec->>'tag_code', s.g,
             case when s.rec->>'lon' is not null then 'hortis' else 'bed_centroid' end,
             cast(s.outside_m as numeric), cast(s.rec->>'status' as asset_status),
             cast(s.rec->>'condition' as smallint), cast(s.rec->>'install_date' as date),
             tx.id, ac.id, s.rec->'attributes', s.rec->>'key'
      from src s
      join asset_type ty on ty.organisation_id = cast(:org as uuid) and ty.code = s.rec->>'type_code'
      join staging_hortis.t_taxon t on t.rec->>'key' = s.rec->>'taxon_key'
      join taxon tx on tx.scientific_name = t.rec->>'scientific_name'
                   and coalesce(tx.authorship, '') = coalesce(t.rec->>'authorship', '')
      join accession ac on ac.organisation_id = cast(:org as uuid) and ac.accession_number = s.rec->>'accession_number'
      on conflict (organisation_id, legacy_hortis_id) where legacy_hortis_id is not null do update set
        site_id = excluded.site_id, location_id = excluded.location_id, asset_type_id = excluded.asset_type_id,
        geom = excluded.geom, position_source = excluded.position_source,
        position_accuracy_m = excluded.position_accuracy_m, status = excluded.status,
        condition = excluded.condition, install_date = excluded.install_date, taxon_id = excluded.taxon_id,
        accession_id = excluded.accession_id, attributes = asset.attributes || excluded.attributes
      returning (xmax = 0) as inserted
    """,
}


def promote(org_slug: str, dry_run: bool) -> dict[str, dict[str, int]]:
    con = connect()
    try:
        org = rows(con, "select id from organisation where slug = :s", s=org_slug)
        if not org:
            raise SystemExit(f"organisation {org_slug!r} not found")
        rejects = rows(con, "select count(*)::int as n from staging_hortis.rejects")[0]["n"]
        if rejects:
            raise SystemExit(f"{rejects} rejects in staging_hortis.rejects; fix them before promoting")
        con.run("begin")
        result = {}
        for name, sql in UPSERTS.items():
            params = {} if name == "taxa" else {"org": str(org[0]["id"])}
            out = con.run(sql, **params) or []
            ins = sum(1 for (i,) in out if i)
            result[name] = {"inserted": ins, "updated": len(out) - ins}
        con.run("rollback" if dry_run else "commit")
        return result
    except Exception:
        con.run("rollback")
        raise
    finally:
        con.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    res = promote(args.org, args.dry_run)
    for k, v in res.items():
        print(f"{k:11} inserted {v['inserted']:4d}  updated {v['updated']:4d}")
    print("DRY RUN: rolled back" if args.dry_run else "committed")


if __name__ == "__main__":
    main()
