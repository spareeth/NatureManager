"""Tree crowns from the visible bands on three dates, and trees lost between them.

Dates (all on one grid: UTM 40N, 0.3 m, ECD extent; data/trees/<date>_rgb30.tif):
  dec2025  Pleiades Neo, 28 Dec 2025 (also has near-infrared: used only to train, never to count)
  apr2026  SuperView Neo, 24 Apr 2026
  oct2026  SuperView Neo, 10 Oct 2026

Method
 1. Colour balance: April and October are histogram-matched to December, band by band.
 2. A pixel model (gradient boosting on colour, greenness indices, texture and context) learns vegetation
    from the December colours, with the December NDVI as labels (same date: no change in the labels).
    It is then applied to the colours of every date, so all three are counted the same way, RGB only.
 3. Crowns: the smoothed vegetation probability is split at local peaks at least 2.7 m apart; each
    vegetated pixel goes to its nearest peak. Tree crowns are segments of at least 6 m2.
 4. Matching: per 300 m block, the offset of each date to December is measured (cross-correlation of
    the probability maps) and removed; crowns match when their centres are within 2.5 m.
 5. Lost by October: a December crown with no October crown within 2.5 m and a low October vegetation
    probability over the crown (mean below 0.3). Timing from April: lost by April, or after April.
 6. Noise: crowns found in December and October but missing in April cannot be removals (trees do not
    regrow in six months). That share is the detector's miss rate on one date, reported with the losses.

Writes data/trees/crowns/: crowns_<date>.geojson (points with area), lost_trees.geojson, summary.json.
Usage: scripts/imagery/.venv/bin/python scripts/trees/crowns_rgb.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from scipy import ndimage
from scipy.spatial import cKDTree
from sklearn.ensemble import HistGradientBoostingClassifier

gdal.UseExceptions()
D = Path(__file__).resolve().parents[2] / "data/trees"
OUT = D / "crowns"
PX = 0.3
PX_M2 = PX * PX
MIN_CROWN_M2 = 6.0
PEAK_DIST_M = 2.7
MATCH_M = 2.5
LOST_P = 0.3
BLOCK_M = 300
DATES = ["dec2025", "apr2026", "oct2026"]


def read_rgb(date):
    ds = gdal.Open(str(D / f"{date}_rgb30.tif"))
    return ds, np.stack([ds.GetRasterBand(i).ReadAsArray() for i in (1, 2, 3)]).astype("float32")


def match_hist(src, ref, valid_s, valid_r):
    out = src.copy()
    for b in range(3):
        s = src[b][valid_s]; r = ref[b][valid_r]
        sq = np.percentile(s, np.linspace(0, 100, 257)); rq = np.percentile(r, np.linspace(0, 100, 257))
        out[b] = np.interp(src[b], sq, rq)
    return out





def features(rgb):
    r, g, b = rgb
    bright = r + g + b + 1
    f = {"r": r, "g": g, "b": b, "bright": bright, "rc": r / bright, "gc": g / bright,
         "exg": 2 * g - r - b, "gr": g - r, "gb": g - b,
         "vari": np.clip((g - r) / np.where(np.abs(g + r - b) < 1, 1, g + r - b), -2, 2)}
    for k, size in (("bright", 5), ("exg", 5), ("gr", 5), ("exg", 15), ("bright", 15)):
        m = ndimage.uniform_filter(f[k], size)
        f[f"{k}_m{size}"] = m
        if size == 5:
            f[f"{k}_s{size}"] = np.sqrt(np.maximum(ndimage.uniform_filter(f[k] ** 2, size) - m * m, 0))
    return np.stack([v.ravel() for v in f.values()], axis=1).astype("float32")


STRIP = 600   # rows per strip (features are computed strip by strip to keep memory low)
MARGIN = 16   # overlap so the neighbourhood filters (up to 15 px) are right at strip edges


def strips(h):
    for y0 in range(0, h, STRIP):
        a = max(0, y0 - MARGIN); b = min(h, y0 + STRIP + MARGIN)
        yield y0, min(h, y0 + STRIP), a, b


def prob_map(model, rgb):
    """Vegetation probability for a whole image, strip by strip."""
    h, w = rgb.shape[1:]
    out = np.zeros((h, w), "float32")
    for y0, y1, a, b in strips(h):
        X = features(rgb[:, a:b])
        p = model.predict_proba(X)[:, 1].reshape(b - a, w)
        out[y0:y1] = p[y0 - a:y0 - a + (y1 - y0)]
    return out


def training_sample(rgb, labels, mask, n, rng):
    """Random pixels (natural class shares) with their features, strip by strip."""
    h, w = rgb.shape[1:]
    total = int(mask.sum())
    Xs, ys, cols = [], [], []
    for y0, y1, a, b in strips(h):
        m = mask[y0:y1]
        k = int(round(n * m.sum() / max(total, 1)))
        if k == 0:
            continue
        idx = rng.choice(np.flatnonzero(m.ravel()), min(k, int(m.sum())), replace=False)
        F = features(rgb[:, a:b])
        X = F.reshape(b - a, w, -1)[y0 - a:y0 - a + (y1 - y0)].reshape(-1, F.shape[1])
        Xs.append(X[idx]); ys.append(labels[y0:y1].ravel()[idx]); cols.append(idx % w)
    return np.concatenate(Xs), np.concatenate(ys), np.concatenate(cols)


def crowns(prob, valid):
    sm = ndimage.gaussian_filter(prob, 1.0)
    veg = (sm > 0.5) & valid
    size = int(round(PEAK_DIST_M / PX)) | 1
    peaks = (sm == ndimage.maximum_filter(sm, size=size)) & veg
    markers, n = ndimage.label(peaks)
    # each vegetated pixel to its nearest peak
    _, (ri, ci) = ndimage.distance_transform_edt(markers == 0, return_indices=True)
    seg = markers[ri, ci] * veg
    area = ndimage.sum(np.ones_like(seg), seg, index=np.arange(1, n + 1)) * PX_M2
    cy, cx = np.array(ndimage.center_of_mass(veg, seg, index=np.arange(1, n + 1))).T
    keep = area >= MIN_CROWN_M2
    return seg, np.column_stack([cx[keep], cy[keep]]), area[keep], np.arange(1, n + 1)[keep]


def block_offsets(ref, mov):
    """Shift (pixels) of mov relative to ref, per block, by phase correlation."""
    bs = int(BLOCK_M / PX)
    H, W = ref.shape
    out = {}
    for by in range(0, H, bs):
        for bx in range(0, W, bs):
            a = ref[by:by + bs, bx:bx + bs]; b = mov[by:by + bs, bx:bx + bs]
            if a.shape != (bs, bs) or a.std() < 0.05 or b.std() < 0.05:
                out[(by // bs, bx // bs)] = (0, 0, 0.0)
                continue
            A = np.fft.fft2(a - a.mean()); B = np.fft.fft2(b - b.mean())
            F = A * np.conj(B); c = np.fft.ifft2(F / (np.abs(F) + 1e-9)).real
            dy, dx = np.unravel_index(np.argmax(c), c.shape)
            dy = dy - bs if dy > bs // 2 else dy; dx = dx - bs if dx > bs // 2 else dx
            peak = float(c.max())
            # weak peaks or implausible shifts (over 15 m) are ignored
            ok = peak > 0.05 and abs(dy) * PX < 15 and abs(dx) * PX < 15
            out[(by // bs, bx // bs)] = (dy, dx, peak) if ok else (0, 0, peak)
    return out


def shift_points(pts, offs):
    bs = BLOCK_M / PX
    out = pts.copy()
    for i, (x, y) in enumerate(pts):
        dy, dx, _ = offs.get((int(y // bs), int(x // bs)), (0, 0, 0))
        out[i] = (x + dx, y + dy)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    ds, dec = read_rgb("dec2025")
    gt, proj = ds.GetGeoTransform(), ds.GetProjection()
    nds = gdal.Open(str(D / "dec2025_ndvi30.tif"))
    ndvi = nds.GetRasterBand(1).ReadAsArray()
    nds = None
    imgs = {"dec2025": dec}
    # Image footprint (dark shadowed canopy inside it is data, not a gap)
    valid = {"dec2025": ndimage.binary_fill_holes(dec.sum(0) > 10)}
    for d in DATES[1:]:
        _, x = read_rgb(d)
        valid[d] = ndimage.binary_fill_holes(x.sum(0) > 10)
        imgs[d] = match_hist(x, dec, valid[d], valid["dec2025"])

    # Train on December colours with December NDVI labels (natural share of vegetation)
    sm = ndimage.gaussian_filter(ndvi, 0.8)
    vegl = sm > 0.3
    nonl = sm < 0.1
    rng = np.random.default_rng(42)
    lab_mask = (vegl | nonl) & valid["dec2025"]
    Xs, ys, cols = training_sample(dec, vegl, lab_mask, 500_000, rng)
    # hold out the east third of the extent to measure accuracy on unseen ground
    W = dec.shape[2]
    tr_m = cols < 2 * W // 3
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, random_state=42)
    model.fit(Xs[tr_m], ys[tr_m])
    pt = model.predict_proba(Xs[~tr_m])[:, 1] > 0.5
    yt = ys[~tr_m]
    acc = {"pixel_accuracy": round(float((pt == yt).mean()), 3),
           "vegetation_found": round(float((pt & yt).sum() / max(yt.sum(), 1)), 3),
           "vegetation_correct": round(float((pt & yt).sum() / max(pt.sum(), 1)), 3)}
    del Xs
    print("held-out accuracy (December, RGB vs NDVI):", acc, f"{time.time() - t0:.0f} s", flush=True)

    probs, pts, areas = {}, {}, {}
    for d in DATES:
        probs[d] = prob_map(model, imgs[d])
        probs[d][~valid[d]] = 0
        _, p, a, _ = crowns(probs[d], valid[d])
        pts[d], areas[d] = p, a
        print(f"{d}: {len(p)} tree crowns (>= {MIN_CROWN_M2} m2); vegetated "
              f"{(probs[d] > 0.5).sum() * PX_M2 / 1e4:.1f} ha", flush=True)

    # Same-date check: RGB crowns against crowns from the December NDVI itself
    _, ndvi_pts, _, _ = crowns(np.clip((sm - 0.1) / 0.4, 0, 1), valid["dec2025"])
    tr_n = cKDTree(ndvi_pts); tr_r = cKDTree(pts["dec2025"])
    crown_check = {
        "ndvi_crowns": int(len(ndvi_pts)), "rgb_crowns": int(len(pts["dec2025"])),
        "ndvi_crowns_found_by_rgb": round(float((tr_r.query(ndvi_pts)[0] <= MATCH_M).mean()), 3),
        "rgb_crowns_confirmed_by_ndvi": round(float((tr_n.query(pts["dec2025"])[0] <= MATCH_M).mean()), 3)}
    print("December crowns, RGB vs NDVI:", crown_check, flush=True)

    # Register April and October to December per block, then match
    shifted = {"dec2025": pts["dec2025"]}
    offs_summary = {}
    for d in DATES[1:]:
        offs = block_offsets(ndimage.gaussian_filter(probs["dec2025"], 2), ndimage.gaussian_filter(probs[d], 2))
        sh = np.array([(dy, dx) for dy, dx, _ in offs.values()]) * PX
        offs_summary[d] = {"blocks": len(offs), "median_shift_m": [round(float(v), 1) for v in np.median(sh, 0)],
                           "max_shift_m": round(float(np.abs(sh).max()), 1)}
        shifted[d] = shift_points(pts[d], offs)
    trees = {d: cKDTree(shifted[d]) for d in DATES}
    present = {d: trees[d].query(pts["dec2025"])[0] <= MATCH_M / PX for d in DATES[1:]}

    # Low October probability over the crown confirms a loss (not just a missed peak)
    rr = np.clip(pts["dec2025"][:, 1].astype(int), 0, dec.shape[1] - 1)
    cc = np.clip(pts["dec2025"][:, 0].astype(int), 0, dec.shape[2] - 1)
    oct_p = ndimage.uniform_filter(probs["oct2026"], 9)[rr, cc]
    apr_p = ndimage.uniform_filter(probs["apr2026"], 9)[rr, cc]
    lost_oct = ~present["oct2026"] & (oct_p < LOST_P)
    lost_by_apr = lost_oct & ~present["apr2026"] & (apr_p < LOST_P)
    flicker = present["oct2026"] & ~present["apr2026"]  # gone in April, back in October: detector noise
    noise = float(flicker.sum() / max(present["oct2026"].sum(), 1))

    n_dec = len(pts["dec2025"])
    summary = {
        "trees_dec2025": n_dec, "trees_apr2026": int(len(pts["apr2026"])), "trees_oct2026": int(len(pts["oct2026"])),
        "lost_by_oct2026": int(lost_oct.sum()),
        "lost_by_apr2026": int(lost_by_apr.sum()),
        "lost_between_apr_and_oct": int((lost_oct & ~lost_by_apr).sum()),
        "lost_crown_area_ha": round(float(areas["dec2025"][lost_oct].sum()) / 1e4, 2),
        "detector_miss_rate_one_date": round(noise, 3),
        "lost_if_all_noise_were_loss": int(round(noise * n_dec)),
        "crown_size_m2_of_lost": {k: int(v) for k, v in zip(
            ["6_to_15", "15_to_40", "40_plus"],
            [((areas["dec2025"][lost_oct] >= 6) & (areas["dec2025"][lost_oct] < 15)).sum(),
             ((areas["dec2025"][lost_oct] >= 15) & (areas["dec2025"][lost_oct] < 40)).sum(),
             (areas["dec2025"][lost_oct] >= 40).sum()])},
        "held_out_pixel_accuracy": acc, "december_crown_check": crown_check, "registration": offs_summary,
        "parameters": {"min_crown_m2": MIN_CROWN_M2, "peak_distance_m": PEAK_DIST_M, "match_m": MATCH_M,
                       "lost_probability_below": LOST_P, "block_m": BLOCK_M},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if not isinstance(v, dict)}, indent=2))

    # GeoJSON (WGS 84) of crowns per date and of the lost trees
    src = osr.SpatialReference(); src.ImportFromWkt(proj)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326); dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tr = osr.CoordinateTransformation(src, dst)

    def lonlat(p):
        x = gt[0] + (p[0] + 0.5) * gt[1]; y = gt[3] + (p[1] + 0.5) * gt[5]
        lon, lat, _ = tr.TransformPoint(x, y)
        return [round(lon, 7), round(lat, 7)]

    def write(name, P, A, extra=None):
        feats = [{"type": "Feature", "properties": {"crown_m2": round(float(a), 1), **(extra[i] if extra else {})},
                  "geometry": {"type": "Point", "coordinates": lonlat(p)}} for i, (p, a) in enumerate(zip(P, A))]
        (OUT / name).write_text(json.dumps({"type": "FeatureCollection", "features": feats}))

    for d in DATES:
        write(f"crowns_{d}.geojson", pts[d], areas[d])
    li = np.flatnonzero(lost_oct)
    write("lost_trees.geojson", pts["dec2025"][li], areas["dec2025"][li],
          [{"when": "by Apr 2026" if lost_by_apr[i] else "Apr to Oct 2026"} for i in li])
    for d in DATES:  # vegetation maps (and where each image has data) for isolated_trees.py
        np.save(OUT / f"prob_{d}.npy", probs[d].astype("float16"))
        np.save(OUT / f"valid_{d}.npy", valid[d])
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
