"""Step 7: reconciliation report (docs/HORTIS_MIGRATION.md section 4).

    python scripts/hortis/reconcile.py --org terra

Counts the raw export directly from the CSV files (not from staging) and compares with what is in
the platform for the organisation. Writes data/hortis/reconciliation_<date>.md and .csv.
Exit code 1 if any count differs.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
from collections import Counter

from db import connect, rows
from hortis_lib import RAW, ROOT, iucn_code, legacy_key, read_csv


def reconcile(org_slug: str) -> tuple[list[dict], list[dict], bool]:
    taxa = read_csv(RAW / "taxa.csv")
    accs = read_csv(RAW / "accessions.csv")
    mats = read_csv(RAW / "materials.csv")
    keys = {legacy_key(m["Accession number"], m["Qualifier"]) for m in mats}

    con = connect()
    try:
        org = rows(con, "select id from organisation where slug = :s", s=org_slug)[0]["id"]
        p = {"org": str(org)}
        loaded = rows(con, """
          select
            (select count(*) from org_taxon where organisation_id = cast(:org as uuid))::int as taxa,
            (select count(*) from accession where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null)::int as accessions,
            (select count(*) from asset where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null)::int as plants,
            (select count(*) from asset where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null
               and position_source = 'hortis')::int as tagged_points
        """, **p)[0]
        loaded_keys = {r["k"] for r in rows(con, "select legacy_hortis_id as k from asset where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null", **p)}
        updated = rows(con, """
          select
            (select count(*) from org_taxon where organisation_id = cast(:org as uuid) and updated_at > created_at)::int as taxa,
            (select count(*) from accession where organisation_id = cast(:org as uuid) and updated_at > created_at)::int as accessions,
            (select count(*) from asset where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null and updated_at > created_at)::int as plants
        """, **p)[0]
        rejects = Counter(r["entity"] for r in rows(con, "select entity from staging_hortis.rejects"))
        flagged = Counter((r["entity"], r["n"]) for r in rows(con, "select entity, count(distinct hortis_key)::int as n from staging_hortis.flags group by entity"))
        flag_n = {e: n for (e, n) in flagged}
        zones_db = {r["z"]: r["n"] for r in rows(con, """
          select left(l.code, 2) as z, count(*)::int as n from asset a join location l on l.id = a.location_id
          where a.organisation_id = cast(:org as uuid) and a.legacy_hortis_id is not null group by 1""", **p)}
        iucn_db = {r["c"]: r["n"] for r in rows(con, """
          select ot.iucn_category as c, count(*)::int as n from asset a
          join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
          where a.organisation_id = cast(:org as uuid) and a.legacy_hortis_id is not null and ot.iucn_category in ('EN', 'NT', 'VU', 'CR')
          group by 1""", **p)}
        dead_db = rows(con, "select count(*)::int as n from asset where organisation_id = cast(:org as uuid) and legacy_hortis_id is not null and status = 'dead'", **p)[0]["n"]
    finally:
        con.close()

    iucn_by_taxon = {t["Scientific name"]: iucn_code(t["IUCN red list status"]) for t in taxa}
    zones_ex = Counter(m["Location name"][:2] for m in mats)
    iucn_ex = Counter(iucn_by_taxon[m["Scientific name"]] for m in mats if iucn_by_taxon.get(m["Scientific name"]) in ("EN", "NT", "VU", "CR"))
    tagged_ex = sum(1 for m in mats if m["Tag number"] and m["Latitude"])
    dead_ex = sum(1 for m in mats if m["Condition"].lower() == "dead")

    entities = [
        {"entity": "Taxa", "in_export": len(taxa), "loaded": loaded["taxa"], "updated": updated["taxa"], "rejected": rejects.get("taxon", 0), "flagged": flag_n.get("taxon", 0)},
        {"entity": "Accessions", "in_export": len(accs), "loaded": loaded["accessions"], "updated": updated["accessions"], "rejected": rejects.get("accession", 0), "flagged": flag_n.get("accession", 0)},
        {"entity": "Plant records", "in_export": len(mats), "loaded": loaded["plants"], "updated": updated["plants"], "rejected": rejects.get("asset", 0), "flagged": flag_n.get("asset", 0)},
        {"entity": "Tagged trees with points", "in_export": tagged_ex, "loaded": loaded["tagged_points"], "updated": "", "rejected": "", "flagged": ""},
    ]
    checks = [{"check": f"Records in zone {z}", "export": zones_ex[z], "platform": zones_db.get(z, 0)} for z in sorted(zones_ex)]
    checks += [{"check": f"Plants of IUCN {c} taxa", "export": iucn_ex[c], "platform": iucn_db.get(c, 0)} for c in sorted(iucn_ex)]
    checks.append({"check": "Dead plants (status dead)", "export": dead_ex, "platform": dead_db})
    checks.append({"check": "Every Hortis key loaded once", "export": len(keys), "platform": len(keys & loaded_keys)})
    ok = all(e["in_export"] == e["loaded"] for e in entities) and all(c["export"] == c["platform"] for c in checks)
    return entities, checks, ok


def write(entities: list[dict], checks: list[dict], ok: bool, org: str) -> str:
    day = dt.date.today().isoformat()
    md = ROOT / f"data/hortis/reconciliation_{day}.md"
    lines = [f"# Hortis reconciliation, {day}", "",
             f"Export: 27 April 2026. Organisation: `{org}`. Generated by `scripts/hortis/reconcile.py`.",
             f"Result: **{'all counts match' if ok else 'COUNTS DIFFER'}**.", "",
             "| Entity | In export | Loaded | Updated | Rejected | Flagged |", "| --- | --- | --- | --- | --- | --- |"]
    lines += [f"| {e['entity']} | {e['in_export']} | {e['loaded']} | {e['updated']} | {e['rejected']} | {e['flagged']} |" for e in entities]
    lines += ["", "| Check | Export | Platform | Match |", "| --- | --- | --- | --- |"]
    lines += [f"| {c['check']} | {c['export']} | {c['platform']} | {'yes' if c['export'] == c['platform'] else 'NO'} |" for c in checks]
    lines += ["", "Flags for the curator (bed-prefix mismatches, duplicate tags, points outside beds, name check,",
              "proposed species codes, dead plants) are in `data/hortis/out/curator_flags.csv`.",
              "'Updated' counts records changed after their first load (for example by a re-run with new values).", ""]
    md.write_text("\n".join(lines), encoding="utf-8")
    with md.with_suffix(".csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["section", "name", "export", "platform", "updated", "rejected", "flagged"])
        for e in entities:
            w.writerow(["entity", e["entity"], e["in_export"], e["loaded"], e["updated"], e["rejected"], e["flagged"]])
        for c in checks:
            w.writerow(["check", c["check"], c["export"], c["platform"], "", "", ""])
    return md.relative_to(ROOT).as_posix()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", default="terra")
    args = ap.parse_args()
    entities, checks, ok = reconcile(args.org)
    path = write(entities, checks, ok, args.org)
    print((ROOT / path).read_text(encoding="utf-8"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
