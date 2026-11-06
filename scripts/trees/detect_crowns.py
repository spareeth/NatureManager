"""Tree crown detection in the visible bands (RGB only), for counting trees over time.

Detector: DeepForest (weecology, MIT licence), a RetinaNet tree crown model trained on aerial RGB images
(about 10 cm). Our images are 30 cm, so they can be upsampled before detection (--scale) so crowns have
roughly the pixel size the model was trained on.

Inputs: data/trees/<date>_rgb30.tif (all dates on one grid: UTM 40N, 0.3 m, ECD extent; made with GDAL).
Output: data/trees/crowns_<date>.geojson (boxes in EPSG:32640 with score, centre x/y, crown width).

Usage:
  scripts/trees/.venv/bin/python scripts/trees/detect_crowns.py dec2025 [--scale 2] [--window x0 y0 x1 y1]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data/trees"


def load_model():
    from deepforest import main

    m = main.deepforest()
    m.load_model(model_name="weecology/deepforest-tree", revision="main")
    return m


def detect(date: str, scale: float, window=None, patch=400, overlap=0.15, min_score=0.05, model=None) -> Path:
    src_path = D / f"{date}_rgb30.tif"
    with rasterio.open(src_path) as src:
        win = from_bounds(*window, transform=src.transform) if window else None
        h = int((win.height if win else src.height) * scale)
        w = int((win.width if win else src.width) * scale)
        img = src.read([1, 2, 3], window=win, out_shape=(3, h, w), resampling=Resampling.bilinear)
        tr = src.window_transform(win) if win else src.transform
    tr = tr * tr.scale(1 / scale, 1 / scale)
    rgb = np.moveaxis(img, 0, -1).astype("float32")
    model = model or load_model()
    t = time.time()
    df = model.predict_tile(image=rgb, patch_size=patch, patch_overlap=overlap, iou_threshold=0.2)
    print(f"{date} scale {scale}: {0 if df is None else len(df)} boxes in {time.time() - t:.0f} s", flush=True)
    feats = []
    if df is not None:
        df = df[df.score >= min_score]
        for r in df.itertuples():
            x0, y0 = tr * (r.xmin, r.ymin)
            x1, y1 = tr * (r.xmax, r.ymax)
            feats.append({"type": "Feature",
                          "properties": {"score": round(float(r.score), 3), "cx": round((x0 + x1) / 2, 2),
                                         "cy": round((y0 + y1) / 2, 2),
                                         "width_m": round(float(abs(x1 - x0) + abs(y1 - y0)) / 2, 2)},
                          "geometry": {"type": "Polygon",
                                       "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}})
    tag = f"_{'x'.join(str(v) for v in window)}" if window else ""
    out = D / f"crowns_{date}_s{scale:g}{tag}.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection",
                               "crs": {"type": "name", "properties": {"name": "EPSG:32640"}},
                               "features": feats}))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dates", nargs="+")
    ap.add_argument("--scale", type=float, default=2)
    ap.add_argument("--patch", type=int, default=400)
    ap.add_argument("--window", type=float, nargs=4)
    a = ap.parse_args()
    m = load_model()
    for d in a.dates:
        print(detect(d, a.scale, a.window, a.patch, model=m))
