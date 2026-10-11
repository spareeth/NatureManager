"""Check which CRS a CAD drawing (DXF) is in, and how well it lines up with the bed polygons.

A DXF has no CRS field. This script reads the header (units, extents), compares the extents with
the site boundary in EPSG:3997, then measures the distance from every bed polygon vertex to the
nearest CAD vertex (blocks expanded). A small, consistent distance means the drawing is in
EPSG:3997 and aligned; a constant offset means a shift to correct (docs/COORDINATES.md section 3).

    python scripts/gis/check_cad_alignment.py path/to/drawing.dxf [--log run.log]
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

import ezdxf
from ezdxf import disassemble, recover
from pyproj import Transformer
from shapely import STRtree, points

ROOT = Path(__file__).resolve().parents[2]
INSUNITS = {0: "unitless", 1: "inches", 2: "feet", 4: "millimetres", 5: "centimetres", 6: "metres"}
_to_3997 = Transformer.from_crs("OGC:CRS84", "EPSG:3997", always_xy=True).transform


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


def geojson_vertices(path: Path) -> list[tuple[float, float]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for f in data["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        out += [_to_3997(x, y) for poly in polys for ring in poly for x, y, *_ in ring]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dxf", type=Path)
    ap.add_argument("--beds", type=Path, default=ROOT / "data/gis/TG_beds_new.geojson")
    ap.add_argument("--boundary", type=Path, default=ROOT / "data/gis/TG_boundary.geojson")
    args = ap.parse_args()

    log(f"reading {args.dxf.name} ({args.dxf.stat().st_size / 1e6:.0f} MB)")
    doc, _ = recover.readfile(args.dxf)
    hdr = doc.header
    units = INSUNITS.get(hdr.get("$INSUNITS", 0), str(hdr.get("$INSUNITS")))
    emin, emax = hdr.get("$EXTMIN"), hdr.get("$EXTMAX")
    log(f"DXF {hdr.get('$ACADVER')}, units {units}, extents E {emin[0]:.1f}..{emax[0]:.1f}, "
        f"N {emin[1]:.1f}..{emax[1]:.1f}")

    b = geojson_vertices(args.boundary)
    be = (min(x for x, _ in b), max(x for x, _ in b), min(y for _, y in b), max(y for _, y in b))
    inside = emin[0] <= be[0] and be[1] <= emax[0] and emin[1] <= be[2] and be[3] <= emax[1]
    log(f"TG boundary in EPSG:3997: E {be[0]:.1f}..{be[1]:.1f}, N {be[2]:.1f}..{be[3]:.1f}; "
        f"inside the drawing extents: {inside}")

    msp = doc.modelspace()
    log("modelspace: " + ", ".join(f"{k} {v}" for k, v in Counter(e.dxftype() for e in msp).most_common()))
    xs, ys, layers = [], [], []
    n = 0
    for prim in disassemble.to_primitives(disassemble.recursive_decompose(msp)):
        n += 1
        if n % 100_000 == 0:
            log(f"  {n} primitives, {len(xs)} vertices")
        try:
            vs = list(prim.vertices())
        except Exception:  # unsupported primitive, skip
            continue
        layer = prim.entity.dxf.layer if prim.entity is not None else "?"
        for v in vs:
            xs.append(v.x)
            ys.append(v.y)
            layers.append(layer)
    log(f"{n} primitives, {len(xs)} vertices")

    tree = STRtree(points(list(zip(xs, ys, strict=True))))
    bv = geojson_vertices(args.beds)
    idx = tree.query_nearest(points(bv), return_distance=True, all_matches=False)
    (_, cad_i), dist = idx
    d = [float(x) for x in dist]
    q = statistics.quantiles(d, n=20)
    log(f"bed vertices {len(bv)}: distance to nearest CAD vertex median {statistics.median(d):.2f} m, "
        f"p75 {q[14]:.2f}, p90 {q[17]:.2f}, max {max(d):.2f}")
    for t in (0.1, 0.5, 1.0):
        log(f"  within {t} m: {100 * sum(x <= t for x in d) / len(d):.0f}%")
    close = [(i, j) for i, (j, x) in enumerate(zip(cad_i, d, strict=True)) if x <= 1.0]
    if close:
        de = statistics.mean(xs[j] - bv[i][0] for i, j in close)
        dn = statistics.mean(ys[j] - bv[i][1] for i, j in close)
        log(f"  mean offset of matches within 1 m (dE, dN): {de:.3f}, {dn:.3f} m")
        log("  CAD layers matched: " + ", ".join(
            f"{k} {v}" for k, v in Counter(layers[j] for _, j in close).most_common(5)))
    log(f"ezdxf {ezdxf.__version__}; done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
