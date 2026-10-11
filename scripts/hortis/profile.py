"""Profile a Hortis export and compare it with the recorded profile (task 0.8, FR-MIG-01).

Reads the three Hortis CSV files and the Terra Garden GIS layers, computes every figure in
data/hortis/PROFILE_2026-04-27.md, and compares them with the expected values transcribed from
that report (PROFILE_2026-04-27.expected.json). Exit code 1 if anything differs.

    python scripts/hortis/profile.py                       # 27 April 2026 export
    python scripts/hortis/profile.py --json out.json       # also write the computed values
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[2]
TAG_RE = re.compile(r"^(?P<zone>[A-Z]{2})(?P<bed>\d{2})-(?P<kind>[TG])(?P<n>\d{2})_(?P<code>[A-Z]{3})$")
_to_3997 = Transformer.from_crs("OGC:CRS84", "EPSG:3997", always_xy=True).transform


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def geojson_crs(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("crs", {}).get("properties", {}).get("name", "(none, RFC 7946 default CRS84)")


def load_polygons(path: Path, name_field: str | None) -> dict[str, object]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for i, f in enumerate(data["features"]):
        key = f["properties"][name_field] if name_field else str(i)
        out[key] = shp_transform(_to_3997, shape(f["geometry"]))
    return out


def tag_bed(tag: str) -> str | None:
    m = TAG_RE.match(tag)
    return f"{m['zone']}-{m['bed']}" if m else None


def accession_seq(number: str) -> int:
    return int(number.split("-")[1])


def profile(raw: Path, beds_path: Path, boundary_path: Path, qa_path: Path | None = None) -> dict:
    taxa = read_csv(raw / "taxa.csv")
    accessions = read_csv(raw / "accessions.csv")
    materials = read_csv(raw / "materials.csv")
    beds = load_polygons(beds_path, "Name")
    boundary = next(iter(load_polygons(boundary_path, None).values()))

    p: dict = {}

    # Taxa and accessions
    p["taxa"] = len(taxa)
    p["families"] = len({t["Family"] for t in taxa if t["Family"]})
    nums = sorted(accession_seq(a["Accession Number"]) for a in accessions)
    p["accessions"] = len(accessions)
    p["accession_first"] = f"2026-{nums[0]:04d}"
    p["accession_last"] = f"2026-{nums[-1]:04d}"
    p["accession_gaps"] = [f"2026-{n:04d}" for n in range(nums[0], nums[-1] + 1) if n not in set(nums)]

    # Plant records
    keys = [(m["Accession number"], m["Qualifier"]) for m in materials]
    p["plant_records"] = len(materials)
    p["plant_keys_unique"] = len(set(keys)) == len(keys)
    locations = sorted({m["Location name"] for m in materials})
    p["locations"] = len(locations)
    p["locations_by_zone"] = dict(sorted(Counter(loc[:2] for loc in locations).items()))
    p["records_per_zone"] = dict(sorted(Counter(m["Location name"][:2] for m in materials).items()))
    per_bed = Counter(m["Location name"] for m in materials)
    p["records_per_bed"] = {"min": min(per_bed.values()), "median": statistics.median(per_bed.values()),
                            "max": max(per_bed.values())}

    tagged = [m for m in materials if m["Tag number"] and m["Latitude"] and m["Longitude"]]
    p["tagged_with_coords"] = len(tagged)
    p["tagged_tree_share_pct"] = round(100 * sum("Tree" in m["Life forms"] for m in tagged) / len(tagged))
    p["tagged_beds"] = len({m["Location name"] for m in tagged})
    p["rows_without_tag_or_coords"] = sum(1 for m in materials if not m["Tag number"] and not m["Latitude"])

    lats = [float(m["Latitude"]) for m in tagged]
    lons = [float(m["Longitude"]) for m in tagged]
    p["extent"] = {"lat_min": round(min(lats), 5), "lat_max": round(max(lats), 5),
                   "lon_min": round(min(lons), 5), "lon_max": round(max(lons), 5)}
    xy = [_to_3997(lon, lat) for lon, lat in zip(lons, lats, strict=True)]
    p["extent_m"] = {"north_south": round(max(y for _, y in xy) - min(y for _, y in xy)),
                     "east_west": round(max(x for x, _ in xy) - min(x for x, _ in xy))}

    p["status"] = dict(Counter(m["Status"] for m in materials))
    p["condition"] = dict(sorted(Counter(m["Condition"] for m in materials if m["Condition"]).items()))
    p["provenance"] = dict(Counter(m["Provenance Code"] for m in materials))

    # IUCN per taxon, and plants of the threatened taxa
    iucn = Counter(t["IUCN red list status"] or "(blank)" for t in taxa)
    p["iucn_per_taxon"] = dict(sorted(iucn.items()))
    plants = Counter(m["Scientific name"] for m in materials)
    p["iucn_listed_plants"] = {
        t["Scientific name"]: {"status": t["IUCN red list status"], "plants": plants[t["Scientific name"]]}
        for t in taxa if t["IUCN red list status"] in ("Near Threatened", "Endangered", "Vulnerable",
                                                        "Critically Endangered")}

    # Always-empty columns in plant materials
    p["empty_material_columns"] = sorted(c for c in materials[0] if not any(m[c] for m in materials))

    # Tags
    tags = Counter(m["Tag number"] for m in materials if m["Tag number"])
    p["duplicate_tags"] = sorted(t for t, n in tags.items() if n > 1)
    p["tags_not_matching_pattern"] = sorted(t for t in tags if not TAG_RE.match(t))
    p["species_codes_in_tags"] = len({TAG_RE.match(t)["code"] for t in tags if TAG_RE.match(t)})
    mismatched = [m for m in tagged if tag_bed(m["Tag number"]) != m["Location name"]]
    p["tag_bed_mismatches"] = len(mismatched)

    # Suspicious names: a repeated trailing epithet, e.g. "Ziziphus spina-christi christi"
    def repeated(name: str) -> bool:
        words = name.split()
        return len(words) >= 3 and words[-1] in words[-2].split("-")

    p["names_to_check"] = sorted({t["Scientific name"] for t in taxa if repeated(t["Scientific name"])})

    # Spatial checks in EPSG:3997
    inside_own = outside_all = 0
    out_dist, out_boundary_beds, out_boundary = [], Counter(), 0
    out_by_tag: dict[str, list[float]] = {}
    for m in tagged:
        pt = Point(_to_3997(float(m["Longitude"]), float(m["Latitude"])))
        own = beds.get(m["Location name"])
        if own is not None and own.covers(pt):
            inside_own += 1
        if not any(b.covers(pt) for b in beds.values()):
            outside_all += 1
            if own is not None:
                out_dist.append(own.distance(pt))
                out_by_tag.setdefault(m["Tag number"], []).append(own.distance(pt))
            if not boundary.covers(pt):
                out_boundary += 1
                out_boundary_beds[m["Location name"]] += 1
    p["points_inside_own_bed"] = inside_own
    p["points_outside_all_beds"] = outside_all
    p["outside_distance_m"] = {"median": round(statistics.median(out_dist), 1), "max": round(max(out_dist), 1),
                               # rounded to 0.1 m first, as in data/gis/qa_tree_points_outside_beds.csv
                               "within_2m": sum(round(d, 1) <= 2 for d in out_dist)}
    p["outside_beds_and_boundary"] = out_boundary

    # Cross-check with the QA table produced on 28 Sep 2026 (same trees, same distances).
    if qa_path is not None and qa_path.exists():
        qa = read_csv(qa_path)
        qa_tags = Counter(r["tag"] for r in qa)
        ours = Counter({t: len(v) for t, v in out_by_tag.items()})
        worst = max((abs(min(out_by_tag[r["tag"]], key=lambda d: abs(d - float(r["dist_to_bed_m"])))
                         - float(r["dist_to_bed_m"])) for r in qa if r["tag"] in out_by_tag), default=0.0)
        p["qa_outside_beds_table"] = {"rows": len(qa), "same_trees": qa_tags == ours,
                                      "distances_agree_within_0_05_m": worst <= 0.05}
    p["outside_boundary_beds"] = sorted(out_boundary_beds)

    in_loc = in_tag = none = 0
    for m in mismatched:
        pt = Point(_to_3997(float(m["Longitude"]), float(m["Latitude"])))
        tb = beds.get(tag_bed(m["Tag number"]) or "")
        in_loc += beds[m["Location name"]].covers(pt)
        in_tag += bool(tb is not None and tb.covers(pt))
        none += not any(b.covers(pt) for b in beds.values())
    p["mismatch_spatial"] = {"inside_location_bed": in_loc, "inside_tag_bed": in_tag, "outside_all_beds": none}

    # GIS layers
    p["gis"] = {
        "beds_crs": geojson_crs(beds_path),
        "boundary_crs": geojson_crs(boundary_path),
        "beds": len(beds),
        "bed_names_match_hortis_locations": sorted(beds) == locations,
        "beds_all_valid": all(b.is_valid for b in beds.values()),
        "beds_inside_boundary": all(boundary.buffer(0.01).covers(b) for b in beds.values()),
        "boundary_area_m2": round(boundary.area),
    }

    # Dead plants (first replacement batch)
    p["dead_plants"] = sorted(
        [m["Scientific name"], m["Location name"], m["Tag number"]]
        for m in materials if m["Condition"] == "Dead")
    return p


def compare(actual, expected, path="") -> list[str]:
    """Return one line per difference. Only keys present in expected are checked."""
    if isinstance(expected, dict) and "approx" in expected:
        ok = abs(float(actual) - float(expected["approx"])) <= float(expected["tol"])
        return [] if ok else [f"{path[:-1]}: expected {expected['approx']!r} +/- {expected['tol']}, got {actual!r}"]
    if isinstance(expected, dict) and isinstance(actual, dict):
        out = []
        for k, v in expected.items():
            if k.startswith("_"):
                continue
            if k not in actual:
                out.append(f"{path}{k}: missing (expected {v!r})")
            else:
                out += compare(actual[k], v, f"{path}{k}.")
        return out
    if isinstance(expected, list) and isinstance(actual, list):
        a = sorted(map(json.dumps, actual))
        e = sorted(map(json.dumps, expected))
        return [] if a == e else [f"{path[:-1]}: expected {expected!r}, got {actual!r}"]
    if isinstance(expected, float) or isinstance(actual, float):
        return [] if abs(float(actual) - float(expected)) < 1e-9 else [
            f"{path[:-1]}: expected {expected!r}, got {actual!r}"]
    return [] if actual == expected else [f"{path[:-1]}: expected {expected!r}, got {actual!r}"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, default=ROOT / "data/hortis/raw/2026-04-27")
    ap.add_argument("--beds", type=Path, default=ROOT / "data/gis/TG_beds_new.geojson")
    ap.add_argument("--boundary", type=Path, default=ROOT / "data/gis/TG_boundary.geojson")
    ap.add_argument("--qa", type=Path, default=ROOT / "data/gis/qa_tree_points_outside_beds.csv")
    ap.add_argument("--expected", type=Path, default=ROOT / "data/hortis/PROFILE_2026-04-27.expected.json")
    ap.add_argument("--json", type=Path, help="write the computed profile to this file")
    args = ap.parse_args()

    p = profile(args.raw, args.beds, args.boundary, args.qa)
    if args.json:
        args.json.write_text(json.dumps(p, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    expected = json.loads(args.expected.read_text(encoding="utf-8"))
    diffs = compare(p, expected)
    checked = sum(1 for k in expected if not k.startswith("_"))
    if diffs:
        print(f"Profile differs from {args.expected.name} ({len(diffs)} of {checked} items):")
        for d in diffs:
            print("  " + d)
        return 1
    print(f"Profile matches {args.expected.name}: {checked} items checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
