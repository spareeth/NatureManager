"""Step 4: validation rules (docs/HORTIS_MIGRATION.md section 3). Writes staging_hortis.rejects
and staging_hortis.flags, and CSV files for the curator in data/hortis/out/.

    python scripts/hortis/validate.py --org terra

Rejects stop promote.py. Flags are loaded but need a curator decision.
"""

from __future__ import annotations

import argparse
import csv
import json

from db import connect, rows
from hortis_lib import OUT, retag_proposal

FLAG_COLUMNS = ["rule", "entity", "hortis_key", "tag", "location", "detail", "proposal", "decision"]


def validate(org_slug: str) -> dict[str, int]:
    con = connect()
    try:
        org = rows(con, "select id from organisation where slug = :s", s=org_slug)
        if not org:
            raise SystemExit(f"organisation {org_slug!r} not found")
        org_id = org[0]["id"]
        con.run("begin")
        for t in ("rejects", "flags"):
            con.run(f"drop table if exists staging_hortis.{t}")
        con.run("create table staging_hortis.rejects (entity text, hortis_key text, rule text, detail jsonb)")
        con.run("""create table staging_hortis.flags (entity text, hortis_key text, rule text, tag text,
                   location text, detail jsonb, proposal text)""")

        # Rejects: anything promote could not load.
        con.run("""
          insert into staging_hortis.rejects
          select 'asset', a.rec->>'key', 'unknown_taxon', jsonb_build_object('taxon', a.rec->>'taxon_key')
          from staging_hortis.t_asset a
          where not exists (select 1 from staging_hortis.t_taxon t where t.rec->>'key' = a.rec->>'taxon_key')
          union all
          select 'asset', a.rec->>'key', 'unknown_location', jsonb_build_object('location', a.rec->>'location_code')
          from staging_hortis.t_asset a
          where not exists (select 1 from location l where l.organisation_id = cast(:org as uuid)
                            and l.kind = 'bed' and l.code = a.rec->>'location_code')
          union all
          select 'asset', a.rec->>'key', 'unknown_accession', jsonb_build_object('accession', a.rec->>'accession_number')
          from staging_hortis.t_asset a
          where not exists (select 1 from staging_hortis.t_accession c where c.rec->>'accession_number' = a.rec->>'accession_number')
          union all
          select 'asset', a.rec->>'key', 'unmapped_status', jsonb_build_object('hortis_status', a.rec->>'hortis_status')
          from staging_hortis.t_asset a where a.rec->>'status' is null
          union all
          select 'accession', c.rec->>'accession_number', 'unknown_taxon', jsonb_build_object('taxon', c.rec->>'taxon_key')
          from staging_hortis.t_accession c
          where not exists (select 1 from staging_hortis.t_taxon t where t.rec->>'key' = c.rec->>'taxon_key')
        """, org=str(org_id))

        # Flags from tag assignment: bed prefix mismatches and duplicates.
        con.run("""
          insert into staging_hortis.flags (entity, hortis_key, rule, tag, location, detail)
          select 'asset', a.rec->>'key', f->>'rule', a.rec->>'tag_code', a.rec->>'location_code', f - 'rule'
          from staging_hortis.t_asset a, jsonb_array_elements(a.rec->'tag_flags') f
        """)

        # Points outside every bed (keep point and Hortis bed; accuracy = distance to the bed).
        con.run("""
          insert into staging_hortis.flags (entity, hortis_key, rule, tag, location, detail)
          select 'asset', a.rec->>'key', 'point_outside_bed', a.rec->>'tag_code', a.rec->>'location_code',
                 jsonb_build_object('distance_m', round(st_distance(st_transform(p.g, 3997), st_transform(l.geom, 3997))::numeric, 2),
                                    'outside_boundary', not st_covers(s.boundary, p.g))
          from staging_hortis.t_asset a
          cross join lateral (select st_setsrid(st_makepoint((a.rec->>'lon')::float8, (a.rec->>'lat')::float8), 4326) g) p
          join location l on l.organisation_id = cast(:org as uuid) and l.kind = 'bed' and l.code = a.rec->>'location_code'
          join site s on s.id = l.site_id
          where a.rec->>'lon' is not null
            and not exists (select 1 from location b where b.site_id = l.site_id and b.kind = 'bed' and st_covers(b.geom, p.g))
        """, org=str(org_id))

        # Taxon-level flags.
        con.run("""
          insert into staging_hortis.flags (entity, hortis_key, rule, detail, proposal)
          select 'taxon', t.rec->>'key', 'name_check', jsonb_build_object('infraspecific_epithet', t.rec->>'infraspecific_epithet'), null
          from staging_hortis.t_taxon t where t.rec->>'infraspecific_epithet' is not null
          union all
          select 'taxon', o.rec->>'taxon_key', 'iucn_blank', '{}'::jsonb, null
          from staging_hortis.t_org_taxon o where o.rec->>'iucn_category' is null
          union all
          select 'taxon', o.rec->>'taxon_key', 'code_proposed', '{}'::jsonb, o.rec->'attributes'->>'proposed_inhouse_code'
          from staging_hortis.t_org_taxon o where o.rec->'attributes' ? 'proposed_inhouse_code'
          union all
          select 'asset', a.rec->>'key', 'dead_plant_replacement', jsonb_build_object('taxon', a.rec->>'taxon_key'), null
          from staging_hortis.t_asset a where a.rec->>'status' = 'dead'
          union all
          select 'organisation', :slug, 'protection_level_missing', '{"note": "not in the Hortis export; needs a source before cut-over"}'::jsonb, null
        """, slug=org_slug)

        # Re-tag proposals for bed prefix mismatches (curator confirms; new physical labels).
        taken = {r["t"] for r in rows(con, "select rec->>'tag_code' as t from staging_hortis.t_asset")}
        for f in rows(con, "select hortis_key, tag, location from staging_hortis.flags where rule = 'tag_bed_mismatch' order by hortis_key"):
            p = retag_proposal(f["tag"], f["location"], taken)
            taken.add(p)
            con.run("update staging_hortis.flags set proposal = :p where rule = 'tag_bed_mismatch' and hortis_key = :k", p=p, k=f["hortis_key"])
        con.run("commit")

        OUT.mkdir(parents=True, exist_ok=True)
        flags = rows(con, "select * from staging_hortis.flags order by rule, hortis_key")
        with (OUT / "curator_flags.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FLAG_COLUMNS)
            w.writeheader()
            for f in flags:
                w.writerow({"rule": f["rule"], "entity": f["entity"], "hortis_key": f["hortis_key"], "tag": f["tag"] or "",
                            "location": f["location"] or "", "detail": json.dumps(f["detail"], ensure_ascii=False),
                            "proposal": f["proposal"] or "", "decision": ""})
        dead = rows(con, """select a.rec->>'key' as hortis_key, a.rec->>'tag_code' as tag, a.rec->>'location_code' as location,
                                   t.rec->>'scientific_name' as taxon
                            from staging_hortis.t_asset a join staging_hortis.t_taxon t on t.rec->>'key' = a.rec->>'taxon_key'
                            where a.rec->>'status' = 'dead' order by 2""")
        with (OUT / "replacement_requests_draft.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["hortis_key", "tag", "location", "taxon", "line_kind", "quantity", "reason"])
            w.writeheader()
            for d in dead:
                w.writerow(d | {"line_kind": "replace", "quantity": 1, "reason": "plant_death (Hortis condition Dead)"})

        summary = {r["rule"]: r["n"] for r in rows(con, "select rule, count(*)::int as n from staging_hortis.flags group by rule order by rule")}
        summary["REJECTS"] = rows(con, "select count(*)::int as n from staging_hortis.rejects")[0]["n"]
        return summary
    finally:
        con.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", default="terra")
    args = ap.parse_args()
    s = validate(args.org)
    for k, v in s.items():
        print(f"{k:26} {v}")
    print(f"curator CSV: {(OUT / 'curator_flags.csv').relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
