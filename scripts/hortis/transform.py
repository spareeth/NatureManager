"""Step 3: build taxa, org_taxon, accessions and assets from the staged export, per the mapping in
docs/HORTIS_MIGRATION.md section 2. Writes staging_hortis.t_* (replaced on every run).

    python scripts/hortis/transform.py

Decisions applied (11 Oct 2026): Hortis status Present -> established; Hortis extras go to
org_taxon.attributes and accession.attributes; Hortis tags kept as printed (mismatches flagged
by validate.py), the second record of a duplicate tag gets the next free number.
"""

from __future__ import annotations

import json
from collections import defaultdict

from db import connect, rows
from hortis_lib import (
    CONDITION,
    ROOT,
    STATUS_PRESENT,
    asset_type_code,
    assign_tags,
    iucn_code,
    legacy_key,
    parse_date,
    parse_name,
    propose_codes,
    read_csv,
    split_list,
)

SPECIES_CODES = ROOT / "data/hortis/species_codes.csv"


def tkey(name: str | None, authorship: str | None) -> str:
    return f"{name or ''}|{authorship or ''}"


def transform() -> dict[str, int]:
    con = connect()
    try:
        taxa = rows(con, "select * from staging_hortis.raw_taxa order by row_no")
        accs = rows(con, "select * from staging_hortis.raw_accessions order by row_no")
        mats = rows(con, "select * from staging_hortis.raw_materials order by row_no")

        approved = {r["scientific_name"]: r["inhouse_code"] for r in read_csv(SPECIES_CODES)
                    if r["code_status"] == "from_tags" and r["inhouse_code"]}
        uncoded = [t["scientific_name"] for t in taxa if t["scientific_name"] not in approved]
        proposed = propose_codes(uncoded, approved.values())

        zones: dict[str, set[str]] = defaultdict(set)
        for m in mats:
            zones[m["scientific_name"]].add(m["location_name"][:2])

        t_taxon, t_org = [], []
        for t in taxa:
            n = parse_name(t["scientific_name"])
            t_taxon.append({
                "key": tkey(t["scientific_name"], t["authorship"]),
                "scientific_name": t["scientific_name"],
                "authorship": t["authorship"],
                "family": t["family"],
                "genus": n.genus,
                "specific_epithet": n.specific_epithet,
                "infraspecific_epithet": n.infraspecific_epithet,
                "rank": n.rank,
                "common_names": {"en": [t["common_name"]]} if t["common_name"] else {},
            })
            attrs = {
                "life_forms": split_list(t["life_forms"] or ""),
                "climate": t["climate"],
                "native_distribution": t["native_distribution"],
                "public_description": t["public_description"],
                "hortis_tags": t["tags"],
            }
            if t["scientific_name"] in proposed:
                attrs["proposed_inhouse_code"] = proposed[t["scientific_name"]]
            t_org.append({
                "taxon_key": tkey(t["scientific_name"], t["authorship"]),
                "inhouse_code": approved.get(t["scientific_name"]),
                "iucn_category": iucn_code(t["iucn_red_list_status"] or ""),
                "zones_present": sorted(zones.get(t["scientific_name"], set())),
                "notes": t["notes"],
                "attributes": {k: v for k, v in attrs.items() if v not in (None, "", [])},
            })

        ident_cols = ["identified_by", "date_identified", "identification_verification_status",
                      "identification_qualifier", "identification_remarks", "ipen_number"]
        t_acc = []
        for a in accs:
            ident = {c: a[c] for c in ident_cols if a.get(c)}
            attrs = {"material_received_code": a["material_received_code"], "provenance_name": a["provenance_name"]}
            if ident:
                attrs["identification"] = ident
            t_acc.append({
                "accession_number": a["accession_number"],
                "taxon_key": tkey(a["scientific_name"], a["authorship"]),
                "received_date": parse_date(a["accession_date"] or ""),
                "source": a["material_received"],
                "provenance_type": a["provenance_code"],
                "notes": a["notes"],
                "attributes": {k: v for k, v in attrs.items() if v},
            })

        # Tags: species part for new tags is the approved code, else the genus' first three letters.
        species_part = {t["scientific_name"]: approved.get(t["scientific_name"]) or parse_name(t["scientific_name"]).genus[:3].upper()
                        for t in taxa}
        records = [{"key": legacy_key(m["accession_number"], m["qualifier"]), "tag": m["tag_number"] or "",
                    "location": m["location_name"], "taxon": m["scientific_name"]} for m in mats]
        tags = assign_tags(records, species_part)

        t_asset = []
        for m in mats:
            key = legacy_key(m["accession_number"], m["qualifier"])
            cond = (m["condition"] or "").lower()
            t_asset.append({
                "key": key,
                "accession_number": m["accession_number"],
                "taxon_key": tkey(m["scientific_name"], m["authorship"]),
                "location_code": m["location_name"],
                "hortis_tag": m["tag_number"],
                "tag_code": tags[key].tag,
                "type_code": asset_type_code(m["tag_number"] or "", m["life_forms"] or ""),
                "status": "dead" if cond == "dead" else STATUS_PRESENT if m["status"] == "Present" else None,
                "hortis_status": m["status"],
                "condition": CONDITION.get(cond),
                "install_date": parse_date(m["first_present"] or ""),
                "lon": float(m["longitude"]) if m["longitude"] else None,
                "lat": float(m["latitude"]) if m["latitude"] else None,
                "attributes": {k: v for k, v in {"last_observed": parse_date(m["last_observed"] or ""),
                                                 "hortis_condition": m["condition"]}.items() if v},
                "tag_flags": [{"rule": r, **d} for r, d in tags[key].flags],
            })

        con.run("begin")
        for name, data in {"t_taxon": t_taxon, "t_org_taxon": t_org, "t_accession": t_acc, "t_asset": t_asset}.items():
            con.run(f"drop table if exists staging_hortis.{name}")
            con.run(f"create table staging_hortis.{name} (n serial primary key, rec jsonb not null)")
            for rec in data:
                con.run(f"insert into staging_hortis.{name} (rec) values (cast(:r as jsonb))", r=json.dumps(rec, ensure_ascii=False))
        con.run("commit")
        return {"taxa": len(t_taxon), "org_taxa": len(t_org), "accessions": len(t_acc), "assets": len(t_asset),
                "approved_codes": len(approved), "proposed_codes": len(proposed)}
    finally:
        con.close()


if __name__ == "__main__":
    for k, v in transform().items():
        print(f"{k:15} {v}")
