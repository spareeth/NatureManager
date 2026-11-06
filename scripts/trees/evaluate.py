"""Accuracy of RGB crown detections against the December 2025 NDVI crowns (an independent detector on the
same date, from near-infrared). No GPS points are used.

A detection is correct when an NDVI crown peak lies inside its box (grown by 1 m for registration).
An NDVI crown is found when it lies inside some detection box (grown by 1 m).
NDVI crowns are restricted to tree-sized ones: peak NDVI over 0.4 with at least 6 m2 of vegetation
(NDVI over 0.3) within 2 m, so lawn texture and small shrubs do not count as missed trees.

Usage: scripts/trees/.venv/bin/python scripts/trees/evaluate.py <crowns.geojson> [x0 y0 x1 y1]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage

D = Path(__file__).resolve().parents[2] / "data/trees"


def tree_peaks(window=None):
    with rasterio.open(D / "dec2025_ndvi30.tif") as s:
        ndvi = s.read(1)
        tr = s.transform
    sm = ndimage.gaussian_filter(ndvi, 1.2)
    veg = sm > 0.3
    cover = ndimage.uniform_filter(veg.astype("float32"), size=13) * 169 * 0.09  # m2 within ~2 m
    peaks = (sm == ndimage.maximum_filter(sm, size=9)) & (sm > 0.4) & (cover >= 6)
    rr, cc = np.nonzero(peaks)
    xs, ys = tr * (cc + 0.5, rr + 0.5)
    pts = np.column_stack([xs, ys])
    if window:
        x0, y0, x1, y1 = window
        pts = pts[(pts[:, 0] >= x0) & (pts[:, 0] <= x1) & (pts[:, 1] >= y0) & (pts[:, 1] <= y1)]
    return pts


def evaluate(path: Path, window=None, grow=1.0):
    boxes = []
    for f in json.loads(path.read_text())["features"]:
        c = np.array(f["geometry"]["coordinates"][0])
        boxes.append([c[:, 0].min() - grow, c[:, 1].min() - grow, c[:, 0].max() + grow, c[:, 1].max() + grow])
    boxes = np.array(boxes) if boxes else np.zeros((0, 4))
    pts = tree_peaks(window)
    inside = (pts[:, None, 0] >= boxes[None, :, 0]) & (pts[:, None, 0] <= boxes[None, :, 2]) & \
             (pts[:, None, 1] >= boxes[None, :, 1]) & (pts[:, None, 1] <= boxes[None, :, 3])
    recall = float(inside.any(axis=1).mean()) if len(pts) else 0.0
    precision = float(inside.any(axis=0).mean()) if len(boxes) else 0.0
    return {"detections": int(len(boxes)), "ndvi_tree_crowns": int(len(pts)),
            "found_share": round(recall, 3), "correct_share": round(precision, 3)}


if __name__ == "__main__":
    w = [float(x) for x in sys.argv[2:6]] if len(sys.argv) > 2 else None
    print(json.dumps(evaluate(Path(sys.argv[1]), w), indent=2))
