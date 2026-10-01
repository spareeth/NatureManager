import importlib.util
import sys
from pathlib import Path

import pytest

# Loaded by path: the name "profile" would otherwise resolve to the standard library module.
_spec = importlib.util.spec_from_file_location(
    "hortis_profile", Path(__file__).resolve().parents[1] / "hortis" / "profile.py")
hp = importlib.util.module_from_spec(_spec)
sys.modules["hortis_profile"] = hp
_spec.loader.exec_module(hp)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/hortis/raw/2026-04-27"


@pytest.mark.parametrize(
    ("tag", "bed"),
    [("WG07-T04_PRO", "WG-07"), ("SG03-G01_ZIZ", "SG-03"), ("WG7-T04_PRO", None), ("WG07-T04-PRO", None)],
)
def test_tag_bed(tag: str, bed: str | None) -> None:
    assert hp.tag_bed(tag) == bed


def test_compare_reports_differences_and_ignores_notes() -> None:
    actual = {"a": 1, "b": {"c": [2, 1]}, "d": 205.0}
    assert hp.compare(actual, {"a": 1, "b": {"c": [1, 2]}, "_note": "x"}) == []
    assert hp.compare(actual, {"a": 2}) == ["a: expected 2, got 1"]
    assert hp.compare(actual, {"z": 1}) == ["z: missing (expected 1)"]


def test_compare_tolerance() -> None:
    assert hp.compare({"d": 204.7}, {"d": {"approx": 206, "tol": 2}}) == []
    assert hp.compare({"d": 203.0}, {"d": {"approx": 206, "tol": 2}}) != []


@pytest.mark.skipif(not RAW.exists(), reason="raw Hortis export is git-ignored; copy it to run this")
def test_export_matches_recorded_profile() -> None:
    import json

    p = hp.profile(RAW, ROOT / "data/gis/TG_beds_new.geojson", ROOT / "data/gis/TG_boundary.geojson",
                   ROOT / "data/gis/qa_tree_points_outside_beds.csv")
    expected = json.loads((ROOT / "data/hortis/PROFILE_2026-04-27.expected.json").read_text(encoding="utf-8"))
    assert hp.compare(p, expected) == []
