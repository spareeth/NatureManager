import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import import_locations as il  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BOUNDARY = il.load_boundary(ROOT / "data/gis/TG_boundary.geojson")
BEDS = il.load_beds(ROOT / "data/gis/TG_beds_new.geojson")
NAMES = {b.code for b in BEDS}


def square(lon: float, lat: float, d: float = 0.00002) -> dict:
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


def bed(code: str, geom: dict) -> il.Bed:
    m = il.CODE_RE.match(code)
    return il.Bed(code, m["zone"] if m else "", geom, 1.0)


def test_real_layer_is_valid_and_matches_hortis_names() -> None:
    assert len(BEDS) == 48
    assert il.validate(BEDS, BOUNDARY, NAMES) == []
    assert {b.zone for b in BEDS} == set(il.ZONES)


def test_rejects_bad_code_unknown_zone_and_duplicates() -> None:
    inside = BEDS[0].geometry
    problems = il.validate([bed("EG01", inside), bed("XX-01", inside), bed("EG-01", inside), bed("EG-01", inside)],
                           BOUNDARY, None)
    text = " | ".join(problems)
    assert "does not match ZZ-NN" in text
    assert "unknown zone prefix XX" in text
    assert "duplicate code" in text


def test_rejects_bed_outside_boundary() -> None:
    problems = il.validate([bed("EG-01", square(55.20, 24.90))], BOUNDARY, None)
    assert problems == ["feature 0 (EG-01): not inside the site boundary"]


def test_rejects_invalid_geometry() -> None:
    bowtie = {"type": "Polygon", "coordinates": [[[55.1545, 24.9585], [55.1547, 24.9587], [55.1547, 24.9585],
                                                  [55.1545, 24.9587], [55.1545, 24.9585]]]}
    assert il.validate([bed("EG-01", bowtie)], BOUNDARY, None) == ["feature 0 (EG-01): invalid geometry"]


def test_reports_hortis_name_differences_both_ways() -> None:
    problems = il.validate(BEDS[:47], BOUNDARY, NAMES | {"EG-99"})
    assert f"Hortis location {BEDS[47].code} has no bed polygon" in problems
    assert "Hortis location EG-99 has no bed polygon" in problems


def test_seed_sql_quotes_and_sorts() -> None:
    sql = il.seed_sql([bed("NG-01", square(55.154, 24.958)), bed("EG-01", square(55.154, 24.958))],
                      org_slug="o'rg", site_code="TG", source="x")
    assert sql.index("'EG-01'") < sql.index("'NG-01'")
    assert "'o''rg'" in sql
