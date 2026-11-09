"""Vegetation change Dec 2025 to Apr 2026 to Oct 2026, as a map layer (visible bands, one model).

Uses the vegetation probability maps of crowns_rgb.py (the same model on all three dates, on one 30 cm
grid). A pixel is vegetated above 0.5; "not vegetated" means no vegetated pixel within 1.5 m (date-to-date
registration). Change patches under 10 m2 are dropped.

  lost by April          surely vegetated in Dec (p > 0.8), nothing above 0.2 within 2.4 m in Apr and Oct  red
  lost April to October  surely vegetated in Dec and Apr, nothing above 0.2 within 2.4 m in Oct           orange
  new by October         surely vegetated in Apr and Oct, nothing above 0.2 within 2.4 m in Dec           blue
  Patches under 20 m2 are dropped. Noise: surely vegetated in Dec and Oct but not in Apr (flicker).
  unchanged              vegetated on all three dates                       pale green

Writes data/trees/change/change_rgba_3857.tif (for tiling, build_layers.py change_dec_oct) and
change_summary.json.
Usage: scripts/imagery/.venv/bin/python scripts/trees/change_layer.py
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
from osgeo import gdal
from scipy import ndimage

gdal.UseExceptions()
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data/trees"
OUT = D / "change"
PX = 0.3
TOL_M = 2.4
MIN_M2 = 20.0
HIGH, LOW = 0.8, 0.2  # confidently vegetated / confidently not (anything above LOW nearby counts as maybe)


def clean(m: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if not n:
        return m
    keep = np.zeros(n + 1, bool)
    keep[1:] = ndimage.sum(m, lab, np.arange(1, n + 1)) * PX * PX >= MIN_M2
    return keep[lab]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # December: the December model. April and October: their own models (own_models.py) when present, as
    # the December model misses vegetation those images render very dark.
    def prob(d):
        own = D / f"crowns/prob_{d}_own.npy"
        return np.load(own if own.exists() and d != "dec2025" else D / f"crowns/prob_{d}.npy").astype("float32")

    p = {d: prob(d) for d in ("dec2025", "apr2026", "oct2026")}
    # Image footprint: dark pixels inside it (shadowed canopy) are data, not gaps.
    v = {d: ndimage.binary_fill_holes(np.load(D / f"crowns/valid_{d}.npy")) for d in p}
    valid = v["dec2025"] & v["apr2026"] & v["oct2026"]
    # No smoothing: the December map is crisp (same-date training) and the others softer, so smoothing
    # would treat the dates differently. Speckle is removed by the minimum patch size instead.
    veg = {d: p[d] > 0.5 for d in p}
    sure = {d: p[d] > HIGH for d in p}
    tol = int(round(TOL_M / PX))
    near = {d: ndimage.maximum_filter(p[d], size=2 * tol + 1) > LOW for d in p}

    # Changes must be confident on every date involved; new vegetation must be there in April and October.
    lost_apr = clean(sure["dec2025"] & ~near["apr2026"] & ~near["oct2026"] & valid)
    lost_oct = clean(sure["dec2025"] & sure["apr2026"] & ~near["oct2026"] & valid)
    new = clean(sure["oct2026"] & sure["apr2026"] & ~near["dec2025"] & valid)
    flicker = clean(sure["dec2025"] & ~near["apr2026"] & sure["oct2026"] & valid)  # noise estimate
    same = veg["dec2025"] & veg["apr2026"] & veg["oct2026"] & valid

    ha = lambda m: round(float(m.sum()) * PX * PX / 1e4, 2)  # noqa: E731
    summary = {"lost_by_apr_ha": ha(lost_apr), "lost_apr_to_oct_ha": ha(lost_oct), "new_by_oct_ha": ha(new),
               "unchanged_ha": ha(same), "noise_flicker_ha": ha(flicker),
               "vegetated_ha": {d: ha(veg[d] & valid) for d in p},
               "rules": {"confident_above": HIGH, "confident_absent_below": LOW, "tolerance_m": TOL_M,
                         "min_patch_m2": MIN_M2}}
    (OUT / "change_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

    np.save(OUT / "lost_apr_mask.npy", lost_apr)
    rgba = np.zeros((4, *same.shape), "uint8")
    for m, col in ((same, (150, 200, 120, 110)), (new, (40, 110, 220, 225)),
                   (lost_oct, (233, 162, 59, 235)), (lost_apr, (194, 65, 12, 240))):
        for i in range(4):
            rgba[i][m] = col[i]
    ref = gdal.Open(str(D / "dec2025_rgb30.tif"))
    utm = OUT / "change_rgba_32640.tif"
    o = gdal.GetDriverByName("GTiff").Create(str(utm), same.shape[1], same.shape[0], 4, gdal.GDT_Byte,
                                             ["COMPRESS=DEFLATE", "TILED=YES"])
    o.SetGeoTransform(ref.GetGeoTransform()); o.SetProjection(ref.GetProjection())
    for i in range(4):
        o.GetRasterBand(i + 1).WriteArray(rgba[i])
    o.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    o = None
    subprocess.run(["gdalwarp", "-q", "-overwrite", "-t_srs", "EPSG:3857", "-r", "near", "-co", "COMPRESS=DEFLATE",
                    "-co", "TILED=YES", str(utm), str(OUT / "change_rgba_3857.tif")], check=True)


if __name__ == "__main__":
    main()
