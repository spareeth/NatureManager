"""Isolated trees lost between Dec 2025, Apr 2026 and Oct 2026 (visible bands only).

Continuous canopy (hedges, dense beds, tree rows) cannot be split into single trees at 30 cm, so it is
reported as area elsewhere. Here only trees that stand apart are counted: street trees, car-park and
plaza trees, palms. They are found on the December vegetation map (from crowns_rgb.py):

  isolated tree = a vegetated patch of 4 to 150 m2 (a crown about 2 to 14 m across), compact (not a
  hedge: at most 3 times as long as wide, filling at least 35% of its bounding box), with at most 10%
  vegetation in a 3 m ring around it.

Each tree is then judged on its own footprint in April and October (after per-block registration to
December, plus 1.5 m tolerance):

  present  at least 30% of the footprint vegetated
  absent   under 10% of the footprint vegetated
  lost by April         absent in April and in October
  lost April to October present in April, absent in October
  flicker               absent in April, present in October: cannot be a removal, so it measures the
                        error of a single date's call; reported with the losses.

Writes data/trees/isolated/: trees_dec2025.geojson (with status), lost_trees.geojson, summary.json,
and side-by-side image chips of the largest losses.
Usage: scripts/imagery/.venv/bin/python scripts/trees/isolated_trees.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from scipy import ndimage

from crowns_rgb import BLOCK_M, PX, block_offsets

gdal.UseExceptions()
D = Path(__file__).resolve().parents[2] / "data/trees"
IN = D / "crowns"
OUT = D / "isolated"
MIN_M2, MAX_M2 = 4.0, 150.0
RING_M = 3.0
RING_MAX_VEG = 0.10
TOL_M = 1.5
PRESENT, ABSENT = 0.30, 0.10


def load(d):
    return np.load(IN / f"prob_{d}.npy").astype("float32"), np.load(IN / f"valid_{d}.npy")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pd, vd = load("dec2025")
    pa, va = load("apr2026")
    po, vo = load("oct2026")
    ds = gdal.Open(str(D / "dec2025_rgb30.tif"))
    gt, proj = ds.GetGeoTransform(), ds.GetProjection()

    veg = ndimage.gaussian_filter(pd, 0.8) > 0.5
    veg &= vd
    lab, n = ndimage.label(veg)
    idx = np.arange(1, n + 1)
    area = ndimage.sum(veg, lab, idx) * PX * PX
    objs = ndimage.find_objects(lab)
    ring_px = int(round(RING_M / PX))

    # Registration of April and October to December, per block (as in crowns_rgb.py)
    offs = {d: block_offsets(ndimage.gaussian_filter(pd, 2), ndimage.gaussian_filter(p, 2))
            for d, p in (("apr2026", pa), ("oct2026", po))}
    tol = int(round(TOL_M / PX))
    near = {"apr2026": ndimage.maximum_filter(pa, size=2 * tol + 1) > 0.5,
            "oct2026": ndimage.maximum_filter(po, size=2 * tol + 1) > 0.5}
    valid_other = {"apr2026": va, "oct2026": vo}
    H, W = pd.shape
    bs = BLOCK_M / PX

    trees = []
    for i, sl in enumerate(objs):
        if sl is None or not (MIN_M2 <= area[i] <= MAX_M2):
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if max(h, w) > 3 * min(h, w) or area[i] / (h * w * PX * PX) < 0.35:
            continue  # elongated (hedge, row) or straggly
        r0, r1 = max(0, sl[0].start - ring_px), min(H, sl[0].stop + ring_px)
        c0, c1 = max(0, sl[1].start - ring_px), min(W, sl[1].stop + ring_px)
        own = lab[r0:r1, c0:c1] == i + 1
        ring = ndimage.binary_dilation(own, iterations=ring_px) & ~own
        if veg[r0:r1, c0:c1][ring].mean() > RING_MAX_VEG:
            continue  # part of denser planting
        rr, cc = np.nonzero(own)
        rr = rr + r0
        cc = cc + c0
        status = {}
        for d in ("apr2026", "oct2026"):
            dy, dx, _ = offs[d].get((int(rr.mean() // bs), int(cc.mean() // bs)), (0, 0, 0))
            r2 = np.clip(rr - dy, 0, H - 1)
            c2 = np.clip(cc - dx, 0, W - 1)
            if not valid_other[d][r2, c2].all():
                status[d] = None  # no image there
                continue
            frac = float(near[d][r2, c2].mean())
            status[d] = "present" if frac >= PRESENT else "absent" if frac < ABSENT else "unclear"
        trees.append({"row": float(rr.mean()), "col": float(cc.mean()), "area_m2": round(float(area[i]), 1),
                      "apr": status["apr2026"], "oct": status["oct2026"]})

    def cls(t):
        a, o = t["apr"], t["oct"]
        if a is None or o is None or "unclear" in (a, o):
            return "unclear"
        if a == "absent" and o == "absent":
            return "lost by Apr 2026"
        if a == "present" and o == "absent":
            return "lost Apr to Oct 2026"
        if a == "absent" and o == "present":
            return "flicker"
        return "still there"

    for t in trees:
        t["status"] = cls(t)
    counts = {}
    for t in trees:
        counts[t["status"]] = counts.get(t["status"], 0) + 1
    judged = sum(v for k, v in counts.items() if k != "unclear")
    lost = counts.get("lost by Apr 2026", 0) + counts.get("lost Apr to Oct 2026", 0)
    flicker = counts.get("flicker", 0)
    # A single-date false "absent" occurs at rate e: flicker ~ e (Apr wrong, Oct right). A false loss needs
    # the tree wrongly absent in October (and, for "lost by April", in April too), so about e x (still
    # there + flicker) trees could be false "lost Apr to Oct" and about e^2 x ... false "lost by Apr".
    e = flicker / max(counts.get("still there", 0) + flicker, 1)
    false_lost = e * counts.get("still there", 0) + e * e * counts.get("still there", 0)
    summary = {
        "isolated_trees_dec2025": len(trees),
        "judged": judged,
        "by_status": counts,
        "lost": lost,
        "lost_crown_area_m2": round(sum(t["area_m2"] for t in trees if t["status"].startswith("lost")), 0),
        "single_date_error_rate": round(e, 3),
        "expected_false_losses": round(false_lost),
        "lost_range": [max(0, round(lost - false_lost)), lost],
        "rules": {"crown_m2": [MIN_M2, MAX_M2], "ring_m": RING_M, "ring_max_vegetation": RING_MAX_VEG,
                  "tolerance_m": TOL_M, "present_at_least": PRESENT, "absent_below": ABSENT},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

    src = osr.SpatialReference(); src.ImportFromWkt(proj)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326); dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tr = osr.CoordinateTransformation(src, dst)

    def feat(t):
        x = gt[0] + (t["col"] + 0.5) * gt[1]; y = gt[3] + (t["row"] + 0.5) * gt[5]
        lon, lat, _ = tr.TransformPoint(x, y)
        return {"type": "Feature", "properties": {k: t[k] for k in ("area_m2", "status", "apr", "oct")},
                "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]}}

    (OUT / "trees_dec2025.geojson").write_text(json.dumps({"type": "FeatureCollection",
                                                           "features": [feat(t) for t in trees]}))
    lost_t = [t for t in trees if t["status"].startswith("lost")]
    (OUT / "lost_trees.geojson").write_text(json.dumps({"type": "FeatureCollection",
                                                        "features": [feat(t) for t in lost_t]}))
    chips(sorted(lost_t, key=lambda t: -t["area_m2"])[:12], OUT / "lost_largest.png")
    rng = np.random.default_rng(7)
    sample = [lost_t[i] for i in rng.choice(len(lost_t), min(12, len(lost_t)), replace=False)] if lost_t else []
    chips(sample, OUT / "lost_random_sample.png")


def chips(ts, path):
    """Each tree on the three dates: Dec 2025 | Apr 2026 | Oct 2026 (40 m across, crown circled)."""
    if not ts:
        return
    from PIL import Image, ImageDraw, ImageFont

    imgs = {}
    for d in ("dec2025", "apr2026", "oct2026"):
        ds = gdal.Open(str(D / f"{d}_rgb30.tif"))
        imgs[d] = [ds.GetRasterBand(i) for i in (1, 2, 3)], ds
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    h = 66  # 20 m each side
    tiles = []
    for t in ts:
        r, c = int(t["row"]), int(t["col"])
        row = Image.new("RGB", (3 * 200 + 20, 222), "white")
        for k, d in enumerate(("dec2025", "apr2026", "oct2026")):
            bands, ds = imgs[d]
            r0 = max(0, r - h); c0 = max(0, c - h)
            a = np.dstack([b.ReadAsArray(c0, r0, 2 * h, 2 * h) for b in bands])
            im = Image.fromarray(a).resize((200, 200))
            rad = max(6, math.sqrt(t["area_m2"] / math.pi) / PX * 200 / (2 * h))
            ImageDraw.Draw(im).ellipse([100 - rad - 3, 100 - rad - 3, 100 + rad + 3, 100 + rad + 3],
                                       outline=(255, 40, 40), width=2)
            row.paste(im, (k * 210, 22))
        ImageDraw.Draw(row).text((4, 3), f"{t['area_m2']:.0f} m2 crown, {t['status']}   Dec 2025 | Apr 2026 | Oct 2026",
                                 fill="black", font=font)
        tiles.append(row)
    cols = 2
    sheet = Image.new("RGB", (cols * 640, ((len(tiles) + 1) // cols) * 232), "white")
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * 640, (k // cols) * 232))
    sheet.save(path)


if __name__ == "__main__":
    main()
