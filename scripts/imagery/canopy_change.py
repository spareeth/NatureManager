"""Vegetation cover change across the ECD extent, Feb 2025 to Oct 2026 (exploratory).

The two dates are different products: Feb 2025 is NDVI (near-infrared), Oct 2026 is true colour only.
So each date is classified on its own and the vegetation maps are compared, not the index values.

  Feb 2025 vegetation: NDVI > 0.2
  Oct 2026 vegetation: a classifier on the October colours (chromaticity, greenness indices, local
                       texture and context), trained with the February NDVI classes as labels outside
                       Terra Garden. Most of the area did not change, so the model learns how vegetation
                       looks in the October image; pixels vegetated in February that the model is
                       confident are bare in October are the candidate losses. A fixed colour rule found
                       only 13% of the vegetation on the Terra beds and was dropped.
  Both maps: opening 3 x 3 pixels and patches under 4 m2 removed (noise, single pixels)
  Change:   lost   = vegetated in Feb, not vegetated in Oct within 1.8 m (registration tolerance)
            gained = vegetated in Oct, not vegetated in Feb within 1.8 m
  Only change patches of at least 10 m2 (a small tree crown) are counted.

Accuracy is measured on the Terra Garden beds (held out from training; planting in place on both dates):
the share of February vegetation the October model still finds there. Losses are counted only where
the model is confident (probability of vegetation below 0.3 everywhere within the 1.8 m tolerance).

Grid: EPSG:3857 at zoom 18 (0.597 m); real pixel area = (0.597 x cos(latitude))^2.

Usage: scripts/imagery/.venv/bin/python scripts/imagery/canopy_change.py
Writes data/imagery/change/: change_summary.json, lost_patches.geojson, gained_patches.geojson,
change_rgba.tif (for tiling) and a preview PNG.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier

gdal.UseExceptions()
ROOT = Path(__file__).resolve().parents[2]
W = ROOT / "data/imagery"
OUT = W / "change"
NDVI_T = 0.2
MIN_VEG_M2 = 4
MIN_CHANGE_M2 = 10
TOL_M = 1.8
LOSS_P = 0.3  # lost: probability of vegetation below this everywhere within the tolerance


def read(path: Path, bands=(1,)):
    ds = gdal.Open(str(path))
    arrs = [ds.GetRasterBand(b).ReadAsArray() for b in bands]
    return ds.GetGeoTransform(), ds.GetProjection(), arrs


def clean(mask: np.ndarray, min_px: int) -> np.ndarray:
    m = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
    lab, n = ndimage.label(m)
    if n == 0:
        return m
    sizes = ndimage.sum(m, lab, index=np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    return keep[lab]


def patches(mask: np.ndarray, min_px: int):
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, index=np.arange(1, n + 1)) if n else np.array([])
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    return keep[lab], lab * keep[lab], int(keep.sum())


def polygonise(lab: np.ndarray, gt, proj, path: Path, px_m2: float) -> None:
    mem = gdal.GetDriverByName("MEM").Create("", lab.shape[1], lab.shape[0], 1, gdal.GDT_Int32)
    mem.SetGeoTransform(gt)
    mem.SetProjection(proj)
    mem.GetRasterBand(1).WriteArray(lab.astype("int32"))
    srs = osr.SpatialReference(); srs.ImportFromWkt(proj)
    vds = ogr.GetDriverByName("Memory").CreateDataSource("p")
    lyr = vds.CreateLayer("p", srs, ogr.wkbPolygon)
    lyr.CreateField(ogr.FieldDefn("id", ogr.OFTInteger))
    gdal.Polygonize(mem.GetRasterBand(1), mem.GetRasterBand(1), lyr, 0)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326); dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tr = osr.CoordinateTransformation(srs, dst)
    sizes = np.bincount(lab.ravel())
    feats = {}
    for f in lyr:
        i = f.GetField("id")
        g = f.GetGeometryRef().Clone(); g.Transform(tr)
        feats.setdefault(i, ogr.Geometry(ogr.wkbMultiPolygon)).AddGeometry(g)
    out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": i, "area_m2": round(float(sizes[i]) * px_m2, 1)},
         "geometry": json.loads(g.ExportToJson())} for i, g in sorted(feats.items())]}
    path.write_text(json.dumps(out))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gt, proj, (ndvi,) = read(W / "ndvi2025_z18.tif")
    _, _, (r, g, b, a) = read(W / "oct2026_rgb_z18.tif", (1, 2, 3, 4))
    r, g, b = (x.astype("float32") for x in (r, g, b))
    lat = math.degrees(math.atan(math.sinh((gt[3] + gt[5] * ndvi.shape[0] / 2) / 6378137)))
    px_m = gt[1] * math.cos(math.radians(lat))
    px_m2 = px_m * px_m
    valid = (a > 0) & np.isfinite(ndvi) & (ndvi > -1)

    feb = clean(valid & (ndvi > NDVI_T), math.ceil(MIN_VEG_M2 / px_m2))
    # Features from the October image
    bright = r + g + b + 1
    feats = {
        "r": r, "g": g, "b": b, "bright": bright,
        "rc": r / bright, "gc": g / bright,
        "exg": 2 * g - r - b, "gr": g - r, "gb": g - b,
        "vari": np.clip((g - r) / np.where(np.abs(g + r - b) < 1, 1, g + r - b), -2, 2),
    }
    for k, size in (("bright", 5), ("exg", 5), ("gr", 5), ("exg", 15)):
        m = ndimage.uniform_filter(feats[k], size)
        feats[f"{k}_m{size}"] = m
        if size == 5:
            feats[f"{k}_s{size}"] = np.sqrt(np.maximum(ndimage.uniform_filter(feats[k] ** 2, size) - m * m, 0))
    X = np.stack([v.ravel() for v in feats.values()], axis=1).astype("float32")

    # Terra beds: held out for the accuracy check
    beds = ogr.Open(str(ROOT / "data/gis/TG_beds_new.geojson"))
    mem = gdal.GetDriverByName("MEM").Create("", ndvi.shape[1], ndvi.shape[0], 1, gdal.GDT_Byte)
    mem.SetGeoTransform(gt); mem.SetProjection(proj)
    gdal.RasterizeLayer(mem, [1], beds.GetLayer(0), burn_values=[1])
    terra = mem.GetRasterBand(1).ReadAsArray() > 0
    terra_zone = ndimage.binary_dilation(terra, iterations=40)  # beds and their surroundings

    nonveg = valid & (ndvi < 0.1)
    train = (feb | nonveg) & ~terra_zone
    # A random sample keeps the real share of vegetation (about 8%), so the probabilities are not
    # pushed towards vegetation (a balanced sample doubled the October vegetation area).
    rng = np.random.default_rng(42)
    idx = np.flatnonzero(train.ravel())
    pick = rng.choice(idx, min(400000, idx.size), replace=False)
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, random_state=42)
    model.fit(X[pick], feb.ravel()[pick])
    prob = np.zeros(X.shape[0], "float32")
    for i in range(0, X.shape[0], 2_000_000):
        prob[i:i + 2_000_000] = model.predict_proba(X[i:i + 2_000_000])[:, 1]
    prob = prob.reshape(ndvi.shape)
    prob[~valid] = 0
    octv = clean(prob > 0.5, math.ceil(MIN_VEG_M2 / px_m2))

    tol = max(1, round(TOL_M / px_m))
    st = ndimage.generate_binary_structure(2, 1)
    oct_d = ndimage.binary_dilation(octv, st, iterations=tol)
    feb_d = ndimage.binary_dilation(feb, st, iterations=tol)
    prob_near = ndimage.maximum_filter(prob, size=2 * tol + 1)  # most vegetated within the tolerance
    min_ch = math.ceil(MIN_CHANGE_M2 / px_m2)
    lost, lost_lab, n_lost = patches(feb & (prob_near < LOSS_P) & valid, min_ch)
    gained, gained_lab, n_gained = patches((prob > 0.8) & ~feb_d & (ndvi < 0.1) & valid, min_ch)

    # Accuracy on the held-out Terra beds
    ref = feb & terra
    detect = float((ref & oct_d).sum() / max(ref.sum(), 1))
    false_loss = float((ref & (prob_near < LOSS_P)).sum() / max(ref.sum(), 1))
    agree = float(((prob > 0.5) == feb)[valid & terra_zone].mean())

    ha = lambda m: round(float(m.sum()) * px_m2 / 10000, 2)  # noqa: E731
    area_ha = ha(valid)
    summary = {
        "extent_ha": area_ha,
        "pixel_m": round(px_m, 3),
        "feb2025_vegetation_ha": ha(feb),
        "oct2026_vegetation_ha": ha(octv),
        "lost_ha": ha(lost),
        "lost_patches": n_lost,
        "gained_ha": ha(gained),
        "gained_patches": n_gained,
        "terra_check": {"feb_vegetation_found_in_oct": round(detect, 3),
                        "feb_vegetation_called_lost": round(false_loss, 3),
                        "pixel_agreement_terra_area": round(agree, 3)},
        "thresholds": {"ndvi": NDVI_T, "min_vegetation_m2": MIN_VEG_M2, "min_change_m2": MIN_CHANGE_M2,
                       "tolerance_m": TOL_M, "loss_probability_below": LOSS_P},
    }
    # Large patches: the likely tree and planting removals
    sizes = np.bincount(lost_lab.ravel())[1:]
    sizes = sizes[sizes > 0] * px_m2
    summary["lost_patch_sizes_m2"] = {
        "10_to_50": int(((sizes >= 10) & (sizes < 50)).sum()),
        "50_to_200": int(((sizes >= 50) & (sizes < 200)).sum()),
        "200_plus": int((sizes >= 200).sum()),
        "area_ha_in_patches_200_plus": round(float(sizes[sizes >= 200].sum()) / 10000, 2),
    }
    (OUT / "change_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

    polygonise(lost_lab, gt, proj, OUT / "lost_patches.geojson", px_m2)
    polygonise(gained_lab, gt, proj, OUT / "gained_patches.geojson", px_m2)

    # RGBA overlay: lost red, gained blue, stable vegetation light green
    rgba = np.zeros((4, *ndvi.shape), "uint8")
    stable = feb & oct_d
    for m, col in ((stable, (150, 200, 120, 110)), (gained, (40, 110, 220, 220)), (lost, (220, 40, 40, 235))):
        for i in range(4):
            rgba[i][m] = col[i]
    o = gdal.GetDriverByName("GTiff").Create(str(OUT / "change_rgba.tif"), ndvi.shape[1], ndvi.shape[0], 4,
                                             gdal.GDT_Byte, ["COMPRESS=DEFLATE", "TILED=YES"])
    o.SetGeoTransform(gt); o.SetProjection(proj)
    for i in range(4):
        o.GetRasterBand(i + 1).WriteArray(rgba[i])
    o.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    o = None


if __name__ == "__main__":
    main()
