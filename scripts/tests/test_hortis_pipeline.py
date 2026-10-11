"""Integration test of the Hortis pipeline against the local database. Non-destructive: it
replaces the staging_hortis tables and runs promote as a dry run (rolled back). Skipped when the
raw export or the database is not available."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "hortis"))
import hortis_lib

if not (hortis_lib.RAW / "materials.csv").exists():
    pytest.skip("raw Hortis export is git-ignored; copy it to run this", allow_module_level=True)

import db

try:
    db.connect().close()
except Exception as e:  # noqa: BLE001
    pytest.skip(f"local database not reachable: {e}", allow_module_level=True)

import promote
import stage
import transform
import validate


@pytest.fixture(scope="module")
def run():
    staged = stage.stage(hortis_lib.RAW)
    built = transform.transform()
    flags = validate.validate("terra")
    return staged, built, flags


def test_counts_match_the_export(run) -> None:
    staged, built, _ = run
    assert staged == {"raw_taxa": 77, "raw_accessions": 77, "raw_materials": 666}
    assert built == {"taxa": 77, "org_taxa": 77, "accessions": 77, "assets": 666, "approved_codes": 25, "proposed_codes": 52}


def test_known_flags_from_the_migration_doc(run) -> None:
    _, _, flags = run
    assert flags == {
        "code_proposed": 52,
        "dead_plant_replacement": 9,
        "duplicate_tag": 2,
        "iucn_blank": 3,
        "name_check": 1,
        "point_outside_bed": 95,
        "protection_level_missing": 1,
        "tag_bed_mismatch": 37,
        "REJECTS": 0,
    }


def test_tags_unique_and_duplicates_renumbered(run) -> None:
    con = db.connect()
    try:
        r = db.rows(con, "select count(*)::int as n, count(distinct rec->>'tag_code')::int as d from staging_hortis.t_asset")[0]
        dups = db.rows(con, """select rec->>'hortis_tag' as h, rec->>'tag_code' as t from staging_hortis.t_asset
                                 where rec->'tag_flags' @> '[{"rule": "duplicate_tag"}]' order by 1""")
    finally:
        con.close()
    assert r == {"n": 666, "d": 666}
    assert [d["h"] for d in dups] == ["EG11-T37_TAM", "SG03-T10_PHO"]
    assert all(d["t"] != d["h"] for d in dups)


def test_promote_dry_run_loads_everything(run) -> None:
    res = promote.promote("terra", dry_run=True)
    assert {k: v["inserted"] + v["updated"] for k, v in res.items()} == {"taxa": 77, "org_taxa": 77, "accessions": 77, "assets": 666}
