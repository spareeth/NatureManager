"""Vegetation maps for April and October from models trained on their own colours.

The December-trained model misses vegetation that the SuperView images (April, October) render very dark,
even after colour matching, so most "lost by April" patches were vegetation still there. Here each later
date gets its own model, trained on that image's colours with the December NDVI classes as labels. Most of
the ground did not change between the dates, so the model learns how vegetation looks on that image; real
changes are a small share of the labels.

Writes data/trees/crowns/prob_<date>_own.npy (float16) and prints the held-out accuracy per date.
Usage: scripts/imagery/.venv/bin/python -u scripts/trees/own_models.py
"""

from __future__ import annotations

import time

import numpy as np
from osgeo import gdal
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier

from crowns_rgb import D, OUT, prob_map, read_rgb, training_sample

gdal.UseExceptions()


def main() -> None:
    nds = gdal.Open(str(D / "dec2025_ndvi30.tif"))
    ndvi = nds.GetRasterBand(1).ReadAsArray()
    nds = None
    sm = ndimage.gaussian_filter(ndvi, 0.8)
    vegl, nonl = sm > 0.3, sm < 0.1
    for d in ("apr2026", "oct2026"):
        t0 = time.time()
        _, rgb = read_rgb(d)
        valid = ndimage.binary_fill_holes(rgb.sum(0) > 10)
        rng = np.random.default_rng(42)
        X, y, cols = training_sample(rgb, vegl, (vegl | nonl) & valid, 500_000, rng)
        W = rgb.shape[2]
        tr = cols < 2 * W // 3
        model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, random_state=42)
        model.fit(X[tr], y[tr])
        pt = model.predict_proba(X[~tr])[:, 1] > 0.5
        yt = y[~tr]
        print(f"{d}: held-out agreement with Dec NDVI {(pt == yt).mean():.3f}, vegetation found "
              f"{(pt & yt).sum() / max(yt.sum(), 1):.3f}, correct {(pt & yt).sum() / max(pt.sum(), 1):.3f}", flush=True)
        del X
        p = prob_map(model, rgb)
        p[~valid] = 0
        np.save(OUT / f"prob_{d}_own.npy", p.astype("float16"))
        print(f"{d}: vegetated {(p > 0.5).sum() * 0.09 / 1e4:.1f} ha, {time.time() - t0:.0f} s", flush=True)
        del rgb, p


if __name__ == "__main__":
    main()
